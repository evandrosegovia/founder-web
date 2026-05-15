/* =============================================================
   FOUNDER — Componente compartido: FOOTER + MODALES LEGALES + BURBUJA WA
   -------------------------------------------------------------
   Inyecta el footer del sitio, los modales de Privacidad / Términos /
   Devoluciones, y la burbuja flotante de WhatsApp.

   Cómo usar en cada página HTML:
   ------------------------------
     <div id="site-footer"></div>
     <script src="components/footer.js"></script>

   Cómo editar el contenido de un modal legal:
   -------------------------------------------
     Buscar las constantes LEGAL_PRIVACY / LEGAL_TERMS / LEGAL_RETURNS
     abajo y editar el texto. Se refleja en las 7 páginas.

   Provee las funciones globales:
     - showLegal('privacy' | 'terms' | 'returns')
     - hideLegal('privacy' | 'terms' | 'returns')
   ============================================================= */
(function () {
  'use strict';

  // ── CONFIG: links del footer (única fuente de verdad) ──────
  const FOOTER_PRODUCTS = [
    { href: 'producto.html?p=Simple',    label: 'Simple' },
    { href: 'producto.html?p=Classic',   label: 'Classic' },
    { href: 'producto.html?p=Confort',   label: 'Confort' },
    { href: 'producto.html?p=Essential', label: 'Essential' }
  ];

  const FOOTER_INFO = [
    { href: 'tecnologia-rfid.html', label: 'Tecnología RFID' },
    { href: 'envios.html',          label: 'Envíos y Devoluciones' },
    { href: 'seguimiento.html',     label: 'Seguimiento' },
    { href: 'sobre-nosotros.html',  label: 'Sobre nosotros' },
    { href: 'contacto.html',        label: 'Contacto' }
  ];

  // ── CONFIG: medios de pago (Sesión 44) ─────────────────────
  // Orden visual del array = orden en pantalla. Cada entrada tiene un
  // `id` que se usa para construir los paths a las imágenes:
  //   assets/payments/{id}_gray.png  → estado normal (gris sutil)
  //   assets/payments/{id}_color.png → estado hover (a color)
  // El switch entre versiones se hace via CSS (opacity + transition).
  // Para agregar / quitar / reordenar: editar este array.
  // Todos los archivos son 200x64 px, PNG con transparencia.
  const FOOTER_PAYMENTS = [
    { id: 'mastercard',     alt: 'Mastercard' },
    { id: 'visa',           alt: 'VISA' },
    { id: 'mercadopago',    alt: 'Mercado Pago' },
    { id: 'oca',            alt: 'OCA' },
    { id: 'prex',           alt: 'Prex' },
    { id: 'redpagos',       alt: 'Redpagos' },
    { id: 'abitab',         alt: 'Abitab' },
    { id: 'lider',          alt: 'Líder' },
    { id: 'ues',            alt: 'UES' },
    { id: 'dac',            alt: 'DAC' },
    { id: 'itau',           alt: 'Itaú' },
    { id: 'bancorepublica', alt: 'Banco República' },
    { id: 'bbva',           alt: 'BBVA' },
    { id: 'santander',      alt: 'Santander' }
  ];

  // ── CONTENIDO LEGAL (editable) ─────────────────────────────
  const LEGAL_PRIVACY = `
    <h1>Política de Privacidad</h1><p class="legal-date">Vigente desde: Enero 2026</p>
    <h2>1. Responsable</h2><p>Founder.uy, con contacto vía Instagram @founder.uy</p>
    <h2>2. Datos recabados</h2><p>Nombre, apellido, celular, email y dirección de entrega proporcionados al realizar una compra.</p>
    <h2>3. Base legal</h2><p>Ley N° 18.331 de Protección de Datos Personales y acción de Habeas Data de la República Oriental del Uruguay.</p>
    <h2>4. Finalidad</h2><p>Tus datos se usan exclusivamente para procesar tu pedido, gestionar el envío y cumplir obligaciones legales.</p>
    <h2>5. Consentimiento</h2><p>Al completar el formulario de compra y aceptar esta política, otorgás tu consentimiento libre e informado conforme al artículo 9 de la Ley N° 18.331.</p>
    <h2>6. Seguridad</h2><p>Implementamos medidas técnicas y organizativas adecuadas para proteger tus datos contra accesos no autorizados.</p>
    <h2>7. Tus derechos</h2><p>Tenés derecho a acceso, rectificación, supresión e impugnación de tus datos. Contactanos por Instagram @founder.uy.</p>
  `;

  const LEGAL_TERMS = `
    <h1>Términos y Condiciones</h1><p class="legal-date">Vigente desde: Enero 2026</p>
    <h2>1. Aceptación</h2><p>Al realizar una compra en Founder.uy, aceptás estos Términos y Condiciones en su totalidad.</p>
    <h2>2. Productos</h2><p>Todos los productos incluyen tecnología RFID y están fabricados con eco cuero y aluminio de alta calidad.</p>
    <h2>3. Precios</h2><p>Los precios están expresados en Pesos Uruguayos (UYU). Se aplica el precio vigente al momento de confirmar el pedido.</p>
    <h2>4. Descuentos</h2><p>Se aplica un descuento del 10% para pagos por transferencia bancaria. No acumulable con otras promociones.</p>
    <h2>5. Envíos</h2><p>Enviamos a todo el territorio uruguayo vía agencia UES. Envío gratis en compras desde $2.000 UYU.</p>
    <h2>6. Jurisdicción</h2><p>Ante cualquier controversia, las partes se someten a la jurisdicción de los Tribunales de la República Oriental del Uruguay.</p>
  `;

  const LEGAL_RETURNS = `
    <h1>Cambios y Devoluciones</h1><p class="legal-date">Vigente desde: Enero 2026</p>
    <h2>Política de cambios</h2><p>Aceptamos cambios y devoluciones dentro de los 7 días corridos de recibido el producto, siempre que se encuentre sin uso, en su estado original y con comprobante de compra.</p>
    <h2>Garantía de fábrica</h2><p>Todos nuestros productos cuentan con garantía de 60 días corridos desde la recepción, contra defectos de fabricación. La garantía no cubre daños por mal uso, desgaste por uso normal o accidentes. En caso de defecto de fábrica, gestionamos el cambio o reintegro sin costo.</p>
    <h2>Cómo solicitar un cambio</h2><p>Contactanos por WhatsApp o Instagram @founder.uy indicando tu número de pedido y el motivo. Respondemos en 48 horas hábiles.</p>
  `;

  // ── Genera markup del footer ───────────────────────────────
  function buildFooter() {
    const productLinks = FOOTER_PRODUCTS.map(l =>
      `<li><a href="${l.href}">${l.label}</a></li>`
    ).join('');

    const infoLinks = FOOTER_INFO.map(l =>
      `<li><a href="${l.href}">${l.label}</a></li>`
    ).join('');

    // Sesión 44: logos de medios de pago. Cada uno tiene dos imágenes
    // superpuestas (gris + color). Por defecto se ve la gris; al hacer
    // hover/tap, el CSS revela la versión a color con una transición.
    // El onerror oculta el contenedor entero si falta el archivo, así
    // no se ve un ícono roto si falta alguno en producción.
    const paymentLogos = FOOTER_PAYMENTS.map(p =>
      `<span class="footer__pay-item" title="${p.alt}">
        <img class="footer__pay-img footer__pay-img--gray"
             src="assets/payments/${p.id}_gray.png"
             alt="${p.alt}"
             loading="lazy"
             onerror="this.parentNode.style.display='none'">
        <img class="footer__pay-img footer__pay-img--color"
             src="assets/payments/${p.id}_color.png"
             alt=""
             aria-hidden="true"
             loading="lazy">
      </span>`
    ).join('');

    return `
<!-- ── FOOTER ──────────────────────────────────────────────── -->
<footer class="footer" role="contentinfo">
  <!-- DESKTOP / TABLET: grilla completa + bottom bar -->
  <div class="footer__grid">
    <div class="footer__brand">
      <a href="index.html" class="logo" aria-label="Founder - Inicio">FOUNDER</a>
      <p>Billeteras y tarjeteros premium con tecnología RFID. Diseñados para quienes cuidan cada detalle. Enviamos a todo Uruguay.</p>
    </div>
    <div class="footer__col"><h4>Productos</h4><ul>${productLinks}</ul></div>
    <div class="footer__col"><h4>Info</h4><ul>${infoLinks}</ul></div>
    <div class="footer__col"><h4>Legal</h4><ul>
      <li><a href="#" onclick="showLegal('privacy');return false">Política de Privacidad</a></li>
      <li><a href="#" onclick="showLegal('terms');return false">Términos y Condiciones</a></li>
      <li><a href="#" onclick="showLegal('returns');return false">Cambios y Devoluciones</a></li>
    </ul></div>
  </div>
  <div class="footer__bottom">
    <!-- Sesión 44: medios de pago (Ubicación B + Estilo 3 con hover a color) -->
    <div class="footer__payments" aria-label="Medios de pago aceptados">
      ${paymentLogos}
    </div>
    <!-- Sesión 44: copyright + links legales en una línea separada DEBAJO de los logos -->
    <div class="footer__bottom-info">
      <p class="footer__copy">© 2026 Founder.uy — Todos los derechos reservados</p>
      <div class="footer__legal">
        <a href="#" onclick="showLegal('privacy');return false">Privacidad</a>
        <a href="#" onclick="showLegal('terms');return false">Términos</a>
        <a href="#" onclick="showLegal('returns');return false">Devoluciones</a>
      </div>
    </div>
  </div>
  <!-- MOBILE: versión minimalista (logo + 4 links inline + copyright).
       Oculto en desktop via CSS. El menú hamburguesa provee navegación completa. -->
  <div class="footer__mobile">
    <a href="index.html" class="footer__mobile-logo" aria-label="Founder - Inicio">FOUNDER</a>
    <div class="footer__mobile-links">
      <a href="contacto.html">Contacto</a>
      <span class="footer__mobile-sep">·</span>
      <a href="https://wa.me/598098550096" target="_blank" rel="noopener">WhatsApp</a>
      <span class="footer__mobile-sep">·</span>
      <a href="#" onclick="showLegal('privacy');return false">Privacidad</a>
      <span class="footer__mobile-sep">·</span>
      <a href="#" onclick="showLegal('terms');return false">Términos</a>
    </div>
    <!-- Sesión 44: medios de pago en mobile (versión compacta) -->
    <div class="footer__payments footer__payments--mobile" aria-label="Medios de pago aceptados">
      ${paymentLogos}
    </div>
    <p class="footer__mobile-copy">© 2026 Founder.uy</p>
  </div>
</footer>

<!-- ── MODALES LEGALES ─────────────────────────────────────── -->
<div class="legal-page" id="legalPrivacy" role="dialog" aria-modal="true">
  <button class="legal-close" onclick="hideLegal('privacy')">✕ Cerrar</button>
  <div class="legal-content">${LEGAL_PRIVACY}</div>
</div>
<div class="legal-page" id="legalTerms" role="dialog" aria-modal="true">
  <button class="legal-close" onclick="hideLegal('terms')">✕ Cerrar</button>
  <div class="legal-content">${LEGAL_TERMS}</div>
</div>
<div class="legal-page" id="legalReturns" role="dialog" aria-modal="true">
  <button class="legal-close" onclick="hideLegal('returns')">✕ Cerrar</button>
  <div class="legal-content">${LEGAL_RETURNS}</div>
</div>

<!-- ── BURBUJA WHATSAPP GLOBAL ─────────────────────────────── -->
<a class="wa-bubble" href="https://wa.me/598098550096" target="_blank" rel="noopener" aria-label="Contactar por WhatsApp">
  <span class="wa-bubble__tooltip">¿Necesitás ayuda?</span>
  <span class="wa-bubble__btn">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  </span>
</a>
`.trim();
  }

  // ── Funciones globales para abrir/cerrar modales legales ──
  // Se definen en window para que los onclick inline las puedan llamar.
  const LEGAL_IDS = { privacy: 'legalPrivacy', terms: 'legalTerms', returns: 'legalReturns' };

  window.showLegal = function (key) {
    const el = document.getElementById(LEGAL_IDS[key]);
    if (el) {
      el.classList.add('is-active');
      document.body.style.overflow = 'hidden';
    }
  };

  window.hideLegal = function (key) {
    const el = document.getElementById(LEGAL_IDS[key]);
    if (el) {
      el.classList.remove('is-active');
      document.body.style.overflow = '';
    }
  };

  // ── CSS autocontenido del componente ──────────────────────
  // Inyecta los estilos de la burbuja WhatsApp y los modales legales.
  // Necesario porque las 5 páginas secundarias (contacto, envios, etc.)
  // no tenían estos estilos antes — ahora los reciben automáticamente.
  // Usa las variables CSS globales (--color-bg, --color-gold, etc.) que
  // sí están definidas en el :root de cada página.
  const COMPONENT_CSS = `
/* ── FOOTER MOBILE MINIMALISTA (Opción C) ─────────────────────
   En mobile (<600px) se oculta la grilla completa y se muestra
   una versión compacta: logo + 4 links inline + copyright.
   El menú hamburguesa provee la navegación completa. */
.footer__mobile { display: none; }
@media (max-width: 600px) {
  .footer__grid,
  .footer__bottom { display: none; }
  .footer__mobile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 8px 0;
    text-align: center;
  }
  .footer__mobile-logo {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 6px;
    color: var(--color-text);
    text-decoration: none;
  }
  .footer__mobile-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 8px 10px;
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .footer__mobile-links a {
    color: var(--color-muted);
    text-decoration: none;
    transition: color var(--transition-fast, 0.2s ease);
  }
  .footer__mobile-links a:hover,
  .footer__mobile-links a:active { color: var(--color-text); }
  .footer__mobile-sep {
    color: var(--color-gold);
    font-size: 12px;
    line-height: 1;
  }
  .footer__mobile-copy {
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--color-muted);
    margin: 0;
  }
}

/* ── PÁGINAS LEGALES (modales) ─────────────────────────────── */
.legal-page { position: fixed; inset: 0; background: var(--color-bg); z-index: 400; overflow-y: auto; display: none; padding: 100px 48px 60px; }
.legal-page.is-active { display: block; }
.legal-close { position: fixed; top: 24px; right: 48px; background: var(--color-surface2); border: none; color: var(--color-text); padding: 10px 20px; font-family: var(--font-sans); font-size: 10px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; z-index: 10; transition: background .2s ease; }
.legal-close:hover { background: var(--color-surface3); }
.legal-content { max-width: 720px; margin: 0 auto; }
.legal-content h1 { font-family: var(--font-serif); font-size: 48px; font-weight: 300; margin-bottom: 8px; }
.legal-date { font-size: 10px; color: var(--color-muted); letter-spacing: 2px; margin-bottom: 48px; }
.legal-content h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 400; color: var(--color-gold); margin: 32px 0 12px; }
.legal-content p, .legal-content li { font-size: 14px; line-height: 1.95; color: var(--color-muted); }
.legal-content ul { padding-left: 20px; }
@media (max-width: 600px) {
  .legal-page { padding: 100px 24px 60px; }
  .legal-close { right: 24px; }
  .legal-content h1 { font-size: 36px; }
}

/* ── BURBUJA WHATSAPP GLOBAL ─────────────────────────────── */
.wa-bubble {
  position: fixed; bottom: 28px; right: 28px; z-index: 9000;
  display: flex; align-items: center; gap: 10px; text-decoration: none;
  transition: transform 0.5s cubic-bezier(.4,0,.2,1), opacity 0.3s ease;
}
.wa-bubble__tooltip {
  background: var(--color-surface); color: var(--color-text);
  font-family: var(--font-sans); font-size: 11px; letter-spacing: 0.05em;
  padding: 8px 14px; border-radius: 4px; border: 1px solid var(--color-border);
  white-space: nowrap; opacity: 0; transform: translateX(8px);
  transition: opacity 0.25s ease, transform 0.25s ease; pointer-events: none;
}
.wa-bubble:hover .wa-bubble__tooltip { opacity: 1; transform: translateX(0); }
.wa-bubble__btn {
  width: 56px; height: 56px; border-radius: 50%; background: #25D366;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(37,211,102,0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease; flex-shrink: 0;
}
.wa-bubble:hover .wa-bubble__btn { transform: scale(1.08); box-shadow: 0 6px 22px rgba(37,211,102,0.5); }
.wa-bubble__btn svg { width: 28px; height: 28px; fill: #ffffff; }
@media (max-width: 600px) {
  .wa-bubble { bottom: 20px; right: 16px; }
  .wa-bubble__tooltip { display: none; }
}
body.cart-open .wa-bubble { transform: translateX(-440px); }
@media (max-width: 900px) {
  body.cart-open .wa-bubble { transform: none; opacity: 0; pointer-events: none; }
}

/* ── MEDIOS DE PAGO (Sesión 44) ──────────────────────────────
   Fila de logos en el bottom del footer. Cada logo tiene 2 imágenes
   superpuestas: la gris (visible por defecto) y la color (visible
   al hover/tap). La transición es un cross-fade suave. Las imágenes
   color están con position:absolute para perfecto overlap.
   Layout: 2 filas centradas con flex + wrap. El ancho/gap está
   calculado para que entren 7 logos por fila en desktop ≥900px.
   Todos los PNGs son 200x64 px (ratio 3.125:1). */

/* Sesión 44: override del footer__bottom para layout vertical EN DESKTOP.
   IMPORTANTE: estas reglas están envueltas en @media (min-width: 601px)
   para NO anular el 'display: none' que aplica el media query mobile
   de cada página HTML. Sin este wrap, el footer__bottom se mostraba
   también en mobile, duplicando el footer (bug Sesión 44 refinamiento). */
@media (min-width: 601px) {
  .footer__bottom {
    display: block;
    text-align: center;
  }
  .footer__bottom-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 24px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
    font-size: 10px;
    color: var(--color-muted);
    letter-spacing: 1px;
  }
  .footer__copy {
    margin: 0;
    text-align: left;
  }
}

/* Sesión 44: achicar la separación entre la grilla del footer
   (FOUNDER / Productos / Info / Legal) y la fila de logos.
   También envuelto en min-width para no interferir con mobile. */
@media (min-width: 601px) {
  .footer__grid {
    margin-bottom: 28px !important;
  }
}

.footer__payments {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Sesión 44 (refinamiento): gap más compacto con los nuevos logos
     más densos (ratio 125:64). Vertical 14px, horizontal 16px. */
  gap: 14px 16px;
  flex-wrap: wrap;
  width: 100%;
  padding: 0 0 22px;
  margin-bottom: 0;
  /* Sin border-bottom: el separador ahora lo da footer__bottom-info */
}
.footer__pay-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Logos más grandes y proporcionales al nuevo ratio 125:64 (~1.95).
     38px alto → 38 × 1.95 = ~74px ancho. */
  height: 38px;
  width: 74px;
  flex: 0 0 74px;
  transition: transform 0.25s ease;
}
.footer__pay-item:hover,
.footer__pay-item:active,
.footer__pay-item:focus {
  transform: scale(1.08);
}
.footer__pay-img {
  height: 100%;
  width: 100%;
  object-fit: contain;
  display: block;
  transition: opacity 0.25s ease;
}
/* La versión a color se posiciona encima de la gris, invisible por defecto */
.footer__pay-img--color {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  pointer-events: none;
}
/* Al hacer hover/tap, fade in de la color, fade out de la gris */
.footer__pay-item:hover .footer__pay-img--color,
.footer__pay-item:active .footer__pay-img--color,
.footer__pay-item:focus .footer__pay-img--color {
  opacity: 1;
}
.footer__pay-item:hover .footer__pay-img--gray,
.footer__pay-item:active .footer__pay-img--gray,
.footer__pay-item:focus .footer__pay-img--gray {
  opacity: 0;
}

/* Tablet (≤900px): el footer__bottom-info se apila vertical */
@media (max-width: 900px) {
  .footer__bottom-info {
    flex-direction: column;
    gap: 14px;
  }
  .footer__copy {
    text-align: center;
  }
}

/* Versión mobile (<600px): logos más chicos pero levemente más grandes
   que antes para mejor legibilidad. */
.footer__payments--mobile {
  gap: 12px 18px;
  padding: 14px 0 14px;
  margin-top: 4px;
  margin-bottom: 4px;
  border-top: 1px solid var(--color-border);
  border-bottom: none;
}
.footer__payments--mobile .footer__pay-item {
  /* Sesión 44 (refinamiento): un punto más grande que antes,
     y proporcional al nuevo ratio 125:64. */
  height: 28px;
  width: 55px;
  flex: 0 0 55px;
}
`;

  // Inyecta el CSS una sola vez (idempotente).
  function injectCSS() {
    if (document.getElementById('founder-footer-css')) return;
    const style = document.createElement('style');
    style.id = 'founder-footer-css';
    style.textContent = COMPONENT_CSS;
    document.head.appendChild(style);
  }

  // ── Render: inyecta el markup en <div id="site-footer"></div> ──
  function render() {
    const mount = document.getElementById('site-footer');
    if (!mount) {
      console.warn('[footer.js] No se encontró <div id="site-footer"></div> en la página');
      return;
    }
    injectCSS();
    mount.outerHTML = buildFooter();
  }

  render();
})();
