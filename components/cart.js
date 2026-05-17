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

  /** Escapa caracteres HTML (`&`, `<`, `>`, `"`, `'`) para insertar texto
   *  de forma segura dentro de innerHTML / template strings. Usar siempre
   *  que se mezcle data del DB con HTML literal (ej: nombres de productos
   *  o colores que podrían tener un `<` accidental). */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Sesión 53 Bloque 4 — Highlight tip dorado anclado al item ─────
  //
  // Reemplaza al "toast contextual global" anterior. En lugar de un
  // mensaje flotante fixed en pantalla, este tip aparece JUSTO DEBAJO
  // del item del carrito que el cliente acaba de agregar. Es más
  // contextual: el cliente ve el item nuevo + la sugerencia en el
  // mismo lugar visual.
  //
  // Diseño:
  //   - Estado: { itemKey, message, expiresAt } guardado en memoria.
  //   - En cada renderItems, después de pintar los items normales,
  //     buscamos el div del item con ese key y le inyectamos el tip
  //     debajo. Si el item ya no está (lo eliminaron, expiró el
  //     timer), no inyectamos nada.
  //   - Auto-limpieza por timer de 8s.
  //   - Si se agrega otro producto antes de los 8s, el tip se mueve
  //     al nuevo item (un solo tip activo a la vez).

  const HIGHLIGHT_TIP_CLASS = 'cart-tip';
  let highlightTip = null;       // { itemKey, message, expiresAt } | null
  let highlightTipTimer = null;

  /** Activa un tip vinculado a un item. itemKey debe ser el resultado de
   *  itemKey(newItem) exactamente, para que sea reproducible en cada
   *  re-render del drawer. */
  function showItemTip(itemKeyValue, message, ms) {
    highlightTip = {
      itemKey:   itemKeyValue,
      message:   String(message || ''),
      expiresAt: Date.now() + Math.max(1000, Number(ms) || 8000),
    };
    if (highlightTipTimer) clearTimeout(highlightTipTimer);
    highlightTipTimer = setTimeout(() => {
      highlightTip = null;
      highlightTipTimer = null;
      // Re-render para quitar el tip del DOM
      if (lastRenderOpts) renderItems(lastRenderOpts);
    }, Math.max(1000, Number(ms) || 8000));
  }

  /** Inyecta el tip debajo del item con itemKey activo. Llamada desde
   *  renderItems después de pintar los items. Idempotente. */
  function applyHighlightTip() {
    if (!highlightTip) return;
    if (Date.now() >= highlightTip.expiresAt) {
      highlightTip = null;
      return;
    }
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    // Buscar el div del item con ese itemKey. Como `cart-item` no expone
    // el key directamente en el DOM, lo agregamos como data-attr durante
    // el render (ver mod en renderItems abajo).
    const targetItemEl = itemsEl.querySelector(
      `[data-item-key="${CSS.escape(highlightTip.itemKey)}"]`
    );
    if (!targetItemEl) {
      // El item ya no está en el carrito (lo eliminaron o cambió su key)
      // → limpiar el tip silenciosamente.
      highlightTip = null;
      if (highlightTipTimer) { clearTimeout(highlightTipTimer); highlightTipTimer = null; }
      return;
    }
    const tip = document.createElement('div');
    tip.className = HIGHLIGHT_TIP_CLASS;
    tip.setAttribute('role', 'status');
    tip.setAttribute('aria-live', 'polite');
    tip.textContent = highlightTip.message;
    // Insertar justo después del item recién agregado
    targetItemEl.insertAdjacentElement('afterend', tip);
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
      // Sesión 53 Bloque 3 — apagar el bloque Llevá otra.
      removeLlevaOtraBlock();
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
      // Sesión 53 Bloque 4 — Botón "Editar" condicional. Solo se muestra si:
      //   - El item NO es de cross-sell (cross-sell no admite edición por
      //     diseño, ver ESTADO.md sesión 53).
      //   - Existe algo para editar: producto con personalización habilitada,
      //     O producto con más de 1 color disponible.
      // `canEditItem` revisa el catálogo cacheado para responder estas
      // preguntas. Si todavía no se cargó el catálogo, retorna true por
      // defecto (mejor mostrar y que se descubra en el modal que no hay
      // nada que editar, antes que ocultar incorrectamente).
      const editBtnHTML = canEditItem(item)
        ? `<button class="cart-item__edit" onclick="window.founderCart.editCartItem(${idx})" aria-label="Editar personalización o color">✎ Editar</button>`
        : '';

      const imgHTML = photoUrl
        ? `<img src="${thumb(photoUrl)}" class="cart-item__img" alt="Founder ${item.name}" loading="lazy"
                onerror="window.recoverCartPhoto && window.recoverCartPhoto(this,'${escAttr(item.name)}','${escAttr(item.color)}');">`
        : `<div class="cart-item__img-placeholder" aria-hidden="true">${inicial}</div>`;

      return `
        <div class="cart-item" data-item-key="${escAttr(itemKey(item))}">
          ${imgHTML}
          <div class="cart-item__info">
            <div class="cart-item__name">Founder ${item.name}</div>
            <div class="cart-item__variant">${item.color || ''}</div>
            ${tags}
            <div class="cart-item__controls">
              <button class="qty-btn" onclick="changeQty(${idx},-1)" aria-label="Reducir cantidad">−</button>
              <span class="qty-val" aria-label="Cantidad">${item.qty}</span>
              <button class="qty-btn" onclick="changeQty(${idx},1)" aria-label="Aumentar cantidad">+</button>
              ${editBtnHTML}
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

    // ── Sesión 53 Bloque 4 — Highlight tip anclado al item recién
    //    agregado. Se inserta como sibling después del item, ANTES
    //    del bloque cross-sell, para que visualmente quede pegado al
    //    item que acabás de agregar.
    applyHighlightTip();

    // ── Sesión 53 Bloque 2 — render del cross-sell.
    //    Se inserta al final de #cartItems. Si no aplica (apagado,
    //    carrito vacío, productos faltantes, etc.), no pinta nada.
    renderCrossSell();

    // ── Sesión 53 Bloque 3 — render del bloque "Llevá otra".
    //    Mutuamente excluyente con cross-sell (si cross-sell está ON,
    //    este no se muestra). Se inserta al final de #cartItems.
    renderLlevaOtra();
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
    // Sesión 53 Bloque 1 (Opción D — barra fina arriba + texto abajo):
    //   - .cart-urgency__bar:    track horizontal de 3px arriba del bloque
    //   - .cart-urgency__bar-fill: relleno dorado que se va achicando
    //   - .cart-urgency__body:   contenido textual con ícono + label + MM:SS
    div.innerHTML =
      '<div class="cart-urgency__bar"><div class="cart-urgency__bar-fill"></div></div>' +
      '<div class="cart-urgency__body">' +
        '<span class="cart-urgency__icon" aria-hidden="true">⏱</span>' +
        '<span class="cart-urgency__text"></span>' +
      '</div>';
    itemsEl.parentNode.insertBefore(div, itemsEl);
    return true;
  }

  /** Pinta el texto del countdown reemplazando {tiempo} por MM:SS,
   *  y actualiza el ancho del relleno de la barra de progreso.
   *
   *  El porcentaje restante = (tiempo_restante / duracion_total_seg) * 100.
   *  Cuando arranca el timer, la barra está al 100% y se va vaciando
   *  hasta 0% al expirar. */
  function paintUrgencyText(secondsLeft) {
    const block = document.getElementById(URGENCY_BLOCK_ID);
    if (!block) return;

    // Texto MM:SS
    const textEl = block.querySelector('.cart-urgency__text');
    if (textEl) {
      const tpl = (urgencyConfig?.contador?.texto || 'Carrito reservado por {tiempo}');
      textEl.textContent = tpl.replace('{tiempo}', formatUrgencyTime(secondsLeft));
    }

    // Barra de progreso (Opción D): % restante sobre la duración total.
    const fillEl = block.querySelector('.cart-urgency__bar-fill');
    if (fillEl) {
      const totalMin = Math.max(1, Number(urgencyConfig?.contador?.duracion_min) || 7);
      const totalSec = totalMin * 60;
      const pct = Math.max(0, Math.min(100, (secondsLeft / totalSec) * 100));

      // Primer pintado: aplicar sin transición para que la barra arranque
      // en la posición correcta sin animarse desde 100%. A partir del
      // segundo pintado, la transition CSS toma efecto y se anima suave
      // entre ticks de 1s.
      if (!fillEl.dataset._inited) {
        const prev = fillEl.style.transition;
        fillEl.style.transition = 'none';
        fillEl.style.width = pct.toFixed(2) + '%';
        // Forzar reflow para que el browser aplique el width sin transition.
        // Después restaurar la transition para los próximos paints.
        void fillEl.offsetWidth;
        fillEl.style.transition = prev || '';
        fillEl.dataset._inited = '1';
      } else {
        fillEl.style.width = pct.toFixed(2) + '%';
      }
    }
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

  // Sesión 53 Bloque 4 — Selección de color por card del cross-sell.
  // Cada card recuerda qué color tiene seleccionado el cliente. Se
  // resetea cuando el cliente cierra el carrito o navega de página.
  // Mapa: { [dbId]: colorName }.
  const crossSellSelectedColors = {};

  /** Genera el background CSS de un swatch de color, respetando el
   *  patrón rayado del color "Carbon". Replica exactamente lo que hace
   *  swatchBackground() en index.html y producto.html — lo duplicamos
   *  acá adentro para que cart.js sea autosuficiente y funcione en
   *  páginas secundarias que no exponen esa función. */
  function swatchBackgroundForChip(color) {
    if (!color) return '#555';
    if (color.pattern) {
      return 'repeating-linear-gradient(45deg,var(--swatch-carbon) 0,var(--swatch-carbon) 4px,#4a4a4a 4px,#4a4a4a 8px)';
    }
    return color.css || color.hex || '#555';
  }

  /** Resuelve los datos visuales (hex/css/pattern) para un color del DB
   *  buscando en window.FOUNDER_COLOR_MAP. En páginas que no lo expongan
   *  (secundarias), cae a un fallback hex con el color crudo. */
  function getColorVisualForChip(name) {
    const map = (typeof window !== 'undefined' && window.FOUNDER_COLOR_MAP) || {};
    return map[name] || { hex: '#555' };
  }

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
    // Calcular el "estado base" de cada item: color inicial (mejor precio)
    // y la lista completa de colores disponibles para elegir.
    const items = candidates
      .map(p => {
        const { price: bestBasePrice, color: bestColor } = bestPriceForCrossSell(p);
        if (!bestColor || bestBasePrice <= 0) return null;

        // Colores disponibles (no agotados) para mostrar como chips.
        const estados = p?.extras?.colores_estado || {};
        const coloresDisp = (p.colors || []).filter(c => estados[c.name] !== 'sin_stock');

        // ¿Qué color se muestra en esta card? El cliente puede haber
        // tocado un chip y haber seleccionado otro — eso lo memoriza
        // `crossSellSelectedColors[dbId]`. Si no eligió nada todavía,
        // usamos el "best price" como default.
        const selectedName = crossSellSelectedColors[p.dbId] || bestColor.name;
        const selectedColor = coloresDisp.find(c => c.name === selectedName) || bestColor;

        // Recalcular precio para el color realmente seleccionado.
        const estadoSel = estados[selectedColor.name];
        const precioOfertaSel = (estadoSel === 'oferta')
          ? Number(estados[`${selectedColor.name}_precio_oferta`])
          : null;
        const basePrice = (precioOfertaSel && precioOfertaSel > 0)
          ? precioOfertaSel
          : (Number(p.price) || 0);
        const precioDescontado = Math.round(basePrice * (1 - descPct / 100));

        return {
          product:        p,
          color:          selectedColor,
          basePrice,
          precioDescontado,
          coloresDisp,
        };
      })
      .filter(x => x);
    if (items.length === 0) { removeCrossSellBlock(); return; }

    // 9) Inyectar el bloque al final de #cartItems
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    removeCrossSellBlock();  // limpiamos antes de re-pintar

    const titulo = cfg.titulo || '✦ Comprá juntos y ahorrá';
    const cardsHTML = items.map(({ product, color, basePrice, precioDescontado, coloresDisp }) => {
      const photoUrl = getPhotoUrl(product.name, color.name);
      const inicial = (product.name || '?')[0].toUpperCase();
      const nameSafe  = escHtml(product.name);
      const colorSafe = escHtml(color.name);
      const imgHTML = photoUrl
        ? `<img src="${thumb(photoUrl)}" class="cart-cs__img" alt="Founder ${nameSafe}" loading="lazy"
                onerror="window.recoverCartPhoto && window.recoverCartPhoto(this,'${escAttr(product.name)}','${escAttr(color.name)}');">`
        : `<div class="cart-cs__img-placeholder" aria-hidden="true">${inicial}</div>`;

      // Sesión 53 Bloque 4 — Chips rectangulares de color (mini, estilo
      // producto.html pero más chico). Solo se muestran si hay más de 1
      // color disponible — si hay 1, no tiene sentido un selector.
      let chipsHTML = '';
      if (coloresDisp.length > 1) {
        chipsHTML = `<div class="cart-cs__chips">${coloresDisp.map(c => {
          const visual = { ...c, ...(getColorVisualForChip(c.name)) };
          const bg = swatchBackgroundForChip(visual);
          const isSel = c.name === color.name;
          return `<button type="button"
                          class="cart-cs__chip ${isSel ? 'is-selected' : ''}"
                          style="background:${bg}"
                          data-cs-dbid="${escAttr(String(product.dbId))}"
                          data-cs-color="${escAttr(c.name)}"
                          title="${escHtml(c.name)}"
                          aria-label="${escHtml(c.name)}"
                          aria-pressed="${isSel}"></button>`;
        }).join('')}</div>`;
      }

      return `
        <div class="cart-cs__card" data-product-id="${product.dbId}">
          ${imgHTML}
          <div class="cart-cs__info">
            <div class="cart-cs__name">Founder ${nameSafe}<span class="cart-cs__color-inline"> — ${colorSafe}</span></div>
            <div class="cart-cs__prices">
              <span class="cart-cs__price-old">${fmtPriceCompact(basePrice)}</span>
              <span class="cart-cs__price-new">${fmtPriceCompact(precioDescontado)}</span>
            </div>
            ${chipsHTML}
          </div>
          <button class="cart-cs__add"
                  onclick="window.founderCart.addCrossSellToCart('${escAttr(String(product.dbId))}','${escAttr(color.name)}')"
                  aria-label="Agregar ${nameSafe} al carrito">
            +
          </button>
        </div>`;
    }).join('');

    const block = document.createElement('div');
    block.id = CROSS_SELL_BLOCK_ID;
    block.className = 'cart-cs';
    block.innerHTML = `
      <div class="cart-cs__head">
        <div class="cart-cs__title">${escHtml(titulo)}</div>
        ${descPct > 0 ? `<div class="cart-cs__badge">${descPct}% OFF</div>` : ''}
      </div>
      <div class="cart-cs__list">${cardsHTML}</div>
    `;
    itemsEl.appendChild(block);

    // Wirear los chips de color con event delegation. Click en un chip
    // → guardar el color seleccionado para ese dbId y re-renderizar el
    // bloque (el resto del drawer no necesita re-render).
    block.querySelectorAll('.cart-cs__chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const dbId = chip.dataset.csDbid;
        const colorName = chip.dataset.csColor;
        if (!dbId || !colorName) return;
        crossSellSelectedColors[dbId] = colorName;
        // Re-render del cross-sell completo (solo este bloque). renderItems
        // hace más cosas que no queremos repetir, así que llamamos al
        // helper directamente.
        renderCrossSell();
      });
    });
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

    // Sesión 53 Bloque 4 — Highlight tip anclado al item recién agregado.
    // Aparece como una pequeña banda dorada debajo del item con un mensaje
    // contextual de 8s sugiriendo editar/personalizar. Si el cliente
    // agrega otro item del cross-sell durante esos 8s, el tip salta al
    // nuevo item (reemplazo limpio).
    //
    // Pequeño delay (700ms) para no competir con el toast verde de
    // "Agregado con X% OFF" del sistema global — primero el cliente ve
    // confirmación, después la sugerencia contextual.
    setTimeout(() => {
      showItemTip(newKey, '✨ Podés personalizarlo o cambiar color desde Editar', 8000);
      // Triggear un re-render para que applyHighlightTip lo inyecte
      if (lastRenderOpts) renderItems(lastRenderOpts);
    }, 700);
  }

  // ── Sesión 53 Bloque 3 — Llevá otra ────────────────────────────
  //
  // Renderiza un bloque al final de #cartItems que ofrece sumar otra
  // unidad de un producto del carrito a precio descontado. Reglas:
  //
  //   - Solo se muestra si: config enabled + carrito tiene al menos
  //     1 item normal (no cross-sell ni lleva_otra) + cross_sell.enabled
  //     no está prendido (regla mutuamente excluyente: prioridad
  //     cross-sell por consistencia con el admin).
  //
  //   - El cliente elige cuál producto duplicar desde un <select>.
  //
  //   - Al hacer click "Llevá otra":
  //     * Si permite_cambio_color === false Y el producto NO admite
  //       personalización → agrego directo (item con from_lleva_otra=true).
  //     * En otro caso → abro modal de personalización (lp-bubble) con
  //       el color preseleccionado y el panel de grabado disponible.
  //
  //   - El item agregado nunca se combina con uno normal del carrito
  //     gracias al `from_lleva_otra: true` (itemKey lo distingue).

  const LLEVA_OTRA_BLOCK_ID = 'cartLlevaOtra';

  function removeLlevaOtraBlock() {
    const block = document.getElementById(LLEVA_OTRA_BLOCK_ID);
    if (block) block.remove();
  }

  /** Lista de items del carrito que SON candidatos para "Llevá otra".
   *  Excluye items que ya son cross-sell o lleva-otra (no queremos
   *  cascada infinita). */
  function llevaOtraCandidates() {
    return readCartFromStorage().filter(i => !i.from_cross_sell && !i.from_lleva_otra);
  }

  function renderLlevaOtra() {
    // Esperar a que urgencyConfig esté cargada (compartida con los otros sub-features)
    if (urgencyConfig === null) {
      ensureUrgencyConfig();
      return;
    }
    const cfg = urgencyConfig && urgencyConfig.lleva_otra;
    if (!cfg || !cfg.enabled) { removeLlevaOtraBlock(); return; }

    // Mutuamente excluyente con cross-sell (prioridad cross-sell si por
    // error ambos quedaron prendidos)
    if (urgencyConfig.cross_sell?.enabled) { removeLlevaOtraBlock(); return; }

    const candidates = llevaOtraCandidates();
    if (candidates.length === 0) { removeLlevaOtraBlock(); return; }

    // Asegurar catálogo (para resolver el producto al hacer click).
    if (!crossSellProductsCache) {
      ensureCrossSellProducts().then(() => {
        if (lastRenderOpts) renderItems(lastRenderOpts);
      });
      return;
    }

    // Sesión 53 Bloque 4 — Reemplazo del dropdown por mini-cards
    // horizontales (mismo estilo que cross-sell). Cada candidate del
    // carrito se convierte en una card con foto + nombre + color
    // original + precio descontado + botón "+".
    const descPct = Math.max(0, Math.min(99, Number(cfg.descuento_pct) || 0));

    // Para cada candidate, buscar su producto en el catálogo para
    // obtener la foto correcta (sin esto sale placeholder).
    const items = candidates.map((it, idx) => {
      const product = (crossSellProductsCache || []).find(p => norm(p.name) === norm(it.name));
      const baseSinExtra = Number(it.price) || 0;
      const precioDesc = Math.round(baseSinExtra * (1 - descPct / 100));
      return {
        item:        it,
        idx,
        product:     product || null,
        basePrice:   baseSinExtra,
        precioDesc,
      };
    });

    removeLlevaOtraBlock();
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    const titulo = cfg.texto || 'Llevá otra para regalar';
    const cardsHTML = items.map(({ item, idx, product, basePrice, precioDesc }) => {
      const colorName  = item.color || '';
      const productName = item.name || '';
      const photoUrl = product ? getPhotoUrl(productName, colorName) : null;
      const inicial = (productName || '?')[0].toUpperCase();
      const nameSafe  = escHtml(productName);
      const colorSafe = escHtml(colorName);
      const imgHTML = photoUrl
        ? `<img src="${thumb(photoUrl)}" class="cart-cs__img" alt="Founder ${nameSafe}" loading="lazy"
                onerror="window.recoverCartPhoto && window.recoverCartPhoto(this,'${escAttr(productName)}','${escAttr(colorName)}');">`
        : `<div class="cart-cs__img-placeholder" aria-hidden="true">${inicial}</div>`;
      return `
        <div class="cart-cs__card" data-lo-candidate-idx="${idx}">
          ${imgHTML}
          <div class="cart-cs__info">
            <div class="cart-cs__name">Founder ${nameSafe}<span class="cart-cs__color-inline"> — ${colorSafe}</span></div>
            <div class="cart-cs__prices">
              <span class="cart-cs__price-old">${fmtPriceCompact(basePrice)}</span>
              <span class="cart-cs__price-new">${fmtPriceCompact(precioDesc)}</span>
            </div>
          </div>
          <button class="cart-cs__add"
                  data-lo-add-idx="${idx}"
                  aria-label="Llevá otra Founder ${nameSafe}">
            +
          </button>
        </div>`;
    }).join('');

    const block = document.createElement('div');
    block.id = LLEVA_OTRA_BLOCK_ID;
    block.className = 'cart-cs cart-lo-as-cs';  // reusa estilo del cross-sell
    block.innerHTML = `
      <div class="cart-cs__head">
        <div class="cart-cs__title">🎁 ${escHtml(titulo)}</div>
        ${descPct > 0 ? `<div class="cart-cs__badge">${descPct}% OFF</div>` : ''}
      </div>
      <div class="cart-cs__list">${cardsHTML}</div>
    `;
    itemsEl.appendChild(block);

    // Wirear los botones "+" de cada mini-card
    block.querySelectorAll('[data-lo-add-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.loAddIdx, 10);
        if (Number.isFinite(idx)) onLlevaOtraAddByIdx(idx);
      });
    });
  }

  /** Llamado al hacer click "+" en una mini-card de Llevá otra.
   *  Decide entre camino corto (sin modal) o camino con modal según
   *  los permisos del producto + config admin. */
  function onLlevaOtraAddByIdx(idx) {
    const candidates = llevaOtraCandidates();
    const item = candidates[idx];
    if (!item) return;

    const cfg = urgencyConfig?.lleva_otra;
    if (!cfg || !cfg.enabled) return;

    const product = (crossSellProductsCache || []).find(p => norm(p.name) === norm(item.name));
    if (!product) {
      console.warn('[founderCart] llevaOtra: producto no encontrado en catálogo:', item.name);
      return;
    }

    ensurePersonalizacionConfig().then(persCfg => {
      const permiteCambioColor = cfg.permite_cambio_color === true;
      const permiteGrabado =
        persCfg?.enabled &&
        (product.permite_grabado_adelante || product.permite_grabado_interior ||
         product.permite_grabado_atras    || product.permite_grabado_texto);

      const descPct = Math.max(0, Math.min(99, Number(cfg.descuento_pct) || 0));
      const baseSinExtra = Number(item.price) || 0;
      const precioDesc = Math.round(baseSinExtra * (1 - descPct / 100));

      // Camino corto: ni cambio de color ni grabado → agregar directo
      if (!permiteCambioColor && !permiteGrabado) {
        pushLlevaOtraToCart({
          product,
          colorName:       item.color,
          basePrice:       precioDesc,
          personalizacion: null,
        });
        return;
      }

      // Camino con modal
      if (!window.founderLaserPanel || typeof window.founderLaserPanel.open !== 'function') {
        console.warn('[founderCart] laser-panel.js no cargado — agregando sin modal');
        pushLlevaOtraToCart({
          product,
          colorName:       item.color,
          basePrice:       precioDesc,
          personalizacion: null,
        });
        return;
      }

      const COLOR_MAP = window.FOUNDER_COLOR_MAP || {};
      const enrichedProduct = {
        ...product,
        colors: (product.colors || []).map(c => ({
          ...c,
          ...(COLOR_MAP[c.name] || {}),
        })),
      };

      window.founderLaserPanel.open({
        product:           enrichedProduct,
        colorName:         item.color,
        allowColorChange:  permiteCambioColor,
        config:            persCfg,
        title:             cfg.texto || 'Llevá otra',
        subtitle:          `Founder ${product.name} a ${descPct}% OFF`,
        basePrice:         precioDesc,
        onConfirm: (payload) => {
          pushLlevaOtraToCart({
            product,
            colorName:        payload.colorName || item.color,
            basePrice:        precioDesc,
            personalizacion:  payload.personalizacion,
          });
        },
      });
    });
  }

  /** Inserta el item de "Llevá otra" en el carrito + dispara re-render. */
  function pushLlevaOtraToCart({ product, colorName, basePrice, personalizacion }) {
    const cart = readCartFromStorage();
    const newItem = {
      id:    product.id,
      name:  product.name,
      color: colorName,
      price: basePrice,            // Precio ya descontado, SIN extras de pers (el extra va aparte)
      qty:   1,
      from_lleva_otra: true,
    };
    if (personalizacion) newItem.personalizacion = personalizacion;

    // Deduplicación por itemKey (incluye origen + huella de personalización)
    const newKey = itemKey(newItem);
    const existing = cart.find(i => itemKey(i) === newKey);
    if (existing) {
      existing.qty++;
    } else {
      cart.push(newItem);
    }
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}

    window.dispatchEvent(new CustomEvent('founder-cart-external-update'));
    if (lastRenderOpts) renderItems(lastRenderOpts);

    if (typeof window.showToast === 'function') {
      window.showToast(`Founder ${product.name} agregado`, 'success');
    }
  }

  // Cache de personalizacion_config (compartida con producto.html — la
  // página principal ya la fetcheó, pero acá funcionamos en cualquier
  // página). Una sola fetch por sesión.
  let persConfigCache = null;
  let persConfigPromise = null;
  function ensurePersonalizacionConfig() {
    if (persConfigCache) return Promise.resolve(persConfigCache);
    if (persConfigPromise) return persConfigPromise;
    if (!window.founderDB || typeof window.founderDB.fetchPersonalizacionConfig !== 'function') {
      persConfigCache = { enabled: false };
      return Promise.resolve(persConfigCache);
    }
    persConfigPromise = window.founderDB.fetchPersonalizacionConfig()
      .then(cfg => { persConfigCache = cfg || { enabled: false }; return persConfigCache; })
      .catch(() => { persConfigCache = { enabled: false }; return persConfigCache; });
    return persConfigPromise;
  }

  // ── Sesión 53 Bloque 4 — Editar item del carrito ───────────────
  //
  // Permite al cliente reabrir el modal de personalización para un item
  // que ya está en el carrito. Caso de uso: el cliente agregó un Confort
  // Crema con texto "ANV" y al revisar el carrito quiere cambiar el color
  // a Camel o el texto a "JM" sin tener que eliminar y agregar de nuevo.
  //
  // Reglas:
  //   - Items de cross-sell NO se editan (decisión documentada en ESTADO).
  //   - El item editado REEMPLAZA al original. Si el itemKey resultante
  //     coincide con OTRO item existente del carrito, se fusionan sumando
  //     qty (caso ejemplo: editar Confort Crema → cambiar a Camel y ya
  //     había un Confort Camel sin grabado: queda un solo Camel con
  //     qty viejo + qty existente).
  //   - El botón Editar se oculta si no hay nada útil para editar
  //     (producto con 1 solo color Y sin permiso de personalización
  //     Y la config global de personalización está OFF).

  /** Decide si el item tiene algo editable. Conservador: si el catálogo
   *  todavía no se cargó (`crossSellProductsCache` vacío), retorna true
   *  para no ocultar el botón por error. Falsos positivos se manifiestan
   *  como modales que se cierran con un toast — preferible a no mostrar
   *  el botón cuando sí había algo.
   *
   *  Sesión 53 Bloque 4: regla "cross-sell no se edita" ELIMINADA.
   *  Ahora cualquier item (normal, cross-sell, lleva-otra) puede
   *  editarse si el producto admite cambio de color o personalización.
   *  El precio descontado se preserva al editar. */
  function canEditItem(item) {
    if (!item) return false;

    // Sin catálogo aún → permitir; el modal validará luego.
    if (!crossSellProductsCache) return true;
    const product = crossSellProductsCache.find(p => norm(p.name) === norm(item.name));
    if (!product) return false;  // producto borrado del catálogo: no editar

    // Hay algo para editar si:
    //  (a) el producto tiene más de 1 color disponible (no agotado), o
    //  (b) el producto admite al menos un tipo de personalización.
    const estados = product?.extras?.colores_estado || {};
    const coloresDisp = (product.colors || []).filter(c => estados[c.name] !== 'sin_stock');
    const variosColores = coloresDisp.length > 1;
    const permGrabado =
      product.permite_grabado_adelante ||
      product.permite_grabado_interior ||
      product.permite_grabado_atras    ||
      product.permite_grabado_texto;

    return variosColores || !!permGrabado;
  }

  /** Reemplaza el item en `cart[idx]` con `newItem`. Si el itemKey nuevo
   *  coincide con otro item distinto del carrito, fusiona sumando qty.
   *  Mantiene la cantidad original del item editado. */
  function replaceCartItem(idx, newItem) {
    const cart = readCartFromStorage();
    if (idx < 0 || idx >= cart.length) return;
    const old = cart[idx];
    if (!old) return;

    // Preservar qty del item viejo (la edición no cambia cantidad)
    newItem.qty = old.qty;

    const newKey = itemKey(newItem);

    // Buscar otro item (≠ idx) con el mismo itemKey resultante → fusión
    const collisionIdx = cart.findIndex((it, i) => i !== idx && itemKey(it) === newKey);
    if (collisionIdx !== -1) {
      // Fusión: sumar qty al item existente y eliminar el viejo
      cart[collisionIdx].qty += old.qty;
      cart.splice(idx, 1);
    } else {
      // Reemplazo directo en su lugar
      cart[idx] = newItem;
    }

    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('founder-cart-external-update'));
    if (lastRenderOpts) renderItems(lastRenderOpts);
  }

  /** Abre el modal de personalización con datos pre-cargados del item.
   *  Expuesta como `window.founderCart.editCartItem(idx)`. */
  function editCartItem(idx) {
    const cart = readCartFromStorage();
    const item = cart[idx];
    if (!item) return;

    // Sesión 53 Bloque 4: items de cross-sell SÍ se editan (regla
    // anterior eliminada). El flag `from_cross_sell` se preserva en
    // el item resultante.

    // Asegurar catálogo cargado
    if (!crossSellProductsCache) {
      ensureCrossSellProducts().then(() => editCartItem(idx));
      return;
    }
    const product = crossSellProductsCache.find(p => norm(p.name) === norm(item.name));
    if (!product) {
      if (typeof window.showToast === 'function') {
        window.showToast('No pudimos encontrar el producto para editar', 'error');
      }
      return;
    }

    // Cargar config de personalización
    ensurePersonalizacionConfig().then(persCfg => {
      const permGrabado =
        persCfg?.enabled &&
        (product.permite_grabado_adelante || product.permite_grabado_interior ||
         product.permite_grabado_atras    || product.permite_grabado_texto);

      // Enriquecer colores con FOUNDER_COLOR_MAP (si está disponible)
      const COLOR_MAP = window.FOUNDER_COLOR_MAP || {};
      const enrichedProduct = {
        ...product,
        colors: (product.colors || []).map(c => ({
          ...c,
          ...(COLOR_MAP[c.name] || {}),
        })),
      };

      // Si no se puede ni cambiar color ni personalizar → el modal no
      // tendría nada útil. (No debería pasar gracias a canEditItem, pero
      // por defensa.)
      const estados = product?.extras?.colores_estado || {};
      const coloresDisp = (product.colors || []).filter(c => estados[c.name] !== 'sin_stock');
      if (coloresDisp.length <= 1 && !permGrabado) {
        if (typeof window.showToast === 'function') {
          window.showToast('Este producto no tiene opciones editables', 'info');
        }
        return;
      }

      // basePrice del item: usamos `item.price` (que ya tiene el precio
      // descontado si el item es de Llevá otra, o el precio normal si es
      // un item común). El extra de personalización se suma adentro del
      // modal automáticamente.
      const basePrice = Number(item.price) || 0;

      // Si el laser-panel no cargó (edge case), mostrar un fallback simple.
      // Por ahora exigimos que esté disponible — si no, abortamos limpiamente.
      if (!window.founderLaserPanel || typeof window.founderLaserPanel.open !== 'function') {
        console.warn('[founderCart] laser-panel.js no cargado — edit no disponible');
        return;
      }

      window.founderLaserPanel.open({
        product:                 enrichedProduct,
        colorName:               item.color,
        allowColorChange:        coloresDisp.length > 1,
        config:                  persCfg,
        title:                   'Editar producto',
        subtitle:                `Founder ${product.name}`,
        basePrice:               basePrice,
        initialPersonalizacion:  item.personalizacion || null,
        confirmLabel:            'Guardar cambios',
        onConfirm: (payload) => {
          // Reconstruir el item nuevo respetando flags de origen
          const newItem = {
            id:    product.id,
            name:  product.name,
            color: payload.colorName || item.color,
            price: basePrice,
            qty:   item.qty,  // se preserva en replaceCartItem también, doble redundancia OK
          };
          if (payload.personalizacion) {
            newItem.personalizacion = payload.personalizacion;
          }
          // Sesión 53 Bloque 4: preservar flags de origen (cross-sell
          // o lleva_otra) para que el item editado mantenga su
          // identidad y siga siendo distinguible por itemKey.
          if (item.from_lleva_otra)  newItem.from_lleva_otra  = true;
          if (item.from_cross_sell)  newItem.from_cross_sell  = true;

          replaceCartItem(idx, newItem);

          if (typeof window.showToast === 'function') {
            window.showToast('Producto actualizado', 'success');
          }
        },
      });
    });
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
    // Sesión 53 Bloque 4 — editar item del carrito (abre modal con datos pre-cargados)
    editCartItem,
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

/* ── Sesión 53 Bloque 1 — Contador de urgencia (Opción D) ──────────
   Bloque que aparece arriba de los items del carrito cuando está
   habilitado desde el admin. Layout: barra fina arriba de 3px que se
   va vaciando + cuerpo abajo con ícono + texto + MM:SS.

   Look discreto, sin alarmas — es solo un nudge visual.
   El overflow:hidden + el border-radius del contenedor "recortan" la
   barra superior para que no sobresalga de las esquinas redondeadas. */
.cart-urgency {
  margin: 12px 16px 0;
  border: 1px solid rgba(201, 169, 110, 0.35);
  border-radius: 3px;
  overflow: hidden;
  background: transparent;
}
.cart-urgency__bar {
  height: 3px;
  background: rgba(201, 169, 110, 0.15);
  position: relative;
}
.cart-urgency__bar-fill {
  height: 100%;
  width: 100%;
  background: var(--color-gold);
  /* Transición suave entre ticks. 1s lineal para que coincida con el
     ritmo del setInterval (1Hz) y no parezca "saltar" o "anticipar". */
  transition: width 1s linear;
}
.cart-urgency__body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: rgba(201, 169, 110, 0.04);
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
  /* Sesión 53 Bloque 4 — Position relative para anclar el botón "+"
     en absoluto dentro de la card (ver .cart-cs__add abajo). Sacar el
     botón del flujo flex libera ancho horizontal real para el nombre
     del producto, que ahora ocupa toda la línea horizontal de su
     columna sin competir con el botón. */
  position: relative;
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
  /* Sesión 53 Bloque 4 — Forzar nombre + color en UNA sola línea.
     En mobile el ancho del drawer es chico (~340px - 16px*2 padding -
     foto 48 - botón 32 = ~196px disponibles). "Founder Classic — CAMEL"
     no entra y el "— CAMEL" salta a otra línea, sumando altura a la
     card. Con white-space nowrap + overflow-ellipsis truncamos
     elegantemente y mantenemos siempre la altura constante. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cart-cs__color {
  font-size: 9px;
  color: var(--color-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
/* Sesión 53 Bloque 4 — Color inline al lado del nombre del producto.
   Reemplaza al .cart-cs__color que ocupaba una línea propia. Usa el
   mismo estilo discreto (muted + uppercase + letter-spacing) pero
   sans-serif chico para contrastar con el serif del nombre y darle
   jerarquía clara. */
.cart-cs__color-inline {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 9px;
  color: var(--color-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-weight: 400;
}
.cart-cs__prices {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 2px;
  /* Sesión 53 Bloque 4 — Espacio reservado para el botón absolute (ver chips). */
  padding-right: 40px;
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
  /* Sesión 53 Bloque 4 — Botón "+" en position absolute, anclado al
     borde derecho de la card. Vertical: a 4/5 de la altura (más cerca
     del borde inferior). Esto saca al botón del flujo flex, libera
     ancho horizontal completo para el nombre del producto en la fila
     superior, y deja al botón "flotando" en la esquina inferior derecha.
     La card reserva padding-right para que el botón no se solape con
     el contenido visualmente.

     Cálculo del top: la card tiene altura ≈ 64px (foto 48 + padding 8×2).
     Centro vertical (3/5) = 26px desde arriba. 4/5 ≈ 38px desde arriba
     (32px de altura del botón). En la práctica usamos bottom:8px para
     anclarlo justo arriba del padding inferior, lo que da 4/5 visual
     en cards de esta altura. */
  position: absolute;
  right: 8px;
  bottom: 8px;
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

/* ── Sesión 53 Bloque 4 — Botón "Editar" en cada item ─────────────
   Aparece al lado de los controles +/− para abrir el modal de
   personalización con los datos del item pre-cargados. Estilo
   discreto en dorado, consistente con el resto del drawer. */
.cart-item__edit {
  background: transparent;
  border: 1px solid rgba(201, 169, 110, 0.4);
  color: var(--color-gold);
  padding: 4px 10px;
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  border-radius: 2px;
  font-family: inherit;
  cursor: pointer;
  margin-left: 8px;
  line-height: 1.3;
  transition: background .2s ease, color .2s ease;
  /* Sesión 53 Bloque 4 — Forzar ✎ + texto en una sola línea.
     Sin esto, el letter-spacing 1.5px sobre "EDITAR" mete wrap
     cuando el ancho del control es estrecho (mobile), y el lapicito
     queda arriba del texto. inline-flex + nowrap los mantiene
     pegados horizontalmente con un pequeño gap. */
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.cart-item__edit:hover {
  background: var(--color-gold);
  color: var(--color-bg);
}
.cart-item__edit:active {
  transform: scale(0.97);
}

/* ── Sesión 53 Bloque 4 — Chips de color en cross-sell ────────────
   Rectángulos pequeños (estilo producto.html .color-item__swatch
   pero más chicos: 16x24px en lugar de 22x36px). El seleccionado
   tiene borde dorado. */
.cart-cs__chips {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
  /* Sesión 53 Bloque 4 — Espacio reservado a la derecha para que los
     chips de color no se solapen visualmente con el botón "+" que
     está posicionado en absolute en la esquina inferior derecha de
     la card. 40px = 32px del botón + 8px de aire. */
  padding-right: 40px;
}
.cart-cs__chip {
  width: 18px;
  height: 14px;
  border-radius: 2px;
  border: 1.5px solid transparent;
  padding: 0;
  cursor: pointer;
  transition: transform .15s ease, border-color .2s ease;
  flex-shrink: 0;
  background-clip: padding-box;
}
.cart-cs__chip:hover {
  transform: scale(1.12);
}
.cart-cs__chip.is-selected {
  border-color: var(--color-gold);
}
.cart-cs__chip:focus-visible {
  outline: none;
  border-color: var(--color-gold);
}

/* ── Sesión 53 Bloque 4 — Highlight tip dorado anclado al item ───
   Mensaje contextual que aparece debajo del item recién agregado,
   dentro del flujo del drawer. NO es position:fixed — es un sibling
   normal del cart-item, así que se mueve con el scroll del drawer.
   Animación: fade-in suave al aparecer. Hover no aplica (es solo lectura). */
.cart-tip {
  margin: 4px 16px 8px;
  padding: 8px 12px;
  background: rgba(201, 169, 110, 0.08);
  border: 1px solid rgba(201, 169, 110, 0.35);
  color: var(--color-gold);
  font-size: 11px;
  letter-spacing: 0.3px;
  line-height: 1.4;
  border-radius: 2px;
  animation: cart-tip-fade-in .3s ease both;
}
@keyframes cart-tip-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Sesión 53 Bloque 3 — Llevá otra ──────────────────────────────
   Bloque que aparece al final de #cartItems con un select para que el
   cliente elija qué producto del carrito duplicar a precio descontado.
   Look complementario al cross-sell pero más compacto (es 1 sola
   acción, no 3 cards). */
.cart-lo {
  margin: 24px 16px 12px;
  padding: 14px 0 0;
  border-top: 1px dashed rgba(201, 169, 110, 0.25);
}
.cart-lo__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.cart-lo__title {
  color: var(--color-gold);
  font-family: var(--font-serif, 'Cormorant Garamond', serif);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0.5px;
}
.cart-lo__badge {
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
.cart-lo__hint {
  font-size: 10px;
  color: var(--color-muted);
  letter-spacing: 0.5px;
  line-height: 1.5;
  margin-bottom: 10px;
}
.cart-lo__row {
  display: flex;
  gap: 8px;
}
.cart-lo__select {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(201, 169, 110, 0.35);
  color: var(--color-text);
  padding: 8px 10px;
  font-size: 11px;
  font-family: inherit;
  border-radius: 2px;
  cursor: pointer;
}
.cart-lo__select:focus {
  outline: none;
  border-color: var(--color-gold);
}
.cart-lo__add {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--color-gold);
  color: var(--color-gold);
  padding: 8px 14px;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px;
  font-family: inherit;
  transition: all .2s ease;
}
.cart-lo__add:hover {
  background: var(--color-gold);
  color: var(--color-bg);
}
.cart-lo__add:active {
  transform: scale(0.97);
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
