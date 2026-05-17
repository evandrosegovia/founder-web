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
      // Sesión 53 Bloque 1 — apagar el contador si quedó visible.
      removeUrgencyBlock();
      writeUrgencyExpiresAt(null);
      // Sesión 53 Bloque 2 — apagar el cross-sell si quedó visible.
      // (innerHTML='...' arriba ya lo borró pero por claridad lo dejamos.)
      removeCrossSellBlock();
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

    // ── Sesión 53 Bloque 1 — render del contador de urgencia.
    //    Se llama después de pintar items para que el bloque pueda
    //    insertarse arriba de #cartItems sin pelearse con innerHTML.
    renderUrgencyCounter();

    // ── Sesión 53 Bloque 2 — render del cross-sell.
    //    Se inserta al final de #cartItems. Si no aplica (apagado,
    //    carrito vacío, productos faltantes, etc.), no pinta nada.
    renderCrossSell();
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

  /** Devuelve la clave de unicidad completa (producto|color|huella|origen).
   *
   *  Sesión 53 Bloque 2: agregamos el "origen" del item para que un
   *  producto agregado normal (precio completo) y otro del cross-sell
   *  (precio descontado) NO se combinen en qty — son 2 items lógicos
   *  distintos aunque el producto + color sea el mismo.
   *  Origen posible: '', 'cross_sell', 'lleva_otra'. */
  function itemKey(item) {
    let origen = '';
    if (item?.from_cross_sell) origen = 'cross_sell';
    else if (item?.from_lleva_otra) origen = 'lleva_otra';
    return `${norm(item.name)}|${norm(item.color)}|${personalizacionFingerprint(item.personalizacion)}|${origen}`;
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

  // ── Sesión 53 Bloque 1 — Contador de urgencia ──────────────────────
  //
  // Renderiza un bloque arriba de #cartItems con un countdown MM:SS
  // configurable desde el admin. Reglas:
  //   - Si la config está apagada → no se muestra nada.
  //   - Si el carrito está vacío → no se muestra y se borra cualquier
  //     timer en curso (próxima vez que agregue, arranca fresh).
  //   - El timestamp de expiración se persiste en localStorage para
  //     sobrevivir navegación entre páginas (founder_cart_expires_at).
  //   - El timer arranca cuando el carrito pasa de 0 → 1+ items.
  //   - Cuando llega a 0:00, el bloque desaparece silenciosamente
  //     (no fuerza nada — es solo UX/urgencia).
  //   - Si el cliente vuelve a la página después de que expiró, no se
  //     reinicia hasta que vacíe y vuelva a llenar el carrito.

  const URGENCY_EXPIRES_KEY = 'founder_cart_expires_at';
  const URGENCY_BLOCK_ID    = 'cartUrgencyCounter';

  // Estado interno del módulo
  let urgencyConfig    = null;   // null = aún no cargada
  let urgencyConfigPromise = null;
  let urgencyTickTimer = null;   // id de setInterval, null si parado

  /** Lee la cart_config (idempotente, cachea el resultado).
   *  Si supabase-client.js no está disponible o falla, devuelve null
   *  y el contador no se muestra nunca (graceful degradation). */
  function ensureUrgencyConfig() {
    if (urgencyConfig !== null) return Promise.resolve(urgencyConfig);
    if (urgencyConfigPromise)   return urgencyConfigPromise;

    if (!window.founderDB || typeof window.founderDB.fetchCartConfig !== 'function') {
      urgencyConfig = false;  // marca como "intentado", evita reintentos
      return Promise.resolve(null);
    }

    urgencyConfigPromise = window.founderDB.fetchCartConfig()
      .then(cfg => {
        urgencyConfig = cfg || null;
        return urgencyConfig;
      })
      .catch(err => {
        console.warn('[founderCart] No se pudo cargar cart_config:', err);
        urgencyConfig = false;
        return null;
      });

    return urgencyConfigPromise;
  }

  /** Formatea segundos restantes a "MM:SS". Para valores > 60 min queda
   *  como "MM:SS" igual (no esperamos contadores tan largos). */
  function formatUrgencyTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /** Lee/escribe el expires_at del localStorage (timestamp en ms epoch). */
  function readUrgencyExpiresAt() {
    try {
      const raw = localStorage.getItem(URGENCY_EXPIRES_KEY);
      const n   = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch (_) { return null; }
  }
  function writeUrgencyExpiresAt(ts) {
    try {
      if (ts == null) localStorage.removeItem(URGENCY_EXPIRES_KEY);
      else            localStorage.setItem(URGENCY_EXPIRES_KEY, String(ts));
    } catch (_) { /* ignore */ }
  }

  /** Quita el bloque del DOM si estaba inyectado + detiene el tick. */
  function removeUrgencyBlock() {
    const block = document.getElementById(URGENCY_BLOCK_ID);
    if (block) block.remove();
    if (urgencyTickTimer) {
      clearInterval(urgencyTickTimer);
      urgencyTickTimer = null;
    }
  }

  /** Inyecta el HTML del bloque arriba de #cartItems si todavía no existe. */
  function ensureUrgencyBlockMounted() {
    if (document.getElementById(URGENCY_BLOCK_ID)) return true;
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return false;
    const div = document.createElement('div');
    div.id = URGENCY_BLOCK_ID;
    div.className = 'cart-urgency';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    div.innerHTML = '<span class="cart-urgency__icon" aria-hidden="true">⏱</span><span class="cart-urgency__text"></span>';
    itemsEl.parentNode.insertBefore(div, itemsEl);
    return true;
  }

  /** Pinta el texto del countdown reemplazando {tiempo} por MM:SS. */
  function paintUrgencyText(secondsLeft) {
    const block = document.getElementById(URGENCY_BLOCK_ID);
    if (!block) return;
    const textEl = block.querySelector('.cart-urgency__text');
    if (!textEl) return;
    const tpl = (urgencyConfig?.contador?.texto || 'Carrito reservado por {tiempo}');
    textEl.textContent = tpl.replace('{tiempo}', formatUrgencyTime(secondsLeft));
  }

  /** Tick principal del contador. Se llama una vez por segundo.
   *  Si el carrito quedó vacío durante el tick, se autodestruye. */
  function urgencyTick() {
    const cart = readCartFromStorage();
    if (cart.length === 0) {
      writeUrgencyExpiresAt(null);
      removeUrgencyBlock();
      return;
    }
    const expiresAt = readUrgencyExpiresAt();
    if (!expiresAt) { removeUrgencyBlock(); return; }

    const secondsLeft = (expiresAt - Date.now()) / 1000;
    if (secondsLeft <= 0) {
      // Expiró: borrar todo, no recrear hasta que el cart pase 0 → 1+
      writeUrgencyExpiresAt(null);
      removeUrgencyBlock();
      return;
    }
    paintUrgencyText(secondsLeft);
  }

  /** Render del contador. Se llama desde `renderItems()` cada vez que
   *  el drawer se re-pinta. Idempotente:
   *    - Si la config está apagada o sin cargar todavía → quita el bloque.
   *    - Si el carrito está vacío → quita el bloque + borra expires_at.
   *    - Si hay items y no había expires_at → lo crea (= NOW + duracion_min).
   *    - Si hay items y ya había expires_at vigente → respeta el que estaba.
   *    - Si hay items pero el expires_at vencido → no recrea, queda oculto. */
  function renderUrgencyCounter() {
    // 1) Asegurar que la config esté cargada. Es async — la primera vez
    //    devuelve sin pintar; el render se va a re-disparar cuando vuelvan
    //    las fotos o cuando el usuario interactúe con el carrito.
    if (urgencyConfig === null) {
      ensureUrgencyConfig().then(cfg => {
        // Trigger un re-render del drawer si ya estaba pintado. Se hace
        // vía dispatch de un evento custom escuchado abajo (idéntico
        // patrón que el de fotos).
        if (cfg) window.dispatchEvent(new CustomEvent('founder-cart-config-ready'));
      });
      return;
    }

    // 2) Si la config falló o el contador está apagado → fuera.
    const cfg = urgencyConfig && urgencyConfig.contador;
    if (!cfg || !cfg.enabled) { removeUrgencyBlock(); return; }

    const cart = readCartFromStorage();
    if (cart.length === 0) {
      writeUrgencyExpiresAt(null);
      removeUrgencyBlock();
      return;
    }

    // 3) Decidir el expires_at.
    let expiresAt = readUrgencyExpiresAt();
    const now = Date.now();
    if (!expiresAt || expiresAt <= now) {
      // Si no había expires_at pero hay items, este render es justo
      // después del primer addToCart. Creamos el timer.
      if (!expiresAt) {
        const duracionMin = Math.max(1, Number(cfg.duracion_min) || 7);
        expiresAt = now + duracionMin * 60 * 1000;
        writeUrgencyExpiresAt(expiresAt);
      } else {
        // expires_at vencido — no recreamos. Queda oculto.
        removeUrgencyBlock();
        return;
      }
    }

    // 4) Inyectar el bloque (idempotente) y arrancar el tick si no corre.
    if (!ensureUrgencyBlockMounted()) return;
    const secondsLeft = (expiresAt - now) / 1000;
    paintUrgencyText(secondsLeft);

    if (!urgencyTickTimer) {
      urgencyTickTimer = setInterval(urgencyTick, 1000);
    }
  }

  // Re-render cuando la config termina de cargar (primera visita)
  window.addEventListener('founder-cart-config-ready', () => {
    if (lastRenderOpts) renderItems(lastRenderOpts);
  });

  // ── Sesión 53 Bloque 2 — Cross-sell de 3 productos ───────────────
  //
  // Renderiza un bloque debajo de #cartItems con 3 productos del catálogo
  // a precio descontado. Reglas:
  //   - Si la config está apagada → no se muestra nada.
  //   - Si el carrito está vacío → no se muestra (no tiene sentido sugerir
  //     cuando todavía no hay nada).
  //   - Necesita 3 product_ids válidos. Si faltan o algún producto ya no
  //     existe en el catálogo, se ignoran los huecos y se muestran solo
  //     los válidos.
  //   - No se muestra ningún producto que ya esté en el carrito como item
  //     normal (evita "agregalo, ya lo tenés").
  //   - Click "Agregar" → entra al carrito con precio descontado y flag
  //     `from_cross_sell: true`. NO admite personalización láser.
  //   - El bloque vive dentro de #cartItems (queda dentro del scroll
  //     del drawer, no fijo abajo). Posición: al final del scroll.

  const CROSS_SELL_BLOCK_ID = 'cartCrossSell';

  // Cache de productos para el cross-sell (autónoma, no depende de state
  // de páginas principales).
  let crossSellProductsCache = null;
  let crossSellProductsPromise = null;

  function ensureCrossSellProducts() {
    if (crossSellProductsCache) return Promise.resolve(crossSellProductsCache);
    if (crossSellProductsPromise) return crossSellProductsPromise;

    if (!window.founderDB || typeof window.founderDB.fetchProducts !== 'function') {
      crossSellProductsCache = [];
      return Promise.resolve([]);
    }

    crossSellProductsPromise = window.founderDB.fetchProducts()
      .then(products => {
        crossSellProductsCache = Array.isArray(products) ? products : [];
        return crossSellProductsCache;
      })
      .catch(err => {
        console.warn('[founderCart] No se pudieron cargar productos para cross-sell:', err);
        crossSellProductsCache = [];
        return [];
      });

    return crossSellProductsPromise;
  }

  /** Calcula el precio efectivo de un producto del catálogo considerando
   *  ofertas activas en algún color. Si todas las variantes están a precio
   *  normal, devuelve product.price. Toma el color con mejor precio
   *  disponible (no agotado) para mostrar el descuento sobre el real. */
  /** Calcula el precio efectivo de un producto del catálogo y el color a
   *  mostrar en el cross-sell. Reglas (en orden de prioridad):
   *
   *  1. Excluir colores agotados (`sin_stock`).
   *  2. **Preferir colores que tengan foto en el photoMap** — esto evita
   *     que el cross-sell muestre un placeholder con la inicial mientras
   *     hay otros colores válidos con foto disponible.
   *  3. Entre los elegibles, elegir el de menor precio (considerando
   *     ofertas activas en cada color).
   *
   *  Si todos los colores están sin stock → devuelve {price:0,color:null}
   *  (el cross-sell salta ese producto). Si ningún color tiene foto en el
   *  photoMap aún (carrera de carga), cae al mejor precio sin filtro
   *  para no bloquear el render — la foto va a aparecer cuando el
   *  photoMap termine de cargar y se dispare el re-render. */
  function bestPriceForCrossSell(product) {
    const basePrice = Number(product?.price) || 0;
    const colores = product?.colors || [];
    const estados = product?.extras?.colores_estado || {};

    // Calcula el precio efectivo de un color (considerando oferta).
    const precioDe = (c) => {
      const estado = estados[c.name];
      if (estado === 'sin_stock') return null;
      const precioOferta = (estado === 'oferta')
        ? Number(estados[`${c.name}_precio_oferta`])
        : null;
      return (precioOferta && precioOferta > 0) ? precioOferta : basePrice;
    };

    // Primer pase: colores disponibles que ADEMÁS tienen foto en el photoMap.
    let best = null;
    let bestColor = null;
    for (const c of colores) {
      const precio = precioDe(c);
      if (precio === null) continue;
      const tieneFoto = !!getPhotoUrl(product.name, c.name);
      if (!tieneFoto) continue;
      if (best === null || precio < best) {
        best = precio;
        bestColor = c;
      }
    }
    if (bestColor) return { price: best, color: bestColor };

    // Segundo pase (fallback): si ningún color tiene foto (raro — solo
    // pasaría si photoMap aún no cargó), elegir el mejor precio igual.
    // El re-render automático va a corregir la foto cuando cargue.
    for (const c of colores) {
      const precio = precioDe(c);
      if (precio === null) continue;
      if (best === null || precio < best) {
        best = precio;
        bestColor = c;
      }
    }
    if (best === null) return { price: 0, color: null };
    return { price: best, color: bestColor };
  }

  /** Formatea un precio sin ',00' cuando es entero (UX más limpio).
   *  Antes: "$1.500,00 UYU" → Ahora: "$1.500" en bloques compactos. */
  function fmtPriceCompact(n) {
    return '$' + Number(n || 0).toLocaleString('es-UY', { maximumFractionDigits: 0 });
  }

  /** Quita el bloque del DOM si estaba inyectado. */
  function removeCrossSellBlock() {
    const block = document.getElementById(CROSS_SELL_BLOCK_ID);
    if (block) block.remove();
  }

  /** Renderiza el bloque de cross-sell debajo de los items.
   *  Idempotente. Se llama desde renderItems(). */
  function renderCrossSell() {
    // 1) Asegurar que urgencyConfig esté cargada (compartida con el contador).
    //    Si todavía no está, salimos sin pintar — el listener de
    //    'founder-cart-config-ready' va a re-disparar el render.
    if (urgencyConfig === null) {
      ensureUrgencyConfig();  // ya dispara la carga si no estaba
      return;
    }

    const cfg = urgencyConfig && urgencyConfig.cross_sell;

    // 2) Master switch apagado o config corrupta
    if (!cfg || !cfg.enabled) { removeCrossSellBlock(); return; }

    // 3) Carrito vacío → no tiene sentido sugerir
    const cart = readCartFromStorage();
    if (cart.length === 0) { removeCrossSellBlock(); return; }

    // 4) IDs configurados (filtramos huecos)
    const ids = (Array.isArray(cfg.product_ids) ? cfg.product_ids : [])
      .filter(id => id != null && id !== '');
    if (ids.length === 0) { removeCrossSellBlock(); return; }

    // 5) Cargar catálogo (async). Mientras carga no pintamos nada.
    //    Cuando termine, el evento de fotos-listas dispara un re-render
    //    (porque fetchProducts y fetchPhotoMap usan el mismo path lógico
    //    en Supabase, suelen completarse en el mismo ciclo).
    if (!crossSellProductsCache) {
      ensureCrossSellProducts().then(() => {
        if (lastRenderOpts) renderItems(lastRenderOpts);
      });
      return;
    }

    // 6) Buscar productos por dbId (UUID de Supabase, estable entre admin
    //    y frontend público). El campo `id` del cliente público es un
    //    entero secuencial generado en cada fetch — NO sirve como clave.
    const products = ids
      .map(id => crossSellProductsCache.find(p => String(p.dbId) === String(id)))
      .filter(p => p);
    if (products.length === 0) { removeCrossSellBlock(); return; }

    // 7) Excluir productos que YA están en el carrito como items normales.
    //    Comparamos por NOMBRE — los IDs son numéricos secuenciales del Sheet
    //    y pueden cambiar; el nombre es estable.
    const cartNames = new Set(cart.map(i => norm(i.name)));
    const candidates = products.filter(p => !cartNames.has(norm(p.name)));
    if (candidates.length === 0) { removeCrossSellBlock(); return; }

    // 8) Aplicar descuento + filtrar agotados
    const descPct = Math.max(0, Math.min(99, Number(cfg.descuento_pct) || 0));
    const items = candidates
      .map(p => {
        const { price: basePrice, color } = bestPriceForCrossSell(p);
        if (!color || basePrice <= 0) return null;
        const precioDescontado = Math.round(basePrice * (1 - descPct / 100));
        return { product: p, color, basePrice, precioDescontado };
      })
      .filter(x => x);
    if (items.length === 0) { removeCrossSellBlock(); return; }

    // 9) Inyectar el bloque al final de #cartItems
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    removeCrossSellBlock();  // limpiamos antes de re-pintar

    const titulo = cfg.titulo || '✦ Comprá juntos y ahorrá';
    const cardsHTML = items.map(({ product, color, basePrice, precioDescontado }) => {
      const photoUrl = getPhotoUrl(product.name, color.name);
      const inicial = (product.name || '?')[0].toUpperCase();
      const imgHTML = photoUrl
        ? `<img src="${thumb(photoUrl)}" class="cart-cs__img" alt="Founder ${product.name}" loading="lazy"
                onerror="window.recoverCartPhoto && window.recoverCartPhoto(this,'${escAttr(product.name)}','${escAttr(color.name)}');">`
        : `<div class="cart-cs__img-placeholder" aria-hidden="true">${inicial}</div>`;
      return `
        <div class="cart-cs__card" data-product-id="${product.dbId}">
          ${imgHTML}
          <div class="cart-cs__info">
            <div class="cart-cs__name">Founder ${product.name}</div>
            <div class="cart-cs__color">${color.name}</div>
            <div class="cart-cs__prices">
              <span class="cart-cs__price-old">${fmtPriceCompact(basePrice)}</span>
              <span class="cart-cs__price-new">${fmtPriceCompact(precioDescontado)}</span>
            </div>
          </div>
          <button class="cart-cs__add"
                  onclick="window.founderCart.addCrossSellToCart('${escAttr(String(product.dbId))}','${escAttr(color.name)}')"
                  aria-label="Agregar ${product.name} al carrito">
            +
          </button>
        </div>`;
    }).join('');

    const block = document.createElement('div');
    block.id = CROSS_SELL_BLOCK_ID;
    block.className = 'cart-cs';
    block.innerHTML = `
      <div class="cart-cs__head">
        <div class="cart-cs__title">${titulo}</div>
        ${descPct > 0 ? `<div class="cart-cs__badge">${descPct}% OFF</div>` : ''}
      </div>
      <div class="cart-cs__list">${cardsHTML}</div>
    `;
    itemsEl.appendChild(block);
  }

  /** Agrega un producto del cross-sell al carrito a precio descontado.
   *  Expuesta como window.founderCart.addCrossSellToCart() para el
   *  onclick inline de cada card.
   *
   *  @param productId  UUID del producto (dbId).
   *  @param colorName  Nombre del color que se mostró en la card. Lo pasamos
   *                    explícito desde el HTML para garantizar que el item
   *                    que entra al carrito sea idéntico al que el cliente
   *                    vio en pantalla. Si no se provee, se recalcula. */
  function addCrossSellToCart(productId, colorName) {
    if (!crossSellProductsCache) return;
    const product = crossSellProductsCache.find(p => String(p.dbId) === String(productId));
    if (!product) return;

    const cfg = urgencyConfig?.cross_sell;
    if (!cfg || !cfg.enabled) return;

    // Buscar el color por nombre (si vino del click) o recalcular si no.
    let chosenColor = null;
    let basePrice = 0;
    if (colorName) {
      chosenColor = (product.colors || []).find(c => c.name === colorName) || null;
      const estados = product?.extras?.colores_estado || {};
      const estado = chosenColor ? estados[chosenColor.name] : null;
      if (estado === 'sin_stock') {
        // El color quedó agotado entre el render y el click — abortar.
        if (typeof window.showToast === 'function') {
          window.showToast('Ese color se agotó, refrescá el carrito.', 'error');
        }
        return;
      }
      const precioOferta = (estado === 'oferta')
        ? Number(estados[`${chosenColor.name}_precio_oferta`])
        : null;
      basePrice = (precioOferta && precioOferta > 0)
        ? precioOferta
        : (Number(product.price) || 0);
    }
    if (!chosenColor) {
      // Fallback defensivo: si por algún motivo el color no se pasó o no
      // existe ya, usar bestPriceForCrossSell.
      const r = bestPriceForCrossSell(product);
      chosenColor = r.color;
      basePrice   = r.price;
    }
    if (!chosenColor || basePrice <= 0) return;

    const descPct = Math.max(0, Math.min(99, Number(cfg.descuento_pct) || 0));
    const precioDescontado = Math.round(basePrice * (1 - descPct / 100));

    // Leer cart actual + agregar item nuevo
    const cart = readCartFromStorage();
    const newItem = {
      id:    product.id,
      name:  product.name,
      color: chosenColor.name,
      price: precioDescontado,
      qty:   1,
      from_cross_sell: true,    // flag para no permitir personalización
                                // y diferenciar del item normal en itemKey
    };

    // Deduplicación por itemKey (incluye origen, ver itemKey arriba).
    // Si ya hay un item de cross-sell del mismo producto+color, sumar qty.
    const newKey = itemKey(newItem);
    const existing = cart.find(i => itemKey(i) === newKey);
    if (existing) {
      existing.qty++;
    } else {
      cart.push(newItem);
    }

    // Persistir y disparar re-render
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}

    // Avisar al state local de las páginas principales (index/producto)
    // mediante un evento. Las páginas que tengan state.cart van a
    // re-sincronizarlo desde localStorage al recibirlo.
    window.dispatchEvent(new CustomEvent('founder-cart-external-update'));

    // Re-render del drawer
    if (lastRenderOpts) renderItems(lastRenderOpts);

    // Feedback visual leve (toast) — usa la función global si existe
    if (typeof window.showToast === 'function') {
      window.showToast(`Founder ${product.name} agregado con ${descPct}% OFF`, 'success');
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
    // Sesión 53 Bloque 2 — cross-sell: agregar producto al carrito desde el bloque
    addCrossSellToCart,
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

/* ── Sesión 53 Bloque 1 — Contador de urgencia ─────────────────────
   Bloque que aparece arriba de los items del carrito cuando está
   habilitado desde el admin. Look discreto, sin alarmas — es solo
   un nudge visual de "tu carrito está esperándote". */
.cart-urgency {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 10px 14px;
  background: rgba(201, 169, 110, 0.08);
  border: 1px solid rgba(201, 169, 110, 0.35);
  border-radius: 3px;
  color: var(--color-gold);
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.cart-urgency__icon {
  font-size: 13px;
  line-height: 1;
  opacity: 0.85;
}
.cart-urgency__text {
  flex: 1;
  min-width: 0;
  line-height: 1.4;
}

/* ── Sesión 53 Bloque 2 — Cross-sell de productos ──────────────────
   Bloque que aparece al final de #cartItems con 3 sugerencias a precio
   descontado. Look complementario a los items principales: foto chica,
   precio tachado + nuevo en dorado, botón "+" minimalista. */
.cart-cs {
  margin: 24px 16px 12px;
  padding: 14px 0 0;
  border-top: 1px dashed rgba(201, 169, 110, 0.25);
}
.cart-cs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.cart-cs__title {
  color: var(--color-gold);
  font-family: var(--font-serif, 'Cormorant Garamond', serif);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0.5px;
}
.cart-cs__badge {
  display: inline-block;
  padding: 3px 8px;
  background: var(--color-gold);
  color: var(--color-bg);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  border-radius: 2px;
  white-space: nowrap;
}
.cart-cs__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cart-cs__card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  transition: border-color .2s ease, background .2s ease;
}
.cart-cs__card:hover {
  border-color: rgba(201, 169, 110, 0.35);
  background: rgba(201, 169, 110, 0.04);
}
.cart-cs__img,
.cart-cs__img-placeholder {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
}
.cart-cs__img-placeholder {
  background: var(--color-surface2, #2a2a2a);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-gold);
  font-family: var(--font-serif, 'Cormorant Garamond', serif);
  font-size: 20px;
}
.cart-cs__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cart-cs__name {
  font-family: var(--font-serif, 'Cormorant Garamond', serif);
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.2;
}
.cart-cs__color {
  font-size: 9px;
  color: var(--color-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.cart-cs__prices {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 2px;
}
.cart-cs__price-old {
  font-size: 10px;
  color: var(--color-muted);
  text-decoration: line-through;
}
.cart-cs__price-new {
  font-size: 13px;
  color: var(--color-gold);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.cart-cs__add {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-gold);
  background: transparent;
  color: var(--color-gold);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
  transition: all .2s ease;
  font-family: inherit;
}
.cart-cs__add:hover {
  background: var(--color-gold);
  color: var(--color-bg);
}
.cart-cs__add:active {
  transform: scale(0.95);
}
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
