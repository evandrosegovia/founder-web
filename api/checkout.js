// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/checkout
// ─────────────────────────────────────────────────────────────────
// Endpoint POST del flujo de compra.
// Dos acciones posibles, según body.action:
//
//  1) action = "validate_coupon"
//       Body: { action, codigo, email, subtotal }
//       Valida un cupón SIN registrarlo. Devuelve metadata del cupón
//       para que el checkout calcule el descuento a mostrar.
//
//  2) action = "create_order"
//       Body: { action, order, items, cupon }
//       Crea el pedido + items + (si hay) registra el uso del cupón
//       en UNA SOLA transacción atómica (vía RPC
//       apply_coupon_and_create_order en Supabase).
//
// Razones de diseño:
//   - Un solo endpoint en vez de dos archivos: menos ruido en /api.
//   - "validate_coupon" es read-only y no muta la DB (seguro para
//     llamarlo múltiples veces mientras el usuario prueba códigos).
//   - "create_order" centraliza TODA la lógica crítica server-side,
//     evitando que el cliente pueda hacer trampa con precios o usos.
// ═════════════════════════════════════════════════════════════════

import { supabase, createHandler, ok, fail, parseBody } from './_lib/supabase.js';
import { sendPurchaseEvent } from './_lib/meta-capi.js';
import { createPreference } from './_lib/mercadopago.js';
import { sendOrderConfirmationTransfer } from './_lib/email.js';

// ── Mapa de errores SQL → código HTTP + mensaje amigable ──────
// La función SQL lanza excepciones con mensajes específicos; acá
// los traducimos a respuestas que el frontend puede mostrar.
const COUPON_ERROR_MAP = {
  cupon_not_found:            { http: 404, msg: 'Código no válido' },
  cupon_inactive:             { http: 400, msg: 'Este código ya no está disponible' },
  cupon_not_yet_valid:        { http: 400, msg: 'Este código todavía no está disponible' },
  cupon_expired:              { http: 400, msg: 'Este código ha expirado' },
  cupon_already_used:         { http: 400, msg: 'Este código ya fue utilizado' },
  cupon_already_used_by_email:{ http: 400, msg: 'Ya usaste este código anteriormente' },
  cupon_min_purchase:         { http: 400, msg: 'No alcanzás el mínimo de compra del cupón' },
  email_required:             { http: 400, msg: 'El email es obligatorio' },
};

// ═════════════════════════════════════════════════════════════════
// ACCIÓN 1: validate_coupon — solo lectura, sin tocar la DB
// ═════════════════════════════════════════════════════════════════
async function handleValidateCoupon(body, res) {
  const codigoRaw = String(body.codigo || '').trim().toUpperCase();
  const email     = String(body.email || '').trim().toLowerCase();
  const subtotal  = parseInt(body.subtotal, 10) || 0;

  if (!codigoRaw) return fail(res, 400, 'codigo_required');

  const { data, error } = await supabase
    .from('coupons')
    .select('codigo, tipo, valor, uso, min_compra, activo, usos_count, emails_usados, desde, hasta')
    .eq('codigo', codigoRaw)
    .maybeSingle();

  if (error) return fail(res, 500, 'db_error', error.message);
  if (!data)  return fail(res, 404, 'cupon_not_found', 'Código no válido');
  if (!data.activo) return fail(res, 400, 'cupon_inactive', 'Este código ya no está disponible');

  // Validar vigencia (si tiene fechas en formato YYYY-MM-DD)
  const hoyStr = new Date().toISOString().slice(0, 10);
  if (data.desde && hoyStr < data.desde) {
    return fail(res, 400, 'cupon_not_yet_valid', 'Este código todavía no está disponible');
  }
  if (data.hasta && hoyStr > data.hasta) {
    return fail(res, 400, 'cupon_expired', 'Este código ha expirado');
  }

  // Validar uso
  if (data.uso === 'unico' && data.usos_count >= 1) {
    return fail(res, 400, 'cupon_already_used', 'Este código ya fue utilizado');
  }
  if (data.uso === 'por-email') {
    if (!email) return fail(res, 400, 'email_required', 'Ingresá tu email antes de aplicar el cupón');
    const used = Array.isArray(data.emails_usados) ? data.emails_usados : [];
    if (used.includes(email)) {
      return fail(res, 400, 'cupon_already_used_by_email', 'Ya usaste este código anteriormente');
    }
  }

  // Validar mínimo de compra
  if (data.min_compra && data.min_compra > 0 && subtotal < data.min_compra) {
    return fail(res, 400, 'cupon_min_purchase',
      `Compra mínima requerida: $${Number(data.min_compra).toLocaleString('es-UY')} UYU`);
  }

  // OK — devolver metadata normalizada al frontend (mismo shape que usaba la versión Sheet)
  return ok(res, {
    cupon: {
      codigo:     data.codigo,
      tipo:       data.tipo,              // 'fijo' | 'porcentaje'
      valor:      Number(data.valor) || 0,
      uso:        data.uso,               // 'multiuso' | 'unico' | 'por-email'
      minCompra:  Number(data.min_compra) || 0,
    },
  });
}

// ═════════════════════════════════════════════════════════════════
// ACCIÓN 2: create_order — transacción atómica vía RPC
// ═════════════════════════════════════════════════════════════════
async function handleCreateOrder(body, res, req) {
  const order = body.order;
  const items = body.items;
  const cupon = body.cupon || null; // string | null

  // Validaciones básicas de forma
  if (!order || typeof order !== 'object') return fail(res, 400, 'order_required');
  if (!Array.isArray(items) || items.length === 0) return fail(res, 400, 'items_required');
  if (!order.numero) return fail(res, 400, 'numero_required');
  if (!order.email)  return fail(res, 400, 'email_required');

  // Sesión 28 Bloque B: si el pedido contiene items con personalización,
  // el cliente DEBE haber aceptado el aviso de no-devolución.
  // Esta validación es defensiva — el frontend ya bloquea, pero protegemos
  // contra clientes maliciosos que pegan al endpoint directo.
  const hayPersonalizacion = items.some(it => it && it.personalizacion);
  if (hayPersonalizacion && order.acepto_no_devolucion !== true) {
    return fail(res, 400, 'no_devolucion_required',
      'Para items con grabado láser, debés aceptar el aviso de no-devolución.');
  }

  // Sanitización: los campos tipo string se trimean; los numéricos se castean.
  const cleanOrder = {
    numero:    String(order.numero).trim(),
    fecha:     order.fecha || null,  // la RPC usa now() si viene null/inválido
    nombre:    String(order.nombre    || '').trim(),
    apellido:  String(order.apellido  || '').trim(),
    celular:   String(order.celular   || '').trim(),
    email:     String(order.email     || '').trim().toLowerCase(),
    entrega:   String(order.entrega   || '').trim(),
    direccion: String(order.direccion || '').trim(),
    productos: String(order.productos || '').trim(),
    subtotal:  parseInt(order.subtotal,  10) || 0,
    descuento: parseInt(order.descuento, 10) || 0,
    envio:     parseInt(order.envio,     10) || 0,
    total:     parseInt(order.total,     10) || 0,
    pago:      String(order.pago   || '').trim(),
    estado:    String(order.estado || 'Pendiente confirmación').trim(),
    notas:     String(order.notas  || '').trim(),
    // Sesión 28 Bloque B
    personalizacion_extra: parseInt(order.personalizacion_extra, 10) || 0,
    acepto_no_devolucion:  order.acepto_no_devolucion === true,
  };

  // Sanitización de items + extracción/limpieza de personalización.
  const cleanItems = items.map(it => {
    const base = {
      product_name:    String(it.product_name || it.name || '').trim(),
      color:           String(it.color || '').trim(),
      cantidad:        parseInt(it.cantidad || it.qty, 10) || 1,
      precio_unitario: parseInt(it.precio_unitario || it.price, 10) || 0,
    };

    // Si trae personalización válida, la pasamos a la SQL.
    // Solo conservamos los campos esperados — defensa contra payloads inflados.
    if (it.personalizacion && typeof it.personalizacion === 'object') {
      const p = it.personalizacion;
      const sanitized = {
        extra: parseInt(p.extra, 10) || 0,
      };
      // Campos de imagen: solo aceptar si traen un path string válido.
      ['adelante', 'interior', 'atras'].forEach(slot => {
        if (p[slot] && typeof p[slot] === 'object' && typeof p[slot].path === 'string') {
          sanitized[slot] = {
            path:     String(p[slot].path).slice(0, 300),
            filename: String(p[slot].filename || '').slice(0, 200),
          };
        } else {
          sanitized[slot] = null;
        }
      });
      // Texto e indicaciones: limites de longitud
      sanitized.texto        = String(p.texto || '').slice(0, 200);
      sanitized.indicaciones = String(p.indicaciones || '').slice(0, 500);

      // Solo adjuntar si hay algo significativo (todos los slots null y
      // texto/indicaciones vacíos → no lo pasamos para que en DB quede NULL).
      const hayContenido =
        sanitized.adelante || sanitized.interior || sanitized.atras ||
        sanitized.texto || sanitized.indicaciones;
      if (hayContenido) {
        base.personalizacion = sanitized;
      }
    }

    return base;
  });

  // Llamar a la RPC atómica
  const { data, error } = await supabase.rpc('apply_coupon_and_create_order', {
    p_order: cleanOrder,
    p_items: cleanItems,
    p_cupon: cupon ? String(cupon).trim() : null,
  });

  if (error) {
    // Mapear errores de cupón de la función SQL a respuestas amigables
    const rawMsg = (error.message || '').toLowerCase();
    for (const [code, info] of Object.entries(COUPON_ERROR_MAP)) {
      if (rawMsg.includes(code)) {
        return fail(res, info.http, code, info.msg);
      }
    }
    // Otros errores (constraint de numero único, etc.)
    if (rawMsg.includes('duplicate key') && rawMsg.includes('numero')) {
      return fail(res, 409, 'numero_duplicate', 'Ya existe un pedido con ese número. Reintentá.');
    }
    return fail(res, 500, 'db_error', error.message);
  }

  // ── Bifurcar según método de pago ─────────────────────────────
  // Para Mercado Pago: creamos la preference y devolvemos init_point.
  // El evento Purchase de Meta lo dispara el webhook cuando MP aprueba
  // (no acá, porque la compra todavía no es real).
  //
  // Para Transferencia: el pedido ya es definitivo desde el punto de
  // vista del cliente (paga después), así que disparamos Purchase ahora.
  const esMercadoPago = cleanOrder.pago === 'Mercado Pago';

  if (esMercadoPago) {
    // ── Mercado Pago: crear preference y devolver init_point ─────
    const mpResult = await createPreference({
      order:          cleanOrder,
      items:          cleanItems,
      shipping:       cleanOrder.envio,
      discountAmount: cleanOrder.descuento,
    });

    if (!mpResult.ok) {
      // El pedido YA está creado en Supabase con estado 'Pendiente pago'
      // y mp_preference_id = NULL. Lo dejamos así — el admin lo verá
      // como pedido raro y puede eliminarlo. Devolvemos error al
      // frontend para que muestre mensaje claro al cliente.
      console.error('[checkout] MP createPreference falló:',
        mpResult.error, mpResult.detail || '',
        { numero: cleanOrder.numero });
      return fail(res, 502, 'mp_error',
        'No pudimos iniciar el pago en Mercado Pago. Intentá de nuevo o elegí transferencia.');
    }

    // Guardar el preference_id en la orden para poder cruzarlo después
    // (auditoría + fallback de búsqueda en el webhook).
    const { error: updErr } = await supabase
      .from('orders')
      .update({ mp_preference_id: mpResult.preference_id })
      .eq('id', data?.id);
    if (updErr) {
      // No crítico — el webhook usa external_reference como ancla
      // primaria. Solo logueamos.
      console.warn('[checkout] no se pudo guardar mp_preference_id:', updErr.message);
    }

    return ok(res, {
      id:            data?.id,
      numero:        data?.numero,
      pago:          'Mercado Pago',
      init_point:    mpResult.init_point,
      preference_id: mpResult.preference_id,
    });
  }

  // ── Transferencia: disparar Meta CAPI + email en paralelo ──────
  // Ambos son fire-and-forget desde el punto de vista del cliente:
  // si tardan o fallan, igual respondemos OK y el pedido ya está en
  // Supabase. Los hacemos en paralelo (Promise.all) para no sumar
  // latencias. Cada uno tiene su propio timeout interno.
  const FIRE_AND_FORGET_TIMEOUT = 3500; // ms
  const withTimeout = (promise, label) => Promise.race([
    promise,
    new Promise(resolve =>
      setTimeout(() => resolve({ ok: false, error: 'timeout', label }), FIRE_AND_FORGET_TIMEOUT)
    ),
  ]);

  try {
    const [capiResult, emailResult] = await Promise.all([
      withTimeout(sendPurchaseEvent({ order: cleanOrder, items: cleanItems, req }), 'capi'),
      withTimeout(sendOrderConfirmationTransfer(cleanOrder, cleanItems),            'email'),
    ]);
    console.log('[checkout] CAPI result:',  capiResult);
    console.log('[checkout] email result:', emailResult);
  } catch (err) {
    // Ninguna de las dos funciones tira excepciones, pero por las dudas.
    console.error('[checkout] fire-and-forget falló:', err?.message || err);
  }

  return ok(res, {
    id:     data?.id,
    numero: data?.numero,
    pago:   'Transferencia',
  });
}

// ═════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL — router por action
// ═════════════════════════════════════════════════════════════════
export default createHandler(async (req, res) => {
  const body   = parseBody(req);
  const action = String(body.action || '').trim();

  switch (action) {
    case 'validate_coupon': return handleValidateCoupon(body, res);
    case 'create_order':    return handleCreateOrder(body, res, req);
    default:                return fail(res, 400, 'unknown_action',
                                        'action debe ser "validate_coupon" o "create_order"');
  }
});
