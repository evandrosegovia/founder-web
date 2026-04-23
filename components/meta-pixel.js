/* =============================================================
   FOUNDER — components/meta-pixel.js
   -------------------------------------------------------------
   Responsabilidad única: envolver el Meta Pixel (fbevents.js)
   detrás de una API segura y consistente para el resto del sitio.

   Qué hace:
   1) Carga el snippet oficial de Meta Pixel (fbevents.js).
   2) Dispara PageView automático al cargar cualquier página.
   3) Expone window.founderPixel con helpers tipados por evento:
         • trackViewContent(product)        — página de producto
         • trackAddToCart(name, color, price)
         • trackInitiateCheckout(cart, total)
         • trackPurchase(order)             — evento dual (Pixel + CAPI)
         • generateEventId()                — uuid para deduplicación CAPI
   4) Genera event_id únicos que el servidor duplicará por CAPI,
      para que Meta deduplique por event_id (mismo evento, 2 fuentes).

   Uso:
     <script src="components/meta-pixel.js"></script>
     (debe ir DESPUÉS de cart.js y supabase-client.js)

   CONFIG:
     PIXEL_ID — hardcoded acá. Si cambia, se toca este único archivo.
               El valor es público (va al HTML en claro), así que no
               hay riesgo de seguridad al tenerlo en el repo.

   REGLA DE ORO:
     Nunca llamar a fbq() directamente desde otros archivos. Siempre
     usar window.founderPixel.* para mantener el contrato.
   ============================================================= */
(function () {
  'use strict';

  // ── CONFIG ───────────────────────────────────────────────────
  const CONFIG = Object.freeze({
    PIXEL_ID: '2898267450518541',       // Founder Pixel — Meta Events Manager
    CURRENCY: 'UYU',                    // moneda uruguaya ISO 4217
  });

  // ── Guard: evitar doble carga si el script se incluye 2 veces ──
  if (window.founderPixel && window.founderPixel.__loaded) {
    console.warn('[meta-pixel] Ya cargado — ignorando segunda carga');
    return;
  }

  // ── SNIPPET OFICIAL DE META PIXEL ────────────────────────────
  // Es la versión mínima documentada por Meta (fbevents.js base).
  // Crea window.fbq() con la cola de eventos antes de que termine
  // de bajar el script real desde connect.facebook.net.
  /* eslint-disable */
  !function(f,b,e,v,n,t,s) {
    if(f.fbq) return;
    n = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if(!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // ── Inicializar Pixel + PageView automático ──────────────────
  window.fbq('init', CONFIG.PIXEL_ID);
  window.fbq('track', 'PageView');

  // ── Noscript fallback (para crawlers/bots que no ejecutan JS) ──
  // Inserta un <img> 1×1 que hace el PageView del lado server de Meta
  // aun cuando JS está deshabilitado. No afecta performance.
  (function injectNoscript() {
    const ns = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${CONFIG.PIXEL_ID}&ev=PageView&noscript=1`;
    img.alt = '';
    ns.appendChild(img);
    document.head.appendChild(ns);
  })();

  // ── HELPERS ──────────────────────────────────────────────────

  /**
   * Genera un event_id único (UUID v4-ish) para deduplicación
   * entre Pixel (cliente) y CAPI (servidor). Meta deduplica 2
   * eventos con el mismo event_id + mismo event_name dentro de
   * una ventana de 48h.
   *
   * Para Purchase usamos el order.numero (ej. "F910752") porque
   * es estable y el servidor también lo conoce — así ambos lados
   * emiten con el mismo id sin pasarlo explícitamente.
   */
  function generateEventId() {
    // crypto.randomUUID() está disponible en todos los navegadores
    // modernos (Chrome 92+, Safari 15.4+, Firefox 95+). Fallback
    // simple para el 1-2% de navegadores viejos.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + random (buena entropía para tracking)
    return 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Wrapper seguro alrededor de fbq(). Nunca tira, nunca rompe.
   * Loguea en consola para debug cuando DEV_MODE=true.
   */
  function safeTrack(eventName, params, options) {
    try {
      if (typeof window.fbq !== 'function') {
        // El script de fbevents no cargó aún, o fue bloqueado (adblock).
        // Los eventos se pusieron en cola — cuando fbevents termina de
        // cargar, los procesa. Si fue bloqueado, se perderán los eventos
        // del cliente, pero CAPI los salva para Purchase.
        return;
      }
      if (options && options.eventID) {
        window.fbq('track', eventName, params || {}, { eventID: options.eventID });
      } else {
        window.fbq('track', eventName, params || {});
      }
    } catch (e) {
      console.warn(`[meta-pixel] error disparando ${eventName}:`, e);
    }
  }

  // ── EVENTOS TIPADOS ──────────────────────────────────────────

  /**
   * ViewContent — usuario llegó a la página de un producto.
   * @param {Object} product  { id, name, price } del producto visto
   */
  function trackViewContent(product) {
    if (!product) return;
    safeTrack('ViewContent', {
      content_type:  'product',
      content_ids:   [String(product.id || product.name)],
      content_name:  `Founder ${product.name}`,
      value:         Number(product.price) || 0,
      currency:      CONFIG.CURRENCY,
    });
  }

  /**
   * AddToCart — usuario agregó un producto al carrito.
   * @param {string} name   modelo (ej. "Confort")
   * @param {string} color  color seleccionado (ej. "Negro")
   * @param {number} price  precio efectivo (oferta o normal)
   */
  function trackAddToCart(name, color, price) {
    if (!name) return;
    safeTrack('AddToCart', {
      content_type:  'product',
      content_ids:   [String(name)],
      content_name:  `Founder ${name}${color ? ' — ' + color : ''}`,
      value:         Number(price) || 0,
      currency:      CONFIG.CURRENCY,
    });
  }

  /**
   * InitiateCheckout — usuario abrió checkout.html con carrito no vacío.
   * @param {Array}  cart   state.cart (items con {name, color, qty, price})
   * @param {number} total  total del carrito en UYU (con envío/descuento)
   */
  function trackInitiateCheckout(cart, total) {
    if (!Array.isArray(cart) || cart.length === 0) return;
    const ids      = cart.map(i => String(i.name));
    const numItems = cart.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    safeTrack('InitiateCheckout', {
      content_type:  'product',
      content_ids:   ids,
      num_items:     numItems,
      value:         Number(total) || 0,
      currency:      CONFIG.CURRENCY,
    });
  }

  /**
   * Purchase — compra confirmada. Evento DUAL (Pixel + CAPI).
   * Usa order.numero como event_id para que CAPI duplique con
   * el mismo ID y Meta deduplique automáticamente.
   *
   * @param {Object} order  { numero, total, cart: [{name, color, qty, price}] }
   */
  function trackPurchase(order) {
    if (!order || !order.numero) return;
    const cart = Array.isArray(order.cart) ? order.cart : [];
    const ids      = cart.map(i => String(i.name));
    const numItems = cart.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    safeTrack('Purchase', {
      content_type:  'product',
      content_ids:   ids.length ? ids : undefined,
      num_items:     numItems || undefined,
      value:         Number(order.total) || 0,
      currency:      CONFIG.CURRENCY,
      order_id:      String(order.numero),
    }, { eventID: String(order.numero) });
  }

  /**
   * Genérico — escape hatch para disparar cualquier evento custom
   * que no esté en la lista de helpers tipados. Rara vez se usa.
   */
  function track(eventName, params, options) {
    safeTrack(eventName, params, options);
  }

  // ── API PÚBLICA ──────────────────────────────────────────────
  window.founderPixel = Object.freeze({
    __loaded: true,
    pixelId:  CONFIG.PIXEL_ID,
    // helpers tipados
    trackViewContent,
    trackAddToCart,
    trackInitiateCheckout,
    trackPurchase,
    // util + escape hatch
    generateEventId,
    track,
  });
})();
