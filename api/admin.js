// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/admin
// ─────────────────────────────────────────────────────────────────
// Endpoint único del panel de administración. TODAS las acciones
// pasan por acá, cada una identificada por body.action.
//
// Seguridad:
//   - Todas las requests deben incluir password === ADMIN_PASSWORD.
//   - Si falta o está mal, se devuelve 401 (unauthorized).
//   - El password viaja en el body, no en la URL (nunca en logs).
//   - Se usa comparación en tiempo constante para mitigar timing attacks.
//
// Acciones soportadas:
//   LOGIN / AUTH
//     - login                    → valida password (frontend guarda token en sessionStorage)
//
//   PEDIDOS
//     - list_orders              → lista pedidos con items embebidos
//                                  body.include_archived: 'only' | 'all' | (default: activos)
//     - update_order_status      → cambia orders.estado
//     - update_order_tracking    → guarda nro_seguimiento + url_seguimiento
//     - archive_order            → marca archivado=true (soft delete, reversible)
//     - unarchive_order          → marca archivado=false (restaurar)
//     - delete_order             → DELETE definitivo (cascada a order_items).
//                                  Requiere body.confirm === true para evitar accidentes.
//
//   CUPONES
//     - list_coupons             → lista todos los cupones
//     - create_coupon            → crea uno nuevo
//     - update_coupon            → toggle activo / editar campos
//     - delete_coupon            → elimina
//
//   PRODUCTOS
//     - list_products            → lista + colores + fotos (para editor)
//     - save_product             → upsert de producto + colores + fotos
//     - delete_product           → elimina producto (cascada)
//
//   BANNER / SETTINGS
//     - get_setting              → lee site_settings[key]
//     - set_setting              → escribe site_settings[key]
//
//   STORAGE
//     - get_upload_url           → genera URL firmada para subir foto al bucket
//                                  (cliente sube la imagen DIRECTO a Supabase,
//                                  evitando pasar el binario por Vercel)
//
//   PERSONALIZACIÓN LÁSER (Sesión 28 Bloque B)
//     - get_personalizacion_signed_url        → URL firmada de LECTURA
//                                               para imagen privada subida
//                                               por un cliente (admin only)
//     - list_personalizacion_examples         → lista la galería de ejemplos
//     - save_personalizacion_example          → upsert de un ejemplo
//     - delete_personalizacion_example        → borra un ejemplo
//     - get_personalizacion_example_upload_url → URL firmada para subir
//                                                foto de ejemplo al bucket público
//
//   LIMPIEZA Y DESCARGA DE PERSONALIZACIONES (Sesión 29 Bloque C)
//     Implementadas en endpoints separados (no en este archivo):
//     - /api/cleanup-personalizacion          → status, run manual, cron auto
//     - /api/download-personalizacion-bulk    → ZIP por pedido o backup
// ═════════════════════════════════════════════════════════════════

import { supabase, createHandler, ok, fail, parseBody } from './_lib/supabase.js';
import { sendOrderStatusUpdate } from './_lib/email.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { signToken } from './_lib/jwt.js';
import { checkAdminAuth } from './_lib/admin-auth.js';

const BUCKET_PHOTOS = 'product-photos';

// ── Autenticación ─────────────────────────────────────────────
/**
 * Valida que la request esté autenticada como admin.
 * Delega en el módulo compartido `admin-auth.js` (Sesión 31 Bloque C).
 *
 * Si la auth falla, responde 401 con un mensaje apropiado al modo
 * que intentó (token vencido vs password incorrecto vs server mal
 * configurado).
 *
 * @returns {boolean} true si OK, false si ya respondió 401.
 */
function requireAuth(body, res, req) {
  const result = checkAdminAuth(req, body);
  if (result.ok) return true;

  // Mensajes específicos por tipo de fallo
  if (result.error === 'server_misconfigured') {
    fail(res, 500, 'server_misconfigured', 'ADMIN_PASSWORD no configurada en Vercel.');
    return false;
  }
  if (result.error === 'jwt_misconfigured') {
    fail(res, 500, 'server_misconfigured', 'JWT_SECRET no configurada en Vercel.');
    return false;
  }
  if (result.error === 'invalid_token') {
    fail(res, 401, 'unauthorized', 'Token inválido o expirado');
    return false;
  }
  // wrong_password, no_credentials
  fail(res, 401, 'unauthorized', 'Contraseña incorrecta');
  return false;
}

// ═════════════════════════════════════════════════════════════════
// LOGIN
// ═════════════════════════════════════════════════════════════════
// Rate limit (Sesión 31): 5 intentos / 15 min por IP. Protege contra
// brute-force del password. El chequeo va ANTES de validar el password
// para que cada intento fallido cuente, incluso si la IP no sabe el pw.
//
// Si el password es correcto, emitimos un JWT de 8h. El frontend lo
// guarda y lo manda en todas las requests siguientes vía header
// Authorization: Bearer <token>. El password nunca más viaja en
// requests post-login.
async function handleLogin(body, res, req) {
  if (!(await enforceRateLimit('admin_login', req, res))) return;
  if (!requireAuth(body, res, req)) return;

  try {
    const { token, expiresAt } = signToken({ sub: 'admin' });
    return ok(res, { token, expiresAt });
  } catch (err) {
    // Si JWT_SECRET no está configurada o es muy corta, fallamos
    // con un mensaje específico. NO devolvemos ok() — el admin no
    // puede entrar sin JWT (es el nuevo método estándar).
    console.error('[admin/login] JWT sign error:', err?.message || err);
    return fail(res, 500, 'jwt_misconfigured',
      'JWT_SECRET no configurada en Vercel. Configurala con al menos 32 caracteres.');
  }
}

// ═════════════════════════════════════════════════════════════════
// PEDIDOS
// ═════════════════════════════════════════════════════════════════
async function handleListOrders(body, res, req) {
  if (!requireAuth(body, res, req)) return;

  // include_archived controla qué subconjunto traer:
  //   'only' → solo archivados          (vista "Archivados")
  //   'all'  → activos + archivados     (uso poco frecuente)
  //   resto  → solo activos             (default, lista principal)
  const mode = String(body.include_archived || '').trim();

  let q = supabase
    .from('orders')
    .select(`
      id, numero, fecha, nombre, apellido, celular, email,
      entrega, direccion, productos,
      subtotal, descuento, envio, total,
      pago, estado, notas, cupon_codigo,
      nro_seguimiento, url_seguimiento,
      archivado,
      personalizacion_extra, acepto_no_devolucion,
      created_at, updated_at,
      order_items ( id, product_name, color, cantidad, precio_unitario, personalizacion )
    `)
    .order('created_at', { ascending: false });

  if (mode === 'only')      q = q.eq('archivado', true);
  else if (mode !== 'all')  q = q.eq('archivado', false);

  const { data, error } = await q;
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res, { orders: data || [] });
}

async function handleUpdateOrderStatus(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id     = String(body.id || '').trim();
  const estado = String(body.estado || '').trim();
  if (!id)     return fail(res, 400, 'id_required');
  if (!estado) return fail(res, 400, 'estado_required');

  // 1) Leer pedido ANTES del update — necesitamos el estado previo
  //    para detectar si esto es una transición real (no re-click), y
  //    los datos completos para componer el email si corresponde.
  //    Mismo set de columnas que list_orders + items embebidos.
const { data: prevOrder, error: readErr } = await supabase
    .from('orders')
    .select(`
      id, numero, fecha, nombre, apellido, celular, email,
      entrega, direccion, productos,
      subtotal, descuento, envio, total,
      pago, estado, notas, cupon_codigo,
      nro_seguimiento, url_seguimiento,
      archivado,
      personalizacion_extra, acepto_no_devolucion,
      order_items ( id, product_name, color, cantidad, precio_unitario, personalizacion )
    `)
    .eq('id', id)
    .single();
  if (readErr || !prevOrder) {
    return fail(res, 500, 'db_error', readErr?.message || 'pedido no encontrado');
  }

  // 2) Update del estado
  const { error: updErr } = await supabase
    .from('orders')
    .update({ estado })
    .eq('id', id);
  if (updErr) return fail(res, 500, 'db_error', updErr.message);

  // 3) Disparo fire-and-forget del email si:
  //    - El estado realmente cambió (no es re-click).
  //    - El estado nuevo está en la lista de estados que disparan email
  //      (la chequea internamente sendOrderStatusUpdate vía
  //      statusTriggersEmail). Estados como "Cancelado", "Pago rechazado"
  //      o "Pendiente pago" NO disparan.
  //
  //    Patrón Promise.race con timeout, mismo que mp-webhook.js — Vercel
  //    Serverless mata la función al retornar, así que con fire-and-forget
  //    sin timeout perderíamos el envío. 3500ms es suficiente para Resend.
  const cambio = prevOrder.estado !== estado;
  if (cambio) {
    const orderForEmail = { ...prevOrder, estado };
    const items = Array.isArray(prevOrder.order_items)
      ? prevOrder.order_items
      : [];

    // Lookup de fotos (Sesión 25): los emails de status sin precios
    // muestran foto del producto. Construimos un map "Nombre||Color" → URL
    // consultando products + colors + photos. Si la query falla, el
    // email se manda igual con placeholders en vez de fotos.
    //
    // URLs envueltas con Cloudinary fetch para servir 200px optimizado
    // (mismo patrón que el preset 'thumb' de components/cloudinary.js).
    // Para emails 200px es perfecto: ahorro de bytes + carga rápida en
    // Gmail/Outlook que descargan la imagen al abrir el email.
    let photoMap = {};
    try {
      const { data: products, error: prodErr } = await supabase
        .from('products')
        .select(`
          nombre,
          product_colors (
            nombre,
            product_photos ( url, orden, es_principal )
          )
        `)
        .eq('activo', true);
      if (!prodErr && Array.isArray(products)) {
        const CLD_BASE = 'https://res.cloudinary.com/founder-uy/image/fetch/f_auto,q_auto,w_200,c_fill/';
        const ALLOWED_HOST = 'qedwqbxuyhieznrqryhb.supabase.co';
        const wrapWithCloudinary = (rawUrl) => {
          // Solo envolvemos URLs de Supabase Storage. Cualquier otra cosa
          // (data:, blob:, dominios externos) se devuelve sin tocar.
          if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
          if (!rawUrl.startsWith('http')) return rawUrl;
          try {
            const host = new URL(rawUrl).host;
            return host === ALLOWED_HOST ? CLD_BASE + rawUrl : rawUrl;
          } catch (_e) {
            return rawUrl;
          }
        };

        for (const p of products) {
          for (const c of (p.product_colors || [])) {
            const photos = c.product_photos || [];
            // Foto principal primero, fallback a la de menor 'orden'
            const principal = photos.find(ph => ph.es_principal);
            const sorted = [...photos].sort((a, b) => (a.orden || 0) - (b.orden || 0));
            const rawUrl = (principal && principal.url) || (sorted[0] && sorted[0].url) || null;
            if (rawUrl) {
              photoMap[`${p.nombre}||${c.nombre}`] = wrapWithCloudinary(rawUrl);
            }
          }
        }
      } else if (prodErr) {
        console.warn('[admin] photo lookup falló:', prodErr.message);
      }
    } catch (err) {
      console.warn('[admin] photo lookup threw:', err?.message || err);
      photoMap = {};
    }

    const TIMEOUT_MS = 3500;
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve({ ok: false, error: 'timeout' }), TIMEOUT_MS)
    );
    try {
      const result = await Promise.race([
        sendOrderStatusUpdate(orderForEmail, items, estado, photoMap),
        timeoutPromise,
      ]);
      if (result?.skipped) {
        console.log(`[admin] update_order_status: ${prevOrder.numero} → "${estado}" (sin email — estado no notifica)`);
      } else if (result?.ok) {
        console.log(`[admin] update_order_status: ${prevOrder.numero} → "${estado}" (email enviado, msg_id=${result.message_id})`);
      } else {
        console.warn(`[admin] update_order_status: ${prevOrder.numero} → "${estado}" (email falló: ${result?.error || 'unknown'})`);
      }
    } catch (err) {
      // Nunca propagar — el update del estado YA está hecho en DB,
      // que un email falle no debe romper la respuesta al admin.
      console.error('[admin] sendOrderStatusUpdate threw:', err?.message || err);
    }
  }

  return ok(res);
}

async function handleUpdateOrderTracking(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');

  const nro = String(body.nro_seguimiento || '').replace(/[<>"']/g, '').substring(0, 100);
  const url = String(body.url_seguimiento || '').replace(/[<>"'\s]/g, '').substring(0, 500);

  if (url && !/^https?:\/\//i.test(url)) {
    return fail(res, 400, 'invalid_url', 'La URL debe empezar con https://');
  }

  const { error } = await supabase
    .from('orders')
    .update({ nro_seguimiento: nro, url_seguimiento: url })
    .eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

/**
 * Archivar un pedido (soft delete).
 * Los archivados se ocultan de la lista principal pero no se pierden datos.
 * Reversible con unarchive_order.
 */
async function handleArchiveOrder(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');

  const { error } = await supabase
    .from('orders')
    .update({ archivado: true })
    .eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

/** Desarchivar un pedido — lo vuelve a mostrar en la lista principal. */
async function handleUnarchiveOrder(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');

  const { error } = await supabase
    .from('orders')
    .update({ archivado: false })
    .eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

/**
 * DELETE definitivo de un pedido.
 * - Irreversible. order_items cae por ON DELETE CASCADE (FK en schema).
 * - Requiere body.confirm === true para mitigar requests accidentales
 *   (defensa en profundidad; la confirmación primaria la hace el frontend).
 */
async function handleDeleteOrder(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');
  if (body.confirm !== true) return fail(res, 400, 'confirm_required');

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

// ═════════════════════════════════════════════════════════════════
// CUPONES
// ═════════════════════════════════════════════════════════════════
async function handleListCoupons(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res, { coupons: data || [] });
}

async function handleCreateCoupon(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const c = body.coupon || {};

  // Validaciones mínimas
  const codigo = String(c.codigo || '').trim().toUpperCase();
  if (!codigo) return fail(res, 400, 'codigo_required');

  // ── Sesión 33: detectar modo "descuenta personalización" ──
  // En ese modo, los campos tipo/valor/min_compra se ignoran
  // (el descuento se calcula por slots × items grabados).
  // Validamos que slots_cubiertos esté entre 1 y 4.
  const descuentaPers = c.descuenta_personalizacion === true;
  const slotsCub      = Number(c.personalizacion_slots_cubiertos) || 0;

  if (descuentaPers) {
    if (slotsCub < 1 || slotsCub > 4) {
      return fail(res, 400, 'slots_invalidos',
        'Cuando el cupón descuenta personalización, debés indicar entre 1 y 4 slots.');
    }
  } else {
    // Modo clásico: valor obligatorio > 0
    if (!c.valor || Number(c.valor) <= 0) return fail(res, 400, 'valor_required');
  }

  // ── Sesión 33: combinación excluyente nuevos vs repetidos ──
  // Un email no puede ser nuevo Y recurrente al mismo tiempo,
  // así que un cupón con ambas flags nunca aplicaría a nadie.
  // Bloqueamos a nivel API (defensa en profundidad junto al CHECK
  // constraint que ya creamos en Supabase).
  if (c.solo_clientes_nuevos === true && c.solo_clientes_repetidos === true) {
    return fail(res, 400, 'cupon_combinacion_invalida',
      'No podés marcar "solo nuevos" y "solo clientes recurrentes" al mismo tiempo.');
  }

  const row = {
    codigo,
    tipo:       c.tipo       || 'porcentaje',
    valor:      Number(c.valor) || 0,
    uso:        c.uso        || 'multiuso',
    min_compra: c.min_compra != null ? Number(c.min_compra) : 0,
    activo:     c.activo !== false,  // default true
    usos_count: 0,
    emails_usados: [],
    desde:      c.desde || null,   // formato YYYY-MM-DD
    hasta:      c.hasta || null,
    solo_clientes_repetidos:         c.solo_clientes_repetidos === true,  // Sesión 32
    solo_clientes_nuevos:            c.solo_clientes_nuevos === true,     // Sesión 33
    descuenta_personalizacion:       descuentaPers,                       // Sesión 33
    personalizacion_slots_cubiertos: descuentaPers ? slotsCub : 0,        // Sesión 33
  };

  const { data, error } = await supabase
    .from('coupons')
    .insert(row)
    .select()
    .maybeSingle();
  if (error) {
    if ((error.message || '').toLowerCase().includes('duplicate')) {
      return fail(res, 409, 'codigo_duplicate', 'Ya existe un cupón con ese código');
    }
    return fail(res, 500, 'db_error', error.message);
  }
  return ok(res, { coupon: data });
}

async function handleUpdateCoupon(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');

  // Solo campos whitelisted se pueden actualizar
  const allowed = [
    'codigo', 'tipo', 'valor', 'uso', 'min_compra', 'activo', 'desde', 'hasta',
    'solo_clientes_repetidos',                                                  // Sesión 32
    'solo_clientes_nuevos', 'descuenta_personalizacion',                        // Sesión 33
    'personalizacion_slots_cubiertos',                                          // Sesión 33
  ];
  const patch = {};
  for (const k of allowed) {
    if (body.patch && Object.prototype.hasOwnProperty.call(body.patch, k)) {
      patch[k] = body.patch[k];
    }
  }
  if (typeof patch.codigo === 'string') patch.codigo = patch.codigo.trim().toUpperCase();
  if (Object.keys(patch).length === 0) return fail(res, 400, 'nothing_to_update');

  const { error } = await supabase.from('coupons').update(patch).eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

async function handleDeleteCoupon(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

// ═════════════════════════════════════════════════════════════════
// PRODUCTOS
// ═════════════════════════════════════════════════════════════════
async function handleListProducts(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  // Traemos TODO (incluso inactivos), con colores y fotos embebidas.
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, slug, nombre, precio, descripcion, especificaciones,
      capacidad, dimensiones, material, nota,
      lleva_billetes, lleva_monedas, banner_url,
      permite_grabado_adelante, permite_grabado_interior,
      permite_grabado_atras, permite_grabado_texto,
      orden, activo, created_at, updated_at,
      product_colors (
        id, nombre, estado, precio_oferta, stock_bajo, orden,
        product_photos ( id, url, orden, es_principal )
      )
    `)
    .order('orden', { ascending: true });
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res, { products: data || [] });
}

/**
 * Upsert completo de un producto con sus colores y fotos.
 * Body: { action, password, product: { ... }, colors: [ { nombre, estado, precio_oferta, fotos:[url] } ] }
 *
 * Para simplificar y evitar inconsistencias, seguimos esta estrategia:
 *   1) upsert del producto por slug (si es nuevo, se crea; si existe, se actualiza).
 *   2) Delete de TODOS los product_colors del producto (cascadea fotos).
 *   3) Insert de todos los colores nuevos + sus fotos.
 *
 * Es atómico desde el punto de vista del cliente: si el paso 2 falla, no hay
 * cambios; si el paso 3 falla a la mitad, el admin puede reintentar.
 */
async function handleSaveProduct(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const p = body.product || {};
  const colors = Array.isArray(body.colors) ? body.colors : [];

  const nombre = String(p.nombre || '').trim();
  if (!nombre) return fail(res, 400, 'nombre_required');
  const precio = parseInt(p.precio, 10);
  if (!precio || precio <= 0) return fail(res, 400, 'precio_required');

  // Slug = nombre en minúsculas, con guiones. Solo generado automático si no vino.
  const slug = p.slug
    ? String(p.slug).trim().toLowerCase()
    : nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const productRow = {
    slug,
    nombre,
    precio,
    descripcion:      p.descripcion || '',
    especificaciones: Array.isArray(p.especificaciones) ? p.especificaciones : [],
    capacidad:        p.capacidad   || null,
    dimensiones:      p.dimensiones || null,
    material:         p.material    || null,
    nota:             p.nota        || null,
    lleva_billetes:   p.lleva_billetes === true || p.lleva_billetes === 'si',
    lleva_monedas:    p.lleva_monedas  === true || p.lleva_monedas  === 'si',
    orden:            parseInt(p.orden, 10) || 1,
    activo:           p.activo !== false,
    // Personalización láser (Sesión 28 Bloque B) — 4 toggles independientes.
    // Si no vienen en el payload, conservan FALSE como default seguro.
    permite_grabado_adelante: p.permite_grabado_adelante === true,
    permite_grabado_interior: p.permite_grabado_interior === true,
    permite_grabado_atras:    p.permite_grabado_atras    === true,
    permite_grabado_texto:    p.permite_grabado_texto    === true,
    // banner_url ya no se toca desde acá: vive en site_settings.hero_banner_url
    // y se gestiona vía las acciones get_setting / set_setting.
  };

  // 1) Upsert del producto
  const { data: upsertedProduct, error: upsertErr } = await supabase
    .from('products')
    .upsert(productRow, { onConflict: 'slug' })
    .select()
    .maybeSingle();
  if (upsertErr) return fail(res, 500, 'db_error', upsertErr.message);

  const productId = upsertedProduct.id;

  // 2) Borrar colores existentes (cascadea fotos)
  const { error: delErr } = await supabase
    .from('product_colors')
    .delete()
    .eq('product_id', productId);
  if (delErr) return fail(res, 500, 'db_error', delErr.message);

  // 3) Insertar colores + fotos
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const colorName = String(c.nombre || '').trim();
    if (!colorName) continue;

    const estado = ['activo','sin_stock','oferta'].includes(c.estado) ? c.estado : 'activo';
    const precioOferta = (estado === 'oferta' && c.precio_oferta)
      ? parseInt(c.precio_oferta, 10)
      : null;
    // Stock bajo: flag boolean independiente del estado. El frontend
    // (producto.html) ya ignora stock_bajo cuando estado === 'sin_stock',
    // así que no hace falta lógica extra acá.
    const stockBajo = c.stock_bajo === true;

    const { data: insertedColor, error: colorErr } = await supabase
      .from('product_colors')
      .insert({
        product_id:    productId,
        nombre:        colorName,
        estado,
        precio_oferta: precioOferta,
        stock_bajo:    stockBajo,
        orden:         i + 1,
      })
      .select()
      .maybeSingle();
    if (colorErr) return fail(res, 500, 'db_error', colorErr.message);

    // Fotos del color
    const fotos = Array.isArray(c.fotos) ? c.fotos.filter(u => u && u.trim()) : [];
    if (fotos.length > 0) {
      const photoRows = fotos.map((url, idx) => ({
        color_id:     insertedColor.id,
        url:          String(url).trim(),
        orden:        idx + 1,
        es_principal: idx === 0,
      }));
      const { error: photoErr } = await supabase.from('product_photos').insert(photoRows);
      if (photoErr) return fail(res, 500, 'db_error', photoErr.message);
    }
  }

  return ok(res, { id: productId });
}

async function handleDeleteProduct(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');
  // La FK de product_colors tiene ON DELETE CASCADE → elimina todo en cadena.
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

// ═════════════════════════════════════════════════════════════════
// SITE SETTINGS (banner y futuras configs)
// ═════════════════════════════════════════════════════════════════
async function handleGetSetting(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const key = String(body.key || '').trim();
  if (!key) return fail(res, 400, 'key_required');
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res, { value: data?.value ?? '' });
}

async function handleSetSetting(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const key = String(body.key || '').trim();
  if (!key) return fail(res, 400, 'key_required');
  const value = String(body.value ?? '');

  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

// ═════════════════════════════════════════════════════════════════
// STORAGE — URL firmada para subir foto al bucket
// ═════════════════════════════════════════════════════════════════
/**
 * Flujo de subida en 2 pasos:
 *   1) Frontend pide a /api/admin { action:"get_upload_url", filename, ... }.
 *      El servidor valida password y devuelve una URL firmada.
 *   2) Frontend hace PUT directo a esa URL con el binario de la imagen.
 *      El archivo queda en Supabase Storage bucket "product-photos".
 *      Como el bucket es público, la URL pública se puede armar y usar.
 *
 * Esto evita que el binario pase por Vercel (ahorra tiempo + límites).
 */
async function handleGetUploadUrl(body, res, req) {
  if (!requireAuth(body, res, req)) return;

  const filename = String(body.filename || '').trim();
  if (!filename) return fail(res, 400, 'filename_required');

  // Sanitizar: solo caracteres seguros para path, agregar timestamp.
  // Ejemplo: "Confort_Camel_foto1.jpg" → "confort-camel-foto1-1761234567890.jpg"
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const ext = safe.includes('.') ? safe.split('.').pop() : 'jpg';
  const base = safe.replace(/\.[^.]+$/, '') || 'photo';
  const path = `${base}-${Date.now()}.${ext}`;

  const { data, error } = await supabase
    .storage
    .from(BUCKET_PHOTOS)
    .createSignedUploadUrl(path);

  if (error) return fail(res, 500, 'storage_error', error.message);

  // URL pública que el frontend guardará en product_photos.url
  const { data: pubData } = supabase
    .storage
    .from(BUCKET_PHOTOS)
    .getPublicUrl(path);

  return ok(res, {
    path,                                  // ruta dentro del bucket
    uploadUrl: data.signedUrl,             // URL firmada para PUT
    token:     data.token,                 // (Supabase moderno incluye el token)
    publicUrl: pubData.publicUrl,          // URL pública final (la que se guarda en DB)
  });
}

// ═════════════════════════════════════════════════════════════════
// PERSONALIZACIÓN — handlers (Sesión 28 Bloque B)
// ─────────────────────────────────────────────────────────────────
// Tres grupos de handlers:
//   A) Leer imágenes privadas que subieron clientes → URL firmada de
//      lectura del bucket privado `personalizacion-uploads`.
//   B) Galería de ejemplos: CRUD sobre `personalizacion_examples` +
//      URL firmada para subir al bucket público
//      `personalizacion-examples` (mismo patrón que get_upload_url).
//   C) Toggles por producto: ya viven en columnas reales del schema
//      (permite_grabado_*) y se persisten via handleSaveProduct.
//      No hace falta handler dedicado.
// ═════════════════════════════════════════════════════════════════

const BUCKET_PERSONALIZ_UPLOADS  = 'personalizacion-uploads';
const BUCKET_PERSONALIZ_EXAMPLES = 'personalizacion-examples';

// ── A) Leer imagen privada del cliente ─────────────────────────
/**
 * Genera una URL firmada de LECTURA para una imagen subida por un
 * cliente al bucket privado. Requerida por el admin cuando ve un
 * pedido con personalización y necesita descargar/ver la imagen.
 *
 * Body: { action, password, path, expiresIn? }
 *   - path:      ruta interna dentro del bucket (ej "202605/abc-foto.jpg")
 *   - expiresIn: segundos de validez (default 3600 = 1 hora)
 */
async function handleGetPersonalizSignedUrl(body, res, req) {
  if (!requireAuth(body, res, req)) return;

  const path = String(body.path || '').trim();
  if (!path) return fail(res, 400, 'path_required');

  // Sanity check: que el path no escape el bucket (ataque de path traversal)
  if (path.includes('..') || path.startsWith('/') || path.includes('://')) {
    return fail(res, 400, 'invalid_path');
  }

  const expiresIn = parseInt(body.expiresIn, 10) || 3600;  // 1 hora por defecto

  const { data, error } = await supabase
    .storage
    .from(BUCKET_PERSONALIZ_UPLOADS)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('[admin] signed_url error:', error.message, { path });
    return fail(res, 500, 'storage_error', error.message);
  }

  return ok(res, {
    path,
    signedUrl: data.signedUrl,
    expiresIn,
  });
}

// ── B) Galería de ejemplos: listar ─────────────────────────────
async function handleListPersonalizExamples(body, res, req) {
  if (!requireAuth(body, res, req)) return;

  // Devolvemos TODO (incluye inactivos) para que el admin los gestione.
  // El frontend público filtra activo=true.
  const { data, error } = await supabase
    .from('personalizacion_examples')
    .select('id, tipo, url, descripcion, colores, modelos, orden, activo, created_at')
    .order('orden', { ascending: true });

  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res, { examples: data || [] });
}

// ── B) Galería de ejemplos: crear/actualizar ───────────────────
/**
 * Body: { action, password, example: { id?, tipo, url, descripcion, colores, orden, activo } }
 *   - Si trae id → UPDATE.
 *   - Si NO trae id → INSERT.
 */
async function handleSavePersonalizExample(body, res, req) {
  if (!requireAuth(body, res, req)) return;

  const ex = body.example || {};
  const tipo = String(ex.tipo || '').trim();
  const url  = String(ex.url  || '').trim();

  if (!['adelante', 'interior', 'atras', 'texto'].includes(tipo)) {
    return fail(res, 400, 'tipo_invalid');
  }
  if (!url) return fail(res, 400, 'url_required');

  // Normalizar colores a array de strings limpios (puede venir array o coma-sep)
  let colores = [];
  if (Array.isArray(ex.colores)) {
    colores = ex.colores.map(c => String(c || '').trim()).filter(Boolean);
  } else if (typeof ex.colores === 'string') {
    colores = ex.colores.split(',').map(c => c.trim()).filter(Boolean);
  }

  // Igual para modelos (Sesión 28b / fix galería). Si el array viene vacío,
  // significa "aplica a todos los modelos". Si tiene valores, restringe.
  let modelos = [];
  if (Array.isArray(ex.modelos)) {
    modelos = ex.modelos.map(m => String(m || '').trim()).filter(Boolean);
  } else if (typeof ex.modelos === 'string') {
    modelos = ex.modelos.split(',').map(m => m.trim()).filter(Boolean);
  }

  const row = {
    tipo,
    url,
    descripcion: String(ex.descripcion || '').trim() || null,
    colores,
    modelos,
    orden:       parseInt(ex.orden, 10) || 0,
    activo:      ex.activo !== false,
  };

  // Update si trae id, insert si no
  if (ex.id) {
    const { error } = await supabase
      .from('personalizacion_examples')
      .update(row)
      .eq('id', String(ex.id).trim());
    if (error) return fail(res, 500, 'db_error', error.message);
    return ok(res, { id: ex.id });
  } else {
    const { data, error } = await supabase
      .from('personalizacion_examples')
      .insert(row)
      .select('id')
      .maybeSingle();
    if (error) return fail(res, 500, 'db_error', error.message);
    return ok(res, { id: data?.id });
  }
}

// ── B) Galería de ejemplos: eliminar ───────────────────────────
async function handleDeletePersonalizExample(body, res, req) {
  if (!requireAuth(body, res, req)) return;
  const id = String(body.id || '').trim();
  if (!id) return fail(res, 400, 'id_required');

  const { error } = await supabase
    .from('personalizacion_examples')
    .delete()
    .eq('id', id);
  if (error) return fail(res, 500, 'db_error', error.message);
  return ok(res);
}

// ── B) Galería de ejemplos: URL firmada para subir foto ────────
/**
 * Mismo patrón que handleGetUploadUrl pero apuntando al bucket
 * público `personalizacion-examples`. La URL pública final se puede
 * construir y guardar en personalizacion_examples.url.
 */
async function handleGetPersonalizExampleUploadUrl(body, res, req) {
  if (!requireAuth(body, res, req)) return;

  const filename = String(body.filename || '').trim();
  if (!filename) return fail(res, 400, 'filename_required');

  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const ext = safe.includes('.') ? safe.split('.').pop() : 'jpg';
  const base = safe.replace(/\.[^.]+$/, '') || 'ejemplo';
  const path = `${base}-${Date.now()}.${ext}`;

  const { data, error } = await supabase
    .storage
    .from(BUCKET_PERSONALIZ_EXAMPLES)
    .createSignedUploadUrl(path);
  if (error) return fail(res, 500, 'storage_error', error.message);

  const { data: pubData } = supabase
    .storage
    .from(BUCKET_PERSONALIZ_EXAMPLES)
    .getPublicUrl(path);

  return ok(res, {
    path,
    uploadUrl: data.signedUrl,
    token:     data.token,
    publicUrl: pubData.publicUrl,
  });
}

// ═════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL — router por action
// ═════════════════════════════════════════════════════════════════
const ACTIONS = {
  login:                 handleLogin,
  list_orders:           handleListOrders,
  update_order_status:   handleUpdateOrderStatus,
  update_order_tracking: handleUpdateOrderTracking,
  archive_order:         handleArchiveOrder,
  unarchive_order:       handleUnarchiveOrder,
  delete_order:          handleDeleteOrder,
  list_coupons:          handleListCoupons,
  create_coupon:         handleCreateCoupon,
  update_coupon:         handleUpdateCoupon,
  delete_coupon:         handleDeleteCoupon,
  list_products:         handleListProducts,
  save_product:          handleSaveProduct,
  delete_product:        handleDeleteProduct,
  get_setting:           handleGetSetting,
  set_setting:           handleSetSetting,
  get_upload_url:        handleGetUploadUrl,
  // ── Personalización láser (Sesión 28 Bloque B) ──
  get_personalizacion_signed_url:        handleGetPersonalizSignedUrl,
  list_personalizacion_examples:         handleListPersonalizExamples,
  save_personalizacion_example:          handleSavePersonalizExample,
  delete_personalizacion_example:        handleDeletePersonalizExample,
  get_personalizacion_example_upload_url: handleGetPersonalizExampleUploadUrl,
};

export default createHandler(async (req, res) => {
  const body   = parseBody(req);
  const action = String(body.action || '').trim();
  const fn = ACTIONS[action];
  if (!fn) return fail(res, 400, 'unknown_action', `action desconocida: "${action}"`);
  // Pasamos req a todos los handlers — los que no lo necesitan lo ignoran.
  // Login lo usa para rate limit (IP del cliente). En Bloque C lo usará
  // también para validar el header Authorization con JWT.
  return fn(body, res, req);
});
