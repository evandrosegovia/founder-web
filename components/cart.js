/* =============================================================
   FOUNDER — Componente compartido: CARRITO LATERAL
   -------------------------------------------------------------
   Responsabilidades:
   1) Inyectar el markup del drawer del carrito (overlay + sidebar).
   2) Inyectar el CSS de la notificación de "producto eliminado".
   3) Exponer la API global window.founderCart con:
         - fetchStockAndPurge() → fetch de estados + purga del carrito.
           Es AUTÓNOMA: cada página la llama y obtiene su propia data.
           No depende de index/producto.
         - bootPage(updateFn) → boot centralizado para páginas 2ᵃrias.
         - flushRemovedNotice() → banner rojo dentro del drawer.
         - getRemovedQueue() → lista de productos eliminados pendientes
           de mostrar (usado por checkout.html para banner arriba).
         - clearRemovedQueue() → limpia la queue tras mostrarla.

   REGLA DE NEGOCIO:
     Si un producto del carrito está agotado → se elimina automática-
     mente + notificación recuadrada. En TODAS las páginas, siempre.

   LocalStorage: founder_cart, founder_stock_snapshot
   SessionStorage: founder_removed_notice
   ============================================================= */
(function () {
  'use strict';

  // ── Fuente de datos ──────────────────────────────────────────
  // Los estados de stock se leen desde Supabase vía window.founderDB
  // (definido en supabase-client.js).

  // ── Storage keys ─────────────────────────────────────────────
  const CART_KEY   = 'founder_cart';
  const STOCK_KEY  = 'founder_stock_snapshot';
  const NOTICE_KEY = 'founder_removed_notice';
  const PHOTOS_READY_EVENT = 'founder-cart-photos-ready';

  // ── Mapa de fotos compartido ─────────────────────────────────
  // Se carga UNA vez por carga de página desde Supabase y queda en memoria
  // para que el carrito (en cualquier página) pueda mostrar las fotos reales
  // de cada producto en lugar del placeholder con la inicial.
  let photoMap = {};
  let photoMapReady = false;
  let photoMapPromise = null;

  /** Devuelve la URL de la primera foto del producto+color, o null si no
   *  hay foto (catálogo aún no cargado, producto sin fotos, etc.). */
  function getPhotoUrl(name, color) {
    if (!name || !color) return null;
    const urls = photoMap?.[name]?.[color];
    return Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
  }

  /** Carga el photoMap desde Supabase de forma idempotente. Cuando termina,
   *  dispara un evento custom 'founder-cart-photos-ready' en window que las
   *  páginas pueden escuchar para re-renderizar el carrito con las fotos. */
  function ensurePhotoMap() {
    if (photoMapReady) return Promise.resolve(photoMap);
    if (photoMapPromise) return photoMapPromise;

    if (!window.founderDB || typeof window.founderDB.fetchPhotoMap !== 'function') {
      photoMapReady = true; // marca como "intentado" para no reintentar
      return Promise.resolve({});
    }

    photoMapPromise = window.founderDB.fetchPhotoMap()
      .then(map => {
        photoMap = map || {};
        photoMapReady = true;
        try {
          window.dispatchEvent(new CustomEvent(PHOTOS_READY_EVENT));
        } catch (e) { /* IE no soporta CustomEvent constructor — ignorar */ }
        return photoMap;
      })
      .catch(err => {
        console.warn('[founderCart] No se pudo cargar photoMap:', err);
        photoMapReady = true; // evitar reintentos infinitos
        return {};
      });

    return photoMapPromise;
  }

  // ── Helpers ──────────────────────────────────────────────────
  const norm = s => String(s || '').trim().toLowerCase();
  const key  = (name, color) => `${norm(name)}|${norm(color)}`;

  function readLS(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function writeLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
  function readSS(k, fallback) {
    try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function writeSS(k, v) {
    try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
  function removeSS(k) {
    try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
  }

  // ── Lectura de combos agotados desde Supabase ────────────────
  /** Trae de Supabase solo los colores con estado='sin_stock' y devuelve
   *  un array de keys ["modelo|color", ...] compatible con el snapshot. */
  async function fetchAgotadosFromSupabase() {
    if (!window.founderDB || typeof window.founderDB.fetchProducts !== 'function') {
      throw new Error('supabase-client.js no cargado (window.founderDB no existe)');
    }
    const products = await window.founderDB.fetchProducts();
    const agotados = [];
    (products || []).forEach(p => {
      const ce = p.extras?.colores_estado || {};
      Object.keys(ce).forEach(colorName => {
        if (colorName.endsWith('_precio_oferta')) return; // skip claves auxiliares
        if (ce[colorName] === 'sin_stock') agotados.push(key(p.name, colorName));
      });
    });
    return agotados;
  }

  /** Guarda el snapshot en localStorage con timestamp. */
  function saveSnapshot(agotados) {
    writeLS(STOCK_KEY, { updatedAt: Date.now(), agotados });
  }

  function getSnapshotMap() {
    const raw = readLS(STOCK_KEY, null);
    if (!raw || !Array.isArray(raw.agotados)) return {};
    const map = {};
    raw.agotados.forEach(k => { map[k] = true; });
    return map;
  }

  // ── Purga ────────────────────────────────────────────────────
  function pruneCart(cart, snapMap) {
    if (!Array.isArray(cart) || cart.length === 0) return { cart: [], removed: [] };
    const removed = [];
    const kept = cart.filter(item => {
      if (snapMap[key(item.name, item.color)]) {
        removed.push(`Founder ${item.name} (${item.color})`);
        return false;
      }
      return true;
    });
    return { cart: kept, removed };
  }

  /** Compat: aceptar que index/producto le pasen sus `products` ya parseados. */
  function saveStockSnapshot(products) {
    if (!Array.isArray(products)) return;
    const agotados = [];
    products.forEach(p => {
      (p.colors || []).forEach(c => {
        let estado = c.estado;
        if (!estado && typeof window.getColorEstado === 'function') {
          try { estado = window.getColorEstado(p, c.name).estado; } catch (e) { /* skip */ }
        }
        if (estado === 'sin_stock') agotados.push(key(p.name, c.name));
      });
    });
    saveSnapshot(agotados);
  }

  // ── API principal: fetch autónomo + purga ────────────────────
  /** Cada página llama esta función al cargar. Trae el estado fresco
   *  desde Supabase, actualiza el snapshot y purga el carrito local.
   *  Es segura ante errores de red (si falla, no borra nada).
   *  Retorna promesa con { removed: [nombres] }. */
  async function fetchStockAndPurge() {
    let agotados = [];
    try {
      agotados = await fetchAgotadosFromSupabase();
      saveSnapshot(agotados);
    } catch (e) {
      console.warn('[founderCart] No se pudo refrescar stock:', e);
      // Fallback: usar el snapshot guardado previamente si existe
      const prev = readLS(STOCK_KEY, null);
      if (!prev) return { removed: [] };
      agotados = prev.agotados || [];
    }

    const snapMap = {};
    agotados.forEach(k => { snapMap[k] = true; });

    const cart = readLS(CART_KEY, []);
    const { cart: kept, removed } = pruneCart(cart, snapMap);

    if (removed.length > 0) {
      writeLS(CART_KEY, kept);
      const prev = readSS(NOTICE_KEY, []);
      writeSS(NOTICE_KEY, prev.concat(removed));
    }
    return { removed };
  }

  /** Variante síncrona: usa sólo el snapshot guardado (sin fetch).
   *  Útil para index/producto que ya fetchearon el catálogo completo. */
  function pruneAndQueue(cart) {
    const snapMap = getSnapshotMap();
    if (Object.keys(snapMap).length === 0) return cart || [];
    const { cart: kept, removed } = pruneCart(cart, snapMap);
    if (removed.length > 0) {
      writeLS(CART_KEY, kept);
      const prev = readSS(NOTICE_KEY, []);
      writeSS(NOTICE_KEY, prev.concat(removed));
    }
    return kept;
  }

  function getRemovedQueue() {
    return readSS(NOTICE_KEY, []);
  }
  function clearRemovedQueue() {
    removeSS(NOTICE_KEY);
  }

  // ── Notificación recuadrada dentro del drawer ────────────────
  function flushRemovedNotice() {
    const queue = readSS(NOTICE_KEY, []);
    if (!queue.length) return;
    const container = document.getElementById('cartItems');
    if (!container) return;

    const prev = document.getElementById('cartRemovedNotice');
    if (prev) prev.remove();

    const list  = queue.map(n => `<li>${n}</li>`).join('');
    const label = queue.length === 1
      ? 'Se eliminó un producto de tu carrito porque se agotó:'
      : `Se eliminaron ${queue.length} productos de tu carrito porque se agotaron:`;
    const html = `
      <div class="cart-removed-notice" id="cartRemovedNotice" role="status" aria-live="polite">
        <button class="cart-removed-notice__close" onclick="document.getElementById('cartRemovedNotice').remove()" aria-label="Cerrar notificación">✕</button>
        <p class="cart-removed-notice__title">⚠ ${label}</p>
        <ul class="cart-removed-notice__list">${list}</ul>
        <a class="cart-removed-notice__link" href="index.html#productos">Ver otros modelos →</a>
      </div>`;
    container.insertAdjacentHTML('afterbegin', html);

    setTimeout(() => {
      const el = document.getElementById('cartRemovedNotice');
      if (el) el.style.opacity = '0';
      setTimeout(() => {
        const el2 = document.getElementById('cartRemovedNotice');
        if (el2) el2.remove();
      }, 400);
    }, 10000);

    removeSS(NOTICE_KEY);
  }

  // ── Boot centralizado ────────────────────────────────────────
  /** Para páginas secundarias: espera DOM, hace fetch del stock,
   *  purga el carrito y recién ahí llama al updateFn de la página.
   *  En paralelo, dispara la carga del photoMap (no bloqueante) — cuando
   *  termina, dispara el evento 'founder-cart-photos-ready' que las páginas
   *  pueden escuchar para re-renderizar el carrito con las fotos reales. */
  function bootPage(updateFn) {
    const run = async () => {
      // Disparar fotos en background (sin await — no bloquea el render inicial)
      ensurePhotoMap();
      try {
        await fetchStockAndPurge();
      } catch (e) {
        console.warn('[founderCart.bootPage] fetch falló, usando snapshot previo');
      }
      try { if (typeof updateFn === 'function') updateFn(); } catch (e) { console.error(e); }
      // Si el drawer está abierto al terminar el fetch → mostrar notice ahora
      const sidebar = document.getElementById('cartSidebar');
      if (sidebar && sidebar.classList.contains('is-open')) {
        flushRemovedNotice();
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  // ── API pública ──────────────────────────────────────────────
  window.founderCart = {
    // Nuevos (fetch autónomo)
    fetchStockAndPurge,
    bootPage,
    getRemovedQueue,
    clearRemovedQueue,
    // Compat con index/producto que ya parseaban el catálogo
    saveStockSnapshot,
    pruneAndQueue,
    // Render
    flushRemovedNotice,
    // Fotos del carrito (compartidas entre páginas)
    getPhotoUrl,
    ensurePhotoMap
  };

  // ── Markup del drawer ────────────────────────────────────────
  function buildMarkup() {
    return `
<!-- ── CARRITO LATERAL ─────────────────────────────────────── -->
<div class="cart-overlay" id="cartOverlay" onclick="toggleCart()" aria-hidden="true"></div>
<aside class="cart-sidebar" id="cartSidebar" aria-label="Carrito de compras">
  <div class="cart__header">
    <span class="cart__title">Mi Carrito</span>
    <button class="cart__close" onclick="toggleCart()" aria-label="Cerrar carrito">✕</button>
  </div>
  <div class="cart__items" id="cartItems">
    <div class="cart__empty"><p>Tu carrito está vacío</p><span>Agregá productos para continuar</span></div>
  </div>
  <div class="cart__footer" id="cartFooter" style="display:none">
    <div class="cart__subtotal"><span>Subtotal</span><strong id="cartTotal">$0</strong></div>
    <div class="cart__ship-note" id="cartShipNote"></div>
    <div class="cart__discount-note">💰 Pagando por transferencia obtenés un <strong>10% de descuento</strong>.</div>
    <button class="cart__checkout-btn" onclick="openCheckout()">Finalizar compra</button>
    <div class="cart__mp-info"><span>Pagás con</span> <strong>Mercado Pago</strong> o transferencia</div>
  </div>
</aside>
`.trim();
  }

  // ── CSS del banner ───────────────────────────────────────────
  const COMPONENT_CSS = `
.cart-removed-notice {
  margin: 12px 16px;
  padding: 14px 40px 14px 16px;
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid var(--color-danger);
  border-radius: 4px;
  color: var(--color-danger);
  font-size: 12px;
  line-height: 1.5;
  position: relative;
  transition: opacity .4s ease;
}
.cart-removed-notice__title { margin: 0 0 6px; letter-spacing: 0.3px; font-weight: 500; }
.cart-removed-notice__list  { margin: 0 0 10px; padding-left: 18px; font-size: 11px; opacity: 0.9; }
.cart-removed-notice__list li { margin: 2px 0; }
.cart-removed-notice__link {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--color-danger);
  text-decoration: none;
  border-bottom: 1px solid currentColor;
  padding-bottom: 1px;
}
.cart-removed-notice__link:hover { opacity: 0.75; }
.cart-removed-notice__close {
  position: absolute; top: 6px; right: 8px;
  background: none; border: none; color: var(--color-danger);
  font-size: 14px; line-height: 1; padding: 4px 6px; cursor: pointer;
  opacity: 0.7; transition: opacity .2s;
}
.cart-removed-notice__close:hover { opacity: 1; }
`;

  function injectCSS() {
    if (document.getElementById('founder-cart-css')) return;
    const style = document.createElement('style');
    style.id = 'founder-cart-css';
    style.textContent = COMPONENT_CSS;
    document.head.appendChild(style);
  }

  function render() {
    const mount = document.getElementById('site-cart');
    if (!mount) {
      console.warn('[cart.js] No se encontró <div id="site-cart"></div> en la página');
      return;
    }
    injectCSS();
    mount.outerHTML = buildMarkup();
  }

  render();
})();
