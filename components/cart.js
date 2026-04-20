/* =============================================================
   FOUNDER — Componente compartido: CARRITO LATERAL (drawer)
   -------------------------------------------------------------
   Responsabilidades:
   1) Inyectar el markup del drawer del carrito (overlay + sidebar).
   2) Inyectar el CSS de la notificación de "producto eliminado por
      agotarse" (banner recuadrado arriba del carrito).
   3) Exponer una API global window.founderCart con:
         - saveStockSnapshot(products): llamado por index/producto
           tras cargar el catálogo. Guarda qué combos (modelo, color)
           están en 'sin_stock'.
         - bootPage(updateFn): llamado por TODAS las páginas al
           arrancar. Espera DOMContentLoaded, elimina del carrito
           los items agotados, encola sus nombres para notificación
           y llama al updateFn de la página.
         - flushRemovedNotice(): dispara la notificación recuadrada
           dentro del drawer del carrito con la lista de eliminados.

   REGLA DE NEGOCIO SIMPLE:
     Si el producto está agotado → se elimina del carrito.
     El usuario recibe una notificación recuadrada listando los
     productos que fueron eliminados porque se agotaron.

   Cómo usar en cada página HTML:
   ------------------------------
     <div id="site-cart"></div>
     <script src="components/cart.js"></script>
     ...
     <script>
       // ... definir loadCart, updateCartUI, etc. ...
       window.founderCart.bootPage(updateCartUI);
     </script>

   LocalStorage keys usadas:
     - founder_cart             → carrito persistido
     - founder_stock_snapshot   → { updatedAt, agotados: ['modelo|color',...] }
   SessionStorage keys usadas:
     - founder_removed_notice   → ['Founder X (Color)',...] pendientes de mostrar
   ============================================================= */
(function () {
  'use strict';

  // ── Storage keys ─────────────────────────────────────────────
  const CART_KEY     = 'founder_cart';
  const STOCK_KEY    = 'founder_stock_snapshot';
  const NOTICE_KEY   = 'founder_removed_notice';

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

  // ── Snapshot de agotados ─────────────────────────────────────
  function getStockSnapshot() {
    const raw = readLS(STOCK_KEY, null);
    if (!raw || !Array.isArray(raw.agotados)) return {};
    const map = {};
    raw.agotados.forEach(k => { map[k] = true; });
    return map;
  }

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
    writeLS(STOCK_KEY, { updatedAt: Date.now(), agotados });
  }

  // ── Prune: elimina items agotados y encola la notificación ───
  function pruneAndQueue(cart) {
    if (!Array.isArray(cart) || cart.length === 0) return cart || [];
    const snap = getStockSnapshot();
    if (Object.keys(snap).length === 0) return cart; // sin snapshot, no tocar

    const removed = [];
    const kept = cart.filter(item => {
      if (snap[key(item.name, item.color)]) {
        removed.push(`Founder ${item.name} (${item.color})`);
        return false;
      }
      return true;
    });

    if (removed.length > 0) {
      // Encolar en sessionStorage (concatenar con pendientes previos)
      const prev = readSS(NOTICE_KEY, []);
      writeSS(NOTICE_KEY, prev.concat(removed));
      writeLS(CART_KEY, kept);
    }
    return kept;
  }

  // ── Notificación recuadrada dentro del drawer ────────────────
  function flushRemovedNotice() {
    const queue = readSS(NOTICE_KEY, []);
    if (!queue.length) return;
    const container = document.getElementById('cartItems');
    if (!container) return; // drawer no está listo todavía

    // Quitar notificación anterior si existiera
    const prev = document.getElementById('cartRemovedNotice');
    if (prev) prev.remove();

    const list = queue.map(n => `<li>${n}</li>`).join('');
    const label = queue.length === 1 ? 'Se eliminó un producto de tu carrito porque se agotó:' :
                                       `Se eliminaron ${queue.length} productos de tu carrito porque se agotaron:`;
    const html = `
      <div class="cart-removed-notice" id="cartRemovedNotice" role="status" aria-live="polite">
        <button class="cart-removed-notice__close" onclick="document.getElementById('cartRemovedNotice').remove()" aria-label="Cerrar notificación">✕</button>
        <p class="cart-removed-notice__title">⚠ ${label}</p>
        <ul class="cart-removed-notice__list">${list}</ul>
      </div>`;
    container.insertAdjacentHTML('afterbegin', html);

    // Auto-cerrar a los 8 segundos (solo dentro del drawer)
    setTimeout(() => {
      const el = document.getElementById('cartRemovedNotice');
      if (el) el.style.opacity = '0';
      setTimeout(() => {
        const el2 = document.getElementById('cartRemovedNotice');
        if (el2) el2.remove();
      }, 400);
    }, 8000);

    // Limpiar la queue (ya la mostramos)
    removeSS(NOTICE_KEY);
  }

  // ── Boot centralizado ────────────────────────────────────────
  /** Llama a updateFn después de que el DOM esté listo y tras
   *  haber purgado los items agotados del carrito persistido. */
  function bootPage(updateFn) {
    const run = () => {
      try {
        const cart = readLS(CART_KEY, []);
        pruneAndQueue(cart);            // elimina + encola notificación
        if (typeof updateFn === 'function') updateFn();
      } catch (e) {
        console.error('[founderCart.bootPage]', e);
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
    saveStockSnapshot,
    pruneAndQueue,
    flushRemovedNotice,
    bootPage
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

  // ── CSS del banner de notificación (inyectado por el componente) ──
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
.cart-removed-notice__title {
  margin: 0 0 6px;
  letter-spacing: 0.3px;
  font-weight: 500;
}
.cart-removed-notice__list {
  margin: 0;
  padding-left: 18px;
  font-size: 11px;
  opacity: 0.9;
}
.cart-removed-notice__list li { margin: 2px 0; }
.cart-removed-notice__close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 14px;
  line-height: 1;
  padding: 4px 6px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity .2s;
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
