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
  };

  const cleanItems = items.map(it => ({
    product_name:    String(it.product_name || it.name || '').trim(),
    color:           String(it.color || '').trim(),
    cantidad:        parseInt(it.cantidad || it.qty, 10) || 1,
    precio_unitario: parseInt(it.precio_unitario || it.price, 10) || 0,
  }));

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

  // ── Meta Conversion API — disparar Purchase con timeout ──────
  // En Vercel Serverless, si la función retorna antes de que el fetch
  // complete, el runtime puede matar el proceso y perdemos el evento.
  // Solución: await con timeout de 3s. Si Meta responde en ≤3s, bien.
  // Si tarda más, igual respondemos al cliente para no demorar el
  // checkout; el pedido ya está creado en Supabase independientemente.
  try {
    const CAPI_TIMEOUT_MS = 3000;
    const capiPromise = sendPurchaseEvent({ order: cleanOrder, items: cleanItems, req });
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve({ ok: false, error: 'timeout' }), CAPI_TIMEOUT_MS)
    );
    const capiResult = await Promise.race([capiPromise, timeoutPromise]);
    console.log('[checkout] CAPI result:', capiResult);
  } catch (err) {
    // No debería caer acá porque sendPurchaseEvent nunca tira, pero por las dudas
    console.error('[checkout] CAPI Purchase falló:', err?.message || err);
  }

  return ok(res, {
    id:     data?.id,
    numero: data?.numero,
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
