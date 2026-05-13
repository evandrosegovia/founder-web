// ═════════════════════════════════════════════════════════════════
// FOUNDER — api/_lib/mercadopago.js
// ─────────────────────────────────────────────────────────────────
// Wrapper liviano para Mercado Pago Checkout Pro (Uruguay).
// No usa el SDK oficial — habla directo a la API REST con fetch,
// mismo patrón que api/_lib/meta-capi.js. Razones:
//   • Cero dependencias nuevas (no agregamos paquetes a package.json).
//   • Cold-start más rápido en Vercel Serverless.
//   • Control total de timeouts y errores.
//
// Funciones públicas:
//   1) createPreference(params)
//        Crea una "preference" en MP. Devuelve init_point (URL de
//        pago) y preference_id. Lo usa /api/checkout cuando el
//        cliente eligió "Mercado Pago".
//
//   2) getPayment(paymentId)
//        Lee un pago por ID desde la API de MP. Lo usa el webhook
//        para enterarse del estado real cuando MP avisa de un cambio.
//
//   3) verifyWebhookSignature(headers, dataId)
//        Valida la firma HMAC-SHA256 del header x-signature que
//        manda MP en cada webhook. Sin esta validación, cualquiera
//        podría falsificar webhooks y marcar pedidos como pagados.
//
// Variables de entorno requeridas:
//   • MP_ACCESS_TOKEN    — token privado del backend (TEST-... o APP_USR-...)
//   • MP_WEBHOOK_SECRET  — clave secreta del webhook configurado en MP
//   • MP_PUBLIC_KEY      — opcional acá; el frontend la usa directo
//
// Si falta MP_ACCESS_TOKEN al crear preference, retorna early con
// error claro pero NO tira excepción — el caller decide qué hacer.
// ═════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'crypto';

// ── CONFIG ───────────────────────────────────────────────────────
const MP_API_BASE = 'https://api.mercadopago.com';
const CURRENCY    = 'UYU';

// Timeout de la llamada a MP — si MP tarda más, abortamos para no
// dejar al cliente esperando. Vercel mata la función a los 15s
// (vercel.json), así que dejamos un buen margen.
const MP_TIMEOUT_MS = 8000;

// Site URL — adónde MP redirige al cliente al terminar el pago.
// Usamos siempre www.founder.uy (dominio principal), independiente
// del entorno. En sandbox MP igual funciona contra esta URL.
const SITE_URL = 'https://www.founder.uy';

// ── HELPERS ──────────────────────────────────────────────────────

/**
 * Wrapper de fetch con timeout. Si MP no responde en MP_TIMEOUT_MS,
 * abortamos. Devuelve { ok, status, data, error } — nunca tira.
 */
async function mpFetch(path, { method = 'GET', body = null, idempotencyKey = null } = {}) {
  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return { ok: false, status: 0, error: 'missing_access_token', data: null };
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), MP_TIMEOUT_MS);

  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
  };
  // Idempotency key — si reintentamos un POST por error de red, MP
  // no duplica la operación. Solo aplica a POST.
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = String(idempotencyKey);
  }

  try {
    const response = await fetch(`${MP_API_BASE}${path}`, {
      method,
      headers,
      body:   body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data = null;
    try { data = await response.json(); } catch { /* sin body */ }

    return {
      ok:     response.ok,
      status: response.status,
      data:   data || {},
      error:  response.ok ? null : `mp_http_${response.status}`,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err?.name === 'AbortError';
    return {
      ok:     false,
      status: 0,
      data:   null,
      error:  isAbort ? 'mp_timeout' : 'mp_network_error',
    };
  }
}

// ── API PÚBLICA ──────────────────────────────────────────────────

/**
 * Crea una preference en Mercado Pago Checkout Pro.
 *
 * @param {Object} params
 * @param {Object} params.order  — el pedido limpio (numero, email, total, nombre, apellido, celular)
 * @param {Array}  params.items  — items del pedido (product_name, color, cantidad, precio_unitario)
 * @param {number} params.shipping       — costo de envío (UYU, entero)
 * @param {number} params.discountAmount — descuento total aplicado (UYU, entero)
 * @returns {Promise<{ok:boolean, error?:string, init_point?:string, preference_id?:string}>}
 *
 * Notas de diseño:
 * - Mandamos cada item con su precio real (no agregamos el envío
 *   como item porque MP lo maneja con `shipments.cost`).
 * - El descuento se aplica como ajuste en el primer item para que el
 *   total que ve el cliente en MP coincida exacto con el total local.
 * - external_reference = order.numero → es nuestra ancla. Aparece en
 *   el webhook y en los back_urls, así podemos cruzar el pago con el
 *   pedido en Supabase.
 * - notification_url incluye el numero como query param, defensiva
 *   ante webhooks sin external_reference (raros pero existen).
 * - Si está configurado el Pixel de Meta, lo asociamos a la preference
 *   para que MP también dispare conversiones a Facebook (no reemplaza
 *   nuestro CAPI propio, es complementario).
 */
export async function createPreference({ order, items, shipping, discountAmount }) {
  // ── 1. Validar input mínimo ────────────────────────────────────
  if (!order || !order.numero || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'invalid_items' };
  }

  const itemsTotal = items.reduce((s, i) =>
    s + (Number(i.precio_unitario) || 0) * (Number(i.cantidad) || 0), 0);
  const expectedTotal = itemsTotal - (Number(discountAmount) || 0) + (Number(shipping) || 0);

  // ── 2. Armar items para MP ─────────────────────────────────────
  // MP espera unit_price como número (entero o decimal). UYU se acepta
  // como entero (no usamos centavos).
  // Si hay descuento global, lo distribuimos restando del primer item
  // (más limpio que agregar un item negativo, MP rechaza unit_price < 0).
  const mpItems = items.map((it, idx) => {
    const baseUnit = Number(it.precio_unitario) || 0;
    let unitPrice = baseUnit;

    // Aplicar descuento al primer item (proporcional al subtotal de ese item)
    if (idx === 0 && Number(discountAmount) > 0 && itemsTotal > 0) {
      const itemSubtotal  = baseUnit * (Number(it.cantidad) || 1);
      const itemQty       = Number(it.cantidad) || 1;
      // Descuento total (puede ser mayor al subtotal del primer item si el
      // cupón es muy grande — en ese caso lo capamos al subtotal del item
      // y el resto se ignora; muy poco probable en la práctica).
      const discountForItem = Math.min(Number(discountAmount), itemSubtotal - itemQty);
      // Descontamos por unidad (redondeo hacia abajo para no excedernos)
      unitPrice = Math.max(1, baseUnit - Math.floor(discountForItem / itemQty));
    }

    return {
      id:          String(it.product_name || `item-${idx}`).slice(0, 64),
      title:       `Founder ${it.product_name || ''} (${it.color || ''})`.trim().slice(0, 256),
      description: `Billetera Founder ${it.color || ''}`.slice(0, 256),
      quantity:    Number(it.cantidad) || 1,
      unit_price:  Number(unitPrice),
      currency_id: CURRENCY,
    };
  });

  // ── 3. Armar payer (datos del comprador) ───────────────────────
  // MP usa estos datos para autofill del formulario. No son obligatorios
  // pero mejoran conversión. El email es el más importante.
  const payer = {
    email: String(order.email).trim().toLowerCase(),
    ...(order.nombre   ? { name:    String(order.nombre).trim().slice(0, 64) }    : {}),
    ...(order.apellido ? { surname: String(order.apellido).trim().slice(0, 64) }  : {}),
  };
  // Teléfono: MP espera area_code + number. Para Uruguay (+598) lo
  // mandamos solo si pudimos extraerlo; si no, omitimos el campo (MP
  // funciona sin teléfono).
  if (order.celular) {
    const digits = String(order.celular).replace(/\D/g, '');
    if (digits.length >= 7) {
      payer.phone = {
        area_code: '598',
        number:    digits.replace(/^598/, ''), // sacar prefijo país si vino incluido
      };
    }
  }

  // ── 4. Armar body de la preference ─────────────────────────────
  const body = {
    items: mpItems,
    payer,
    external_reference: String(order.numero), // ← ancla con orders.numero

    // URLs de retorno: a dónde vuelve el cliente cuando termina en MP.
    // Los 3 estados redirigen al checkout.html con un query param que
    // el frontend usa para mostrar la pantalla correcta.
    back_urls: {
      success: `${SITE_URL}/checkout.html?mp=success&numero=${encodeURIComponent(order.numero)}`,
      pending: `${SITE_URL}/checkout.html?mp=pending&numero=${encodeURIComponent(order.numero)}`,
      failure: `${SITE_URL}/checkout.html?mp=failure&numero=${encodeURIComponent(order.numero)}`,
    },
    // auto_return = approved → si el pago se aprueba al toque (tarjeta),
    // MP redirige solo sin que el cliente tenga que clickear "Volver al sitio".
    // Para failure/pending el cliente hace click manualmente (es lo correcto:
    // ahí queremos que vea el mensaje de MP antes de volver).
    auto_return: 'approved',

    // Webhook: a dónde MP nos avisa de cambios de estado del pago.
    // Incluimos numero como query string como defensa por si el body
    // viene sin external_reference (caso raro pero documentado).
    notification_url: `${SITE_URL}/api/mp-webhook?numero=${encodeURIComponent(order.numero)}`,

    // Costo de envío visible en MP (separado del subtotal de items).
    ...(Number(shipping) > 0
      ? { shipments: { cost: Number(shipping), mode: 'not_specified' } }
      : {}),

    // Texto que aparece en el resumen de la tarjeta del comprador.
    statement_descriptor: 'FOUNDER',

    // Métodos de pago — vacío significa "todos los habilitados en mi cuenta MP".
    // No excluimos nada por default; si en el futuro queremos sacar cuotas o
    // pagos en efectivo, lo hacemos acá.
    payment_methods: {
      installments: 12, // hasta 12 cuotas si la tarjeta lo permite
    },

    // Marketplace fee = 0 (no somos marketplace, vendemos directo).
    // No setear esto NO afecta nada; lo dejamos explícito para claridad.

    // Tracking de Meta — si MP detecta el Pixel ID, dispara eventos
    // automáticamente desde su lado (complementa nuestro Pixel + CAPI).
    ...(process.env.META_PIXEL_ID
      ? { tracks: [{ type: 'facebook_ad', values: { pixel_id: process.env.META_PIXEL_ID } }] }
      : {}),

    // Metadata libre — útil para debugging y para reportes en MP.
    metadata: {
      order_numero:    String(order.numero),
      expected_total:  expectedTotal,
      site:            'founder.uy',
    },
  };

  // ── 5. POST a la API de MP ─────────────────────────────────────
  // Idempotency key = numero del pedido. Si por alguna razón este
  // endpoint se llama dos veces para el mismo pedido, MP devuelve la
  // misma preference en vez de crear una nueva.
  const result = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body,
    idempotencyKey: `pref-${order.numero}`,
  });

  if (!result.ok) {
    console.error('[mp] createPreference falló:',
      result.status, result.error, result.data?.message || '');
    return {
      ok:    false,
      error: result.error || 'mp_unknown',
      detail: result.data?.message || result.data?.error || null,
    };
  }

  // ── 6. Validar respuesta ───────────────────────────────────────
  const initPoint    = result.data?.init_point;
  const preferenceId = result.data?.id;

  if (!initPoint || !preferenceId) {
    console.error('[mp] createPreference: respuesta sin init_point/id', result.data);
    return { ok: false, error: 'mp_invalid_response' };
  }

  console.log('[mp] preference creada OK',
    { numero: order.numero, preference_id: preferenceId });

  return {
    ok:            true,
    init_point:    initPoint,
    preference_id: preferenceId,
  };
}

/**
 * Lee un pago desde MP por su ID.
 * Lo usa el webhook para conocer el estado REAL del pago — el body del
 * webhook solo trae el ID, no los detalles.
 *
 * @param {string} paymentId — el data.id del webhook (ID numérico de MP)
 * @returns {Promise<{ok:boolean, error?:string, payment?:Object}>}
 *
 * Campos relevantes que devuelve MP:
 *   • status              — 'approved' | 'pending' | 'rejected' | 'in_process' | 'cancelled' | 'refunded'
 *   • status_detail       — código granular (ej: 'accredited', 'cc_rejected_call_for_authorize')
 *   • external_reference  — nuestro order.numero (lo seteamos al crear preference)
 *   • transaction_amount  — monto en UYU
 *   • payment_method_id   — 'visa', 'master', 'pix', 'rapipago', etc.
 *   • payer.email         — email del comprador
 *   • date_approved       — timestamp de aprobación (null si no aprobado)
 */
export async function getPayment(paymentId) {
  if (!paymentId) return { ok: false, error: 'invalid_payment_id' };

  const result = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`);

  if (!result.ok) {
    console.error('[mp] getPayment falló:', paymentId, result.status, result.error);
    return { ok: false, error: result.error || 'mp_unknown' };
  }

  return { ok: true, payment: result.data };
}

/**
 * Valida la firma HMAC-SHA256 que MP manda en el header x-signature.
 *
 * Formato del header x-signature:
 *   ts=1704000000,v1=abc123def456...
 *
 * Cómo se calcula la firma del lado de MP:
 *   1. MP arma el "manifest": `id:${dataId};request-id:${xRequestId};ts:${ts};`
 *   2. MP calcula HMAC-SHA256(manifest, MP_WEBHOOK_SECRET) en hex.
 *   3. Lo manda como v1=<hash>.
 *
 * 🚨 IMPORTANTE — el `dataId` del manifest es el `data.id` que viene como
 * QUERY PARAM de la URL del webhook (ej: ?data.id=156703706004), NO el
 * `body.data.id` que viene en el JSON del body. La docu oficial de MP es
 * explícita en esto: todos los ejemplos (PHP, Node, Go, Java) leen el
 * data.id desde URLSearchParams. En la mayoría de los casos coincide con
 * el del body, pero pueden diferir y la firma SE FIRMA CON EL DE LA URL.
 *
 * 🚨 IMPORTANTE 2 — si el dataId es alfanumérico, MP lo manda en lowercase.
 * Aplicamos .toLowerCase() defensivo aunque sean dígitos numéricos
 * (no afecta a strings numéricos y previene bugs si MP cambia el formato).
 *
 * Nuestro lado:
 *   1. Extraemos ts y v1 del header.
 *   2. Tomamos el data.id de los query params (con fallbacks).
 *   3. Recalculamos el HMAC con el mismo manifest.
 *   4. Comparamos. Si coincide → webhook genuino. Si no → ignorar.
 *
 * @param {Object} headers     — request.headers (Vercel los pasa lowercase)
 * @param {string} dataId      — el data.id (idealmente del query param ?data.id=...)
 * @returns {boolean}          — true si la firma valida, false en cualquier otro caso
 */
export function verifyWebhookSignature(headers, dataId) {
  const SECRET = process.env.MP_WEBHOOK_SECRET;
  if (!SECRET) {
    // Defensa en profundidad: si no hay secret en env, RECHAZAMOS por
    // defecto. Mejor perder un webhook real que aceptar uno falso.
    // El mensaje refleja el comportamiento real (rechazar, no "saltar").
    console.warn('[mp] MP_WEBHOOK_SECRET no configurado — RECHAZANDO webhook (modo cerrado por defecto)');
    return false;
  }

  const xSignature = headers['x-signature'];
  const xRequestId = headers['x-request-id'];

  if (!xSignature || !xRequestId || !dataId) {
    console.warn('[mp] webhook sin headers requeridos',
      { has_sig: !!xSignature, has_req_id: !!xRequestId, has_data_id: !!dataId });
    return false;
  }

  // Parsear "ts=1704000000,v1=abc..." → { ts, v1 }
  const parts = String(xSignature).split(',');
  let ts = null, v1 = null;
  for (const part of parts) {
    const [key, value] = part.split('=').map(s => s && s.trim());
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }

  if (!ts || !v1) {
    console.warn('[mp] x-signature mal formado:', xSignature);
    return false;
  }

  // Normalización defensiva del dataId: MP exige lowercase para alfanumérico.
  // Para IDs solo numéricos no cambia nada, pero previene bugs.
  const normalizedDataId = String(dataId).trim().toLowerCase();

  // Manifest según especificación de MP — los `;` finales SÍ van.
  const manifest = `id:${normalizedDataId};request-id:${xRequestId};ts:${ts};`;

  const expected = createHmac('sha256', SECRET).update(manifest).digest('hex');

  // Comparación timing-safe: ambos hex strings deben tener mismo largo
  // (64 chars para SHA-256). Si por algún motivo no coinciden en largo,
  // timingSafeEqual tira → lo manejamos como firma inválida sin filtrar
  // info por timing. Es defensa en profundidad: MP es target de alto
  // valor, vale la pena el costo trivial de la comparación constante.
  let isValid = false;
  try {
    const bufExpected = Buffer.from(expected, 'utf8');
    const bufReceived = Buffer.from(String(v1), 'utf8');
    if (bufExpected.length === bufReceived.length) {
      isValid = timingSafeEqual(bufExpected, bufReceived);
    }
  } catch (err) {
    // Si algo raro pasa al comparar, tratar como firma inválida.
    console.warn('[mp] error comparando firma (tratando como inválida):', err?.message || err);
    isValid = false;
  }

  if (!isValid) {
    // Logging detallado — sin filtrar el SECRET, pero con los inputs
    // que usamos para el manifest. Permite diagnosticar mismatches.
    console.warn('[mp] firma inválida — rechazando webhook', {
      ts,
      request_id: xRequestId,
      data_id_raw: dataId,
      data_id_normalized: normalizedDataId,
      manifest_preview: manifest, // sin el secret, no es sensible
      received_v1: v1,
      computed_v1: expected,
      secret_length: SECRET.length, // nos dice si la env var está rara
    });
  }

  return isValid;
}
