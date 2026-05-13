/* =============================================================
   FOUNDER — components/founder-reviews-loader.js
   -------------------------------------------------------------
   Cargador de reseñas REALES para producto.html (Sesión 38).

   Antes de Sesión 38 las 4 reseñas en producto.html eran mock,
   hardcodeadas en el HTML. Esta sesión las reemplaza por reseñas
   reales aprobadas desde la tabla `reviews` de Supabase, filtradas
   por product_id del producto activo.

   Qué hace:
     • loadProductReviews(product) — punto de entrada.
       Trae de Supabase las reseñas con estado='aprobada' del producto,
       las renderiza en #reviewsGrid, genera los dots, y actualiza el
       Schema.org Product con aggregateRating.

   Si no hay reseñas aprobadas:
     • Oculta la sección entera (mejor mostrar nada que reseñas falsas).

   Lectura desde anon key:
     • La tabla `reviews` tiene RLS habilitado pero anon NO tiene GRANT.
       Por eso usamos window.founderDB.client (cliente Supabase del
       sitio) que NO funcionaría con anon directo a la tabla.
     • Solución: usamos el endpoint público /api/seguimiento? NO,
       ese pide order+email.
     • Mejor: agregamos un endpoint público read-only /api/reviews
       con action="list_public" que devuelve solo aprobadas filtradas.
       Si decidiéramos lo contrario en el futuro, basta con activar
       GRANT SELECT a anon WHERE estado='aprobada'.

   Diseño actual: usar el endpoint /api/reviews?action=list_public.
   ============================================================= */
'use strict';

(function () {

  const API_REVIEWS = '/api/reviews';

  /**
   * Punto de entrada. Llamar después de que state.product esté cargado.
   * @param {Object} product objeto producto del state (con id y name)
   */
  async function loadProductReviews(product) {
    const section = document.getElementById('reviewsSection');
    const grid    = document.getElementById('reviewsGrid');
    const dots    = document.getElementById('reviewsDots');
    if (!section || !grid || !product) return;

    let reviews = [];
    try {
      const resp = await fetch(API_REVIEWS, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:     'list_public',
          product_id: product.id || null,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data && data.ok && Array.isArray(data.reviews)) {
        reviews = data.reviews;
      }
    } catch (err) {
      console.warn('[Founder/reviews-loader] fetch error:', err);
    }

    // Si no hay reseñas aprobadas → ocultar la sección completa.
    // Mejor mostrar nada que reseñas falsas o un carrusel vacío.
    if (!reviews || reviews.length === 0) {
      section.style.display = 'none';
      return;
    }

    // Render de las cards
    grid.innerHTML = reviews.map((r, i) => renderCard(r, i)).join('');

    // Render de los dots — solo si hay 2+ reseñas
    if (dots) {
      if (reviews.length >= 2) {
        dots.innerHTML = reviews.map((_, i) => `
          <button class="reviews-carousel__dot ${i === 0 ? 'is-active' : ''}"
            type="button" aria-label="Reseña ${i+1}" data-idx="${i}"></button>
        `).join('');
      } else {
        dots.innerHTML = '';
      }
    }

    // Mostrar la sección
    section.style.display = '';

    // Inyectar aggregateRating en Schema.org del producto
    injectAggregateRating(reviews);

    // Notificar al carrusel para re-inicializar bindings de dots/flechas
    // (el HTML cambió, los listeners viejos quedaron en cards mock que
    // ya no existen).
    window.dispatchEvent(new CustomEvent('founder-reviews-loaded', {
      detail: { count: reviews.length }
    }));
  }

  function renderCard(r, idx) {
    const rating = parseInt(r.rating, 10) || 5;
    const stars  = '★'.repeat(rating) + '☆'.repeat(5 - rating);

    const fotosArr  = Array.isArray(r.fotos_urls) ? r.fotos_urls.filter(Boolean) : [];
    const fotosHtml = fotosArr.length
      ? `<div class="review-card__photos">
           ${fotosArr.map(url => `
             <a href="${escapeHtml(url)}" target="_blank" rel="noopener"
                class="review-card__photo" aria-label="Ver foto en grande">
               <img src="${escapeHtml(url)}" alt="Foto de la reseña" loading="lazy">
             </a>
           `).join('')}
         </div>`
      : '';

    const location = r.author_location ? escapeHtml(r.author_location) : '';

    return `
      <article class="review-card ${idx === 0 ? 'is-active' : ''}">
        <div class="review-card__stars" aria-label="${rating} de 5 estrellas">${stars}</div>
        <p class="review-card__text">"${escapeHtml(r.texto)}"</p>
        ${fotosHtml}
        <div class="review-card__author">
          <span class="review-card__name">${escapeHtml(r.author_name || 'Cliente Founder')}</span>
          ${location ? `<span class="review-card__location">${location}</span>` : ''}
        </div>
      </article>`;
  }

  /**
   * Actualiza el JSON-LD del producto con aggregateRating.
   * Solo si hay al menos 1 reseña aprobada — Google requiere mínimo
   * un review válido para aceptar el rich snippet.
   */
  function injectAggregateRating(reviews) {
    if (!reviews || reviews.length === 0) return;

    const el = document.getElementById('product-schema');
    if (!el) return;

    let schema;
    try { schema = JSON.parse(el.textContent); }
    catch (_) { return; }

    if (!schema || schema['@type'] !== 'Product') return;

    const sum = reviews.reduce((acc, r) => acc + (parseInt(r.rating, 10) || 0), 0);
    const avg = (sum / reviews.length).toFixed(1);

    schema.aggregateRating = {
      '@type':       'AggregateRating',
      ratingValue:    avg,
      reviewCount:    reviews.length,
      bestRating:    '5',
      worstRating:   '1',
    };

    // Incluir las 4 mejores reseñas como `review` (no todas — Google
    // recomienda no inflar). Ordenamos por rating descendente.
    const top = reviews
      .slice()
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 4);

    schema.review = top.map(r => ({
      '@type':       'Review',
      reviewRating: {
        '@type':     'Rating',
        ratingValue: String(r.rating || 5),
        bestRating: '5',
      },
      author: {
        '@type': 'Person',
        name:    r.author_name || 'Cliente Founder',
      },
      reviewBody: r.texto,
      datePublished: r.created_at
        ? new Date(r.created_at).toISOString().slice(0, 10)
        : undefined,
    }));

    el.textContent = JSON.stringify(schema);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Exponer
  window.loadProductReviews = loadProductReviews;

})();
