/* =============================================================
   FOUNDER — components/founder-admin-reviews.js
   -------------------------------------------------------------
   Panel de moderación de reseñas en el admin (Sesión 38).

   Qué hace:
     • loadReviews()          — carga todas las reseñas + actualiza contadores.
     • filterReviews(estado)  — filtra la vista por estado.
     • renderReviewsList()    — pinta el listado en #reviewsListContainer.
     • approveReview(id)      — cambia estado pendiente/oculta → aprobada.
     • hideReview(id)         — cambia estado aprobada → oculta.
     • deleteReview(id)       — borrado físico (irreversible).
     • viewReviewDetail(id)   — abre modal con foto en grande + datos.
     • loadRewardCouponInfo() — refresca panel superior con el cupón actual.

   Precondiciones:
     - Cargado DESPUÉS de components/founder-admin.js (necesita window.apiAdmin
       y window.toast).
     - Las funciones se exponen al window para usarlas desde onclick inline.
   ============================================================= */
'use strict';

(function () {

  // ── Estado interno ───────────────────────────────────────────
  const state = {
    reviews:       [],       // todas las reseñas cargadas
    currentFilter: 'all',
  };

  // ── Helpers ──────────────────────────────────────────────────
  function $(id)      { return document.getElementById(id); }
  function apiAdmin() { return window.apiAdmin.apply(null, arguments); }
  function toast(m, err) {
    if (typeof window.toast === 'function') window.toast(m, err);
    else console.log('[admin/reviews]', m);
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString('es-UY', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  // ─────────────────────────────────────────────────────────────
  // CARGA INICIAL
  // ─────────────────────────────────────────────────────────────
  async function loadReviews() {
    const container = $('reviewsListContainer');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">
        Cargando reseñas…
      </div>`;

    const { ok, data } = await apiAdmin('list_reviews', {});
    if (!ok) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--red);font-size:13px">
          Error al cargar reseñas${data?.detail ? ': ' + esc(data.detail) : ''}
        </div>`;
      return;
    }

    state.reviews = Array.isArray(data?.reviews) ? data.reviews : [];
    updateCounters();
    renderReviewsList();

    // También refrescar info del cupón de recompensa
    loadRewardCouponInfo();
  }

  function updateCounters() {
    const counts = { pendiente: 0, aprobada: 0, oculta: 0 };
    state.reviews.forEach(r => {
      if (counts[r.estado] != null) counts[r.estado]++;
    });
    const pEl = $('reviewCountPendientes');
    const aEl = $('reviewCountAprobadas');
    const oEl = $('reviewCountOcultas');
    if (pEl) pEl.textContent = String(counts.pendiente);
    if (aEl) aEl.textContent = String(counts.aprobada);
    if (oEl) oEl.textContent = String(counts.oculta);
  }

  // ─────────────────────────────────────────────────────────────
  // FILTRO POR ESTADO
  // ─────────────────────────────────────────────────────────────
  function filterReviews(filter, el) {
    state.currentFilter = filter || 'all';
    // Actualizar UI de botones
    document.querySelectorAll('.review-filter-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.filter === filter);
    });
    renderReviewsList();
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER DEL LISTADO
  // ─────────────────────────────────────────────────────────────
  function renderReviewsList() {
    const container = $('reviewsListContainer');
    if (!container) return;

    const filtered = state.currentFilter === 'all'
      ? state.reviews
      : state.reviews.filter(r => r.estado === state.currentFilter);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--muted);font-size:13px;line-height:1.7">
          ${state.currentFilter === 'all'
            ? 'Todavía no hay reseñas.<br>Cuando tus clientes dejen su primera reseña en la página de seguimiento, aparecerá acá para moderar.'
            : `No hay reseñas con estado "${state.currentFilter}".`}
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(renderCard).join('');
  }

  function renderCard(r) {
    const rating = parseInt(r.rating, 10) || 5;
    const stars  = '★'.repeat(rating) + '☆'.repeat(5 - rating);

    const badgeMap = {
      pendiente: { cls: 'pendiente', label: '⏳ Pendiente' },
      aprobada:  { cls: 'aprobada',  label: '✓ Aprobada' },
      oculta:    { cls: 'oculta',    label: '◌ Oculta' },
    };
    const badge = badgeMap[r.estado] || badgeMap.pendiente;

    const numero = r.orders?.numero || '—';
    const product = r.product_name || 'Founder';
    const color   = r.product_color ? ` · ${esc(r.product_color)}` : '';
    const loc     = r.author_location ? ` · ${esc(r.author_location)}` : '';

    const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls.filter(Boolean) : [];
    const fotosHtml = fotos.length
      ? `<div class="review-admin-card__photos">
           ${fotos.map(url => `
             <div class="review-admin-card__photo" onclick="viewReviewPhoto('${esc(url)}')">
               <img src="${esc(url)}" alt="Foto" loading="lazy">
             </div>
           `).join('')}
         </div>`
      : '';

    // Acciones según estado actual
    let actionsHtml = '';
    if (r.estado === 'pendiente') {
      actionsHtml = `
        <button class="btn btn-primary" onclick="approveReview('${esc(r.id)}')">✓ Aprobar</button>
        <button class="btn btn-secondary" onclick="hideReview('${esc(r.id)}')">◌ Ocultar</button>
        <button class="btn btn-danger" onclick="deleteReviewConfirm('${esc(r.id)}')">🗑️ Eliminar</button>`;
    } else if (r.estado === 'aprobada') {
      actionsHtml = `
        <button class="btn btn-secondary" onclick="hideReview('${esc(r.id)}')">◌ Ocultar</button>
        <button class="btn btn-danger" onclick="deleteReviewConfirm('${esc(r.id)}')">🗑️ Eliminar</button>`;
    } else { // oculta
      actionsHtml = `
        <button class="btn btn-primary" onclick="approveReview('${esc(r.id)}')">✓ Re-aprobar</button>
        <button class="btn btn-danger" onclick="deleteReviewConfirm('${esc(r.id)}')">🗑️ Eliminar</button>`;
    }

    return `
      <div class="review-admin-card">
        <div class="review-admin-card__main">
          <div class="review-admin-card__head">
            <span class="review-admin-card__stars">${stars}</span>
            <span class="review-admin-card__badge review-admin-card__badge--${badge.cls}">
              ${badge.label}
            </span>
          </div>
          <div class="review-admin-card__author">
            ${esc(r.author_name || 'Cliente')}${loc}
          </div>
          <div class="review-admin-card__meta">
            Pedido #${esc(numero)} · ${esc(product)}${color} · ${fmtDate(r.created_at)}
          </div>
          <div class="review-admin-card__text">${esc(r.texto)}</div>
          ${fotosHtml}
        </div>
        <div class="review-admin-card__actions">
          ${actionsHtml}
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────
  // ACCIONES
  // ─────────────────────────────────────────────────────────────
  async function approveReview(id) {
    const { ok, data } = await apiAdmin('update_review_status', { id, estado: 'aprobada' });
    if (!ok) { toast('Error: ' + (data?.detail || data?.error), true); return; }
    // Actualizar local + repintar
    const r = state.reviews.find(x => x.id === id);
    if (r) r.estado = 'aprobada';
    toast('✓ Reseña aprobada — ahora se ve en producto');
    updateCounters();
    renderReviewsList();
  }

  async function hideReview(id) {
    const { ok, data } = await apiAdmin('update_review_status', { id, estado: 'oculta' });
    if (!ok) { toast('Error: ' + (data?.detail || data?.error), true); return; }
    const r = state.reviews.find(x => x.id === id);
    if (r) r.estado = 'oculta';
    toast('◌ Reseña ocultada');
    updateCounters();
    renderReviewsList();
  }

  function deleteReviewConfirm(id) {
    const r = state.reviews.find(x => x.id === id);
    if (!r) return;
    const ok = window.confirm(
      `¿Eliminar la reseña de ${r.author_name}?\n\n` +
      `Esto es IRREVERSIBLE. Las fotos asociadas también se borrarán.\n\n` +
      `(El cupón ya entregado al cliente NO se revoca — sigue válido.)`
    );
    if (!ok) return;
    deleteReview(id);
  }

  async function deleteReview(id) {
    const { ok, data } = await apiAdmin('delete_review', { id, confirm: true });
    if (!ok) { toast('Error al eliminar: ' + (data?.detail || data?.error), true); return; }
    state.reviews = state.reviews.filter(r => r.id !== id);
    toast('🗑️ Reseña eliminada');
    updateCounters();
    renderReviewsList();
  }

  // ─────────────────────────────────────────────────────────────
  // VER FOTO EN GRANDE
  // ─────────────────────────────────────────────────────────────
  function viewReviewPhoto(url) {
    // Versión simple: abrir en nueva pestaña.
    // El bucket es público, así que la URL es directa.
    window.open(url, '_blank', 'noopener');
  }

  // ─────────────────────────────────────────────────────────────
  // INFO DEL CUPÓN DE RECOMPENSA (panel superior)
  // ─────────────────────────────────────────────────────────────
  async function loadRewardCouponInfo() {
    const info = $('rewardCouponInfo');
    if (!info) return;

    // Reusamos list_coupons — el admin ya lo tiene en window.adminState si
    // navegó por cupones antes, pero hacemos fetch fresco para garantizar
    // que esté al día (si el admin acaba de marcar un cupón).
    const { ok, data } = await apiAdmin('list_coupons', {});
    if (!ok) {
      info.innerHTML = `<span style="color:var(--red)">Error al cargar</span>`;
      return;
    }

    const coupons = Array.isArray(data?.coupons) ? data.coupons : [];
    const reward  = coupons.find(c => c.es_recompensa_resena === true && c.activo === true);

    if (!reward) {
      info.innerHTML = `
        <span style="color:var(--muted)">
          ⚠️ Ningún cupón está marcado como recompensa por reseña actualmente.<br>
          Las reseñas nuevas no entregarán cupón automáticamente hasta que configures uno.
        </span>`;
      return;
    }

    const valorTxt = reward.tipo === 'porcentaje'
      ? `${reward.valor}% de descuento`
      : `$${reward.valor} de descuento`;

    info.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-family:'Courier New',monospace;font-size:18px;color:var(--gold);letter-spacing:2px;
                     background:var(--mid);border:1px dashed var(--gold);padding:8px 14px;font-weight:700">
          ${esc(reward.codigo)}
        </span>
        <span style="color:var(--text);font-size:13px">
          ${esc(valorTxt)} · uso: ${esc(reward.uso)}
        </span>
        <span style="font-size:11px;color:var(--gold);letter-spacing:1px">
          ⭐ ACTIVO COMO RECOMPENSA
        </span>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────
  // Exponer al window
  // ─────────────────────────────────────────────────────────────
  window.loadReviews          = loadReviews;
  window.filterReviews        = filterReviews;
  window.approveReview        = approveReview;
  window.hideReview           = hideReview;
  window.deleteReviewConfirm  = deleteReviewConfirm;
  window.viewReviewPhoto      = viewReviewPhoto;
  window.loadRewardCouponInfo = loadRewardCouponInfo;

})();
