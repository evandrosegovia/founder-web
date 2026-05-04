/* =============================================================
   FOUNDER — Componente compartido: SCROLL REVEAL (Sesión 25)
   -------------------------------------------------------------
   Responsabilidades:
   1) Inyectar CSS minimal con 3 clases de reveal (reveal, reveal-up,
      reveal-stagger) y su estado activo `.is-visible`.
   2) Observar elementos con clase `.reveal*` con IntersectionObserver
      y agregarles `.is-visible` cuando entran al viewport.
   3) Soportar staggering: los hijos de `.reveal-stagger` aparecen
      uno detrás del otro con 80ms de delay, dando feel de cascada.
   4) Respetar `prefers-reduced-motion`: si el usuario lo pidió, los
      elementos son visibles desde el inicio sin animación.
   5) Re-observar dinámicamente: si JS inyecta nuevas cards después
      del DOMContentLoaded (caso index.html con catálogo de Supabase),
      se re-escanean automáticamente vía MutationObserver.

   Arquitectura (por qué IntersectionObserver y no scroll listeners):
     Los scroll listeners se ejecutan en cada movimiento del scroll
     (60+ veces por segundo) y consumen CPU. IntersectionObserver es
     una API moderna del navegador que avisa SOLO cuando un elemento
     cruza un umbral, sin overhead. Apple/Stripe/Linear usan esto.

   Cómo usarla desde HTML:
     <section class="reveal-up">
       Contenido que aparece con fade-up al scrollear.
     </section>

     <ul class="reveal-stagger">
       <li>Item 1</li>  <!-- aparece primero -->
       <li>Item 2</li>  <!-- aparece +80ms después -->
       <li>Item 3</li>  <!-- aparece +160ms después -->
     </ul>

   Kill-switch: cambiar ENABLED a false y deployar. Las clases
   .reveal* dejan de hacer cualquier efecto (todo se ve normal).
   ============================================================= */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────
  const ENABLED = true;
  // Margen de raíz: comenzamos a animar cuando el elemento está a
  // 80px de entrar al viewport. Da sensación de que "ya está listo"
  // cuando el usuario llega scrolleando, no que aparece tarde.
  const ROOT_MARGIN = '0px 0px -80px 0px';
  // Threshold: con que aparezca el 5% del elemento ya disparamos.
  const THRESHOLD = 0.05;
  // Delay base entre hijos de un .reveal-stagger (ms).
  const STAGGER_STEP_MS = 80;
  // Tope de stagger para que listas grandes no tarden eternidad.
  const STAGGER_MAX_MS = 600;

  // ── Detección de reduced motion ──────────────────────────────
  // Si el sistema operativo pidió "menos movimiento", saltamos la
  // animación: agregamos .is-visible a todos desde el inicio.
  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Inyección de CSS ─────────────────────────────────────────
  // Auto-contenido: el componente trae todo su CSS para no depender
  // de hojas de estilo externas. Coherente con cart.js / header.js.
  function injectStyles() {
    if (document.getElementById('founder-scroll-reveal-styles')) return;
    const style = document.createElement('style');
    style.id = 'founder-scroll-reveal-styles';
    style.textContent = `
/* ── FOUNDER scroll-reveal ─────────────────────────────────── */
/* Estado inicial: invisible, listo para animar. Solo se aplica si
   el navegador soporta IntersectionObserver y NO tiene reduced motion.
   El selector .js-reveal en <html> lo agrega el JS al cargar.        */
.js-reveal .reveal,
.js-reveal .reveal-up,
.js-reveal .reveal-stagger > * {
  opacity: 0;
  transition: opacity 600ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.js-reveal .reveal-up,
.js-reveal .reveal-stagger > * {
  transform: translateY(30px);
}
/* Estado visible: animado a opacity 1 y translateY 0. */
.js-reveal .reveal.is-visible,
.js-reveal .reveal-up.is-visible,
.js-reveal .reveal-stagger > .is-visible {
  opacity: 1;
  transform: translateY(0);
}
/* Reduced motion: los elementos son visibles sin animación. */
@media (prefers-reduced-motion: reduce) {
  .js-reveal .reveal,
  .js-reveal .reveal-up,
  .js-reveal .reveal-stagger > * {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
`;
    document.head.appendChild(style);
  }

  // ── Lógica principal ─────────────────────────────────────────
  let observer = null;
  const seen = new WeakSet(); // elementos ya animados, no re-observar

  /** Marca un elemento como "ya visible" sin animar. Útil para
   *  elementos arriba del fold cuando el usuario entra a la página. */
  function showImmediately(el) {
    el.classList.add('is-visible');
    seen.add(el);
  }

  /** Inicializa el IntersectionObserver. Si el navegador no soporta
   *  la API (cualquier navegador moderno SÍ), mostramos todo sin
   *  animación como fallback seguro. */
  function setupObserver() {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: mostrar todo sin animar. Mejor que dejar invisibles.
      document.querySelectorAll('.reveal, .reveal-up, .reveal-stagger')
        .forEach(showImmediately);
      document.querySelectorAll('.reveal-stagger > *')
        .forEach(showImmediately);
      return;
    }

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (seen.has(el)) return;
        seen.add(el);

        if (el.classList.contains('reveal-stagger')) {
          // Animar cada hijo con delay incremental.
          const children = Array.from(el.children);
          children.forEach((child, i) => {
            const delay = Math.min(i * STAGGER_STEP_MS, STAGGER_MAX_MS);
            setTimeout(() => child.classList.add('is-visible'), delay);
          });
          // El contenedor también se marca para fines de debug/CSS.
          el.classList.add('is-visible');
        } else {
          el.classList.add('is-visible');
        }

        observer.unobserve(el); // limpiar memoria, ya no nos interesa
      });
    }, { rootMargin: ROOT_MARGIN, threshold: THRESHOLD });

    observe();
  }

  /** Escanea el DOM en busca de elementos a observar. Idempotente:
   *  los que ya están en `seen` se ignoran. */
  function observe() {
    if (!observer) return;
    const targets = document.querySelectorAll(
      '.reveal, .reveal-up, .reveal-stagger'
    );
    targets.forEach(el => {
      if (seen.has(el)) return;
      // Si ya está completamente en pantalla cuando cargamos (above
      // the fold), lo mostramos sin animar para evitar flash de
      // invisibilidad. El navegador renderiza, JS detecta posición.
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
      if (inViewport && rect.top >= 0) {
        // Está visible y arriba del scroll: animar normalmente
        // (queda lindo aunque sea above-the-fold).
        observer.observe(el);
      } else if (rect.bottom < 0) {
        // Está arriba del scroll (caso raro: usuario llegó con hash)
        // No animamos, mostrar directo.
        showImmediately(el);
        if (el.classList.contains('reveal-stagger')) {
          Array.from(el.children).forEach(showImmediately);
        }
      } else {
        // Está debajo del fold: observar normalmente.
        observer.observe(el);
      }
    });
  }

  /** Re-escanea cuando se inyectan nodos nuevos al DOM. Esencial
   *  para index.html que renderiza las cards del catálogo después
   *  del fetch a Supabase. */
  function setupMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver((mutations) => {
      let hasNew = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) { hasNew = true; break; }
      }
      if (hasNew) observe();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ── Bootstrap ────────────────────────────────────────────────
  function init() {
    if (!ENABLED) return;

    // Si reduced motion: marcamos todo como visible sin observer.
    // No agregamos .js-reveal al <html>, así el CSS no oculta nada.
    if (reducedMotion) {
      // No hacemos nada — los elementos quedan visibles porque sin
      // .js-reveal en <html> el CSS de opacity:0 no aplica.
      return;
    }

    injectStyles();

    // Marcamos <html> con .js-reveal: el CSS solo oculta elementos
    // si esta clase está presente. Si JS falla por cualquier motivo,
    // los elementos siguen visibles (failsafe).
    document.documentElement.classList.add('js-reveal');

    setupObserver();
    setupMutationObserver();
  }

  // Esperar a que el DOM esté listo (defer en script tag ya lo asegura,
  // pero por si acaso lo cargan sin defer en algún contexto).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
