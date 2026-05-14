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
      // Flag opcional de stock bajo. El frontend (producto.html) lee
      // `<color>_stock_bajo: true` y muestra el aviso "Pocas unidades".
      // Si es false/null, simplemente no se incluye la clave.
      if (c.stock_bajo === true) {
        colores_estado[`${c.nombre}_stock_bajo`] = true;
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
      dbId:   row.id,    // Sesión 38: UUID real de Supabase (productos.id).
                         // Necesario para correlacionar reseñas (reviews.product_id)
                         // que se guardan con el UUID real, no con el id legacy.
                         // `id` se mantiene como entero por compat con código viejo.
      name:   row.nombre,
      price:  row.precio,
      desc:   row.descripcion || '',
      colors,
      specs:  Array.isArray(row.especificaciones) ? row.especificaciones : [],
      extras,
      // Personalización láser (Sesión 28 Bloque B): flags por producto.
      // Defaults a false si la columna aún no existe en DB (para que no
      // rompa si alguien tiene cache de un schema anterior).
      permite_grabado_adelante: row.permite_grabado_adelante === true,
      permite_grabado_interior: row.permite_grabado_interior === true,
      permite_grabado_atras:    row.permite_grabado_atras    === true,
      permite_grabado_texto:    row.permite_grabado_texto    === true,
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
      '?select=*,product_colors(nombre,estado,precio_oferta,stock_bajo,orden)' +
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

  /** Devuelve la URL del banner del hero desde `site_settings.hero_banner_url`.
   *  Antes leía `products.banner_url` del primer producto activo, lo cual
   *  obligaba a traer la tabla `products` solo para una URL. Ahora pega a una
   *  fila de `site_settings` (key, value) — query mucho más liviana y rápida.
   *  Devuelve string | null si no hay banner configurado. */
  async function fetchBannerUrl() {
    const path = '/site_settings?select=value&key=eq.hero_banner_url&limit=1';
    const rows = await supaGet(path);
    return rows[0]?.value || null;
  }

  // ─────────────────────────────────────────────────────────────
  // PERSONALIZACIÓN LÁSER — Configuración global (Sesión 28)
  // ─────────────────────────────────────────────────────────────
  // Toda la config del feature de personalización vive en
  // `site_settings.personalizacion_config` como JSON serializado en
  // el campo `value` (string). Esto permite agregar/sacar campos sin
  // tocar el schema de Supabase.
  //
  // Mientras la columna real `permite_grabado_*` no exista en la tabla
  // `products` (eso llega en Sesión B), usamos `productos: { ... }`
  // dentro del JSON para guardar los toggles por producto. Migración
  // posterior a columnas reales: trivial.
  //
  // DEFAULTS: si `site_settings.personalizacion_config` no existe o es
  // inválido, devolvemos esta estructura. La regla más importante es
  // `enabled: false` — el feature arranca APAGADO y solo se activa
  // cuando el dueño guarda config desde el admin.

  const PERSONALIZACION_DEFAULTS = Object.freeze({
    // Master switch: si está en false, el bloque ni se renderiza en
    // producto.html. Equivale a "feature está oculto del cliente".
    enabled: false,

    // Precio que se suma POR cada elemento elegido (adelante / interior /
    // atrás / texto son acumulables). En UYU, redondeado.
    precio_por_elemento: 290,

    // Tiempo extra que se suma a la preparación cuando hay personalización.
    tiempo_extra_horas: 24,

    // Validaciones de imagen (se usan recién en Sesión B cuando el upload
    // funciona, pero las dejamos definidas desde ya para UI consistente).
    archivo: {
      tipos_permitidos:    ['image/png', 'image/jpeg', 'image/svg+xml'],
      peso_max_mb:         5,
      dim_min_px:          500,    // bloqueo: por debajo no deja subir
      dim_recomendada_px:  800,    // warning: avisa pero deja
    },

    // Texto: cuántos caracteres como máximo en el grabado de texto.
    texto_max_caracteres: 40,

    // Toggles por producto. Mapa { "NombreDelProducto": { adelante,
    // interior, atras, texto } } — cualquier producto que no figure
    // acá se asume "todo en false" (es decir, no acepta grabados).
    productos: {},

    // Textos legales que se muestran al cliente en el bloque de
    // personalización. Editables desde el admin para no tocar código
    // si cambia la política.
    textos: {
      aviso_no_devolucion:
        'Los productos personalizados no admiten devolución. Mantienen garantía de fabricación de 60 días.',
      aviso_tiempo_extra:
        'La personalización agrega 24 hs hábiles al tiempo de preparación.',
      disclaimer_copyright:
        'Al subir imágenes confirmás que tenés los derechos para usarlas. Founder se reserva el derecho de cancelar y reembolsar pedidos con contenido que infrinja derechos.',
    },
  });

  /** Devuelve la config de personalización desde Supabase, parseada y
   *  fusionada con los defaults. SIEMPRE devuelve un objeto válido —
   *  si la fila no existe o el JSON está roto, cae a los defaults.
   *
   *  Esto significa que `producto.html` y el admin pueden llamar a esta
   *  función sin chequear errores: lo peor que pasa es "feature apagado
   *  con valores por defecto", que es exactamente el estado inicial deseado.
   */
  async function fetchPersonalizacionConfig() {
    try {
      const path = '/site_settings?select=value&key=eq.personalizacion_config&limit=1';
      const rows = await supaGet(path);
      const raw  = rows[0]?.value;
      if (!raw) return cloneDefaults();

      const parsed = JSON.parse(raw);
      // Merge superficial campo por campo para tolerar configs viejas
      // a las que les faltan campos nuevos.
      return mergeWithDefaults(parsed);
    } catch (e) {
      console.warn('[founderDB] No se pudo leer personalizacion_config — usando defaults:', e);
      return cloneDefaults();
    }
  }

  /** Trae los ejemplos ACTIVOS de la galería de personalización
   *  (Sesión 28 Bloque B). RLS filtra por activo=true automáticamente,
   *  pero igual lo pedimos explícito por claridad.
   *
   *  Devuelve array de { id, tipo, url, descripcion, colores[], modelos[], orden }.
   *  Si la query falla (tabla no existe en deploys viejos), retorna [].
   */
  async function fetchPersonalizacionExamples() {
    try {
      const path =
        '/personalizacion_examples' +
        '?select=id,tipo,url,descripcion,colores,modelos,orden' +
        '&activo=eq.true' +
        '&order=orden.asc';
      const rows = await supaGet(path);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn('[founderDB] No se pudieron leer ejemplos de personalización:', e);
      return [];
    }
  }

  /** Clona profundo los defaults para que el caller pueda mutarlos sin
   *  contaminar la fuente. JSON parse/stringify alcanza para esta forma
   *  de objeto (sin funciones, sin Dates, sin refs circulares). */
  function cloneDefaults() {
    return JSON.parse(JSON.stringify(PERSONALIZACION_DEFAULTS));
  }

  /** Toma un objeto parseado de Supabase y lo fusiona contra los defaults,
   *  garantizando que todas las keys esperadas existan. Si Supabase trae
   *  campos extra que los defaults no conocen, los preservamos también
   *  (forward-compatible). */
  function mergeWithDefaults(incoming) {
    const out = cloneDefaults();
    if (!incoming || typeof incoming !== 'object') return out;

    // Top-level: copiamos todo lo que venga, sobreescribiendo defaults.
    Object.keys(incoming).forEach(k => {
      if (k === 'archivo' || k === 'textos' || k === 'productos') {
        // Sub-objetos: merge para no perder defaults internos.
        out[k] = { ...out[k], ...(incoming[k] || {}) };
      } else {
        out[k] = incoming[k];
      }
    });
    return out;
  }

  // ── Exponer globalmente ──────────────────────────────────────
  window.founderDB = {
    fetchProducts,
    fetchPhotoMap,
    fetchBannerUrl,
    fetchPersonalizacionConfig,
    fetchPersonalizacionExamples,
    PERSONALIZACION_DEFAULTS,
    // Útiles para debugging en consola del navegador
    _url:  SUPABASE_URL,
    _api:  API,
  };
})();
