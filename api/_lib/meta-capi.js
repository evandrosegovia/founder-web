// ═════════════════════════════════════════════════════════════════
// FOUNDER — api/_lib/meta-capi.js
// ─────────────────────────────────────────────────────────────────
// Conversion API (CAPI) — envía eventos Purchase desde el servidor
// directamente a Meta. Complementa al Pixel del cliente para
// esquivar adblockers, iOS ATT y otros bloqueos del browser.
//
// Cómo funciona la deduplicación:
//   1) El cliente dispara Purchase vía Pixel con event_id = order.numero.
//   2) Este módulo dispara el MISMO Purchase vía CAPI con el MISMO event_id.
//   3) Meta recibe 2 eventos con el mismo event_id y event_name dentro
//      de una ventana de 48h → deduplica automáticamente → cuenta 1 sola
//      compra.
//   4) Si el cliente fue bloqueado (adblock, etc.), CAPI salva el evento.
//
// Datos enviados (con email/phone hasheados SHA-256):
//   • Custom data: value, currency, content_ids, num_items, order_id
//   • User data (hasheados): email, phone, nombre, apellido
//   • User data (cleartext):  IP, User Agent, fbp/fbc si vienen
//
// Variables de entorno requeridas:
//   • META_PIXEL_ID      — público, el Pixel ID (15-16 dígitos)
//   • META_CAPI_TOKEN    — sensitive, Access Token generado en Events Manager
//   • META_TEST_EVENT_CODE (opcional) — para que los eventos aparezcan
//                                       en la pestaña "Test events" de Meta
//
// Si falta cualquier env var requerida → la función retorna early sin
// disparar el evento, pero sin romper el pedido.
// ═════════════════════════════════════════════════════════════════

import { createHash } from 'crypto';

// ── CONFIG ───────────────────────────────────────────────────────
const META_API_VERSION = 'v19.0';
const CURRENCY         = 'UYU';

// ── HELPERS ──────────────────────────────────────────────────────

/**
 * Hash SHA-256 normalizado al formato que Meta espera:
 * - Trim + lowercase.
 * - Devuelve hex string en minúsculas.
 * - Si el input es falsy, retorna undefined (Meta ignora las keys undefined).
 * Meta exige estos datos PII siempre hasheados — nunca enviar en claro.
 */
function sha256Hash(input) {
  if (!input) return undefined;
  const normalized = String(input).trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Normalización especial para teléfono:
 * - Remueve todo lo que no sea dígito (+, espacios, guiones, paréntesis).
 * - No fuerza código de país (asumimos que el checkout ya pide formato UY).
 * - Hashea el resultado.
 * Ejemplo: "+598 098 550 096" → "598098550096" → sha256
 */
function hashPhone(phone) {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return undefined;
  return createHash('sha256').update(digits, 'utf8').digest('hex');
}

/**
 * Extrae la IP real del cliente desde los headers de Vercel.
 * Vercel setea `x-forwarded-for` con la IP del cliente como primer valor.
 * Si no está, fallback al `x-real-ip` o connection remoteAddress.
 * Meta usa la IP para location matching (geografía del usuario).
 */
function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    // x-forwarded-for puede ser "ip1, ip2, ip3" — nos quedamos con la primera
    return String(xff).split(',')[0].trim();
  }
  return req.headers?.['x-real-ip']
      || req.socket?.remoteAddress
      || undefined;
}

/**
 * Lee la cookie `_fbp` del request (si está). Meta la usa para
 * asociar el evento del server con la misma sesión del navegador
 * que ya disparó eventos de Pixel. Mejora match rate sin requerir PII.
 * Formato de _fbp: "fb.1.1234567890.987654321"
 */
function getFbp(req) {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/);
  return match ? match[1] : undefined;
}

/**
 * Lee la cookie `_fbc` del request (si está). Se setea cuando el
 * usuario llegó vía click en un anuncio de Meta — contiene el
 * fbclid. Crítica para atribución de campañas.
 */
function getFbc(req) {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/);
  return match ? match[1] : undefined;
}

// ── API PÚBLICA ──────────────────────────────────────────────────

/**
 * Envía un evento Purchase a Meta vía CAPI.
 *
 * @param {Object} params
 * @param {Object} params.order  — el pedido limpio (numero, email, total, etc.)
 * @param {Array}  params.items  — items del pedido (product_name, cantidad, ...)
 * @param {Object} params.req    — el request HTTP de Vercel (para IP/UA/cookies)
 * @returns {Promise<{ok:boolean, error?:string, meta?:any}>}
 */
export async function sendPurchaseEvent({ order, items, req }) {
  // ── 1. Validar env vars ────────────────────────────────────────
  const PIXEL_ID        = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN    = process.env.META_CAPI_TOKEN;
  const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE; // opcional

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn('[meta-capi] Faltan META_PIXEL_ID o META_CAPI_TOKEN — evento NO enviado');
    return { ok: false, error: 'missing_env_vars' };
  }

  // ── 2. Validar input mínimo ────────────────────────────────────
  if (!order || !order.numero) {
    return { ok: false, error: 'invalid_order' };
  }

  // ── 3. Armar custom_data ───────────────────────────────────────
  const itemsArr = Array.isArray(items) ? items : [];
  const contentIds = itemsArr
    .map(i => String(i.product_name || i.name || '').trim())
    .filter(Boolean);
  const numItems = itemsArr.reduce((s, i) => s + (Number(i.cantidad || i.qty) || 0), 0);

  const customData = {
    currency: CURRENCY,
    value:    Number(order.total) || 0,
    order_id: String(order.numero),
    // content_ids y num_items solo si tienen sentido
    ...(contentIds.length ? { content_ids: contentIds, content_type: 'product' } : {}),
    ...(numItems ? { num_items: numItems } : {}),
  };

  // ── 4. Armar user_data (PII hasheado + señales técnicas) ──────
  const userData = {
    em: sha256Hash(order.email),
    ph: hashPhone(order.celular),
    fn: sha256Hash(order.nombre),
    ln: sha256Hash(order.apellido),
    country: sha256Hash('uy'),             // ISO 3166-1 alpha-2, lowercase
    client_ip_address: getClientIp(req),
    client_user_agent: req.headers?.['user-agent'] || undefined,
    fbp: getFbp(req),
    fbc: getFbc(req),
  };

  // Limpieza: Meta rechaza keys con undefined (devuelve 400 "invalid type").
  Object.keys(userData).forEach(k => {
    if (userData[k] === undefined) delete userData[k];
  });

  // ── 5. Armar payload completo ──────────────────────────────────
  const payload = {
    data: [{
      event_name:      'Purchase',
      event_time:      Math.floor(Date.now() / 1000), // Unix seconds
      event_id:        String(order.numero),          // ← dedup con Pixel
      event_source_url: 'https://www.founder.uy/checkout.html',
      action_source:   'website',
      user_data:       userData,
      custom_data:     customData,
    }],
    // Si se seteó META_TEST_EVENT_CODE, los eventos aparecen en la
    // pestaña "Test events" de Events Manager — útil para debugging.
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };

  // ── 6. POST a Meta Graph API ───────────────────────────────────
  const url = `https://graph.facebook.com/${META_API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;

  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Meta devuelve errores con forma { error: { message, type, code } }
      console.error(
        '[meta-capi] Meta rechazó el evento:',
        response.status,
        data?.error?.message || 'sin mensaje',
        { event_id: order.numero }
      );
      return {
        ok:    false,
        error: `meta_http_${response.status}`,
        meta:  data?.error,
      };
    }

    // Éxito — Meta devuelve events_received + messages + fbtrace_id
    console.log(
      '[meta-capi] Purchase enviado OK',
      { event_id: order.numero, received: data?.events_received, trace: data?.fbtrace_id }
    );
    return { ok: true, meta: data };
  } catch (err) {
    console.error('[meta-capi] Error de red enviando evento:', err?.message || err);
    return { ok: false, error: 'network_error', meta: String(err?.message || err) };
  }
}
