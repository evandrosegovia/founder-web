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
import { enforceRateLimit } from './_lib/rate-limit.js';

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

// ── Constantes de envío (espejo de frontend) ────────────────────
// Estas constantes existen también en founder-checkout.js (CONFIG.FREE_SHIPPING
// y CONFIG.SHIPPING_COST). Si cambian allá, hay que actualizarlas acá.
// Mejor opción a futuro: moverlas a site_settings y leerlas en ambos lados.
const SHIPPING_FREE_THRESHOLD = 2000;  // ≥ este monto → envío gratis
const SHIPPING_COST           = 250;   // costo fijo de envío a domicilio

// ─────────────────────────────────────────────────────────────────
// normalizeFecha
// ─────────────────────────────────────────────────────────────────
// Devuelve un timestamp ISO 8601 válido o null.
// Defensa en profundidad: aunque el frontend ya manda ISO 8601 estándar
// (new Date().toISOString()), si por alguna razón llega un string que
// Postgres no entiende (ej: "12/5/2026, 22:35:14 p. m." con timezone
// inválida "p.") este helper lo neutraliza devolviendo null.
//
// Cuando devolvemos null, la RPC apply_coupon_and_create_order usa
// COALESCE(p_order->>'fecha', now()::text) — la fecha queda con el
// timestamp del server. Nunca rompe el insert.
//
// Histórico: hasta Sesión 30, el frontend mandaba toLocaleString('es-UY')
// que generaba strings con "p. m." sin embargo Postgres parseaba bien.
// Cuando Chrome o Postgres actualizaron, "p." empezó a interpretarse
// como abreviatura de timezone inválida. Fix: ISO 8601 en frontend +
// validación defensiva acá.
function normalizeFecha(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  // Postgres acepta ISO 8601: "2026-05-12T22:35:14.123Z" o variaciones.
  // Validamos con Date.parse y descartamos cualquier otra cosa.
  const ts = Date.parse(str);
  if (Number.isNaN(ts)) return null;
  // Re-serializamos a ISO 8601 puro para garantizar formato canónico.
  return new Date(ts).toISOString();
}

// ─────────────────────────────────────────────────────────────────
// validateItemsAgainstDB
// ─────────────────────────────────────────────────────────────────
// Defensa server-side contra manipulación de precios desde el cliente.
//
// El frontend manda precio_unitario en cada item, pero ese valor viene
// del navegador y un atacante podría manipularlo (DevTools, localStorage,
// fetch directo a la API). Esta función trae el precio REAL desde la DB
// para cada item y lo compara contra lo que mandó el cliente.
//
// Si algún item tiene precio incorrecto → rechazamos todo el pedido.
//
// Reglas de precio:
//   - Si el color tiene estado='oferta' y precio_oferta válido → precio_oferta
//   - En cualquier otro caso → products.precio
//
// Reglas de disponibilidad:
//   - El producto debe existir y estar activo=true
//   - El color debe existir
//   - El color NO debe tener estado='sin_stock'
//
// Devuelve:
//   - { ok: true, prices: Map<key,precio> } si todo cuadra
//   - { ok: false, code, http, msg, detail? } si algo no cuadra
async function validateItemsAgainstDB(items) {
  // Recolectar nombres únicos de productos para una sola query
  const productNames = [...new Set(items.map(it => it.product_name).filter(Boolean))];
  if (productNames.length === 0) {
    return { ok: false, code: 'no_items', http: 400, msg: 'El pedido no tiene items válidos.' };
  }

  // Una sola query: trae los productos + sus colores
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, nombre, precio, activo,
      product_colors ( nombre, estado, precio_oferta )
    `)
    .in('nombre', productNames);

  if (error) {
    return { ok: false, code: 'db_error', http: 500, msg: error.message };
  }
  if (!products || products.length === 0) {
    return { ok: false, code: 'product_not_found', http: 400,
      msg: 'Alguno de los productos del pedido no existe.' };
  }

  // Indexar por nombre para lookup rápido
  const byName = new Map(products.map(p => [p.nombre, p]));

  // Validar cada item
  const prices = new Map(); // key = "<product>|<color>" → precio real
  for (const it of items) {
    const prod = byName.get(it.product_name);
    if (!prod) {
      return { ok: false, code: 'product_not_found', http: 400,
        msg: `Producto no encontrado: "${it.product_name}".` };
    }
    if (!prod.activo) {
      return { ok: false, code: 'product_inactive', http: 400,
        msg: `El producto "${it.product_name}" no está disponible.` };
    }

    const colorRow = (prod.product_colors || []).find(c => c.nombre === it.color);
    if (!colorRow) {
      return { ok: false, code: 'color_not_found', http: 400,
        msg: `Color no encontrado: "${it.color}" para "${it.product_name}".` };
    }
    if (colorRow.estado === 'sin_stock') {
      return { ok: false, code: 'color_sin_stock', http: 400,
        msg: `Sin stock: "${it.product_name}" en color "${it.color}".` };
    }

    // Precio real: oferta si corresponde, sino el base del producto
    const precioReal = (colorRow.estado === 'oferta' && colorRow.precio_oferta)
      ? Number(colorRow.precio_oferta)
      : Number(prod.precio);

    if (!Number.isFinite(precioReal) || precioReal <= 0) {
      return { ok: false, code: 'invalid_db_price', http: 500,
        msg: `Precio inválido en la base para "${it.product_name}".` };
    }

    // Validar que el precio enviado coincide con el real
    if (Number(it.precio_unitario) !== precioReal) {
      return { ok: false, code: 'price_mismatch', http: 400,
        msg: 'Los precios del carrito no son válidos. Recargá la página e intentá nuevamente.',
        detail: {
          product: it.product_name, color: it.color,
          sent: Number(it.precio_unitario), expected: precioReal,
        },
      };
    }

    // Validar cantidad razonable (defensa anti-spam)
    const qty = Number(it.cantidad);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return { ok: false, code: 'invalid_quantity', http: 400,
        msg: `Cantidad inválida para "${it.product_name}".` };
    }

    prices.set(`${it.product_name}|${it.color}`, precioReal);
  }

  return { ok: true, prices };
}

// ─────────────────────────────────────────────────────────────────
// validateOrderTotals
// ─────────────────────────────────────────────────────────────────
// Recalcula subtotal/envío y los compara con lo que envió el cliente.
// El descuento NO se valida acá porque lo aplica la RPC SQL (cupón
// real) o lo verifica el frontend (descuento por transferencia).
//
// Tolerancia: usamos comparación exacta para subtotal (debe ser igual)
// y para envío (solo 2 valores posibles: 0 o SHIPPING_COST).
function validateOrderTotals(cleanOrder, cleanItems) {
  // Recalcular subtotal desde precios reales
  const subtotalReal = cleanItems.reduce((acc, it) => {
    return acc + (Number(it.precio_unitario) * Number(it.cantidad));
  }, 0);

  if (cleanOrder.subtotal !== subtotalReal) {
    return { ok: false, code: 'subtotal_mismatch', http: 400,
      msg: 'El subtotal del pedido no coincide. Recargá la página e intentá nuevamente.',
      detail: { sent: cleanOrder.subtotal, expected: subtotalReal } };
  }

  // Validar envío: si es "Retiro" → debe ser 0. Si es "Envío" → 0 o SHIPPING_COST.
  const entregaLower = (cleanOrder.entrega || '').toLowerCase();
  if (entregaLower === 'retiro') {
    if (cleanOrder.envio !== 0) {
      return { ok: false, code: 'invalid_shipping', http: 400,
        msg: 'El retiro en local tiene envío $0.' };
    }
  } else {
    // Envío a domicilio: solo 0 o SHIPPING_COST son válidos
    if (cleanOrder.envio !== 0 && cleanOrder.envio !== SHIPPING_COST) {
      return { ok: false, code: 'invalid_shipping', http: 400,
        msg: 'Costo de envío inválido.' };
    }
  }

  return { ok: true };
}

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
    fecha:     normalizeFecha(order.fecha),  // ISO 8601 válido o null (RPC usa now())
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
    // Sesión 36: el cupón viene en un parámetro separado (body.cupon),
    // pero el email lo necesita en el objeto order para atribuir el
    // descuento correctamente. Lo agregamos acá para que llegue al
    // template y para que mp-webhook lo persista en `cupon_codigo`.
    cupon_codigo: cupon ? String(cupon).trim().toUpperCase() : null,
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

  // ── Validación crítica de seguridad: precios y disponibilidad ──
  // Verificamos que cada item del pedido tenga el precio real de la DB.
  // Protege contra clientes maliciosos que manipulan el carrito en su
  // navegador para pagar menos de lo que el producto vale.
  // También verifica que productos y colores estén disponibles.
  const priceCheck = await validateItemsAgainstDB(cleanItems);
  if (!priceCheck.ok) {
    // Logueamos detalle solo en server (no se expone al cliente).
    if (priceCheck.detail) {
      console.warn('[checkout] price validation failed:', priceCheck.code, priceCheck.detail);
    }
    return fail(res, priceCheck.http, priceCheck.code, priceCheck.msg);
  }

  // ── Validación de subtotal y envío ─────────────────────────────
  // Después de confirmar los precios unitarios, recalculamos el subtotal
  // y validamos el costo de envío. El total final NO se valida acá
  // porque depende del descuento que aplica la RPC (cupón) — la RPC SQL
  // es la fuente de verdad para el total persistido.
  const totalsCheck = validateOrderTotals(cleanOrder, cleanItems);
  if (!totalsCheck.ok) {
    if (totalsCheck.detail) {
      console.warn('[checkout] totals validation failed:', totalsCheck.code, totalsCheck.detail);
    }
    return fail(res, totalsCheck.http, totalsCheck.code, totalsCheck.msg);
  }

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
// Rate limits (Sesión 31):
//   - validate_coupon: 20 / hora — frena enumeración de cupones
//   - create_order:    10 / hora — frena spam de pedidos falsos
// Aplican por IP del cliente (header x-forwarded-for de Vercel).
export default createHandler(async (req, res) => {
  const body   = parseBody(req);
  const action = String(body.action || '').trim();

  switch (action) {
    case 'validate_coupon':
      if (!(await enforceRateLimit('validate_coupon', req, res))) return;
      return handleValidateCoupon(body, res);
    case 'create_order':
      if (!(await enforceRateLimit('create_order', req, res))) return;
      return handleCreateOrder(body, res, req);
    default:
      return fail(res, 400, 'unknown_action',
                  'action debe ser "validate_coupon" o "create_order"');
  }
});
