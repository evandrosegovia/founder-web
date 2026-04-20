/* =============================================================
   FOUNDER — Componente compartido: CARRITO LATERAL (drawer)
   -------------------------------------------------------------
   Responsabilidades:
   1) Inyectar el markup del drawer del carrito (overlay + sidebar).
   2) Inyectar el CSS del aviso "Agotado" por-item (unificado).
   3) Exponer una API global window.founderCart con funciones de
      validación de stock compartidas por las 8 páginas del sitio.

   Cómo usar en cada página HTML:
   ------------------------------
     <div id="site-cart"></div>
     <script src="components/cart.js"></script>

   IDs que este markup expone (consumidos por el JS de cada página):
     - #cartOverlay, #cartSidebar
     - #cartItems, #cartFooter
     - #cartTotal, #cartShipNote

   API global expuesta en window.founderCart:
   ------------------------------------------
     getStockSnapshot() → { 'modelo|color': true, ... }
       Cache de combos sin_stock (escrito por index/producto).

     saveStockSnapshot(products) → void
       Llamado SOLO por index.html y producto.html tras cargar el
       catálogo. Guarda qué (modelo, color) están en 'sin_stock'.

     isItemSinStock(item) → boolean
       Devuelve true si item.name + item.color está marcado agotado.

     renderStockAlertHTML(idx) → string
       HTML del bloque rojo interno con mensaje + 2 botones.
       Cada página define removeSinStockItem() y buscarOtroModelo().

     pruneSinStock(cart) → { cart, removed }
       Auto-elimina items agotados del carrito en memoria. Encola
       sus nombres en sessionStorage para mostrar toast al iniciar.

     flushAutoRemoveToast() → void
       Dispara el toast "Sacamos X de tu carrito...". Requiere
       window.showToast disponible.

     canCheckout(cart) → { ok, blockedItem, blockedIndex, message }
       Valida si el carrito puede pasar a checkout. ok:false si hay
       items agotados.

   LocalStorage keys usadas:
     - founder_cart             → carrito persistido
     - founder_stock_snapshot   → { updatedAt, agotados: ['modelo|color',...] }
   SessionStorage keys usadas:
     - founder_autoremoved      → nombres pendientes de toast
   ============================================================= */
(function () {
  'use strict';

  // ── Keys centralizadas ───────────────────────────────────────
  const STOCK_KEY       = 'founder_stock_snapshot';
  const CART_KEY        = 'founder_cart';
  const AUTOREMOVED_KEY = 'founder_autoremoved';

  // ── Helpers de normalización ─────────────────────────────────
  // Los combos se guardan normalizados a lowercase para que
  // diferencias de casing no generen falsos negativos.
  const norm = s => String(s || '').trim().toLowerCase();
  const key  = (name, color) => `${norm(name)}|${norm(color)}`;

  // ── Storage helpers seguros ──────────────────────────────────
  function readLS(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function writeLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota */ }
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

  // ── API: Stock snapshot ──────────────────────────────────────

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

  function isItemSinStock(item) {
    if (!item) return false;
    const snap = getStockSnapshot();
    return !!snap[key(item.name, item.color)];
  }

  function renderStockAlertHTML(idx) {
    return `
        <div class="cart-item__stock-alert">
          <p>⚠ Este producto está agotado</p>
          <div class="cart-item__stock-actions">
            <button class="stock-btn stock-btn--remove" onclick="removeSinStockItem(${idx})">Eliminar</button>
            <button class="stock-btn stock-btn--other" onclick="buscarOtroModelo(${idx})">Ver otros modelos</button>
          </div>
        </div>`;
  }

  function pruneSinStock(cart) {
    if (!Array.isArray(cart) || cart.length === 0) return { cart: cart || [], removed: [] };
    const snap = getStockSnapshot();
    // Si el snapshot está vacío (el usuario nunca pasó por index/producto
    // en esta sesión) NO hacemos prune — evita falsos positivos.
    if (Object.keys(snap).length === 0) return { cart, removed: [] };

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
      const prev = readSS(AUTOREMOVED_KEY, []);
      writeSS(AUTOREMOVED_KEY, prev.concat(removed));
      // Persistir el carrito limpio
      writeLS(CART_KEY, kept);
    }
    return { cart: kept, removed };
  }

  function flushAutoRemoveToast() {
    const queue = readSS(AUTOREMOVED_KEY, []);
    if (!queue.length) return;
    if (typeof window.showToast !== 'function') return;
    const msg = queue.length === 1
      ? `Sacamos ${queue[0]} de tu carrito porque se agotó`
      : `Sacamos ${queue.length} productos de tu carrito porque se agotaron`;
    window.showToast(msg);
    removeSS(AUTOREMOVED_KEY);
  }

  function canCheckout(cart) {
    if (!Array.isArray(cart) || cart.length === 0) {
      return { ok: false, blockedItem: null, blockedIndex: -1, message: 'Tu carrito está vacío' };
    }
    const snap = getStockSnapshot();
    for (let i = 0; i < cart.length; i++) {
      if (snap[key(cart[i].name, cart[i].color)]) {
        return {
          ok: false,
          blockedItem: cart[i],
          blockedIndex: i,
          message: 'Eliminá los productos agotados antes de finalizar la compra'
        };
      }
    }
    return { ok: true, blockedItem: null, blockedIndex: -1, message: '' };
  }

  /** Boot centralizado para páginas que consumen el módulo.
   *  Resuelve el problema de timing: garantiza que primero esté el DOM
   *  listo (incluído el drawer inyectado por cart.js), luego hace prune
   *  del carrito, y recién entonces llama al updateFn de la página.
   *
   *  Las páginas la usan así:
   *      window.founderCart.bootPage(updateCartUI);
   *
   *  Si el DOM ya está listo cuando la llaman, ejecuta inmediatamente.
   *  Si no, espera al evento DOMContentLoaded. */
  function bootPage(updateFn) {
    const run = () => {
      try {
        // 1) Leer carrito actual y hacer prune de agotados
        const cart = readLS(CART_KEY, []);
        pruneSinStock(cart);
        // 2) Render del carrito — updateFn dentro llama a flushAutoRemoveToast
        if (typeof updateFn === 'function') updateFn();
      } catch (e) {
        console.error('[founderCart.bootPage] Error:', e);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  // ── Exponer API global ───────────────────────────────────────
  window.founderCart = {
    getStockSnapshot,
    saveStockSnapshot,
    isItemSinStock,
    renderStockAlertHTML,
    pruneSinStock,
    flushAutoRemoveToast,
    canCheckout,
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

  // ── CSS del aviso "Agotado" por-item (unificado) ─────────────
  // Antes vivía duplicado en index.html y producto.html. Ahora se
  // inyecta desde aquí → aplica en todas las páginas con cart.js.
  const COMPONENT_CSS = `
/* ── Aviso de agotado POR-ITEM (reemplaza al aviso global #cartStockWarning) */
.cart-item--sin-stock {
  background: rgba(255, 59, 48, 0.05);
  border: 1px solid var(--color-danger);
  border-left-width: 3px;
  border-radius: 4px;
  padding: 14px;
  margin-bottom: 14px;
}
/* El .cart-item normal que sigue a un agotado recupera el borde superior. */
.cart-item--sin-stock + .cart-item { border-top: 1px solid var(--color-border); }
/* flex-wrap permite que el bloque de alerta interno caiga debajo a ancho total. */
.cart-item { flex-wrap: wrap; }
.cart-item__stock-alert {
  flex-basis: 100%;
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid rgba(255, 59, 48, 0.2);
  border-radius: 3px;
  font-size: 11px;
  color: var(--color-danger);
  line-height: 1.5;
}
.cart-item__stock-alert p { margin: 0 0 8px; letter-spacing: 0.5px; }
.cart-item__stock-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.stock-btn {
  flex: 1;
  min-width: 110px;
  padding: 8px 12px;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: opacity var(--transition-fast, 0.2s ease);
  font-family: inherit;
}
.stock-btn--remove { background: var(--color-danger); color: #fff; border: 1px solid var(--color-danger); }
.stock-btn--other  { background: transparent; color: var(--color-danger); border: 1px solid var(--color-danger); }
.stock-btn:hover   { opacity: 0.85; }
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
