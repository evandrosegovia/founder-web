/* =============================================================
   FOUNDER — components/founder-reviews.js
   -------------------------------------------------------------
   Bloque de reseñas en seguimiento.html (Sesión 38).

   Qué hace:
     • renderReviewBlock(pedido) — punto de entrada. Recibe el pedido
       resultante de /api/seguimiento y decide qué mostrar:
         - Si estado !== 'Entregado': nada (el bloque queda oculto).
         - Si ya tiene reseña: muestra la reseña + cupón ganado.
         - Si no tiene reseña: muestra el formulario.
     • Manejo de estrellas (click + hover).
     • Subida de hasta 3 fotos al bucket público vía URL firmada.
     • Envío de la reseña a POST /api/reviews (action=create).
     • Render del estado post-reseña (mensaje + cupón en tarjeta dorada).

   Precondiciones:
     - Cargado DESPUÉS de components/cart.js (necesita window.showToast).
     - El DOM de seguimiento.html ya debe estar presente.

   API endpoint usado:
     POST /api/reviews con action ∈ { get, get_upload_url, create }.
   ============================================================= */
'use strict';

(function () {

  // ── CONFIG ───────────────────────────────────────────────────
  const API_REVIEWS = '/api/reviews';
  const MAX_FOTOS   = 3;
  const MAX_TEXTO   = 1000;
  const MIN_TEXTO   = 10;

  // ── Estado interno del formulario ────────────────────────────
  // Se resetea cada vez que se renderiza el bloque para un pedido nuevo.
  const state = {
    pedido:        null,    // ref al objeto pedido (para order_id, email)
    rating:        0,       // 1-5, 0 = no seleccionado
    fotos:         [],      // { publicUrl, path, previewUrl }
    submitting:    false,
  };

  // ── Helpers ──────────────────────────────────────────────────
  function $(sel)         { return document.querySelector(sel); }
  function $$(sel)        { return Array.from(document.querySelectorAll(sel)); }

  // Sesión 38: toast self-contained.
  // `window.showToast` solo existe en checkout/producto.html (declarado en
  // founder-checkout.js). En seguimiento.html ese helper no está cargado,
  // así que las notificaciones de errores (foto >5MB, etc.) fallaban
  // silenciosamente. Implementamos nuestro propio mini-toast inline.
  let _toastTimer = null;
  function toast(msg, kind) {
    // Si hay showToast global, lo usamos (mantiene consistencia visual con
    // el resto del sitio cuando está disponible).
    if (typeof window.showToast === 'function') {
      window.showToast(msg, kind || 'success');
      return;
    }
    // Fallback: toast self-contained inyectado en el DOM.
    let el = document.getElementById('reviewToastFallback');
    if (!el) {
      el = document.createElement('div');
      el.id = 'reviewToastFallback';
      el.setAttribute('role', 'alert');
      el.style.cssText = [
        'position:fixed', 'bottom:24px', 'left:50%',
        'transform:translateX(-50%)', 'padding:14px 22px',
        'background:#222', 'color:#f8f8f4',
        'border:1px solid #2e2e2e', 'border-radius:3px',
        'font-family:Montserrat,sans-serif', 'font-size:13px',
        'letter-spacing:0.3px', 'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
        'z-index:9999', 'max-width:90%', 'text-align:center',
        'opacity:0', 'transition:opacity 0.2s ease',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
    }
    // Color del borde según kind
    el.style.borderLeftWidth = '3px';
    el.style.borderLeftColor =
      kind === 'error' ? '#e05555' :
      kind === 'info'  ? '#c9a96e' :
                         '#4caf82';
    el.textContent = msg;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.style.opacity = '0';
    }, kind === 'error' ? 4500 : 3000);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Render principal — entrada pública ───────────────────────
  async function renderReviewBlock(pedido) {
    const container = $('#reviewBlockContainer');
    if (!container) return;

    // Reset
    container.innerHTML = '';
    container.style.display = 'none';
    state.pedido = pedido;
    state.rating = 0;
    state.fotos  = [];
    state.submitting = false;

    if (!pedido || !pedido.id || !pedido.email) return;
    if (pedido.estado !== 'Entregado') return;

    // Consultar si ya tiene reseña
    let existing = null;
    try {
      const resp = await fetch(API_REVIEWS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:   'get',
          order_id: pedido.id,
          email:    pedido.email,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data && data.ok && data.review) existing = data.review;
    } catch (e) {
      console.warn('[Founder/reviews] error fetch:', e);
      // Si falla, mostramos el formulario igual (el cliente podría reintentar)
    }

    container.style.display = 'block';

    if (existing) {
      container.innerHTML = renderExistingReview(existing);
    } else {
      container.innerHTML = renderForm();
      attachFormListeners();
    }
  }

  // ── HTML: reseña ya enviada ──────────────────────────────────
  function renderExistingReview(review) {
    const rating = parseInt(review.rating, 10) || 5;
    const stars  = '★'.repeat(rating) + '☆'.repeat(5 - rating);

    const estadoMap = {
      pendiente: { label: '✨ En revisión',  hint: 'Tu reseña está siendo revisada por nuestro equipo. Suele tardar menos de 24 horas.' },
      aprobada:  { label: '✓ Publicada',     hint: '¡Tu reseña está visible en la página del producto. Gracias!' },
      oculta:    { label: '◌ Oculta',        hint: 'Tu reseña no está visible públicamente.' },
    };
    const cfg = estadoMap[review.estado] || estadoMap.pendiente;

    let rewardBlock = '';
    if (review.reward_coupon_codigo) {
      rewardBlock = `
        <div class="review-card-reward">
          <div class="review-card-reward__label">✨ Tu cupón de recompensa</div>
          <div class="review-card-reward__code" id="reviewRewardCode">${escapeHtml(review.reward_coupon_codigo)}</div>
          <button class="review-card-reward__btn" type="button" onclick="copyReviewRewardCode()">Copiar código</button>
          <div class="review-card-reward__hint">Usalo en tu próxima compra al hacer el checkout.</div>
        </div>`;
    }

    return `
      <div class="review-card-done">
        <div class="review-card-done__head">
          <div class="review-card-done__eyebrow">${escapeHtml(cfg.label)}</div>
          <div class="review-card-done__title">¡Gracias por tu reseña!</div>
        </div>
        <div class="review-card-done__stars">${stars}</div>
        <p class="review-card-done__text">"${escapeHtml(review.texto)}"</p>
        <div class="review-card-done__hint">${escapeHtml(cfg.hint)}</div>
        ${rewardBlock}
      </div>`;
  }

  // ── HTML: formulario ─────────────────────────────────────────
  function renderForm() {
    return `
      <div class="review-form">
        <div class="review-form__head">
          <div class="review-form__eyebrow">¿Te gustó tu Founder?</div>
          <div class="review-form__title">Contale a otros tu experiencia</div>
          <div class="review-form__subtitle">
            Tu reseña ayuda a futuros clientes a elegir mejor.
            Al enviarla te regalamos un cupón de descuento para tu próxima compra.
          </div>
        </div>

        <div class="review-form__field">
          <label class="review-form__label">Tu calificación</label>
          <div class="review-stars" id="reviewStars" role="radiogroup" aria-label="Calificación">
            ${[1,2,3,4,5].map(n => `
              <button type="button" class="review-star" data-rating="${n}"
                role="radio" aria-checked="false" aria-label="${n} estrellas">★</button>
            `).join('')}
          </div>
          <div class="review-form__hint" id="reviewRatingHint">Tocá las estrellas para calificar</div>
        </div>

        <div class="review-form__field">
          <label class="review-form__label" for="reviewTexto">Tu opinión</label>
          <textarea id="reviewTexto" class="review-form__textarea"
            maxlength="${MAX_TEXTO}" minlength="${MIN_TEXTO}"
            placeholder="¿Qué te gustó? ¿Cómo la usás en el día a día? Tu experiencia ayuda a otros clientes."
            rows="5"></textarea>
          <div class="review-form__counter">
            <span id="reviewTextoCount">0</span> / ${MAX_TEXTO} caracteres
          </div>
        </div>

        <div class="review-form__field">
          <label class="review-form__label">
            Tu ciudad <span class="review-form__optional">(opcional)</span>
          </label>
          <input id="reviewLocation" class="review-form__input"
            type="text" maxlength="60" placeholder="Ej: Montevideo">
        </div>

        <div class="review-form__field">
          <label class="review-form__label">
            Fotos <span class="review-form__optional">(opcional — hasta ${MAX_FOTOS})</span>
          </label>
          <div class="review-photos">
            <div class="review-photos__grid" id="reviewPhotosGrid"></div>
            <label class="review-photos__btn" id="reviewPhotosBtn">
              <input type="file" accept="image/jpeg,image/png,image/webp"
                id="reviewPhotosInput" multiple style="display:none">
              <span>+ Agregar foto</span>
            </label>
          </div>
          <div class="review-form__hint">
            Al subir fotos aceptás que se muestren públicamente junto a tu reseña.
            JPG, PNG o WEBP. Máximo 5 MB cada una.
          </div>
        </div>

        <button type="button" class="review-form__submit" id="reviewSubmitBtn"
          onclick="submitReview()">
          Enviar mi reseña
        </button>

        <div class="review-form__terms">
          Al enviar aceptás nuestros
          <a href="/contacto.html" target="_blank" rel="noopener">términos y políticas</a>.
          Tu reseña será revisada antes de publicarse.
        </div>
      </div>`;
  }

  // ── Event listeners del formulario ───────────────────────────
  function attachFormListeners() {
    // Estrellas
    $$('#reviewStars .review-star').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.rating, 10);
        setRating(n);
      });
      btn.addEventListener('mouseenter', () => {
        previewRating(parseInt(btn.dataset.rating, 10));
      });
    });
    const starsWrap = $('#reviewStars');
    if (starsWrap) {
      starsWrap.addEventListener('mouseleave', () => previewRating(state.rating));
    }

    // Contador de caracteres
    const textarea = $('#reviewTexto');
    const counter  = $('#reviewTextoCount');
    if (textarea && counter) {
      textarea.addEventListener('input', () => {
        counter.textContent = String(textarea.value.length);
      });
    }

    // Upload de fotos
    const input = $('#reviewPhotosInput');
    if (input) {
      input.addEventListener('change', handlePhotoSelection);
    }
  }

  function setRating(n) {
    state.rating = n;
    updateStarsUI(n);
    const hint = $('#reviewRatingHint');
    if (hint) {
      const labels = ['','😐 Mejorable','🙂 Regular','😊 Buena','😄 Muy buena','🤩 Excelente'];
      hint.textContent = labels[n] || 'Tocá las estrellas para calificar';
    }
  }

  function previewRating(n) {
    updateStarsUI(n);
  }

  function updateStarsUI(n) {
    $$('#reviewStars .review-star').forEach(btn => {
      const i = parseInt(btn.dataset.rating, 10);
      const active = i <= n;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  // ── Manejo de fotos ──────────────────────────────────────────
  async function handlePhotoSelection(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite re-seleccionar el mismo archivo

    if (files.length === 0) return;

    const slotsLeft = MAX_FOTOS - state.fotos.length;
    if (slotsLeft <= 0) {
      toast(`Máximo ${MAX_FOTOS} fotos`, 'error');
      return;
    }

    const toUpload = files.slice(0, slotsLeft);
    if (files.length > slotsLeft) {
      toast(`Solo se agregarán ${slotsLeft} fotos (límite ${MAX_FOTOS})`, 'info');
    }

    for (const file of toUpload) {
      // Validar tipo y tamaño
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
        toast(`"${file.name}" no es válido. Usá JPG, PNG o WEBP.`, 'error');
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        toast(`Foto demasiado pesada (${mb} MB). Máximo 5 MB.`, 'error');
        continue;
      }
      await uploadOnePhoto(file);
    }
  }

  async function uploadOnePhoto(file) {
    // Crear placeholder con preview local
    const previewUrl = URL.createObjectURL(file);
    const placeholder = { previewUrl, status: 'uploading', file };
    state.fotos.push(placeholder);
    renderPhotosGrid();

    try {
      // 1) Pedir URL firmada
      const r1 = await fetch(API_REVIEWS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:   'get_upload_url',
          filename: file.name,
          mime:     file.type,
        }),
      });
      const d1 = await r1.json();
      if (!d1.ok) throw new Error(d1.detail || d1.error || 'upload_url_failed');

      // 2) PUT directo a Supabase Storage con la URL firmada
      const r2 = await fetch(d1.uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      });
      if (!r2.ok) throw new Error('storage_put_failed');

      // 3) Marcar la foto como lista (guardar URL pública)
      placeholder.publicUrl = d1.publicUrl;
      placeholder.path      = d1.path;
      placeholder.status    = 'ready';
      renderPhotosGrid();

    } catch (err) {
      console.error('[Founder/reviews] upload error:', err);
      // Sacar la foto fallida del array
      const idx = state.fotos.indexOf(placeholder);
      if (idx !== -1) state.fotos.splice(idx, 1);
      renderPhotosGrid();
      toast('No pudimos subir esa foto. Intentá de nuevo.', 'error');
    }
  }

  function renderPhotosGrid() {
    const grid = $('#reviewPhotosGrid');
    if (!grid) return;

    grid.innerHTML = state.fotos.map((p, i) => `
      <div class="review-photo-thumb ${p.status === 'uploading' ? 'is-loading' : ''}">
        <img src="${escapeHtml(p.previewUrl)}" alt="Foto ${i+1}">
        ${p.status === 'uploading'
          ? '<div class="review-photo-thumb__loader">Subiendo…</div>'
          : `<button type="button" class="review-photo-thumb__remove"
              onclick="removeReviewPhoto(${i})" aria-label="Eliminar foto">✕</button>`
        }
      </div>
    `).join('');

    // Mostrar/ocultar botón "agregar" según haya slots
    const btn = $('#reviewPhotosBtn');
    if (btn) btn.style.display = state.fotos.length >= MAX_FOTOS ? 'none' : '';
  }

  function removeReviewPhoto(idx) {
    if (idx < 0 || idx >= state.fotos.length) return;
    const photo = state.fotos[idx];
    // Revoke object URL para liberar memoria
    try { URL.revokeObjectURL(photo.previewUrl); } catch (_) {}
    state.fotos.splice(idx, 1);
    renderPhotosGrid();
  }

  // ── Envío final ──────────────────────────────────────────────
  async function submitReview() {
    if (state.submitting) return;

    // Validaciones
    if (!state.rating || state.rating < 1 || state.rating > 5) {
      toast('Tocá las estrellas para calificar', 'error');
      return;
    }
    const texto = ($('#reviewTexto')?.value || '').trim();
    if (texto.length < MIN_TEXTO) {
      toast(`Escribí al menos ${MIN_TEXTO} caracteres`, 'error');
      return;
    }
    if (texto.length > MAX_TEXTO) {
      toast(`Máximo ${MAX_TEXTO} caracteres`, 'error');
      return;
    }

    // Verificar que todas las fotos terminaron de subir
    const uploading = state.fotos.some(p => p.status === 'uploading');
    if (uploading) {
      toast('Esperá que terminen de subir las fotos', 'error');
      return;
    }

    const location = ($('#reviewLocation')?.value || '').trim();
    const fotos_urls = state.fotos
      .filter(p => p.status === 'ready' && p.publicUrl)
      .map(p => p.publicUrl);

    // UI de envío
    state.submitting = true;
    const btn = $('#reviewSubmitBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Enviando…';
    }

    try {
      const resp = await fetch(API_REVIEWS, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:          'create',
          order_id:        state.pedido.id,
          email:           state.pedido.email,
          rating:          state.rating,
          texto,
          fotos_urls,
          author_location: location,
        }),
      });
      const data = await resp.json();

      if (!data.ok) {
        const msg = data.detail || mapErrorMsg(data.error) ||
                    'No pudimos guardar tu reseña. Intentá de nuevo.';
        toast(msg, 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Enviar mi reseña';
        }
        state.submitting = false;
        return;
      }

      // Éxito: re-render con la reseña recién creada
      toast('¡Gracias por tu reseña!', 'success');

      // Construir objeto review localmente para mostrar sin nuevo fetch
      const newReview = {
        rating: state.rating,
        texto,
        estado: 'pendiente',
        reward_coupon_codigo: data.reward_coupon?.codigo || null,
      };
      const container = $('#reviewBlockContainer');
      if (container) {
        container.innerHTML = renderExistingReview(newReview);
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

    } catch (err) {
      console.error('[Founder/reviews] submit error:', err);
      toast('Error al enviar. Revisá tu conexión.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Enviar mi reseña';
      }
      state.submitting = false;
    }
  }

  function mapErrorMsg(code) {
    const map = {
      rating_invalid:       'La calificación debe ser de 1 a 5 estrellas.',
      texto_too_short:      `Escribí al menos ${MIN_TEXTO} caracteres.`,
      texto_too_long:       `Máximo ${MAX_TEXTO} caracteres.`,
      fotos_too_many:       `Máximo ${MAX_FOTOS} fotos.`,
      order_not_found:      'No encontramos tu pedido.',
      order_not_delivered:  'Solo podés dejar reseña cuando el pedido figure como entregado.',
      already_reviewed:     'Ya dejaste una reseña para este pedido.',
      rate_limited:         'Muchos intentos seguidos. Esperá un rato.',
    };
    return map[code] || null;
  }

  // ── Helper exportado: copiar el código del cupón ────────────
  function copyReviewRewardCode() {
    const el = document.getElementById('reviewRewardCode');
    if (!el) return;
    const code = el.textContent.trim();
    if (!code) return;

    // Intentar Clipboard API; fallback a execCommand
    const doToast = () => toast(`Copiado: ${code}`, 'success');
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(doToast).catch(doToast);
        return;
      }
    } catch (_) {}

    try {
      const tmp = document.createElement('textarea');
      tmp.value = code;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      doToast();
    } catch (_) {
      doToast();
    }
  }

  // ── Exponer al global window ────────────────────────────────
  window.renderReviewBlock     = renderReviewBlock;
  window.submitReview          = submitReview;
  window.removeReviewPhoto     = removeReviewPhoto;
  window.copyReviewRewardCode  = copyReviewRewardCode;

})();
