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
    if (page === 'personalizacion') {
      loadPersonalizacion();
      loadCleanupStatus();
    }
    // Sesión 38: cargar reseñas al entrar a la sección
    if (page === 'resenas' && typeof window.loadReviews === 'function') {
      window.loadReviews();
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
  function renderOrders(orders) {
    const g = $('ordersGrid');
    if (!g) return;

    if (!orders.length) {
      g.innerHTML = `<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--muted)">
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;margin-bottom:6px">No hay pedidos</div>
        <div style="font-size:10px;letter-spacing:2px">Aplicá otro filtro o esperá nuevas compras</div>
      </div>`;
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
        <div class="order-status ${cls}" style="font-size:12px;padding:6px 14px">${esc(o.estado || 'Pendiente')}</div>
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
   */
  async function loadCleanupLogs() {
    const list = $('cleanupLogsList');
    if (!list) return;

    try {
      const resp = await apiAdminFetch('/api/cleanup-personalizacion', 'list_cleanup_logs', { limit: 10 });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        list.innerHTML = '<div style="color:var(--muted)">Sin historial todavía.</div>';
        return;
      }
      const logs = data.logs || [];
      if (!logs.length) {
        list.innerHTML = '<div style="color:var(--muted);font-size:11px">Todavía no se ejecutó ninguna limpieza.</div>';
        return;
      }
      list.innerHTML = logs.map(l => {
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
              <div style="font-size:11px;color:var(--gold)">${l.borradas || 0} imágenes</div>
              <div style="font-size:9px;color:var(--muted);letter-spacing:1px">${(l.liberados_mb || 0).toFixed(2)} MB liberados</div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = '<div style="color:var(--muted)">Error cargando historial.</div>';
    }
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
    ['editNombre', 'editPrecio', 'editDesc', 'editSpecs',
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
    $('editSpecs').value       = (p.especificaciones || []).join('|');
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
    const especificaciones = ($('editSpecs')?.value || '').split('|')
                              .map(s => s.trim()).filter(Boolean);
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
  }

  /** Sesión 39: cancela la edición y limpia el formulario (vuelve a modo crear). */
  function cancelEditCupon() {
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
  // BANNER DEL HERO
  // ───────────────────────────────────────────────────────────────
  // El banner se guarda en la tabla `site_settings` con la key
  // `hero_banner_url`. El sitio público (supabase-client.js →
  // fetchBannerUrl) lee de ahí directamente con la anon key.
  // Antes vivía en `products.banner_url` del primer producto activo,
  // pero eso obligaba a traer la tabla products entera solo para una URL.
  // (Columna legacy `products.banner_url` dropeada en Sesión 40.)
  // ═══════════════════════════════════════════════════════════════

  const BANNER_KEY = 'hero_banner_url';

  /** Carga la URL del banner desde site_settings y la pinta en el editor.
   *  No depende de `state.products` — es totalmente independiente del catálogo. */
  async function loadBanner(opts = {}) {
    const silent = !!opts.silent;
    const { ok, data } = await apiAdmin('get_setting', { key: BANNER_KEY });

    const url = ok ? (data?.value || '') : '';
    if (!ok && !silent) toast('Error cargando el banner', true);

    const input = $('bannerInput');
    if (input) input.value = url;
    renderBannerPreview(url);
  }

  /** Refresca el preview visual del banner. */
  function renderBannerPreview(url) {
    const prev  = $('bannerPreview');
    const empty = $('bannerPreviewEmpty');
    if (!prev) return;

    // Limpiar imagen previa
    const prevImg = prev.querySelector('img');
    if (prevImg) prevImg.remove();

    if (url) {
      if (empty) empty.style.display = 'none';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Banner del hero';
      prev.appendChild(img);
    } else {
      if (empty) empty.style.display = 'block';
    }
  }

  function previewBanner() {
    const url = ($('bannerInput')?.value || '').trim();
    if (!url) { toast('Ingresá un link de imagen', true); return; }
    renderBannerPreview(url);
    toast('Vista previa cargada');
  }

  /** Guarda la URL del banner en site_settings.hero_banner_url. */
  async function saveBanner() {
    const url = ($('bannerInput')?.value || '').trim();
    if (!url) { toast('Ingresá un link de imagen', true); return; }
    await persistBannerUrl(url, '✅ Banner guardado — visible en el sitio');
  }

  async function clearBanner() {
    if (!confirm('¿Estás seguro de quitar el banner? Se eliminará para todos los visitantes.')) return;
    await persistBannerUrl('', '✅ Banner eliminado');
  }

  /** Persistencia del banner: upsert en site_settings vía /api/admin → set_setting.
   *  Mucho más simple que antes — no tocamos ningún producto. */
  async function persistBannerUrl(url, okMsg) {
    const { ok, data } = await apiAdmin('set_setting', { key: BANNER_KEY, value: url });
    if (!ok) {
      toast('Error guardando el banner' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }
    const input = $('bannerInput');
    if (input) input.value = url;
    renderBannerPreview(url);
    toast(okMsg);
  }

  
  /** Subir imagen del banner desde el equipo. */
  function pickBannerFile() {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = 'image/*';
    f.onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      toast('⏳ Subiendo imagen...');
      const publicUrl = await uploadFileToStorage(file, 'banner-' + Date.now() + '.jpg');
      if (!publicUrl) return;  // uploadFileToStorage ya mostró el error
      const input = $('bannerInput');
      if (input) input.value = publicUrl;
      await persistBannerUrl(publicUrl, '✅ Banner subido y guardado');
    };
    f.click();
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
   // Sesión 29 (C): personalización en pedidos + panel limpieza
  window.viewPersonalizImage     = viewPersonalizImage;
  window.downloadPersonalizImage = downloadPersonalizImage;
  window.downloadOrderZip        = downloadOrderZip;
  window.loadCleanupStatus       = loadCleanupStatus;
  window.downloadBorrablesZip    = downloadBorrablesZip;
  window.runCleanupManual        = runCleanupManual;
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

  // Banner
  window.previewBanner       = previewBanner;
  window.saveBanner          = saveBanner;
  window.clearBanner         = clearBanner;
  window.pickBannerFile      = pickBannerFile;

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
