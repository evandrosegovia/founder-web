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
  function calculateOrderTotals() {
    const subtotal     = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const transferDisc = state.pagoMode === 'transfer' ? 0.10 : 0;

    // Descuento del cupón (no acumulable con transferencia — se aplica el mayor)
    let couponAmount = 0;
    if (state.coupon) {
      if (state.coupon.tipo === 'porcentaje') {
        couponAmount = Math.round(subtotal * state.coupon.valor / 100);
      } else {
        couponAmount = Math.min(state.coupon.valor, subtotal);
      }
    }

    // Se usa el descuento que más beneficia al cliente
    const transferAmount = Math.round(subtotal * transferDisc);
    const discountAmount = Math.max(couponAmount, transferAmount);
    const discountSource = couponAmount >= transferAmount && couponAmount > 0 ? 'cupon' : (transferAmount > 0 ? 'transfer' : 'none');

    const subtotalConDesc = subtotal - discountAmount;
    const shipping = state.entregaMode === 'retiro' ? 0
      : (subtotalConDesc >= CONFIG.FREE_SHIPPING ? 0 : CONFIG.SHIPPING_COST);
    const total = subtotalConDesc + shipping;

    return { subtotal, discountAmount, discountSource, shipping, total };
  }

  // ── RESUMEN DEL PEDIDO ───────────────────────────────────────
  function renderOrderSummary() {
    let html = state.cart.map(item => {
      const photo = getPhoto(item.name, item.color);
      return `
      <div class="co-summary__product">
        ${photo
          ? `<img src="${photo}" class="co-summary__product-img" alt="Founder ${item.name}" loading="lazy">`
          : `<div class="co-summary__product-placeholder">👜</div>`}
        <div class="co-summary__product-info">
          <div class="co-summary__product-name">Founder ${item.name}</div>
          <div class="co-summary__product-variant">${item.color}</div>
          <div class="co-summary__product-qty">x${item.qty}</div>
        </div>
        <div class="co-summary__product-price">$${(item.price * item.qty).toLocaleString('es-UY')}</div>
      </div>`;
    }).join('');

    const { subtotal, discountAmount, discountSource, shipping, total } = calculateOrderTotals();

    if (discountAmount > 0) {
      const label = discountSource === 'cupon'
        ? `Cupón ${state.coupon.codigo}`
        : 'Descuento transferencia 10%';
      html += `<div class="co-summary__item"><span>${label}</span><span style="color:var(--color-success)">-$${discountAmount.toLocaleString('es-UY')}</span></div>`;
    }
    html += `<div class="co-summary__item"><span>Envío</span><span>${shipping === 0 ? 'Gratis 🎁' : '$' + shipping.toLocaleString('es-UY')}</span></div>`;
    html += `<div class="co-summary__total"><span class="co-summary__total-label">Total</span><span class="co-summary__total-value">$${total.toLocaleString('es-UY')} UYU</span></div>`;

    setHTML('coSummaryLines', html);
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

    btn.disabled    = true;
    btn.textContent = '...';
    showFeedback('', false);

    try {
      const { ok, data } = await apiCheckout({
        action:   'validate_coupon',
        codigo,
        email,
        subtotal,
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
      };

      const descLabel = state.coupon.tipo === 'porcentaje'
        ? `${state.coupon.valor}% de descuento`
        : `$${state.coupon.valor.toLocaleString('es-UY')} de descuento`;

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
    // REVALIDACIÓN DE STOCK EN TIEMPO REAL
    // El usuario puede haber estado un rato llenando el formulario.
    // Antes de confirmar, volvemos a consultar Supabase. Si algún item
    // se agotó mientras tanto, lo eliminamos, avisamos y cortamos.
    try {
      const check = await window.founderCart.fetchStockAndPurge();
      if (check && check.removed && check.removed.length) {
        state.cart = loadCart();
        showRemovedNotice(check.removed);
        showToast('Se eliminaron productos agotados de tu carrito');
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
      showToast('Completá todos los datos personales');
      return;
    }

    // Validación de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Ingresá un email válido');
      return;
    }

    // Validación básica de celular — solo dígitos, espacios y guiones, mínimo 7 caracteres
    const celularClean = celular.replace(/[\s\-\+]/g, '');
    if (!/^\d{7,15}$/.test(celularClean)) {
      showToast('Ingresá un número de celular válido');
      return;
    }

    // Validación de entrega
    if (state.entregaMode === 'envio') {
      if (!$('coDepartamento').value || !$('coDireccion').value.trim()) {
        showToast('Completá los datos de envío');
        return;
      }
    } else {
      if (!$('coNombreRetira').value.trim() || !$('coCIRetira').value.trim()) {
        showToast('Completá los datos de retiro');
        return;
      }
    }

    if (!$('coConsent').checked) {
      showToast('Debés aceptar la política de privacidad');
      return;
    }

    const { subtotal, discountAmount, shipping, total } = calculateOrderTotals();
    const lines = state.cart.map(i =>
      `- Founder ${i.name} (${i.color}) x${i.qty}: $${(i.price * i.qty).toLocaleString('es-UY')}`
    ).join('\n');

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
    const fecha   = new Date().toLocaleString('es-UY');
    const pagoStr = state.pagoMode === 'mercadopago' ? 'Mercado Pago' : 'Transferencia';
    const estado  = state.pagoMode === 'transfer' ? 'Pendiente pago' : 'Pendiente confirmación';
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
      productos: state.cart.map(i => `Founder ${i.name} (${i.color}) x${i.qty}`).join(' | '),
      subtotal,
      descuento: discountAmount,
      envio:     shipping,
      total,
      pago:      pagoStr,
      estado,
      notas:     cuponStr ? `Cupón: ${cuponStr}` : '',
    };

    // Items estructurados — se guardan en order_items para que el admin
    // pueda listar/filtrar por producto en el futuro.
    const items = state.cart.map(i => ({
      product_name:    i.name,
      color:           i.color,
      cantidad:        i.qty,
      precio_unitario: i.price,
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
      showToast('No se pudo conectar. Verificá tu internet e intentá de nuevo.');
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
      showToast(errMsg);
      btn.disabled    = false;
      btn.textContent = pagoStr === 'Transferencia'
        ? 'Confirmar pedido (Transferencia)'
        : 'Continuar al pago (Mercado Pago)';
      return;
    }

    // Pedido creado OK — uso el numero que devolvió el servidor (por las dudas
    // que alguna vez el servidor reescriba el formato, ej: añadir prefijo).
    const numeroConfirmado = apiResp.data.numero || orderId;

    // ── 2. Abrir WhatsApp con resumen ─────────────────────────
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

    window.open(`https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(waMsg)}`, '_blank');

    // ── 3. Guardar snapshot en sessionStorage (para reenvío + ver detalles) ──
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

    // ── 4. Limpiar carrito y mostrar confirmación ────────────
    clearCart();
    $('checkoutForm').style.display = 'none';
    setText('confirmOrderId', `Pedido #${numeroConfirmado}`);
    $('confirmScreen').classList.add('is-visible');
  }

  // ── REENVIAR PEDIDO — vuelve a abrir WhatsApp con el mismo mensaje ──
  function reenviarPedido() {
    try {
      const snap = JSON.parse(sessionStorage.getItem('founder_last_order') || 'null');
      if (!snap?.waMsg) { showToast('No se encontraron datos del pedido'); return; }
      window.open(`https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(snap.waMsg)}`, '_blank');
    } catch (e) {
      showToast('No se pudo reenviar el pedido');
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
  let toastTimer;
  function showToast(msg) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
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
