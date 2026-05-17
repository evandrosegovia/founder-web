/* =============================================================
   FOUNDER — components/founder-admin.js
   -------------------------------------------------------------
   Lógica del panel de administración.

   Qué hace:
     • Login contra /api/admin (action:"login"). El password se
       guarda en sessionStorage durante la sesión del navegador.
     • Pedidos, cupones, productos y banner leen/escriben en
       Supabase a través de /api/admin.
     • Las fotos suben directo a Supabase Storage usando una
       signed URL pedida al server (action:"get_upload_url"), así
       el binario NO pasa por Vercel.

   Precondiciones:
     - Se carga al final del body de admin.html con
       <script src="components/founder-admin.js"></script>.
     - El DOM ya debe tener cargado todo el markup del panel
       (login, sidebar, páginas, modales).
   ============================================================= */
'use strict';

(function () {

  // ── CONFIG — única fuente de verdad ──────────────────────────
  const CONFIG = Object.freeze({
    API_ADMIN:  '/api/admin',
    TOKEN_KEY:  'founder_admin_token',   // sessionStorage: JWT (post-login)
    SITE_URL:   'https://www.founder.uy',
    WA_NUMBER:  '598098550096',
  });

  // Paleta de colores oficial (consistente con el sitio público).
  // Se usa para los dots en el editor de productos.
  const COLOR_MAP = Object.freeze({
    'Negro':       '#222831',
    'Camel':       '#c19a6b',
    'Marrón':      '#3d2010',
    'Gris Oscuro': '#4a4a5a',
    'Azul':        '#1a3a5c',
    'Rosa':        '#d4a0a0',
    'Rojo':        '#8b1a1a',
    'Crema':       '#d4c8a8',
    'Carbon':      '#2a2a2a',
    'Verde Oliva': '#4a5a2a',
  });

  // ── ESTADO GLOBAL DEL ADMIN ──────────────────────────────────
  // Todo el estado vive acá. Nunca se toca window.* salvo para
  // exponer los onclick inline al final del archivo.
  const state = {
    // Catálogo (viene de /api/admin action:"list_products")
    products: [],       // [{ id, nombre, precio, ..., colors:[{id,nombre,estado,precio_oferta,photos:[url,url,...]}] }]
    // Pedidos (viene de /api/admin action:"list_orders")
    allOrders: [],
    currentFilter: 'todos',
    currentView:   'active',    // 'active' = activos (default) | 'archived' = archivados
    // Cupones (viene de /api/admin action:"list_coupons")
    coupons: [],
    // Editor de producto — estado del modal
    editingProductId: null,          // uuid del producto en edición (null = nuevo)
    colorRows: [],                   // [{ uid, nombre, estado, precio_oferta, photos:[5 urls] }]
    colorRowUid: 0,                  // contador para uid estable por fila
    pendingDeleteId: null,           // id del producto en el confirm modal
    // Personalización láser — config global cargada desde site_settings (Sesión 28).
    // null al inicio, se popula con loadPersonalizacion() al entrar al panel.
    lpConfig: null,
    // Galería de ejemplos — array de { id, tipo, url, ... }. Cargado por loadLpExamples().
    lpExamples: [],
    // Hero slides — config completa del carrusel del hero (Sesión 48).
    // Se popula con loadBanner() al entrar al panel "Banners de inicio".
    // Forma: { autoplay_ms: number, slides: [{ id, enabled, orden, label,
    //          title_html, subtitle, image_url, buttons: [...] }, ...] }
    hero: { autoplay_ms: 8000, slides: [] },
    // Período del dashboard (Sesión 41 + extensión Sesión 41b).
    // Valores válidos: 7, 30, 90, 120, 365 (días) o 'todo' (histórico completo).
    // Default 30 días. Se persiste en localStorage entre sesiones del admin.
    // El selector aplica a TODO el panel excepto a las stats del catálogo
    // (productos, colores, sets de fotos), que son atemporales.
    dashboardPeriod: (() => {
      try {
        const raw = localStorage.getItem('founder_admin_dashboard_period')
                 || localStorage.getItem('founder_admin_fin_period'); // legacy Sesión 41
        if (raw === 'todo') return 'todo';
        const n = parseInt(raw, 10);
        return [7, 30, 90, 120, 365].includes(n) ? n : 30;
      } catch { return 30; }
    })(),
  };

  // ── DOM HELPERS ──────────────────────────────────────────────
  const $       = id => document.getElementById(id);
  const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML  = html; };
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  /** Marca/desmarca un checkbox por id. Tolera null. */
  const setCheckbox = (id, checked) => { const el = $(id); if (el) el.checked = !!checked; };
  /** Lee el estado de un checkbox por id. Devuelve false si no existe. */
  const getCheckbox = (id) => !!($(id) && $(id).checked);

  /** Escapa HTML para prevenir XSS cuando se inyecta texto del
   *  usuario/DB en atributos o innerHTML. */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Sanitiza un string para usarlo como parte de un id HTML
   *  (sin espacios ni tildes). Necesario porque hay colores como
   *  "Gris Oscuro" que no funcionan como id tal cual. */
  function sanitizeId(str) {
    return String(str || '').replace(/[^a-zA-Z0-9]/g, '_');
  }

  /** Formato moneda UYU. */
  function fmtUYU(n) {
    return '$' + (Number(n) || 0).toLocaleString('es-UY');
  }

  // ── API helper: POST JSON a /api/admin con token JWT ─────────
  /**
   * Hace POST a /api/admin con `action` y el resto del payload.
   * El JWT se adjunta automáticamente en header Authorization desde
   * sessionStorage.
   *
   * Devuelve siempre un objeto { ok, status, data } — nunca tira,
   * así cada caller decide cómo manejar el error mirando .ok/.data.error.
   *
   * Si el servidor responde 401 (unauthorized), se fuerza logout
   * para que el admin vuelva a escribir el password (token vencido
   * o inválido).
   *
   * Sesión 31 Bloque C: refactor de password→JWT. El password ya no
   * viaja en cada request — solo en el login inicial.
   */
  async function apiAdmin(action, payload = {}) {
    const token = sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res, data = null;
    try {
      res = await fetch(CONFIG.API_ADMIN, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...payload }),
      });
      try { data = await res.json(); } catch { /* body no es JSON */ }
    } catch (netErr) {
      return { ok: false, status: 0, data: { error: 'network_error', message: String(netErr) } };
    }

    // Si la clave quedó inválida (token expirado, etc.), cerramos sesión.
    if (res.status === 401) {
      sessionStorage.removeItem(CONFIG.TOKEN_KEY);
      showLoginScreen();
      toast('Sesión expirada — ingresá la contraseña de nuevo', true);
    }

    return { ok: res.ok, status: res.status, data: data || {} };
  }

  /**
   * Variante de apiAdmin para endpoints admin DISTINTOS a /api/admin.
   * Usa los mismos headers (incluyendo Authorization: Bearer JWT) y la
   * misma política de 401 → relogin.
   *
   * Usado por:
   *   - /api/cleanup-personalizacion (status, logs, run, etc.)
   *   - /api/download-personalizacion-bulk (ZIPs)
   *
   * El response se devuelve crudo (response object) porque algunos
   * callers necesitan acceso a binarios via .arrayBuffer() o similar,
   * no JSON.
   */
  async function apiAdminFetch(url, action, payload = {}) {
    const token = sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload }),
    });

    // Política consistente: 401 → forzar relogin
    if (res.status === 401) {
      sessionStorage.removeItem(CONFIG.TOKEN_KEY);
      showLoginScreen();
      toast('Sesión expirada — ingresá la contraseña de nuevo', true);
    }

    return res;
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTH — Login / logout
  // ═══════════════════════════════════════════════════════════════

  /** Muestra la pantalla de login y oculta el panel. */
  function showLoginScreen() {
    const login = $('loginScreen'); if (login) login.style.display = 'flex';
    const panel = $('adminPanel');  if (panel) panel.style.display  = 'none';
  }

  /** Oculta el login y muestra el panel del admin. */
  function showAdminPanel() {
    const login = $('loginScreen'); if (login) login.style.display = 'none';
    const panel = $('adminPanel');  if (panel) panel.style.display  = 'block';
  }

  /**
   * Valida el password contra /api/admin. Si es correcto, el server
   * devuelve un JWT que guardamos en sessionStorage. Después de eso,
   * todas las requests usan el JWT (el password ya no viaja).
   *
   * Sesión 31 Bloque C: refactor de password persistente → JWT.
   */
  async function login() {
    const input = $('passwordInput');
    const errEl = $('loginError');
    const btn   = document.querySelector('.login-btn');

    const pw = (input?.value || '').trim();
    if (!pw) { if (errEl) errEl.style.display = 'block'; return; }

    if (btn)   { btn.disabled = true; btn.textContent = 'Ingresando...'; }
    if (errEl) errEl.style.display = 'none';

    // Llamada directa SIN apiAdmin() porque apiAdmin manda token (que
    // aún no tenemos). El login es la única request que viaja con password.
    let res, data = null;
    try {
      res = await fetch(CONFIG.API_ADMIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password: pw }),
      });
      try { data = await res.json(); } catch { /* body no es JSON */ }
    } catch (netErr) {
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
      if (errEl) errEl.style.display = 'block';
      console.error('[admin/login] network error:', netErr);
      return;
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }

    if (!res.ok || !data?.ok || !data?.token) {
      if (errEl) errEl.style.display = 'block';
      if (input) input.value = '';
      // Si el server respondió 429 (rate limit), avisamos con el mensaje.
      if (res.status === 429 && data?.detail) {
        toast(data.detail, true);
      }
      return;
    }

    // Login OK — guardamos el JWT (no el password) en sessionStorage.
    sessionStorage.setItem(CONFIG.TOKEN_KEY, data.token);

    showAdminPanel();
    if (input) input.value = '';
    if (errEl) errEl.style.display = 'none';

    // Arrancamos la carga inicial en paralelo (productos + pedidos + banner).
    bootstrap();
  }

  /** Cierra sesión — borra token y vuelve al login. */
  function logout() {
    sessionStorage.removeItem(CONFIG.TOKEN_KEY);
    state.products = []; state.allOrders = []; state.coupons = [];
    showLoginScreen();
    const input = $('passwordInput'); if (input) input.value = '';
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVEGACIÓN — sidebar + páginas
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cambia la página activa del panel.
   * @param {string} page    nombre de la página (dashboard|pedidos|productos|cupones|banner)
   * @param {HTMLElement} el botón clickeado (opcional, para marcarlo activo)
   */
  function nav(page, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const pageEl = $('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    if (el) el.classList.add('active');

    // Re-cargar datos frescos al entrar a cada página
    if (page === 'pedidos')  loadOrders();
    if (page === 'cupones') {
      loadCoupons();
      // Sesión 43 — auto-load del status de emails de recompra
      // (card al final de la página de Cupones).
      loadRecompraStatus();
    }
    if (page === 'banner')   loadBanner();
    if (page === 'carrito')  loadCartConfig();
    if (page === 'personalizacion') {
      loadPersonalizacion();
      loadCleanupStatus();
    }
    // Sesión 38: cargar reseñas al entrar a la sección
    // Sesión 50: + cargar status de cleanup de fotos huérfanas y su historial
    if (page === 'resenas' && typeof window.loadReviews === 'function') {
      window.loadReviews();
      loadReviewsOrphansStatus();
      loadReviewsCleanupLogs();
    }

    // Sesión 35: en mobile, al navegar, cerrar el sidebar drawer
    if (window.innerWidth <= 768) closeSidebar();
  }

  // Sesión 35: toggle del sidebar mobile (botón hamburguesa)
  function toggleSidebar() {
    const sb = $('sidebar');
    const bd = $('sidebarBackdrop');
    const btn = $('topbarMenuBtn');
    if (!sb) return;
    const willOpen = !sb.classList.contains('is-open');
    sb.classList.toggle('is-open', willOpen);
    if (bd)  bd.classList.toggle('is-open', willOpen);
    if (btn) btn.classList.toggle('is-open', willOpen);
  }
  function closeSidebar() {
    const sb = $('sidebar');
    const bd = $('sidebarBackdrop');
    const btn = $('topbarMenuBtn');
    if (sb)  sb.classList.remove('is-open');
    if (bd)  bd.classList.remove('is-open');
    if (btn) btn.classList.remove('is-open');
  }

  // ═══════════════════════════════════════════════════════════════
  // TOAST — notificación flotante
  // ═══════════════════════════════════════════════════════════════
  let toastTimer;
  function toast(msg, isErr = false) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '') + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ═══════════════════════════════════════════════════════════════
  // DIRTY TRACKER — utilidad genérica para "cambios sin guardar"
  // (Sesión 52 — generaliza el patrón creado en Sesión 49 para el
  // modal de banners). Funciona en cualquier formulario o modal con
  // un set fijo de campos.
  //
  // Uso:
  //   const tracker = createDirtyTracker({
  //     fieldIds:    ['inputX', 'selectY', 'checkboxZ'],
  //     dirtyMarker: '.modal-title',   // selector CSS del elemento que recibe la clase 'is-dirty'
  //     containerEl: $('miModal'),     // dónde enganchar los listeners (event delegation)
  //   });
  //   tracker.captureSnapshot();           // al abrir el editor (form ya rellenado)
  //   tracker.bindAutoCheck();             // engancha input/change listeners (idempotente)
  //   tracker.isDirty();                   // → boolean
  //   tracker.confirmDiscardIfDirty();     // → true si OK proceder, false si user canceló
  //   tracker.reset();                     // post-save exitoso: limpia snapshot
  //
  // Diseño:
  //   - Snapshot serializado a JSON para comparación exacta.
  //   - Listener de input/change vive UNA SOLA VEZ en el containerEl
  //     (event delegation) — re-renders no duplican.
  //   - dirtyMarker queda con clase 'is-dirty' aplicada o no, según
  //     el resultado de la comparación.
  // ═══════════════════════════════════════════════════════════════
  function createDirtyTracker(cfg) {
    const fieldIds    = Array.isArray(cfg?.fieldIds) ? cfg.fieldIds : [];
    const containerEl = cfg?.containerEl || null;
    const markerSel   = cfg?.dirtyMarker || '.modal-title';
    const message     = cfg?.discardMessage || 'Tenés cambios sin guardar.\n\n¿Querés descartarlos?';

    let snapshot       = '';
    let listenersBound = false;

    /** Serializa el estado actual de todos los campos rastreados. */
    function takeSnapshot() {
      const obj = {};
      fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) { obj[id] = ''; return; }
        if (el.type === 'checkbox' || el.type === 'radio') {
          obj[id] = el.checked ? '1' : '0';
        } else {
          obj[id] = el.value || '';
        }
      });
      return JSON.stringify(obj);
    }

    /** Marca/desmarca visualmente el indicador de cambios. */
    function setDirtyClass(isDirty) {
      if (!containerEl) return;
      const marker = containerEl.querySelector(markerSel);
      if (marker) marker.classList.toggle('is-dirty', !!isDirty);
    }

    /** Comparación reactiva: actualiza la clase según el estado actual. */
    function check() {
      setDirtyClass(takeSnapshot() !== snapshot);
    }

    return {
      /** Toma snapshot del estado actual (limpio). Llamar al abrir el editor. */
      captureSnapshot() {
        snapshot = takeSnapshot();
        setDirtyClass(false);
      },

      /** Engancha listeners input/change al containerEl (idempotente). */
      bindAutoCheck() {
        if (listenersBound || !containerEl) return;
        containerEl.addEventListener('input',  check);
        containerEl.addEventListener('change', check);
        listenersBound = true;
      },

      /** Devuelve true si hay cambios respecto al snapshot. */
      isDirty() {
        return takeSnapshot() !== snapshot;
      },

      /** Si hay cambios sin guardar, pregunta al usuario. Devuelve:
       *   - true  si NO hay cambios, o el usuario confirma descartar
       *   - false si hay cambios y el usuario canceló (no debe cerrar). */
      confirmDiscardIfDirty() {
        if (takeSnapshot() === snapshot) return true;
        return confirm(message);
      },

      /** Resetea el snapshot al estado actual + limpia el indicador.
       *  Llamar post-save exitoso. */
      reset() {
        snapshot = takeSnapshot();
        setDirtyClass(false);
      },

      /** Fuerza un check (útil cuando se setea un campo programáticamente). */
      check,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // BOOTSTRAP — carga inicial al entrar al panel
  // ═══════════════════════════════════════════════════════════════
  /**
   * Arranca la carga de datos al entrar al panel.
   * Se lanza en paralelo productos + pedidos + banner para que
   * el dashboard quede completo lo antes posible.
   */
  async function bootstrap() {
    // Lanzamos todo en paralelo; cada uno maneja su error
    await Promise.all([
      loadProducts(),
      loadOrders({ silent: true }),
      loadBanner({ silent: true }),
    ]);
    // Sesión 41 (extendido en 41b): sincronizar visualmente el botón
    // del período según el valor persistido en state. Aplica al dashboard
    // completo (no solo al panel financiero).
    const periodBtn = document.querySelector(
      `.fin-period__btn[data-period="${state.dashboardPeriod}"]`);
    if (periodBtn) {
      document.querySelectorAll('.fin-period__btn').forEach(b => b.classList.remove('is-active'));
      periodBtn.classList.add('is-active');
    }
    // El dashboard se renderiza con TODO lo que haya llegado.
    renderDashboard();
  }

  // ═══════════════════════════════════════════════════════════════
  // CATÁLOGO — productos, colores, fotos
  // ═══════════════════════════════════════════════════════════════

  /**
   * Carga todos los productos desde Supabase con sus colores y
   * fotos embebidos. Normaliza la estructura a { photos:[urls] }
   * por color (ordenadas por `orden`, con la es_principal primero).
   */
  async function loadProducts() {
    const { ok, data } = await apiAdmin('list_products');
    if (!ok) { toast('Error cargando productos', true); return; }

    // Normalizamos: el API devuelve product_colors[] con product_photos[].
    // Queremos colors[] con photos[] como array plano de URLs ordenadas.
    state.products = (data.products || []).map(p => {
      const colors = (p.product_colors || []).map(c => {
        const photos = (c.product_photos || [])
          .slice()
          .sort((a, b) => {
            // La foto principal siempre primero
            if (a.es_principal && !b.es_principal) return -1;
            if (b.es_principal && !a.es_principal) return 1;
            return (a.orden || 0) - (b.orden || 0);
          })
          .map(ph => ph.url)
          .filter(Boolean);
        return {
          id:            c.id,
          nombre:        c.nombre,
          estado:        c.estado || 'activo',
          precio_oferta: c.precio_oferta || null,
          stock_bajo:    c.stock_bajo === true,
          orden:         c.orden || 0,
          photos,
        };
      }).sort((a, b) => (a.orden || 0) - (b.orden || 0));

      return {
        id:               p.id,
        slug:             p.slug,
        nombre:           p.nombre,
        precio:           p.precio,
        descripcion:      p.descripcion || '',
        especificaciones: Array.isArray(p.especificaciones) ? p.especificaciones : [],
        capacidad:        p.capacidad || '',
        dimensiones:      p.dimensiones || '',
        material:         p.material || '',
        nota:             p.nota || '',
        lleva_billetes:   !!p.lleva_billetes,
        lleva_monedas:    !!p.lleva_monedas,
        // Personalización láser (Sesión 28 Bloque B): los 4 flags se
        // normalizan a boolean estricto. Sin esto, renderLpProducts y el
        // editor de productos veían siempre `undefined` y los checks
        // nunca se marcaban visualmente (aunque la DB sí los tuviera).
        permite_grabado_adelante: p.permite_grabado_adelante === true,
        permite_grabado_interior: p.permite_grabado_interior === true,
        permite_grabado_atras:    p.permite_grabado_atras    === true,
        permite_grabado_texto:    p.permite_grabado_texto    === true,
        orden:            p.orden || 1,
        activo:           p.activo !== false,
        colors,
      };
    });

    renderProductList();
    renderDashboard();
  }

  /** Dibuja la lista de productos en la página "Productos" del admin. */
  function renderProductList() {
    const cont = $('productListAdmin');
    if (!cont) return;

    if (!state.products.length) {
      cont.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted);font-size:11px;letter-spacing:2px">Sin productos cargados. Click en <strong style="color:var(--gold)">+ Nuevo</strong> arriba para crear el primero.</div>`;
      return;
    }

    cont.innerHTML = state.products.map(p => {
      const firstFoto = p.colors.flatMap(c => c.photos).find(Boolean);
      const setsConFoto = p.colors.filter(c => c.photos.length > 0).length;
      // Thumb 200w por Cloudinary (la lista renderiza miniaturas chicas).
      // window.cld puede no estar definido si cloudinary.js no cargó:
      // hacemos fallback a la URL original para no romper el admin.
      const cldFn = (typeof cld === 'function') ? cld : (u => u);
      const thumb = firstFoto
        ? `<img src="${esc(cldFn(firstFoto, 'thumb'))}" class="prod-img" style="object-fit:cover" alt="${esc(p.nombre)}">`
        : `<div class="prod-img">👜</div>`;

      return `<div class="product-row">
        ${thumb}
        <div style="flex:1">
          <div class="prod-name">Founder ${esc(p.nombre)}</div>
          <div class="prod-meta">${fmtUYU(p.precio)} · ${p.colors.length} colores · ${setsConFoto > 0 ? '✅ ' + setsConFoto + ' sets' : '⚠️ Sin fotos'}</div>
        </div>
        <div class="prod-actions">
          <button class="btn btn-secondary btn-sm" onclick="editProduct('${esc(p.id)}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('${esc(p.id)}')">🗑️ Eliminar</button>
        </div>
      </div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD — métricas + gráficos
  // ═══════════════════════════════════════════════════════════════
  /**
   * Renderiza todas las métricas y gráficos del dashboard a partir
   * de `state.products` y `state.allOrders`. Seguro de llamar aunque
   * no hayan cargado todavía — muestra ceros/placeholders.
   *
   * Sesión 41b: el selector de período afecta TODOS los gráficos y
   * métricas que dependen de pedidos. Las stats del catálogo (productos,
   * colores, sets de fotos) son atemporales y NO se filtran.
   */
  function renderDashboard() {
    const products = state.products;
    const allOrders = state.allOrders;
    // Sesión 41b: `orders` filtrado por período (puede ser 'todo' = sin filtro).
    // Incluye TODOS los estados (cancelados, rechazados, etc.) para que los
    // gráficos como "Estado de pedidos" sigan mostrando esos casos.
    // Las métricas que excluyen cancelados (ventas confirmadas, ticket promedio,
    // panel financiero) hacen su propio filtro adicional sobre esta base.
    const orders = filterOrdersByPeriod(allOrders, state.dashboardPeriod);
    const periodLabel = state.dashboardPeriod === 'todo'
      ? 'histórico'
      : `últimos ${state.dashboardPeriod} días`;

    // ── Métricas del catálogo (atemporales, NO se filtran) ───
    setText('statProductos', products.length);
    setText('statColores',   products.reduce((s, p) => s + p.colors.length, 0));
    const setsFotos = products.reduce((s, p) => s + p.colors.filter(c => c.photos.length > 0).length, 0);
    setText('statImagenes', setsFotos + ' sets');
    setText('statPedidos',  orders.length);
    // Sesión 41b: la label de "Pedidos" refleja si es histórico o filtrado.
    setText('statPedidosLabel',
      state.dashboardPeriod === 'todo' ? 'Pedidos totales' : 'Pedidos del período');

    // ── Métricas de ventas (filtradas por período) ───────────
    const confirmados  = orders.filter(o => ['Confirmado', 'En preparación', 'En camino', 'Listo para retirar', 'Entregado'].includes(o.estado));
    const pendientes   = orders.filter(o => ['Pendiente pago', 'Pendiente confirmación'].includes(o.estado));
    const totalIngreso = confirmados.reduce((s, o) => s + (o.total || 0), 0);
    const ticket       = confirmados.length ? Math.round(totalIngreso / confirmados.length) : 0;

    setText('salesTotal', fmtUYU(totalIngreso));
    setHTML('salesTotalSub', `<span>${confirmados.length} pedido${confirmados.length !== 1 ? 's' : ''} cobrado${confirmados.length !== 1 ? 's' : ''} · ${periodLabel}</span>`);
    setText('salesConfirmados', confirmados.length);
    setHTML('salesConfirmadosSub', confirmados.length ? `<span>de ${orders.length} pedidos en el período</span>` : '');
    setText('salesPendientes', pendientes.length);
    setHTML('salesPendientesSub', pendientes.length
      ? `${fmtUYU(pendientes.reduce((s, o) => s + (o.total || 0), 0))} UYU en espera`
      : '<span>Sin pendientes 🎉</span>');
    setText('salesTicket', ticket ? fmtUYU(ticket) : '—');
    setHTML('salesTicketSub', ticket ? 'promedio por pedido confirmado' : 'Sin pedidos confirmados aún');

    // ── Gráfico: Ventas por producto (filtrado) ──────────────
    const porProducto = {};
    orders.forEach(o => {
      const prodsText = o.productos || '';
      prodsText.split('|').forEach(item => {
        const match = item.trim().match(/Founder (\w+)/);
        if (match) {
          const nombre = match[1];
          porProducto[nombre] = (porProducto[nombre] || 0) + 1;
        }
      });
    });
    const maxProd = Math.max(...Object.values(porProducto), 1);
    setHTML('chartProductos', Object.keys(porProducto).length
      ? Object.entries(porProducto)
          .sort((a, b) => b[1] - a[1])
          .map(([nombre, qty]) => `
            <div class="bar-row">
              <div class="bar-label">${esc(nombre)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(qty / maxProd * 100)}%"></div></div>
              <div class="bar-val">${qty} ped.</div>
            </div>`).join('')
      : '<div class="no-data">Sin datos de productos en el período</div>');

    // ── Gráfico: Métodos de pago (filtrado, donut SVG) ───────
    const pagos = {};
    orders.forEach(o => { if (o.pago) pagos[o.pago] = (pagos[o.pago] || 0) + 1; });
    const totalPagos = Object.values(pagos).reduce((s, n) => s + n, 0) || 1;
    const pagoColors = ['#c9a96e', '#4caf82', '#6699cc', '#e05555', '#888'];
    const pagoEntries = Object.entries(pagos).sort((a, b) => b[1] - a[1]);

    if (pagoEntries.length) {
      const r = 40, cx = 55, cy = 55, circumference = 2 * Math.PI * r;
      let offset = 0;
      const slices = pagoEntries.map(([, qty], i) => {
        const pct   = qty / totalPagos;
        const dash  = pct * circumference;
        const slice = `<circle cx="${cx}" cy="${cy}" r="${r}"
          fill="none" stroke="${pagoColors[i % pagoColors.length]}"
          stroke-width="14" stroke-dasharray="${dash} ${circumference - dash}"
          stroke-dashoffset="${-offset}" />`;
        offset += dash;
        return slice;
      }).join('');

      setHTML('chartPagos', `
        <div class="donut-wrap">
          <svg viewBox="0 0 110 110" width="110" height="110">${slices}</svg>
          <div class="donut-center">
            <div class="donut-center-val">${totalPagos}</div>
            <div class="donut-center-lbl">pedidos</div>
          </div>
        </div>
        <div class="donut-legend">
          ${pagoEntries.map(([label, qty], i) => `
            <div class="legend-item">
              <div class="legend-dot" style="background:${pagoColors[i % pagoColors.length]}"></div>
              <span>${esc(label)}</span>
              <span class="legend-val">${qty}</span>
            </div>`).join('')}
        </div>`);
    } else {
      setHTML('chartPagos', '<div class="no-data">Sin datos en el período</div>');
    }

    // ── Gráfico: Estado de pedidos (filtrado) ────────────────
    const estadoConfig = {
      'Pendiente pago':         { color: 'var(--gold)',  icon: '⏳' },
      'Pendiente confirmación': { color: '#8888ff',      icon: '🔔' },
      'Confirmado':             { color: 'var(--green)', icon: '✅' },
      'Entregado':              { color: 'var(--green)', icon: '📦' },
      'Pago rechazado':         { color: 'var(--red)',   icon: '⚠️' },
      'Cancelado':              { color: 'var(--red)',   icon: '❌' },
    };
    const porEstado = {};
    orders.forEach(o => { if (o.estado) porEstado[o.estado] = (porEstado[o.estado] || 0) + 1; });

    setHTML('chartEstados', Object.entries(estadoConfig).map(([est, cfg]) => {
      const n = porEstado[est] || 0;
      return `<div class="estado-row">
        <span class="estado-name" style="color:${cfg.color}">${cfg.icon} ${esc(est)}</span>
        <span class="estado-count" style="color:${cfg.color}">${n}</span>
      </div>`;
    }).join(''));

    // ── Gráfico: Colores más vendidos (filtrado) ─────────────
    const porColor = {};
    orders.forEach(o => {
      const prodsText = o.productos || '';
      prodsText.split('|').forEach(item => {
        const match = item.trim().match(/\(([^)]+)\)/);
        if (match) {
          const color = match[1].trim();
          porColor[color] = (porColor[color] || 0) + 1;
        }
      });
    });
    const maxColor = Math.max(...Object.values(porColor), 1);
    setHTML('chartColores', Object.keys(porColor).length
      ? Object.entries(porColor)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([color, qty]) => `
            <div class="bar-row">
              <div class="bar-label">${esc(color)}</div>
              <div class="bar-track"><div class="bar-fill green" style="width:${Math.round(qty / maxColor * 100)}%"></div></div>
              <div class="bar-val">${qty} ped.</div>
            </div>`).join('')
      : '<div class="no-data">Sin datos de colores en el período</div>');

    // ── Lista de productos en el dashboard ────────────────────
    // (catálogo + contador de pedidos del período actual)
    setHTML('dashProductList', products.length ? products.map(p => {
      const firstFoto  = p.colors.flatMap(c => c.photos).find(Boolean);
      const setsFotosP = p.colors.filter(c => c.photos.length > 0).length;
      const ventasProd = porProducto[p.nombre] || 0;
      const cldFn = (typeof cld === 'function') ? cld : (u => u);
      return `<div class="product-row">
        ${firstFoto
          ? `<img src="${esc(cldFn(firstFoto, 'thumb'))}" class="prod-img" style="object-fit:cover" alt="${esc(p.nombre)}">`
          : `<div class="prod-img">👜</div>`}
        <div style="flex:1">
          <div class="prod-name">Founder ${esc(p.nombre)}</div>
          <div class="prod-meta">${p.colors.length} colores · ${setsFotosP} sets fotos · ${ventasProd} pedidos</div>
        </div>
        <div class="prod-price">${fmtUYU(p.precio)}</div>
      </div>`;
    }).join('') : '<div style="padding:32px;text-align:center;color:var(--muted);font-size:11px;letter-spacing:2px">Sin productos cargados</div>');

    // Sesión 41: panel financiero (depende del período seleccionado).
    renderFinancialMetrics();
  }

  // ═══════════════════════════════════════════════════════════════
  // PANEL FINANCIERO (Sesión 41)
  // ───────────────────────────────────────────────────────────────
  // Lee state.allOrders + state.dashboardPeriod (días | 'todo') y renderiza:
  //  • 4 tarjetas: ventas brutas, ahorros cupones, ahorros transfer, tasa %.
  //  • Bar chart: top 5 cupones por monto descontado en el período.
  //
  // Fuente de datos: prioridad 1 (columnas DB `descuento_cupon` +
  // `descuento_transferencia`), con fallback de despeje matemático
  // para pedidos viejos pre-Sesión 39. Esto garantiza que el panel
  // funcione incluso si la migración SQL todavía no se corrió.
  //
  // Selector de período: 7/30/90/120/365/Todo. Cambia state.dashboardPeriod
  // vía setDashboardPeriod(), persiste en localStorage, re-renderiza
  // TODO el dashboard (no solo este panel — Sesión 41b).
  // ═══════════════════════════════════════════════════════════════

  /**
   * Filtra los pedidos de `state.allOrders` según el período activo.
   *
   * @param {Array}              orders            lista completa de pedidos
   * @param {number|string}      periodValue       7|30|90|120|365|'todo'
   * @param {Object}              [opts]
   * @param {boolean}             [opts.excludeNonSales=false]
   *        Si es true, además del filtro temporal excluye estados que no
   *        son ventas reales (Cancelado, Pago rechazado, Pendiente pago).
   *        Útil para métricas financieras donde un cancelado no debe contar.
   *        Por defecto incluye TODOS los estados para que los gráficos
   *        como "Estado de pedidos" sigan mostrando los rechazados y
   *        cancelados (que es justamente la información que se quiere ver).
   */
  function filterOrdersByPeriod(orders, periodValue, opts = {}) {
    const excludeNonSales = !!opts.excludeNonSales;
    const ESTADOS_NO_VENTAS = new Set(['Cancelado', 'Pago rechazado', 'Pendiente pago']);

    // Modo "todo": sin filtro temporal. Solo aplica el filtro de estados si
    // se pidió excludeNonSales.
    if (periodValue === 'todo') {
      return excludeNonSales
        ? orders.filter(o => !ESTADOS_NO_VENTAS.has(o.estado))
        : orders.slice();
    }

    const days = Number(periodValue) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceTs = since.getTime();

    return orders.filter(o => {
      if (excludeNonSales && ESTADOS_NO_VENTAS.has(o.estado)) return false;
      const raw = o.fecha || o.created_at;
      const ts  = raw ? new Date(raw).getTime() : NaN;
      if (isNaN(ts)) return false;
      return ts >= sinceTs;
    });
  }

  /**
   * Calcula el desglose de descuentos (cupón vs transferencia) para un
   * pedido. Prioriza las columnas DB; si vienen en 0 y hay descuento total,
   * cae al despeje matemático (Sesión 36/37) — mismo patrón que el
   * founder-seguimiento.js y email-templates.js.
   *
   * Devuelve { cupon, transferencia, total } donde total = cupon + transferencia.
   */
  function splitDescuento(order) {
    const dCup  = parseInt(order.descuento_cupon         ?? 0, 10) || 0;
    const dTr   = parseInt(order.descuento_transferencia ?? 0, 10) || 0;
    const desc  = parseInt(order.descuento ?? 0, 10) || 0;

    // Prioridad 1: si la DB tiene el desglose, usarlo.
    if (dCup > 0 || dTr > 0) {
      return { cupon: dCup, transferencia: dTr, total: dCup + dTr };
    }

    // Sin descuento total: nada que dividir.
    if (desc <= 0) return { cupon: 0, transferencia: 0, total: 0 };

    // Prioridad 2 (fallback pedidos viejos): despeje matemático.
    const hayCupon         = !!(order.cupon_codigo && String(order.cupon_codigo).trim());
    const hayTransferencia = /transfer/i.test(order.pago || '');

    if (hayCupon && hayTransferencia) {
      // Reconstruir con la fórmula del frontend:
      //   baseTransfer = (total - envio) / 0.90
      //   cuponAmount  = subtotal + personalizExtra - baseTransfer
      //   transfer     = descuento - cuponAmount
      const subtotal = parseInt(order.subtotal ?? 0, 10) || 0;
      const perso    = parseInt(order.personalizacion_extra ?? 0, 10) || 0;
      const total    = parseInt(order.total ?? 0, 10) || 0;
      const envio    = parseInt(order.envio ?? 0, 10) || 0;
      const baseTr   = (total - envio) / 0.90;
      let cupon      = Math.round(subtotal + perso - baseTr);
      if (cupon < 0)    cupon = 0;
      if (cupon > desc) cupon = desc;
      const transfer = desc - cupon;
      return { cupon, transferencia: transfer, total: desc };
    }

    if (hayCupon)         return { cupon: desc, transferencia: 0,    total: desc };
    if (hayTransferencia) return { cupon: 0,    transferencia: desc, total: desc };

    // Pedido viejísimo sin atribución: lo contamos como cupón
    // (el caso es estadísticamente despreciable post-Sesión 36).
    return { cupon: desc, transferencia: 0, total: desc };
  }

  /**
   * Cambia el período activo del dashboard, persiste en localStorage,
   * actualiza UI del selector y re-renderiza TODO el dashboard.
   *
   * El filtro NO afecta las stats de catálogo (productos, colores,
   * sets de fotos) — esas son atemporales. Sí afecta: pedidos totales,
   * métricas de ventas, análisis financiero, todos los gráficos.
   *
   * @param {number|'todo'} period 7 | 30 | 90 | 120 | 365 | 'todo'
   * @param {HTMLElement}   btnEl  botón que disparó el cambio (visual)
   */
  function setDashboardPeriod(period, btnEl) {
    if (period !== 'todo' && ![7, 30, 90, 120, 365].includes(period)) return;
    state.dashboardPeriod = period;
    try {
      localStorage.setItem('founder_admin_dashboard_period', String(period));
    } catch {}

    // Toggle visual del botón activo
    document.querySelectorAll('.fin-period__btn').forEach(b => b.classList.remove('is-active'));
    if (btnEl && btnEl.classList) {
      btnEl.classList.add('is-active');
    } else {
      const target = document.querySelector(`.fin-period__btn[data-period="${period}"]`);
      if (target) target.classList.add('is-active');
    }

    // Re-renderizar todo el dashboard, no solo el panel financiero.
    // El resto del admin (pedidos, productos, etc.) no se afecta.
    renderDashboard();
  }

  /**
   * Render principal del panel financiero. Llamado por renderDashboard()
   * y por setDashboardPeriod(). Lee state.allOrders + state.dashboardPeriod.
   */
  function renderFinancialMetrics() {
    const periodValue = state.dashboardPeriod;
    // Métricas financieras: excluir cancelados/rechazados (no son ventas).
    const period = filterOrdersByPeriod(state.allOrders, periodValue, { excludeNonSales: true });

    // Agregados
    let ahorroCupones      = 0;
    let ahorroTransferencia = 0;
    let ventasNetas         = 0; // = sum(total) — lo que efectivamente cobramos
    const cuponesAcum       = {}; // { 'CODIGO': monto_descontado_total }

    for (const o of period) {
      const { cupon, transferencia } = splitDescuento(o);
      ahorroCupones       += cupon;
      ahorroTransferencia += transferencia;
      ventasNetas         += parseInt(o.total ?? 0, 10) || 0;

      // Agrupación de cupones para el top 5
      const codigo = (o.cupon_codigo || '').trim().toUpperCase();
      if (codigo && cupon > 0) {
        cuponesAcum[codigo] = (cuponesAcum[codigo] || 0) + cupon;
      }
    }

    const totalDescuentos = ahorroCupones + ahorroTransferencia;
    // Ventas brutas = lo que habría sido el ingreso si NO se hubieran
    // aplicado descuentos. Es ventasNetas + descuentos totales.
    const ventasBrutas   = ventasNetas + totalDescuentos;
    const tasaDescuento  = ventasBrutas > 0
      ? Math.round((totalDescuentos / ventasBrutas) * 1000) / 10  // 1 decimal
      : 0;

    // ── Render de las 4 tarjetas ──────────────────────────────
    // Nota: fmtUYU ya incluye el símbolo "$" — NO concatenar otro adelante.
    setText('finVentasBrutas',  ventasBrutas ? fmtUYU(ventasBrutas) : '—');
    setHTML('finVentasBrutasSub',
      period.length
        ? `<span>${period.length} pedido${period.length !== 1 ? 's' : ''} en el período</span>`
        : 'sin pedidos en el período');

    setText('finAhorroCupones', ahorroCupones ? '−' + fmtUYU(ahorroCupones) : '—');
    setHTML('finAhorroCuponesSub',
      ahorroCupones
        ? `<span>regalado a clientes vía códigos</span>`
        : 'sin cupones usados');

    setText('finAhorroTransfer', ahorroTransferencia ? '−' + fmtUYU(ahorroTransferencia) : '—');
    setHTML('finAhorroTransferSub',
      ahorroTransferencia
        ? `<span>10% por elegir transferencia</span>`
        : 'sin pagos por transferencia');

    setText('finTasaDescuento', ventasBrutas ? tasaDescuento.toFixed(1) + '%' : '—');
    setHTML('finTasaDescuentoSub',
      ventasBrutas
        ? `descontados ${fmtUYU(totalDescuentos)} sobre ${fmtUYU(ventasBrutas)}`
        : 'descuentos sobre ventas brutas');

    // ── Bar chart: Top 5 cupones ──────────────────────────────
    const topCupones = Object.entries(cuponesAcum)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topCupones.length === 0) {
      setHTML('chartCupones', '<div class="no-data">Sin cupones usados en este período</div>');
    } else {
      const maxMonto = topCupones[0][1];  // ya ordenado desc
      setHTML('chartCupones', topCupones.map(([codigo, monto]) => `
        <div class="bar-row">
          <div class="bar-label" style="color:var(--gold)">${esc(codigo)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(monto / maxMonto * 100)}%"></div></div>
          <div class="bar-val">${fmtUYU(monto)}</div>
        </div>`).join(''));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PEDIDOS — lista, filtros, detalle, estado, tracking
  // ═══════════════════════════════════════════════════════════════

  /**
   * Carga los pedidos desde Supabase vía /api/admin.
   *
   * Hay dos vistas mutuamente excluyentes:
   *   - 'active'   → pedidos NO archivados. Es la vista principal y la que
   *                  alimenta las métricas del dashboard.
   *   - 'archived' → pedidos archivados. Solo se ven al clickear el filtro
   *                  "Archivados"; no afectan al dashboard.
   *
   * @param {{silent?: boolean, view?: 'active'|'archived'}} opts
   */
  async function loadOrders(opts = {}) {
    const silent = !!opts.silent;
    const view   = (opts.view === 'archived') ? 'archived' : 'active';
    state.currentView = view;

    const btn = document.querySelector('#page-pedidos .ph .btn-primary');
    if (!silent && btn) { btn.textContent = '⏳ Cargando...'; btn.disabled = true; }

    const { ok, data } = await apiAdmin('list_orders', {
      include_archived: view === 'archived' ? 'only' : ''
    });
    if (btn) { btn.textContent = '↻ Actualizar'; btn.disabled = false; }

    if (!ok) {
      if (!silent) toast('Error cargando pedidos', true);
      return;
    }

    // Normalizamos: si el pedido no tiene string `productos` pero sí
    // order_items[], reconstruimos el string para que el resto del
    // admin (gráficos, render) funcione sin tener que conocer ambos
    // formatos.
    state.allOrders = (data.orders || []).map(o => {
      let productos = o.productos || '';
      if (!productos && Array.isArray(o.order_items) && o.order_items.length) {
        productos = o.order_items
          .map(it => `${it.product_name} (${it.color}) x${it.cantidad}`)
          .join(' | ');
      }
      return { ...o, productos };
    });

    filterOrders(state.currentFilter, null);
    setText('statPedidos', state.allOrders.length);

    // Solo la vista 'active' alimenta el dashboard: los archivados
    // no deben contar en métricas ni ventas.
    if (view === 'active') renderDashboard();
  }

  /**
   * Filtra la lista visible por estado.
   * El filtro especial 'archivados' conmuta la vista entera a archivados
   * (dispara una recarga desde el server con include_archived='only').
   */
  function filterOrders(filter, btn) {
    // Marca del botón activo en la barra de filtros
    if (btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // Filtro especial: cambiar a vista archivados
    if (filter === 'archivados') {
      state.currentFilter = 'archivados';
      // Si no estamos ya en esa vista, recargamos desde el server
      if (state.currentView !== 'archived') {
        loadOrders({ view: 'archived' });
        return;
      }
      renderOrders(state.allOrders);
      return;
    }

    // Cualquier filtro normal estando en vista archivados → volver a activos
    if (state.currentView === 'archived') {
      state.currentFilter = filter;
      loadOrders({ view: 'active' });
      return;
    }

   // Filtro normal dentro de la vista 'active'
    state.currentFilter = filter;
    let list;
    if (filter === 'todos') {
      list = state.allOrders;
    } else if (filter === 'con_grabado') {
      // Sesión 29 (C): pedidos con personalización láser
      list = state.allOrders.filter(o =>
        Number(o.personalizacion_extra || 0) > 0 ||
        (o.order_items || []).some(it => it && it.personalizacion)
      );
    } else {
      list = state.allOrders.filter(o => o.estado === filter);
    }
    renderOrders(list);
  }

  /** Dibuja las tarjetas de pedidos en la grilla. */
  /** Construye el HTML del empty state de la grilla de pedidos.
   *  Adapta el mensaje y el ícono según `state.currentFilter` para que
   *  comunique mejor lo que está pasando (Sesión 52).
   *
   *  Casos:
   *   - 'todos'                  → "Todavía no hay pedidos" (estado inicial del negocio)
   *   - 'Pendiente pago'         → "✨ Todo al día — no hay pagos pendientes"
   *   - 'Pendiente confirmación' → "✨ Sin pedidos esperando confirmación de MP"
   *   - 'Confirmado'             → "Sin pedidos confirmados todavía"
   *   - 'Entregado'              → "Todavía no entregaste ningún pedido"
   *   - 'Pago rechazado'         → "✨ Sin pagos rechazados — buena señal"
   *   - 'Cancelado'              → "Sin pedidos cancelados"
   *   - 'con_grabado'            → "Sin pedidos con personalización láser"
   *   - 'archivados'             → "Sin pedidos archivados"
   *
   *  El tono celebratorio (✨ + verde) aplica donde "vacío" es algo BUENO.
   *  El tono informativo (icono neutro + muted) aplica donde solo significa
   *  "todavía no pasó nada de ese tipo". */
  function renderOrdersEmptyState() {
    const filter = state.currentFilter || 'todos';

    // Mapa de configuración por filtro.
    // tone: 'celebratory' | 'neutral'
    const config = {
      'todos': {
        icon:  '📋',
        title: 'Todavía no hay pedidos',
        sub:   'Cuando llegue la primera compra va a aparecer acá.',
        tone:  'neutral',
      },
      'Pendiente pago': {
        icon:  '✨',
        title: 'Todo al día',
        sub:   'No hay pagos pendientes de confirmación manual.',
        tone:  'celebratory',
      },
      'Pendiente confirmación': {
        icon:  '✨',
        title: 'Sin pedidos esperando Mercado Pago',
        sub:   'Todos los pagos con MP fueron procesados.',
        tone:  'celebratory',
      },
      'Confirmado': {
        icon:  '📦',
        title: 'Sin pedidos confirmados todavía',
        sub:   'Acá vas a ver los pedidos pagados que estás preparando.',
        tone:  'neutral',
      },
      'Entregado': {
        icon:  '📦',
        title: 'Sin entregas todavía',
        sub:   'Cuando marques pedidos como entregados, van a quedar acá como historial.',
        tone:  'neutral',
      },
      'Pago rechazado': {
        icon:  '✨',
        title: 'Sin pagos rechazados',
        sub:   'Buena señal — ningún pedido falló en el pago.',
        tone:  'celebratory',
      },
      'Cancelado': {
        icon:  '✨',
        title: 'Sin pedidos cancelados',
        sub:   'No hubo cancelaciones todavía.',
        tone:  'celebratory',
      },
      'con_grabado': {
        icon:  '✦',
        title: 'Sin pedidos con personalización láser',
        sub:   'Cuando un cliente compre con grabado, vas a verlo acá.',
        tone:  'neutral',
      },
      'archivados': {
        icon:  '📁',
        title: 'Sin pedidos archivados',
        sub:   'Los pedidos que archives desde la vista principal van a aparecer acá.',
        tone:  'neutral',
      },
    };

    const cfg = config[filter] || config['todos'];
    const titleColor = cfg.tone === 'celebratory' ? 'var(--green)' : 'var(--white)';

    return `
      <div style="grid-column:1/-1;padding:64px 24px;text-align:center;color:var(--muted)">
        <div style="font-size:48px;line-height:1;margin-bottom:18px;opacity:0.85">${cfg.icon}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;color:${titleColor};margin-bottom:8px">${cfg.title}</div>
        <div style="font-size:11px;letter-spacing:1px;line-height:1.7;max-width:360px;margin:0 auto">${cfg.sub}</div>
      </div>`;
  }

  function renderOrders(orders) {
    const g = $('ordersGrid');
    if (!g) return;

    if (!orders.length) {
      g.innerHTML = renderOrdersEmptyState();
      return;
    }

    const statusMap = {
      'Pendiente pago':         'status-pendiente-pago',
      'Pendiente confirmación': 'status-pendiente-mp',
      'Confirmado':             'status-confirmado',
      'En preparación':         'status-confirmado',
      'En camino':              'status-confirmado',
      'Listo para retirar':     'status-confirmado',
      'Entregado':              'status-entregado',
      'Pago rechazado':         'status-cancelado',
      'Cancelado':              'status-cancelado',
    };

    g.innerHTML = orders.map(o => {
      const cls = statusMap[o.estado] || '';
      // Siempre usamos `o.productos` (ya normalizado en loadOrders)
      const prodsText = o.productos || '—';
      const numero    = o.numero || o.id || '—';
      const isArchived = !!o.archivado;

      // Botones de estado — solo para pedidos ACTIVOS (no archivados)
      const estadoBtns = isArchived ? '' : ['Pendiente pago','Pendiente confirmación','Confirmado','Entregado','Cancelado'].map(s =>
        `<button class="btn btn-sm ${o.estado === s ? 'btn-primary' : 'btn-secondary'}"
          onclick="changeOrderStatus('${esc(o.id)}','${esc(s)}')">${esc(s)}</button>`
      ).join('');

      // Botón archivar ↔ desarchivar según la vista actual
      const archivoBtn = isArchived
        ? `<button class="btn btn-sm btn-secondary" onclick="unarchiveOrder('${esc(o.id)}')" title="Devolver a la lista de pedidos activos">↩ Desarchivar</button>`
        : `<button class="btn btn-sm btn-secondary" onclick="archiveOrder('${esc(o.id)}','${esc(numero)}')" title="Ocultar de la lista principal sin borrar">📁 Archivar</button>`;

      // Botón eliminar (siempre, tanto en activos como en archivados)
      const deleteBtn = `<button class="btn btn-sm btn-danger" onclick="deleteOrder('${esc(o.id)}','${esc(numero)}')" title="Borrar definitivamente — no se puede deshacer">🗑 Eliminar</button>`;

      // Sesión 29 (C): badge de personalización láser
      // Sesión 35: usa clase .order-badge con flex-wrap del .order-head
      // para que no rompa la línea en mobile.
      const hasGrabado = Number(o.personalizacion_extra || 0) > 0 ||
        (o.order_items || []).some(it => it && it.personalizacion);
      const grabadoBadge = hasGrabado
        ? '<span class="order-badge" title="Pedido con personalización láser">✦ GRABADO</span>'
        : '';
      const archivadoBadge = isArchived
        ? '<span class="order-badge order-badge--archived" title="Pedido archivado">ARCHIVADO</span>'
        : '';

      return `<div class="order-card">
        <div class="order-head">
          <div class="order-id">#${esc(numero)}${grabadoBadge}${archivadoBadge}</div>
          <div class="order-status ${cls}">${esc(o.estado || '—')}</div>
        </div>
        <div class="order-body">
          <div class="order-name">${esc(o.nombre || '—')} ${esc(o.apellido || '')}</div>
          <div class="order-info">
            <strong>${esc(o.celular || '')}</strong> · ${esc(o.email || '')}<br>
            ${esc(o.entrega || '')} — ${esc(o.direccion || '')}<br>
            ${esc(o.pago || '')}
          </div>
          <div class="order-prods">${esc(prodsText)}</div>
          <div class="order-total">${fmtUYU(o.total)} <span style="font-size:12px;color:var(--muted)">UYU</span></div>
        </div>
        <div class="order-foot">
          <button class="btn btn-secondary btn-sm" onclick="viewOrder('${esc(o.id)}')">👁 Ver detalle</button>
          ${estadoBtns}
          ${archivoBtn}
          ${deleteBtn}
        </div>
      </div>`;
    }).join('');
  }

  /**
   * Cambia el estado de un pedido en Supabase.
   * Actualiza el estado local optimistamente para UX rápida,
   * y revierte si el server devuelve error.
   */
  async function changeOrderStatus(id, newStatus) {
    const o = state.allOrders.find(x => x.id === id);
    if (!o) return;
    const prevStatus = o.estado;
    o.estado = newStatus;  // optimistic update
    filterOrders(state.currentFilter, null);

    const { ok, data } = await apiAdmin('update_order_status', { id, estado: newStatus });
    if (!ok) {
      // Revertir si falló
      o.estado = prevStatus;
      filterOrders(state.currentFilter, null);
      toast('Error al cambiar estado' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }
    toast(`✅ Estado: ${newStatus}`);
    renderDashboard();
  }

  /**
   * Archiva un pedido (soft delete). Lo oculta de la lista principal
   * pero no lo borra. Los archivados no aparecen en métricas del
   * dashboard. Se puede revertir con unarchiveOrder.
   *
   * Se pide 1 confirmación (acción reversible).
   */
  async function archiveOrder(id, numero) {
    if (!confirm(`¿Archivar el pedido #${numero}?\n\nDesaparece de la lista pero los datos se conservan. Podés recuperarlo en el filtro "Archivados".`)) return;

    const { ok, data } = await apiAdmin('archive_order', { id });
    if (!ok) {
      toast('Error al archivar' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }
    // Lo sacamos del array local y re-renderizamos
    state.allOrders = state.allOrders.filter(x => x.id !== id);
    filterOrders(state.currentFilter, null);
    setText('statPedidos', state.allOrders.length);
    renderDashboard();
    toast(`📁 Pedido #${numero} archivado`);
  }

  /**
   * Desarchiva un pedido — lo vuelve a la lista principal.
   * Operación reversible, 1 confirmación.
   */
  async function unarchiveOrder(id) {
    const o = state.allOrders.find(x => x.id === id);
    const numero = o?.numero || id;
    if (!confirm(`¿Desarchivar el pedido #${numero}?\n\nVuelve a la lista principal de pedidos.`)) return;

    const { ok, data } = await apiAdmin('unarchive_order', { id });
    if (!ok) {
      toast('Error al desarchivar' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }
    // Lo sacamos de la lista actual (que es la de archivados)
    state.allOrders = state.allOrders.filter(x => x.id !== id);
    filterOrders(state.currentFilter, null);
    setText('statPedidos', state.allOrders.length);
    toast(`↩ Pedido #${numero} desarchivado`);
  }

  /**
   * ELIMINA DEFINITIVAMENTE un pedido de la base de datos.
   * Irreversible. Requiere DOBLE confirmación:
   *   1) confirm() genérico.
   *   2) prompt() que exige escribir el número del pedido.
   * Backend también valida con body.confirm:true (defensa en profundidad).
   */
  async function deleteOrder(id, numero) {
    const msg1 = `⚠️ ELIMINAR pedido #${numero}\n\n` +
                 'Esto BORRA definitivamente el pedido y sus items de la base de datos.\n' +
                 'NO se puede deshacer.\n\n' +
                 '¿Continuar?';
    if (!confirm(msg1)) return;

    const tip = prompt(
      `Para confirmar la eliminación del pedido #${numero}, escribí su número exacto:\n\n` +
      `(Incluí la letra "F" si la tiene, ej: ${numero})`
    );
    if (tip === null) return;   // canceló
    if (String(tip).trim() !== String(numero).trim()) {
      toast('El número no coincide. Eliminación cancelada.', true);
      return;
    }

    const { ok, data } = await apiAdmin('delete_order', { id, confirm: true });
    if (!ok) {
      toast('Error al eliminar' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }
    // Lo sacamos del array local
    state.allOrders = state.allOrders.filter(x => x.id !== id);
    filterOrders(state.currentFilter, null);
    setText('statPedidos', state.allOrders.length);
    renderDashboard();
    toast(`🗑 Pedido #${numero} eliminado`);
  }

  // ── DETALLE DE PEDIDO — barra de progreso + modal ──────────────

  // Pasos del progreso según tipo de entrega.
  const OD_PASOS_ENVIO   = ['Pendiente', 'En preparación', 'En camino',          'Entregado'];
  const OD_PASOS_RETIRO  = ['Pendiente', 'En preparación', 'Listo para retirar', 'Entregado'];
  const OD_EMOJIS        = ['🕐', '📦', '🚚', '✅'];
  const OD_EMOJIS_RETIRO = ['🕐', '📦', '📍', '✅'];
  const OD_PCT           = ['8%', '36%', '64%', '92%'];

  /** Normaliza estados (sin tildes, lowercase) para matching flexible. */
  function normalizarEstado(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /** Mapea texto de estado al paso (0-3), -1 si está cancelado. */
  function estadoAPaso(estado) {
    const n = normalizarEstado(estado);
    if (n.includes('cancel'))    return -1;
    if (n.includes('entregado')) return 3;
    if (n.includes('camino') || n.includes('listo') || n.includes('retirar')) return 2;
    if (n.includes('preparac'))  return 1;
    return 0;
  }

  /** Genera el HTML de la barra de progreso interactiva. */
  function renderProgressBar(orderId, estado, esEnvio) {
    const pasoActual = estadoAPaso(estado);
    const cancelado  = pasoActual === -1;
    const labels = esEnvio ? OD_PASOS_ENVIO  : OD_PASOS_RETIRO;
    const emojis = esEnvio ? OD_EMOJIS       : OD_EMOJIS_RETIRO;

    const stepsHtml = labels.map((label, i) => {
      const cls = cancelado ? '' : i < pasoActual ? 'done' : i === pasoActual ? 'active' : '';
      return `
        <div class="od-step ${cls}" title="Cambiar a: ${esc(label)}"
          onclick="setOrderStep('${esc(orderId)}', ${i}, ${esEnvio})">
          <div class="od-step-dot">${emojis[i]}</div>
          <div class="od-step-name">${esc(label)}</div>
        </div>`;
    }).join('');

    const fillPct = cancelado ? '0%' : OD_PCT[pasoActual] || '8%';

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head">
          <div class="card-title">📊 Estado del pedido</div>
          <div style="font-size:8px;color:var(--muted);letter-spacing:1px">Click en un paso para cambiar el estado</div>
        </div>
        <div class="card-body">
          ${cancelado ? `<div style="text-align:center;padding:8px;background:rgba(224,85,85,.1);border:1px solid rgba(224,85,85,.2);color:var(--red);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">❌ Pedido Cancelado</div>` : ''}
          <div class="od-progress-wrap">
            <div class="od-progress-track">
              <div class="od-progress-fill" id="odProgressFill" style="width:${fillPct}"></div>
              ${stepsHtml}
            </div>
          </div>
          <div class="od-cancelado-btn">
            <button onclick="setOrderCancelado('${esc(orderId)}')">
              ${cancelado ? '↩ Reactivar pedido' : '✕ Cancelar pedido'}
            </button>
          </div>
        </div>
      </div>`;
  }

  /**
   * Cuenta cuántos pedidos con estado='Entregado' tiene un email
   * en `state.allOrders` (que ya está cargado en memoria), excluyendo
   * el pedido actual. Usado por viewOrder() para mostrar la burbuja
   * de "cliente repetido" sin un round-trip extra a Supabase.
   *
   * Nota: state.allOrders se carga al entrar a Pedidos (default view
   * 'active', solo no archivados). Eso es exactamente lo que queremos
   * — los Cancelado/archivados no cuentan como compras válidas.
   *
   * Devuelve 0 si:
   *  - El email viene vacío
   *  - state.allOrders todavía no se cargó
   *  - No hay coincidencias
   */
  function countDeliveredOrdersForEmail(email, excludeOrderId) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return 0;
    const list = Array.isArray(state.allOrders) ? state.allOrders : [];
    return list.reduce((acc, o) => {
      if (!o || o.id === excludeOrderId) return acc;
      const sameEmail  = String(o.email || '').trim().toLowerCase() === e;
      const isDelivered = (o.estado || '') === 'Entregado';
      return acc + (sameEmail && isDelivered ? 1 : 0);
    }, 0);
  }

  /** Abre el modal con el detalle completo de un pedido. */
  function viewOrder(id) {
    const o = state.allOrders.find(x => x.id === id);
    if (!o) { toast('Pedido no encontrado', true); return; }

    const prodsText = o.productos || '—';
    const statusMap = {
      'Pendiente pago':         'status-pendiente-pago',
      'Pendiente confirmación': 'status-pendiente-mp',
      'En preparación':         'status-confirmado',
      'En camino':              'status-confirmado',
      'Listo para retirar':     'status-confirmado',
      'Confirmado':             'status-confirmado',
      'Entregado':              'status-entregado',
      'Pago rechazado':         'status-cancelado',
      'Cancelado':              'status-cancelado',
    };
    const cls = statusMap[o.estado] || '';

    const entregaTxt = (o.entrega || '').toLowerCase();
    const esEnvio    = entregaTxt.includes('env');

    const progressHTML = renderProgressBar(o.id, o.estado, esEnvio);
    const nroTracking  = o.nro_seguimiento || '';
    const urlTracking  = o.url_seguimiento || '';
    const numero       = o.numero || o.id;

    // Fecha: usar `fecha` (string legible) o `created_at` como fallback
    const fechaMostrar = o.fecha || (o.created_at
      ? new Date(o.created_at).toLocaleString('es-UY')
      : '—');

    const trackingSection = `
      <div class="card" style="margin-bottom:16px;border-color:rgba(201,169,110,.25)">
        <div class="card-head">
          <div class="card-title">${esEnvio ? '🚚 Seguimiento de envío' : '📍 Coordinar retiro'}</div>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
          ${esEnvio ? `
          <div class="fg">
            <div class="fl">Número de seguimiento</div>
            <div style="display:flex;gap:8px">
              <input type="text" class="fi" id="trackingNro" placeholder="Ej: UES-00123456"
                value="${esc(nroTracking)}"
                oninput="this.value=this.value.replace(/[&lt;&gt;&quot;&#39;]/g,'')">
              <button class="btn btn-sm btn-primary" onclick="saveTracking('${esc(o.id)}')">Guardar</button>
            </div>
          </div>
          <div class="fg">
            <div class="fl">URL del transportista</div>
            <div style="display:flex;gap:8px">
              <input type="url" class="fi" id="trackingUrl" placeholder="https://..."
                value="${esc(urlTracking)}"
                oninput="this.value=this.value.replace(/[&lt;&gt;&quot;&#39;\\s]/g,'')">
              <button class="btn btn-sm btn-secondary" onclick="openTrackingUrl()" title="Abrir en nueva pestaña">↗</button>
            </div>
            <div style="font-size:9px;color:var(--muted);margin-top:4px;letter-spacing:.5px">
              El cliente verá este link en la página de seguimiento para rastrear su envío.
            </div>
          </div>` : `
          <div style="font-size:11px;color:var(--muted);line-height:1.8;background:var(--mid);padding:12px 14px;border:1px solid var(--border)">
            📍 Retiro en <strong style="color:var(--white)">zona Prado, Montevideo</strong>.<br>
            Cuando el pedido esté listo para retirar, coordiná día y hora con el comprador por WhatsApp.<br>
            <a href="https://wa.me/${CONFIG.WA_NUMBER}" target="_blank" rel="noopener noreferrer"
              style="color:var(--gold);text-decoration:underline;font-size:10px;letter-spacing:.5px">
              Abrir WhatsApp →
            </a>
          </div>`}
        </div>
      </div>`;

    setHTML('orderDetailContent', `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div style="font-family:'Cormorant Garamond',serif;font-size:28px">Pedido #${esc(numero)}</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="copyOrderSummary('${esc(o.id)}')" title="Copiar resumen del pedido para pegar en WhatsApp, email, etc.">📋 Copiar resumen</button>
          <div class="order-status ${cls}" style="font-size:12px;padding:6px 14px">${esc(o.estado || 'Pendiente')}</div>
        </div>
      </div>

      ${progressHTML}

      ${(() => {
        // ── Sesión 32: burbuja "Cliente repetido" ─────────────
        // Si el comprador ya tiene compras 'Entregado' previas, lo
        // destacamos para que el admin sepa que NO le tiene que
        // enviar de nuevo el código de descuento (ej. FOUNDER20).
        const prev = countDeliveredOrdersForEmail(o.email, o.id);
        if (prev < 1) return '';
        // "2ª compra" si tiene 1 previa, "3ª compra" si tiene 2, etc.
        const ordinal = prev + 1;
        return `
          <div style="background:rgba(201,169,110,.10);border:1px solid var(--gold);padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:18px">🔄</span>
            <div style="flex:1;min-width:200px">
              <div style="color:var(--gold);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Cliente repetido — ${ordinal}ª compra</div>
              <div style="color:var(--muted);font-size:10px;line-height:1.5;margin-top:2px">
                Este comprador ya tiene ${prev} ${prev === 1 ? 'compra entregada' : 'compras entregadas'} previa${prev === 1 ? '' : 's'} con el mismo email. No envíes nuevamente el código de descuento.
              </div>
            </div>
          </div>`;
      })()}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card">
          <div class="card-head"><div class="card-title">👤 Datos del comprador</div></div>
          <div class="card-body" style="font-size:13px;line-height:2;color:var(--muted)">
            <strong style="color:var(--white)">${esc(o.nombre || '')} ${esc(o.apellido || '')}</strong><br>
            📱 ${esc(o.celular || '—')}<br>
            📧 ${esc(o.email || '—')}<br>
            📅 ${esc(fechaMostrar)}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">📍 Entrega</div></div>
          <div class="card-body" style="font-size:13px;line-height:2;color:var(--muted)">
            <strong style="color:var(--white)">${esc(o.entrega || '—')}</strong><br>
            ${esc(o.direccion || '—')}
          </div>
        </div>
      </div>

     <div class="card" style="margin-bottom:16px">
        <div class="card-head"><div class="card-title">🛍️ Productos</div></div>
        <div class="card-body" style="font-size:13px;line-height:2;color:var(--muted)">${esc(prodsText)}</div>
      </div>

      ${renderPersonalizacionSection(o)}

      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><div class="card-title">💰 Resumen de pago</div></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>Subtotal</span><span>${fmtUYU(o.subtotal)}</span></div>
          ${o.descuento ? `<div style="display:flex;justify-content:space-between;color:var(--green)"><span>Descuento${o.cupon_codigo ? ' (' + esc(o.cupon_codigo) + ')' : ''}</span><span>-${fmtUYU(o.descuento)}</span></div>` : ''}
          ${o.envio ? `<div style="display:flex;justify-content:space-between;color:var(--muted)"><span>Envío</span><span>${fmtUYU(o.envio)}</span></div>` : `<div style="display:flex;justify-content:space-between;color:var(--green)"><span>Envío</span><span>Gratis</span></div>`}
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
            <span style="font-family:'Cormorant Garamond',serif;font-size:18px">Total</span>
            <span style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold)">${fmtUYU(o.total)} UYU</span>
          </div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px">Método: ${esc(o.pago || '—')}</div>
        </div>
      </div>

      ${trackingSection}
    `);

    // Animar la barra de progreso al abrir
    const paso = estadoAPaso(o.estado);
    const fill = $('odProgressFill');
    if (fill && paso >= 0) {
      fill.style.width = '0%';
      setTimeout(() => { fill.style.width = OD_PCT[paso] || '8%'; }, 80);
    }

    const modal = $('orderDetailModal');
    if (modal) modal.classList.add('open');
  }

  /** Copia un resumen del pedido al portapapeles, listo para pegar en WhatsApp,
   *  email, o transcripción para el servicio de envío (Sesión 52).
   *
   *  Formato pensado para lectura humana — bloques separados con saltos de
   *  línea simples, sin markdown ni emojis decorativos (los emojis se mantienen
   *  como íconos semánticos: 👤 cliente, 📍 entrega, etc.).
   *
   *  Detecta si la Clipboard API está disponible y cae a textarea+execCommand
   *  como fallback (Safari iOS antes de 13.1 + algunos contextos http://).
   */
  async function copyOrderSummary(id) {
    const o = state.allOrders.find(x => x.id === id);
    if (!o) { toast('Pedido no encontrado', true); return; }

    const numero       = o.numero || o.id;
    const fechaMostrar = o.fecha || (o.created_at
      ? new Date(o.created_at).toLocaleString('es-UY')
      : '—');
    const nombre   = `${o.nombre || ''} ${o.apellido || ''}`.trim() || '—';
    const entrega  = o.entrega   || '—';
    const direccion = o.direccion || '—';
    const productos = o.productos || '—';
    const subtotal  = fmtUYU(o.subtotal);
    const descuento = o.descuento ? `\nDescuento${o.cupon_codigo ? ' (' + o.cupon_codigo + ')' : ''}: -${fmtUYU(o.descuento)} UYU` : '';
    const envio     = o.envio ? `${fmtUYU(o.envio)} UYU` : 'Gratis';
    const total     = `${fmtUYU(o.total)} UYU`;
    const nroTrack  = o.nro_seguimiento ? `\nN° seguimiento: ${o.nro_seguimiento}` : '';
    const urlTrack  = o.url_seguimiento ? `\nLink seguimiento: ${o.url_seguimiento}` : '';

    const resumen = [
      `Pedido #${numero}`,
      `Estado: ${o.estado || 'Pendiente'}`,
      `Fecha: ${fechaMostrar}`,
      '',
      '👤 Cliente',
      nombre,
      `Tel: ${o.celular || '—'}`,
      `Email: ${o.email || '—'}`,
      '',
      '📍 Entrega',
      entrega,
      direccion,
      '',
      '🛍️ Productos',
      productos,
      '',
      '💰 Pago',
      `Subtotal: ${subtotal} UYU${descuento}`,
      `Envío: ${envio}`,
      `Total: ${total}`,
      `Método: ${o.pago || '—'}${nroTrack}${urlTrack}`,
    ].join('\n');

    // Intento 1: Clipboard API moderna (preferida)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(resumen);
        toast('📋 Resumen copiado al portapapeles');
        return;
      }
    } catch (err) {
      // Caemos al fallback
      console.warn('[copyOrderSummary] Clipboard API falló, usando fallback:', err);
    }

    // Intento 2: textarea + execCommand (fallback histórico, funciona en
    // contextos http:// o navegadores viejos).
    try {
      const ta = document.createElement('textarea');
      ta.value = resumen;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const okExec = document.execCommand('copy');
      document.body.removeChild(ta);
      if (okExec) {
        toast('📋 Resumen copiado al portapapeles');
        return;
      }
    } catch (err) {
      console.error('[copyOrderSummary] fallback falló:', err);
    }

    toast('No se pudo copiar — revisá los permisos del navegador', true);
  }
// ═══════════════════════════════════════════════════════════════
  // PERSONALIZACIÓN — vista admin de pedidos (Sesión 29 — Bloque C)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Renderiza la sección de personalización dentro del modal de detalle
   * de pedido. Si el pedido no tiene personalización, devuelve '' (vacío).
   *
   * Para cada item con personalización:
   *  - Muestra los slots usados (adelante / interior / atrás / texto)
   *  - Botón "Ver/Descargar" por slot que pide signed_url al backend
   *  - Texto e indicaciones del cliente
   *
   * Botón global: "Descargar todo del pedido en ZIP" para mandar al taller.
   */
  function renderPersonalizacionSection(o) {
    const extra = Number(o.personalizacion_extra || 0);
    const items = o.order_items || [];
    const tienePersonaliz = extra > 0 || items.some(it => it && it.personalizacion);
    if (!tienePersonaliz) return '';

    const itemBlocks = items.map(it => {
      const p = it.personalizacion;
      if (!p || typeof p !== 'object') return '';

      const slots = [];
      ['adelante', 'interior', 'atras'].forEach(slot => {
        const ref = p[slot];
        if (ref && ref.path) {
          const labelMap = { adelante: '🖼️ Adelante', interior: '📐 Interior', atras: '🔖 Atrás' };
          const filename = ref.filename || slot + '.png';
          slots.push(`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);gap:10px;flex-wrap:wrap">
              <div style="font-size:12px;color:var(--white)">
                <strong>${labelMap[slot]}</strong>
                <span style="color:var(--muted);font-size:10px;margin-left:6px">${esc(filename)}</span>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-secondary" onclick="viewPersonalizImage('${esc(ref.path)}')">👁 Ver</button>
                <button class="btn btn-sm btn-secondary" onclick="downloadPersonalizImage('${esc(ref.path)}','${esc(filename)}')">⬇ Descargar</button>
              </div>
            </div>`);
        }
      });

      if (p.texto) {
        slots.push(`
          <div style="padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12px;color:var(--white);margin-bottom:4px">
              <strong>✍️ Texto a grabar</strong>
            </div>
            <div style="font-size:13px;color:var(--gold);font-style:italic;background:var(--mid);padding:8px 12px;border:1px solid var(--border)">
              "${esc(p.texto)}"
            </div>
          </div>`);
      }

      if (p.indicaciones) {
        slots.push(`
          <div style="padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12px;color:var(--white);margin-bottom:4px">
              <strong>📝 Indicaciones del cliente</strong>
            </div>
            <div style="font-size:11px;color:var(--muted);line-height:1.6">
              ${esc(p.indicaciones)}
            </div>
          </div>`);
      }

      if (!slots.length) return '';

      return `
        <div style="margin-bottom:12px;padding:12px;background:var(--mid);border:1px solid var(--border)">
          <div style="font-size:12px;color:var(--gold);margin-bottom:8px;letter-spacing:1px">
            <strong>Founder ${esc(it.product_name || '')} — ${esc(it.color || '')}</strong>
          </div>
          ${slots.join('')}
        </div>`;
    }).filter(Boolean).join('');

    return `
      <div class="card" style="margin-bottom:16px;border-color:rgba(201,169,110,.4)">
        <div class="card-head" style="background:rgba(201,169,110,.05)">
          <div class="card-title" style="color:var(--gold)">✦ Personalización láser</div>
          <button class="btn btn-primary btn-sm" onclick="downloadOrderZip('${esc(o.id)}','${esc(o.numero || o.id)}')">📦 Descargar ZIP completo</button>
        </div>
        <div class="card-body">
          <div class="info-box" style="margin-bottom:14px;font-size:11px">
            <strong>Para producción:</strong> descargá el ZIP completo y mandalo al taller del láser.<br>
            Recordá que este pedido tiene <strong>+24 hs hábiles</strong> extra de preparación.
          </div>
          ${itemBlocks || '<div style="color:var(--muted);font-size:11px">Pedido marcado con grabado pero sin items detallados.</div>'}
          ${extra > 0 ? `
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:12px">
              <span style="color:var(--muted);letter-spacing:1px">EXTRA POR GRABADO</span>
              <span style="color:var(--gold);font-weight:600;font-size:14px">$${fmtUYU(extra)} UYU</span>
            </div>` : ''}
          ${o.acepto_no_devolucion ? `
            <div style="margin-top:8px;font-size:10px;color:var(--green);text-align:right">
              ✓ Cliente aceptó política de no-devolución
            </div>` : ''}
        </div>
      </div>`;
  }

  /**
   * Pide signed_url para una imagen privada y la abre en nueva pestaña.
   */
  async function viewPersonalizImage(path) {
    if (!path) return;
    const { ok: okR, data } = await apiAdmin('get_personalizacion_signed_url', { path });
    if (!okR || !data.signedUrl) {
      toast('No se pudo abrir la imagen', true);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  /**
   * Pide signed_url y descarga la imagen como archivo.
   */
  async function downloadPersonalizImage(path, filename) {
    if (!path) return;
    const { ok: okR, data } = await apiAdmin('get_personalizacion_signed_url', { path });
    if (!okR || !data.signedUrl) {
      toast('No se pudo descargar la imagen', true);
      return;
    }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = filename || 'imagen-personalizacion';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Descarga ZIP con todas las imágenes de un pedido.
   * El backend devuelve base64; reconstruimos blob y disparamos download.
   */
  async function downloadOrderZip(orderId, numero) {
    if (!orderId) return;
    toast('Generando ZIP...');

    try {
      const resp = await apiAdminFetch('/api/download-personalizacion-bulk', 'download_order_zip', { orderId });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        toast('Error generando ZIP: ' + (data?.error || resp.status), true);
        return;
      }

      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `personalizacion-${numero}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('✓ ZIP descargado');
    } catch (err) {
      console.error('[downloadOrderZip] error:', err);
      toast('Error de red descargando ZIP', true);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PANEL DE LIMPIEZA (Sesión 29 — Bloque C)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Carga el status del bucket y el historial de limpiezas.
   */
  async function loadCleanupStatus() {
    const statusBox = $('cleanupStatusBox');
    const zipBtn    = $('cleanupZipBtn');
    const runBtn    = $('cleanupRunBtn');
    if (!statusBox) return;

    statusBox.textContent = 'Cargando estado del almacenamiento...';
    if (zipBtn) zipBtn.disabled = true;
    if (runBtn) runBtn.disabled = true;

    let data = null;
    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'get_cleanup_status');
      data = await resp.json();
      if (!resp.ok || !data?.ok) {
        statusBox.innerHTML = `<span style="color:var(--red,#e57373)">Error cargando status: ${esc(data?.error || resp.status)}</span>`;
        return;
      }
    } catch (err) {
      statusBox.innerHTML = `<span style="color:var(--red,#e57373)">Error de red: ${esc(String(err?.message || err))}</span>`;
      return;
    }

    const total       = data.total_imagenes || 0;
    const totalMb     = data.total_mb       || 0;
    const vivas       = data.vivas_count    || 0;
    const borrables   = data.borrables_count || 0;
    const borrablesMb = data.borrables_mb   || 0;

    statusBox.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">Total imágenes</div>
          <div style="font-size:16px;color:var(--white);margin-top:2px">${total} <span style="font-size:11px;color:var(--muted)">(${totalMb.toFixed(2)} MB)</span></div>
        </div>
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--green);text-transform:uppercase">🟢 Vivas (en uso)</div>
          <div style="font-size:16px;color:var(--white);margin-top:2px">${vivas}</div>
        </div>
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--gold);text-transform:uppercase">🟡 Borrables</div>
          <div style="font-size:16px;color:var(--gold);margin-top:2px">${borrables} <span style="font-size:11px;color:var(--muted)">(${borrablesMb.toFixed(2)} MB)</span></div>
        </div>
      </div>`;

    if (zipBtn) zipBtn.disabled = borrables === 0;
    if (runBtn) runBtn.disabled = borrables === 0;

    loadCleanupLogs();
  }

  /**
   * Carga el historial de limpiezas en la card de abajo.
  /**
   * Renderiza un historial de limpiezas filtrado por tipo en un contenedor dado.
   *
   * Los logs vienen de cleanup_logs (tabla unificada). El backend escribe el
   * campo `detalle.tipo` cuando el log es de fotos de reseñas (Sesión 42);
   * los logs antiguos de imágenes de personalización (Sesión 29) NO tienen
   * esa key.
   *
   * @param {string} listElId  - ID del <div> contenedor donde renderizar.
   * @param {string} filterTipo - 'imagenes' | 'reviews_orphans' — qué tipo mostrar.
   * @param {number} limit     - Cuántos logs pedir al backend (default 20).
   */
  async function renderCleanupLogs(listElId, filterTipo, limit = 20) {
    const list = $(listElId);
    if (!list) return;

    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'list_cleanup_logs', { limit });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        list.innerHTML = '<div style="color:var(--muted)">Sin historial todavía.</div>';
        return;
      }
      const allLogs = data.logs || [];

      // Filtrar por tipo: 'reviews_orphans' usan detalle.tipo, 'imagenes' es todo lo demás.
      const filtered = allLogs.filter(l => {
        const isReviewLog = (l.detalle && l.detalle.tipo === 'reviews_orphans');
        return filterTipo === 'reviews_orphans' ? isReviewLog : !isReviewLog;
      });

      if (!filtered.length) {
        list.innerHTML = '<div style="color:var(--muted);font-size:11px">Todavía no se ejecutó ninguna limpieza de este tipo.</div>';
        return;
      }

      // Mostrar máximo 10 entradas (las más recientes ya vienen primero del backend).
      list.innerHTML = filtered.slice(0, 10).map(l => {
        const fecha = l.ejecutado_at
          ? new Date(l.ejecutado_at).toLocaleString('es-UY')
          : '—';
        const triggerLabel = l.trigger === 'auto' ? '🤖 Automática' : '👤 Manual';
        return `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:10px;flex-wrap:wrap">
            <div>
              <div style="font-size:11px;color:var(--white)">${triggerLabel}</div>
              <div style="font-size:9px;color:var(--muted);letter-spacing:1px">${esc(fecha)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--gold)">${l.borradas || 0} archivos</div>
              <div style="font-size:9px;color:var(--muted);letter-spacing:1px">${(l.liberados_mb || 0).toFixed(2)} MB liberados</div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = '<div style="color:var(--muted)">Error cargando historial.</div>';
    }
  }

  /** Wrapper compatibilidad: el historial del panel de Personalización solo muestra
   *  limpiezas de IMÁGENES de personalización (no las de reseñas). */
  async function loadCleanupLogs() {
    return renderCleanupLogs('cleanupLogsList', 'imagenes');
  }

  /** Historial del panel de Reseñas: solo limpiezas de FOTOS de reseñas. */
  async function loadReviewsCleanupLogs() {
    return renderCleanupLogs('reviewsCleanupLogsList', 'reviews_orphans');
  }

  /**
   * Descarga ZIP de todas las imágenes borrables (backup previo).
   */
  async function downloadBorrablesZip() {
    const btn = $('cleanupZipBtn');
    if (btn) { btn.disabled = true; btn.textContent = '📦 Generando...'; }

    try {
      const resp = await apiAdminFetch('/api/download-personalizacion-bulk', 'download_borrables_zip');
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        toast('Error generando ZIP: ' + (data?.error || resp.status), true);
        return;
      }

      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'personalizacion-backup.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('✓ Backup descargado');
    } catch (err) {
      toast('Error de red descargando ZIP', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📦 Descargar borrables (.zip)'; }
    }
  }

  /**
   * Ejecuta limpieza manual con doble confirmación.
   */
  async function runCleanupManual() {
    if (!confirm('¿Estás seguro? Esto borrará permanentemente las imágenes marcadas como "borrables".\n\n💡 Recomendación: descargá primero el ZIP de backup.')) return;
    if (!confirm('Última confirmación: borrar imágenes ya no se puede deshacer. ¿Continuar?')) return;

    const btn = $('cleanupRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = '🗑 Borrando...'; }

    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'run_cleanup_manual');
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        toast('Error ejecutando limpieza: ' + (data?.error || resp.status), true);
        return;
      }
      toast(`✓ Limpieza completada: ${data.borradas || 0} imágenes borradas (${(data.liberados_mb || 0).toFixed(2)} MB)`);
      loadCleanupStatus();
    } catch (err) {
      toast('Error de red ejecutando limpieza', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🗑 Ejecutar limpieza ahora'; }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // CLEANUP FOTOS HUÉRFANAS DE RESEÑAS (Sesión 42 — UI en Sesión 49)
  // ─────────────────────────────────────────────────────────────────
  // Card al lado del cleanup de imágenes de personalización. Permite
  // invocar manualmente el cron Tarea C, que ya corría automáticamente
  // todos los domingos pero no tenía botón en el admin. Útil cuando
  // detectás muchas reseñas borradas y querés liberar storage al toque.
  //
  // Backend: /api/cleanup-personalizacion
  //   get_reviews_orphans_status  → dryRun: cuántas huérfanas hay.
  //   run_reviews_orphans_manual  → borra huérfanas (>24h) ahora.
  //
  // Patrón idéntico al cleanup de imágenes (loadCleanupStatus +
  // runCleanupManual) para mantener consistencia visual y de código.
  // ═════════════════════════════════════════════════════════════════

  /**
   * Carga el estado del bucket reviews-photos y habilita/deshabilita
   * el botón de limpieza manual según haya huérfanas o no.
   */
  async function loadReviewsOrphansStatus() {
    const statusBox = $('reviewsOrphansStatusBox');
    const runBtn    = $('reviewsOrphansRunBtn');
    if (!statusBox) return;

    statusBox.textContent = 'Cargando estado de fotos de reseñas...';
    if (runBtn) runBtn.disabled = true;

    let data = null;
    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'get_reviews_orphans_status');
      data = await resp.json();
      if (!resp.ok || !data?.ok) {
        statusBox.innerHTML = `<span style="color:var(--red,#e57373)">Error cargando status: ${esc(data?.error || resp.status)}</span>`;
        return;
      }
    } catch (err) {
      statusBox.innerHTML = `<span style="color:var(--red,#e57373)">Error de red: ${esc(String(err?.message || err))}</span>`;
      return;
    }

    const total      = data.total_fotos_bucket || 0;
    const vivas      = data.vivas_count        || 0;
    const huerfanas  = data.huerfanas_count    || 0;
    const recientes  = data.recientes_count    || 0;
    const huerfMb    = data.huerfanas_mb       || 0;

    statusBox.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">Total en bucket</div>
          <div style="font-size:16px;color:var(--white);margin-top:2px">${total}</div>
        </div>
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--green);text-transform:uppercase">🟢 Vivas (en uso)</div>
          <div style="font-size:16px;color:var(--white);margin-top:2px">${vivas}</div>
        </div>
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--gold);text-transform:uppercase">🟡 Huérfanas borrables</div>
          <div style="font-size:16px;color:var(--gold);margin-top:2px">${huerfanas} <span style="font-size:11px;color:var(--muted)">(${huerfMb.toFixed(2)} MB)</span></div>
        </div>
        ${recientes > 0 ? `
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">⏳ Recientes (&lt;24h, no se tocan)</div>
          <div style="font-size:16px;color:var(--white);margin-top:2px">${recientes}</div>
        </div>` : ''}
      </div>`;

    if (runBtn) runBtn.disabled = huerfanas === 0;
  }

  /**
   * Ejecuta la limpieza manual de fotos huérfanas de reseñas.
   * No requiere descargar ZIP previo: a diferencia de las imágenes de
   * personalización (que el cliente sube y son únicas), las fotos de
   * reseñas son aportes del cliente con bajo valor de recuperación.
   * Igual mantenemos doble confirmación porque el borrado es irreversible.
   */
  async function runReviewsOrphansCleanup() {
    if (!confirm('¿Borrar las fotos huérfanas de reseñas?\n\nSon fotos del bucket que NO están referenciadas por ninguna reseña activa, y tienen más de 24h de antigüedad. La operación es irreversible.')) return;
    if (!confirm('Última confirmación: borrar archivos no se puede deshacer. ¿Continuar?')) return;

    const btn = $('reviewsOrphansRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = '🗑 Borrando...'; }

    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'run_reviews_orphans_manual');
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        toast('Error ejecutando limpieza: ' + (data?.error || resp.status), true);
        return;
      }
      const borradas    = data.borradas    || 0;
      const liberadosMb = data.liberados_mb || 0;
      if (data.capped) {
        toast(`✓ ${borradas} fotos borradas (${liberadosMb.toFixed(2)} MB). Quedan más para la próxima corrida (tope: ${data.cap_limit}).`);
      } else if (data.delete_error) {
        toast(`⚠ Borrado parcial — error: ${data.delete_error}`, true);
      } else {
        toast(`✓ Limpieza completada: ${borradas} foto${borradas === 1 ? '' : 's'} borrada${borradas === 1 ? '' : 's'} (${liberadosMb.toFixed(2)} MB)`);
      }
      // Refrescamos el status para reflejar el estado post-limpieza,
      // y el historial específico de reseñas para que aparezca la nueva entrada manual.
      loadReviewsOrphansStatus();
      loadReviewsCleanupLogs();
    } catch (err) {
      toast('Error de red ejecutando limpieza', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🗑 Ejecutar limpieza ahora'; }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // SESIÓN 43 — EMAILS DE RECOMPRA (UI del cron Tarea D)
  // ─────────────────────────────────────────────────────────────────
  // Card al final de la página de Cupones. Muestra cuántos pedidos
  // están esperando email de recompra (entregados hace ≥10 días sin
  // email enviado) y permite disparar el envío manualmente.
  // Backend: /api/cleanup-personalizacion
  //   get_recompra_status  → dryRun: cuenta candidatos sin enviar.
  //   run_recompra_manual  → envía emails ya mismo (no espera al cron).
  // ═════════════════════════════════════════════════════════════════

  /**
   * Carga el estado del sistema de recompra: cantidad de pedidos
   * pendientes de envío + estado del cupón configurado.
   * Renderiza el statusBox con 3 cards (pendientes, cupón, estado)
   * y habilita o deshabilita el botón "Enviar pendientes ahora".
   */
  async function loadRecompraStatus() {
    const statusBox = $('recompraStatusBox');
    const runBtn    = $('recompraRunBtn');
    if (!statusBox) return;

    statusBox.textContent = 'Cargando estado del sistema de recompra...';
    if (runBtn) runBtn.disabled = true;

    let data = null;
    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'get_recompra_status');
      data = await resp.json();
      if (!resp.ok || !data?.ok) {
        statusBox.innerHTML = `<span style="color:var(--red,#e57373)">Error cargando status: ${esc(data?.error || resp.status)}</span>`;
        return;
      }
    } catch (err) {
      statusBox.innerHTML = `<span style="color:var(--red,#e57373)">Error de red: ${esc(String(err?.message || err))}</span>`;
      return;
    }

    // Caso 1 — Cupón no configurado (env REPURCHASE_COUPON_CODE faltante o cupón inválido).
    // El backend devuelve { ok: true, skipped: true, reason: 'no_coupon_configured' } en este caso.
    if (data.skipped === true) {
      statusBox.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;padding:8px 4px">
          <div style="font-size:32px">⚠️</div>
          <div>
            <div style="font-size:13px;color:var(--red);font-weight:600;margin-bottom:4px">
              Feature desactivada
            </div>
            <div style="font-size:11px;color:var(--muted);line-height:1.6">
              No hay cupón configurado o el cupón está inactivo. Configurá la variable
              <code style="color:var(--gold)">REPURCHASE_COUPON_CODE</code> en Vercel
              con el código de un cupón activo y redeployá.
            </div>
          </div>
        </div>`;
      // Botón deshabilitado: no tiene sentido disparar si no hay cupón.
      if (runBtn) runBtn.disabled = true;
      return;
    }

    // Caso 2 — Feature activa. Render del status con 3 columnas.
    const candidates = data.candidates    || 0;
    const couponCode = data.coupon_code   || '—';
    const tienePendientes = candidates > 0;

    // Próximo cron: domingo a las 3am (Uruguay). Calculamos para mostrar.
    const proximoCron = calcularProximoDomingo3am();

    // Color y label dinámico según haya pendientes o no
    const estadoLabel  = tienePendientes
      ? `<span style="color:var(--gold)">${candidates} pendiente${candidates === 1 ? '' : 's'} de envío</span>`
      : `<span style="color:var(--green)">✓ Sin pendientes — todo al día</span>`;
    const pendColor    = tienePendientes ? 'var(--gold)' : 'var(--green)';

    statusBox.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">📬 Pendientes</div>
          <div style="font-size:24px;color:${pendColor};margin-top:4px;font-family:'Cormorant Garamond',serif;font-weight:300">${candidates}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">pedidos esperando email</div>
        </div>
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">🏷️ Cupón configurado</div>
          <div style="font-size:14px;color:var(--gold);margin-top:4px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px">${esc(couponCode)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">REPURCHASE_COUPON_CODE</div>
        </div>
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">📅 Próximo envío automático</div>
          <div style="font-size:13px;color:var(--white);margin-top:4px">${esc(proximoCron)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">cron semanal</div>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)">
        ${estadoLabel}
      </div>`;

    // Botón habilitado solo si hay pendientes
    if (runBtn) runBtn.disabled = !tienePendientes;
  }

  /**
   * Calcula la fecha/hora del próximo domingo a las 3am (Uruguay).
   * Es solo para mostrar al usuario "cuándo va a correr el cron sin
   * que hagas nada". Texto en español.
   *
   * Nota técnica: el cron real está en UTC (vercel.json: "0 6 * * 0"),
   * lo que equivale a las 3am Uruguay (UTC-3). Si Uruguay cambiara su
   * horario o el cron se moviera, hay que actualizar este texto.
   */
  function calcularProximoDomingo3am() {
    const ahora = new Date();
    const diaActual = ahora.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
    const horaActual = ahora.getHours();

    // Días hasta el próximo domingo. Si hoy es domingo y son <3am,
    // el próximo cron es HOY. Si es domingo y son ≥3am, el próximo
    // es en 7 días.
    let diasHastaDomingo;
    if (diaActual === 0) {
      diasHastaDomingo = horaActual < 3 ? 0 : 7;
    } else {
      diasHastaDomingo = 7 - diaActual;
    }

    const proximoDomingo = new Date(ahora);
    proximoDomingo.setDate(ahora.getDate() + diasHastaDomingo);
    proximoDomingo.setHours(3, 0, 0, 0);

    // Si el próximo es HOY, decimos "Hoy a las 3am". Si no, mostramos la fecha.
    const esHoy = diasHastaDomingo === 0;
    if (esHoy) return 'Hoy a las 3am';

    const dia    = proximoDomingo.getDate();
    const meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const mes    = meses[proximoDomingo.getMonth()];
    return `Domingo ${dia} de ${mes} · 3am`;
  }

  /**
   * Dispara el envío de emails de recompra manualmente.
   * Útil para no esperar al cron del domingo (testing o si querés
   * acelerar la conversión).
   * Doble confirmación: el envío es irreversible (el email YA sale).
   */
  async function runRecompraManual() {
    if (!confirm('¿Mandar AHORA los emails de recompra pendientes?\n\nLos clientes recibirán el cupón en sus inboxes en menos de 1 minuto. El envío es irreversible.')) return;

    const btn = $('recompraRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = '📤 Enviando...'; }

    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'run_recompra_manual');
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        toast('Error ejecutando envío: ' + (data?.error || resp.status), true);
        return;
      }
      // Si la feature está desactivada (cupón faltante), el backend devuelve skipped:true
      if (data.skipped === true) {
        toast('No hay cupón configurado — chequeá REPURCHASE_COUPON_CODE en Vercel', true);
        return;
      }
      const sent   = data.sent   || 0;
      const failed = data.failed || 0;
      if (sent > 0 && failed === 0) {
        toast(`✓ ${sent} email${sent === 1 ? '' : 's'} de recompra enviado${sent === 1 ? '' : 's'}`);
      } else if (sent > 0 && failed > 0) {
        toast(`⚠ Parcial: ${sent} enviados, ${failed} fallaron — revisá logs de Vercel`, true);
      } else if (failed > 0) {
        toast(`✕ ${failed} envío${failed === 1 ? '' : 's'} falló — revisá logs de Vercel`, true);
      } else {
        toast('Sin pendientes para enviar');
      }
      // Recargar status para reflejar el nuevo estado (candidates=0 después del envío)
      loadRecompraStatus();
    } catch (err) {
      toast('Error de red enviando recompra', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📤 Enviar pendientes ahora'; }
    }
  }

  function closeOrderDetail() {
    const modal = $('orderDetailModal');
    if (modal) modal.classList.remove('open');
  }

  /** Cambia estado desde la barra de progreso. */
  function setOrderStep(orderId, pasoIdx, esEnvio) {
    const ESTADOS_ENVIO  = ['Pendiente pago', 'En preparación', 'En camino',          'Entregado'];
    const ESTADOS_RETIRO = ['Pendiente pago', 'En preparación', 'Listo para retirar', 'Entregado'];
    const estados = esEnvio ? ESTADOS_ENVIO : ESTADOS_RETIRO;
    const nuevoEstado = estados[pasoIdx];
    if (!nuevoEstado) return;
    changeOrderStatus(orderId, nuevoEstado);
    setTimeout(() => viewOrder(orderId), 150);
  }

  /** Toggle cancelar/reactivar pedido. */
  function setOrderCancelado(orderId) {
    const o = state.allOrders.find(x => x.id === orderId);
    if (!o) return;
    const nuevoEstado = normalizarEstado(o.estado).includes('cancel')
      ? 'Pendiente pago'
      : 'Cancelado';
    changeOrderStatus(orderId, nuevoEstado);
    setTimeout(() => viewOrder(orderId), 150);
  }

  // ── TRACKING ──────────────────────────────────────────────────

  /** Abre la URL del transportista (con validación anti-XSS). */
  function openTrackingUrl() {
    const raw = ($('trackingUrl')?.value || '').trim();
    if (!raw) { toast('No hay URL cargada', true); return; }
    if (!/^https?:\/\//i.test(raw)) { toast('La URL debe empezar con https://', true); return; }
    window.open(raw, '_blank', 'noopener,noreferrer');
  }

  /** Guarda el nro + URL de seguimiento del pedido en Supabase. */
  async function saveTracking(orderId) {
    const nroRaw = ($('trackingNro')?.value || '').trim();
    const urlRaw = ($('trackingUrl')?.value || '').trim();

    if (urlRaw && !/^https?:\/\//i.test(urlRaw)) {
      toast('La URL debe empezar con https://', true); return;
    }

    const nro = nroRaw.replace(/[<>"']/g, '').substring(0, 100);
    const url = urlRaw.replace(/[<>"'\s]/g, '').substring(0, 500);

    const { ok, data } = await apiAdmin('update_order_tracking', {
      id: orderId,
      nro_seguimiento: nro,
      url_seguimiento: url,
    });

    if (!ok) {
      toast('Error guardando tracking' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    // Actualizar local
    const o = state.allOrders.find(x => x.id === orderId);
    if (o) { o.nro_seguimiento = nro; o.url_seguimiento = url; }

    toast('✅ Datos de seguimiento guardados');
  }

  // ═══════════════════════════════════════════════════════════════
  // EDITOR DE PRODUCTOS — modal con colores, estados y fotos
  // ═══════════════════════════════════════════════════════════════

  /** Nuevo producto — abre el modal vacío. */
  function openNewProduct() {
    state.editingProductId = null;
    state.colorRows = [];

    setText('modalTitle', 'Nuevo producto');
    ['editNombre', 'editPrecio', 'editDesc',
     'editCapacidad', 'editDimensiones', 'editMaterial', 'editNota',
     'editBilletes', 'editMonedas']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });

    // Personalización láser (Sesión 28 Bloque B): checkboxes en false por default
    setCheckbox('editPermAdelante', false);
    setCheckbox('editPermInterior', false);
    setCheckbox('editPermAtras',    false);
    setCheckbox('editPermTexto',    false);

    renderColorRows();
    setHTML('colorPhotosSection', '');

    const modal = $('productModal');
    if (modal) modal.classList.add('open');
  }

  /** Editar producto existente — abre el modal con datos prellenados. */
  function editProduct(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) { toast('Producto no encontrado', true); return; }

    state.editingProductId = id;
    setText('modalTitle', `Editar — Founder ${p.nombre}`);

    $('editNombre').value      = p.nombre;
    $('editPrecio').value      = p.precio;
    $('editDesc').value        = p.descripcion;
    $('editCapacidad').value   = p.capacidad;
    $('editDimensiones').value = p.dimensiones;
    $('editMaterial').value    = p.material;
    $('editNota').value        = p.nota;
    $('editBilletes').value    = p.lleva_billetes ? 'si' : '';
    $('editMonedas').value     = p.lleva_monedas  ? 'si' : '';

    // Personalización láser (Sesión 28 Bloque B): 4 toggles independientes.
    // Si el producto no tiene definidos estos campos (deploy parcial),
    // arrancan en false por defecto.
    setCheckbox('editPermAdelante', p.permite_grabado_adelante === true);
    setCheckbox('editPermInterior', p.permite_grabado_interior === true);
    setCheckbox('editPermAtras',    p.permite_grabado_atras    === true);
    setCheckbox('editPermTexto',    p.permite_grabado_texto    === true);

    // Copiar colores a state.colorRows (cada uno con uid único para tracking)
    state.colorRows = p.colors.map(c => ({
      uid:           ++state.colorRowUid,
      nombre:        c.nombre,
      estado:        c.estado || 'activo',
      precio_oferta: c.precio_oferta || null,
      stock_bajo:    c.stock_bajo === true,
      photos:        [...c.photos, '', '', '', '', ''].slice(0, 5),  // pad a 5
    }));

    renderColorRows();
    renderColorPhotos();

    const modal = $('productModal');
    if (modal) modal.classList.add('open');
  }

  function closeModal() {
    const modal = $('productModal');
    if (modal) modal.classList.remove('open');
  }

  /** Pinta los rows de colores con sus botones de estado y precio oferta. */
  function renderColorRows() {
    const cont = $('colorsEditor');
    if (!cont) return;

    cont.innerHTML = state.colorRows.map((c, idx) => {
      const isOferta = c.estado === 'oferta';
      const stockBajoSel = c.stock_bajo === true;
      return `
      <div class="color-row" data-uid="${c.uid}">
        <div class="color-dot" id="cd_${c.uid}" style="background:${COLOR_MAP[c.nombre] || '#555'}"></div>
        <input type="text" class="color-name-in" value="${esc(c.nombre)}" placeholder="Nombre del color"
          oninput="onColorNameInput(${c.uid}, this.value)">
        <div class="color-estado-btns">
          <button class="estado-btn ${c.estado === 'activo'    ? 'activo--sel'   : ''}"
            onclick="setColorEstado(${c.uid},'activo')"   type="button">🟢 Activo</button>
          <button class="estado-btn ${c.estado === 'sin_stock' ? 'sinstock--sel' : ''}"
            onclick="setColorEstado(${c.uid},'sin_stock')" type="button">🔴 Agotado</button>
          <button class="estado-btn ${c.estado === 'oferta'    ? 'oferta--sel'   : ''}"
            onclick="setColorEstado(${c.uid},'oferta')"   type="button">🏷️ Oferta</button>
          <button class="estado-btn estado-btn--stockbajo ${stockBajoSel ? 'stockbajo--sel' : ''}"
            onclick="toggleStockBajo(${c.uid})"
            title="Mostrar aviso de Pocas unidades en producto.html"
            type="button">⏳ Stock bajo</button>
        </div>
        <button class="rem-color" onclick="removeColorRow(${c.uid})" type="button">✕</button>
        <div class="oferta-precio-wrap" ${isOferta ? '' : 'style="display:none"'}>
          <span class="oferta-precio-label">Precio oferta $</span>
          <input type="number" class="oferta-precio-in"
            placeholder="ej: 1490"
            value="${c.precio_oferta || ''}"
            oninput="onPrecioOfertaInput(${c.uid}, this.value)" min="0">
        </div>
      </div>`;
    }).join('');
  }

  /** Agrega una fila de color vacía. */
  function addColorRow() {
    state.colorRows.push({
      uid:           ++state.colorRowUid,
      nombre:        '',
      estado:        'activo',
      precio_oferta: null,
      stock_bajo:    false,
      photos:        ['', '', '', '', ''],
    });
    renderColorRows();
    renderColorPhotos();
  }

  function removeColorRow(uid) {
    state.colorRows = state.colorRows.filter(c => c.uid !== uid);
    renderColorRows();
    renderColorPhotos();
  }

  /** Callback cuando cambia el nombre del color en el input. */
  function onColorNameInput(uid, newName) {
    const row = state.colorRows.find(c => c.uid === uid);
    if (!row) return;
    row.nombre = newName;
    // Actualizar el color-dot
    const dot = $('cd_' + uid);
    if (dot) dot.style.background = COLOR_MAP[newName.trim()] || '#555';
    // No re-renderizamos el editor de fotos acá porque el nombre va
    // cambiando carácter a carácter — la sección de fotos se refresca
    // al cambiar estado o al guardar.
  }

  function setColorEstado(uid, estado) {
    const row = state.colorRows.find(c => c.uid === uid);
    if (!row) return;
    row.estado = estado;
    if (estado !== 'oferta') row.precio_oferta = null;
    renderColorRows();
  }

  function onPrecioOfertaInput(uid, val) {
    const row = state.colorRows.find(c => c.uid === uid);
    if (!row) return;
    row.precio_oferta = parseInt(val, 10) || null;
  }

  /** Toggle del flag stock_bajo. Independiente de los 3 botones de estado:
   *  un color en "Oferta" o "Activo" puede tener stock bajo a la vez.
   *  Si el color está en "Agotado", el frontend (producto.html) ya ignora
   *  el flag automáticamente — no hace falta lógica extra acá. */
  function toggleStockBajo(uid) {
    const row = state.colorRows.find(c => c.uid === uid);
    if (!row) return;
    row.stock_bajo = !row.stock_bajo;
    renderColorRows();
  }

  // ── EDITOR DE FOTOS POR COLOR ─────────────────────────────────

  /** Re-renderiza los bloques de fotos (1 por color). */
  function renderColorPhotos() {
    const cont = $('colorPhotosSection');
    if (!cont) return;

    // Solo colores con nombre
    const colors = state.colorRows.filter(c => (c.nombre || '').trim());
    if (!colors.length) { cont.innerHTML = ''; return; }

    cont.innerHTML = `<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Fotos por color (hasta 5 por cada color)</div>` +
      colors.map(c => {
        const sid = sanitizeId('u' + c.uid);  // id único por fila, independiente del nombre
        return `<div class="photo-block" data-uid="${c.uid}">
          <div class="photo-head">
            <div class="photo-dot" style="background:${COLOR_MAP[c.nombre.trim()] || '#555'}"></div>
            <div class="photo-color-name">${esc(c.nombre)}</div>
          </div>
          <div class="photo-slots">
            ${c.photos.map((f, fi) => `
              <div class="photo-slot">
                <div class="slot-label">Foto ${fi + 1}</div>
                <input type="text" id="foto_${sid}_${fi}" value="${esc(f)}" placeholder="Link o pegá URL"
                  class="slot-input" oninput="onPhotoUrlInput(${c.uid}, ${fi}, this.value)">
                <div class="slot-btns">
                  <button class="slot-btn up" onclick="pickPhotoFile(${c.uid}, ${fi})" type="button">📁 Subir</button>
                </div>
                ${f
                  ? `<img src="${esc((typeof cld === 'function' ? cld : u => u)(f, 'thumb'))}" class="slot-prev" id="prev_${sid}_${fi}" alt="Foto ${fi + 1}">`
                  : `<div class="slot-empty" id="prev_${sid}_${fi}">📷</div>`}
              </div>`).join('')}
          </div>
        </div>`;
      }).join('');
  }

  /** Callback al tipear URL de foto manualmente. */
  function onPhotoUrlInput(uid, fi, url) {
    const row = state.colorRows.find(c => c.uid === uid);
    if (!row) return;
    row.photos[fi] = (url || '').trim();
    refreshPhotoPreview(uid, fi, row.photos[fi]);
  }

  /** Actualiza el preview de una foto específica. */
  function refreshPhotoPreview(uid, fi, url) {
    const sid = sanitizeId('u' + uid);
    const el = $('prev_' + sid + '_' + fi);
    if (!el) return;
    const cldFn = (typeof cld === 'function') ? cld : (u => u);
    el.outerHTML = url
      ? `<img src="${esc(cldFn(url, 'thumb'))}" class="slot-prev" id="prev_${sid}_${fi}" alt="Foto ${fi + 1}">`
      : `<div class="slot-empty" id="prev_${sid}_${fi}">📷</div>`;
  }

  /**
   * Abre un file picker y sube la imagen seleccionada a Supabase
   * Storage usando una signed URL. El binario NO pasa por Vercel:
   *   1) Pedimos a /api/admin una signed URL (action:"get_upload_url").
   *   2) Hacemos PUT directo a esa URL con el binario.
   *   3) Guardamos la URL pública resultante en el slot correspondiente.
   */
  function pickPhotoFile(uid, fi) {
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = 'image/*';
    f.onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await uploadPhotoToStorage(file, uid, fi);
    };
    f.click();
  }

  /** Upload real — usado también por el banner. Devuelve publicUrl o null. */
  async function uploadFileToStorage(file, suggestedName) {
    const filename = suggestedName || file.name || ('photo-' + Date.now() + '.jpg');

    // 1) Pedir signed URL al server
    const { ok, data } = await apiAdmin('get_upload_url', { filename });
    if (!ok || !data.uploadUrl) {
      toast('Error pidiendo URL de subida' + (data?.message ? ': ' + data.message : ''), true);
      return null;
    }

    // 2) PUT binario directo a Supabase Storage
    try {
      const putRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
      if (!putRes.ok) {
        const errTxt = await putRes.text().catch(() => '');
        console.error('[Founder Admin] Storage PUT failed:', putRes.status, errTxt);
        toast('Error al subir imagen (storage)', true);
        return null;
      }
    } catch (netErr) {
      console.error('[Founder Admin] Storage PUT network:', netErr);
      toast('Error de red al subir imagen', true);
      return null;
    }

    return data.publicUrl;
  }

  /** Upload específico de una foto de producto. */
  async function uploadPhotoToStorage(file, uid, fi) {
    const row = state.colorRows.find(c => c.uid === uid);
    if (!row) return;

    const sid = sanitizeId('u' + uid);
    const slotInput = $('foto_' + sid + '_' + fi);
    if (slotInput) slotInput.placeholder = 'Subiendo...';
    toast('⏳ Subiendo imagen...');

    const nombreSeguro = `${row.nombre || 'color'}-${fi + 1}-${Date.now()}.jpg`;
    const publicUrl = await uploadFileToStorage(file, nombreSeguro);

    if (slotInput) slotInput.placeholder = 'Link o pegá URL';
    if (!publicUrl) return;

    row.photos[fi] = publicUrl;
    if (slotInput) slotInput.value = publicUrl;
    refreshPhotoPreview(uid, fi, publicUrl);
    toast('✅ Foto subida');
  }

  // ── GUARDAR PRODUCTO ──────────────────────────────────────────
  /**
   * Guarda el producto completo (datos + colores + fotos) llamando
   * a /api/admin (action:"save_product"). El backend hace upsert
   * por slug, borra los colores viejos y los reinserta con las
   * fotos — así evitamos sincronizaciones parciales.
   */
  async function saveProduct() {
    const nombre = ($('editNombre')?.value || '').trim();
    const precio = parseInt($('editPrecio')?.value, 10);
    if (!nombre)           { toast('El nombre es obligatorio', true); return; }
    if (!precio || precio <= 0) { toast('El precio debe ser mayor a 0', true); return; }

    const descripcion      = ($('editDesc')?.value  || '').trim();
    const capacidad   = ($('editCapacidad')?.value   || '').trim();
    const dimensiones = ($('editDimensiones')?.value || '').trim();
    const material    = ($('editMaterial')?.value    || '').trim();
    const nota        = ($('editNota')?.value        || '').trim();
    const lleva_billetes = ($('editBilletes')?.value === 'si');
    const lleva_monedas  = ($('editMonedas')?.value  === 'si');

    // Personalización láser (Sesión 28 Bloque B): leer los 4 toggles
    const permite_grabado_adelante = getCheckbox('editPermAdelante');
    const permite_grabado_interior = getCheckbox('editPermInterior');
    const permite_grabado_atras    = getCheckbox('editPermAtras');
    const permite_grabado_texto    = getCheckbox('editPermTexto');

    // Construir colores — solo los que tienen nombre
    const colors = state.colorRows
      .filter(c => (c.nombre || '').trim())
      .map(c => ({
        nombre:        c.nombre.trim(),
        estado:        c.estado || 'activo',
        precio_oferta: c.estado === 'oferta' ? (c.precio_oferta || null) : null,
        stock_bajo:    c.stock_bajo === true,
        fotos:         c.photos.filter(u => u && u.trim()),
      }));

    // Si estamos editando, preservamos el orden y slug existentes.
    const existing = state.editingProductId
      ? state.products.find(p => p.id === state.editingProductId)
      : null;

    // Especificaciones legacy: el campo dejó de tener UI editable en
    // Sesión 44, pero la columna se conserva en DB. Para no borrar los
    // datos históricos al hacer upsert, preservamos lo que ya estaba
    // en el state (que vino del list_products). Para productos nuevos
    // arranca en [] que es el default seguro.
    const especificaciones = Array.isArray(existing?.especificaciones)
      ? existing.especificaciones
      : [];

    const product = {
      nombre,
      precio,
      descripcion,
      especificaciones,
      capacidad,
      dimensiones,
      material,
      nota,
      lleva_billetes,
      lleva_monedas,
      permite_grabado_adelante,
      permite_grabado_interior,
      permite_grabado_atras,
      permite_grabado_texto,
      orden: existing?.orden ?? (state.products.length + 1),
      activo: existing ? existing.activo : true,
    };
    if (existing?.slug) product.slug = existing.slug;

    const btn = $('saveBtn');
    if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

    const { ok, data } = await apiAdmin('save_product', { product, colors });

    if (btn) { btn.textContent = '💾 Guardar'; btn.disabled = false; }

    if (!ok) {
      toast('Error al guardar' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    closeModal();
    toast('✅ Producto guardado');
    await loadProducts();  // refresca todo desde la DB
  }

  // ── ELIMINAR PRODUCTO ─────────────────────────────────────────
  function confirmDelete(id) {
    state.pendingDeleteId = id;
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    setText('confirmMsg',
      `¿Estás seguro de que querés eliminar "Founder ${p.nombre}"? ` +
      `Esta acción no se puede deshacer. Se eliminarán también todos sus colores y fotos.`);
    const modal = $('confirmModal');
    if (modal) modal.classList.add('open');
  }

  function closeConfirm() {
    state.pendingDeleteId = null;
    const modal = $('confirmModal');
    if (modal) modal.classList.remove('open');
  }

  async function executeDelete() {
    const id = state.pendingDeleteId;
    if (!id) return;
    const p = state.products.find(x => x.id === id);

    const btn = $('confirmDeleteBtn');
    if (btn) { btn.textContent = '⏳ Eliminando...'; btn.disabled = true; }

    const { ok, data } = await apiAdmin('delete_product', { id });

    if (btn) { btn.textContent = 'Eliminar'; btn.disabled = false; }

    if (!ok) {
      toast('Error al eliminar' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    closeConfirm();
    toast(`✅ "${p?.nombre || 'Producto'}" eliminado`);
    await loadProducts();
  }

  // ═══════════════════════════════════════════════════════════════
  // CUPONES — CRUD completo
  // ═══════════════════════════════════════════════════════════════

  /** Lee cupones desde Supabase y los renderiza. */
  async function loadCoupons() {
    const wrap = $('cuponesTableWrap');
    if (wrap) wrap.innerHTML = '<div class="no-cupones">Cargando cupones...</div>';

    // Sesión 34: setup idempotente del toggle "Personalización gratis"
    // → opaca los campos clásicos (Tipo / Valor / Mínimo de compra)
    // mostrando al admin que esos campos no aplican.
    setupCuponPersonalizacionToggle();

    const { ok, data } = await apiAdmin('list_coupons');
    if (!ok) {
      if (wrap) wrap.innerHTML = `<div class="no-cupones">⚠️ No se pudieron cargar los cupones. <button class="btn btn-sm btn-secondary" onclick="loadCoupones()" style="margin-top:8px">Reintentar</button></div>`;
      return;
    }
    state.coupons = data.coupons || [];
    renderCouponsTable();
  }

  /** Sesión 34: instala el listener del checkbox 🎨 una sola vez.
   *  Es idempotente: si ya se instaló, retorna inmediatamente. */
  function setupCuponPersonalizacionToggle() {
    const chk = $('cpDescuentaPers');
    if (!chk || chk.dataset.s34Listener === '1') return;
    const classicWrap = $('cuponClassicFields');
    if (!classicWrap) return;
    const sync = () => {
      classicWrap.classList.toggle('is-disabled', chk.checked);
    };
    chk.addEventListener('change', sync);
    sync();  // estado inicial
    chk.dataset.s34Listener = '1';
  }

  /**
   * Formatea una fecha ISO a DD/MM/YYYY para mostrar en la tabla.
   * Si la fecha viene vacía o no es válida, devuelve '—'.
   */
  function fmtFecha(iso) {
    if (!iso) return '—';
    // Aceptamos YYYY-MM-DD o un Date ISO completo
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString('es-UY');
    } catch { return String(iso); }
  }

  /** Dibuja la tabla de cupones. */
  function renderCouponsTable() {
    const wrap = $('cuponesTableWrap');
    if (!wrap) return;
    if (!state.coupons.length) {
      wrap.innerHTML = '<div class="no-cupones">No hay cupones creados todavía</div>';
      return;
    }

    const rowsHtml = state.coupons.map(c => {
      const usoLabel = { multiuso: 'Multiuso', unico: 'Único uso', 'por-email': 'Por comprador' }[c.uso] || c.uso;
      // Sesión 33: si el cupón descuenta personalización, la columna
      // "Descuento" muestra cuántos slots cubre en vez del valor clásico.
      const descLabel = c.descuenta_personalizacion
        ? `${c.personalizacion_slots_cubiertos || 0} slot${(c.personalizacion_slots_cubiertos || 0) === 1 ? '' : 's'}`
        : (c.tipo === 'porcentaje' ? `${c.valor}%` : fmtUYU(c.valor));
      const minLabel  = (Number(c.min_compra) > 0) ? fmtUYU(c.min_compra) : '—';
      // Badges visuales junto al código (acompañan al texto, no lo reemplazan).
      // Sesión 32: 🔄 si es solo para clientes con compra previa.
      // Sesión 33: ✨ si es solo nuevos clientes; 🎨 si descuenta personalización.
      // Sesión 38: ⭐ si es el cupón de recompensa por reseña.
      const badges = [];
      if (c.solo_clientes_repetidos)     badges.push('<span title="Solo clientes con compra previa entregada" style="margin-left:4px;font-size:10px">🔄</span>');
      if (c.solo_clientes_nuevos)        badges.push('<span title="Solo nuevos clientes (sin compras previas)" style="margin-left:4px;font-size:10px">✨</span>');
      if (c.descuenta_personalizacion)   badges.push('<span title="Descuenta el costo de personalización" style="margin-left:4px;font-size:10px">🎨</span>');
      if (c.es_recompensa_resena)        badges.push('<span title="Cupón de recompensa por reseña" style="margin-left:4px;font-size:10px">⭐</span>');
      const badgesHtml = badges.join('');
      // Sesión 39: botón "Editar" agregado entre Pausar y Eliminar.
      return `<tr>
        <td><div class="cupon-code">${esc(c.codigo)}${badgesHtml}</div></td>
        <td>${descLabel}</td>
        <td style="font-size:10px;color:var(--muted)">${esc(usoLabel)}</td>
        <td style="font-size:10px;color:var(--muted)">${minLabel}</td>
        <td style="font-size:10px;color:var(--muted)">${fmtFecha(c.desde)} → ${fmtFecha(c.hasta)}</td>
        <td style="text-align:center">${c.usos_count || 0}</td>
        <td><span class="cupon-badge ${c.activo ? 'activo' : 'inactivo'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button class="btn btn-sm btn-secondary" onclick="editCupon('${esc(c.id)}')" title="Editar este cupón">✏️ Editar</button>
            <button class="btn btn-sm ${c.activo ? 'btn-secondary' : 'btn-primary'}" onclick="toggleCupon('${esc(c.id)}')">${c.activo ? '⏸️ Pausar' : '▶️ Activar'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCupon('${esc(c.id)}')">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="cupones-table">
      <thead><tr>
        <th>Código</th><th>Descuento</th><th>Uso</th><th>Mín. compra</th>
        <th>Vigencia</th><th>Usos</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  }

  // Sesión 39: estado del formulario de cupones — 'create' o 'edit'.
  // Cuando es 'edit', editingCouponId guarda el id que se está editando.
  // saveCupon() consulta este estado para decidir si llamar a create_coupon
  // o update_coupon. cancelEditCupon() lo resetea.
  let editingCouponId = null;

  // Sesión 52 — Dirty tracker del formulario de cupones.
  // Inicializado lazy (la primera vez que se usa) porque la página del
  // panel puede no haber renderizado el form al cargar el script.
  let cuponDirtyTracker = null;
  function ensureCuponDirtyTracker() {
    if (cuponDirtyTracker) return cuponDirtyTracker;
    const formCard = document.querySelector('.cupon-form-card');
    if (!formCard) return null;
    cuponDirtyTracker = createDirtyTracker({
      fieldIds: [
        'cpCodigo', 'cpTipo', 'cpValor', 'cpUso', 'cpMinCompra',
        'cpDesde',  'cpHasta', 'cpActivo',
        'cpSoloRepetidos', 'cpSoloNuevos',
        'cpDescuentaPers', 'cpEsRecompensaResena',
        'cpSlotsCubiertos',
      ],
      dirtyMarker:    '.cupon-form-title',
      containerEl:    formCard,
      discardMessage: 'Tenés cambios sin guardar en este cupón.\n\n¿Querés descartarlos?',
    });
    cuponDirtyTracker.bindAutoCheck();
    return cuponDirtyTracker;
  }

  /** Sesión 39: abre el formulario en modo edición pre-llenado con el cupón. */
  function editCupon(id) {
    const c = state.coupons.find(x => x.id === id);
    if (!c) return;

    editingCouponId = id;

    // Pre-llenar campos del formulario
    if ($('cpCodigo'))     $('cpCodigo').value     = c.codigo || '';
    if ($('cpTipo'))       $('cpTipo').value       = c.tipo || 'porcentaje';
    if ($('cpValor'))      $('cpValor').value      = String(c.valor ?? '');
    if ($('cpUso'))        $('cpUso').value        = c.uso || 'multiuso';
    if ($('cpMinCompra'))  $('cpMinCompra').value  = String(c.min_compra ?? '');
    if ($('cpDesde'))      $('cpDesde').value      = c.desde || '';
    if ($('cpHasta'))      $('cpHasta').value      = c.hasta || '';
    if ($('cpActivo'))     $('cpActivo').value     = c.activo ? 'true' : 'false';
    if ($('cpSoloRepetidos'))      $('cpSoloRepetidos').checked      = !!c.solo_clientes_repetidos;
    if ($('cpSoloNuevos'))         $('cpSoloNuevos').checked         = !!c.solo_clientes_nuevos;
    if ($('cpDescuentaPers'))      $('cpDescuentaPers').checked      = !!c.descuenta_personalizacion;
    if ($('cpEsRecompensaResena')) $('cpEsRecompensaResena').checked = !!c.es_recompensa_resena;
    if ($('cpSlotsCubiertos'))     $('cpSlotsCubiertos').value       = String(c.personalizacion_slots_cubiertos || 1);

    // Bloquear campos no editables (codigo + tipo) — Sesión 39 opción 2B
    if ($('cpCodigo')) { $('cpCodigo').readOnly = true; $('cpCodigo').classList.add('is-readonly'); }
    if ($('cpTipo'))   { $('cpTipo').disabled = true;   $('cpTipo').classList.add('is-readonly'); }

    // Actualizar visual del formulario: título, botón, botón cancelar
    const titleEl  = document.querySelector('.cupon-form-title');
    const btnSave  = $('cpSaveBtn');
    const btnCancel = $('cpCancelEditBtn');
    if (titleEl)  titleEl.textContent = `Editar cupón "${c.codigo}"`;
    if (btnSave)  btnSave.textContent = '💾 Guardar cambios';
    if (btnCancel) btnCancel.style.display = '';

    // Re-sync del toggle de personalización (las clases se aplican
    // según el checkbox que acabamos de marcar/desmarcar)
    const classicWrap = $('cuponClassicFields');
    if (classicWrap) classicWrap.classList.toggle('is-disabled', !!c.descuenta_personalizacion);

    // Scroll suave al formulario para que el admin lo vea
    const formCard = document.querySelector('.cupon-form-card');
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Sesión 52 — snapshot del estado limpio (ya con datos pre-cargados).
    ensureCuponDirtyTracker()?.captureSnapshot();
  }

  /** Sesión 39: cancela la edición y limpia el formulario (vuelve a modo crear).
   *  Sesión 52: pregunta confirmación si hay cambios sin guardar. */
  function cancelEditCupon() {
    // Si hay cambios sin guardar, pedir confirmación antes de descartar.
    if (!ensureCuponDirtyTracker()?.confirmDiscardIfDirty()) return;
    editingCouponId = null;
    resetCuponForm();
  }

  /** Sesión 39: deja el formulario en estado inicial limpio (modo crear). */
  function resetCuponForm() {
    // Limpiar todos los inputs
    ['cpCodigo', 'cpValor', 'cpMinCompra', 'cpDesde', 'cpHasta']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });
    ['cpSoloRepetidos', 'cpSoloNuevos', 'cpDescuentaPers', 'cpEsRecompensaResena']
      .forEach(id => { const el = $(id); if (el) el.checked = false; });
    if ($('cpTipo'))   $('cpTipo').value   = 'porcentaje';
    if ($('cpUso'))    $('cpUso').value    = 'multiuso';
    if ($('cpActivo')) $('cpActivo').value = 'true';
    const slotsSel = $('cpSlotsCubiertos'); if (slotsSel) slotsSel.value = '1';

    // Restaurar campos editables (estaban bloqueados en modo edición)
    if ($('cpCodigo')) { $('cpCodigo').readOnly = false; $('cpCodigo').classList.remove('is-readonly'); }
    if ($('cpTipo'))   { $('cpTipo').disabled = false;   $('cpTipo').classList.remove('is-readonly'); }

    // Restaurar título y botones
    const titleEl   = document.querySelector('.cupon-form-title');
    const btnSave   = $('cpSaveBtn');
    const btnCancel = $('cpCancelEditBtn');
    if (titleEl)   titleEl.textContent = 'Nuevo cupón';
    if (btnSave)   btnSave.textContent = 'Crear cupón';
    if (btnCancel) btnCancel.style.display = 'none';

    // Re-sync visual de campos clásicos
    const classicWrap = $('cuponClassicFields');
    if (classicWrap) classicWrap.classList.remove('is-disabled');

    // Sesión 52 — resetear el dirty tracker tras dejar el form limpio.
    ensureCuponDirtyTracker()?.captureSnapshot();
  }

  /** Sesión 39: guarda el cupón. Bifurca entre crear y editar según editingCouponId. */
  async function saveCupon() {
    const codigo = ($('cpCodigo')?.value || '').trim().toUpperCase();
    const uso    = $('cpUso')?.value  || 'multiuso';
    const desde  = $('cpDesde')?.value || '';  // YYYY-MM-DD
    const hasta  = $('cpHasta')?.value || '';
    const activo = ($('cpActivo')?.value === 'true');
    const solo_clientes_repetidos       = !!($('cpSoloRepetidos')?.checked);   // Sesión 32
    const solo_clientes_nuevos          = !!($('cpSoloNuevos')?.checked);      // Sesión 33
    const descuenta_personalizacion     = !!($('cpDescuentaPers')?.checked);   // Sesión 33
    const es_recompensa_resena          = !!($('cpEsRecompensaResena')?.checked); // Sesión 38
    const personalizacion_slots_cubiertos =
      descuenta_personalizacion ? (parseInt($('cpSlotsCubiertos')?.value, 10) || 1) : 0;

    // Sesión 34 fix: en modo personalización los campos clásicos NO se
    // mandan al backend (forzamos defaults). En modo clásico se leen
    // del formulario normalmente.
    const tipo       = descuenta_personalizacion ? 'porcentaje' : ($('cpTipo')?.value || 'porcentaje');
    const valor      = descuenta_personalizacion ? 0 : parseFloat($('cpValor')?.value || '0');
    const min_compra = descuenta_personalizacion ? 0 : (parseFloat($('cpMinCompra')?.value || '0') || 0);

    // Validaciones locales (UX rápido — el backend re-valida igual)
    if (!codigo) { toast('El código es obligatorio', true); return; }

    // Sesión 33: combinación excluyente nuevos vs repetidos
    if (solo_clientes_repetidos && solo_clientes_nuevos) {
      toast('No podés marcar "Solo nuevos" y "Solo con compra previa" al mismo tiempo', true);
      return;
    }

    if (!descuenta_personalizacion) {
      if (!valor || valor <= 0) { toast('El valor debe ser mayor a 0', true); return; }
    }

    const isEdit = !!editingCouponId;

    // Solo validamos duplicado de código cuando estamos CREANDO.
    if (!isEdit && state.coupons.some(c => c.codigo === codigo)) {
      toast('Ya existe un cupón con ese código', true); return;
    }

    const btn = $('cpSaveBtn');
    if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

    let resp;
    if (isEdit) {
      // ── Modo EDICIÓN ──
      // Backend bloquea codigo + tipo, pero los mandamos por compatibilidad.
      // El whitelist del backend descarta lo que no debe editarse.
      resp = await apiAdmin('update_coupon', {
        id: editingCouponId,
        patch: {
          valor, uso, min_compra,
          desde: desde || null, hasta: hasta || null, activo,
          solo_clientes_repetidos,
          solo_clientes_nuevos,
          descuenta_personalizacion,
          personalizacion_slots_cubiertos,
          es_recompensa_resena,
        },
      });
    } else {
      // ── Modo CREAR ──
      resp = await apiAdmin('create_coupon', {
        coupon: {
          codigo, tipo, valor, uso, min_compra,
          desde: desde || null, hasta: hasta || null, activo,
          solo_clientes_repetidos,
          solo_clientes_nuevos, descuenta_personalizacion,
          personalizacion_slots_cubiertos,
          es_recompensa_resena,
        },
      });
    }

    if (btn) {
      btn.textContent = isEdit ? '💾 Guardar cambios' : 'Crear cupón';
      btn.disabled = false;
    }

    if (!resp.ok) {
      // Mapeo de errores específicos a mensajes amigables
      const errCode = resp.data?.error;
      let msg;
      if (errCode === 'codigo_duplicate') {
        msg = 'Ya existe un cupón con ese código';
      } else if (errCode === 'cupon_combinacion_invalida') {
        msg = 'No podés marcar "Solo nuevos" y "Solo con compra previa" al mismo tiempo';
      } else if (errCode === 'slots_invalidos') {
        msg = 'Cuando el cupón descuenta personalización, debés indicar entre 1 y 4 slots';
      } else if (errCode === 'valor_required') {
        msg = 'El valor del descuento es obligatorio';
      } else if (errCode === 'cupon_not_found') {
        msg = 'El cupón ya no existe — recargá la página';
      } else {
        msg = `Error al ${isEdit ? 'guardar los cambios' : 'guardar el cupón'}` + (resp.data?.message ? ': ' + resp.data.message : '');
      }
      toast(msg, true);
      return;
    }

    // Éxito → mensaje + limpiar form + recargar tabla
    toast(`✅ Cupón ${codigo} ${isEdit ? 'actualizado' : 'creado'}`);
    // Sesión 52 — sincronizar el snapshot antes de cancelar la edición
    // para que cancelEditCupon NO detecte un falso "dirty" y pida
    // confirmación de descarte de cambios que ya fueron guardados.
    ensureCuponDirtyTracker()?.reset();
    cancelEditCupon();  // resetea form y editingCouponId
    await loadCoupons();
  }

  /** Pausa/activa un cupón existente. */
  async function toggleCupon(id) {
    const c = state.coupons.find(x => x.id === id);
    if (!c) return;
    const newActivo = !c.activo;
    const { ok, data } = await apiAdmin('update_coupon', {
      id,
      patch: { activo: newActivo },
    });
    if (!ok) { toast('Error al actualizar' + (data?.message ? ': ' + data.message : ''), true); return; }

    // Sesión 39 hotfix: si reactivamos un cupón único que ya estaba usado,
    // el backend lo resetea automáticamente (usos_count → 0). Recargamos
    // la lista completa para que la UI refleje el nuevo contador y
    // mostramos un mensaje específico para que el admin sepa qué pasó.
    const seHizoResetUnico = (newActivo === true)
                             && c.uso === 'unico'
                             && Number(c.usos_count) >= 1;
    if (seHizoResetUnico) {
      await loadCoupons();
      toast(`Cupón ${c.codigo} reactivado — usos reiniciados a 0`);
      return;
    }

    // Caso normal (no hubo reset): update local rápido sin recargar.
    c.activo = newActivo;
    renderCouponsTable();
    toast(`Cupón ${c.codigo} ${newActivo ? 'activado' : 'pausado'}`);
  }

  /** Elimina un cupón (con confirm nativo). */
  async function deleteCupon(id) {
    const c = state.coupons.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`¿Eliminar el cupón "${c.codigo}"? Esta acción no se puede deshacer.`)) return;

    const { ok, data } = await apiAdmin('delete_coupon', { id });
    if (!ok) { toast('Error al eliminar' + (data?.message ? ': ' + data.message : ''), true); return; }
    // Sesión 39: si estaba en edición, cancelar
    if (editingCouponId === id) cancelEditCupon();
    toast(`Cupón ${c.codigo} eliminado`);
    await loadCoupons();
  }

  // ═══════════════════════════════════════════════════════════════
  // HERO SLIDES (Sesión 48)
  // ───────────────────────────────────────────────────────────────
  // Reemplaza al banner único de Sesión 26. La config completa se
  // guarda en `site_settings.hero_slides` como JSON serializado.
  //
  // Cada slide tiene: id, enabled, orden, label, title_html, subtitle,
  // image_url, buttons[] (0-2 botones con text/url/style).
  //
  // El admin gestiona TODOS los slides (activos y pausados). El sitio
  // público solo lee los `enabled:true` — los pausados no consumen
  // recursos (ni se descargan sus imágenes).
  // ═══════════════════════════════════════════════════════════════

  const HERO_SLIDES_KEY = 'hero_slides';
  const HERO_SLIDES_DEFAULT_AUTOPLAY = 8000;

  /** Genera un id único corto para un slide nuevo. */
  function genSlideId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /** Crea un slide vacío con los textos hardcoded como placeholder.
   *  El admin puede editarlos completamente desde la UI. */
  function blankSlide(orden = 1) {
    return {
      id:         genSlideId(),
      enabled:    true,
      orden,
      label:      'Founder.uy — Uruguay',
      title_html: 'Título<br>del <em>banner</em>',
      subtitle:   'Descripción breve del banner. Editá este texto desde el admin.',
      image_url:  '',
      buttons: [
        { text: 'Ver más', url: '#productos', style: 'primary' },
      ],
    };
  }

  /** Lee la configuración del backend. Devuelve { autoplay_ms, slides[] }.
   *  Si la fila no existe (primera vez), devuelve estructura vacía. */
  async function fetchHeroSlidesConfig() {
    const { ok, data } = await apiAdmin('get_setting', { key: HERO_SLIDES_KEY });
    if (!ok) return { autoplay_ms: HERO_SLIDES_DEFAULT_AUTOPLAY, slides: [] };
    const raw = data?.value || '';
    if (!raw) return { autoplay_ms: HERO_SLIDES_DEFAULT_AUTOPLAY, slides: [] };
    try {
      const parsed = JSON.parse(raw);
      return {
        autoplay_ms: Number.isFinite(parsed?.autoplay_ms) ? parsed.autoplay_ms : HERO_SLIDES_DEFAULT_AUTOPLAY,
        slides: Array.isArray(parsed?.slides) ? parsed.slides : [],
      };
    } catch (e) {
      console.warn('[admin] hero_slides JSON inválido — devolviendo vacío:', e);
      return { autoplay_ms: HERO_SLIDES_DEFAULT_AUTOPLAY, slides: [] };
    }
  }

  /** Guarda la configuración entera en backend. */
  async function persistHeroSlidesConfig(silent = false) {
    const payload = JSON.stringify({
      autoplay_ms: state.hero?.autoplay_ms ?? HERO_SLIDES_DEFAULT_AUTOPLAY,
      slides:      state.hero?.slides || [],
    });
    const { ok, data } = await apiAdmin('set_setting', { key: HERO_SLIDES_KEY, value: payload });
    if (!ok) {
      toast('Error guardando los slides' + (data?.message ? ': ' + data.message : ''), true);
      return false;
    }
    if (!silent) toast('✅ Cambios guardados');
    return true;
  }

  /** Carga inicial del panel de banners. Trae el JSON serializado de
   *  `site_settings.hero_slides` y lo deja en `state.hero` para que las
   *  funciones de render/edición operen sobre él.
   *
   *  Nota: hasta Sesión 49 había acá un bloque de migración automática
   *  desde el banner único legacy (`hero_banner_url`) — se eliminó cuando
   *  todos los entornos quedaron migrados al nuevo formato. El parámetro
   *  `opts` se conserva para compatibilidad con el bootstrap inicial. */
  async function loadBanner(_opts = {}) {
    state.hero = await fetchHeroSlidesConfig();
    renderHeroSlidesPanel();
  }

  /** Renderiza la lista completa de slides en el panel. */
  function renderHeroSlidesPanel() {
    const container = $('heroSlidesList');
    if (!container) return;

    const slides = state.hero?.slides || [];
    if (slides.length === 0) {
      container.innerHTML = `
        <div class="hero-slides-empty">
          <p>No tenés banners configurados todavía.</p>
          <button class="btn btn-primary" onclick="addHeroSlide()">+ Crear primer banner</button>
        </div>`;
      return;
    }

    // Ordenar por `orden` ascendente para mostrar
    const sorted = [...slides].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));

    container.innerHTML = sorted.map((s, displayIdx) => {
      const isFirst = displayIdx === 0;
      const isLast  = displayIdx === sorted.length - 1;
      const enabled = s.enabled !== false;
      return `
        <div class="hero-slide-card${enabled ? '' : ' is-paused'}" data-slide-id="${escapeAttr(s.id)}" data-slide-index="${displayIdx}" draggable="true">
          <div class="hero-slide-card__preview">
            ${s.image_url
              ? `<img src="${escapeAttr(s.image_url)}" alt="" loading="lazy" draggable="false">`
              : `<div class="hero-slide-card__noimg">Sin imagen</div>`}
          </div>
          <div class="hero-slide-card__info">
            <div class="hero-slide-card__row">
              <div class="hero-slide-card__order">#${displayIdx + 1}</div>
              <div class="hero-slide-card__title">${escapeAttr(stripHtml(s.title_html || '(sin título)'))}</div>
              <div class="hero-slide-card__state">${enabled ? '🟢 Activo' : '⏸️ Pausado'}</div>
            </div>
            <div class="hero-slide-card__sub">${escapeAttr(s.subtitle || '')}</div>
            <div class="hero-slide-card__actions">
              <button class="btn btn-secondary btn-sm" onclick="editHeroSlide('${escapeAttr(s.id)}')">✏️ Editar</button>
              <button class="btn btn-secondary btn-sm" onclick="toggleHeroSlide('${escapeAttr(s.id)}')">${enabled ? '⏸️ Pausar' : '▶️ Activar'}</button>
              <button class="btn btn-secondary btn-sm" onclick="duplicateHeroSlide('${escapeAttr(s.id)}')">📋 Duplicar</button>
              <button class="btn btn-secondary btn-sm" onclick="moveHeroSlide('${escapeAttr(s.id)}', -1)" ${isFirst ? 'disabled' : ''}>↑</button>
              <button class="btn btn-secondary btn-sm" onclick="moveHeroSlide('${escapeAttr(s.id)}', 1)" ${isLast ? 'disabled' : ''}>↓</button>
              <button class="btn btn-secondary btn-sm" onclick="deleteHeroSlide('${escapeAttr(s.id)}')" style="color:var(--danger)">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Engancha el drag-and-drop tras cada render. Los listeners viven en el
    // contenedor (event delegation) por lo que solo se setean UNA vez por
    // sesión — los re-renders no los duplican.
    bindHeroSlidesDragAndDrop();
  }

  /** Helper: extrae texto plano de un fragmento HTML (para preview). */
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html ?? '');
    return tmp.textContent || tmp.innerText || '';
  }
  /** Helper: escapa un valor para usar como atributo HTML. */
  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Drag-and-drop para reordenar slides (Sesión 49) ──────────
  // Implementación nativa HTML5 sin dependencias. Los listeners viven en
  // el contenedor (event delegation) para que NO se dupliquen al re-render.
  // Los botones ↑↓ siguen siendo el camino primario en mobile y para
  // accesibilidad por teclado — el drag solo se activa con mouse/touch
  // sobre la card completa.

  let heroDragListenersBound = false;
  let heroDragSourceId = null;     // id del slide que se está arrastrando

  function bindHeroSlidesDragAndDrop() {
    if (heroDragListenersBound) return;
    const container = $('heroSlidesList');
    if (!container) return;

    // dragstart: marcar la card de origen
    container.addEventListener('dragstart', (ev) => {
      const card = ev.target.closest('.hero-slide-card');
      if (!card) return;
      heroDragSourceId = card.dataset.slideId || null;
      card.classList.add('is-dragging');
      // Permitir "move" como efecto de drag
      try {
        ev.dataTransfer.effectAllowed = 'move';
        // Firefox requiere setData para iniciar el drag — usamos el id
        ev.dataTransfer.setData('text/plain', heroDragSourceId || '');
      } catch (e) { /* algunos navegadores tiran si no hay dataTransfer */ }
    });

    container.addEventListener('dragend', (ev) => {
      const card = ev.target.closest('.hero-slide-card');
      if (card) card.classList.remove('is-dragging');
      clearDropTargets();
      heroDragSourceId = null;
    });

    // dragover: pintar la línea dorada arriba/abajo del card sobre el que pasa
    container.addEventListener('dragover', (ev) => {
      const card = ev.target.closest('.hero-slide-card');
      if (!card || !heroDragSourceId) return;
      if (card.dataset.slideId === heroDragSourceId) {
        clearDropTargets();
        return;
      }
      ev.preventDefault();             // habilita el drop
      ev.dataTransfer.dropEffect = 'move';

      // Decidir si el drop va ANTES o DESPUÉS de la card hover, según
      // si el mouse está por encima o por debajo de su centro vertical.
      const rect = card.getBoundingClientRect();
      const isBefore = (ev.clientY - rect.top) < rect.height / 2;

      clearDropTargets();
      card.classList.add(isBefore ? 'is-drop-target-before' : 'is-drop-target-after');
    });

    container.addEventListener('dragleave', (ev) => {
      // Solo limpiamos si el cursor salió del contenedor entero, no de una card a la vecina.
      if (!container.contains(ev.relatedTarget)) clearDropTargets();
    });

    container.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      const card = ev.target.closest('.hero-slide-card');
      const sourceId = heroDragSourceId;
      clearDropTargets();
      heroDragSourceId = null;
      if (!card || !sourceId) return;
      const targetId = card.dataset.slideId;
      if (!targetId || targetId === sourceId) return;

      const rect = card.getBoundingClientRect();
      const dropBefore = (ev.clientY - rect.top) < rect.height / 2;
      await reorderHeroSlidesByDrop(sourceId, targetId, dropBefore);
    });

    heroDragListenersBound = true;
  }

  function clearDropTargets() {
    document.querySelectorAll('.hero-slide-card.is-drop-target-before, .hero-slide-card.is-drop-target-after')
      .forEach(el => el.classList.remove('is-drop-target-before', 'is-drop-target-after'));
  }

  /** Reordena los slides ubicando `sourceId` antes o después de `targetId`.
   *  Re-numera todos los `orden` 1..N para evitar huecos. Persiste y re-renderiza. */
  async function reorderHeroSlidesByDrop(sourceId, targetId, dropBefore) {
    const slides = state.hero?.slides || [];
    if (slides.length < 2) return;

    // Trabajamos sobre una copia ordenada visualmente (1..N)
    const sorted = [...slides].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
    const srcIdx = sorted.findIndex(s => s.id === sourceId);
    const tgtIdx = sorted.findIndex(s => s.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return;

    // Quitamos el source de su posición actual
    const [moved] = sorted.splice(srcIdx, 1);

    // Recalculamos el target después del splice (puede haber cambiado de índice)
    const newTgtIdx = sorted.findIndex(s => s.id === targetId);
    const insertAt = dropBefore ? newTgtIdx : newTgtIdx + 1;
    sorted.splice(insertAt, 0, moved);

    // Re-numerar 1..N
    sorted.forEach((s, i) => { s.orden = i + 1; });

    state.hero.slides = sorted;
    const ok = await persistHeroSlidesConfig(true);
    if (ok) {
      toast('✅ Orden actualizado');
      renderHeroSlidesPanel();
    }
  }

  /** Agrega un slide nuevo en blanco y abre el modal de edición. */
  async function addHeroSlide() {
    const slides = state.hero?.slides || [];
    const maxOrden = slides.reduce((m, s) => Math.max(m, s.orden || 0), 0);
    const newSlide = blankSlide(maxOrden + 1);
    state.hero.slides = [...slides, newSlide];
    await persistHeroSlidesConfig(true);
    renderHeroSlidesPanel();
    editHeroSlide(newSlide.id);
  }

  /** Abre el modal de edición de un slide. */
  function editHeroSlide(id) {
    const slide = (state.hero?.slides || []).find(s => s.id === id);
    if (!slide) { toast('Slide no encontrado', true); return; }

    // Rellenar el form
    $('heroEditId').value        = slide.id;
    $('heroEditLabel').value     = slide.label || '';
    $('heroEditTitle').value     = slide.title_html || '';
    $('heroEditSubtitle').value  = slide.subtitle || '';
    $('heroEditImage').value     = slide.image_url || '';
    renderHeroEditImagePreview(slide.image_url || '');

    // Botones (hasta 2)
    const btns = Array.isArray(slide.buttons) ? slide.buttons : [];
    $('heroEditBtn1Text').value  = btns[0]?.text || '';
    $('heroEditBtn1Url').value   = btns[0]?.url || '';
    $('heroEditBtn1Style').value = btns[0]?.style || 'primary';
    $('heroEditBtn2Text').value  = btns[1]?.text || '';
    $('heroEditBtn2Url').value   = btns[1]?.url || '';
    $('heroEditBtn2Style').value = btns[1]?.style || 'secondary';

    // Snapshot del estado limpio (Sesión 49 — detección de cambios sin guardar).
    // Tomamos el snapshot DESPUÉS de rellenar y ANTES de mostrar el modal
    // para que cualquier modificación posterior se detecte como "dirty".
    heroEditSnapshot = snapshotHeroEditForm();
    setHeroEditDirty(false);

    // Abrir modal + enganchar listeners (una sola vez)
    const modal = $('heroEditModal');
    if (modal) {
      modal.classList.add('open');
      bindHeroEditModalListeners();
    }
  }

  /** Engancha listeners del modal heroEdit una sola vez por sesión.
   *  El cierre por "click fuera" se hace con mousedown+mouseup AMBOS sobre
   *  el overlay. Esto evita el bug de cierre accidental cuando el usuario
   *  selecciona texto dentro de un <textarea> (mousedown adentro, mouseup
   *  fuera) y el evento click final cae sobre el overlay.
   *
   *  También engancha listeners de "input"/"change" sobre el modal entero
   *  (event delegation) para detectar cambios sin guardar — Sesión 49. */
  let heroEditListenersBound = false;
  function bindHeroEditModalListeners() {
    if (heroEditListenersBound) return;
    const modal = $('heroEditModal');
    if (!modal) return;

    let pressStartedOnOverlay = false;
    modal.addEventListener('mousedown', (ev) => {
      pressStartedOnOverlay = (ev.target === modal);
    });
    modal.addEventListener('mouseup', (ev) => {
      if (pressStartedOnOverlay && ev.target === modal) {
        closeHeroEditModal();
      }
      pressStartedOnOverlay = false;
    });
    // ESC cierra el modal
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modal.classList.contains('open')) {
        closeHeroEditModal();
      }
    });

    // Sesión 49 — Detección de cambios sin guardar.
    // Event delegation sobre el modal: cualquier input/select/textarea
    // que cambie dispara el check. Los listeners viven en el contenedor,
    // no en cada campo — más liviano y robusto.
    modal.addEventListener('input',  checkHeroEditDirty);
    modal.addEventListener('change', checkHeroEditDirty);

    heroEditListenersBound = true;
  }

  // ── Indicador de cambios sin guardar (Sesión 49) ──────────────
  // El patrón es simple: al abrir el modal tomamos un "snapshot" del
  // estado del form. Cada vez que cambia un campo, comparamos el form
  // actual contra el snapshot. Si difiere → dirty. Al guardar exitoso
  // o cerrar, reseteamos. Es deliberadamente simple — no usamos un
  // dirty-flag local porque snapshot comparison es más confiable (sigue
  // funcionando aunque el usuario "deshaga" un cambio escribiendo y
  // borrando hasta volver al original).

  let heroEditSnapshot = '';

  /** Captura el estado actual del form como string serializable.
   *  Cualquier diferencia byte-a-byte se considera "cambio". */
  function snapshotHeroEditForm() {
    return JSON.stringify({
      label:    $('heroEditLabel')?.value     || '',
      title:    $('heroEditTitle')?.value     || '',
      subtitle: $('heroEditSubtitle')?.value  || '',
      image:    $('heroEditImage')?.value     || '',
      b1t:      $('heroEditBtn1Text')?.value  || '',
      b1u:      $('heroEditBtn1Url')?.value   || '',
      b1s:      $('heroEditBtn1Style')?.value || '',
      b2t:      $('heroEditBtn2Text')?.value  || '',
      b2u:      $('heroEditBtn2Url')?.value   || '',
      b2s:      $('heroEditBtn2Style')?.value || '',
    });
  }

  /** Compara el estado actual del form contra el snapshot y actualiza el
   *  indicador visual (puntito dorado al lado del título del modal). */
  function checkHeroEditDirty() {
    const now = snapshotHeroEditForm();
    setHeroEditDirty(now !== heroEditSnapshot);
  }

  /** Aplica o quita la clase is-dirty al título del modal. Centralizado
   *  para que cualquier punto del flujo que necesite setear el estado
   *  pase por acá (consistencia). */
  function setHeroEditDirty(isDirty) {
    const titleEl = $('heroEditModal')?.querySelector('.modal-title');
    if (!titleEl) return;
    titleEl.classList.toggle('is-dirty', !!isDirty);
  }

  /** Devuelve true si hay cambios sin guardar. Usado por closeHeroEditModal
   *  para preguntar confirmación antes de cerrar. */
  function hasUnsavedHeroEditChanges() {
    return snapshotHeroEditForm() !== heroEditSnapshot;
  }

  function closeHeroEditModal() {
    // Si hay cambios sin guardar, confirmar antes de descartar.
    if (hasUnsavedHeroEditChanges()) {
      if (!confirm('Tenés cambios sin guardar.\n\n¿Querés descartarlos?')) return;
    }
    const modal = $('heroEditModal');
    if (modal) modal.classList.remove('open');
    // Reseteamos el snapshot para que el próximo abrir arranque limpio.
    heroEditSnapshot = '';
    setHeroEditDirty(false);
  }

  // ── Vista previa del slide en edición (Sesión 49) ─────────────
  // Lee el estado ACTUAL del formulario (no del state.hero) para que el
  // usuario vea cómo queda el slide ANTES de guardar. Reutiliza las
  // mismas helpers del sitio público (sanitizeTitleHTML / sanitizeUrl /
  // escapeText) — replicadas localmente para mantener este módulo
  // autosuficiente respecto a index.html.

  /** Escapado mínimo para texto plano. */
  function escText(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Sanitiza HTML del título: solo permite <br> y <em>. Mismo criterio
   *  que sanitizeTitleHTML() en index.html — defensa en profundidad
   *  para que el preview no ejecute scripts pegados a mano. */
  function sanitizePreviewTitle(raw) {
    const s = String(raw ?? '');
    const cleaned = s
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '');
    return cleaned.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
      const t = tag.toLowerCase();
      if (t === 'br') return '<br>';
      if (t === 'em') return match.toLowerCase().startsWith('</') ? '</em>' : '<em>';
      return '';
    });
  }

  /** Renderiza el slide en vivo desde los campos del formulario de edición. */
  function renderHeroPreviewStage() {
    const stage = $('heroPreviewStage');
    if (!stage) return;

    const imageUrl = ($('heroEditImage')?.value || '').trim();
    const label    = ($('heroEditLabel')?.value || '').trim();
    const titleRaw = ($('heroEditTitle')?.value || '').trim();
    const subtitle = ($('heroEditSubtitle')?.value || '').trim();

    // Botones (mismo criterio que saveHeroSlideEdit: vacíos se omiten)
    const buttons = [];
    const b1Text = ($('heroEditBtn1Text')?.value || '').trim();
    if (b1Text) buttons.push({
      text:  b1Text,
      style: $('heroEditBtn1Style')?.value === 'secondary' ? 'secondary' : 'primary',
    });
    const b2Text = ($('heroEditBtn2Text')?.value || '').trim();
    if (b2Text) buttons.push({
      text:  b2Text,
      style: $('heroEditBtn2Style')?.value === 'secondary' ? 'secondary' : 'primary',
    });

    const imgHTML = imageUrl
      ? `<img class="hero-preview-bgimg" src="${escText(imageUrl)}" alt="">`
      : '';

    const btnsHTML = buttons.map(b => {
      const cls = b.style === 'secondary' ? 'hero-preview-btn--secondary' : 'hero-preview-btn--primary';
      return `<span class="hero-preview-btn ${cls}">${escText(b.text)}</span>`;
    }).join('');

    const titleHTML = titleRaw
      ? sanitizePreviewTitle(titleRaw)
      : '<span style="color:rgba(255,255,255,.3)">(sin título)</span>';

    stage.innerHTML = `
      ${imgHTML}
      <div class="hero-preview-content">
        ${label ? `<div class="hero-preview-label">${escText(label)}</div>` : ''}
        <h1 class="hero-preview-title">${titleHTML}</h1>
        ${subtitle ? `<p class="hero-preview-desc">${escText(subtitle)}</p>` : ''}
        ${btnsHTML ? `<div class="hero-preview-ctas">${btnsHTML}</div>` : ''}
      </div>
      <div class="hero-preview-letter" aria-hidden="true">F</div>
    `;
  }

  /** Abre el modal de vista previa con los datos del formulario actual. */
  function openHeroPreviewModal() {
    renderHeroPreviewStage();
    const modal = $('heroPreviewModal');
    if (modal) {
      modal.classList.add('open');
      bindHeroPreviewModalListeners();
    }
  }

  function closeHeroPreviewModal() {
    const modal = $('heroPreviewModal');
    if (modal) modal.classList.remove('open');
  }

  /** Listeners del modal de preview (idempotentes, mismo patrón que el de edición). */
  let heroPreviewListenersBound = false;
  function bindHeroPreviewModalListeners() {
    if (heroPreviewListenersBound) return;
    const modal = $('heroPreviewModal');
    if (!modal) return;

    let pressStartedOnOverlay = false;
    modal.addEventListener('mousedown', (ev) => {
      pressStartedOnOverlay = (ev.target === modal);
    });
    modal.addEventListener('mouseup', (ev) => {
      if (pressStartedOnOverlay && ev.target === modal) closeHeroPreviewModal();
      pressStartedOnOverlay = false;
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modal.classList.contains('open')) closeHeroPreviewModal();
    });

    heroPreviewListenersBound = true;
  }

  function renderHeroEditImagePreview(url) {
    const prev = $('heroEditImagePreview');
    if (!prev) return;
    prev.innerHTML = url
      ? `<img src="${escapeAttr(url)}" alt="">`
      : `<div class="hero-edit-noimg">Sin imagen</div>`;
  }

  /** Vista previa de la imagen del slide en edición. */
  function previewHeroEditImage() {
    const url = ($('heroEditImage')?.value || '').trim();
    renderHeroEditImagePreview(url);
  }

  /** Sube una imagen del equipo al storage y la pone como image_url. */
  function pickHeroEditFile() {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = 'image/*';
    f.onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      toast('⏳ Subiendo imagen...');
      const publicUrl = await uploadFileToStorage(file, 'hero-slide-' + Date.now() + '.jpg');
      if (!publicUrl) return;
      $('heroEditImage').value = publicUrl;
      renderHeroEditImagePreview(publicUrl);
      // Setear .value por JS no dispara el evento 'input' → forzar dirty check manualmente.
      checkHeroEditDirty();
      toast('✅ Imagen subida');
    };
    f.click();
  }

  /** Guarda los cambios del modal de edición. */
  async function saveHeroSlideEdit() {
    const id = ($('heroEditId')?.value || '').trim();
    if (!id) { toast('Error: id de slide vacío', true); return; }

    const slide = (state.hero?.slides || []).find(s => s.id === id);
    if (!slide) { toast('Slide no encontrado', true); return; }

    // Validaciones mínimas
    const title = ($('heroEditTitle')?.value || '').trim();
    if (!title) { toast('El título no puede estar vacío', true); return; }

    // Construir botones (omitir los que tienen texto vacío)
    const buttons = [];
    const b1Text = ($('heroEditBtn1Text')?.value || '').trim();
    if (b1Text) buttons.push({
      text:  b1Text,
      url:   ($('heroEditBtn1Url')?.value || '').trim() || '#',
      style: $('heroEditBtn1Style')?.value === 'secondary' ? 'secondary' : 'primary',
    });
    const b2Text = ($('heroEditBtn2Text')?.value || '').trim();
    if (b2Text) buttons.push({
      text:  b2Text,
      url:   ($('heroEditBtn2Url')?.value || '').trim() || '#',
      style: $('heroEditBtn2Style')?.value === 'secondary' ? 'secondary' : 'primary',
    });

    // Aplicar cambios al slide existente (preserva id, enabled, orden)
    slide.label      = ($('heroEditLabel')?.value || '').trim();
    slide.title_html = title;
    slide.subtitle   = ($('heroEditSubtitle')?.value || '').trim();
    slide.image_url  = ($('heroEditImage')?.value || '').trim();
    slide.buttons    = buttons;

    const okSave = await persistHeroSlidesConfig();
    if (okSave) {
      // Sesión 49 — Sincronizamos el snapshot ANTES de cerrar para que
      // closeHeroEditModal no detecte un falso "dirty" y pida confirmación
      // de descartar cambios que ya fueron guardados.
      heroEditSnapshot = snapshotHeroEditForm();
      setHeroEditDirty(false);
      closeHeroEditModal();
      renderHeroSlidesPanel();
    }
  }

  /** Pausa/activa un slide. */
  async function toggleHeroSlide(id) {
    const slide = (state.hero?.slides || []).find(s => s.id === id);
    if (!slide) return;
    slide.enabled = !(slide.enabled !== false);
    const ok = await persistHeroSlidesConfig();
    if (ok) {
      toast(slide.enabled ? '▶️ Slide activado' : '⏸️ Slide pausado');
      renderHeroSlidesPanel();
    }
  }

  /** Mueve un slide en el orden (delta = -1 sube, +1 baja). */
  async function moveHeroSlide(id, delta) {
    const slides = state.hero?.slides || [];
    const sorted = [...slides].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
    const idx = sorted.findIndex(s => s.id === id);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= sorted.length) return;

    // Swap orden con el vecino
    const a = sorted[idx];
    const b = sorted[newIdx];
    const tmp = a.orden;
    a.orden = b.orden;
    b.orden = tmp;

    // Re-numerar 1..N para evitar huecos
    sorted.sort((x, y) => (x.orden ?? 999) - (y.orden ?? 999));
    sorted.forEach((s, i) => { s.orden = i + 1; });

    state.hero.slides = sorted;
    const ok = await persistHeroSlidesConfig();
    if (ok) renderHeroSlidesPanel();
  }

  /** Elimina un slide con confirmación. */
  async function deleteHeroSlide(id) {
    const slide = (state.hero?.slides || []).find(s => s.id === id);
    if (!slide) return;
    const preview = stripHtml(slide.title_html || '(sin título)').slice(0, 40);
    if (!confirm(`¿Eliminar el slide "${preview}"?\n\nEsta acción no se puede deshacer.`)) return;

    state.hero.slides = (state.hero.slides || []).filter(s => s.id !== id);
    // Re-numerar
    state.hero.slides
      .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
      .forEach((s, i) => { s.orden = i + 1; });

    const ok = await persistHeroSlidesConfig();
    if (ok) {
      toast('🗑️ Slide eliminado');
      renderHeroSlidesPanel();
    }
  }

  /** Duplica un slide existente (Sesión 52).
   *
   *  El nuevo slide:
   *   - Recibe un id nuevo (NO comparte con el original).
   *   - Queda PAUSADO por defecto — evita que aparezca accidentalmente
   *     en producción mientras lo terminás de ajustar.
   *   - Se inserta al final del orden visual.
   *   - Conserva título, subtítulo, imagen, label y todos los botones.
   *
   *  Después de duplicar, se abre el modal de edición directamente
   *  para que puedas hacer los cambios y activarlo cuando esté listo. */
  async function duplicateHeroSlide(id) {
    const original = (state.hero?.slides || []).find(s => s.id === id);
    if (!original) { toast('Slide no encontrado', true); return; }

    const slides   = state.hero.slides;
    const maxOrden = slides.reduce((m, s) => Math.max(m, s.orden || 0), 0);

    // Deep-copy del original con cambios: id nuevo, pausado, orden al final.
    const copy = {
      ...original,
      id:      genSlideId(),
      enabled: false,                      // pausado por seguridad
      orden:   maxOrden + 1,
      // Los botones son objetos — deep copy con map para no compartir refs.
      buttons: Array.isArray(original.buttons)
        ? original.buttons.map(b => ({ ...b }))
        : [],
    };

    state.hero.slides = [...slides, copy];
    const ok = await persistHeroSlidesConfig(true);
    if (!ok) return;

    toast('📋 Slide duplicado — quedó pausado para que lo revises');
    renderHeroSlidesPanel();
    // Abrimos directo el editor sobre la copia para que el usuario lo ajuste.
    editHeroSlide(copy.id);
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSONALIZACIÓN LÁSER (Sesión 28)
  // ───────────────────────────────────────────────────────────────
  // Sub-panel "Personalización" en Admin > Herramientas. Lee y
  // escribe `site_settings.personalizacion_config` (JSON serializado
  // como string en el campo `value`).
  //
  // Estado en memoria: `state.lpConfig` se completa al entrar al panel.
  // Si la fila no existe en Supabase, arrancamos con defaults.
  // ═══════════════════════════════════════════════════════════════
  const LP_KEY = 'personalizacion_config';

  // Defaults: misma forma que en supabase-client.js. Los duplicamos acá
  // a propósito para que el admin sea autosuficiente y no dependa de
  // que supabase-client.js esté cargado en admin.html (que no lo está).
  const LP_DEFAULTS = Object.freeze({
    enabled: false,
    precio_por_elemento: 290,
    tiempo_extra_horas: 24,
    archivo: {
      tipos_permitidos:    ['image/png', 'image/jpeg', 'image/svg+xml'],
      peso_max_mb:         5,
      dim_min_px:          500,
      dim_recomendada_px:  800,
    },
    texto_max_caracteres: 40,
    productos: {},
    textos: {
      aviso_no_devolucion:
        'Los productos personalizados no admiten devolución. Mantienen garantía de fabricación de 60 días.',
      aviso_tiempo_extra:
        'La personalización agrega 24 hs hábiles al tiempo de preparación.',
      disclaimer_copyright:
        'Al subir imágenes confirmás que tenés los derechos para usarlas. Founder se reserva el derecho de cancelar y reembolsar pedidos con contenido que infrinja derechos.',
    },
  });

  function lpCloneDefaults() { return JSON.parse(JSON.stringify(LP_DEFAULTS)); }

  /** Combina los defaults con lo que vino del backend. Tolera campos
   *  faltantes y preserva campos extra. Mismo patrón que en supabase-client.js. */
  function lpMerge(incoming) {
    const out = lpCloneDefaults();
    if (!incoming || typeof incoming !== 'object') return out;
    Object.keys(incoming).forEach(k => {
      if (k === 'archivo' || k === 'textos' || k === 'productos') {
        out[k] = { ...out[k], ...(incoming[k] || {}) };
      } else {
        out[k] = incoming[k];
      }
    });
    return out;
  }

  /** Carga la config desde Supabase + refresca todo el panel.
   *  Llamada al entrar a la página y desde el botón "Actualizar". */
  async function loadPersonalizacion() {
    const { ok, data } = await apiAdmin('get_setting', { key: LP_KEY });
    if (!ok) {
      toast('Error cargando configuración de personalización', true);
      // Caemos a defaults para que el panel sea usable igual
      state.lpConfig = lpCloneDefaults();
    } else {
      // data.value es string. Parsearlo defensivamente.
      let parsed = null;
      const raw = data?.value || '';
      if (raw) {
        try { parsed = JSON.parse(raw); }
        catch (e) { console.warn('[lp] JSON corrupto, usando defaults:', e); }
      }
      state.lpConfig = lpMerge(parsed);
    }

    renderPersonalizacion();
    // Cargar también la galería (no bloqueante — si falla el panel principal igual funciona)
    loadLpExamples();
  }

  /** Refresca TODOS los inputs del panel desde state.lpConfig.
   *  Idempotente — se puede llamar las veces que haga falta. */
  function renderPersonalizacion() {
    const c = state.lpConfig;
    if (!c) return;

    // Master switch
    const master = $('lpMaster');
    if (master) master.classList.toggle('is-on', !!c.enabled);
    const masterSub = $('lpMasterSub');
    if (masterSub) {
      masterSub.textContent = c.enabled
        ? '✅ El feature está activo — los clientes lo ven en producto.html.'
        : 'El feature está apagado — los clientes no lo ven.';
    }

    // Configuración general
    setVal('lpPrecio',   c.precio_por_elemento);
    setVal('lpHoras',    c.tiempo_extra_horas);
    setVal('lpMaxChars', c.texto_max_caracteres);
    setVal('lpMaxMb',    c.archivo?.peso_max_mb);
    setVal('lpDimMin',   c.archivo?.dim_min_px);
    setVal('lpDimRec',   c.archivo?.dim_recomendada_px);

    // Textos
    setVal('lpTxtNoDev',     c.textos?.aviso_no_devolucion);
    setVal('lpTxtTiempo',    c.textos?.aviso_tiempo_extra);
    setVal('lpTxtCopyright', c.textos?.disclaimer_copyright);

    // Lista de productos con sus 4 toggles
    renderLpProducts();
  }

  function setVal(id, v) {
    const el = $(id);
    if (el && v !== undefined && v !== null) el.value = v;
  }

  /** Renderiza una fila por cada producto activo del catálogo, con
   *  4 checkboxes. Sesión 28 Bloque B: lee de las columnas reales del
   *  producto (`permite_grabado_*`). El JSON `productos` queda como
   *  legacy y no se usa más para esta lectura.
   *
   *  El estado local de los toggles vive en `state.products[i].permite_grabado_*`
   *  (mutado por toggleLpProduct). Al click "Guardar configuración",
   *  recorremos los productos modificados y persistimos cada uno via
   *  save_product. */
  function renderLpProducts() {
    const cont = $('lpProductsList');
    if (!cont) return;

    const productos = state.products || [];
    if (productos.length === 0) {
      cont.innerHTML = '<div class="laser-empty">No hay productos cargados todavía.</div>';
      return;
    }

    cont.innerHTML = productos.map(p => {
      const tipos = [
        { k: 'adelante', label: '🖼️ Adelante', col: 'permite_grabado_adelante' },
        { k: 'interior', label: '📐 Interior', col: 'permite_grabado_interior' },
        { k: 'atras',    label: '🔖 Atrás',    col: 'permite_grabado_atras'    },
        { k: 'texto',    label: '✍️ Texto',    col: 'permite_grabado_texto'    },
      ];
      const checks = tipos.map(t => {
        const on = p[t.col] === true;
        return `
          <button type="button"
                  class="laser-check ${on ? 'is-on' : ''}"
                  onclick="toggleLpProduct('${esc(p.id)}','${t.k}')">
            <span class="laser-check__box">${on ? '✓' : ''}</span>
            <span>${t.label}</span>
          </button>`;
      }).join('');
      return `
        <div class="laser-prod-row">
          <div class="laser-prod-row__name">Founder ${esc(p.nombre)}</div>
          <div class="laser-prod-row__checks">${checks}</div>
        </div>`;
    }).join('');
  }

  /** Toggle de un permiso por producto. Sesión 28 Bloque B: muta el
   *  state.products[i].permite_grabado_* y marca el producto como
   *  dirty para que savePersonalizacion sepa qué persistir. */
  function toggleLpProduct(productId, tipoKey) {
    const idx = state.products.findIndex(p => p.id === productId);
    if (idx === -1) return;
    const colMap = {
      adelante: 'permite_grabado_adelante',
      interior: 'permite_grabado_interior',
      atras:    'permite_grabado_atras',
      texto:    'permite_grabado_texto',
    };
    const col = colMap[tipoKey];
    if (!col) return;
    state.products[idx][col] = !state.products[idx][col];
    state.products[idx]._lpDirty = true;
    renderLpProducts();
  }

  /** Toggle del master switch. Solo muta state, no guarda hasta el botón. */
  function toggleLpMaster() {
    if (!state.lpConfig) return;
    state.lpConfig.enabled = !state.lpConfig.enabled;
    renderPersonalizacion();
  }

  /** Recoge todos los inputs, valida números mínimos, y persiste el
   *  JSON en site_settings.personalizacion_config. Sesión 28 Bloque B:
   *  además, persiste los toggles permite_grabado_* de los productos
   *  marcados como dirty (productos cuyos checkboxes el admin tocó). */
  async function savePersonalizacion() {
    if (!state.lpConfig) state.lpConfig = lpCloneDefaults();
    const c = state.lpConfig;

    // Valores numéricos: parsear con fallback a defaults si vienen vacíos
    c.precio_por_elemento  = parseInt($('lpPrecio')?.value, 10)   || LP_DEFAULTS.precio_por_elemento;
    c.tiempo_extra_horas   = parseInt($('lpHoras')?.value, 10)    || LP_DEFAULTS.tiempo_extra_horas;
    c.texto_max_caracteres = parseInt($('lpMaxChars')?.value, 10) || LP_DEFAULTS.texto_max_caracteres;

    if (!c.archivo) c.archivo = lpCloneDefaults().archivo;
    c.archivo.peso_max_mb        = parseInt($('lpMaxMb')?.value, 10)  || LP_DEFAULTS.archivo.peso_max_mb;
    c.archivo.dim_min_px         = parseInt($('lpDimMin')?.value, 10) || LP_DEFAULTS.archivo.dim_min_px;
    c.archivo.dim_recomendada_px = parseInt($('lpDimRec')?.value, 10) || LP_DEFAULTS.archivo.dim_recomendada_px;

    // Textos: trim, fallback a defaults si quedaron vacíos
    if (!c.textos) c.textos = lpCloneDefaults().textos;
    c.textos.aviso_no_devolucion  = ($('lpTxtNoDev')?.value     || '').trim() || LP_DEFAULTS.textos.aviso_no_devolucion;
    c.textos.aviso_tiempo_extra   = ($('lpTxtTiempo')?.value    || '').trim() || LP_DEFAULTS.textos.aviso_tiempo_extra;
    c.textos.disclaimer_copyright = ($('lpTxtCopyright')?.value || '').trim() || LP_DEFAULTS.textos.disclaimer_copyright;

    // Validaciones suaves: si dim_recomendada_px < dim_min_px → corregir
    if (c.archivo.dim_recomendada_px < c.archivo.dim_min_px) {
      c.archivo.dim_recomendada_px = c.archivo.dim_min_px;
    }
    if (c.precio_por_elemento < 0)  c.precio_por_elemento = 0;
    if (c.tiempo_extra_horas < 0)   c.tiempo_extra_horas = 0;
    if (c.texto_max_caracteres < 1) c.texto_max_caracteres = 1;

    // Sesión 28 Bloque B: el campo `productos` del JSON queda como legacy.
    // Lo limpiamos al guardar para que no quede info contradictoria con
    // las columnas reales. Este es un cleanup one-shot — después de la
    // primera vez que el admin guarda con esta versión, queda en {}.
    c.productos = {};

    const btn = $('lpSaveBtn');
    if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

    // ── Persistir config global ─────────────────────────────────
    const value = JSON.stringify(c);
    const { ok, data } = await apiAdmin('set_setting', { key: LP_KEY, value });

    if (!ok) {
      if (btn) { btn.textContent = '💾 Guardar configuración'; btn.disabled = false; }
      toast('Error guardando configuración' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    // ── Persistir productos dirty (toggles cambiados) ───────────
    const dirty = (state.products || []).filter(p => p._lpDirty);
    let savedCount = 0;
    let failedCount = 0;

    for (const p of dirty) {
      const productPayload = {
        slug:             p.slug,
        nombre:           p.nombre,
        precio:           p.precio,
        descripcion:      p.descripcion,
        especificaciones: p.especificaciones,
        capacidad:        p.capacidad,
        dimensiones:      p.dimensiones,
        material:         p.material,
        nota:             p.nota,
        lleva_billetes:   p.lleva_billetes,
        lleva_monedas:    p.lleva_monedas,
        permite_grabado_adelante: p.permite_grabado_adelante === true,
        permite_grabado_interior: p.permite_grabado_interior === true,
        permite_grabado_atras:    p.permite_grabado_atras    === true,
        permite_grabado_texto:    p.permite_grabado_texto    === true,
        orden:  p.orden,
        activo: p.activo,
      };
      // Reusamos save_product. El backend hace upsert por slug.
      // IMPORTANTE: save_product borra y re-inserta colores. Para no
      // perder las fotos, reconstruimos el array de colors completo.
      const colorsPayload = (p.colors || []).map(c => ({
        nombre:        c.nombre,
        estado:        c.estado || 'activo',
        precio_oferta: c.estado === 'oferta' ? c.precio_oferta : null,
        stock_bajo:    c.stock_bajo === true,
        fotos:         (c.photos || []).filter(u => u && u.trim()),
      }));

      const r = await apiAdmin('save_product', {
        product: productPayload,
        colors:  colorsPayload,
      });
      if (r.ok) { savedCount++; delete p._lpDirty; }
      else { failedCount++; }
    }

    if (btn) { btn.textContent = '💾 Guardar configuración'; btn.disabled = false; }

    if (failedCount > 0) {
      toast(`Configuración guardada, pero ${failedCount} producto(s) fallaron al actualizar.`, true);
    } else if (savedCount > 0) {
      toast(`✅ Configuración guardada. ${savedCount} producto(s) actualizados.`);
    } else {
      toast('✅ Configuración guardada');
    }

    renderPersonalizacion();    // refresca para reflejar los valores normalizados
  }

  // ═══════════════════════════════════════════════════════════════
  // GALERÍA DE EJEMPLOS — Personalización láser (Sesión 28 Bloque B)
  // ───────────────────────────────────────────────────────────────
  // CRUD de la tabla `personalizacion_examples` desde el admin.
  // Cada ejemplo es:
  //   { id, tipo, url, descripcion, colores[], orden, activo }
  //
  // Storage: bucket público `personalizacion-examples`. Mismo patrón
  // que `product-photos` (signed upload + URL pública).
  //
  // Estado: state.lpExamples se llena con loadLpExamples(). Mientras
  // se edita un ejemplo en modal, su data temporal vive en variables
  // de scope local de las funciones (no contamina state).
  // ═══════════════════════════════════════════════════════════════

  /** Carga la lista de ejemplos desde el backend y la pinta. */
  async function loadLpExamples() {
    const cont = $('lpExamplesList');
    if (!cont) return;

    const { ok, data } = await apiAdmin('list_personalizacion_examples');
    if (!ok) {
      cont.innerHTML = '<div class="laser-empty">Error cargando galería</div>';
      return;
    }

    state.lpExamples = data?.examples || [];
    renderLpExamples();
  }

  /** Pinta los thumbnails de la galería en grid. */
  function renderLpExamples() {
    const cont = $('lpExamplesList');
    if (!cont) return;

    const list = state.lpExamples || [];
    if (list.length === 0) {
      cont.innerHTML = '<div class="laser-empty">No hay ejemplos cargados todavía. Usá el botón "+ Subir ejemplo" arriba.</div>';
      return;
    }

    const tipoLabels = {
      adelante: '🖼️ Adelante',
      interior: '📐 Interior',
      atras:    '🔖 Atrás',
      texto:    '✍️ Texto',
    };

    cont.innerHTML =
      '<div class="lp-ex-grid">' +
      list.map(ex => {
        const inactiveTag = ex.activo ? '' : '<div class="lp-ex-card__inactive">Oculto</div>';
        const modelos = (Array.isArray(ex.modelos) && ex.modelos.length > 0)
          ? ex.modelos.join(', ')
          : 'Todos los modelos';
        const colores = (Array.isArray(ex.colores) && ex.colores.length > 0)
          ? ex.colores.join(', ')
          : 'Todos los colores';
        return `
          <div class="lp-ex-card" onclick="openLpExampleEdit('${esc(ex.id)}')">
            ${inactiveTag}
            <img src="${esc(ex.url)}" class="lp-ex-card__img" alt="" loading="lazy">
            <div class="lp-ex-card__info">
              <div class="lp-ex-card__tipo">${tipoLabels[ex.tipo] || ex.tipo}</div>
              <div>${esc(modelos)}</div>
              <div style="margin-top:2px">${esc(colores)}</div>
            </div>
          </div>`;
      }).join('') +
      '</div>';
  }

  /** Abre el modal con datos vacíos para subir un ejemplo nuevo. */
  function openLpExampleNew() {
    setText('lpExampleModalTitle', 'Subir ejemplo');
    $('lpExId').value          = '';
    $('lpExUrl').value         = '';
    $('lpExTipo').value        = 'adelante';
    $('lpExDescripcion').value = '';
    $('lpExOrden').value       = '0';
    $('lpExActivo').value      = 'true';
    setHTML('lpExImagePreview', '');
    renderLpExampleColoresChecks([]);
    renderLpExampleModelosChecks([]);

    // Botón "Eliminar" oculto en modo "nuevo"
    const delBtn = $('lpExDeleteBtn');
    if (delBtn) delBtn.style.display = 'none';

    const modal = $('lpExampleModal');
    if (modal) modal.classList.add('open');
  }

  /** Abre el modal con los datos de un ejemplo existente para editarlo. */
  function openLpExampleEdit(id) {
    const ex = (state.lpExamples || []).find(e => e.id === id);
    if (!ex) { toast('Ejemplo no encontrado', true); return; }

    setText('lpExampleModalTitle', 'Editar ejemplo');
    $('lpExId').value          = ex.id;
    $('lpExUrl').value         = ex.url;
    $('lpExTipo').value        = ex.tipo || 'adelante';
    $('lpExDescripcion').value = ex.descripcion || '';
    $('lpExOrden').value       = ex.orden ?? 0;
    $('lpExActivo').value      = ex.activo ? 'true' : 'false';
    setHTML('lpExImagePreview', `<img src="${esc(ex.url)}" alt="">`);
    renderLpExampleColoresChecks(Array.isArray(ex.colores) ? ex.colores : []);
    renderLpExampleModelosChecks(Array.isArray(ex.modelos) ? ex.modelos : []);

    // Botón "Eliminar" visible solo cuando hay id
    const delBtn = $('lpExDeleteBtn');
    if (delBtn) delBtn.style.display = '';

    const modal = $('lpExampleModal');
    if (modal) modal.classList.add('open');
  }

  function closeLpExampleModal() {
    const modal = $('lpExampleModal');
    if (modal) modal.classList.remove('open');
  }

  /** Renderiza los checkboxes de colores del catálogo. Marca los que vienen
   *  pre-seleccionados (`selectedColors`). Los nombres de colores se sacan
   *  de los productos cargados en state.products (sin duplicar). */
  function renderLpExampleColoresChecks(selectedColors) {
    const cont = $('lpExColoresChecks');
    if (!cont) return;

    // Recolectar todos los colores únicos del catálogo
    const set = new Set();
    (state.products || []).forEach(p => {
      (p.colors || []).forEach(c => {
        if (c.nombre && c.nombre.trim()) set.add(c.nombre.trim());
      });
    });
    const allColors = Array.from(set).sort();

    if (allColors.length === 0) {
      cont.innerHTML = '<div class="fhint">No hay colores cargados todavía.</div>';
      return;
    }

    const sel = new Set((selectedColors || []).map(c => c.trim()));
    cont.innerHTML = allColors.map(c => `
      <label>
        <input type="checkbox" value="${esc(c)}" ${sel.has(c) ? 'checked' : ''}>
        <span>${esc(c)}</span>
      </label>
    `).join('');
  }

  /** Renderiza checkboxes para los modelos del catálogo (Sesión 28b fix). */
  function renderLpExampleModelosChecks(selectedModelos) {
    const cont = $('lpExModelosChecks');
    if (!cont) return;

    const productos = state.products || [];
    if (productos.length === 0) {
      cont.innerHTML = '<div class="fhint">No hay modelos cargados todavía.</div>';
      return;
    }

    const sel = new Set((selectedModelos || []).map(m => m.trim()));
    cont.innerHTML = productos.map(p => `
      <label>
        <input type="checkbox" value="${esc(p.nombre)}" ${sel.has(p.nombre) ? 'checked' : ''}>
        <span>${esc(p.nombre)}</span>
      </label>
    `).join('');
  }

  /** Lee qué colores están tildados en el modal. */
  function getLpExampleSelectedColores() {
    const cont = $('lpExColoresChecks');
    if (!cont) return [];
    return Array.from(cont.querySelectorAll('input[type="checkbox"]:checked'))
      .map(i => i.value);
  }

  /** Lee qué modelos están tildados en el modal. */
  function getLpExampleSelectedModelos() {
    const cont = $('lpExModelosChecks');
    if (!cont) return [];
    return Array.from(cont.querySelectorAll('input[type="checkbox"]:checked'))
      .map(i => i.value);
  }

  /** Subir foto desde el equipo del usuario al bucket público. */
  function pickLpExampleFile() {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = 'image/*';
    f.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Preview local instantáneo
      const reader = new FileReader();
      reader.onload = ev => setHTML('lpExImagePreview', `<img src="${ev.target.result}" alt="">`);
      reader.readAsDataURL(file);

      toast('⏳ Subiendo imagen...');

      // 1) Signed URL del bucket público de ejemplos
      const filename = `ejemplo-${Date.now()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
      const { ok, data } = await apiAdmin('get_personalizacion_example_upload_url', { filename });
      if (!ok || !data?.uploadUrl) {
        toast('Error pidiendo URL de subida', true);
        return;
      }

      // 2) PUT directo a Supabase Storage
      try {
        const putRes = await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/jpeg' },
          body: file,
        });
        if (!putRes.ok) throw new Error('PUT failed');
      } catch (e) {
        console.error('[lp-ex] error subiendo:', e);
        toast('Error al subir la imagen', true);
        return;
      }

      // 3) Llenar el campo URL con la pública
      $('lpExUrl').value = data.publicUrl;
      setHTML('lpExImagePreview', `<img src="${esc(data.publicUrl)}" alt="">`);
      toast('✅ Imagen subida');
    };
    f.click();
  }

  /** Persiste el ejemplo (insert si no tiene id, update si lo tiene). */
  async function saveLpExample() {
    const id          = ($('lpExId')?.value || '').trim();
    const url         = ($('lpExUrl')?.value || '').trim();
    const tipo        = $('lpExTipo')?.value || 'adelante';
    const descripcion = ($('lpExDescripcion')?.value || '').trim();
    const orden       = parseInt($('lpExOrden')?.value, 10) || 0;
    const activo      = $('lpExActivo')?.value === 'true';
    const colores     = getLpExampleSelectedColores();
    const modelos     = getLpExampleSelectedModelos();

    if (!url) { toast('Subí o pegá una URL de imagen', true); return; }
    if (!['adelante', 'interior', 'atras', 'texto'].includes(tipo)) {
      toast('Tipo de grabado inválido', true);
      return;
    }

    const example = {
      tipo, url, descripcion, colores, modelos, orden, activo,
    };
    if (id) example.id = id;

    const btn = $('lpExSaveBtn');
    if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

    const { ok, data } = await apiAdmin('save_personalizacion_example', { example });

    if (btn) { btn.textContent = '💾 Guardar'; btn.disabled = false; }

    if (!ok) {
      toast('Error guardando' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    toast('✅ Ejemplo guardado');
    closeLpExampleModal();
    await loadLpExamples();
  }

  /** Elimina el ejemplo actual del modal. */
  async function deleteLpExample() {
    const id = ($('lpExId')?.value || '').trim();
    if (!id) return;
    if (!confirm('¿Eliminar este ejemplo? La foto se quita de la galería del sitio. (La imagen del bucket queda — la limpiará el cron.)')) return;

    const { ok, data } = await apiAdmin('delete_personalizacion_example', { id });
    if (!ok) {
      toast('Error eliminando' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    toast('✅ Ejemplo eliminado');
    closeLpExampleModal();
    await loadLpExamples();
  }

  // ═══════════════════════════════════════════════════════════════
  // CARRITO — Sesión 53 (panel "🛒 Carrito")
  // ───────────────────────────────────────────────────────────────
  // Gestiona site_settings.cart_config (JSON serializado, mismo
  // patrón que hero_slides y personalizacion_config).
  //
  // En Bloque 1 sólo se implementa el sub-feature "Contador de urgencia"
  // — el resto del panel queda con placeholders "Próximamente" hasta
  // que los bloques 2 y 3 los completen.
  //
  // Estado en memoria: `state.cartConfig` se llena al entrar al panel.
  // Si la fila no existe en Supabase, arrancamos con defaults seguros
  // (todo apagado).
  // ═══════════════════════════════════════════════════════════════

  const CART_KEY = 'cart_config';

  // Defaults: misma forma que en supabase-client.js. Duplicados a
  // propósito para que el admin sea autosuficiente y no dependa de
  // que supabase-client.js esté cargado en admin.html (que no lo está).
  const CART_DEFAULTS = Object.freeze({
    contador: {
      enabled:      false,
      duracion_min: 7,
      texto:        'Carrito reservado por {tiempo}',
    },
    cross_sell: {
      enabled:       false,
      titulo:        '✦ Comprá juntos y ahorrá',
      product_ids:   [],
      descuento_pct: 25,
    },
    lleva_otra: {
      enabled:              false,
      texto:                'Llevá otra para regalar',
      descuento_pct:        25,
      permite_cambio_color: true,
    },
  });

  function cartCloneDefaults() { return JSON.parse(JSON.stringify(CART_DEFAULTS)); }

  /** Merge tolerante: parte de defaults y sobreescribe con lo que vino
   *  del backend. Si el JSON guardado es viejo y le faltan campos, se
   *  completan; si trae campos extra, se preservan. */
  function cartMerge(incoming) {
    const out = cartCloneDefaults();
    if (!incoming || typeof incoming !== 'object') return out;
    ['contador', 'cross_sell', 'lleva_otra'].forEach(k => {
      if (incoming[k] && typeof incoming[k] === 'object') {
        out[k] = { ...out[k], ...incoming[k] };
      }
    });
    return out;
  }

  /** Carga la config desde Supabase + refresca el panel.
   *  Llamada al entrar al panel y desde el botón "↻ Actualizar". */
  async function loadCartConfig() {
    // Inicializar dirty tracker al primer load (idempotente)
    initCartDirtyTracker();

    // Asegurar que el catálogo esté disponible para poblar los dropdowns
    // del cross-sell. Si todavía no se cargó (el usuario no entró a
    // "Productos" antes), lo disparamos ahora.
    if (!state.products || state.products.length === 0) {
      try { await loadProducts(); } catch (_) { /* no bloqueante */ }
    }

    const { ok, data } = await apiAdmin('get_setting', { key: CART_KEY });
    if (!ok) {
      toast('Error cargando configuración del carrito', true);
      state.cartConfig = cartCloneDefaults();
    } else {
      const raw = data?.value || '';
      let parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); }
        catch (e) { console.warn('[cart] JSON corrupto, usando defaults:', e); }
      }
      state.cartConfig = cartMerge(parsed);
    }
    renderCartPanel();
  }

  /** Pinta el panel con el state actual. Idempotente. */
  function renderCartPanel() {
    const c = state.cartConfig;
    if (!c) return;

    // ── Sub-panel Contador ─────────────────────────────────────
    const masterContador = $('cartContadorMaster');
    if (masterContador) masterContador.classList.toggle('is-on', !!c.contador.enabled);
    const masterSubContador = $('cartContadorMasterSub');
    if (masterSubContador) {
      masterSubContador.textContent = c.contador.enabled
        ? '✅ El feature está activo — los clientes lo ven en el carrito.'
        : 'El feature está apagado — los clientes no lo ven.';
    }
    setVal('cartContadorDuracion', c.contador.duracion_min);
    setVal('cartContadorTexto',    c.contador.texto);

    // ── Sub-panel Cross-sell ──────────────────────────────────
    const masterCS = $('cartCrossSellMaster');
    if (masterCS) masterCS.classList.toggle('is-on', !!c.cross_sell.enabled);
    const masterSubCS = $('cartCrossSellMasterSub');
    if (masterSubCS) {
      masterSubCS.textContent = c.cross_sell.enabled
        ? '✅ El feature está activo — los clientes lo ven en el carrito.'
        : 'El feature está apagado — los clientes no lo ven.';
    }
    setVal('cartCrossSellTitulo',    c.cross_sell.titulo);
    setVal('cartCrossSellDescuento', c.cross_sell.descuento_pct);

    // Poblar dropdowns con productos del catálogo
    renderCrossSellDropdowns();

    // ── Sub-panel Llevá otra ──────────────────────────────────
    const masterLO = $('cartLlevaOtraMaster');
    if (masterLO) masterLO.classList.toggle('is-on', !!c.lleva_otra.enabled);
    const masterSubLO = $('cartLlevaOtraMasterSub');
    if (masterSubLO) {
      masterSubLO.textContent = c.lleva_otra.enabled
        ? '✅ El feature está activo — los clientes lo ven en el carrito.'
        : 'El feature está apagado — los clientes no lo ven.';
    }
    setVal('cartLlevaOtraTexto',          c.lleva_otra.texto);
    setVal('cartLlevaOtraDescuento',      c.lleva_otra.descuento_pct);
    setVal('cartLlevaOtraCambioColor',    String(c.lleva_otra.permite_cambio_color));

    // ── Dirty tracker ─────────────────────────────────────────
    if (cartDirtyTracker) {
      cartDirtyTracker.captureSnapshot();
      cartDirtyTracker.bindAutoCheck();
    }
  }

  /** Pinta las 3 selects con la lista de productos del catálogo y
   *  preselecciona los IDs guardados en state.cartConfig.cross_sell.
   *
   *  Nota: state.products del admin tiene los campos en español
   *  (nombre, precio) — distinto del cliente público que usa name/price.
   *  Por eso acá leemos `p.nombre` y `p.precio` directamente.
   *  Solo mostramos productos activos (descartamos los pausados). */
  function renderCrossSellDropdowns() {
    const products = (state.products || []).filter(p => p.activo !== false);
    const ids = state.cartConfig?.cross_sell?.product_ids || [];

    const optionsHTML = products
      .map(p => {
        const precio = Number(p.precio) || 0;
        const precioFmt = precio.toLocaleString('es-UY');
        return `<option value="${p.id}">Founder ${p.nombre} — $${precioFmt}</option>`;
      })
      .join('');

    [1, 2, 3].forEach(slot => {
      const sel = $('cartCrossSellProd' + slot);
      if (!sel) return;
      sel.innerHTML = `<option value="">— Elegir producto —</option>${optionsHTML}`;
      const id = ids[slot - 1];
      if (id != null) sel.value = String(id);
    });
  }

  /** Toggle del master switch del contador. */
  function toggleCartContadorMaster() {
    if (!state.cartConfig) return;
    state.cartConfig.contador.enabled = !state.cartConfig.contador.enabled;
    renderCartPanel();
    markCartPanelDirty();
  }

  /** Toggle del master switch del cross-sell.
   *  Regla mutuamente excluyente: si lleva_otra estaba prendido, se apaga. */
  function toggleCartCrossSellMaster() {
    if (!state.cartConfig) return;
    const willEnable = !state.cartConfig.cross_sell.enabled;
    state.cartConfig.cross_sell.enabled = willEnable;
    if (willEnable && state.cartConfig.lleva_otra.enabled) {
      state.cartConfig.lleva_otra.enabled = false;
      toast('"Llevá otra" se apagó automáticamente — son mutuamente excluyentes', false);
    }
    renderCartPanel();
    markCartPanelDirty();
  }

  /** Toggle del master switch de "Llevá otra".
   *  Regla mutuamente excluyente: si cross_sell estaba prendido, se apaga. */
  function toggleCartLlevaOtraMaster() {
    if (!state.cartConfig) return;
    const willEnable = !state.cartConfig.lleva_otra.enabled;
    state.cartConfig.lleva_otra.enabled = willEnable;
    if (willEnable && state.cartConfig.cross_sell.enabled) {
      state.cartConfig.cross_sell.enabled = false;
      toast('"Cross-sell" se apagó automáticamente — son mutuamente excluyentes', false);
    }
    renderCartPanel();
    markCartPanelDirty();
  }

  /** Forzar que el dirty tracker marque cambios pendientes (los toggles
   *  no disparan input/change events). */
  function markCartPanelDirty() {
    const containerEl = $('page-carrito');
    if (containerEl) containerEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Lee TODOS los inputs del panel y persiste el JSON en Supabase. */
  async function saveCartConfig() {
    if (!state.cartConfig) return;
    const c = state.cartConfig;

    // ── Validar y aplicar: Contador ────────────────────────────
    const dur = parseInt($('cartContadorDuracion')?.value || '', 10);
    if (!Number.isFinite(dur) || dur < 1 || dur > 120) {
      toast('La duración del contador debe estar entre 1 y 120 minutos', true);
      return;
    }
    const texto = String($('cartContadorTexto')?.value || '').trim();
    if (!texto) {
      toast('El texto del contador no puede estar vacío', true);
      return;
    }
    if (!texto.includes('{tiempo}')) {
      toast('El texto del contador debe contener {tiempo}', true);
      return;
    }
    c.contador.duracion_min = dur;
    c.contador.texto        = texto;

    // ── Validar y aplicar: Cross-sell ─────────────────────────
    const csTitulo = String($('cartCrossSellTitulo')?.value || '').trim();
    if (!csTitulo) {
      toast('El título del cross-sell no puede estar vacío', true);
      return;
    }
    const csDesc = parseInt($('cartCrossSellDescuento')?.value || '', 10);
    if (!Number.isFinite(csDesc) || csDesc < 0 || csDesc > 99) {
      toast('El descuento del cross-sell debe estar entre 0 y 99%', true);
      return;
    }
    const csIds = [
      String($('cartCrossSellProd1')?.value || '').trim(),
      String($('cartCrossSellProd2')?.value || '').trim(),
      String($('cartCrossSellProd3')?.value || '').trim(),
    ];
    // Si el feature está enabled, los 3 IDs son obligatorios y únicos
    if (c.cross_sell.enabled) {
      if (csIds.some(id => !id)) {
        toast('Si el cross-sell está activo, elegí los 3 productos', true);
        return;
      }
      const unicos = new Set(csIds);
      if (unicos.size !== 3) {
        toast('Los 3 productos del cross-sell deben ser distintos', true);
        return;
      }
    }
    c.cross_sell.titulo        = csTitulo;
    c.cross_sell.descuento_pct = csDesc;
    c.cross_sell.product_ids   = csIds.filter(Boolean);  // guarda solo los que tienen valor

    // ── Validar y aplicar: Llevá otra ─────────────────────────
    const loTexto = String($('cartLlevaOtraTexto')?.value || '').trim();
    if (!loTexto) {
      toast('El texto de "Llevá otra" no puede estar vacío', true);
      return;
    }
    const loDesc = parseInt($('cartLlevaOtraDescuento')?.value || '', 10);
    if (!Number.isFinite(loDesc) || loDesc < 0 || loDesc > 99) {
      toast('El descuento de "Llevá otra" debe estar entre 0 y 99%', true);
      return;
    }
    const loCambioColor = String($('cartLlevaOtraCambioColor')?.value || 'true') === 'true';
    c.lleva_otra.texto                = loTexto;
    c.lleva_otra.descuento_pct        = loDesc;
    c.lleva_otra.permite_cambio_color = loCambioColor;

    // Defensa final: si por alguna razón ambos features quedaron en true
    // (no debería pasar gracias a los toggles, pero por las dudas), priorizar
    // el último que se modificó. Como no tenemos historial de orden, dejamos
    // tal cual y el frontend público también desempata por prioridad.

    // ── Persistir (objeto completo) ─────────────────────────────
    const payload = JSON.stringify(c);
    const { ok, data } = await apiAdmin('set_setting', { key: CART_KEY, value: payload });
    if (!ok) {
      toast('Error guardando: ' + (data?.message || 'desconocido'), true);
      return;
    }
    toast('✅ Configuración guardada');
    if (cartDirtyTracker) cartDirtyTracker.captureSnapshot();
  }

  // Dirty tracker para el panel — se inicializa al primer load del panel.
  let cartDirtyTracker = null;
  function initCartDirtyTracker() {
    if (cartDirtyTracker) return;
    const containerEl = $('page-carrito');
    if (!containerEl) return;
    cartDirtyTracker = createDirtyTracker({
      fieldIds: [
        'cartContadorDuracion',
        'cartContadorTexto',
        'cartCrossSellTitulo',
        'cartCrossSellDescuento',
        'cartCrossSellProd1',
        'cartCrossSellProd2',
        'cartCrossSellProd3',
        'cartLlevaOtraTexto',
        'cartLlevaOtraDescuento',
        'cartLlevaOtraCambioColor',
      ],
      containerEl,
      // Usamos el título del primer card como marker. Cuando hay cambios
      // sin guardar en cualquier sub-panel, ese título recibe la clase
      // 'is-dirty' (puntito dorado, ver CSS de Sesión 52).
      dirtyMarker: '#cartContadorTitle',
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EXPONER FUNCIONES USADAS POR onclick INLINE DEL HTML
  // ───────────────────────────────────────────────────────────────
  // El HTML del admin usa atributos onclick="xxx()" por toda la
  // página. Para que sigan funcionando sin reescribir el HTML,
  // exportamos a window TODAS las funciones referenciadas.
  // ═══════════════════════════════════════════════════════════════
  window.login               = login;
  window.logout              = logout;
  window.nav                 = nav;
  // Sesión 35: mobile drawer
  window.toggleSidebar       = toggleSidebar;
  window.closeSidebar        = closeSidebar;

  // Pedidos
  window.loadOrders          = loadOrders;
  window.filterOrders        = filterOrders;
  window.viewOrder           = viewOrder;
  window.copyOrderSummary    = copyOrderSummary;
   // Sesión 29 (C): personalización en pedidos + panel limpieza
  window.viewPersonalizImage     = viewPersonalizImage;
  window.downloadPersonalizImage = downloadPersonalizImage;
  window.downloadOrderZip        = downloadOrderZip;
  window.loadCleanupStatus       = loadCleanupStatus;
  window.downloadBorrablesZip    = downloadBorrablesZip;
  window.runCleanupManual        = runCleanupManual;
  // Sesión 49 — UI de cleanup manual de fotos de reseñas (cron Tarea C)
  // Sesión 50 — re-ubicado al panel de Reseñas + historial filtrado por tipo
  window.loadReviewsOrphansStatus = loadReviewsOrphansStatus;
  window.runReviewsOrphansCleanup = runReviewsOrphansCleanup;
  window.loadReviewsCleanupLogs   = loadReviewsCleanupLogs;
  // Sesión 43 — UI de emails de recompra (cron Tarea D)
  window.loadRecompraStatus      = loadRecompraStatus;
  window.runRecompraManual       = runRecompraManual;
  window.closeOrderDetail    = closeOrderDetail;
  window.changeOrderStatus   = changeOrderStatus;
  window.archiveOrder        = archiveOrder;
  window.unarchiveOrder      = unarchiveOrder;
  window.deleteOrder         = deleteOrder;
  window.setOrderStep        = setOrderStep;
  window.setOrderCancelado   = setOrderCancelado;
  window.saveTracking        = saveTracking;
  window.openTrackingUrl     = openTrackingUrl;

  // Dashboard / acciones generales
  window.loadData            = bootstrap;   // botón "↻ Actualizar" del dashboard
  // Sesión 41: selector de período del dashboard (extendido en 41b: aplica a todo)
  window.setDashboardPeriod  = setDashboardPeriod;

  // Productos
  window.openNewProduct      = openNewProduct;
  window.editProduct         = editProduct;
  window.closeModal          = closeModal;
  window.addColorRow         = addColorRow;
  window.removeColorRow      = removeColorRow;
  window.onColorNameInput    = onColorNameInput;
  window.setColorEstado      = setColorEstado;
  window.onPrecioOfertaInput = onPrecioOfertaInput;
  window.toggleStockBajo     = toggleStockBajo;
  window.onPhotoUrlInput     = onPhotoUrlInput;
  window.pickPhotoFile       = pickPhotoFile;
  window.saveProduct         = saveProduct;
  window.confirmDelete       = confirmDelete;
  window.closeConfirm        = closeConfirm;
  window.executeDelete       = executeDelete;

  // Cupones
  window.loadCupones         = loadCoupons;   // alias histórico
  window.loadCoupones        = loadCoupons;
  window.saveCupon           = saveCupon;
  window.toggleCupon         = toggleCupon;
  window.deleteCupon         = deleteCupon;
  // Sesión 39: edición de cupones
  window.editCupon           = editCupon;
  window.cancelEditCupon     = cancelEditCupon;

  // Banner / Hero slides (Sesión 48)
  window.addHeroSlide          = addHeroSlide;
  window.editHeroSlide         = editHeroSlide;
  window.closeHeroEditModal    = closeHeroEditModal;
  window.openHeroPreviewModal  = openHeroPreviewModal;
  window.closeHeroPreviewModal = closeHeroPreviewModal;
  window.previewHeroEditImage  = previewHeroEditImage;
  window.pickHeroEditFile      = pickHeroEditFile;
  window.saveHeroSlideEdit     = saveHeroSlideEdit;
  window.toggleHeroSlide       = toggleHeroSlide;
  window.moveHeroSlide         = moveHeroSlide;
  window.deleteHeroSlide       = deleteHeroSlide;
  window.duplicateHeroSlide    = duplicateHeroSlide;

  // Carrito (Sesión 53)
  window.loadCartConfig            = loadCartConfig;
  window.saveCartConfig            = saveCartConfig;
  window.toggleCartContadorMaster  = toggleCartContadorMaster;
  window.toggleCartCrossSellMaster = toggleCartCrossSellMaster;
  window.toggleCartLlevaOtraMaster = toggleCartLlevaOtraMaster;

  // Personalización láser (Sesión 28)
  window.loadPersonalizacion = loadPersonalizacion;
  window.savePersonalizacion = savePersonalizacion;
  window.toggleLpMaster      = toggleLpMaster;
  window.toggleLpProduct     = toggleLpProduct;
  // Galería de ejemplos (Sesión 28 Bloque B)
  window.loadLpExamples      = loadLpExamples;
  window.openLpExampleNew    = openLpExampleNew;
  window.openLpExampleEdit   = openLpExampleEdit;
  window.closeLpExampleModal = closeLpExampleModal;
  window.pickLpExampleFile   = pickLpExampleFile;
  window.saveLpExample       = saveLpExample;
  window.deleteLpExample     = deleteLpExample;

  // Sesión 38: expuestos para que components/founder-admin-reviews.js
  // pueda invocarlos. Estos eran privados al IIFE; ahora son accesibles
  // desde otros components que necesiten autenticar contra /api/admin
  // o mostrar toasts con el mismo estilo del panel.
  window.apiAdmin = apiAdmin;
  window.toast    = toast;

  // ═══════════════════════════════════════════════════════════════
  // BOOT — decidir si mostrar login o entrar directo
  // ═══════════════════════════════════════════════════════════════
  /**
   * Si ya hay un JWT en sessionStorage de una sesión previa, intentamos
   * entrar directamente. apiAdmin('list_orders') es una request liviana
   * que sirve como "ping autenticado" — si el token es válido, OK; si
   * está expirado, el server responde 401 y apiAdmin ya limpia + muestra
   * login automáticamente.
   *
   * Sesión 31 Bloque C: cambio de password→JWT. Ya no hay re-login con
   * password persistente; el JWT vence en 8h y obliga a re-autenticar.
   */
  async function boot() {
    const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
    if (!token) { showLoginScreen(); return; }

    // Probamos el token con una request real liviana
    const { ok } = await apiAdmin('list_orders', { include_archived: 'all' });
    if (ok) {
      showAdminPanel();
      bootstrap();
    } else {
      // apiAdmin ya limpió el token y mostró login en caso de 401.
      // Si fue otro tipo de error (red, server caído), igual mostramos login.
      sessionStorage.removeItem(CONFIG.TOKEN_KEY);
      showLoginScreen();
    }
  }

  // Arrancar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
