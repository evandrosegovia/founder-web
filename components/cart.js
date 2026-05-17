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

  /** Lee el carrito guardado en localStorage. Devuelve un array vacío si
   *  no hay nada o si el JSON está corrupto. Idempotente y seguro. */
  function readCartFromStorage() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  /** Actualiza el badge numérico del carrito en el header (#cartCount).
   *  Funciona en CUALQUIER página que tenga el header con carrito, no solo
   *  en las que invocan updateCart() (Sesión 52).
   *
   *  Si el carrito tiene 0 items, oculta el badge. Si >0, lo muestra con el
   *  número (cap visual a "9+" para no romper el círculo si hay 10+ items).
   *  Lectura directa de localStorage para que pueda llamarse sin tener
   *  state local — útil tras header.js terminar de renderizar. */
  function refreshCartCountBadge() {
    const badge = document.getElementById('cartCount');
    if (!badge) return;  // página sin carrito (ej: seguimiento) — no hace nada
    const cart  = readCartFromStorage();
    const count = cart.reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0);
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('is-visible', count > 0);
  }

  // ── Sesión 53 Bloque 0 — Render unificado del contenido del drawer ─
  //
  // Antes de Sesión 53, cada página (index, producto, contacto, envios,
  // seguimiento, sobre-nosotros, tecnologia-rfid) tenía su propia copia
  // de `updateCart()` / `updateCartUI()` con ~60 líneas casi idénticas.
  // Esa duplicación generaba inconsistencias accidentales (placeholder
  // 🛍️ vs inicial, "Founder X" vs "X", tags de personalización solo en
  // 2 páginas, layouts distintos del botón ✕, etc.).
  //
  // `renderItems()` centraliza la pintada de los items + el footer
  // (subtotal, nota de envío). Cada página solo se ocupa de exponer
  // `changeQty(idx, delta)` y `removeItem(idx)` como funciones globales,
  // y el resto es uniforme.

  /** Precio efectivo de un item del carrito = precio base + extra de
   *  personalización láser. Si el item no tiene personalización, el extra
   *  es 0 y queda igual al precio base. */
  function itemEffectivePrice(item) {
    return (item?.price || 0) + (item?.personalizacion?.extra || 0);
  }

  /** Helper que devuelve el thumbnail optimizado si Cloudinary está
   *  disponible. Si no, devuelve la URL cruda. Es defensivo: muchas páginas
   *  cargan cloudinary.js, pero si alguna no lo hace, esto no rompe. */
  function thumb(url) {
    if (!url) return '';
    return (typeof window.cld === 'function') ? window.cld(url, 'thumb') : url;
  }

  /** Escapa comillas simples para que el atributo HTML `onerror` no se
   *  rompa con nombres con apóstrofes ("Founder D'Oro", etc.). */
  function escAttr(s) {
    return String(s || '').replace(/'/g, "\\'");
  }

  /** HTML del bloque de tags de personalización debajo del color.
   *  Antes solo aparecían en index/producto. Ahora aparecen en todas. */
  function buildPersonalizacionTags(item) {
    if (!item?.personalizacion) return '';
    const p = item.personalizacion;
    const tags = [];
    if (p.adelante) tags.push('Adelante');
    if (p.interior) tags.push('Interior');
    if (p.atras)    tags.push('Atrás');
    if (p.texto)    tags.push(`Texto: "${p.texto}"`);
    if (tags.length === 0) return '';
    return `
      <div style="font-size:9px;color:var(--color-gold);letter-spacing:1px;margin-top:4px;text-transform:uppercase">
        ✦ ${tags.join(' · ')}
      </div>`;
  }

  /** Recupera la foto si la URL guardada falla. Usado en `onerror` de
   *  cada <img>. Reconstruye desde el photoMap si está disponible, y
   *  si todo falla, muestra el placeholder con la inicial. */
  async function recoverCartPhoto(imgEl, name, color) {
    try {
      const url = getPhotoUrl(name, color);
      if (url) {
        imgEl.src = thumb(url);
        imgEl.onerror = () => {
          const ph = document.createElement('div');
          ph.className = 'cart-item__img-placeholder';
          ph.setAttribute('aria-hidden', 'true');
          ph.textContent = (name || '?')[0].toUpperCase();
          imgEl.parentNode?.replaceChild(ph, imgEl);
        };
        return;
      }
      // Sin foto en cache: forzar fetch del photoMap por si recién no estaba.
      await ensurePhotoMap();
      const url2 = getPhotoUrl(name, color);
      if (url2) {
        imgEl.src = thumb(url2);
        return;
      }
    } catch (_) { /* cae al placeholder */ }
    const ph = document.createElement('div');
    ph.className = 'cart-item__img-placeholder';
    ph.setAttribute('aria-hidden', 'true');
    ph.textContent = (name || '?')[0].toUpperCase();
    imgEl.parentNode?.replaceChild(ph, imgEl);
  }
  // Expongo `recoverCartPhoto` como global para que el `onerror` inline
  // del <img> lo encuentre (los atributos onerror evalúan en window scope).
  window.recoverCartPhoto = recoverCartPhoto;

  /** Formatea un precio en pesos uruguayos con separador de miles. */
  function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-UY');
  }

  /** Render principal del contenido del drawer. Idempotente: se puede
   *  llamar las veces que haga falta. Cada llamada:
   *    1) Refresca el badge numérico del header.
   *    2) Si el carrito está vacío: muestra el empty state + esconde footer.
   *    3) Si tiene items: pinta cada uno con foto / nombre / color /
   *       tags de personalización / controles +/− / precio / botón ✕.
   *    4) Actualiza subtotal y la nota de envío gratis.
   *    5) Si el photoMap aún no está cargado, lo dispara en background
   *       — cuando termina, cart.js mismo re-renderiza (las páginas no
   *       tienen que hacer nada).
   *
   *  Las páginas exponen `window.changeQty(idx, delta)` y
   *  `window.removeItem(idx)` como callbacks — esos handlers se ocupan
   *  de mutar el state local de la página y re-llamar a `renderItems()`.
   *
   *  Opciones:
   *    - freeShippingThreshold: monto a partir del cual el envío es gratis.
   *      Default: 2000 (consistente con todas las páginas). */
  function renderItems(opts = {}) {
    const freeShipping = Number(opts.freeShippingThreshold) || 2000;
    const cart    = readCartFromStorage();
    const itemsEl = document.getElementById('cartItems');
    const footer  = document.getElementById('cartFooter');

    // Badge siempre se refresca (todas las páginas lo tienen)
    refreshCartCountBadge();

    if (!itemsEl) return;  // página sin drawer renderizado todavía

    // ── Empty state ───────────────────────────────────────────
    if (cart.length === 0) {
      itemsEl.innerHTML =
        '<div class="cart__empty"><p>Tu carrito está vacío</p>' +
        '<span>Agregá productos para continuar</span></div>';
      if (footer) footer.style.display = 'none';
      return;
    }

    // ── Disparar carga del photoMap si aún no está listo ──────
    // Hacelo en background (sin await). Cuando termine, cart.js dispara
    // el evento 'founder-cart-photos-ready' y nuestro listener interno
    // re-llama a renderItems() automáticamente (ver final del IIFE).
    if (!photoMapReady) ensurePhotoMap();

    // ── Items ─────────────────────────────────────────────────
    const total = cart.reduce((s, i) => s + itemEffectivePrice(i) * i.qty, 0);

    itemsEl.innerHTML = cart.map((item, idx) => {
      const photoUrl  = getPhotoUrl(item.name, item.color);
      const inicial   = (item.name || '?')[0].toUpperCase();
      const lineTotal = itemEffectivePrice(item) * item.qty;
      const tags      = buildPersonalizacionTags(item);

      const imgHTML = photoUrl
        ? `<img src="${thumb(photoUrl)}" class="cart-item__img" alt="Founder ${item.name}" loading="lazy"
                onerror="window.recoverCartPhoto && window.recoverCartPhoto(this,'${escAttr(item.name)}','${escAttr(item.color)}');">`
        : `<div class="cart-item__img-placeholder" aria-hidden="true">${inicial}</div>`;

      return `
        <div class="cart-item">
          ${imgHTML}
          <div class="cart-item__info">
            <div class="cart-item__name">Founder ${item.name}</div>
            <div class="cart-item__variant">${item.color || ''}</div>
            ${tags}
            <div class="cart-item__controls">
              <button class="qty-btn" onclick="changeQty(${idx},-1)" aria-label="Reducir cantidad">−</button>
              <span class="qty-val" aria-label="Cantidad">${item.qty}</span>
              <button class="qty-btn" onclick="changeQty(${idx},1)" aria-label="Aumentar cantidad">+</button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="cart-item__price">${fmt(lineTotal)}</div>
            <button class="cart-item__remove" onclick="removeItem(${idx})" aria-label="Eliminar producto">✕</button>
          </div>
        </div>`;
    }).join('');

    // ── Footer (subtotal + nota de envío) ─────────────────────
    if (footer) footer.style.display = 'block';

    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = `${fmt(total)} UYU`;

    const note = document.getElementById('cartShipNote');
    if (note) {
      if (total >= freeShipping) {
        note.textContent = '🎁 ¡Tenés envío gratis!';
        note.style.color = 'var(--color-gold)';
      } else {
        const falta = freeShipping - total;
        note.textContent = `Agregá ${fmt(falta)} más para envío gratis`;
        note.style.color = 'var(--color-muted)';
      }
    }

    // ── Recordar la última config usada para que el auto-rerender
    //    post-photoMap-ready use el mismo umbral de envío. ──
    lastRenderOpts = { freeShippingThreshold: freeShipping };
  }

  // Estado del último render — usado por el listener interno de
  // 'founder-cart-photos-ready' para re-renderizar cuando llegan las fotos
  // sin que las páginas tengan que hacer nada.
  let lastRenderOpts = null;

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

  // ── Helper: clave de unicidad considerando personalización ──
  // Sesión 28 Bloque B: dos items con mismo producto+color pero
  // personalizaciones distintas DEBEN ser items separados del
  // carrito (no se combinan en qty).
  //
  // Esta función devuelve una clave estable que incluye la "huella"
  // de la personalización. Items con misma huella se combinan; con
  // huella distinta quedan separados.
  //
  // Para items SIN personalización → fingerprint = "" → comportamiento
  // exactamente igual al anterior (compatible hacia atrás).
  function personalizacionFingerprint(personalizacion) {
    if (!personalizacion) return '';
    // Estructura estable: tomamos solo los campos que importan para
    // identidad (NO incluimos `extra` porque es derivable). Ordenamos
    // las claves antes de stringify para que el orden no afecte.
    const stable = {
      adelante: personalizacion.adelante?.path || null,
      interior: personalizacion.interior?.path || null,
      atras:    personalizacion.atras?.path    || null,
      texto:    personalizacion.texto || '',
      indic:    personalizacion.indicaciones || '',
    };
    return JSON.stringify(stable);
  }

  /** Devuelve la clave de unicidad completa (producto|color|huella). */
  function itemKey(item) {
    return `${norm(item.name)}|${norm(item.color)}|${personalizacionFingerprint(item.personalizacion)}`;
  }

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
    ensurePhotoMap,
    // Personalización láser (Sesión 28 Bloque B)
    itemKey,
    personalizacionFingerprint,
    // Sesión 52 — badge numérico del carrito en el header (todas las páginas)
    refreshCartCountBadge,
    // Sesión 53 Bloque 0 — render unificado del drawer (reemplaza updateCart/updateCartUI duplicado)
    renderItems,
    itemEffectivePrice,
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

  // Sesión 52 — inicializar el badge numérico del carrito apenas el DOM tiene
  // el header montado. Esto hace que TODAS las páginas con header lo muestren
  // correctamente, no solo las que invocan updateCart() (index/producto).
  // El render() de arriba se ejecutó sync — DOM ya está listo.
  refreshCartCountBadge();

  // Sesión 53 Bloque 0 — Auto-rerender al recibir el evento de fotos listas.
  // Antes cada página secundaria tenía su propio
  //   window.addEventListener('founder-cart-photos-ready', updateCartUI);
  // Ahora cart.js mismo se suscribe una sola vez: cuando llegan las fotos,
  // si el drawer ya tiene items renderizados, los re-pinta para que las
  // fotos aparezcan sin que las páginas tengan que hacer nada. Funciona
  // tanto en páginas principales (index/producto) como secundarias.
  window.addEventListener('founder-cart-photos-ready', () => {
    if (lastRenderOpts) renderItems(lastRenderOpts);
  });
})();
