/* =============================================================
   FOUNDER — Componente compartido: PANEL DE PERSONALIZACIÓN
   en burbuja modal (Sesión 53 Bloque 3)
   -------------------------------------------------------------
   Responsabilidades:
   1) Renderizar un modal flotante con: selector de color (opcional) +
      panel de personalización láser (4 opciones, uploads, texto,
      indicaciones, avisos legales).
   2) Manejar uploads contra /api/upload-personalizacion (mismo endpoint
      que el bloque láser de producto.html — autenticación, validaciones
      y bucket idénticos).
   3) Devolver al caller un payload final con: color elegido + objeto
      `personalizacion` listo para guardar en el item del carrito.

   Diseño:
   - Namespace CSS propio (.lp-bubble-*) para no colisionar con
     .laser-* de producto.html.
   - Estado interno aislado (lpBubbleState) — no toca state de ninguna
     página.
   - API pública: window.founderLaserPanel.open({...}) abre el modal.
     El caller pasa un callback onConfirm(payload) que se invoca al
     "Confirmar y agregar".
   - Endpoint compartido con producto.html → consistente para el admin
     que descarga las imágenes.

   API pública:
     window.founderLaserPanel = {
       open(opts) → abre el modal. opts:
         - product:    { name, colors:[{name,hex,css}], permite_grabado_* }
         - colorName:  nombre del color preseleccionado (string)
         - allowColorChange: bool — si false, oculta el selector de colores
         - config:     personalizacion_config (de fetchPersonalizacionConfig)
         - title:      string — título del modal (ej: "Llevá otra a 25% OFF")
         - subtitle:   string opcional para subtitulo (ej: "$2.085 + extras")
         - basePrice:  número — precio base ya descontado (sin extras laser)
         - onConfirm:  fn(payload) — payload = { colorName, personalizacion }
         - onCancel:   fn() opcional — cuando el cliente cierra
       close() → cierra el modal sin guardar.
     }
   ============================================================= */
(function () {
  'use strict';

  // ── Estado interno aislado ────────────────────────────────────
  const state = {
    open:        false,
    product:     null,
    config:      null,
    allowColorChange: true,
    onConfirm:   null,
    onCancel:    null,
    basePrice:   0,
    selectedColor: null,  // { name, hex, css }
    selected:    { adelante: false, interior: false, atras: false, texto: false },
    texto:       '',
    indicaciones:'',
    uploads:     { adelante: null, interior: null, atras: null },
    confirmLabel:'Agregar al carrito',
  };

  // ── Fallback COLOR_MAP autosuficiente ───────────────────────
  // Mismas claves que index/producto.html. Si la página activa expone
  // `window.FOUNDER_COLOR_MAP` (index y producto sí), usamos ese — gana
  // por tener `css: 'var(--swatch-X)'` que respeta los tokens de CSS.
  // Si no (páginas secundarias como contacto/envios), usamos el fallback
  // local que tiene solo `hex` — sigue funcional, solo un poco menos
  // refinado visualmente.
  const FALLBACK_COLOR_MAP = {
    'Negro':       { hex: '#3a3f4a' },
    'Camel':       { hex: '#d4a96e' },
    'Marrón':      { hex: '#6b3820' },
    'Gris Oscuro': { hex: '#6a6a7a' },
    'Azul':        { hex: '#2a5a8c' },
    'Rosa':        { hex: '#e8b8b8' },
    'Rojo':        { hex: '#b52a2a' },
    'Crema':       { hex: '#e4d8b8' },
    'Carbon':      { hex: '#3a3a3a' },
    'Verde Oliva': { hex: '#6a7a3a' },
  };

  function getColorVisualMap() {
    return (typeof window !== 'undefined' && window.FOUNDER_COLOR_MAP)
      ? window.FOUNDER_COLOR_MAP
      : FALLBACK_COLOR_MAP;
  }

  // ── Constantes ──────────────────────────────────────────────
  const MODAL_ID  = 'lpBubbleModal';
  const STYLE_ID  = 'lp-bubble-css';

  const TIPO_LABELS = {
    adelante: 'Adelante',
    interior: 'Interior',
    atras:    'Atrás',
    texto:    'Texto',
  };

  const TIPO_ICONS = {
    adelante: '🖼️',
    interior: '📐',
    atras:    '🔖',
    texto:    '✍️',
  };

  // ── Helpers ─────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-UY', { maximumFractionDigits: 0 });
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(new Error('No se pudo leer el archivo'));
      r.readAsDataURL(file);
    });
  }

  function getImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudieron leer las dimensiones'));
      };
      img.src = url;
    });
  }

  // ── CSS del componente (namespace lp-bubble-) ─────────────────
  // El admin usa `--gold` y el público `--color-gold`. Definimos
  // localmente fallback para que el componente funcione en cualquier
  // contexto que cargue el componente.
  const COMPONENT_CSS = `
.lp-bubble-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.78);
  z-index: 10000;
  display: none;
  align-items: flex-start;
  justify-content: center;
  padding: 5vh 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.lp-bubble-overlay.is-open { display: flex; }
.lp-bubble-modal {
  background: var(--color-surface, #1a1a1a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  border-radius: 4px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lp-bubble-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border-solid, rgba(255,255,255,0.08));
}
.lp-bubble-head__txt { flex: 1; min-width: 0; }
.lp-bubble-head__title {
  font-family: var(--font-serif, 'Cormorant Garamond', serif);
  color: var(--color-gold, #c9a96e);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0.5px;
  line-height: 1.2;
  margin-bottom: 4px;
}
.lp-bubble-head__sub {
  font-size: 11px;
  color: var(--color-muted, #888);
  letter-spacing: 1px;
  text-transform: uppercase;
  line-height: 1.4;
}
.lp-bubble-head__close {
  background: none;
  border: none;
  color: var(--color-muted, #888);
  font-size: 22px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.lp-bubble-head__close:hover { color: var(--color-text, #fff); }

.lp-bubble-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
}

/* ── Selector de color ──────────────────────────────────────── */
.lp-bubble-section {
  margin-bottom: 18px;
}
.lp-bubble-section__label {
  font-size: 10px;
  color: var(--color-muted, #888);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.lp-bubble-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lp-bubble-color {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 6px;
  background: var(--color-surface2, #2a2a2a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text, #ddd);
  letter-spacing: 0.5px;
  transition: border-color .2s, background .2s;
}
.lp-bubble-color:hover { border-color: rgba(201,169,110,0.4); }
.lp-bubble-color.is-selected {
  border-color: var(--color-gold, #c9a96e);
  background: rgba(201,169,110,0.08);
  color: var(--color-gold, #c9a96e);
}
.lp-bubble-color__chip {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.15);
  flex-shrink: 0;
}

/* ── Toggle activar personalización ────────────────────────── */
.lp-bubble-master {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-surface2, #2a2a2a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  border-radius: 3px;
  cursor: pointer;
  margin-bottom: 14px;
  transition: border-color .2s;
}
.lp-bubble-master:hover { border-color: rgba(201,169,110,0.4); }
.lp-bubble-master__txt { flex: 1; }
.lp-bubble-master__title {
  font-size: 12px;
  color: var(--color-text, #fff);
  letter-spacing: 0.5px;
  line-height: 1.3;
}
.lp-bubble-master__sub {
  font-size: 10px;
  color: var(--color-muted, #888);
  line-height: 1.4;
  margin-top: 2px;
}
.lp-bubble-switch {
  width: 38px;
  height: 22px;
  background: rgba(255,255,255,0.15);
  border-radius: 11px;
  position: relative;
  transition: background .2s;
  flex-shrink: 0;
}
.lp-bubble-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform .2s;
}
.lp-bubble-master.is-on .lp-bubble-switch { background: var(--color-gold, #c9a96e); }
.lp-bubble-master.is-on .lp-bubble-switch::after {
  transform: translateX(16px);
  background: var(--color-bg, #0a0a0a);
}

/* ── Bloque de personalización (visible cuando master is-on) ── */
.lp-bubble-pers {
  display: none;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.06);
  margin-top: 8px;
}
.lp-bubble-pers.is-visible { display: block; }

.lp-bubble-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.lp-bubble-option {
  background: var(--color-surface2, #2a2a2a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  padding: 10px;
  cursor: pointer;
  transition: border-color .2s, background .2s;
  text-align: left;
  font-family: inherit;
  color: var(--color-text, #ddd);
  border-radius: 2px;
}
.lp-bubble-option:hover { border-color: rgba(201,169,110,0.4); }
.lp-bubble-option.is-selected {
  border-color: var(--color-gold, #c9a96e);
  background: rgba(201,169,110,0.08);
}
.lp-bubble-option__icon { font-size: 18px; display: block; margin-bottom: 4px; }
.lp-bubble-option__name {
  font-size: 11px;
  color: var(--color-text, #fff);
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}
.lp-bubble-option.is-selected .lp-bubble-option__name { color: var(--color-gold, #c9a96e); }
.lp-bubble-option__price {
  font-size: 9px;
  color: var(--color-muted, #888);
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* ── Uploads ──────────────────────────────────────────────── */
.lp-bubble-uploads:empty { display: none; }
.lp-bubble-upload {
  background: var(--color-surface2, #2a2a2a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 2px;
}
.lp-bubble-upload__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.lp-bubble-upload__label {
  font-size: 10px;
  color: var(--color-gold, #c9a96e);
  letter-spacing: 1px;
  text-transform: uppercase;
}
.lp-bubble-upload__btn {
  background: transparent;
  border: 1px solid rgba(201,169,110,0.4);
  color: var(--color-gold, #c9a96e);
  padding: 4px 8px;
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px;
  font-family: inherit;
}
.lp-bubble-upload__btn:hover { background: rgba(201,169,110,0.1); }
.lp-bubble-upload__body {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--color-text, #ddd);
}
.lp-bubble-upload__preview {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 2px;
  background: rgba(255,255,255,0.05);
}
.lp-bubble-upload__status {
  font-size: 10px;
  color: var(--color-muted, #888);
  letter-spacing: 0.5px;
}
.lp-bubble-upload__status.is-uploading { color: var(--color-gold, #c9a96e); }
.lp-bubble-upload__status.is-ready { color: #2dd47e; }
.lp-bubble-upload__status.is-error { color: #ff5a4e; }
.lp-bubble-upload__rm {
  background: none;
  border: none;
  color: var(--color-muted, #888);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  margin-left: auto;
}
.lp-bubble-upload__rm:hover { color: #ff5a4e; }

/* ── Texto + counter ──────────────────────────────────────── */
.lp-bubble-text {
  display: none;
  margin-bottom: 12px;
}
.lp-bubble-text.is-visible { display: block; }
.lp-bubble-text__field {
  width: 100%;
  background: var(--color-surface2, #2a2a2a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  color: var(--color-text, #fff);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  border-radius: 2px;
}
.lp-bubble-text__field:focus {
  outline: none;
  border-color: var(--color-gold, #c9a96e);
}
.lp-bubble-text__counter {
  font-size: 9px;
  color: var(--color-muted, #888);
  letter-spacing: 0.5px;
  margin-top: 4px;
  text-align: right;
}

/* ── Indicaciones ─────────────────────────────────────────── */
.lp-bubble-indic {
  display: none;
  margin-bottom: 12px;
}
.lp-bubble-indic.is-visible { display: block; }
.lp-bubble-indic__label {
  font-size: 10px;
  color: var(--color-muted, #888);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 5px;
}
.lp-bubble-indic__field {
  width: 100%;
  background: var(--color-surface2, #2a2a2a);
  border: 1px solid var(--color-border-solid, rgba(255,255,255,0.1));
  color: var(--color-text, #fff);
  padding: 9px 12px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  border-radius: 2px;
}
.lp-bubble-indic__field:focus {
  outline: none;
  border-color: var(--color-gold, #c9a96e);
}

/* ── Avisos legales ───────────────────────────────────────── */
.lp-bubble-warnings {
  display: none;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-muted, #888);
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  padding: 10px 12px;
  border-radius: 2px;
}
.lp-bubble-warnings.is-visible { display: block; }
.lp-bubble-warnings__item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.lp-bubble-warnings__item + .lp-bubble-warnings__item { margin-top: 4px; }
.lp-bubble-warnings__icon {
  color: var(--color-gold, #c9a96e);
  flex-shrink: 0;
}

/* ── Footer (resumen + botón confirmar) ───────────────────── */
.lp-bubble-foot {
  padding: 14px 18px;
  border-top: 1px solid var(--color-border-solid, rgba(255,255,255,0.08));
  background: var(--color-surface, #1a1a1a);
}
.lp-bubble-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--color-muted, #888);
  letter-spacing: 0.5px;
}
.lp-bubble-summary__amount {
  font-size: 16px;
  color: var(--color-gold, #c9a96e);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.lp-bubble-confirm {
  width: 100%;
  background: var(--color-text, #fff);
  color: var(--color-bg, #0a0a0a);
  border: none;
  padding: 14px;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background .2s;
  border-radius: 2px;
}
.lp-bubble-confirm:hover:not(:disabled) { background: var(--color-gold, #c9a96e); }
.lp-bubble-confirm:disabled {
  background: var(--color-surface2, #2a2a2a);
  color: var(--color-muted, #888);
  cursor: not-allowed;
}
`;

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = COMPONENT_CSS;
    document.head.appendChild(style);
  }

  // ── Construcción del modal ─────────────────────────────────
  function buildModal() {
    injectCSS();
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'lp-bubble-overlay';
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('role', 'dialog');
    modal.innerHTML = `
      <div class="lp-bubble-modal">
        <div class="lp-bubble-head">
          <div class="lp-bubble-head__txt">
            <div class="lp-bubble-head__title" id="lpBubbleTitle"></div>
            <div class="lp-bubble-head__sub" id="lpBubbleSub"></div>
          </div>
          <button class="lp-bubble-head__close" aria-label="Cerrar" id="lpBubbleClose">✕</button>
        </div>

        <div class="lp-bubble-body">

          <div class="lp-bubble-section" id="lpBubbleColorsSection">
            <div class="lp-bubble-section__label">Color</div>
            <div class="lp-bubble-colors" id="lpBubbleColors"></div>
          </div>

          <div class="lp-bubble-master" id="lpBubbleMaster" role="button" tabindex="0" aria-pressed="false">
            <div class="lp-bubble-master__txt">
              <div class="lp-bubble-master__title">Personalizar con grabado láser</div>
              <div class="lp-bubble-master__sub" id="lpBubbleMasterSub">Sumá +24 hs y elegí qué grabar</div>
            </div>
            <div class="lp-bubble-switch" aria-hidden="true"></div>
          </div>

          <div class="lp-bubble-pers" id="lpBubblePers">
            <div class="lp-bubble-options" id="lpBubbleOptions"></div>

            <div class="lp-bubble-uploads" id="lpBubbleUploads"></div>

            <div class="lp-bubble-text" id="lpBubbleTextWrap">
              <input type="text" class="lp-bubble-text__field" id="lpBubbleTextField" maxlength="40" placeholder="Ej: Juan, 2026, ANV..." autocomplete="off">
              <div class="lp-bubble-text__counter">
                <span id="lpBubbleTextCount">0</span> / <span id="lpBubbleTextMax">40</span> caracteres
              </div>
            </div>

            <div class="lp-bubble-indic" id="lpBubbleIndicWrap">
              <div class="lp-bubble-indic__label">Indicaciones (opcional)</div>
              <textarea class="lp-bubble-indic__field" id="lpBubbleIndicField" maxlength="300" rows="2"
                placeholder="Ej: centrar lo más posible, tamaño grande, color del relleno..."></textarea>
            </div>

            <div class="lp-bubble-warnings" id="lpBubbleWarnings">
              <div class="lp-bubble-warnings__item">
                <span class="lp-bubble-warnings__icon">⏳</span>
                <span id="lpBubbleWarnTime"></span>
              </div>
              <div class="lp-bubble-warnings__item">
                <span class="lp-bubble-warnings__icon">⚠</span>
                <span id="lpBubbleWarnReturn"></span>
              </div>
              <div class="lp-bubble-warnings__item">
                <span class="lp-bubble-warnings__icon">©</span>
                <span id="lpBubbleWarnCopy"></span>
              </div>
            </div>
          </div>
        </div>

        <div class="lp-bubble-foot">
          <div class="lp-bubble-summary">
            <span>Total</span>
            <span class="lp-bubble-summary__amount" id="lpBubbleTotal">$0</span>
          </div>
          <button class="lp-bubble-confirm" id="lpBubbleConfirm">Agregar al carrito</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // ── Listeners (registrados UNA sola vez sobre el modal vivo) ──
    $('lpBubbleClose').addEventListener('click', cancel);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cancel();  // click en overlay
    });
    $('lpBubbleMaster').addEventListener('click', toggleMaster);
    $('lpBubbleMaster').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMaster(); }
    });
    $('lpBubbleTextField').addEventListener('input', onTextInput);
    $('lpBubbleIndicField').addEventListener('input', onIndicInput);
    $('lpBubbleConfirm').addEventListener('click', confirm);

    return modal;
  }

  // ── Render dinámico de cada sección ────────────────────────
  function renderColors() {
    const wrap = $('lpBubbleColorsSection');
    if (!wrap) return;
    if (!state.allowColorChange) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    const list = $('lpBubbleColors');
    const colors = state.product?.colors || [];
    // Excluir colores agotados (extras.colores_estado[name] === 'sin_stock')
    const estados = state.product?.extras?.colores_estado || {};
    const disponibles = colors.filter(c => estados[c.name] !== 'sin_stock');
    // Resolver visual de cada color: prioridad al `css` del COLOR_MAP de la
    // página (si tiene var(--swatch-X)), fallback al `hex` del propio color,
    // fallback final al hex del FALLBACK_COLOR_MAP.
    const visualMap = getColorVisualMap();
    list.innerHTML = disponibles.map(c => {
      const isSel = state.selectedColor?.name === c.name;
      const visual = visualMap[c.name] || {};
      const swatch = c.css || visual.css || c.hex || visual.hex || '#555';
      return `
        <button type="button"
                class="lp-bubble-color ${isSel ? 'is-selected' : ''}"
                data-color="${esc(c.name)}">
          <span class="lp-bubble-color__chip" style="background:${esc(swatch)}"></span>
          <span>${esc(c.name)}</span>
        </button>`;
    }).join('');
    list.querySelectorAll('.lp-bubble-color').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.color;
        const c = colors.find(x => x.name === name);
        if (c) {
          state.selectedColor = c;
          renderColors();  // re-pinta la selección
        }
      });
    });
  }

  function getPermitsForProduct() {
    const p = state.product || {};
    return {
      adelante: p.permite_grabado_adelante === true,
      interior: p.permite_grabado_interior === true,
      atras:    p.permite_grabado_atras    === true,
      texto:    p.permite_grabado_texto    === true,
    };
  }

  function hasAnyPersBeenAllowed() {
    const perms = getPermitsForProduct();
    return Object.values(perms).some(Boolean) && !!state.config?.enabled;
  }

  function renderOptions() {
    const wrap = $('lpBubbleOptions');
    if (!wrap) return;
    const perms = getPermitsForProduct();
    const tipos = [
      { key: 'adelante', label: TIPO_LABELS.adelante, icon: TIPO_ICONS.adelante },
      { key: 'interior', label: TIPO_LABELS.interior, icon: TIPO_ICONS.interior },
      { key: 'atras',    label: TIPO_LABELS.atras,    icon: TIPO_ICONS.atras    },
      { key: 'texto',    label: TIPO_LABELS.texto,    icon: TIPO_ICONS.texto    },
    ].filter(t => perms[t.key] === true);
    const precio = state.config?.precio_por_elemento || 0;
    wrap.innerHTML = tipos.map(t => `
      <button type="button"
              class="lp-bubble-option ${state.selected[t.key] ? 'is-selected' : ''}"
              data-tipo="${t.key}"
              aria-pressed="${state.selected[t.key] ? 'true' : 'false'}">
        <span class="lp-bubble-option__icon">${t.icon}</span>
        <span class="lp-bubble-option__name">${t.label}</span>
        <span class="lp-bubble-option__price">+${fmt(precio)}</span>
      </button>
    `).join('');
    wrap.querySelectorAll('.lp-bubble-option').forEach(btn => {
      btn.addEventListener('click', () => toggleOption(btn.dataset.tipo));
    });
  }

  function toggleOption(key) {
    if (!Object.prototype.hasOwnProperty.call(state.selected, key)) return;
    state.selected[key] = !state.selected[key];
    if (key === 'texto' && !state.selected.texto) {
      state.texto = '';
      const f = $('lpBubbleTextField');
      if (f) f.value = '';
    }
    if (key !== 'texto' && !state.selected[key]) {
      state.uploads[key] = null;
    }
    renderOptions();
    renderTextInput();
    renderUploads();
    renderIndic();
    renderWarnings();
    renderTotal();
  }

  function renderTextInput() {
    const wrap = $('lpBubbleTextWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-visible', !!state.selected.texto);
    const maxEl = $('lpBubbleTextMax');
    if (maxEl) maxEl.textContent = String(state.config?.texto_max_caracteres || 40);
    updateTextCounter();
  }
  function updateTextCounter() {
    const cnt = $('lpBubbleTextCount');
    if (cnt) cnt.textContent = String(state.texto.length);
  }
  function onTextInput(e) {
    const max = state.config?.texto_max_caracteres || 40;
    state.texto = (e.target.value || '').slice(0, max);
    e.target.value = state.texto;
    updateTextCounter();
  }
  function onIndicInput(e) {
    state.indicaciones = (e.target.value || '').slice(0, 300);
    e.target.value = state.indicaciones;
  }

  function renderUploads() {
    const wrap = $('lpBubbleUploads');
    if (!wrap) return;
    const tipos = ['adelante', 'interior', 'atras'];
    const visibles = tipos.filter(t => state.selected[t]);
    if (visibles.length === 0) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = visibles.map(t => renderUploadSlot(t)).join('');
    // Botones internos
    wrap.querySelectorAll('[data-pick]').forEach(b => {
      b.addEventListener('click', () => pickFile(b.dataset.pick));
    });
    wrap.querySelectorAll('[data-rm]').forEach(b => {
      b.addEventListener('click', () => removeFile(b.dataset.rm));
    });
  }

  function renderUploadSlot(tipo) {
    const up = state.uploads[tipo];
    const label = TIPO_LABELS[tipo];
    if (!up) {
      return `
        <div class="lp-bubble-upload">
          <div class="lp-bubble-upload__head">
            <div class="lp-bubble-upload__label">${label}</div>
            <button class="lp-bubble-upload__btn" data-pick="${tipo}">📁 Subir imagen</button>
          </div>
          <div class="lp-bubble-upload__body">
            <span class="lp-bubble-upload__status">Sin imagen aún</span>
          </div>
        </div>`;
    }
    const statusText =
      up.status === 'uploading' ? 'Subiendo…' :
      up.status === 'ready'     ? '✓ Lista para imprimir' :
      up.status === 'error'     ? ('Error: ' + (up.error || 'subida fallida')) :
                                  'Procesando…';
    const statusClass =
      up.status === 'uploading' ? 'is-uploading' :
      up.status === 'ready'     ? 'is-ready'     :
      up.status === 'error'     ? 'is-error'     : '';
    const preview = up.previewDataUrl
      ? `<img src="${esc(up.previewDataUrl)}" class="lp-bubble-upload__preview" alt="Preview">`
      : `<div class="lp-bubble-upload__preview"></div>`;
    return `
      <div class="lp-bubble-upload">
        <div class="lp-bubble-upload__head">
          <div class="lp-bubble-upload__label">${label}</div>
          <button class="lp-bubble-upload__btn" data-pick="${tipo}">↻ Cambiar</button>
        </div>
        <div class="lp-bubble-upload__body">
          ${preview}
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--color-text,#ddd);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(up.filename || 'archivo')}</div>
            <div class="lp-bubble-upload__status ${statusClass}">${esc(statusText)}</div>
          </div>
          <button class="lp-bubble-upload__rm" data-rm="${tipo}" aria-label="Quitar">✕</button>
        </div>
      </div>`;
  }

  function renderIndic() {
    const wrap = $('lpBubbleIndicWrap');
    if (!wrap) return;
    const algunaSel = Object.values(state.selected).some(Boolean);
    wrap.classList.toggle('is-visible', algunaSel);
    if (!algunaSel) {
      state.indicaciones = '';
      const f = $('lpBubbleIndicField');
      if (f) f.value = '';
    }
  }

  function renderWarnings() {
    const wrap = $('lpBubbleWarnings');
    if (!wrap) return;
    const algunaSel = Object.values(state.selected).some(Boolean);
    wrap.classList.toggle('is-visible', algunaSel);
    if (algunaSel) {
      const t = state.config?.textos || {};
      $('lpBubbleWarnTime').textContent   = t.aviso_tiempo_extra || 'La personalización agrega 24 hs hábiles al tiempo de preparación.';
      $('lpBubbleWarnReturn').textContent = t.aviso_no_devolucion || 'Los productos personalizados no admiten devolución.';
      $('lpBubbleWarnCopy').textContent   = t.disclaimer_copyright || 'Al subir imágenes confirmás que tenés los derechos para usarlas.';
    }
  }

  function getExtraTotal() {
    if (!state.config?.enabled) return 0;
    const precio = Number(state.config.precio_por_elemento) || 0;
    let extra = 0;
    Object.values(state.selected).forEach(v => { if (v) extra += precio; });
    return extra;
  }

  function renderTotal() {
    const totalEl = $('lpBubbleTotal');
    if (!totalEl) return;
    const extra = getExtraTotal();
    const total = (Number(state.basePrice) || 0) + extra;
    totalEl.textContent = fmt(total);

    // Confirmar deshabilitado si hay uploads pendientes
    const confirmBtn = $('lpBubbleConfirm');
    if (confirmBtn) {
      const tipos = ['adelante', 'interior', 'atras'];
      const pendientes = tipos.some(t => state.selected[t] && (!state.uploads[t] || state.uploads[t].status !== 'ready'));
      const sinColor = !state.selectedColor;
      confirmBtn.disabled = pendientes || sinColor;
      if (sinColor) {
        confirmBtn.textContent = 'Elegí un color';
      } else if (pendientes) {
        confirmBtn.textContent = 'Subí las imágenes primero';
      } else {
        // Sesión 53 Bloque 4 — label dinámico ("Agregar al carrito" /
        // "Guardar cambios"), lo provee el caller en opts.confirmLabel.
        confirmBtn.textContent = state.confirmLabel || 'Agregar al carrito';
      }
    }
  }

  function renderMaster() {
    const m = $('lpBubbleMaster');
    if (!m) return;
    // Si el producto no admite personalización ni la config global está ON,
    // ocultamos toda la sección.
    if (!hasAnyPersBeenAllowed()) {
      m.style.display = 'none';
      $('lpBubblePers').classList.remove('is-visible');
      return;
    }
    m.style.display = '';
    // El switch inicia apagado siempre (caller no preselecciona personalización)
    const isOn = Object.values(state.selected).some(Boolean);
    m.classList.toggle('is-on', isOn);
    m.setAttribute('aria-pressed', String(isOn));
    $('lpBubblePers').classList.toggle('is-visible', isOn);
  }

  function toggleMaster() {
    const willEnable = !Object.values(state.selected).some(Boolean);
    if (!willEnable) {
      // Apagar todo
      state.selected = { adelante: false, interior: false, atras: false, texto: false };
      state.texto = '';
      state.indicaciones = '';
      state.uploads = { adelante: null, interior: null, atras: null };
      const f = $('lpBubbleTextField'); if (f) f.value = '';
      const fi = $('lpBubbleIndicField'); if (fi) fi.value = '';
    } else {
      // Encender: preseleccionar el primer tipo disponible
      const perms = getPermitsForProduct();
      const order = ['adelante', 'interior', 'atras', 'texto'];
      const first = order.find(k => perms[k]);
      if (first) state.selected[first] = true;
    }
    renderMaster();
    renderOptions();
    renderTextInput();
    renderUploads();
    renderIndic();
    renderWarnings();
    renderTotal();
  }

  // ── Uploads ────────────────────────────────────────────────
  function pickFile(tipo) {
    const f = document.createElement('input');
    f.type = 'file';
    const allowed = state.config?.archivo?.tipos_permitidos || ['image/png','image/jpeg','image/svg+xml'];
    f.accept = allowed.join(',');
    f.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(tipo, file);
    };
    f.click();
  }

  function removeFile(tipo) {
    state.uploads[tipo] = null;
    renderUploads();
    renderTotal();
  }

  async function handleFile(tipo, file) {
    const cfg = state.config?.archivo || {};
    const maxMb = cfg.peso_max_mb || 5;
    const dimMin = cfg.dim_min_px || 500;
    const allowed = cfg.tipos_permitidos || ['image/png','image/jpeg','image/svg+xml'];

    if (!allowed.includes(file.type)) {
      setUploadError(tipo, file.name, 'Tipo no permitido. Usá PNG, JPG o SVG.');
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > maxMb) {
      setUploadError(tipo, file.name, `La imagen pesa ${sizeMb.toFixed(1)} MB. Máx: ${maxMb} MB.`);
      return;
    }
    if (file.type !== 'image/svg+xml') {
      try {
        const dims = await getImageDimensions(file);
        if (dims.width < dimMin || dims.height < dimMin) {
          setUploadError(tipo, file.name, `Muy chica (${dims.width}×${dims.height}). Mínimo: ${dimMin}×${dimMin} px.`);
          return;
        }
      } catch (_) { /* no bloqueamos por esto */ }
    }

    const previewDataUrl = await fileToDataURL(file).catch(() => '');
    state.uploads[tipo] = { filename: file.name, status: 'uploading', previewDataUrl };
    renderUploads();
    renderTotal();

    // Pedir signed url
    let signed;
    try {
      const resp = await fetch('/api/upload-personalizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type }),
      });
      signed = await resp.json();
      if (!resp.ok || !signed.uploadUrl) {
        throw new Error(signed?.message || 'No pudimos preparar la subida.');
      }
    } catch (e) {
      console.error('[lp-bubble] signed url:', e);
      setUploadError(tipo, file.name, e.message || 'Error de conexión');
      return;
    }

    try {
      const upResp = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
        body: file,
      });
      if (!upResp.ok) throw new Error('Falló la subida');
    } catch (e) {
      console.error('[lp-bubble] PUT:', e);
      setUploadError(tipo, file.name, 'No pudimos subir el archivo. Reintentá.');
      return;
    }

    state.uploads[tipo] = {
      filename: file.name,
      path: signed.path,
      bucket: signed.bucket || 'personalizacion-uploads',
      status: 'ready',
      previewDataUrl,
    };
    renderUploads();
    renderTotal();
  }

  function setUploadError(tipo, filename, msg) {
    state.uploads[tipo] = { filename: filename || 'archivo', status: 'error', error: msg };
    renderUploads();
    renderTotal();
  }

  // ── Confirmar / cancelar ──────────────────────────────────
  function buildPayload() {
    const sel = state.selected;
    const hayAlguna = Object.values(sel).some(Boolean);
    if (!hayAlguna) {
      // Sin personalización: payload sin objeto personalizacion
      return {
        colorName: state.selectedColor?.name || null,
        personalizacion: null,
      };
    }
    const ups = state.uploads;
    const personalizacion = {
      extra: getExtraTotal(),
      adelante: sel.adelante && ups.adelante?.status === 'ready'
        ? { path: ups.adelante.path, filename: ups.adelante.filename }
        : null,
      interior: sel.interior && ups.interior?.status === 'ready'
        ? { path: ups.interior.path, filename: ups.interior.filename }
        : null,
      atras: sel.atras && ups.atras?.status === 'ready'
        ? { path: ups.atras.path, filename: ups.atras.filename }
        : null,
      texto: sel.texto ? state.texto : '',
      indicaciones: state.indicaciones || '',
    };
    return {
      colorName: state.selectedColor?.name || null,
      personalizacion,
    };
  }

  function confirm() {
    if (!state.selectedColor) return;
    const payload = buildPayload();
    const cb = state.onConfirm;
    closeInternal();
    if (typeof cb === 'function') cb(payload);
  }

  function cancel() {
    const cb = state.onCancel;
    closeInternal();
    if (typeof cb === 'function') cb();
  }

  function closeInternal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.remove('is-open');
    document.body.style.overflow = '';
    // Reset estado
    state.open = false;
    state.product = null;
    state.config = null;
    state.onConfirm = null;
    state.onCancel = null;
    state.basePrice = 0;
    state.selectedColor = null;
    state.selected = { adelante: false, interior: false, atras: false, texto: false };
    state.texto = '';
    state.indicaciones = '';
    state.uploads = { adelante: null, interior: null, atras: null };
    state.confirmLabel = 'Agregar al carrito';
  }

  // ── API pública ────────────────────────────────────────────
  function open(opts) {
    opts = opts || {};
    if (!opts.product || !opts.config) {
      console.warn('[lp-bubble] open requiere product y config');
      return;
    }
    // Setup estado
    state.open = true;
    state.product = opts.product;
    state.config  = opts.config;
    state.allowColorChange = opts.allowColorChange !== false;
    state.onConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
    state.onCancel  = typeof opts.onCancel  === 'function' ? opts.onCancel  : null;
    state.basePrice = Number(opts.basePrice) || 0;
    state.selected = { adelante: false, interior: false, atras: false, texto: false };
    state.texto = '';
    state.indicaciones = '';
    state.uploads = { adelante: null, interior: null, atras: null };

    // Sesión 53 Bloque 4 — Modo edición. Si el caller pasa
    // `initialPersonalizacion`, precargamos los toggles, texto e
    // indicaciones, y marcamos los uploads existentes como `ready`
    // (no se vuelven a subir — ya están en Supabase).
    //
    // Estructura esperada de initialPersonalizacion (igual a la que se
    // guarda en items del carrito):
    //   { adelante: {path,filename}|null,
    //     interior: {path,filename}|null,
    //     atras:    {path,filename}|null,
    //     texto:    string,
    //     indicaciones: string }
    const initialPers = opts.initialPersonalizacion;
    if (initialPers && typeof initialPers === 'object') {
      if (initialPers.adelante && initialPers.adelante.path) {
        state.selected.adelante = true;
        state.uploads.adelante = {
          filename: initialPers.adelante.filename || 'archivo',
          path:     initialPers.adelante.path,
          bucket:   initialPers.adelante.bucket || 'personalizacion-uploads',
          status:   'ready',
          previewDataUrl: '',  // sin preview local — solo nombre + check
        };
      }
      if (initialPers.interior && initialPers.interior.path) {
        state.selected.interior = true;
        state.uploads.interior = {
          filename: initialPers.interior.filename || 'archivo',
          path:     initialPers.interior.path,
          bucket:   initialPers.interior.bucket || 'personalizacion-uploads',
          status:   'ready',
          previewDataUrl: '',
        };
      }
      if (initialPers.atras && initialPers.atras.path) {
        state.selected.atras = true;
        state.uploads.atras = {
          filename: initialPers.atras.filename || 'archivo',
          path:     initialPers.atras.path,
          bucket:   initialPers.atras.bucket || 'personalizacion-uploads',
          status:   'ready',
          previewDataUrl: '',
        };
      }
      if (initialPers.texto) {
        state.selected.texto = true;
        state.texto = String(initialPers.texto);
      }
      if (initialPers.indicaciones) {
        state.indicaciones = String(initialPers.indicaciones);
      }
    }

    // Color preseleccionado
    const colors = state.product.colors || [];
    const estados = state.product?.extras?.colores_estado || {};
    let chosen = null;
    if (opts.colorName) chosen = colors.find(c => c.name === opts.colorName && estados[c.name] !== 'sin_stock');
    if (!chosen) chosen = colors.find(c => estados[c.name] !== 'sin_stock');
    state.selectedColor = chosen || null;

    // Construir modal si no existe + setear textos
    buildModal();
    $('lpBubbleTitle').textContent = opts.title || 'Personalizar';
    $('lpBubbleSub').textContent   = opts.subtitle || '';
    $('lpBubbleTextField').value   = state.texto;
    $('lpBubbleIndicField').value  = state.indicaciones;

    // Sesión 53 Bloque 4 — Etiqueta del botón confirmar. Por defecto
    // "Agregar al carrito". En modo edición, "Guardar cambios".
    state.confirmLabel = opts.confirmLabel || 'Agregar al carrito';

    // Render inicial
    renderColors();
    renderMaster();
    renderOptions();
    renderTextInput();
    renderUploads();
    renderIndic();
    renderWarnings();
    renderTotal();

    // Mostrar
    const modal = document.getElementById(MODAL_ID);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  window.founderLaserPanel = {
    open,
    close: cancel,
  };
})();
