// ═════════════════════════════════════════════════════════════════
// FOUNDER — api/_lib/email.js
// ─────────────────────────────────────────────────────────────────
// Wrapper liviano para Resend (envío de emails transaccionales).
// No usa el SDK oficial — habla directo a la API REST con fetch,
// mismo patrón que api/_lib/meta-capi.js y api/_lib/mercadopago.js.
// Razones:
//   • Cero dependencias nuevas (no agregamos paquetes a package.json).
//   • Cold-start más rápido en Vercel Serverless.
//   • Control total de timeouts y errores.
//
// Funciones públicas:
//   1) sendOrderConfirmationTransfer(order, items)
//        Email post-checkout para pedidos por TRANSFERENCIA.
//        Incluye datos bancarios y próximos pasos.
//
//   2) sendOrderConfirmationMpApproved(order, items)
//        Email cuando Mercado Pago APRUEBA el pago.
//        Disparado desde el webhook (api/mp-webhook.js).
//
//   3) sendOrderConfirmationMpPending(order, items)
//        Email cuando Mercado Pago deja el pago en PENDIENTE
//        (caso típico: cliente eligió Abitab/Redpagos).
//
//   4) sendOrderStatusUpdate(order, items, statusKey, photoMap)
//        Email de actualización de estado del pedido.
//        Disparado desde api/admin.js.
//
//   5) sendReviewThankYou(order, review)
//        Email de agradecimiento + cupón recompensa al cliente
//        que dejó reseña. Disparado desde api/reviews.js.
//
//   6) sendAdminPersonalizacionAlert(order, items)  ⬅ Sesión 40
//        Email INTERNO al dueño del negocio (variable ADMIN_EMAIL)
//        cuando entra un pedido con grabado láser. NO va al cliente.
//        Disparado desde api/checkout.js (transferencia) y
//        api/mp-webhook.js (MP approved/pending).
//
//   7) sendRecompraEmail(order, coupon)  ⬅ Sesión 43
//        Email AUTOMÁTICO de recompra al cliente, con cupón de
//        descuento, disparado por el cron Tarea D
//        (cleanup-personalizacion.js) ~10-16 días post-entrega.
//        Es proactivo: no requiere acción del cliente.
//
// Variables de entorno requeridas:
//   • RESEND_API_KEY  — generada en https://resend.com/api-keys
//   • ADMIN_EMAIL     — email del admin para recibir alertas internas
//                       (opcional: si falta, sendAdminPersonalizacionAlert
//                        loguea warning y hace skip sin tirar error)
//
// Si falta RESEND_API_KEY, las funciones retornan early con error
// claro pero NO tiran excepción — el caller decide qué hacer.
// El pedido nunca falla por culpa de un email no enviado.
// ═════════════════════════════════════════════════════════════════

import {
  templateOrderTransfer,
  templateOrderMpApproved,
  templateOrderMpPending,
  templateOrderStatusUpdate,
  templateReviewThankYou,
  templateAdminPersonalizacionAlert,
  templateRecompra,
  statusEmailSubject,
  statusTriggersEmail,
} from './email-templates.js';

// ── CONFIG ───────────────────────────────────────────────────────
const RESEND_API_BASE = 'https://api.resend.com';

// Remitente fijo. El dominio founder.uy está verificado en Resend.
// Cambiarlo requiere también re-verificar el dominio.
const FROM_EMAIL = 'Founder <info@founder.uy>';

// Reply-To: si el cliente responde al email, el reply va al WhatsApp
// del negocio. Como WhatsApp no tiene email asociado, ponemos
// info@founder.uy también — vos vas a configurar el inbox de Resend
// (o un forwarder) cuando lo necesites.
const REPLY_TO_EMAIL = 'info@founder.uy';

// Timeout: si Resend no responde en 5s abortamos. Vercel mata la
// función a los 15s (vercel.json), así que dejamos margen.
const RESEND_TIMEOUT_MS = 5000;

// ── HELPER PRIVADO ───────────────────────────────────────────────

/**
 * Ofusca un email para logs: deja visibles primeros 2 chars del local
 * y el dominio completo. Ejemplo:
 *   "juan.perez@gmail.com"  →  "ju***@gmail.com"
 *   "a@b.com"               →  "a***@b.com"
 *   ""  o no-string         →  "(sin email)"
 *
 * Cumplimiento GDPR/LGPD: los logs no deberían contener PII completa.
 * Esta función nos permite seguir auditando "qué email recibió el aviso"
 * sin guardar el email completo en logs de Vercel.
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '(sin email)';
  const at = email.indexOf('@');
  if (at < 1) return '(email-mal-formado)';
  const local  = email.slice(0, at);
  const domain = email.slice(at); // incluye la @
  const head   = local.slice(0, Math.min(2, local.length));
  return `${head}***${domain}`;
}

/**
 * Wrapper de fetch a Resend con timeout. Devuelve { ok, error, data }.
 * Nunca tira — si algo falla, lo logueamos y devolvemos un objeto.
 */
async function resendFetch(path, body) {
  const API_KEY = process.env.RESEND_API_KEY;
  if (!API_KEY) {
    return { ok: false, error: 'missing_api_key', data: null };
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetch(`${RESEND_API_BASE}${path}`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type':  'application/json',
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let data = null;
    try { data = await response.json(); } catch { /* sin body */ }

    if (!response.ok) {
      return {
        ok:    false,
        error: `resend_http_${response.status}`,
        data,
      };
    }
    return { ok: true, error: null, data };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err?.name === 'AbortError';
    return {
      ok:    false,
      error: isAbort ? 'resend_timeout' : 'resend_network_error',
      data:  null,
    };
  }
}

/**
 * Helper común: arma y envía un email. Centraliza logging + manejo
 * de errores para que las 3 funciones públicas queden simétricas.
 */
async function sendEmail({ to, subject, html, type }) {
  // Validación temprana — si no hay destinatario, no tiene sentido
  // ni intentar.
  if (!to || !String(to).includes('@')) {
    console.warn(`[email] ${type}: email destino inválido — skip`);
    return { ok: false, error: 'invalid_to' };
  }

  const result = await resendFetch('/emails', {
    from:     FROM_EMAIL,
    to:       [String(to).trim().toLowerCase()],
    reply_to: REPLY_TO_EMAIL,
    subject,
    html,
  });

  if (!result.ok) {
    // Logueamos sin tirar — el caller decide qué hacer (en general,
    // ignorar; el pedido ya está confirmado en Supabase).
    console.error(`[email] ${type} falló:`, result.error,
      result.data?.message || result.data?.error || '');
    return { ok: false, error: result.error };
  }

  console.log(`[email] ${type} enviado OK`,
    { to: maskEmail(to), message_id: result.data?.id });
  return { ok: true, message_id: result.data?.id };
}

// ── API PÚBLICA ──────────────────────────────────────────────────

/**
 * Envía el email de confirmación post-checkout para TRANSFERENCIA.
 *
 * @param {Object} order — objeto del pedido (numero, email, total, etc.)
 * @param {Array}  items — items del pedido (product_name, color, ...)
 * @returns {Promise<{ok:boolean, error?:string, message_id?:string}>}
 */
export async function sendOrderConfirmationTransfer(order, items) {
  if (!order || !order.numero || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  return sendEmail({
    to:      order.email,
    subject: `Tu pedido en Founder #${order.numero} — Datos para transferir`,
    html:    templateOrderTransfer(order, items || []),
    type:    'transfer',
  });
}

/**
 * Envía el email cuando Mercado Pago APRUEBA el pago.
 * Disparado desde api/mp-webhook.js cuando MP confirma.
 */
export async function sendOrderConfirmationMpApproved(order, items) {
  if (!order || !order.numero || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  return sendEmail({
    to:      order.email,
    subject: `Recibimos tu pago — Pedido Founder #${order.numero}`,
    html:    templateOrderMpApproved(order, items || []),
    type:    'mp_approved',
  });
}

/**
 * Envía el email cuando Mercado Pago deja el pago PENDIENTE.
 * Caso típico: el cliente eligió Abitab/Redpagos y todavía no fue
 * a pagar en efectivo. Disparado desde api/mp-webhook.js.
 */
export async function sendOrderConfirmationMpPending(order, items) {
  if (!order || !order.numero || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  return sendEmail({
    to:      order.email,
    subject: `Tu pedido Founder #${order.numero} está esperando el pago`,
    html:    templateOrderMpPending(order, items || []),
    type:    'mp_pending',
  });
}

/**
 * Envía el email de actualización de estado del pedido.
 *
 * Disparado desde api/admin.js cuando el admin cambia el estado
 * vía panel. Solo dispara si statusKey está en STATUS_CONFIG del
 * template (los estados internos como "Pendiente pago" o "Pago
 * rechazado" NO disparan email — los gestiona el sistema).
 *
 * @param {Object} order      pedido completo (con nro_seguimiento si aplica)
 * @param {Array}  items      items del pedido
 * @param {string} statusKey  estado destino — ej "En camino", "Entregado"
 * @param {Object} [photoMap] diccionario "ProductName||ColorName" → URL.
 *                            Si no se provee, los emails de status sin
 *                            precios renderizan placeholder en lugar de foto.
 *                            "Entregado" no usa este map (muestra precios).
 * @returns {Promise<{ok:boolean, error?:string, message_id?:string}>}
 */
export async function sendOrderStatusUpdate(order, items, statusKey, photoMap) {
  if (!order || !order.numero || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  if (!statusTriggersEmail(statusKey)) {
    // El estado no tiene template asociado — no es un error,
    // simplemente no enviamos email para este estado.
    return { ok: true, error: null, skipped: true };
  }
  const html    = templateOrderStatusUpdate(order, items || [], statusKey, photoMap);
  const subject = statusEmailSubject(order, statusKey);
  if (!html || !subject) {
    return { ok: false, error: 'template_render_failed' };
  }
  return sendEmail({
    to:      order.email,
    subject,
    html,
    type:    `status_${statusKey.toLowerCase().replace(/\s+/g, '_')}`,
  });
}

/**
 * Envía email de agradecimiento + cupón de recompensa cuando el cliente
 * deja una reseña. Sesión 38.
 *
 * Disparado desde api/reviews.js (action='create') con fire-and-forget
 * + timeout, mismo patrón que el resto.
 *
 * @param {Object} order pedido (numero, email, nombre).
 * @param {Object} review datos de la reseña recién creada:
 *                        - rating (1-5)
 *                        - texto (string)
 *                        - rewardCoupon (null | { codigo, tipo, valor })
 * @returns {Promise<{ok:boolean, error?:string, message_id?:string}>}
 */
export async function sendReviewThankYou(order, review) {
  if (!order || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  const html    = templateReviewThankYou(order, review || {});
  const subject = review?.rewardCoupon
    ? `¡Gracias por tu reseña! Tu cupón ${review.rewardCoupon.codigo} ya está activo`
    : `¡Gracias por tu reseña!`;
  if (!html) {
    return { ok: false, error: 'template_render_failed' };
  }
  return sendEmail({
    to:      order.email,
    subject,
    html,
    type:    'review_thank_you',
  });
}

/**
 * Envía alerta INTERNA al admin cuando entra un pedido con grabado láser.
 * Sesión 40.
 *
 * Disparado desde:
 *   • api/checkout.js → flujo de TRANSFERENCIA (post-RPC create_order).
 *   • api/mp-webhook.js → cuando MP cambia estado a approved/authorized
 *     o pending/in_process (solo en "transición nueva", para evitar
 *     duplicados por reintentos de webhook).
 *
 * Condición de envío (defensa en profundidad):
 *   • Existe ADMIN_EMAIL en env.
 *   • Existe `personalizacion_extra > 0` O al menos un item con
 *     `personalizacion` (mismo criterio que `blockPersonalizacion`,
 *     que retorna string vacío si no hay grabado — el email no se
 *     enviaría con un cuerpo vacío, pero igual filtramos antes para
 *     no gastar una llamada a Resend).
 *
 * Si falta ADMIN_EMAIL: warn + skip (no es error — el feature es opcional).
 * Si falta RESEND_API_KEY: el helper sendEmail loguea el error y retorna.
 *
 * @param {Object} order pedido completo (debe incluir personalizacion_extra)
 * @param {Array}  items items del pedido (con campo personalizacion si aplica)
 * @returns {Promise<{ok:boolean, error?:string, skipped?:boolean, message_id?:string}>}
 */
export async function sendAdminPersonalizacionAlert(order, items) {
  if (!order || !order.numero) {
    return { ok: false, error: 'invalid_order' };
  }

  // Filtro de relevancia: solo enviamos si efectivamente hay grabado.
  // Misma condición que blockPersonalizacion en email-templates.js.
  const tieneExtra      = Number(order.personalizacion_extra || 0) > 0;
  const algunItemConPer = Array.isArray(items)
    && items.some(it => it && it.personalizacion);
  if (!tieneExtra && !algunItemConPer) {
    return { ok: true, error: null, skipped: true };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !String(adminEmail).includes('@')) {
    // ADMIN_EMAIL es opcional — si no está configurada, hacemos skip
    // silencioso. El pedido sigue su curso normal. Vos lo configurás
    // en Vercel cuando quieras activar las alertas.
    console.warn('[email] admin_personalizacion: ADMIN_EMAIL no configurado — skip');
    return { ok: true, error: null, skipped: true };
  }

  return sendEmail({
    to:      adminEmail,
    subject: `⚡ Pedido con grabado #${order.numero} — preparar láser`,
    html:    templateAdminPersonalizacionAlert(order, items || []),
    type:    'admin_personalizacion',
  });
}

/**
 * Envía email automático de recompra al cliente con un cupón de
 * descuento. Sesión 43.
 *
 * Disparado por el cron Tarea D (cleanup-personalizacion.js) cuando
 * detecta pedidos en estado 'Entregado' con `updated_at` ≥10 días
 * atrás y `recompra_email_sent_at` aún NULL.
 *
 * Diferencia con otras funciones:
 *   • Es la ÚNICA proactiva: no la dispara una acción del cliente,
 *     sino el cron semanal.
 *   • El subject incluye el nombre del cliente (más personal).
 *   • Requiere coupon = { codigo, tipo, valor, expiraEn } — el caller
 *     (cron) es responsable de armarlo a partir de la DB + cálculo
 *     de fecha de vencimiento (texto en español).
 *
 * Si falta info del pedido o del cupón → retorna error sin tirar.
 * El caller (cron) decide si marcar el flag de dedup según el resultado:
 * solo lo marca si `result.ok === true`.
 *
 * @param {Object} order   pedido completo (debe tener numero, email, nombre)
 * @param {Object} coupon  { codigo, tipo, valor, expiraEn? }
 * @returns {Promise<{ok:boolean, error?:string, message_id?:string}>}
 */
export async function sendRecompraEmail(order, coupon) {
  if (!order || !order.numero || !order.email) {
    return { ok: false, error: 'invalid_order' };
  }
  if (!coupon || !coupon.codigo) {
    return { ok: false, error: 'invalid_coupon' };
  }

  const nombre = (order.nombre || '').trim() || 'Hola';
  const subject = `${nombre}, te dejamos un cupón en Founder 💛`;

  return sendEmail({
    to:      order.email,
    subject,
    html:    templateRecompra(order, coupon),
    type:    'recompra',
  });
}

