/* =============================================================
   FOUNDER — Componente compartido: CARRITO LATERAL (drawer)
   -------------------------------------------------------------
   Inyecta el drawer del carrito (overlay + sidebar). La lógica
   del carrito (addToCart, updateCart, toggleCart, etc.) vive en
   el JS principal de cada página — este componente solo provee
   el MARKUP que esas funciones manipulan.

   Cómo usar en cada página HTML:
   ------------------------------
     <div id="site-cart"></div>
     <script src="components/cart.js"></script>

   IDs que este markup expone (consumidos por el JS de cada página):
     - #cartOverlay, #cartSidebar
     - #cartStockWarning
     - #cartItems, #cartFooter
     - #cartTotal, #cartShipNote
   ============================================================= */
(function () {
  'use strict';

  function buildMarkup() {
    return `
<!-- ── CARRITO LATERAL ─────────────────────────────────────── -->
<div class="cart-overlay" id="cartOverlay" onclick="toggleCart()" aria-hidden="true"></div>
<aside class="cart-sidebar" id="cartSidebar" aria-label="Carrito de compras">
  <div class="cart__header">
    <span class="cart__title">Mi Carrito</span>
    <button class="cart__close" onclick="toggleCart()" aria-label="Cerrar carrito">✕</button>
  </div>
  <div class="cart-stock-warning" id="cartStockWarning">
    ⚠️ Uno o más productos de tu carrito están agotados momentáneamente.
    <br><a onclick="toggleCart();window.location.href='index.html#productos'">Buscá otra variante →</a>
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

  function render() {
    const mount = document.getElementById('site-cart');
    if (!mount) {
      console.warn('[cart.js] No se encontró <div id="site-cart"></div> en la página');
      return;
    }
    mount.outerHTML = buildMarkup();
  }

  render();
})();
