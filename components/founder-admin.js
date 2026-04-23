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
    PW_KEY:     'founder_admin_pw',   // sessionStorage key
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
    // Cupones (viene de /api/admin action:"list_coupons")
    coupons: [],
    // Editor de producto — estado del modal
    editingProductId: null,          // uuid del producto en edición (null = nuevo)
    colorRows: [],                   // [{ uid, nombre, estado, precio_oferta, photos:[5 urls] }]
    colorRowUid: 0,                  // contador para uid estable por fila
    pendingDeleteId: null,           // id del producto en el confirm modal
  };

  // ── DOM HELPERS ──────────────────────────────────────────────
  const $       = id => document.getElementById(id);
  const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML  = html; };
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

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

  // ── API helper: POST JSON a /api/admin con password ──────────
  /**
   * Hace POST a /api/admin con `action` y el resto del payload.
   * El password se adjunta automáticamente desde sessionStorage.
   *
   * Devuelve siempre un objeto { ok, status, data } — nunca tira,
   * así cada caller decide cómo manejar el error mirando .ok/.data.error.
   *
   * Si el servidor responde 401 (unauthorized), se fuerza logout
   * para que el admin vuelva a escribir el password.
   */
  async function apiAdmin(action, payload = {}) {
    const pw = sessionStorage.getItem(CONFIG.PW_KEY) || '';
    let res, data = null;
    try {
      res = await fetch(CONFIG.API_ADMIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, password: pw, ...payload }),
      });
      try { data = await res.json(); } catch { /* body no es JSON */ }
    } catch (netErr) {
      return { ok: false, status: 0, data: { error: 'network_error', message: String(netErr) } };
    }

    // Si la clave quedó inválida (pasó mucho tiempo, cambiaron el pw,
    // etc.), cerramos sesión para evitar spam de errores.
    if (res.status === 401) {
      sessionStorage.removeItem(CONFIG.PW_KEY);
      showLoginScreen();
      toast('Sesión expirada — ingresá la contraseña de nuevo', true);
    }

    return { ok: res.ok, status: res.status, data: data || {} };
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
   * Valida el password contra /api/admin. Si es correcto, lo guarda
   * en sessionStorage y arranca la carga de datos. Si no, muestra
   * el error debajo del input.
   */
  async function login() {
    const input = $('passwordInput');
    const errEl = $('loginError');
    const btn   = document.querySelector('.login-btn');

    const pw = (input?.value || '').trim();
    if (!pw) { if (errEl) errEl.style.display = 'block'; return; }

    // Guardamos el pw en sessionStorage ANTES de pegarle a /api/admin
    // porque apiAdmin() lo toma de ahí.
    sessionStorage.setItem(CONFIG.PW_KEY, pw);

    if (btn)   { btn.disabled = true; btn.textContent = 'Ingresando...'; }
    if (errEl) errEl.style.display = 'none';

    const { ok } = await apiAdmin('login');

    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }

    if (!ok) {
      sessionStorage.removeItem(CONFIG.PW_KEY);
      if (errEl) errEl.style.display = 'block';
      if (input) input.value = '';
      return;
    }

    // Login OK — entramos al panel y cargamos todo.
    showAdminPanel();
    if (input) input.value = '';
    if (errEl) errEl.style.display = 'none';

    // Arrancamos la carga inicial en paralelo (productos + pedidos + banner).
    bootstrap();
  }

  /** Cierra sesión — borra password y vuelve al login. */
  function logout() {
    sessionStorage.removeItem(CONFIG.PW_KEY);
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
    if (page === 'cupones')  loadCoupons();
    if (page === 'banner')   loadBanner();
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
        banner_url:       p.banner_url || '',
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
      const thumb = firstFoto
        ? `<img src="${esc(firstFoto)}" class="prod-img" style="object-fit:cover" alt="${esc(p.nombre)}">`
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
   */
  function renderDashboard() {
    const products = state.products;
    const orders   = state.allOrders;

    // ── Métricas del catálogo ─────────────────────────────────
    setText('statProductos', products.length);
    setText('statColores',   products.reduce((s, p) => s + p.colors.length, 0));
    const setsFotos = products.reduce((s, p) => s + p.colors.filter(c => c.photos.length > 0).length, 0);
    setText('statImagenes', setsFotos + ' sets');
    setText('statPedidos',  orders.length);

    // ── Métricas de ventas ────────────────────────────────────
    const confirmados  = orders.filter(o => ['Confirmado', 'En preparación', 'En camino', 'Listo para retirar', 'Entregado'].includes(o.estado));
    const pendientes   = orders.filter(o => ['Pendiente pago', 'Pendiente confirmación'].includes(o.estado));
    const totalIngreso = confirmados.reduce((s, o) => s + (o.total || 0), 0);
    const ticket       = confirmados.length ? Math.round(totalIngreso / confirmados.length) : 0;

    setText('salesTotal', fmtUYU(totalIngreso));
    setHTML('salesTotalSub', `<span>${confirmados.length} pedido${confirmados.length !== 1 ? 's' : ''} cobrado${confirmados.length !== 1 ? 's' : ''}</span>`);
    setText('salesConfirmados', confirmados.length);
    setHTML('salesConfirmadosSub', confirmados.length ? `<span>de ${orders.length} pedidos totales</span>` : '');
    setText('salesPendientes', pendientes.length);
    setHTML('salesPendientesSub', pendientes.length
      ? `${fmtUYU(pendientes.reduce((s, o) => s + (o.total || 0), 0))} UYU en espera`
      : '<span>Sin pendientes 🎉</span>');
    setText('salesTicket', ticket ? fmtUYU(ticket) : '—');
    setHTML('salesTicketSub', ticket ? 'promedio por pedido confirmado' : 'Sin pedidos confirmados aún');

    // ── Gráfico: Ventas por producto ──────────────────────────
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
      : '<div class="no-data">Sin datos de productos aún</div>');

    // ── Gráfico: Métodos de pago (donut SVG) ──────────────────
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
      setHTML('chartPagos', '<div class="no-data">Sin datos aún</div>');
    }

    // ── Gráfico: Estado de pedidos ───────────────────────────
    const estadoConfig = {
      'Pendiente pago':         { color: 'var(--gold)',  icon: '⏳' },
      'Pendiente confirmación': { color: '#8888ff',      icon: '🔔' },
      'Confirmado':             { color: 'var(--green)', icon: '✅' },
      'Entregado':              { color: 'var(--green)', icon: '📦' },
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

    // ── Gráfico: Colores más vendidos ────────────────────────
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
      : '<div class="no-data">Sin datos de colores aún</div>');

    // ── Lista de productos en el dashboard ────────────────────
    setHTML('dashProductList', products.length ? products.map(p => {
      const firstFoto  = p.colors.flatMap(c => c.photos).find(Boolean);
      const setsFotosP = p.colors.filter(c => c.photos.length > 0).length;
      const ventasProd = porProducto[p.nombre] || 0;
      return `<div class="product-row">
        ${firstFoto
          ? `<img src="${esc(firstFoto)}" class="prod-img" style="object-fit:cover" alt="${esc(p.nombre)}">`
          : `<div class="prod-img">👜</div>`}
        <div style="flex:1">
          <div class="prod-name">Founder ${esc(p.nombre)}</div>
          <div class="prod-meta">${p.colors.length} colores · ${setsFotosP} sets fotos · ${ventasProd} pedidos</div>
        </div>
        <div class="prod-price">${fmtUYU(p.precio)}</div>
      </div>`;
    }).join('') : '<div style="padding:32px;text-align:center;color:var(--muted);font-size:11px;letter-spacing:2px">Sin productos cargados</div>');
  }

  // ═══════════════════════════════════════════════════════════════
  // PEDIDOS — lista, filtros, detalle, estado, tracking
  // ═══════════════════════════════════════════════════════════════

  /**
   * Carga todos los pedidos desde Supabase vía /api/admin.
   * Se guardan en state.allOrders con `productos` como string
   * "Founder Confort (Negro) x1 | Founder Simple (Camel) x2",
   * derivado de order_items[] para compatibilidad con los
   * gráficos del dashboard y el renderer de la lista.
   *
   * @param {{silent?: boolean}} opts  si silent=true no cambia UI mientras carga
   */
  async function loadOrders(opts = {}) {
    const silent = !!opts.silent;
    const btn = document.querySelector('#page-pedidos .ph .btn-primary');
    if (!silent && btn) { btn.textContent = '⏳ Cargando...'; btn.disabled = true; }

    const { ok, data } = await apiAdmin('list_orders');
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

    // Re-renderizamos dashboard porque cambian las métricas de ventas
    renderDashboard();
  }

  /** Filtra la lista visible por estado. */
  function filterOrders(filter, btn) {
    state.currentFilter = filter;
    if (btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    const list = filter === 'todos'
      ? state.allOrders
      : state.allOrders.filter(o => o.estado === filter);
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
      'Cancelado':              'status-cancelado',
    };

    g.innerHTML = orders.map(o => {
      const cls = statusMap[o.estado] || '';
      // Siempre usamos `o.productos` (ya normalizado en loadOrders)
      const prodsText = o.productos || '—';
      const numero    = o.numero || o.id || '—';
      return `<div class="order-card">
        <div class="order-head">
          <div class="order-id">#${esc(numero)}</div>
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
          ${['Pendiente pago','Pendiente confirmación','Confirmado','Entregado','Cancelado'].map(s =>
            `<button class="btn btn-sm ${o.estado === s ? 'btn-primary' : 'btn-secondary'}"
              onclick="changeOrderStatus('${esc(o.id)}','${esc(s)}')">${esc(s)}</button>`
          ).join('')}
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

    // Copiar colores a state.colorRows (cada uno con uid único para tracking)
    state.colorRows = p.colors.map(c => ({
      uid:           ++state.colorRowUid,
      nombre:        c.nombre,
      estado:        c.estado || 'activo',
      precio_oferta: c.precio_oferta || null,
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
                  ? `<img src="${esc(f)}" class="slot-prev" id="prev_${sid}_${fi}" alt="Foto ${fi + 1}">`
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
    el.outerHTML = url
      ? `<img src="${esc(url)}" class="slot-prev" id="prev_${sid}_${fi}" alt="Foto ${fi + 1}">`
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

    // Construir colores — solo los que tienen nombre
    const colors = state.colorRows
      .filter(c => (c.nombre || '').trim())
      .map(c => ({
        nombre:        c.nombre.trim(),
        estado:        c.estado || 'activo',
        precio_oferta: c.estado === 'oferta' ? (c.precio_oferta || null) : null,
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

    const { ok, data } = await apiAdmin('list_coupons');
    if (!ok) {
      if (wrap) wrap.innerHTML = `<div class="no-cupones">⚠️ No se pudieron cargar los cupones. <button class="btn btn-sm btn-secondary" onclick="loadCoupones()" style="margin-top:8px">Reintentar</button></div>`;
      return;
    }
    state.coupons = data.coupons || [];
    renderCouponsTable();
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
      const descLabel = c.tipo === 'porcentaje' ? `${c.valor}%` : fmtUYU(c.valor);
      const minLabel  = (Number(c.min_compra) > 0) ? fmtUYU(c.min_compra) : '—';
      return `<tr>
        <td><div class="cupon-code">${esc(c.codigo)}</div></td>
        <td>${descLabel}</td>
        <td style="font-size:10px;color:var(--muted)">${esc(usoLabel)}</td>
        <td style="font-size:10px;color:var(--muted)">${minLabel}</td>
        <td style="font-size:10px;color:var(--muted)">${fmtFecha(c.desde)} → ${fmtFecha(c.hasta)}</td>
        <td style="text-align:center">${c.usos_count || 0}</td>
        <td><span class="cupon-badge ${c.activo ? 'activo' : 'inactivo'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
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

  /** Crea un cupón nuevo desde el formulario del sidebar. */
  async function saveCupon() {
    const codigo = ($('cpCodigo')?.value || '').trim().toUpperCase();
    const tipo   = $('cpTipo')?.value || 'porcentaje';
    const valor  = parseFloat($('cpValor')?.value || '0');
    const uso    = $('cpUso')?.value  || 'multiuso';
    const min_compra = parseFloat($('cpMinCompra')?.value || '0') || 0;
    const desde  = $('cpDesde')?.value || '';  // YYYY-MM-DD
    const hasta  = $('cpHasta')?.value || '';
    const activo = ($('cpActivo')?.value === 'true');

    if (!codigo)       { toast('El código es obligatorio', true); return; }
    if (!valor || valor <= 0) { toast('El valor debe ser mayor a 0', true); return; }
    if (state.coupons.some(c => c.codigo === codigo)) {
      toast('Ya existe un cupón con ese código', true); return;
    }

    const btn = $('cpSaveBtn');
    if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

    const { ok, data } = await apiAdmin('create_coupon', {
      coupon: { codigo, tipo, valor, uso, min_compra, desde: desde || null, hasta: hasta || null, activo },
    });

    if (btn) { btn.textContent = 'Crear cupón'; btn.disabled = false; }

    if (!ok) {
      const msg = data?.error === 'codigo_duplicate'
        ? 'Ya existe un cupón con ese código'
        : 'Error al guardar el cupón' + (data?.message ? ': ' + data.message : '');
      toast(msg, true);
      return;
    }

    // Limpiar inputs
    ['cpCodigo', 'cpValor', 'cpMinCompra', 'cpDesde', 'cpHasta']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });

    toast(`✅ Cupón ${codigo} creado`);
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
    toast(`Cupón ${c.codigo} eliminado`);
    await loadCoupons();
  }

  // ═══════════════════════════════════════════════════════════════
  // BANNER DEL HERO
  // ───────────────────────────────────────────────────────────────
  // Nota técnica: el sitio público lee el banner desde el campo
  // `banner_url` del PRIMER producto activo ordenado por `orden`
  // (ver supabase-client.js → fetchBannerUrl). Por eso acá, en el
  // admin, guardamos/leemos el banner sobre ese mismo producto.
  // ═══════════════════════════════════════════════════════════════

  /** Devuelve el primer producto activo (ordenado por `orden`). */
  function getBannerProduct() {
    const actives = state.products
      .filter(p => p.activo !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    return actives[0] || state.products[0] || null;
  }

  /** Carga la URL del banner en el input y el preview. */
  async function loadBanner(opts = {}) {
    const silent = !!opts.silent;

    // Necesitamos products cargados para saber dónde está el banner
    if (!state.products.length) {
      if (!silent) await loadProducts();
    }

    const prod = getBannerProduct();
    const url  = prod?.banner_url || '';

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

  /**
   * Guarda el banner_url en el primer producto activo.
   * Usa save_product con el producto completo — así el backend
   * mantiene la consistencia con los colores/fotos existentes.
   */
  async function saveBanner() {
    const url = ($('bannerInput')?.value || '').trim();
    if (!url) { toast('Ingresá un link de imagen', true); return; }
    await persistBannerUrl(url, '✅ Banner guardado — visible en el sitio');
  }

  async function clearBanner() {
    if (!confirm('¿Estás seguro de quitar el banner? Se eliminará para todos los visitantes.')) return;
    await persistBannerUrl('', '✅ Banner eliminado');
  }

  /**
   * Persistencia del banner: guardamos el URL en products.banner_url
   * del producto-ancla. Enviamos payload con `{ product:{ slug, banner_url }, colors:[] }`
   * pero preservamos todos los otros campos del producto para que el
   * upsert no pise otros datos.
   */
  async function persistBannerUrl(url, okMsg) {
    if (!state.products.length) await loadProducts();
    const prod = getBannerProduct();
    if (!prod) {
      toast('No hay productos donde guardar el banner. Creá un producto primero.', true);
      return;
    }

    const product = {
      slug:             prod.slug,
      nombre:           prod.nombre,
      precio:           prod.precio,
      descripcion:      prod.descripcion,
      especificaciones: prod.especificaciones,
      capacidad:        prod.capacidad,
      dimensiones:      prod.dimensiones,
      material:         prod.material,
      nota:             prod.nota,
      lleva_billetes:   prod.lleva_billetes,
      lleva_monedas:    prod.lleva_monedas,
      orden:            prod.orden,
      activo:           prod.activo,
      banner_url:       url,
    };

    // Mapear colores actuales al formato que espera save_product
    const colors = prod.colors.map(c => ({
      nombre:        c.nombre,
      estado:        c.estado,
      precio_oferta: c.precio_oferta,
      fotos:         c.photos.filter(Boolean),
    }));

    const { ok, data } = await apiAdmin('save_product', { product, colors });
    if (!ok) {
      toast('Error guardando el banner' + (data?.message ? ': ' + data.message : ''), true);
      return;
    }

    // Actualizar local + UI
    prod.banner_url = url;
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
  // EXPONER FUNCIONES USADAS POR onclick INLINE DEL HTML
  // ───────────────────────────────────────────────────────────────
  // El HTML del admin usa atributos onclick="xxx()" por toda la
  // página. Para que sigan funcionando sin reescribir el HTML,
  // exportamos a window TODAS las funciones referenciadas.
  // ═══════════════════════════════════════════════════════════════
  window.login               = login;
  window.logout              = logout;
  window.nav                 = nav;

  // Pedidos
  window.loadOrders          = loadOrders;
  window.filterOrders        = filterOrders;
  window.viewOrder           = viewOrder;
  window.closeOrderDetail    = closeOrderDetail;
  window.changeOrderStatus   = changeOrderStatus;
  window.setOrderStep        = setOrderStep;
  window.setOrderCancelado   = setOrderCancelado;
  window.saveTracking        = saveTracking;
  window.openTrackingUrl     = openTrackingUrl;

  // Dashboard / acciones generales
  window.loadData            = bootstrap;   // botón "↻ Actualizar" del dashboard

  // Productos
  window.openNewProduct      = openNewProduct;
  window.editProduct         = editProduct;
  window.closeModal          = closeModal;
  window.addColorRow         = addColorRow;
  window.removeColorRow      = removeColorRow;
  window.onColorNameInput    = onColorNameInput;
  window.setColorEstado      = setColorEstado;
  window.onPrecioOfertaInput = onPrecioOfertaInput;
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

  // Banner
  window.previewBanner       = previewBanner;
  window.saveBanner          = saveBanner;
  window.clearBanner         = clearBanner;
  window.pickBannerFile      = pickBannerFile;

  // ═══════════════════════════════════════════════════════════════
  // BOOT — decidir si mostrar login o entrar directo
  // ═══════════════════════════════════════════════════════════════
  /**
   * Si ya hay un password en sessionStorage de una sesión previa,
   * intentamos entrar directamente (validando contra el server).
   * Si falla, mostramos el login.
   */
  async function boot() {
    const pw = sessionStorage.getItem(CONFIG.PW_KEY);
    if (!pw) { showLoginScreen(); return; }

    const { ok } = await apiAdmin('login');
    if (ok) {
      showAdminPanel();
      bootstrap();
    } else {
      // El 401 ya limpió el pw y mostró login, pero por las dudas:
      sessionStorage.removeItem(CONFIG.PW_KEY);
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
