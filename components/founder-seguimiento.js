/* =============================================================
   FOUNDER — components/founder-seguimiento.js
   -------------------------------------------------------------
   Lógica de la página pública de seguimiento de pedidos.

   Qué hace:
     • buscarPedido()    → consulta /api/seguimiento por POST
                           (body: { numero, email }).
     • mostrarResultado()→ renderiza el pedido devuelto por Supabase.
     • renderProductos() → usa order_items estructurado cuando
                           está disponible, con fallback al parseo
                           del string `productos`.
     • Las fotos de los productos se leen de Supabase vía
       window.founderDB.fetchPhotoMap().

   Precondiciones:
     - Cargado DESPUÉS de components/supabase-client.js y cart.js.
     - El DOM de seguimiento.html ya debe estar presente.

   UX incluida:
     - Formulario (inputs Pedido + Email).
     - Barra de progreso de 4 pasos.
     - Panel de tracking (envío) / coordinar retiro.
     - Copiar nro, abrir URL del transportista.
     - Pre-llenado automático desde URL params.
   ============================================================= */
'use strict';

(function () {

  // ── CONFIG ───────────────────────────────────────────────────
  const API_SEGUIMIENTO = '/api/seguimiento';
  const WA_NUMBER       = '598098550096';

  // ── Estado del comprador activo — se llena en mostrarResultado ──
  // Permite que el botón de WhatsApp de retiro incluya nombre y número.
  const _comprador = { nombre: '', pedidoId: '' };

  // ── Mapa de estados → índice de paso (0 a 3) ─────────────────
  // Se usa para la barra de progreso del seguimiento.
  // Las claves son normalizadas (sin acentos, minúsculas).
  const ESTADOS_PROGRESO = {
    'pendiente':              0,
    'en preparacion':         1,
    'preparacion':            1,
    'en camino':              2,
    'camino':                 2,
    'listo para retirar':     2,  // retiro: paso equivalente a "en camino"
    'listo':                  2,
    'retirar':                2,
    'entregado':              3,
  };
  const IDS_PASOS    = ['pendiente','preparacion','camino','entregado'];
  const PROGRESO_PCT = ['8%', '36%', '64%', '92%'];

  // ── Cache de photoMap — se carga una sola vez al buscar un pedido ──
  let _photoMap = null;
  async function getPhotoMap() {
    if (_photoMap) return _photoMap;
    try {
      _photoMap = await window.founderDB.fetchPhotoMap();
    } catch (e) {
      console.warn('[Founder] No se pudo cargar photoMap:', e);
      _photoMap = {};
    }
    return _photoMap;
  }

  function obtenerFoto(nombre, color) {
    if (!_photoMap || !nombre) return null;
    const modelo = nombre.replace(/^Founder\s+/i, '').trim();
    return _photoMap[modelo]?.[color]?.[0] || null;
  }

  // ── Helpers ──────────────────────────────────────────────────
  function normalizar(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function mostrarError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.classList.add('visible');
  }

  function ocultarError() {
    document.getElementById('errorMsg').classList.remove('visible');
  }

  // ── API helper: POST JSON a /api/seguimiento ─────────────────
  async function apiSeguimiento(body) {
    const res = await fetch(API_SEGUIMIENTO, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* body no es JSON */ }
    return { ok: res.ok, status: res.status, data: data || {} };
  }

  // ═══════════════════════════════════════════════════════════
  // BÚSQUEDA DE PEDIDO
  // ═══════════════════════════════════════════════════════════
  async function buscarPedido() {
    const pedidoRaw = document.getElementById('inputPedido').value.trim();
    const emailRaw  = document.getElementById('inputEmail').value.trim();

    ocultarError();

    if (!pedidoRaw || !emailRaw) {
      mostrarError('Por favor completá ambos campos para continuar.');
      return;
    }

    const btn = document.getElementById('btnBuscar');
    btn.disabled = true;
    btn.textContent = 'Consultando...';
    document.getElementById('loadingSpinner').classList.add('visible');

    try {
      // Cargar photoMap en paralelo con la consulta del pedido, así las
      // fotos ya están listas cuando renderizamos productos.
      const [photoPromise, apiResp] = await Promise.all([
        getPhotoMap(),
        apiSeguimiento({ numero: pedidoRaw, email: emailRaw }),
      ]);
      void photoPromise; // solo para precargar cache

      document.getElementById('loadingSpinner').classList.remove('visible');
      btn.disabled = false;
      btn.textContent = 'Consultar estado';

      if (!apiResp.ok || !apiResp.data.pedido) {
        // El server devuelve mensaje en data.detail; si no, uno genérico.
        const msg = apiResp.data.detail
          || 'No encontramos ningún pedido con esos datos. Verificá el número de pedido y el email ingresados.';
        mostrarError(msg);
        return;
      }

      mostrarResultado(apiResp.data.pedido);

    } catch (err) {
      document.getElementById('loadingSpinner').classList.remove('visible');
      btn.disabled = false;
      btn.textContent = 'Consultar estado';
      mostrarError('Ocurrió un error al consultar. Por favor intentá de nuevo en unos segundos.');
      console.error(err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER DEL RESULTADO
  // Recibe el objeto `pedido` de Supabase (plano, con order_items).
  // ═══════════════════════════════════════════════════════════
  function mostrarResultado(p) {
    // Acceso seguro a campos (pueden ser null)
    const str = (v) => (v == null ? '' : String(v).trim());

    const id             = str(p.numero);
    const fechaRaw       = p.fecha || p.created_at || '';
    // Formatear fecha de forma legible (es-UY). Si no es ISO válido, mostrar como vino.
    let fecha = '';
    if (fechaRaw) {
      const d = new Date(fechaRaw);
      fecha = isNaN(d.getTime()) ? str(fechaRaw) : d.toLocaleString('es-UY');
    }

    const nombre         = str(p.nombre);
    const apellido       = str(p.apellido);
    const celular        = str(p.celular);
    const email          = str(p.email);
    const entrega        = str(p.entrega);
    const direccion      = str(p.direccion);
    const productosStr   = str(p.productos);
    const orderItems     = Array.isArray(p.order_items) ? p.order_items : [];
    const subtotal       = p.subtotal ?? '';
    const descuento      = p.descuento ?? '';
    const envio          = p.envio ?? '';
    const total          = p.total ?? '';
    const pago           = str(p.pago);
    const estado         = str(p.estado);
    const nroSeguimiento = str(p.nro_seguimiento);
    const urlSeguimiento = str(p.url_seguimiento);
    // Sesión 36: campos para mostrar tarjetas verdes de descuento
    const cuponCodigo       = str(p.cupon_codigo);
    const personalizExtra   = parseInt(p.personalizacion_extra ?? 0, 10) || 0;
    // Sesión 39: desglose dedicado del descuento.
    // Si vienen > 0 los usamos directamente; si vienen 0 (pedido viejo previo
    // a S39) cae al fallback de heurística en renderTotales.
    const descuentoCupon         = parseInt(p.descuento_cupon         ?? 0, 10) || 0;
    const descuentoTransferencia = parseInt(p.descuento_transferencia ?? 0, 10) || 0;

    // ID formateado para mostrar al usuario (mantiene compat con formato viejo)
    const pedidoIdFormateado = id.toUpperCase().startsWith('FND')
      ? id
      : (id.toUpperCase().startsWith('F') ? id : `FND-${id}`);

    document.getElementById('rPedidoId').textContent = pedidoIdFormateado;
    document.getElementById('rFecha').textContent    = fecha ? `Realizado el ${fecha}` : '';

    // Guardar datos del comprador activo para uso en botones dinámicos
    _comprador.nombre    = `${nombre} ${apellido}`.trim();
    _comprador.pedidoId  = pedidoIdFormateado;

    // Datos comprador
    document.getElementById('rNombre').textContent    = _comprador.nombre || '—';
    document.getElementById('rTelefono').textContent  = celular || '—';
    document.getElementById('rEmail').textContent     = email || '—';

    // Entrega
    document.getElementById('rEntrega').textContent = entrega || '—';
    if (direccion && entrega.toLowerCase().includes('envío')) {
      document.getElementById('rDireccion').textContent = direccion;
      document.getElementById('rowDireccion').style.display = '';
    } else {
      document.getElementById('rowDireccion').style.display = 'none';
    }
    document.getElementById('rPago').textContent = pago || '—';

    // ── Detectar modalidad de entrega ──
    const esEnvio = entrega.toLowerCase().includes('envío') ||
                    entrega.toLowerCase().includes('envio');

    // ── Paso 3 de la barra: adaptar texto según modalidad ──
    const labelCamino = document.getElementById('label-camino');
    const dotCamino   = document.getElementById('dot-camino');
    if (labelCamino) {
      labelCamino.textContent = esEnvio ? 'En camino' : 'Listo para retirar';
    }
    if (dotCamino) {
      dotCamino.textContent = esEnvio ? '🚚' : '📍';
    }

    // ── Estado → progreso ──
    const estadoNorm = normalizar(estado);
    const cancelado  = estadoNorm.includes('cancel');

    if (cancelado) {
      document.getElementById('progressSection').style.display = 'none';
      document.getElementById('rBadgeCancelado').innerHTML = '<span class="badge-cancelado">❌ Cancelado</span>';
    } else {
      document.getElementById('progressSection').style.display = '';
      document.getElementById('rBadgeCancelado').innerHTML = '';

      // Buscar índice del estado actual en el mapa extendido
      let idxActual = 0;
      for (const [key, val] of Object.entries(ESTADOS_PROGRESO)) {
        if (estadoNorm.includes(key)) { idxActual = val; break; }
      }

      // Actualizar pasos visuales
      IDS_PASOS.forEach((paso, i) => {
        const stepEl = document.getElementById('step-' + paso);
        const dotEl  = document.getElementById('dot-' + paso);
        if (!stepEl || !dotEl) return;
        stepEl.classList.remove('active','done');
        dotEl.classList.remove('active','done');
        if (i < idxActual) {
          stepEl.classList.add('done');
          dotEl.classList.add('done');
        } else if (i === idxActual) {
          stepEl.classList.add('active');
          dotEl.classList.add('active');
        }
      });

      // Animar barra
      const fill = document.getElementById('progressFill');
      if (fill) {
        fill.style.width = '0%';
        setTimeout(() => { fill.style.width = PROGRESO_PCT[idxActual]; }, 100);
      }
    }

    // Productos — priorizar order_items (estructurado) sobre el string legacy
    renderProductos(orderItems, productosStr);

    // Totales
    renderTotales(subtotal, descuento, envio, total, pago, cuponCodigo, personalizExtra, descuentoCupon, descuentoTransferencia);

    // ── Panel de tracking/retiro ──
    const seccion       = document.getElementById('trackingSection');
    const envioContent  = document.getElementById('trackingEnvioContent');
    const retiroContent = document.getElementById('trackingRetiroContent');
    seccion.style.display = '';

    if (esEnvio) {
      envioContent.style.display  = '';
      retiroContent.style.display = 'none';

      document.getElementById('rTrackingNro').textContent = nroSeguimiento || '—';

      const copyBtn = document.getElementById('trackingCopyBtn');
      copyBtn.style.display = nroSeguimiento ? '' : 'none';

      const urlBtn = document.getElementById('trackingUrlBtn');
      if (urlSeguimiento && /^https?:\/\//i.test(urlSeguimiento)) {
        urlBtn.href = urlSeguimiento;
        urlBtn.style.display = '';
      } else {
        urlBtn.style.display = 'none';
      }

      // Si no hay ningún dato de tracking aún, ocultar el panel entero.
      if (!nroSeguimiento && !urlSeguimiento) {
        seccion.style.display = 'none';
      }
    } else {
      envioContent.style.display  = 'none';
      retiroContent.style.display = '';
    }

    // Mostrar resultado
    document.getElementById('searchCard').style.display = 'none';
    // Sesión 38: ocultar título "Seguí tu pedido" + subtítulo cuando ya
    // estás viendo el detalle. Se vuelve a mostrar en resetear() al
    // tocar "Nueva consulta".
    const pageHeader = document.getElementById('pageHeader');
    if (pageHeader) pageHeader.style.display = 'none';
    document.getElementById('resultado').classList.add('visible');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Sesión 38: bloque de reseñas (solo se muestra si estado === 'Entregado')
    // Lo llamamos fire-and-forget — el bloque arranca oculto y se muestra
    // por sí solo cuando termina su fetch.
    if (typeof window.renderReviewBlock === 'function') {
      window.renderReviewBlock(p);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER DE PRODUCTOS
  // Prioriza order_items (array estructurado de Supabase).
  // Fallback: parsear el string `productos` al viejo estilo.
  // ═══════════════════════════════════════════════════════════
  function fotoPlaceholder(nombre) {
    const inicial = (nombre || '?').trim().charAt(0).toUpperCase();
    const el = document.createElement('div');
    el.className = 'producto-foto-placeholder';
    el.style.cssText = [
      'width:60px', 'height:60px', 'border-radius:3px',
      'background:var(--color-surface2)', 'flex-shrink:0',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:var(--font-serif)', 'font-size:1.4rem',
      'color:var(--color-gold)', 'font-weight:400', 'letter-spacing:0'
    ].join(';');
    el.textContent = inicial;
    return el;
  }

  /**
   * Normaliza items a un formato uniforme:
   *   { nombre, color, cantidad, precio }
   * Acepta:
   *   a) Array de order_items de Supabase: {product_name, color, cantidad, precio_unitario}
   *   b) String legacy "Founder X (Color) xN | ..."
   */
  function normalizarItems(orderItems, productosStr) {
    // Caso A: order_items estructurado
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      return orderItems.map(it => {
        const cant = parseInt(it.cantidad, 10) || 1;
        const pu   = parseInt(it.precio_unitario, 10) || 0;
        return {
          nombre:   String(it.product_name || '').trim(),
          color:    String(it.color || '').trim(),
          cantidad: String(cant),
          precio:   pu ? '$' + (pu * cant).toLocaleString('es-UY') : '',
        };
      }).filter(i => i.nombre);
    }

    // Caso B: parsear el string legacy
    if (!productosStr) return [];
    return productosStr.split('|').map(s => s.trim()).filter(Boolean).map(item => {
      let nombre = item, color = '', cantidad = '1', precio = '';

      // Formato 1: "Modelo — Color × 2 — $1.400"
      const partes = item.split(/\s*—\s*/);
      if (partes.length >= 2) {
        nombre = partes[0].trim();
        const colorCant = partes[1].trim();
        const mxCant = colorCant.match(/^(.+?)\s*[×x]\s*(\d+)$/i);
        if (mxCant) {
          color    = mxCant[1].trim();
          cantidad = mxCant[2];
        } else {
          color = colorCant;
        }
        if (partes[2]) {
          const matchPrecio = partes[2].match(/\$[\d.,]+/);
          if (matchPrecio) precio = matchPrecio[0];
        }
      } else {
        // Formato 2: "Nombre (Color) x2 — $1.400"
        const match = item.match(/^(.+?)(?:\((.+?)\))?\s*x?(\d+)\s*(?:—|-|–)?\s*(\$[\d.,]+)?/i);
        if (match) {
          nombre   = match[1]?.trim() || item;
          color    = match[2]?.trim() || '';
          cantidad = match[3] || '1';
          precio   = match[4]?.trim() || '';
        }
      }

      return { nombre, color, cantidad, precio };
    });
  }

  function renderProductos(orderItems, productosStr) {
    const container = document.getElementById('rProductos');
    container.innerHTML = '';

    const items = normalizarItems(orderItems, productosStr);

    if (items.length === 0) {
      container.innerHTML = productosStr
        ? `<p style="color:var(--color-muted);font-size:0.82rem;">${productosStr}</p>`
        : '<p style="color:var(--color-muted);font-size:0.82rem;">Sin detalle de productos.</p>';
      return;
    }

    items.forEach(({ nombre, color, cantidad, precio }) => {
      const div = document.createElement('div');
      div.className = 'producto-item';

      // Placeholder mientras "carga" la foto
      const placeholder = fotoPlaceholder(nombre);
      div.appendChild(placeholder);

      // Info del producto
      const infoDiv = document.createElement('div');
      infoDiv.className = 'producto-info';
      infoDiv.innerHTML = `
        <div class="producto-nombre">${nombre}</div>
        <div class="producto-detalle">${[color, parseInt(cantidad) > 1 ? `x${cantidad}` : ''].filter(Boolean).join(' · ')}</div>
      `;
      div.appendChild(infoDiv);

      if (precio) {
        const precioDiv = document.createElement('div');
        precioDiv.className = 'producto-precio';
        precioDiv.textContent = precio;
        div.appendChild(precioDiv);
      }

      container.appendChild(div);

      // Reemplazar placeholder por la foto real si está en el photoMap
      if (nombre && color) {
        const fotoUrl = obtenerFoto(nombre, color);
        if (fotoUrl) {
          const img = document.createElement('img');
          img.className = 'producto-foto';
          img.alt = `${nombre} — ${color}`;
          img.style.cssText = 'width:60px;height:60px;border-radius:3px;object-fit:cover;flex-shrink:0;filter:brightness(.92)';
          img.onload = () => {
            if (placeholder.parentNode) placeholder.parentNode.replaceChild(img, placeholder);
          };
          img.onerror = () => { /* mantener placeholder */ };
          img.src = fotoUrl;
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TOTALES
  // ═══════════════════════════════════════════════════════════
  function formatPesos(val) {
    const num = parseFloat((val+'').replace(/[^0-9.-]/g,''));
    if (isNaN(num)) return val;
    return '$' + num.toLocaleString('es-UY');
  }

  function renderTotales(subtotal, descuento, envio, total, pago, cuponCodigo, personalizExtra, descuentoCupon, descuentoTransferencia) {
    const container = document.getElementById('rTotales');
    let html = '';

    if (subtotal) html += `<div class="total-row"><span>Subtotal</span><span>${formatPesos(subtotal)}</span></div>`;

    // Línea de personalización si hay
    const personaliz = parseInt(personalizExtra || 0, 10) || 0;
    if (personaliz > 0) {
      html += `<div class="total-row"><span>Personalización láser</span><span style="color:var(--color-gold)">+${formatPesos(personaliz)}</span></div>`;
    }

    // Sesión 36 + 39: tarjetas verdes para descuentos.
    // Prioridad 1 (Sesión 39): si la DB trae descuento_cupon y/o
    // descuento_transferencia > 0, los usamos directamente.
    // Prioridad 2 (fallback Sesión 36): pedidos viejos sin desglose →
    // heurística por presencia de cuponCodigo + método de pago.
    const descNum = parseFloat(String(descuento).replace(/[^0-9.-]/g, '')) || 0;
    const dCupon  = parseInt(descuentoCupon         ?? 0, 10) || 0;
    const dTrans  = parseInt(descuentoTransferencia ?? 0, 10) || 0;
    const hayCupon = !!(cuponCodigo && cuponCodigo.trim());
    const hayTransferencia = /transfer/i.test(pago || '');
    const tieneDesgloseDB = (dCupon > 0 || dTrans > 0);

    if (descNum > 0) {
      if (tieneDesgloseDB) {
        // ── Prioridad 1: usar el desglose dedicado de la DB ──
        if (dCupon > 0) {
          const titulo = hayCupon
            ? `✓ Cupón ${cuponCodigo.toUpperCase()} aplicado`
            : '✓ Cupón aplicado';
          html += renderDiscountCard(titulo, 'Descuento aplicado al pedido', dCupon);
        }
        if (dTrans > 0) {
          html += renderDiscountCard('✓ Pago por transferencia', '10% sobre productos + grabados', dTrans);
        }
      } else if (hayCupon && hayTransferencia) {
        // ── Prioridad 2 (fallback pedido viejo): heurística ──
        // 2 tarjetas: cupón + transferencia. Sin desglose en DB no podemos
        // mostrar montos individuales — solo la atribución.
        html += renderDiscountCard(`✓ Cupón ${cuponCodigo.toUpperCase()} aplicado`, 'Descuento aplicado al pedido', null);
        html += renderDiscountCard('✓ Pago por transferencia', '10% sobre productos + grabados', null);
        html += `<div class="total-row"><span style="color:var(--color-muted);font-size:0.78rem">Total descontado</span><span class="descuento-val">−${formatPesos(descuento)}</span></div>`;
      } else if (hayCupon) {
        html += renderDiscountCard(`✓ Cupón ${cuponCodigo.toUpperCase()} aplicado`, 'Descuento aplicado a tu pedido', descNum);
      } else if (hayTransferencia) {
        html += renderDiscountCard('✓ Pago por transferencia', '10% sobre productos + grabados', descNum);
      } else {
        // Fallback final: pedido viejísimo sin atribución
        html += `<div class="total-row"><span>Descuento</span><span class="descuento-val">−${formatPesos(descuento)}</span></div>`;
      }
    }

    const env = parseFloat((envio + '').replace(/[^0-9.-]/g, ''));
    if (!isNaN(env)) {
      html += `<div class="total-row"><span>Envío</span><span>${env === 0 ? '🎁 Gratis' : formatPesos(envio)}</span></div>`;
    }

    if (total) html += `<div class="total-row final"><span>Total</span><span>${formatPesos(total)}</span></div>`;

    container.innerHTML = html || '<p style="color:var(--color-muted);font-size:0.82rem;">Sin detalle de totales.</p>';
  }

  // Sesión 36: helper para renderizar una tarjeta verde de descuento.
  // Si amount es null o 0, no muestra el monto (caso 2 fuentes mezcladas).
  function renderDiscountCard(title, subtitle, amount) {
    const amountHtml = (amount && amount > 0)
      ? `<span class="discount-card__amount">−${formatPesos(amount)}</span>`
      : '';
    return `<div class="discount-card">
      <div class="discount-card__info">
        <span class="discount-card__title">${title}</span>
        <span class="discount-card__sub">${subtitle}</span>
      </div>
      ${amountHtml}
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════
  // RESET / COPIAR / WHATSAPP
  // ═══════════════════════════════════════════════════════════
  function resetear() {
    document.getElementById('resultado').classList.remove('visible');
    document.getElementById('searchCard').style.display = '';
    // Sesión 38: volver a mostrar el título "Seguí tu pedido" al resetear.
    const pageHeader = document.getElementById('pageHeader');
    if (pageHeader) pageHeader.style.display = '';
    document.getElementById('inputPedido').value = '';
    document.getElementById('inputEmail').value  = '';
    document.getElementById('trackingSection').style.display       = 'none';
    document.getElementById('trackingEnvioContent').style.display  = 'none';
    document.getElementById('trackingRetiroContent').style.display = 'none';
    const lc = document.getElementById('label-camino');
    const dc = document.getElementById('dot-camino');
    if (lc) lc.textContent = 'En camino';
    if (dc) dc.textContent = '🚚';
    // Sesión 38: limpiar bloque de reseñas
    const reviewBlock = document.getElementById('reviewBlockContainer');
    if (reviewBlock) {
      reviewBlock.innerHTML = '';
      reviewBlock.style.display = 'none';
    }
    ocultarError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Copia el número de seguimiento al portapapeles */
  function copiarNroSeguimiento() {
    const nro = document.getElementById('rTrackingNro')?.textContent?.trim();
    if (!nro || nro === '—') return;

    const animarBoton = () => {
      const btn = document.getElementById('trackingCopyBtn');
      btn.textContent = '¡Copiado!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(nro).then(animarBoton).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      const ta = document.createElement('textarea');
      ta.value = nro;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      animarBoton();
    }
  }

  /** Valida y abre la URL del transportista en nueva pestaña */
  function abrirUrlSeguimiento(e) {
    const href = document.getElementById('trackingUrlBtn')?.href || '';
    if (!href || href === window.location.href + '#' || !/^https?:\/\//i.test(href)) {
      e.preventDefault();
      return false;
    }
    return true;
  }

  /** Genera el mensaje de WhatsApp para retiro con datos reales del comprador */
  function coordinarRetiro() {
    const nombre   = _comprador.nombre   || 'el comprador';
    const pedidoId = _comprador.pedidoId || '';
    const msg = [
      'Hola! Quiero coordinar el retiro de mi pedido.',
      `La compra fue realizada a nombre de ${nombre}`,
      pedidoId ? `y el número de pedido es ${pedidoId}.` : '',
    ].filter(Boolean).join(' ');
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  // ═══════════════════════════════════════════════════════════
  // EXPONER FUNCIONES PARA onclick INLINE DEL HTML
  // ═══════════════════════════════════════════════════════════
  window.buscarPedido        = buscarPedido;
  window.resetear            = resetear;
  window.copiarNroSeguimiento = copiarNroSeguimiento;
  window.abrirUrlSeguimiento  = abrirUrlSeguimiento;
  window.coordinarRetiro      = coordinarRetiro;

  // ═══════════════════════════════════════════════════════════
  // EVENT LISTENERS + PRE-LLENADO DESDE URL PARAMS
  // Se ejecutan al cargar el script (el HTML ya tiene el DOM armado).
  // ═══════════════════════════════════════════════════════════
  function attachListeners() {
    // Enter en los inputs → buscar
    ['inputPedido','inputEmail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') buscarPedido();
        });
      }
    });
  }

  function initFromUrlParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const pedido = params.get('pedido');
      const email  = params.get('email');
      if (!pedido || !email) return;

      // Validación básica antes de usar los valores
      const pedidoSafe = pedido.replace(/[^a-zA-Z0-9\-]/g, '').substring(0, 20);
      const emailSafe  = email.replace(/[^a-zA-Z0-9@.\-_+]/g, '').substring(0, 100);
      if (!pedidoSafe || !emailSafe) return;

      const inpPedido = document.getElementById('inputPedido');
      const inpEmail  = document.getElementById('inputEmail');
      if (!inpPedido || !inpEmail) return;

      inpPedido.value = pedidoSafe;
      inpEmail.value  = emailSafe;

      // Limpiar params de la URL sin recargar (no expone datos en historial)
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      // Ejecutar búsqueda automáticamente
      setTimeout(buscarPedido, 200);
    } catch (e) {
      console.warn('[Founder] No se pudo pre-llenar formulario:', e);
    }
  }

  function boot() {
    attachListeners();
    initFromUrlParams();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
