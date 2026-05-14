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
/**
 * @param {Array} items — array con {product_name, color, cantidad, precio_unitario}
 * @param {number} total — total final del pedido
 * @param {number} envio — costo de envío (0 si gratis o retiro)
 * @param {number} descuento — descuento aplicado (0 si no hay) — suma total
 * @param {Object} [opts] — Sesión 36: contexto para atribuir descuento
 * @param {string} [opts.cuponCodigo] — código del cupón usado (si lo hay)
 * @param {string} [opts.pago] — método de pago (para detectar transferencia)
 */
function blockItems(items, total, envio, descuento, opts) {
  // Sesión 37: enriquecer opts con datos que renderDiscountLines necesita
  // para calcular el split exacto cuando hay cupón + transferencia.
  // subtotal = suma de (precio × cantidad), personalizExtra = suma de extras.
  const subtotalCalc = (items || []).reduce((s, it) => {
    return s + (Number(it.cantidad || 0) * Number(it.precio_unitario || 0));
  }, 0);
  const personalizExtraCalc = (items || []).reduce((s, it) => {
    const extra = Number((it.personalizacion && it.personalizacion.extra) || 0);
    return s + (extra * Number(it.cantidad || 0));
  }, 0);
  const optsFull = Object.assign({}, opts || {}, {
    subtotal:        Number(opts && opts.subtotal)        || subtotalCalc,
    personalizExtra: Number(opts && opts.personalizExtra) || personalizExtraCalc,
    envio:           Number(envio) || 0,
    total:           Number(total) || 0,
    // Sesión 39: pasar el desglose dedicado (si vino desde la DB)
    descuentoCupon:         Number(opts && opts.descuentoCupon)         || 0,
    descuentoTransferencia: Number(opts && opts.descuentoTransferencia) || 0,
  });

  const rows = (items || []).map(it => {
    const cantidad = Number(it.cantidad || 0);
    const precio   = Number(it.precio_unitario || 0);
    // Sesión 36 fix: el extra de personalización por item entra en
    // el subtotal de la línea. Antes el email solo mostraba el
    // precio base sin el grabado → la suma de líneas no cuadraba
    // con el total final.
    const extra    = Number((it.personalizacion && it.personalizacion.extra) || 0);
    const subtotal = (precio + extra) * cantidad;
    // Subtítulo con la info de personalización si aplica
    const grabadoInfo = extra > 0
      ? ` <span style="color:#c9a96e;">· con grabado láser (+$${fmtUYU(extra)})</span>`
      : '';
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #2e2e2e;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.5;">
          <strong style="color:#f8f8f4;">Founder ${esc(it.product_name)}</strong><br>
          <span style="color:#9a9a9a;font-size:11px;letter-spacing:1px;">${esc(it.color)} · x${cantidad}${grabadoInfo}</span>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #2e2e2e;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;text-align:right;white-space:nowrap;">
          $${fmtUYU(subtotal)}
        </td>
      </tr>`;
  }).join('');

  // Sesión 36/37: tarjetas verdes con atribución y split exacto
  const lineDescuento = renderDiscountLines(descuento, optsFull);

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

// Sesión 36/37: helper compartido para renderizar líneas/tarjetas de
// descuento con atribución correcta. Si hay cupón + transferencia,
// muestra 2 tarjetas con monto individual exacto (calculado matemáticamente).
// Si hay solo una fuente, muestra 1 tarjeta. Sin contexto cae al
// label "Descuento" genérico para compatibilidad con pedidos viejos.
//
// Las tarjetas en email se hacen con tabla anidada + border-left
// (la única forma confiable que funciona en Outlook, Gmail, Apple Mail).
// No usa CSS moderno (flexbox, variables) — todo inline HTML clásico.
function renderDiscountLines(descuento, opts, colspan) {
  const descNum = Number(descuento) || 0;
  if (descNum <= 0) return '';

  const cuponCodigo = (opts && opts.cuponCodigo) ? String(opts.cuponCodigo).toUpperCase() : '';
  const pago        = (opts && opts.pago)        ? String(opts.pago) : '';
  // Datos para calcular split exacto cuando hay 2 fuentes:
  const subtotal         = Number((opts && opts.subtotal) || 0);
  const personalizExtra  = Number((opts && opts.personalizExtra) || 0);
  const envio            = Number((opts && opts.envio) || 0);
  const total            = Number((opts && opts.total) || 0);
  // Sesión 39: columnas dedicadas del desglose. Si vienen > 0 las usamos
  // directamente (fuente de verdad). Si vienen en 0/undefined caemos al
  // despeje matemático de Sesión 37 para pedidos viejos.
  const dcupon = Number((opts && opts.descuentoCupon)         || 0);
  const dtrans = Number((opts && opts.descuentoTransferencia) || 0);
  const tieneDesgloseDB = (dcupon > 0 || dtrans > 0);

  const hayCupon          = !!cuponCodigo;
  const hayTransferencia  = /transfer/i.test(pago);
  const cs = colspan ? `colspan="${colspan}"` : '';

  // Caso 1: cupón + transferencia → 2 tarjetas con montos
  if (hayCupon && hayTransferencia) {
    let cuponAmount;
    let transferAmount;
    if (tieneDesgloseDB) {
      // Sesión 39: usamos directamente las columnas dedicadas.
      cuponAmount    = dcupon;
      transferAmount = dtrans;
    } else {
      // Fallback: despeje matemático para pedidos previos a Sesión 39.
      // total = (subtotal + personaliz - cupon) × 0.90 + envio
      //   → cupon = subtotal + personaliz - ((total - envio) / 0.90)
      cuponAmount    = Math.round(subtotal + personalizExtra - ((total - envio) / 0.90));
      transferAmount = descNum - cuponAmount;
    }
    // Sanity check: si por algún motivo el split da negativo o no cierra
    // (datos incompletos), fallback a mostrar solo el total descontado.
    if (cuponAmount < 0 || transferAmount < 0 || Math.abs((cuponAmount + transferAmount) - descNum) > 1) {
      return renderCard(cs, '✓ Cupón ' + esc(cuponCodigo) + ' + Transferencia', 'Descuentos aplicados al pedido', descNum);
    }
    // Subtítulo del cupón: si es de personalización, decimos "grabados gratis"
    // (heurística simple: si todo lo personalizado se cubrió, es personalización)
    const subCupon = (personalizExtra > 0 && cuponAmount === personalizExtra)
      ? 'Personalización gratis'
      : 'Descuento aplicado';
    return renderCard(cs, '✓ Cupón ' + esc(cuponCodigo) + ' aplicado', subCupon, cuponAmount)
         + renderCard(cs, '✓ Pago por transferencia',                 '10% sobre productos + grabados', transferAmount);
  }
  // Caso 2: solo cupón
  if (hayCupon) {
    const subCupon = (personalizExtra > 0 && descNum === personalizExtra)
      ? 'Personalización gratis'
      : 'Descuento aplicado';
    return renderCard(cs, '✓ Cupón ' + esc(cuponCodigo) + ' aplicado', subCupon, descNum);
  }
  // Caso 3: solo transferencia
  if (hayTransferencia) {
    return renderCard(cs, '✓ Pago por transferencia', '10% sobre productos + grabados', descNum);
  }
  // Caso 4 (fallback): pedido viejo sin atribución → fila plana clásica
  const greenStyle = 'padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#4caf82;text-align:right;';
  const grayLabel  = 'padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;';
  return `<tr>
    <td ${cs} style="${grayLabel}">Descuento</td>
    <td style="${greenStyle}">-$${fmtUYU(descNum)}</td>
  </tr>`;
}

// Sesión 37: helper para renderizar UNA tarjeta verde con borde izquierdo,
// título + subtítulo + monto. Se hace con tabla anidada (compatible con
// todos los clientes de email incluido Outlook). El colspan se aplica a
// un <tr> wrapper para mantener la grilla del padre intacta.
function renderCard(colspan, title, subtitle, amount) {
  const fullColspan = colspan ? colspan.replace(/colspan="(\d+)"/, (_, n) => `colspan="${Number(n) + 1}"`) : 'colspan="2"';
  return `<tr>
    <td ${fullColspan} style="padding:6px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:rgba(76,175,130,0.08);border-left:3px solid #4caf82;">
        <tr>
          <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#4caf82;font-weight:600;line-height:1.4;">
              ${title}
            </div>
            <div style="font-size:10px;color:#9a9a9a;line-height:1.4;margin-top:2px;">
              ${subtitle}
            </div>
          </td>
          <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#4caf82;font-weight:600;text-align:right;white-space:nowrap;vertical-align:middle;">
            -$${fmtUYU(amount)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * Bloque compacto SIN precios, CON foto del producto. Usado en los
 * emails de actualización de estado (Sesión 25): el cliente ya conoce
 * los precios desde el email de confirmación inicial; en los siguientes
 * solo le importa "qué pedido es" y verlo visualmente.
 *
 * @param {Array}  items     [{ product_name, color, cantidad, ... }]
 * @param {Object} photoMap  diccionario "ProductName||ColorName" → URL.
 *                           Si la foto no se encuentra, se renderiza
 *                           un placeholder dorado discreto en su lugar.
 *
 * Compatibilidad de email: las imágenes se renderizan dentro de una
 * tabla con anchos fijos para que se vean correctamente en Gmail,
 * Outlook, Apple Mail, etc. (ningún cliente moderno tiene problemas
 * con esta estructura).
 */
function blockItemsCompact(items, photoMap) {
  const safeMap = photoMap || {};

  const rows = (items || []).map(it => {
    const productName = String(it.product_name || '');
    const color       = String(it.color || '');
    const cantidad    = Number(it.cantidad || 0);

    // Lookup: misma key que arma admin.js al construir el map
    const key = `${productName}||${color}`;
    const photoUrl = safeMap[key] || null;

    // Foto: si existe la servimos a través de Cloudinary thumb (200w).
    // Si no existe, mostramos un placeholder con la inicial del modelo.
    const photoCell = photoUrl
      ? `<img src="${esc(photoUrl)}" width="80" height="80" alt="${esc(productName)}" style="display:block;width:80px;height:80px;object-fit:cover;border:1px solid #2e2e2e;background:#0f0f0f;">`
      : `<div style="width:80px;height:80px;background:#1a1a1a;border:1px solid #2e2e2e;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-size:32px;font-weight:300;color:#c9a96e;line-height:80px;text-align:center;">${esc(productName.charAt(0).toUpperCase() || 'F')}</div>`;

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2e2e2e;vertical-align:top;width:80px;">
          ${photoCell}
        </td>
        <td style="padding:12px 0 12px 16px;border-bottom:1px solid #2e2e2e;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:14px;color:#f8f8f4;line-height:1.4;margin-bottom:4px;">
            <strong>Founder ${esc(productName)}</strong>
          </div>
          <div style="font-size:11px;color:#9a9a9a;letter-spacing:1px;line-height:1.5;">
            Color: ${esc(color)}<br>
            Cantidad: ${cantidad}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows}
    </table>`;
}

/**
 * Bloque CON foto + CON precios + total. Usado en el email de
 * "Entregado" como comprobante final del ciclo. Combina lo mejor
 * de los dos bloques anteriores: foto del producto a la izquierda,
 * datos al centro, subtotal a la derecha. Al final descuento, envío
 * y total como en blockItems.
 *
 * @param {Array}  items     items del pedido
 * @param {number} total     total del pedido
 * @param {number} envio     costo del envío (0 si retiro/gratis)
 * @param {number} descuento descuento aplicado (0 si no hay)
 * @param {Object} photoMap  diccionario "ProductName||ColorName" → URL
 */
function blockItemsWithPhotos(items, total, envio, descuento, photoMap, opts) {
  const safeMap = photoMap || {};

  // Sesión 37: enriquecer opts con datos para el split exacto (idem blockItems)
  const subtotalCalc = (items || []).reduce((s, it) => {
    return s + (Number(it.cantidad || 0) * Number(it.precio_unitario || 0));
  }, 0);
  const personalizExtraCalc = (items || []).reduce((s, it) => {
    const extra = Number((it.personalizacion && it.personalizacion.extra) || 0);
    return s + (extra * Number(it.cantidad || 0));
  }, 0);
  const optsFull = Object.assign({}, opts || {}, {
    subtotal:        Number(opts && opts.subtotal)        || subtotalCalc,
    personalizExtra: Number(opts && opts.personalizExtra) || personalizExtraCalc,
    envio:           Number(envio) || 0,
    total:           Number(total) || 0,
    // Sesión 39: pasar el desglose dedicado (si vino desde la DB)
    descuentoCupon:         Number(opts && opts.descuentoCupon)         || 0,
    descuentoTransferencia: Number(opts && opts.descuentoTransferencia) || 0,
  });

  const rows = (items || []).map(it => {
    const productName = String(it.product_name || '');
    const color       = String(it.color || '');
    const cantidad    = Number(it.cantidad || 0);
    const precio      = Number(it.precio_unitario || 0);
    // Sesión 36 fix: incluir extra de personalización en el subtotal
    const extra       = Number((it.personalizacion && it.personalizacion.extra) || 0);
    const subtotal    = (precio + extra) * cantidad;

    const key = `${productName}||${color}`;
    const photoUrl = safeMap[key] || null;

    const photoCell = photoUrl
      ? `<img src="${esc(photoUrl)}" width="80" height="80" alt="${esc(productName)}" style="display:block;width:80px;height:80px;object-fit:cover;border:1px solid #2e2e2e;background:#0f0f0f;">`
      : `<div style="width:80px;height:80px;background:#1a1a1a;border:1px solid #2e2e2e;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-size:32px;font-weight:300;color:#c9a96e;line-height:80px;text-align:center;">${esc(productName.charAt(0).toUpperCase() || 'F')}</div>`;

    const grabadoInfo = extra > 0
      ? `<div style="font-size:10px;color:#c9a96e;letter-spacing:1px;line-height:1.5;margin-top:3px;">✦ Grabado láser +$${fmtUYU(extra)}</div>`
      : '';

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2e2e2e;vertical-align:top;width:80px;">
          ${photoCell}
        </td>
        <td style="padding:12px 0 12px 16px;border-bottom:1px solid #2e2e2e;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:14px;color:#f8f8f4;line-height:1.4;margin-bottom:4px;">
            <strong>Founder ${esc(productName)}</strong>
          </div>
          <div style="font-size:11px;color:#9a9a9a;letter-spacing:1px;line-height:1.5;">
            Color: ${esc(color)}<br>
            Cantidad: ${cantidad}
          </div>
          ${grabadoInfo}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #2e2e2e;vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;text-align:right;white-space:nowrap;">
          $${fmtUYU(subtotal)}
        </td>
      </tr>`;
  }).join('');

  // Sesión 36/37: tarjetas verdes con atribución y split exacto.
  // Tabla con 3 columnas (foto+info+precio) → colspan=2 en label.
  const lineDescuento = renderDiscountLines(descuento, optsFull, 2);

  const lineEnvio = `<tr>
       <td colspan="2" style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;">Envío</td>
       <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#f8f8f4;text-align:right;">${Number(envio) > 0 ? '$' + fmtUYU(envio) : 'Gratis'}</td>
     </tr>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows}
      ${lineDescuento}
      ${lineEnvio}
      <tr>
        <td colspan="2" style="padding:18px 0 0 0;font-family:Georgia,serif;font-size:14px;color:#c9a96e;letter-spacing:2px;text-transform:uppercase;">Total</td>
        <td style="padding:18px 0 0 0;font-family:Georgia,serif;font-size:22px;color:#c9a96e;text-align:right;font-weight:600;">$${fmtUYU(total)} UYU</td>
      </tr>
    </table>`;
}

/**
 * Bloque condicional de personalización láser (Sesión 29 — Bloque D).
 *
 * Lee:
 *   - order.personalizacion_extra → INT, monto extra cobrado por grabados
 *   - items[].personalizacion → JSONB con datos del grabado por item
 *
 * Devuelve string vacío si no hay personalización (no rompe templates
 * de pedidos sin grabado — regresión zero).
 *
 * Variantes:
 *   variant === 'cliente' (default):
 *     Tono informativo. Recordatorio del +24 hs hábiles. SIN links de
 *     descarga (las imágenes son privadas, el cliente no las baja del email).
 *
 *   variant === 'admin':
 *     Pensado para emails al taller. NO se usa hoy (no enviamos email
 *     al admin; vos vas al panel). Lo dejamos preparado por si en el
 *     futuro querés notificación al taller automática.
 */
function blockPersonalizacion(order, items, variant = 'cliente') {
  const extra = Number(order?.personalizacion_extra || 0);
  if (!extra && !(items || []).some(it => it && it.personalizacion)) return '';

  // Detalle por item: solo los que tienen grabado
  const itemRows = (items || []).map(it => {
    const p = it && it.personalizacion;
    if (!p || typeof p !== 'object') return '';

    const tags = [];
    if (p.adelante && p.adelante.path) tags.push('🖼️ Adelante');
    if (p.interior && p.interior.path) tags.push('📐 Interior');
    if (p.atras    && p.atras.path)    tags.push('🔖 Atrás');
    if (p.texto)                       tags.push(`✍️ Texto: "${esc(String(p.texto).slice(0, 40))}"`);

    if (!tags.length) return '';

    const indicaciones = p.indicaciones
      ? `<div style="font-size:10px;color:#9a9a9a;margin-top:4px;font-style:italic;">"${esc(String(p.indicaciones).slice(0, 200))}"</div>`
      : '';

    return `
      <div style="padding:10px 0;border-bottom:1px solid #2e2e2e;">
        <div style="font-size:11px;color:#f8f8f4;font-weight:600;margin-bottom:4px;">
          Founder ${esc(it.product_name || '')} — ${esc(it.color || '')}
        </div>
        <div style="font-size:11px;color:#c9a96e;line-height:1.7;">
          ${tags.join(' &nbsp;·&nbsp; ')}
        </div>
        ${indicaciones}
      </div>`;
  }).filter(Boolean).join('');

  if (!itemRows) return '';

  // Wrapper destacado dorado
  const intro = variant === 'admin'
    ? `<strong style="color:#c9a96e;">⚠️ ESTE PEDIDO TIENE PERSONALIZACIÓN LÁSER</strong><br>
       <span style="font-size:10px;color:#9a9a9a;">Recordá: +24 hs hábiles antes de marcar "En preparación".</span>`
    : `<strong style="color:#c9a96e;">✦ Personalización láser</strong><br>
       <span style="font-size:10px;color:#9a9a9a;">Tu pedido incluye grabado láser. Suma +24 hs hábiles al tiempo de preparación.</span>`;

  return `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#1a1a1a;border:1px solid #c9a96e;">
          <tr>
            <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:12px;line-height:1.6;margin-bottom:14px;">
                ${intro}
              </div>
              ${itemRows}
              <div style="font-size:11px;color:#c9a96e;text-align:right;margin-top:12px;font-weight:600;">
                Extra por grabado: $${fmtUYU(extra)} UYU
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
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

    ${blockPersonalizacion(order, items, 'cliente')}

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento, { cuponCodigo: order.cupon_codigo, pago: order.pago, descuentoCupon: order.descuento_cupon, descuentoTransferencia: order.descuento_transferencia })}
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

    ${blockPersonalizacion(order, items, 'cliente')}

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento, { cuponCodigo: order.cupon_codigo, pago: order.pago, descuentoCupon: order.descuento_cupon, descuentoTransferencia: order.descuento_transferencia })}
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

    ${blockPersonalizacion(order, items, 'cliente')}

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          Detalle del pedido
        </div>
        ${blockItems(items, total, envio, descuento, { cuponCodigo: order.cupon_codigo, pago: order.pago, descuentoCupon: order.descuento_cupon, descuentoTransferencia: order.descuento_transferencia })}
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
 * @param {Object} [photoMap] diccionario "ProductName||ColorName" → URL.
 *                            Si no se provee, los items se muestran sin foto
 *                            (con placeholder dorado de inicial).
 * @returns {string} HTML del email, o '' si statusKey no es válido.
 */
export function templateOrderStatusUpdate(order, items, statusKey, photoMap) {
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

  const titleText    = interp(cfg.title);
  const introText    = interp(cfg.intro);
  const nextStepText = esEnvio ? cfg.nextStepEnvio : cfg.nextStepRetiro;

  // Decisión de bloque: en "Entregado" mostramos el bloque con foto +
  // precios + total como comprobante final. En los estados intermedios
  // (Confirmado, En preparación, En camino, Listo para retirar) usamos
  // el bloque compacto: foto + producto, sin precios. Si quiere ver
  // detalle, hace click en "Ver estado del pedido" y entra al seguimiento.
  const showPrices = statusKey === 'Entregado';
  const itemsBlock = showPrices
    ? blockItemsWithPhotos(items, total, envio, descuento, photoMap, { cuponCodigo: order.cupon_codigo, pago: order.pago, descuentoCupon: order.descuento_cupon, descuentoTransferencia: order.descuento_transferencia })
    : blockItemsCompact(items, photoMap);

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

    ${blockPersonalizacion(order, items, 'cliente')}

    <tr>
      <td style="padding:0 32px 32px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:18px;">
          ${showPrices ? 'Detalle del pedido' : 'Tu pedido'}
        </div>
        ${itemsBlock}
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

// ─────────────────────────────────────────────────────────────────
// TEMPLATE: Agradecimiento por reseña + cupón de recompensa
// Sesión 38. Disparado por api/reviews.js cuando un cliente deja reseña.
// ─────────────────────────────────────────────────────────────────
/**
 * Renderiza el email "gracias por tu reseña".
 *
 * @param {Object} order  pedido (numero, nombre).
 * @param {Object} review { rating, texto, rewardCoupon }
 *                        rewardCoupon = null | { codigo, tipo, valor }
 * @returns {string} HTML del email
 */
export function templateReviewThankYou(order, review) {
  const numero = esc(order.numero || '');
  const nombre = esc(order.nombre || 'cliente');
  const rating = parseInt(review?.rating, 10) || 5;

  // Estrellas en dorado para el ranking
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  // Bloque del cupón (puede no existir si el dueño no tiene cupón configurado)
  const reward = review?.rewardCoupon;
  let rewardBlock = '';
  if (reward && reward.codigo) {
    const valorTxt = reward.tipo === 'porcentaje'
      ? `${reward.valor}% de descuento`
      : `$${reward.valor} de descuento`;

    rewardBlock = `
<tr><td style="padding:0 32px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.35);">
    <tr><td style="padding:24px 24px 20px;text-align:center;">
      <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#c9a96e;margin-bottom:8px;">
        ✨ Tu recompensa
      </div>
      <div style="font-family:Georgia,serif;font-size:22px;color:#f8f8f4;margin-bottom:14px;font-weight:300;">
        Acá tenés tu cupón
      </div>
      <div style="font-family:'Courier New',monospace;font-size:24px;letter-spacing:4px;
                  color:#c9a96e;background:#0a0a0a;border:1px dashed #c9a96e;
                  padding:14px 20px;display:inline-block;margin-bottom:14px;font-weight:700;">
        ${esc(reward.codigo)}
      </div>
      <div style="font-size:13px;color:#bdbdbd;line-height:1.6;">
        ${esc(valorTxt)} en tu próxima compra.<br>
        Usalo al hacer el checkout en <a href="https://www.founder.uy"
          style="color:#c9a96e;text-decoration:underline;">founder.uy</a>.
      </div>
    </td></tr>
  </table>
</td></tr>`;
  }

  const inner = `
<tr><td style="padding:36px 32px 8px;text-align:center;">
  <div style="font-size:9px;letter-spacing:5px;text-transform:uppercase;color:#c9a96e;margin-bottom:14px;">
    💛 ¡Gracias!
  </div>
  <div style="font-family:Georgia,serif;font-size:26px;color:#f8f8f4;font-weight:300;line-height:1.4;">
    ¡Gracias por tu reseña, ${nombre}!
  </div>
</td></tr>

<tr><td style="padding:0 32px 24px;text-align:center;">
  <div style="font-size:24px;letter-spacing:6px;color:#c9a96e;margin-bottom:10px;">
    ${stars}
  </div>
  <div style="font-size:13px;color:#bdbdbd;line-height:1.7;max-width:480px;margin:0 auto;">
    Recibimos tu reseña del pedido <strong style="color:#c9a96e;">#${numero}</strong>.
    Antes de publicarla, la revisamos para mantener un espacio confiable para
    todos. Suele tardar menos de 24 horas.
  </div>
</td></tr>

${rewardBlock}

<tr><td style="padding:0 32px 36px;text-align:center;">
  <div style="font-size:12px;color:#9a9a9a;line-height:1.7;">
    Si tenés cualquier consulta, escribinos por
    <a href="https://wa.me/598098550096" style="color:#c9a96e;text-decoration:underline;">WhatsApp</a>.
  </div>
</td></tr>

${blockFooter()}`;

  return wrapEmail(inner, '¡Gracias por dejar tu reseña en Founder!');
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 6: ALERTA AL ADMIN — pedido con grabado láser (Sesión 40)
// ─────────────────────────────────────────────────────────────────
/**
 * Email interno al admin notificando que entró un pedido con
 * personalización láser y hay que preparar el grabado.
 *
 * Diferencia clave con los otros templates: este NO va al cliente,
 * va al dueño del negocio. El tono es operativo, no comercial:
 *   • Sin "¡Gracias por tu compra!" — vos sos el dueño, ya sabés.
 *   • Sin CTAs de WhatsApp ni redes sociales (footer minimalista).
 *   • Sí incluye datos de contacto del cliente por si necesitás
 *     consultarle algo del diseño (ej. textos ambiguos).
 *   • Sí incluye el bloque de personalización con variant='admin'
 *     (el que ya existía pero nunca se usaba — ahora sí).
 *   • Sí incluye link directo al panel admin para ver la orden.
 *
 * Se dispara desde:
 *   • api/checkout.js cuando entra pedido por TRANSFERENCIA con grabado.
 *   • api/mp-webhook.js cuando MP APRUEBA o deja PENDIENTE un pedido
 *     con grabado (no cuando se crea la preferencia, porque puede
 *     caer si el pago se rechaza).
 *
 * Idempotencia: el caller debe asegurarse de no llamar dos veces
 * para el mismo pedido. Hoy se logra naturalmente porque
 * mp-webhook solo dispara eventos en `esTransicionNueva === true`.
 */
export function templateAdminPersonalizacionAlert(order, items) {
  const numero    = esc(order.numero || '');
  const nombre    = esc(order.nombre || '');
  const apellido  = esc(order.apellido || '');
  const email     = esc(order.email || '');
  const celular   = esc(order.celular || '');
  const pago      = esc(order.pago || '');
  const entrega   = esc(order.entrega || '');
  const direccion = esc(order.direccion || '');
  const extra     = Number(order.personalizacion_extra || 0);
  const total     = Number(order.total || 0);

  // El admin entra al panel autenticándose; el link es informativo.
  const adminLink = 'https://www.founder.uy/admin.html';

  // Bloque de info del cliente (compacto, todo lo accionable)
  const blockCliente = `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="border-collapse:collapse;background:#1a1a1a;border:1px solid #2e2e2e;">
          <tr>
            <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:10px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;margin-bottom:14px;">
                👤 Cliente
              </div>
              <div style="font-size:13px;color:#f8f8f4;line-height:1.8;">
                <strong>${nombre} ${apellido}</strong><br>
                📧 <a href="mailto:${email}" style="color:#c9a96e;text-decoration:none;">${email}</a><br>
                📱 ${celular || '—'}<br>
                ${entrega ? `🚚 ${entrega}${direccion ? ` — ${direccion}` : ''}<br>` : ''}
                💳 ${pago}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  // Resumen financiero compacto (sin desglose de descuentos — al admin
  // le importa el grabado, no la contabilidad: para eso está el panel)
  const blockResumen = `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="border-collapse:collapse;background:#1a1a1a;border:1px solid #2e2e2e;">
          <tr>
            <td style="padding:14px 20px;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:11px;color:#9a9a9a;line-height:1.8;">
                Extra por grabado: <strong style="color:#c9a96e;">$${fmtUYU(extra)} UYU</strong><br>
                Total del pedido: <strong style="color:#f8f8f4;">$${fmtUYU(total)} UYU</strong>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  const inner = `
    ${blockHeader()}

    <tr>
      <td style="padding:32px 32px 8px 32px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;margin-bottom:14px;">
          ⚡ Aviso interno · Taller
        </div>
        <div style="font-family:Georgia,serif;font-size:24px;font-weight:300;color:#f8f8f4;line-height:1.3;">
          Nuevo pedido con grabado láser
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9a9a;margin-top:10px;">
          Pedido <strong style="color:#f8f8f4;">#${numero}</strong>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 8px 32px;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#f8f8f4;line-height:1.7;margin:0;">
          Entró un pedido con personalización láser. Acordate de descargar
          los archivos desde el panel admin antes de empezar la producción.
        </p>
      </td>
    </tr>

    ${blockPersonalizacion(order, items, 'admin')}

    ${blockCliente}

    ${blockResumen}

    <tr>
      <td style="padding:0 32px 36px 32px;text-align:center;">
        <a href="${adminLink}"
           style="display:inline-block;background:#c9a96e;color:#141414;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">
          Abrir panel admin
        </a>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a9a9a;line-height:1.6;margin-top:14px;">
          Buscá el pedido <strong style="color:#c9a96e;">#${numero}</strong> en la sección Personalización Láser.
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 24px 32px;text-align:center;border-top:1px solid #2e2e2e;background:#0f0f0f;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a9a9a;letter-spacing:2px;text-transform:uppercase;">
          Aviso automático · Founder
        </div>
      </td>
    </tr>
  `;

  return wrapEmail(inner, `Nuevo pedido con grabado: #${numero}`);
}
