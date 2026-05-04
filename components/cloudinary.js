/* =============================================================
   FOUNDER — Cloudinary delivery wrapper (Sesión 24)
   -------------------------------------------------------------
   Responsabilidades:
   1) Envolver URLs públicas de Supabase Storage con el endpoint
      de Cloudinary "fetch", aplicando f_auto, q_auto y w_xxx.
   2) Ofrecer presets por contexto (card, gallery, hero, thumb…)
      para evitar que cada llamada repita transformaciones.
   3) Generar srcset/sizes responsive para los contextos donde
      la imagen cambia de tamaño según viewport.
   4) Permitir un kill-switch instantáneo (ENABLED = false) que
      devuelve la URL original tal cual, sin tocar la DB.

   Arquitectura (fetch mode):
     Supabase Storage es la fuente de verdad. Cloudinary lee la
     imagen original desde Supabase, la cachea para siempre y
     la sirve transformada. Las URLs en la base de datos NO se
     modifican; el wrapping ocurre en el momento de renderizar.

   Cómo usarla desde HTML/JS:
     <img src="${cld(url, 'card')}"
          srcset="${cldSrcset(url, 'card')}"
          sizes="${CLD_SIZES.card}">

     Para un solo src sin srcset:
     <img src="${cld(url, 'thumb')}">

   Rollback: cambiar ENABLED a false en este archivo y deployar.
   Las imágenes vuelven a servirse desde Supabase como antes.
   ============================================================= */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────
  const CLOUD_NAME = 'founder-uy';
  const ENABLED    = true; // kill-switch; false = pasa la URL original

  // Cloudinary fetch endpoint base.
  // Formato: https://res.cloudinary.com/{cloud}/image/fetch/{transformations}/{remote_url}
  const FETCH_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/fetch/`;

  // Solo envolvemos URLs cuyos hosts confiamos. Cualquier otro
  // origen (data:, blob:, relativos, etc.) se devuelve sin tocar.
  const ALLOWED_HOSTS = [
    'qedwqbxuyhieznrqryhb.supabase.co',
  ];

  // ── Presets ──────────────────────────────────────────────────
  // Cada preset describe cómo se sirve una imagen según su uso.
  //   width:     ancho objetivo en px (Cloudinary usa w_…).
  //   widths:    ladder responsive para srcset (orden ascendente).
  //   quality:   q_auto (default) | q_auto:good | q_auto:best…
  //   crop:      'fill' (recorta), 'limit' (no agranda), undefined
  //   dpr:       'auto' (default off para no inflar bytes innecesarios)
  //
  // Decisión de tamaños: tomamos los breakpoints reales del CSS
  // (mobile <600, tablet 600-1024, desktop >1024) y agregamos un
  // 2x para pantallas retina hasta 1600px que es lo más común.
  const PRESETS = {
    // Cards del listado del index. Mobile 1 col ~400px, tablet 2 col
    // ~480px, desktop 3 col ~420px. Ladder cubre 1x y 2x.
    card: {
      width: 800,
      widths: [400, 600, 800, 1200],
      crop: 'fill',
    },
    // Galería principal de producto.html. Ocupa ~600px en mobile
    // y hasta ~700px en desktop. Para retina llevamos a 1400.
    gallery: {
      width: 1000,
      widths: [600, 900, 1200, 1600],
      crop: 'limit',
    },
    // Banner del hero del index (LCP del sitio). Ocupa el viewport
    // completo (100vw × 100vh) con object-fit: cover. En monitores
    // 1440p (2560px) y 4K (3840px) los anchos previos quedaban
    // cortos y el navegador escalaba hacia arriba → pixelado.
    // Calidad q_auto:good porque es lo primero que ve el usuario.
    hero: {
      width: 2400,
      widths: [800, 1200, 1600, 2000, 2800, 3600],
      quality: 'q_auto:good',
      crop: 'limit',
    },
    // LQIP (Low Quality Image Placeholder) del banner del hero.
    // Servimos una versión 64px super borroseada (~500-800 bytes) que
    // aparece instantáneamente mientras carga la imagen real. Cuando
    // la real está lista, JS hace crossfade. Refleja los colores reales
    // del banner porque toma la misma URL fuente que el preset 'hero'.
    // - e_blur:2000 = nivel de blur agresivo (rango 1-2000).
    // - q_30 = calidad baja, no importa porque va borroseada.
    // - sin srcset: no tiene sentido para un placeholder de 64px.
    hero_blur: {
      width: 64,
      widths: null,
      quality: 'q_30,e_blur:2000',
      crop: 'limit',
    },
    // Thumbnails chicos: carrito (56px), gallery thumbs del modal (~80px),
    // admin (~90px). Servimos una sola variante a 200px que cubre
    // 2x en mobile sin srcset (no compensa la complejidad).
    thumb: {
      width: 200,
      widths: null,
      crop: 'fill',
    },
    // Miniaturas grandes de la galería de producto.html. En desktop
    // la columna izquierda ocupa ~50vw y se reparte entre 4-6 thumbs
    // (cada uno ~150-200px de ancho). En pantallas Retina/HiDPI con
    // DPR 2x el navegador necesita ~480px para que se vea nítido.
    // Ladder responsive para que mobile no descargue de más.
    gallery_thumb: {
      width: 480,
      widths: [240, 360, 480, 720],
      quality: 'q_auto:good',
      crop: 'fill',
    },
    // Modal "vista rápida" del index (foto principal grande).
    // Mobile a pantalla completa, desktop ~700px.
    modal: {
      width: 1000,
      widths: [600, 900, 1200],
      crop: 'limit',
    },
    // og:image y twitter:image para SEO. Facebook/Twitter recomiendan
    // 1200x630, pero como nuestras fotos son cuadradas dejamos width
    // 1200 y q_auto:good para mantener calidad en previews sociales.
    og: {
      width: 1200,
      widths: null,
      quality: 'q_auto:good',
      crop: 'fill',
    },
  };

  // sizes attribute por preset (acompaña al srcset).
  // Le indica al navegador qué ancho VA A OCUPAR la imagen en cada
  // viewport, así elige bien del srcset. Coincide con los breakpoints
  // reales del CSS del sitio.
  const SIZES = {
    card:          '(max-width: 599px) 92vw, (max-width: 1023px) 46vw, 30vw',
    gallery:       '(max-width: 1023px) 92vw, 50vw',
    hero:          '100vw',
    modal:         '(max-width: 1023px) 92vw, 60vw',
    // Miniaturas grandes de producto.html. La galería ocupa ~92vw en
    // mobile/tablet y ~50vw en desktop, repartido entre 4-6 thumbs
    // en fila → cada thumb ocupa ~15vw mobile, ~10vw desktop.
    gallery_thumb: '(max-width: 1023px) 15vw, 10vw',
  };

  // ── Helpers internos ─────────────────────────────────────────
  /** Devuelve true si la URL pertenece a un host que sabemos cómo
   *  optimizar. data:, blob:, relativos y dominios desconocidos
   *  pasan sin transformar. */
  function isOptimizable(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http')) return false;
    try {
      const host = new URL(url).host;
      return ALLOWED_HOSTS.includes(host);
    } catch (_e) {
      return false;
    }
  }

  /** Construye la cadena de transformaciones Cloudinary para un preset. */
  function buildTransform(preset, widthOverride) {
    const parts = ['f_auto', preset.quality || 'q_auto'];
    const w = widthOverride || preset.width;
    if (w) parts.push('w_' + w);
    if (preset.crop) parts.push('c_' + preset.crop);
    return parts.join(',');
  }

  /** Devuelve la URL Cloudinary para un preset concreto, o la URL
   *  original si la imagen no es optimizable o el wrapper está OFF. */
  function cld(url, presetName) {
    if (!ENABLED) return url || '';
    if (!isOptimizable(url)) return url || '';
    const preset = PRESETS[presetName];
    if (!preset) {
      console.warn('[cloudinary] preset desconocido:', presetName);
      return url;
    }
    return FETCH_BASE + buildTransform(preset) + '/' + url;
  }

  /** Devuelve un srcset string con varias variantes para el preset.
   *  Si el preset no define widths (thumb, og), devuelve string vacío. */
  function cldSrcset(url, presetName) {
    if (!ENABLED) return '';
    if (!isOptimizable(url)) return '';
    const preset = PRESETS[presetName];
    if (!preset || !Array.isArray(preset.widths) || preset.widths.length === 0) return '';
    return preset.widths
      .map(w => FETCH_BASE + buildTransform(preset, w) + '/' + url + ' ' + w + 'w')
      .join(', ');
  }

  // ── Exposición global ────────────────────────────────────────
  // No usamos módulos ES (el sitio carga scripts directos en HTML),
  // así que exponemos un namespace en window. Coherente con el resto
  // del proyecto (window.founderDB, window.founderCart, etc.).
  window.founderCld = {
    cld:       cld,
    cldSrcset: cldSrcset,
    SIZES:     SIZES,
    enabled:   ENABLED,
  };

  // Atajos cortos para no escribir window.founderCld.cld(...) cada vez.
  // Solo se definen si no existen ya, para no pisar nada.
  if (typeof window.cld       === 'undefined') window.cld       = cld;
  if (typeof window.cldSrcset === 'undefined') window.cldSrcset = cldSrcset;
  if (typeof window.CLD_SIZES === 'undefined') window.CLD_SIZES = SIZES;
})();
