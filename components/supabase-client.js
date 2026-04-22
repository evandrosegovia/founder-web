/* =============================================================
   FOUNDER — Componente compartido: CLIENTE SUPABASE
   -------------------------------------------------------------
   Centraliza la conexión a Supabase. Usa fetch() directo contra
   la REST API de PostgREST (sin SDK). Sin dependencias externas.

   Responsabilidades:
   1) Guardar URL + anon key del proyecto (única fuente de verdad).
   2) Exponer la API global window.founderDB con:
        - fetchProducts()  → lista de productos con colores y extras.
        - fetchPhotoMap()  → { modelo: { color: [urls] } }
        - fetchBannerUrl() → string | null
   3) Devolver objetos con la MISMA forma que producían las
      funciones parseProducts/parsePhotoMap del código viejo.
      Esto permite migrar sin tocar el render del sitio.

   Seguridad:
     La anon key es PÚBLICA por diseño. Las tablas tienen RLS
     activo: solo se puede LEER catálogo con esta key. Pedidos
     están protegidos y requieren service_role (no va al frontend).
   ============================================================= */
(function () {
  'use strict';

  // ── Config del proyecto ──────────────────────────────────────
  const SUPABASE_URL  = 'https://qedwqbxuyhieznrqryhb.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZHdxYnh1eWhpZXpucnFyeWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjMxNzMsImV4cCI6MjA5MjM5OTE3M30.HcVfM2cqUh1RWd-9zTY__ZC9NMHpHmGpSmlzfYwghiI';

  // Endpoint REST de PostgREST
  const API = `${SUPABASE_URL}/rest/v1`;
  const HEADERS = {
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${SUPABASE_ANON}`,
  };

  // ── Fetch helper ─────────────────────────────────────────────
  async function supaGet(path) {
    const res = await fetch(`${API}${path}`, { headers: HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status}: ${body || res.statusText}`);
    }
    return res.json();
  }

  // ── Conversor: fila de products (Supabase) → objeto UI ───────
  // Mantiene la forma que esperaba el código viejo:
  //   { id, name, price, desc, colors:[{name}], specs:[...], extras:{...} }
  function toLegacyProduct(row, i) {
    // Reconstruir extras para mantener compat con getColorEstado()
    const colores_estado = {};
    (row.product_colors || []).forEach(c => {
      colores_estado[c.nombre] = c.estado;
      if (c.estado === 'oferta' && c.precio_oferta != null) {
        colores_estado[`${c.nombre}_precio_oferta`] = c.precio_oferta;
      }
    });

    const extras = {
      capacidad:        row.capacidad || '',
      dimensiones:      row.dimensiones || '',
      material:         row.material || '',
      nota:             row.nota || '',
      billetes:         row.lleva_billetes ? 'si' : 'no',
      monedas:          row.lleva_monedas ? 'si' : 'no',
      colores_estado,
    };

    // Los colores se ordenan por `orden` en la query; acá solo mapeamos
    // a la forma { name } — los datos visuales (hex, css) los agrega el
    // COLOR_MAP de cada página a través del spread existente.
    const colors = (row.product_colors || [])
      .map(c => ({ name: c.nombre }))
      .filter(c => c.name);

    return {
      id:     i + 1,
      name:   row.nombre,
      price:  row.precio,
      desc:   row.descripcion || '',
      colors,
      specs:  Array.isArray(row.especificaciones) ? row.especificaciones : [],
      extras,
    };
  }

  // ── API pública ──────────────────────────────────────────────

  /** Trae todos los productos ACTIVOS con sus colores, ordenados
   *  por `products.orden` y colores por `product_colors.orden`.
   *  Devuelve un array en la forma que usaba el código viejo. */
  async function fetchProducts() {
    // Embedding: traemos product_colors dentro de cada producto en una sola request.
    // `order=orden.asc` en la relación anidada ordena los colores.
    const path =
      '/products' +
      '?select=*,product_colors(nombre,estado,precio_oferta,orden)' +
      '&activo=eq.true' +
      '&order=orden.asc' +
      '&product_colors.order=orden.asc';
    const rows = await supaGet(path);
    return rows.map(toLegacyProduct);
  }

  /** Devuelve el mapa de fotos: { "Confort": { "Camel": ["url1","url2"], ... }, ... }
   *  Mantiene exactamente la forma que producía parsePhotoMap() del Sheet. */
  async function fetchPhotoMap() {
    // Traemos todas las fotos + el color al que pertenecen + el producto de ese color,
    // en una sola request. Ordenadas por `orden` para preservar el orden visual.
    const path =
      '/product_photos' +
      '?select=url,orden,product_colors!inner(nombre,products!inner(nombre))' +
      '&order=orden.asc';
    const rows = await supaGet(path);

    const map = {};
    rows.forEach(r => {
      const modelo = r.product_colors?.products?.nombre;
      const color  = r.product_colors?.nombre;
      const url    = r.url;
      if (!modelo || !color || !url) return;
      if (!map[modelo])          map[modelo] = {};
      if (!map[modelo][color])   map[modelo][color] = [];
      map[modelo][color].push(url);
    });
    return map;
  }

  /** Devuelve la URL del banner del hero (campo `banner_url` del primer
   *  producto activo ordenado por `orden`). null si no hay. */
  async function fetchBannerUrl() {
    const path = '/products?select=banner_url&activo=eq.true&order=orden.asc&limit=1';
    const rows = await supaGet(path);
    return rows[0]?.banner_url || null;
  }

  // ── Exponer globalmente ──────────────────────────────────────
  window.founderDB = {
    fetchProducts,
    fetchPhotoMap,
    fetchBannerUrl,
    // Útiles para debugging en consola del navegador
    _url:  SUPABASE_URL,
    _api:  API,
  };
})();
