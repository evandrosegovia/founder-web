/* =============================================================
   FOUNDER — components/founder-checkout.js
   -------------------------------------------------------------
   Lógica del flujo de checkout.

   Qué hace:
     • fetchCupon()   → valida cupones contra /api/checkout
                        (action:"validate_coupon").
     • processOrder() → crea el pedido en /api/checkout
                        (action:"create_order"). La persistencia
                        es transaccional en Supabase.
     • Mantiene la UX completa: textos, WhatsApp, flujos,
       validaciones, pantalla de confirmación.

   Precondiciones:
     - Cargado DESPUÉS de components/supabase-client.js y cart.js.
     - El DOM de checkout.html ya debe estar presente (se usa
       el tag <script src="components/founder-checkout.js">
       al final del body).
   ============================================================= */
'use strict';

(function () {

  // ── CONFIG ───────────────────────────────────────────────────
  const CONFIG = Object.freeze({
    WA_NUMBER:     '598098550096',
    FREE_SHIPPING: 2000,
    SHIPPING_COST: 250,
    API_CHECKOUT:  '/api/checkout',
  });

  // ── CARRITO DESDE LOCALSTORAGE ───────────────────────────────
  const CART_KEY = 'founder_cart';

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  }
  function clearCart() {
    try { localStorage.setItem(CART_KEY, '[]'); }
    catch (e) { console.warn('[Founder] No se pudo limpiar carrito:', e); }
  }

  // ── ESTADO ───────────────────────────────────────────────────
  // El carrito se carga inicial con lo que haya en localStorage.
  // Luego, apenas arranque init(), se hace fetchStockAndPurge() para
  // eliminar cualquier producto que se haya agotado desde la última vez.
  const state = {
    cart:          loadCart(),
    removedOnLoad: [],   // llenado por init() tras el fetch
    entregaMode:   'envio',
    pagoMode:      'mercadopago',
    coupon:        null, // { codigo, tipo, valor, uso, minCompra }
  };

  // ── DOM HELPERS ──────────────────────────────────────────────
  const $       = id => document.getElementById(id);
  const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML  = html; };
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const toggle  = (el, cls, force) => el?.classList.toggle(cls, force);

  // ── WHATSAPP HELPER — iOS-safe ───────────────────────────────
  /**
   * Abre WhatsApp en una pestaña nueva de forma confiable en iOS Safari.
   *
   * Problema que resuelve:
   *   iOS Safari bloquea window.open() cuando se llama DESPUÉS de un
   *   await (por ej. fetch al backend), porque ya perdió el "gesto de
   *   usuario" que autoriza la apertura de pestañas. Chrome y Android
   *   son más permisivos y no tienen este problema.
   *
   * Estrategia:
   *   1. preOpenWhatsAppTab() se llama al comenzar el handler (dentro
   *      del tap del usuario). Abre about:blank como placeholder.
   *   2. Si el pedido se crea OK → navegamos esa pestaña a wa.me/...
   *   3. Si el pedido falla → cerramos la pestaña placeholder.
   *   4. Si el pre-open fue bloqueado (ej. popup blocker muy estricto)
   *      → fallback a window.location.href en la misma pestaña.
   *
   * Uso:
   *   const waTab = preOpenWhatsAppTab();      // ANTES del await
   *   const data  = await apiCheckout(...);    // await
   *   if (data.ok) {
   *     openWhatsApp(waTab, url);              // DESPUÉS del await
   *   } else {
   *     closeWhatsAppTab(waTab);               // limpiar
   *   }
   */
  function preOpenWhatsAppTab() {
    // Intentar abrir pestaña en blanco. iOS permite esto si se llama
    // dentro del handler del click. Chrome/Firefox también.
    try {
      return window.open('about:blank', '_blank');
    } catch {
      return null;
    }
  }

  function openWhatsApp(preOpenedTab, url) {
    // Si logramos pre-abrir la pestaña, le asignamos la URL ahora.
    if (preOpenedTab && !preOpenedTab.closed) {
      try {
        preOpenedTab.location.href = url;
        return;
      } catch {
        // raro: la pestaña se bloqueó después. Caemos al fallback.
      }
    }
    // Fallback 1: intentar abrir una pestaña nueva directamente.
    // En iOS post-await esto generalmente falla, pero si el usuario
    // permitió popups de nuestro dominio, puede funcionar.
    const fresh = (() => { try { return window.open(url, '_blank'); } catch { return null; } })();
    if (fresh) return;

    // Fallback 2: navegar la pestaña actual a WhatsApp.
    // Es un último recurso: el usuario puede volver con "atrás" del navegador.
    window.location.href = url;
  }

  function closeWhatsAppTab(preOpenedTab) {
    if (preOpenedTab && !preOpenedTab.closed) {
      try { preOpenedTab.close(); } catch { /* ignore */ }
    }
  }

  // ── API helper: POST JSON a /api/checkout ────────────────────
  /** Hace POST a /api/checkout con el body dado. Devuelve la respuesta
   *  JSON parseada, independientemente del status. Así cada caller
   *  puede decidir cómo tratar errores mirando response.ok y data.error. */
  async function apiCheckout(body) {
    const res  = await fetch(CONFIG.API_CHECKOUT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* body no es JSON: lo dejamos en null */ }
    return { ok: res.ok, status: res.status, data: data || {} };
  }

  // ── INICIALIZACIÓN ───────────────────────────────────────────
  // Mapa de fotos cargado desde Supabase (modelo → color → [urls])
  let photoMap = {};

  async function loadPhotos() {
    try {
      photoMap = await window.founderDB.fetchPhotoMap();
      renderOrderSummary(); // re-renderizar con fotos
    } catch (e) {
      console.warn('[Founder] No se pudieron cargar fotos:', e);
    }
  }

  function getPhoto(name, color) {
    return photoMap[name]?.[color]?.[0] || null;
  }

  async function init() {
    // 0) ¿Volvemos de Mercado Pago? Si la URL trae ?mp=success/pending/failure
    //    significa que el cliente acaba de pagar (o intentar pagar) en MP.
    //    Mostramos la pantalla correspondiente y NO procesamos el carrito.
    const mpReturn = parseMpReturn();
    if (mpReturn) {
      handleMpReturn(mpReturn);
      return;
    }

    // 1) Fetch fresco desde Supabase para saber el stock ACTUAL (no
    //    depende de que el usuario haya pasado antes por index/producto).
    try {
      const result = await window.founderCart.fetchStockAndPurge();
      if (result && result.removed && result.removed.length) {
        state.removedOnLoad = result.removed;
        state.cart = loadCart(); // recargar cart ya purgado
      }
    } catch (e) {
      console.warn('[checkout] fetchStockAndPurge falló:', e);
    }

    // 2) Si el carrito quedó vacío (todo se agotó), mostrar empty + notice.
    if (!state.cart.length) {
      $('checkoutForm').style.display = 'none';
      $('emptyCart').style.display    = 'flex';
      if (state.removedOnLoad.length > 0) {
        setTimeout(() => showRemovedNotice(state.removedOnLoad), 300);
      }
      return;
    }

    // 3) Render normal + notice arriba si se purgó algo.
    renderOrderSummary();
    loadPhotos();
    if (state.removedOnLoad.length > 0) {
      setTimeout(() => showRemovedNotice(state.removedOnLoad), 300);
    }

    // Sesión 35: cuando el cliente marca "Acepto Política de Privacidad",
    // también marcamos automáticamente el checkbox de "No devolución" si
    // está visible (carrito con personalización). Unidireccional: solo
    // marca, nunca desmarca. El cliente puede desmarcarlo manualmente si
    // cambia de opinión sobre la personalización.
    const consentPriv = $('coConsent');
    if (consentPriv && !consentPriv.dataset.s35Linked) {
      consentPriv.addEventListener('change', () => {
        if (!consentPriv.checked) return;  // solo cuando se MARCA
        const wrap   = $('coConsentLaser');
        const target = $('coConsentNoDev');
        // Solo si el bloque de no-devolución está visible (hay items grabados)
        if (wrap && wrap.style.display !== 'none' && target && !target.checked) {
          target.checked = true;
        }
      });
      consentPriv.dataset.s35Linked = '1';
    }

    // Meta Pixel — InitiateCheckout (carrito con items, checkout abierto)
    if (window.founderPixel) {
      const { total } = calculateOrderTotals();
      window.founderPixel.trackInitiateCheckout(state.cart, total);
    }
  }

  // ── RETORNO DE MERCADO PAGO ──────────────────────────────────
  /**
   * Lee la URL para detectar si el cliente vuelve de Mercado Pago.
   * MP nos redirige a checkout.html?mp=<estado>&numero=<F######>
   * con uno de los 3 estados posibles. Devuelve null si no es retorno.
   */
  function parseMpReturn() {
    try {
      const params = new URLSearchParams(window.location.search);
      const mp     = params.get('mp');
      if (!mp) return null;
      if (!['success', 'pending', 'failure'].includes(mp)) return null;
      return {
        estado: mp,
        numero: params.get('numero') || '',
        // MP también agrega payment_id, status, etc. por defecto en
        // back_urls. Los capturamos por si algún día los necesitamos.
        paymentId: params.get('payment_id') || '',
        status:    params.get('status')     || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Maneja la pantalla de retorno post-MP.
   *
   * Casos:
   *  - success: pago aprobado. Recuperamos snapshot del sessionStorage
   *             (que se guardó antes de redirigir a MP), abrimos WhatsApp
   *             con el resumen del pedido y mostramos la confirmación.
   *  - pending: pago en proceso (Abitab/Redpagos pendiente, o tarjeta
   *             en revisión). Mostramos mensaje específico — el cliente
   *             tiene que terminar el pago en otro lado.
   *  - failure: pago rechazado. Mostramos error con opción de volver
   *             al carrito y reintentar.
   */
  function handleMpReturn(mpReturn) {
    // Recuperamos el snapshot guardado antes de redirigir a MP.
    // Tiene email + waMsg pre-armado + datos del cliente.
    let snap = null;
    try {
      snap = JSON.parse(sessionStorage.getItem('founder_last_order') || 'null');
    } catch { /* sin snapshot, igual seguimos */ }

    // Limpiar la URL para que un refresh no re-dispare el flujo.
    // Usamos replaceState para sacar el query string pero conservar el path.
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch { /* ignorar errores de replaceState */ }

    // Ocultar el formulario en todos los casos
    $('checkoutForm').style.display = 'none';

    if (mpReturn.estado === 'success') {
      // ── ÉXITO ─────────────────────────────────────────────
      // Limpiar carrito (el pedido ya se procesó). Si por algún motivo
      // el cliente vuelve a este flujo desde otra pestaña, el carrito
      // ya estará vacío.
      clearCart();

      // Abrir WhatsApp con el resumen (mismo patrón que transferencia).
      // Acá NO necesitamos el truco iOS-safe de pre-open porque ya
      // estamos dentro de una navegación post-redirect — ya no hay
      // gesto de usuario reciente. Pero es justamente por eso que
      // muchos navegadores mobiles van a bloquear el window.open
      // automático. Solución: mostramos un BOTÓN dentro de la pantalla
      // de confirmación que el cliente clickea para abrir WhatsApp.
      // Eso lo manejamos en el HTML: el botón "↺ Reenviar pedido por
      // WhatsApp" que ya existe sirve perfectamente para este caso.
      if (snap?.id) {
        setText('confirmOrderId', `Pedido #${snap.id}`);
      } else if (mpReturn.numero) {
        setText('confirmOrderId', `Pedido #${mpReturn.numero}`);
      }
      $('confirmScreen').classList.add('is-visible');

      // Intento "best effort" de abrir WhatsApp automáticamente.
      // En desktop suele funcionar. En mobile/iOS post-redirect lo
      // bloquean — pero el botón "Reenviar por WhatsApp" queda visible
      // como fallback y SÍ tiene gesto de usuario.
      if (snap?.waMsg) {
        const waUrl = `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(snap.waMsg)}`;
        try { window.open(waUrl, '_blank', 'noopener'); } catch { /* OK, hay fallback */ }
      }
      return;
    }

    if (mpReturn.estado === 'pending') {
      // ── PENDIENTE (Abitab, Redpagos, tarjeta en revisión) ─────
      // El pedido está creado en Supabase con estado 'Pendiente pago'.
      // El webhook lo va a actualizar cuando el cliente termine de pagar.
      // No limpiamos el carrito acá — si el cliente quiere volver a
      // intentar con otro método, todavía tiene los items.
      showMpStatusScreen({
        icon:   '⏳',
        title:  'Pago pendiente',
        msg:    snap?.id
          ? `Tu pedido <strong>#${snap.id}</strong> fue registrado y está esperando que completes el pago.<br><br>Si elegiste Abitab o Redpagos, tenés <strong>3 días hábiles</strong> para pagar. Te avisaremos por email cuando se acredite.`
          : 'Tu pedido fue registrado. Cuando termines el pago, te avisaremos por email.',
        btnText: 'Volver a la tienda',
        btnHref: 'index.html',
      });
      return;
    }

    // ── FAILURE (rechazado) ─────────────────────────────────
    // El pedido quedó en Supabase con estado 'Pendiente pago' (el
    // webhook lo va a marcar como 'Pago rechazado' cuando llegue
    // el aviso de MP). El carrito NO se limpia para que el cliente
    // pueda volver a intentar.
    showMpStatusScreen({
      icon:    '❌',
      title:   'Pago no procesado',
      msg:     'El pago fue rechazado por Mercado Pago. Esto puede pasar por fondos insuficientes, datos incorrectos o un problema con la tarjeta.<br><br>Podés intentar de nuevo con otro método o contactarnos por WhatsApp.',
      btnText: 'Volver al checkout',
      btnHref: 'checkout.html',
      btn2Text: 'Contactar por WhatsApp',
      btn2Href: `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent('Hola, tuve un problema con el pago en Mercado Pago' + (snap?.id ? ' del pedido #' + snap.id : ''))}`,
    });
  }

  /**
   * Pinta la pantalla de retorno reutilizando #confirmScreen.
   * Cambia el ícono, título, mensaje y botones según el caso.
   */
  function showMpStatusScreen({ icon, title, msg, btnText, btnHref, btn2Text, btn2Href }) {
    const screen = $('confirmScreen');
    if (!screen) return;
    const iconEl   = screen.querySelector('.confirm-screen__icon');
    const titleEl  = screen.querySelector('.confirm-screen__title');
    const idEl     = $('confirmOrderId');
    const msgEl    = screen.querySelector('.confirm-screen__msg');
    const actions  = screen.querySelector('.confirm-screen__actions');

    if (iconEl)  iconEl.textContent  = icon;
    if (titleEl) titleEl.textContent = title;
    if (idEl)    idEl.textContent    = ''; // sin ID en pending/failure
    if (msgEl)   msgEl.innerHTML     = msg;
    if (actions) {
      const primary = `<a href="${btnHref}" class="confirm-screen__btn">${btnText}</a>`;
      const secondary = btn2Text
        ? `<a href="${btn2Href}" class="confirm-screen__btn--secondary" target="_blank" rel="noopener">${btn2Text}</a>`
        : '';
      actions.innerHTML = primary + secondary;
    }
    screen.classList.add('is-visible');
  }


  /** Muestra una notificación recuadrada arriba del formulario listando
   *  los productos que fueron eliminados del carrito porque se agotaron.
   *  Incluye enlace a "index.html#productos" para elegir otro modelo. */
  function showRemovedNotice(items) {
    if (!items || !items.length) return;
    if (document.getElementById('checkoutRemovedNotice')) return;

    const list  = items.map(n => `<li>${n}</li>`).join('');
    const label = items.length === 1
      ? 'Se eliminó un producto de tu carrito porque se agotó:'
      : `Se eliminaron ${items.length} productos de tu carrito porque se agotaron:`;
    const html = `
      <div class="checkout-removed-notice" id="checkoutRemovedNotice" role="status" aria-live="polite">
        <button class="checkout-removed-notice__close" onclick="document.getElementById('checkoutRemovedNotice').remove()" aria-label="Cerrar">✕</button>
        <p class="checkout-removed-notice__title">⚠ ${label}</p>
        <ul class="checkout-removed-notice__list">${list}</ul>
        <a class="checkout-removed-notice__link" href="index.html#productos">Ver otros modelos →</a>
      </div>`;

    const target = $('checkoutForm').style.display !== 'none' ? $('checkoutForm') : $('emptyCart');
    if (target && target.parentNode) {
      target.insertAdjacentHTML('beforebegin', html);
    }
  }

  // ── NAVEGACIÓN ───────────────────────────────────────────────
  function goBack() {
    // Solo hacer history.back() si el referrer es del mismo dominio
    const referrer = document.referrer;
    if (referrer && new URL(referrer).origin === window.location.origin) {
      history.back();
    } else {
      window.location.href = 'index.html';
    }
  }

  // ── ENTREGA Y PAGO ───────────────────────────────────────────
  function setEntrega(mode) {
    state.entregaMode = mode;
    $('envioFields').style.display  = mode === 'envio'  ? 'flex' : 'none';
    $('retiroFields').style.display = mode === 'retiro' ? 'flex' : 'none';
    toggle($('btnEnvio'),  'is-active', mode === 'envio');
    toggle($('btnRetiro'), 'is-active', mode === 'retiro');
    renderOrderSummary();
  }

  function setPago(mode) {
    state.pagoMode = mode;
    toggle($('btnMP'),       'is-active', mode === 'mercadopago');
    toggle($('btnTransfer'), 'is-active', mode === 'transfer');
    $('transferNote').style.display = mode === 'transfer' ? 'block' : 'none';
    $('coSubmitBtn').textContent    = mode === 'transfer'
      ? 'Confirmar pedido (Transferencia)'
      : 'Continuar al pago (Mercado Pago)';
    renderOrderSummary();
  }

  // ── CÁLCULO DE TOTALES ───────────────────────────────────────
  // Precio unitario por slot de personalización. Espejo de la
  // constante que usa la RPC SQL (`v_slot_unit_price = 290`).
  // Si cambia en el panel admin, también hay que cambiarlo acá.
  const PERSONALIZ_SLOT_UNIT_PRICE = 290;

  function calculateOrderTotals() {
    // Subtotal de productos = precio base × qty.
    const subtotal     = state.cart.reduce((s, i) => s + i.price * i.qty, 0);

    // Sesión 28 Bloque B: extra de personalización láser. Se cobra
    // POR ITEM × cantidad. Acumulable a través de items distintos.
    const personalizExtra = state.cart.reduce((s, i) => {
      const e = i.personalizacion?.extra || 0;
      return s + e * i.qty;
    }, 0);

    // Sesión 36: nueva fórmula de descuentos.
    //
    // Reglas confirmadas:
    //  1. CUPÓN clásico → descuenta del subtotal del producto.
    //  2. CUPÓN de personalización → descuenta del costo de grabado.
    //  3. TRANSFERENCIA 10% → se aplica al final, sobre
    //     (subtotal − cuponSubtotal) + (personaliz − cuponPersonaliz),
    //     SIN incluir el envío.
    //  4. Los 3 descuentos son ACUMULABLES (cambia la regla vieja
    //     que aplicaba "el mayor entre cupón y transferencia").
    //  5. Razón de negocio: incentivar transferencia para ahorrar
    //     comisiones de Mercado Pago.
    let couponAmountSubtotal      = 0;
    let couponAmountPersonalizado = 0;
    if (state.coupon) {
      if (state.coupon.descuentaPersonalizacion === true) {
        // Cupón B: descuento sobre personalización
        const itemsGrabados = state.cart.reduce((s, i) => {
          const p = i.personalizacion;
          const tieneSlot = p && (p.adelante || p.interior || p.atras || (p.texto && p.texto.length));
          return s + (tieneSlot ? (Number(i.qty) || 1) : 0);
        }, 0);
        let calc = state.coupon.personalizacionSlotsCubiertos * itemsGrabados * PERSONALIZ_SLOT_UNIT_PRICE;
        if (calc > personalizExtra) calc = personalizExtra; // tope al 100%
        couponAmountPersonalizado = calc;
      } else if (state.coupon.tipo === 'porcentaje') {
        // Cupón A: porcentaje sobre subtotal
        couponAmountSubtotal = Math.round(subtotal * state.coupon.valor / 100);
      } else {
        // Cupón A: monto fijo, topeado al subtotal
        couponAmountSubtotal = Math.min(state.coupon.valor, subtotal);
      }
    }

    // Base para el descuento de transferencia = lo que queda después
    // de aplicar los cupones, SIN incluir envío.
    const baseTransferencia = (subtotal - couponAmountSubtotal)
                              + (personalizExtra - couponAmountPersonalizado);

    // Descuento transferencia: 10% sobre esa base. Solo si el
    // cliente seleccionó "transferencia" como método de pago.
    const transferAmount = state.pagoMode === 'transfer'
      ? Math.round(baseTransferencia * 0.10)
      : 0;

    // Envío: se calcula sobre la base ANTES del descuento de
    // transferencia (la transferencia no debe afectar la calificación
    // a envío gratis — si gastaste >$2.000 en productos+grabados ya
    // te ganaste el envío gratis, no importa qué descuento extra venga).
    const shipping = state.entregaMode === 'retiro' ? 0
      : (baseTransferencia >= CONFIG.FREE_SHIPPING ? 0 : CONFIG.SHIPPING_COST);

    // Total final
    const total = baseTransferencia - transferAmount + shipping;

    // discountAmount = suma de todos los descuentos visibles
    // (para compatibilidad con render y email).
    const discountAmount = couponAmountSubtotal + couponAmountPersonalizado + transferAmount;

    return {
      subtotal,
      personalizExtra,
      discountAmount,                       // suma total de descuentos
      couponAmountSubtotal,                 // descuento sobre subtotal del producto
      couponAmountPersonalizado,            // descuento sobre personalización
      transferAmount,                       // Sesión 36: descuento transferencia (acumulable)
      baseTransferencia,                    // Sesión 36: base sobre la que se calculó 10%
      shipping,
      total,
    };
  }

  // Sesión 36: helper para renderizar una tarjeta de descuento
  // verde con título, subtítulo y monto. Se usa para cupones y
  // descuento por transferencia. Garantiza consistencia visual
  // entre los distintos tipos de descuento.
  function renderDiscountCard(title, subtitle, amount) {
    return `<div class="co-discount-card">
      <div class="co-discount-card__info">
        <span class="co-discount-card__title">${title}</span>
        <span class="co-discount-card__sub">${subtitle}</span>
      </div>
      <span class="co-discount-card__amount">−$${amount.toLocaleString('es-UY')}</span>
    </div>`;
  }

  // ── RESUMEN DEL PEDIDO ───────────────────────────────────────
  function renderOrderSummary() {
    let html = state.cart.map(item => {
      const photo = getPhoto(item.name, item.color);

      // Sesión 28 Bloque B: tags chiquitos con las personalizaciones
      let personalizTags = '';
      if (item.personalizacion) {
        const tags = [];
        if (item.personalizacion.adelante) tags.push('Adelante');
        if (item.personalizacion.interior) tags.push('Interior');
        if (item.personalizacion.atras)    tags.push('Atrás');
        if (item.personalizacion.texto)    tags.push(`Texto: "${item.personalizacion.texto}"`);
        if (tags.length > 0) {
          personalizTags = `
            <div style="font-size:9px;color:var(--color-gold);letter-spacing:1px;margin-top:4px;text-transform:uppercase">
              ✦ ${tags.join(' · ')}
            </div>`;
        }
      }

      // Línea de precio incluye precio base + extra de personalización × qty
      const lineTotal = (item.price + (item.personalizacion?.extra || 0)) * item.qty;

      return `
      <div class="co-summary__product">
        ${photo
          ? `<img src="${cld(photo, 'thumb')}" class="co-summary__product-img" alt="Founder ${item.name}" loading="lazy">`
          : `<div class="co-summary__product-placeholder">👜</div>`}
        <div class="co-summary__product-info">
          <div class="co-summary__product-name">Founder ${item.name}</div>
          <div class="co-summary__product-variant">${item.color}</div>
          <div class="co-summary__product-qty">x${item.qty}</div>
          ${personalizTags}
        </div>
        <div class="co-summary__product-price">$${lineTotal.toLocaleString('es-UY')}</div>
      </div>`;
    }).join('');

    const {
      subtotal, personalizExtra,
      couponAmountSubtotal, couponAmountPersonalizado, transferAmount,
      shipping, total
    } = calculateOrderTotals();

    // Línea de personalización. Si hay descuento de cupón de
    // personalización, mostramos el monto original tachado + el neto.
    if (personalizExtra > 0) {
      const personalizNeto = personalizExtra - couponAmountPersonalizado;
      if (couponAmountPersonalizado > 0) {
        html += `<div class="co-summary__item">
          <span>Personalización láser</span>
          <span style="color:var(--color-gold)">
            <span style="text-decoration:line-through;color:var(--color-muted);font-size:.85em;margin-right:6px">+$${personalizExtra.toLocaleString('es-UY')}</span>
            ${personalizNeto > 0 ? '+$' + personalizNeto.toLocaleString('es-UY') : 'Gratis 🎁'}
          </span>
        </div>`;
      } else {
        html += `<div class="co-summary__item"><span>Personalización láser</span><span style="color:var(--color-gold)">+$${personalizExtra.toLocaleString('es-UY')}</span></div>`;
      }
    }

    // Sesión 36: tarjetas verdes para cada descuento.
    // Cada descuento es una tarjeta con su título, subtítulo y monto.
    // El cupón clásico/personalización aparece primero, después la
    // transferencia (que se aplica al final sobre la base ya descontada).

    if (couponAmountSubtotal > 0) {
      // Cupón clásico (porcentaje o fijo)
      const tipoSub = state.coupon.tipo === 'porcentaje'
        ? `${state.coupon.valor}% de descuento del producto`
        : `$${state.coupon.valor.toLocaleString('es-UY')} de descuento`;
      html += renderDiscountCard(`✓ Cupón ${state.coupon.codigo} aplicado`, tipoSub, couponAmountSubtotal);
    }

    if (couponAmountPersonalizado > 0) {
      // Cupón de personalización
      const slots = state.coupon.personalizacionSlotsCubiertos;
      const sub = `${slots} grabado${slots === 1 ? '' : 's'} personalizado${slots === 1 ? '' : 's'} gratis`;
      html += renderDiscountCard(`✓ Cupón ${state.coupon.codigo} aplicado`, sub, couponAmountPersonalizado);
    }

    if (transferAmount > 0) {
      // Descuento transferencia (acumulable con cupones)
      html += renderDiscountCard('✓ Pago por transferencia', '10% sobre productos + grabados', transferAmount);
    }

    html += `<div class="co-summary__item"><span>Envío</span><span>${shipping === 0 ? 'Gratis 🎁' : '$' + shipping.toLocaleString('es-UY')}</span></div>`;
    html += `<div class="co-summary__total"><span class="co-summary__total-label">Total</span><span class="co-summary__total-value">$${total.toLocaleString('es-UY')} UYU</span></div>`;

    setHTML('coSummaryLines', html);

    // Mostrar/ocultar el checkbox de no-devolución según haya items personalizados
    updateLaserConsentVisibility();
  }

  /** Muestra/oculta el checkbox extra de "no devolución" según haya items
   *  con personalización en el carrito. */
  function updateLaserConsentVisibility() {
    const wrap = $('coConsentLaser');
    if (!wrap) return;
    const hayPersonalizacion = state.cart.some(i => i.personalizacion);
    wrap.style.display = hayPersonalizacion ? 'flex' : 'none';
    if (!hayPersonalizacion) {
      // Limpiar el check si no hay personalización (por si el cliente
      // lo había marcado y luego sacó el item del carrito).
      const cb = $('coConsentNoDev');
      if (cb) cb.checked = false;
    }
  }

  // ── SISTEMA DE CUPONES ────────────────────────────────────────
  /**
   * Valida un cupón contra /api/checkout (acción "validate_coupon").
   * Si el cupón es válido, actualiza state.coupon y re-renderiza el
   * resumen. Si hay error, muestra el feedback apropiado.
   *
   * Nota: el servidor ya valida TODO (activo, vigencia, uso, mínimo,
   * por-email), así que acá solo hay que traducir la respuesta.
   */
  async function applyCoupon() {
    const input  = $('couponInput');
    const btn    = $('couponBtn');
    const codigo = input.value.trim().toUpperCase();

    if (!codigo) { showFeedback('Ingresá un código', false); return; }

    // Email necesario para validar cupones tipo "por-email"
    const email = $('coEmail').value.trim().toLowerCase();

    // Subtotal actual para validar mínimo de compra en el servidor
    const { subtotal } = calculateOrderTotals();

    // Sesión 34 fix: indicarle al backend si el carrito tiene
    // personalización. Sin este flag, los cupones marcados como
    // "Descuenta personalización" se rechazaban siempre porque el
    // backend recibía `undefined` y lo trataba como "sin grabado".
    const hasPersonalizacion = state.cart.some(i => i && i.personalizacion);

    btn.disabled    = true;
    btn.textContent = '...';
    showFeedback('', false);

    try {
      const { ok, data } = await apiCheckout({
        action:   'validate_coupon',
        codigo,
        email,
        subtotal,
        hasPersonalizacion,
      });

      if (!ok) {
        // El servidor ya manda el mensaje amigable en data.detail
        showFeedback(data.detail || 'Código no válido', false);
        btn.disabled    = false;
        btn.textContent = 'Aplicar';
        return;
      }

      // ── Cupón válido — aplicar ────────────────────────────
      state.coupon = {
        codigo:    data.cupon.codigo,
        tipo:      data.cupon.tipo,         // 'fijo' | 'porcentaje'
        valor:     Number(data.cupon.valor) || 0,
        uso:       data.cupon.uso,
        minCompra: Number(data.cupon.minCompra) || 0,
        // Sesión 34 fix: flags de personalización para que
        // calculateOrderTotals() sepa cómo calcular el descuento.
        descuentaPersonalizacion:      data.cupon.descuentaPersonalizacion === true,
        personalizacionSlotsCubiertos: Number(data.cupon.personalizacionSlotsCubiertos) || 0,
      };

      // Etiqueta amigable según tipo de cupón
      let descLabel;
      if (state.coupon.descuentaPersonalizacion) {
        const slots = state.coupon.personalizacionSlotsCubiertos;
        descLabel = `${slots} grabado${slots === 1 ? '' : 's'} personalizado${slots === 1 ? '' : 's'} gratis`;
      } else if (state.coupon.tipo === 'porcentaje') {
        descLabel = `${state.coupon.valor}% de descuento`;
      } else {
        descLabel = `$${state.coupon.valor.toLocaleString('es-UY')} de descuento`;
      }

      setText('couponAppliedText', `✓ ${state.coupon.codigo} — ${descLabel}`);
      $('couponApplied').classList.add('is-visible');
      input.disabled    = true;
      btn.style.display = 'none';
      renderOrderSummary();

    } catch (err) {
      console.error('[Founder] Error validando cupón:', err);
      showFeedback('Error al validar. Intentá de nuevo.', false);
      btn.disabled    = false;
      btn.textContent = 'Aplicar';
    }
  }

  function removeCoupon() {
    state.coupon                 = null;
    $('couponInput').value       = '';
    $('couponInput').disabled    = false;
    $('couponBtn').style.display = '';
    $('couponApplied').classList.remove('is-visible');
    showFeedback('', false);
    renderOrderSummary();
  }

  function showFeedback(msg, ok) {
    const el = $('couponFeedback');
    el.className   = msg ? `coupon-feedback ${ok ? 'ok' : 'err'}` : 'coupon-feedback';
    el.textContent = msg || '';
  }

  // ── PROCESAR PEDIDO ──────────────────────────────────────────
  async function processOrder() {
    // PRE-OPEN DE PESTAÑA WHATSAPP (iOS-safe)
    // iOS Safari bloquea window.open() si se llama después de un await
    // (pierde el "gesto de usuario"). Lo abrimos ahora — dentro del tap —
    // y más adelante le asignamos la URL real. Si el pedido falla, se cierra.
    // En Android/desktop esto funciona igual sin penalidad.
    const waTab = preOpenWhatsAppTab();

    // REVALIDACIÓN DE STOCK EN TIEMPO REAL
    // El usuario puede haber estado un rato llenando el formulario.
    // Antes de confirmar, volvemos a consultar Supabase. Si algún item
    // se agotó mientras tanto, lo eliminamos, avisamos y cortamos.
    try {
      const check = await window.founderCart.fetchStockAndPurge();
      if (check && check.removed && check.removed.length) {
        closeWhatsAppTab(waTab); // cortamos: cerrar placeholder
        state.cart = loadCart();
        showRemovedNotice(check.removed);
        showToast('Se eliminaron productos agotados de tu carrito', 'error');
        if (!state.cart.length) {
          $('checkoutForm').style.display = 'none';
          $('emptyCart').style.display    = 'flex';
        } else {
          renderOrderSummary();
        }
        return; // cortar: no enviar la orden
      }
    } catch (e) {
      console.warn('[checkout] revalidación de stock falló:', e);
      // Seguimos adelante: no bloqueamos al usuario por un fallo de red.
    }

    // Validación de datos personales
    const nombre   = $('coNombre').value.trim();
    const apellido = $('coApellido').value.trim();
    const celular  = $('coCelular').value.trim();
    const email    = $('coEmail').value.trim();

    if (!nombre || !apellido || !celular || !email) {
      closeWhatsAppTab(waTab);
      showToast('Completá todos los datos personales', 'error');
      return;
    }

    // Validación de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      closeWhatsAppTab(waTab);
      showToast('Ingresá un email válido', 'error');
      return;
    }

    // Validación básica de celular — solo dígitos, espacios y guiones, mínimo 7 caracteres
    const celularClean = celular.replace(/[\s\-\+]/g, '');
    if (!/^\d{7,15}$/.test(celularClean)) {
      closeWhatsAppTab(waTab);
      showToast('Ingresá un número de celular válido', 'error');
      return;
    }

    // Validación de entrega
    if (state.entregaMode === 'envio') {
      if (!$('coDepartamento').value || !$('coDireccion').value.trim()) {
        closeWhatsAppTab(waTab);
        showToast('Completá los datos de envío', 'error');
        return;
      }
    } else {
      if (!$('coNombreRetira').value.trim() || !$('coCIRetira').value.trim()) {
        closeWhatsAppTab(waTab);
        showToast('Completá los datos de retiro', 'error');
        return;
      }
    }

    if (!$('coConsent').checked) {
      closeWhatsAppTab(waTab);
      showToast('Debés aceptar la política de privacidad', 'error');
      return;
    }

    // Sesión 28 Bloque B: si hay items con personalización, validar
    // el segundo checkbox (no-devolución).
    const hayPersonalizacion = state.cart.some(i => i.personalizacion);
    if (hayPersonalizacion && !$('coConsentNoDev')?.checked) {
      closeWhatsAppTab(waTab);
      showToast('Debés aceptar el aviso de no-devolución para productos personalizados', 'error');
      return;
    }

    const { subtotal, personalizExtra, discountAmount, shipping, total } = calculateOrderTotals();
    const lines = state.cart.map(i => {
      const lineTotal = (i.price + (i.personalizacion?.extra || 0)) * i.qty;
      const personalizSuffix = i.personalizacion
        ? ` [+grabado láser]`
        : '';
      return `- Founder ${i.name} (${i.color}) x${i.qty}${personalizSuffix}: $${lineTotal.toLocaleString('es-UY')}`;
    }).join('\n');

    // Armar info de entrega
    let deliveryInfo = '';
    let deliveryAddress = '';
    if (state.entregaMode === 'envio') {
      const dept   = $('coDepartamento').value;
      const barrio = $('coBarrio').value;
      const dir    = $('coDireccion').value;
      const nro    = $('coNroPuerta').value;
      const obs    = $('coObsEnvio').value;
      deliveryInfo    = `📍 *Envío:* ${dir} ${nro}, ${barrio}, ${dept}${obs ? '\n📝 ' + obs : ''}`;
      deliveryAddress = `${dir} ${nro}, ${barrio}, ${dept}`;
    } else {
      const quien = $('coNombreRetira').value;
      const ci    = $('coCIRetira').value;
      const obs   = $('coObsRetiro').value;
      deliveryInfo    = `🏪 *Retiro en tienda*\nRetira: ${quien} (CI: ${ci})${obs ? '\n📝 ' + obs : ''}`;
      deliveryAddress = `Retiro — ${quien} (CI: ${ci})`;
    }

    // Mantener el formato de ID actual (F + últimos 6 dígitos de timestamp).
    // Es compatible con lo que admin/seguimiento ya esperan.
    const orderId = 'F' + Date.now().toString().slice(-6);
    // ISO 8601 (formato estándar internacional). NO usar toLocaleString
    // porque genera strings como "12/5/2026, 22:35:14 p. m." que Postgres
    // interpreta el "p." como abreviatura de timezone inválida y rechaza
    // el insert con "TIME ZONE 'P.' NOT RECOGNIZED".
    const fecha   = new Date().toISOString();
    const pagoStr = state.pagoMode === 'mercadopago' ? 'Mercado Pago' : 'Transferencia';
    // Ambos métodos arrancan como 'Pendiente pago':
    //  - Transferencia: el cliente todavía tiene que hacer la transfer manual.
    //  - Mercado Pago:  el cliente está por entrar al checkout de MP. Cuando
    //                   MP apruebe, el webhook sube a 'Pendiente confirmación'.
    const estado  = 'Pendiente pago';
    const cuponStr = state.coupon
      ? `${state.coupon.codigo} (-$${discountAmount.toLocaleString('es-UY')})`
      : '';

    // Objeto order (campos planos) — MISMA forma que esperan admin y seguimiento
    const order = {
      numero:    orderId,
      fecha,
      nombre, apellido, celular, email,
      entrega:   state.entregaMode === 'envio' ? 'Envío' : 'Retiro',
      direccion: deliveryAddress,
      productos: state.cart.map(i => {
        const tag = i.personalizacion ? ' [grabado láser]' : '';
        return `Founder ${i.name} (${i.color}) x${i.qty}${tag}`;
      }).join(' | '),
      subtotal,
      descuento: discountAmount,
      envio:     shipping,
      total,
      pago:      pagoStr,
      estado,
      notas:     cuponStr ? `Cupón: ${cuponStr}` : '',
      // Sesión 28 Bloque B
      personalizacion_extra: personalizExtra,
      acepto_no_devolucion:  hayPersonalizacion ? !!$('coConsentNoDev')?.checked : false,
    };

    // Items estructurados — se guardan en order_items para que el admin
    // pueda listar/filtrar por producto en el futuro.
    // Sesión 28 Bloque B: se incluye `personalizacion` cuando el item lo tiene.
    const items = state.cart.map(i => ({
      product_name:    i.name,
      color:           i.color,
      cantidad:        i.qty,
      precio_unitario: i.price,
      // El backend persiste esto en order_items.personalizacion como JSONB.
      // Si es null/undefined, queda NULL en DB (= comportamiento legacy).
      personalizacion: i.personalizacion || null,
    }));

    // Deshabilitar botón para evitar doble envío
    const btn = $('coSubmitBtn');
    btn.disabled    = true;
    btn.textContent = '⏳ Procesando...';

    // ── 1. Crear pedido en Supabase (atómico con cupón si aplica) ──
    let apiResp;
    try {
      apiResp = await apiCheckout({
        action: 'create_order',
        order,
        items,
        cupon:  state.coupon ? state.coupon.codigo : null,
      });
    } catch (err) {
      console.error('[Founder] Error de red creando pedido:', err);
      closeWhatsAppTab(waTab);
      showToast('No se pudo conectar. Verificá tu internet e intentá de nuevo.', 'error');
      btn.disabled    = false;
      btn.textContent = pagoStr === 'Transferencia'
        ? 'Confirmar pedido (Transferencia)'
        : 'Continuar al pago (Mercado Pago)';
      return;
    }

    if (!apiResp.ok) {
      // Si falló por un error de cupón (fue invalidado entre el applyCoupon y el submit),
      // mostramos feedback específico y dejamos el botón habilitado.
      const errCode = apiResp.data.error || 'error';
      const errMsg  = apiResp.data.detail
        || (errCode === 'numero_duplicate' ? 'Intentá de nuevo en un segundo' : 'No pudimos procesar el pedido');
      console.warn('[Founder] Error creando pedido:', errCode, errMsg);
      closeWhatsAppTab(waTab);
      showToast(errMsg, 'error');
      btn.disabled    = false;
      btn.textContent = pagoStr === 'Transferencia'
        ? 'Confirmar pedido (Transferencia)'
        : 'Continuar al pago (Mercado Pago)';
      return;
    }

    // Pedido creado OK — uso el numero que devolvió el servidor (por las dudas
    // que alguna vez el servidor reescriba el formato, ej: añadir prefijo).
    const numeroConfirmado = apiResp.data.numero || orderId;

    // Armar siempre el mensaje de WhatsApp (lo necesitamos en ambos
    // flujos: ahora para transferencia, o cuando el cliente vuelva
    // de MP en caso de Mercado Pago).
    const waMsg = [
      `🛍️ *NUEVO PEDIDO FOUNDER — ${numeroConfirmado}*`,
      ``,
      `👤 *${nombre} ${apellido}*`,
      `📱 ${celular}`,
      `📧 ${email}`,
      ``,
      `🛒 *PRODUCTOS:*`,
      lines,
      ``,
      deliveryInfo,
      ``,
      `💳 *Pago:* ${pagoStr}`,
      ...(state.coupon ? [`🏷️ *Cupón:* ${state.coupon.codigo} (-$${discountAmount.toLocaleString('es-UY')} UYU)`] : []),
      `💰 *Total:* $${total.toLocaleString('es-UY')} UYU`,
      `🔖 *ID:* ${numeroConfirmado}`,
    ].join('\n');

    // Snapshot único — sirve para reenviar/ver detalles después,
    // y también para recuperar el waMsg cuando el cliente vuelve de MP.
    const orderSnapshot = {
      id:       numeroConfirmado,
      nombre, apellido, email,
      waMsg,
    };
    try {
      sessionStorage.setItem('founder_last_order', JSON.stringify(orderSnapshot));
    } catch (e) {
      console.warn('[Founder] sessionStorage no disponible:', e);
    }

    // ── BIFURCACIÓN: Mercado Pago vs Transferencia ──────────────
    if (apiResp.data.init_point) {
      // ── Mercado Pago: redirigir al checkout de MP ──────────────
      // El backend ya creó el pedido en Supabase con estado 'Pendiente
      // pago'. El webhook lo va a actualizar cuando MP confirme/rechace
      // el pago. El Pixel.Purchase NO se dispara acá — lo dispara el
      // webhook cuando el pago es realmente aprobado (vía CAPI).
      //
      // Cerramos la pestaña pre-abierta de WhatsApp porque acá todavía
      // no hay nada que mostrarle al cliente — abriremos WhatsApp
      // cuando vuelva con ?mp=success.
      closeWhatsAppTab(waTab);
      // Redirigimos a init_point en la pestaña actual. Si todo va bien,
      // el cliente vuelve a checkout.html?mp=<estado> tras pagar.
      window.location.href = apiResp.data.init_point;
      return;
    }

    // ── Transferencia: flujo original (WhatsApp + confirmación) ─
    // Meta Pixel — Purchase (lado cliente)
    // El servidor también va a emitir este evento por CAPI con el mismo
    // event_id = numeroConfirmado → Meta deduplica automáticamente.
    if (window.founderPixel) {
      window.founderPixel.trackPurchase({
        numero: numeroConfirmado,
        total,
        cart: state.cart,
      });
    }

    const waUrl = `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;
    openWhatsApp(waTab, waUrl);

    // Limpiar carrito y mostrar confirmación
    clearCart();
    $('checkoutForm').style.display = 'none';
    setText('confirmOrderId', `Pedido #${numeroConfirmado}`);
    $('confirmScreen').classList.add('is-visible');
  }

  // ── REENVIAR PEDIDO — vuelve a abrir WhatsApp con el mismo mensaje ──
  function reenviarPedido() {
    try {
      const snap = JSON.parse(sessionStorage.getItem('founder_last_order') || 'null');
      if (!snap?.waMsg) { showToast('No se encontraron datos del pedido', 'error'); return; }
      window.open(`https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(snap.waMsg)}`, '_blank');
    } catch (e) {
      showToast('No se pudo reenviar el pedido', 'error');
    }
  }

  // ── VER DETALLES — redirige a seguimiento.html pre-llenado ──────
  function verDetallesCompra() {
    try {
      const snap = JSON.parse(sessionStorage.getItem('founder_last_order') || 'null');
      if (!snap?.id || !snap?.email) {
        window.location.href = 'seguimiento.html';
        return;
      }
      const params = new URLSearchParams({
        pedido: snap.id,
        email:  snap.email,
      });
      window.location.href = `seguimiento.html?${params.toString()}`;
    } catch (e) {
      window.location.href = 'seguimiento.html';
    }
  }

  // ── LEGAL ────────────────────────────────────────────────────
  const LEGAL_IDS = {
    privacy: 'legalPrivacy',
    terms:   'legalTerms',
    returns: 'legalReturns',
  };
  function showLegal(key) {
    const el = $(LEGAL_IDS[key]);
    if (el) { el.classList.add('is-active'); document.body.style.overflow = 'hidden'; }
  }
  function hideLegal(key) {
    const el = $(LEGAL_IDS[key]);
    if (el) { el.classList.remove('is-active'); document.body.style.overflow = ''; }
  }

  // ── TOAST ────────────────────────────────────────────────────
  // Soporta 3 variantes según el segundo parámetro:
  //   showToast('mensaje')              → default (blanco)
  //   showToast('mensaje', 'success')   → verde
  //   showToast('mensaje', 'error')     → rojo
  let toastTimer;
  function showToast(msg, variant) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('toast--success', 'toast--error');
    if (variant === 'success') toast.classList.add('toast--success');
    else if (variant === 'error') toast.classList.add('toast--error');
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3000);
  }

  // ── EXPONER FUNCIONES USADAS POR onclick INLINE ──────────────
  // El HTML usa atributos onclick que esperan funciones globales.
  // Las exportamos a window para mantener compatibilidad sin tocar
  // el HTML del formulario.
  window.goBack            = goBack;
  window.setEntrega        = setEntrega;
  window.setPago           = setPago;
  window.applyCoupon       = applyCoupon;
  window.removeCoupon      = removeCoupon;
  window.processOrder      = processOrder;
  window.reenviarPedido    = reenviarPedido;
  window.verDetallesCompra = verDetallesCompra;
  window.showLegal         = showLegal;
  window.hideLegal         = hideLegal;

  // ── BOOT ─────────────────────────────────────────────────────
  // Arrancamos cuando el DOM ya esté listo. Si el script se
  // inyecta al final del body (que es el caso), el DOM ya lo
  // está, pero igual cubrimos el caso general por seguridad.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
