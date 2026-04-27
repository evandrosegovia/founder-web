// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/mp-webhook
// ─────────────────────────────────────────────────────────────────
// Endpoint POST que Mercado Pago llama cuando hay un cambio de estado
// en un pago (creado, aprobado, rechazado, etc.).
//
// Flujo:
//   1) Validar firma HMAC-SHA256 del header x-signature → si falla,
//      rechazamos con 401 sin tocar la DB. Defensa contra spoofing.
//   2) Solo procesamos eventos `payment` (otros tipos los ignoramos
//      con 200 OK para que MP no reintente).
//   3) Pedimos los detalles del pago a la API de MP usando el data.id
//      del body. El webhook solo trae el ID, no el estado en sí.
//   4) Cruzamos con orders por external_reference (= orders.numero)
//      o, como fallback, por el query param ?numero=XXX que pusimos
//      al crear la preference.
//   5) Mapeamos el status de MP a nuestro estado interno y hacemos
//      UPDATE en orders. Solo escribimos columnas mp_* + estado.
//   6) Respondemos 200 OK siempre que el procesamiento haya sido
//      "exitoso" desde el punto de vista de MP — incluso si no
//      encontramos el pedido (porque sino MP reintenta hasta 4 días).
//
// Por qué este endpoint NO requiere auth:
//   - La validación de firma HMAC YA es la auth. Solo MP conoce el
//     MP_WEBHOOK_SECRET, así que solo MP puede generar firmas válidas.
//   - Sin firma válida → 401 inmediato.
//
// Mapa de estados MP → estado FOUNDER:
//   approved   → 'Pendiente confirmación' (pago OK, falta despachar)
//   pending    → 'Pendiente pago'         (cliente eligió Abitab/Redpagos
//                                          o tarjeta en revisión)
//   in_process → 'Pendiente pago'         (MP revisa antifraude)
//   rejected   → 'Pago rechazado'         (tarjeta rechazada)
//   cancelled  → 'Cancelado'              (cancelado por el comprador o expiró)
//   refunded   → 'Cancelado'              (devolución total — admin maneja luego)
//   charged_back → 'Cancelado'            (contracargo)
// ═════════════════════════════════════════════════════════════════

import { supabase, json, fail, parseBody } from './_lib/supabase.js';
import { getPayment, verifyWebhookSignature } from './_lib/mercadopago.js';
import { sendPurchaseEvent } from './_lib/meta-capi.js';

// ── Mapa MP status → estado de FOUNDER ────────────────────────────
// 'approved' es el caso feliz: el pago se acreditó. Lo dejamos en
// "Pendiente confirmación" porque el admin todavía tiene que validar
// el pedido (chequear stock, preparar envío). El estado avanza a
// "Confirmado" cuando el admin lo marca manualmente desde el panel.
const STATUS_MAP = {
  approved:     'Pendiente confirmación',
  pending:      'Pendiente pago',
  in_process:   'Pendiente pago',
  authorized:   'Pendiente confirmación',
  rejected:     'Pago rechazado',
  cancelled:    'Cancelado',
  refunded:     'Cancelado',
  charged_back: 'Cancelado',
};

// ─────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// No usamos createHandler() porque queremos control fino sobre el
// método (POST/GET — MP a veces manda HEAD para test) y sobre cómo
// respondemos los errores (a MP le devolvemos 200 incluso en muchos
// casos de "no procesado", para evitar reintentos innecesarios).
// ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS preflight (defensivo — MP no usa CORS pero no estorba)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-signature, x-request-id');
    res.status(204).end();
    return;
  }

  // GET — respuesta amigable para tests manuales y health checks
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'mp-webhook', method: 'POST' });
  }

  if (req.method !== 'POST') {
    return fail(res, 405, 'method_not_allowed');
  }

  if (!supabase) {
    console.error('[mp-webhook] Supabase no configurado');
    return fail(res, 500, 'server_misconfigured');
  }

  try {
    await processWebhook(req, res);
  } catch (err) {
    // Si caemos acá hubo un error inesperado. Logueamos y devolvemos
    // 200 para que MP no reintente. Nuestra obligación es loguear lo
    // suficiente para investigar después.
    console.error('[mp-webhook] Error inesperado:', err?.message || err);
    return json(res, 200, { ok: false, error: 'internal_error_swallowed' });
  }
}

// ─────────────────────────────────────────────────────────────────
// LÓGICA PRINCIPAL
// ─────────────────────────────────────────────────────────────────
async function processWebhook(req, res) {
  const body = parseBody(req);

  // Log del cuerpo del webhook — útil para debugging en Vercel logs.
  // No imprime PII porque el body de MP solo trae { type, data: { id }, ... }.
  console.log('[mp-webhook] recibido',
    { type: body.type || body.action, data_id: body?.data?.id, query: req.query });

  // ── 1. Filtrar tipos de evento ─────────────────────────────────
  // MP manda varios tipos: payment, plan, subscription, invoice, etc.
  // Solo procesamos pagos. Los demás los confirmamos con 200 OK para
  // que MP no reintente.
  const eventType = String(body.type || body.topic || '').toLowerCase();
  if (eventType && eventType !== 'payment') {
    console.log('[mp-webhook] tipo ignorado:', eventType);
    return json(res, 200, { ok: true, ignored: true, reason: 'not_a_payment' });
  }

  // ── 2. Extraer payment ID del body ─────────────────────────────
  // Forma estándar: { type: 'payment', data: { id: '12345...' } }
  // Forma legacy IPN: ?topic=payment&id=12345 (query params)
  const paymentId =
       body?.data?.id
    || body?.id
    || req.query?.id
    || req.query?.['data.id'];

  if (!paymentId) {
    console.warn('[mp-webhook] sin payment ID');
    return json(res, 200, { ok: false, error: 'no_payment_id' });
  }

  // ── 3. Validar firma HMAC ──────────────────────────────────────
  // Solo MP conoce el MP_WEBHOOK_SECRET, así que esto es nuestra auth.
  const isValidSignature = verifyWebhookSignature(req.headers, paymentId);
  if (!isValidSignature) {
    console.warn('[mp-webhook] firma inválida — rechazando', { payment_id: paymentId });
    // 401 acá hace que MP marque el webhook como "fallido" y reintente.
    // Eso es bueno: si era una firma legítima que falló por algún
    // motivo transitorio, el reintento la pasa.
    return fail(res, 401, 'invalid_signature');
  }

  // ── 4. Obtener detalles del pago desde la API de MP ────────────
  const { ok: gotPayment, payment, error: paymentErr } = await getPayment(paymentId);
  if (!gotPayment || !payment) {
    console.error('[mp-webhook] no se pudo obtener el pago de MP:', paymentErr);
    // 200 + ignored: si MP nos manda un payment ID que no existe en
    // su propia API (caso raro), no tiene sentido reintentar.
    return json(res, 200, { ok: false, error: 'payment_not_found_in_mp' });
  }

  // ── 5. Encontrar el pedido en Supabase ─────────────────────────
  // Estrategia: por external_reference primero (es lo correcto), por
  // ?numero query param como fallback (defensa contra rarezas de MP).
  const externalRef = String(payment.external_reference || '').trim();
  const queryNumero = String(req.query?.numero || '').trim();
  const numero      = externalRef || queryNumero;

  if (!numero) {
    console.warn('[mp-webhook] pago sin external_reference ni ?numero',
      { payment_id: paymentId, mp_status: payment.status });
    return json(res, 200, { ok: false, error: 'no_order_reference' });
  }

  const { data: order, error: lookupErr } = await supabase
    .from('orders')
    .select(`
      id, numero, estado, mp_payment_id, mp_payment_status,
      nombre, apellido, celular, email, total,
      order_items ( product_name, color, cantidad, precio_unitario )
    `)
    .ilike('numero', numero)
    .maybeSingle();

  if (lookupErr) {
    console.error('[mp-webhook] error buscando pedido:', lookupErr.message);
    // 500 acá: queremos que MP reintente porque puede ser un blip de DB.
    return fail(res, 500, 'db_lookup_error');
  }

  if (!order) {
    console.warn('[mp-webhook] pedido no encontrado en Supabase',
      { numero, payment_id: paymentId });
    // 200: no tiene sentido reintentar. El pedido nunca se creó (caso
    // raro: cliente abrió MP fuera de nuestro flujo o pedido ya borrado).
    return json(res, 200, { ok: false, error: 'order_not_found' });
  }

  // ── 6. Mapear status de MP a estado interno ────────────────────
  const mpStatus     = String(payment.status || '').toLowerCase();
  const newEstado    = STATUS_MAP[mpStatus] || null;

  if (!newEstado) {
    console.warn('[mp-webhook] status MP desconocido:', mpStatus,
      { numero, payment_id: paymentId });
    return json(res, 200, { ok: false, error: 'unknown_mp_status', mp_status: mpStatus });
  }

  // ── 7. Idempotencia: si el estado ya está aplicado, no hacer nada ──
  // MP puede reintentar el mismo webhook varias veces. El UPDATE igual
  // sería seguro (mismo valor) pero loguear y skipear es más limpio.
  if (order.mp_payment_id === String(paymentId) &&
      order.mp_payment_status === mpStatus &&
      order.estado === newEstado) {
    console.log('[mp-webhook] estado ya aplicado, skip',
      { numero, payment_id: paymentId, estado: newEstado });
    return json(res, 200, { ok: true, idempotent: true });
  }

  // ── 8. Reglas defensivas: NO sobrescribir estados manuales ─────
  // Si el admin ya movió el pedido a un estado posterior (En preparación,
  // En camino, Entregado), NO lo bajamos por un webhook tardío de MP.
  // Solo permitimos sobrescribir desde estados "automáticos" o iniciales.
  const ESTADOS_AUTOMATICOS = new Set([
    'Pendiente pago',
    'Pendiente confirmación',
    'Pago rechazado',
  ]);

  let estadoFinal = newEstado;
  if (!ESTADOS_AUTOMATICOS.has(order.estado)) {
    // El admin ya tocó manualmente este pedido. No tocamos `estado`,
    // pero SÍ actualizamos las columnas mp_* (info útil de auditoría).
    console.log('[mp-webhook] pedido en estado manual, mp_* actualizadas pero estado preservado',
      { numero, current_estado: order.estado, mp_status: mpStatus });
    estadoFinal = order.estado; // mantener el actual
  }

  // ── 9. UPDATE en Supabase ──────────────────────────────────────
  const updatePayload = {
    mp_payment_id:     String(paymentId),
    mp_payment_status: mpStatus,
    mp_preference_id:  payment.metadata?.preference_id || payment.preference_id || undefined,
    estado:            estadoFinal,
  };
  // Limpieza: no mandar undefined a Supabase
  Object.keys(updatePayload).forEach(k => {
    if (updatePayload[k] === undefined) delete updatePayload[k];
  });

  const { error: updateErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id);

  if (updateErr) {
    console.error('[mp-webhook] error actualizando pedido:', updateErr.message,
      { numero, payment_id: paymentId });
    // 500 → MP reintenta. Si fue un blip de DB, el reintento pasa.
    return fail(res, 500, 'db_update_error');
  }

  console.log('[mp-webhook] pedido actualizado OK',
    { numero, payment_id: paymentId, mp_status: mpStatus, new_estado: estadoFinal });

  // ── 10. Meta CAPI Purchase — solo cuando MP aprueba por primera vez ──
  // Disparamos Purchase a Meta SOLO la primera vez que MP confirma el
  // pago. La detección "primera vez" es: este UPDATE pasó de un estado
  // sin mp_payment_id (o con uno diferente) a tener payment_id ahora,
  // y el status es 'approved'/'authorized'.
  // Meta deduplica con event_id = numero, así que aunque disparemos
  // por error 2 veces no contaría como 2 compras — pero reducirlo es
  // limpio para los logs.
  const yaSeDisparoCAPI = order.mp_payment_id === String(paymentId)
                       && order.mp_payment_status === mpStatus;
  const esAprobacion    = mpStatus === 'approved' || mpStatus === 'authorized';

  if (esAprobacion && !yaSeDisparoCAPI) {
    try {
      const CAPI_TIMEOUT_MS = 3000;
      const orderForCapi = {
        numero:   order.numero,
        email:    order.email,
        celular:  order.celular,
        nombre:   order.nombre,
        apellido: order.apellido,
        total:    order.total,
      };
      const itemsForCapi = Array.isArray(order.order_items) ? order.order_items : [];
      const capiPromise = sendPurchaseEvent({
        order: orderForCapi,
        items: itemsForCapi,
        req,
      });
      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve({ ok: false, error: 'timeout' }), CAPI_TIMEOUT_MS)
      );
      const capiResult = await Promise.race([capiPromise, timeoutPromise]);
      console.log('[mp-webhook] CAPI Purchase result:', capiResult);
    } catch (err) {
      console.error('[mp-webhook] CAPI Purchase falló:', err?.message || err);
    }
  }

  return json(res, 200, {
    ok:        true,
    numero,
    mp_status: mpStatus,
    estado:    estadoFinal,
  });
}
