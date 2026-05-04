// ═════════════════════════════════════════════════════════════════
// FOUNDER — api/_lib/email-templates.js
// ─────────────────────────────────────────────────────────────────
// Templates HTML para los 3 tipos de emails transaccionales que
// manda email.js. Separados en su propio archivo porque los HTMLs
// son largos y mezclarlos con la lógica de envío hace todo ilegible.
//
// Convenciones de email HTML (NO es como un sitio web normal):
//   • Layout con <table> en vez de <div>+flex/grid. Outlook 2007-2019
//     todavía no soporta CSS moderno bien. Gmail filtra <style> en
//     algunos casos. Apple Mail y mobile clients sí lo soportan pero
//     queremos que se vea bien EN TODOS LADOS.
//   • CSS inline en cada elemento (style="..."). No hay <style>
//     porque varios clientes lo borran.
//   • Sin imágenes externas en V1 — vamos con el logo en texto serif.
//     Si más adelante queremos un logo gráfico, lo subimos a Supabase
//     Storage y referenciamos desde acá.
//   • Width fijo 600px (estándar de email). Mobile responsive
//     simulado con max-width + padding.
//
// Paleta de Founder (mismas vars que el sitio):
//   • Bg:       #141414 (negro)
//   • Surface:  #222222
//   • Text:     #f8f8f4
//   • Muted:    #9a9a9a
//   • Gold:     #c9a96e
//   • Border:   #2e2e2e
//
// Tipografía:
//   • Serif  (Cormorant Garamond fallback Georgia) → títulos
//   • Sans   (Montserrat fallback Arial)            → cuerpo
//   Como las fuentes web no cargan confiable en email, los emails usan
//   los fallbacks system: Georgia para serif, Arial para sans-serif.
//   Así el render es consistente en Gmail/Outlook/Apple Mail.
// ═════════════════════════════════════════════════════════════════

// ── HELPERS COMPARTIDOS ──────────────────────────────────────────

/** Escapa entidades HTML para evitar inyección o que se rompa el render. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formatea un número como moneda UYU sin símbolo. */
function fmtUYU(n) {
  return Number(n || 0).toLocaleString('es-UY');
}

/** WhatsApp del negocio — para CTAs de contacto en los emails. */
const WA_NUMBER = '598098550096';
const WA_LINK   = `https://wa.me/${WA_NUMBER}`;

// ── BLOQUES REUTILIZABLES ────────────────────────────────────────

/**
 * Header con logo "FOUNDER" en serif dorado. Mismo lookup que el sitio.
 */
function blockHeader() {
  return `
    <tr>
      <td style="padding:32px 32px 24px 32px;text-align:center;border-bottom:1px solid #2e2e2e;">
        <div style="font-family:Georgia,'Cormorant Garamond',serif;font-size:28px;font-weight:500;letter-spacing:8px;color:#c9a96e;">FOUNDER</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:600;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-top:6px;">Billeteras inteligentes</div>
      </td>
    </tr>`;
}

/**
 * Bloque del listado de items + total. Reutilizado en los 3 emails.
 * @param {Array} items — array con {product_name, color, cantidad, precio_unitario}
 * @param {number} total — total final del pedido
 * @param {number} envio — costo de envío (0 si gratis o retiro)
 * @param {number} descuento — descuento aplicado (0 si no hay)
 */
function blockItems(items, total, envio, descuento) {
  const rows = (items || []).map(it => {
    const subtotal = Number(it.cantidad || 0) * Number(it.precio_unitario || 0);
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #2e2e2e;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.5;">
          <strong style="color:#f8f8f4;">Founder ${esc(it.product_name)}</strong><br>
          <span style="color:#9a9a9a;font-size:11px;letter-spacing:1px;">${esc(it.color)} · x${Number(it.cantidad)}</span>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #2e2e2e;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;text-align:right;white-space:nowrap;">
          $${fmtUYU(subtotal)}
        </td>
      </tr>`;
  }).join('');

  // Líneas de descuento y envío solo si aplican
  const lineDescuento = Number(descuento) > 0
    ? `<tr>
         <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;">Descuento</td>
         <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#4caf82;text-align:right;">-$${fmtUYU(descuento)}</td>
       </tr>`
    : '';

  const lineEnvio = `<tr>
       <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;">Envío</td>
       <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#f8f8f4;text-align:right;">${Number(envio) > 0 ? '$' + fmtUYU(envio) : 'Gratis'}</td>
     </tr>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows}
      ${lineDescuento}
      ${lineEnvio}
      <tr>
        <td style="padding:18px 0 0 0;font-family:Georgia,serif;font-size:14px;color:#c9a96e;letter-spacing:2px;text-transform:uppercase;">Total</td>
        <td style="padding:18px 0 0 0;font-family:Georgia,serif;font-size:22px;color:#c9a96e;text-align:right;font-weight:600;">$${fmtUYU(total)} UYU</td>
      </tr>
    </table>`;
}

/**
 * Bloque CTA para seguir el pedido. Se inserta justo antes del footer.
 * El link va a seguimiento.html con ?pedido y ?email pre-cargados, así
 * el cliente abre el detalle de su pedido sin tener que tipear nada
 * (founder-seguimiento.js auto-rellena y dispara la búsqueda).
 *
 * Estilo: outline dorado para diferenciarse del CTA WhatsApp del footer
 * (que es sólido). Mantiene jerarquía visual: WhatsApp es más urgente,
 * seguimiento es informativo.
 */
function blockTrackingButton(numero, email) {
  // Si falta cualquiera de los 2, no rendereamos el bloque (defensa
  // contra emails malformados — preferible no mostrar nada que un link roto).
  if (!numero || !email) return '';

  const trackingUrl = `https://www.founder.uy/seguimiento.html`
    + `?pedido=${encodeURIComponent(numero)}`
    + `&email=${encodeURIComponent(email)}`;

  return `
    <tr>
      <td style="padding:0 32px 36px 32px;text-align:center;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:14px;">
          📍 Seguí tu pedido
        </div>
        <a href="${trackingUrl}"
           style="display:inline-block;background:transparent;color:#c9a96e;border:1px solid #c9a96e;padding:13px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">
          Ver estado del pedido
        </a>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a9a9a;line-height:1.6;margin-top:12px;">
          Mirá en cualquier momento en qué etapa está tu pedido<br>y todos los detalles.
        </div>
      </td>
    </tr>`;
}

/**
 * Footer con WhatsApp + redes sociales + mensaje legal mínimo.
 */
function blockFooter() {
  return `
    <tr>
      <td style="padding:32px;text-align:center;border-top:1px solid #2e2e2e;background:#141414;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a9a9a;line-height:1.7;">
          ¿Necesitás ayuda? Escribinos:
        </div>
        <div style="margin:14px 0;">
          <a href="${WA_LINK}" style="display:inline-block;background:#c9a96e;color:#141414;padding:11px 26px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;border-radius:0;">
            Contactar por WhatsApp
          </a>
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a9a9a;letter-spacing:1px;margin-top:18px;">
          <a href="https://www.founder.uy" style="color:#c9a96e;text-decoration:none;">www.founder.uy</a>
          &nbsp;·&nbsp;
          <a href="https://www.instagram.com/founder.uy" style="color:#c9a96e;text-decoration:none;">@founder.uy</a>
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#666;letter-spacing:1px;margin-top:18px;line-height:1.6;">
          Recibís este email porque hiciste un pedido en Founder.<br>
          Si no fuiste vos, escribinos por WhatsApp para ayudarte.
        </div>
      </td>
    </tr>`;
}

/**
 * Wrapper externo común — la <table> de 600px que envuelve todo el email.
 * Esto es lo que hace que el email se vea uniforme en Gmail/Outlook/etc.
 */
function wrapEmail(innerContent, previewText) {
  // Preview text: el texto pequeño que aparece en el inbox al lado del subject.
  // Es invisible en el cuerpo del email pero los clientes lo extraen.
  const preview = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#141414;opacity:0;">${esc(previewText)}</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Founder</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#141414;border:1px solid #2e2e2e;border-collapse:collapse;">
        ${innerContent}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 1: TRANSFERENCIA — pedido recibido, esperando transfer
// ─────────────────────────────────────────────────────────────────
export function templateOrderTransfer(order, items) {
  const numero    = esc(order.numero || '');
  const nombre    = esc(order.nombre || 'cliente');
  const total     = Number(order.total || 0);
  const envio     = Number(order.envio || 0);
  const descuento = Number(order.descuento || 0);

  // Detectar tipo de entrega para personalizar el mensaje sobre los
  // próximos pasos (envío vs retiro).
  const entrega = String(order.entrega || '').toLowerCase();
  const esEnvio = entrega.includes('env');

  const inner = `
    ${blockHeader()}

    <tr>
      <td style="padding:36px 32px 8px 32px;">
        <div style="font-family:Georgia,serif;font-size:32px;font-weight:300;color:#f8f8f4;line-height:1.2;">
          ¡Gracias por tu pedido, ${nombre}!
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-top:14px;">
          Pedido #${numero}
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 24px 32px;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#f8f8f4;line-height:1.7;margin:0;">
          Recibimos tu pedido. Para confirmarlo, falta que completes el pago por <strong style="color:#c9a96e;">transferencia bancaria</strong>.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 24px 32px;">
        <div style="background:#222;border:1px solid #2e2e2e;padding:24px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-bottom:14px;">
            💳 Cómo transferir
          </div>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;margin:0 0 14px 0;">
            En unos minutos te vamos a enviar los <strong>datos bancarios</strong> por WhatsApp para que puedas hacer la transferencia.
          </p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;line-height:1.7;margin:0;">
            Si pasaron más de 10 minutos y no recibiste los datos, escribinos haciendo click acá:
          </p>
          <div style="text-align:center;margin-top:18px;">
            <a href="${WA_LINK}?text=${encodeURIComponent('Hola, hice el pedido #' + numero + ' por transferencia y necesito los datos bancarios')}"
               style="display:inline-block;background:#c9a96e;color:#141414;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">
              Pedir datos por WhatsApp
            </a>
          </div>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento)}
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 36px 32px;">
        <div style="background:#0f0f0f;border-left:3px solid #c9a96e;padding:18px 22px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;">
            <strong style="color:#c9a96e;">💰 Bonificación 10%</strong> — Pagando por transferencia ya estás aprovechando el descuento.
          </div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;line-height:1.7;margin-top:10px;border-top:1px solid #2e2e2e;padding-top:10px;">
            ${esEnvio
              ? '📦 Una vez confirmemos tu transferencia, preparamos tu pedido y te avisamos por WhatsApp cuando esté en camino.'
              : '📍 Una vez confirmemos tu transferencia, preparamos tu pedido y te avisamos por WhatsApp cuando esté listo para retirar.'}
          </div>
        </div>
      </td>
    </tr>

    ${blockTrackingButton(numero, order.email)}

    ${blockFooter()}
  `;

  return wrapEmail(inner, `Tu pedido #${numero} fue registrado. Te enviamos los datos para transferir por WhatsApp.`);
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 2: MERCADO PAGO APROBADO — pago confirmado
// ─────────────────────────────────────────────────────────────────
export function templateOrderMpApproved(order, items) {
  const numero    = esc(order.numero || '');
  const nombre    = esc(order.nombre || 'cliente');
  const total     = Number(order.total || 0);
  const envio     = Number(order.envio || 0);
  const descuento = Number(order.descuento || 0);

  // Detectar tipo de entrega del campo `entrega`
  const entrega   = String(order.entrega || '').toLowerCase();
  const esEnvio   = entrega.includes('env');

  const proximoPaso = esEnvio
    ? 'Vamos a preparar tu pedido y te enviamos por WhatsApp el código de seguimiento del envío en cuanto salga.'
    : 'Te avisamos por WhatsApp cuando tu pedido esté listo para retirar en zona Prado, Montevideo.';

  const inner = `
    ${blockHeader()}

    <tr>
      <td style="padding:36px 32px 8px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#4caf82;text-transform:uppercase;margin-bottom:12px;">
          ✅ Pago confirmado
        </div>
        <div style="font-family:Georgia,serif;font-size:32px;font-weight:300;color:#f8f8f4;line-height:1.2;">
          ¡Recibimos tu pago, ${nombre}!
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-top:14px;">
          Pedido #${numero}
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 24px 32px;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#f8f8f4;line-height:1.7;margin:0;">
          Tu pago vía <strong style="color:#c9a96e;">Mercado Pago</strong> fue procesado con éxito. ${proximoPaso}
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento)}
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 36px 32px;">
        <div style="background:#0f0f0f;border-left:3px solid #4caf82;padding:18px 22px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;">
            <strong style="color:#4caf82;">${esEnvio ? '📦' : '📍'} Próximos pasos</strong><br>
            <span style="color:#9a9a9a;font-size:12px;">${esEnvio
              ? 'Estamos preparando tu pedido. Te avisamos por WhatsApp cuando esté en camino.'
              : 'Estamos preparando tu pedido. Te avisamos por WhatsApp cuando esté listo para retirar.'}</span>
          </div>
        </div>
      </td>
    </tr>

    ${blockTrackingButton(numero, order.email)}

    ${blockFooter()}
  `;

  return wrapEmail(inner, `Recibimos tu pago. Tu pedido #${numero} ya está en preparación.`);
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 3: MERCADO PAGO PENDIENTE — Abitab/Redpagos por pagar
// ─────────────────────────────────────────────────────────────────
export function templateOrderMpPending(order, items) {
  const numero    = esc(order.numero || '');
  const nombre    = esc(order.nombre || 'cliente');
  const total     = Number(order.total || 0);
  const envio     = Number(order.envio || 0);
  const descuento = Number(order.descuento || 0);

  const inner = `
    ${blockHeader()}

    <tr>
      <td style="padding:36px 32px 8px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-bottom:12px;">
          ⏳ Esperando tu pago
        </div>
        <div style="font-family:Georgia,serif;font-size:32px;font-weight:300;color:#f8f8f4;line-height:1.2;">
          Tu pedido está reservado, ${nombre}
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-top:14px;">
          Pedido #${numero}
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 24px 32px;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#f8f8f4;line-height:1.7;margin:0;">
          Tu pedido fue registrado pero <strong style="color:#c9a96e;">todavía falta completar el pago</strong>. Si elegiste Abitab o Redpagos, tenés que ir a pagar en efectivo con el cupón que te dio Mercado Pago.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 24px 32px;">
        <div style="background:#222;border:1px solid #2e2e2e;padding:24px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-bottom:14px;">
            🕐 Importante
          </div>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;margin:0 0 12px 0;">
            • Tenés <strong>3 días hábiles</strong> para completar el pago.<br>
            • Cuando se acredite, te llega otro email confirmando.<br>
            • Si no se paga a tiempo, el pedido se cancela automáticamente.
          </p>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento)}
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 36px 32px;">
        <div style="background:#0f0f0f;border-left:3px solid #c9a96e;padding:18px 22px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;">
            <strong style="color:#c9a96e;">¿Perdiste el cupón de pago?</strong><br>
            <span style="color:#9a9a9a;font-size:12px;">Escribinos por WhatsApp con tu número de pedido y te ayudamos a recuperarlo.</span>
          </div>
        </div>
      </td>
    </tr>

    ${blockTrackingButton(numero, order.email)}

    ${blockFooter()}
  `;

  return wrapEmail(inner, `Tu pedido #${numero} está reservado. Falta completar el pago.`);
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 4: ACTUALIZACIÓN DE ESTADO (Sesión 25)
// Disparado desde api/admin.js cuando el admin cambia el estado de
// un pedido vía panel. Un único template parametrizado que cambia
// color/emoji/textos según el estado destino. Centralizar en un
// solo template (en vez de 5 separados) facilita mantener la
// consistencia visual del sistema.
// ─────────────────────────────────────────────────────────────────

/**
 * Configuración por estado: define cómo se ve el email para cada
 * transición. Si en el futuro se agrega un estado nuevo que dispare
 * email, solo hay que sumar una entrada acá.
 *
 * Campos:
 *   eyebrow:       texto del rótulo superior (uppercase)
 *   eyebrowColor:  color hex del rótulo y barra lateral
 *   emoji:         emoji decorativo del título
 *   title:         título grande (admite ${nombre})
 *   intro:         párrafo introductorio (admite ${nombre})
 *   nextStepLabel: título del bloque "próximos pasos"
 *   nextStepText:  cuerpo del bloque (admite ${tracking} placeholder)
 *   subject:       asunto del email (admite ${numero})
 *   preview:       texto preview que se ve en bandejas tipo Gmail
 *
 * `entrega` (envío vs retiro) se aplica recién cuando se renderiza —
 * ciertos textos cambian según si el cliente eligió envío o retiro.
 */
const STATUS_CONFIG = {
  // Admin valida el pedido (típico paso siguiente a "Pendiente conf.")
  'Confirmado': {
    eyebrow:       '✅ Pedido confirmado',
    eyebrowColor:  '#4caf82',
    emoji:         '✅',
    title:         '¡Tu pedido está confirmado, ${nombre}!',
    intro:         'Recibimos tu pedido y ya está en nuestra cola de preparación. En breve empezamos a armarlo.',
    nextStepLabel: 'Próximos pasos',
    nextStepEnvio:  'Vamos a preparar tu pedido y te avisamos por WhatsApp y email cuando esté en camino.',
    nextStepRetiro: 'Vamos a preparar tu pedido y te avisamos por WhatsApp y email cuando esté listo para retirar.',
    subject:       'Confirmamos tu pedido Founder #${numero}',
    preview:       'Confirmamos tu pedido. Ya empezamos a prepararlo.',
  },
  // Empezamos a armar la billetera
  'En preparación': {
    eyebrow:       '🛠️ En preparación',
    eyebrowColor:  '#c9a96e',
    emoji:         '🛠️',
    title:         '${nombre}, ya estamos preparando tu pedido',
    intro:         'Tu Founder está siendo armada con cuidado. Materiales premium, control de calidad uno por uno.',
    nextStepLabel: 'Qué sigue',
    nextStepEnvio:  'En cuanto esté lista, despachamos el envío y te llega el código de seguimiento.',
    nextStepRetiro: 'En cuanto esté lista, te avisamos para que pases a retirarla por nuestro punto en zona Prado, Montevideo.',
    subject:       'Tu pedido Founder #${numero} está en preparación',
    preview:       'Estamos armando tu Founder con dedicación.',
  },
  // Salió del local — el más importante para envío
  'En camino': {
    eyebrow:       '🚚 En camino',
    eyebrowColor:  '#5b9bd5',
    emoji:         '🚚',
    title:         '${nombre}, tu pedido está en camino',
    intro:         'Tu Founder ya salió rumbo a vos. ${tracking}',
    nextStepLabel: 'Tiempo estimado de entrega',
    nextStepEnvio:  '1 a 3 días hábiles según tu departamento. Si tenés el código de seguimiento, podés ver el estado en tiempo real.',
    nextStepRetiro: 'Tu pedido salió del taller hacia el punto de retiro.',
    subject:       'Tu pedido Founder #${numero} está en camino',
    preview:       'Tu Founder ya salió rumbo a vos.',
  },
  // Para retiro presencial
  'Listo para retirar': {
    eyebrow:       '📍 Listo para retirar',
    eyebrowColor:  '#c9a96e',
    emoji:         '📍',
    title:         '${nombre}, tu Founder te está esperando',
    intro:         'Tu pedido está listo para retirar en nuestro punto.',
    nextStepLabel: 'Cómo retirarlo',
    nextStepEnvio:  'Tu pedido cambió a modalidad retiro. Por favor confirmanos por WhatsApp para coordinar.',
    nextStepRetiro: 'Acercate al punto de retiro en zona Prado, Montevideo. Si necesitás coordinar día y hora, escribinos por WhatsApp.',
    subject:       'Tu pedido Founder #${numero} está listo para retirar',
    preview:       'Tu Founder está lista para que la retires.',
  },
  // Cierre del ciclo
  'Entregado': {
    eyebrow:       '🎉 Entregado',
    eyebrowColor:  '#4caf82',
    emoji:         '🎉',
    title:         '¡Listo, ${nombre}! Tu Founder ya está con vos',
    intro:         'Esperamos que la disfrutes mucho. Diseñamos cada detalle para que dure años.',
    nextStepLabel: '¿Cómo te fue con tu Founder?',
    nextStepEnvio:  'Si te gustó la experiencia, contanos por WhatsApp — nos motiva mucho leer a clientes contentos. Y si tenés cualquier consulta sobre el cuidado de la billetera, también escribinos.',
    nextStepRetiro: 'Si te gustó la experiencia, contanos por WhatsApp — nos motiva mucho leer a clientes contentos. Y si tenés cualquier consulta sobre el cuidado de la billetera, también escribinos.',
    subject:       'Tu pedido Founder #${numero} fue entregado',
    preview:       'Esperamos que disfrutes mucho tu Founder.',
  },
};

/**
 * Devuelve true si el estado tiene template asociado (es decir, dispara
 * email). Útil para que admin.js pueda decidir si vale la pena el fetch.
 * Estados como "Cancelado" o "Pendiente pago" NO disparan email.
 */
export function statusTriggersEmail(estado) {
  return Object.prototype.hasOwnProperty.call(STATUS_CONFIG, estado);
}

/**
 * Renderiza el email de actualización de estado.
 *
 * @param {Object} order      pedido con numero, email, nombre, total, envio,
 *                            descuento, entrega, nro_seguimiento, url_seguimiento.
 * @param {Array}  items      items del pedido (puede ser []).
 * @param {string} statusKey  estado destino (debe existir en STATUS_CONFIG).
 * @returns {string} HTML del email, o '' si statusKey no es válido.
 */
export function templateOrderStatusUpdate(order, items, statusKey) {
  const cfg = STATUS_CONFIG[statusKey];
  if (!cfg) return '';

  const numero    = esc(order.numero || '');
  const nombre    = esc(order.nombre || 'cliente');
  const total     = Number(order.total || 0);
  const envio     = Number(order.envio || 0);
  const descuento = Number(order.descuento || 0);

  // Detectar tipo de entrega (mismo patrón que en otros templates)
  const entrega = String(order.entrega || '').toLowerCase();
  const esEnvio = entrega.includes('env');

  // Bloque de tracking opcional (solo para "En camino" con código cargado)
  const nroTracking = String(order.nro_seguimiento || '').trim();
  const urlTracking = String(order.url_seguimiento || '').trim();
  let trackingFragment = '';
  if (statusKey === 'En camino' && nroTracking) {
    trackingFragment = urlTracking
      ? `Código de seguimiento: <strong style="color:#c9a96e;">${esc(nroTracking)}</strong>. <a href="${esc(urlTracking)}" style="color:#c9a96e;">Ver estado del envío</a>.`
      : `Código de seguimiento: <strong style="color:#c9a96e;">${esc(nroTracking)}</strong>.`;
  }

  // Aplicar interpolación simple ${nombre} / ${tracking} en los textos
  const interp = (s) => String(s)
    .replace('${nombre}', nombre)
    .replace('${numero}', numero)
    .replace('${tracking}', trackingFragment);

  const titleText = interp(cfg.title);
  const introText = interp(cfg.intro);
  const nextStepText = esEnvio ? cfg.nextStepEnvio : cfg.nextStepRetiro;

  const inner = `
    ${blockHeader()}

    <tr>
      <td style="padding:36px 32px 8px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:${cfg.eyebrowColor};text-transform:uppercase;margin-bottom:12px;">
          ${esc(cfg.eyebrow)}
        </div>
        <div style="font-family:Georgia,serif;font-size:32px;font-weight:300;color:#f8f8f4;line-height:1.2;">
          ${titleText}
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-top:14px;">
          Pedido #${numero}
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 24px 32px;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#f8f8f4;line-height:1.7;margin:0;">
          ${introText}
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento)}
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 36px 32px;">
        <div style="background:#0f0f0f;border-left:3px solid ${cfg.eyebrowColor};padding:18px 22px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;">
            <strong style="color:${cfg.eyebrowColor};">${esc(cfg.emoji)} ${esc(cfg.nextStepLabel)}</strong><br>
            <span style="color:#9a9a9a;font-size:12px;">${nextStepText}</span>
          </div>
        </div>
      </td>
    </tr>

    ${blockTrackingButton(numero, order.email)}

    ${blockFooter()}
  `;

  return wrapEmail(inner, cfg.preview);
}

/**
 * Devuelve el subject formateado para un estado dado (útil para que
 * email.js no tenga que conocer la config de los estados).
 */
export function statusEmailSubject(order, statusKey) {
  const cfg = STATUS_CONFIG[statusKey];
  if (!cfg) return '';
  const numero = esc(order.numero || '');
  return cfg.subject.replace('${numero}', numero);
}
