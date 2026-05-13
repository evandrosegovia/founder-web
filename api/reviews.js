// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/reviews
// ─────────────────────────────────────────────────────────────────
// Endpoint POST PÚBLICO (sin auth) que el cliente usa para:
//
//   action = "get"             → consultar si un pedido ya tiene reseña.
//                                Body: { order_id, email }
//
//   action = "get_upload_url"  → generar URL firmada de subida al bucket
//                                público reviews-photos. El cliente sube
//                                la foto directo a Supabase Storage.
//                                Body: { filename, mime }
//
//   action = "create"          → crear la reseña + autorizar al email a
//                                usar el cupón de recompensa.
//                                Body: { order_id, email, rating, texto,
//                                        fotos_urls, author_location }
//
// Por qué un solo endpoint con "action" en vez de varios:
//   - Mismo patrón que /api/admin: facilita CORS, rate-limit y logging
//     centralizados.
//   - El cliente hace SOLO POST (más simple en el frontend).
//   - Si en el futuro agregamos action="edit" o action="report", entra
//     en el mismo archivo sin tocar la lista de endpoints de Vercel.
//
// Protecciones aplicadas:
//   - Rate limit por IP (acción "create_review") → frena spam.
//   - Validación de que el order_id + email coinciden y el pedido está
//     en estado "Entregado" (defensa en profundidad: el frontend ya filtra
//     pero el backend re-valida).
//   - Sanitización del texto: trim, longitud 10-1000 chars (también
//     validado por el CHECK constraint de la tabla).
//   - Sanitización del rating: integer 1-5.
//   - fotos_urls: máximo 3, deben ser URLs del bucket esperado.
//   - Validación de MIME y extensión en get_upload_url.
//
// Filosofía de "no fallar al cliente por errores secundarios":
//   - Si el cupón de recompensa no se puede autorizar (no hay cupón
//     activo con la flag), la reseña se crea igual y devolvemos
//     reward_coupon = null. El cliente ve un mensaje neutro de "gracias".
//   - Si el email post-reseña falla, la reseña ya quedó guardada. Se
//     dispara como fire-and-forget con timeout.
// ═════════════════════════════════════════════════════════════════

import { supabase, createHandler, ok, fail, parseBody } from './_lib/supabase.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { sendReviewThankYou } from './_lib/email.js';
import crypto from 'node:crypto';

const BUCKET = 'reviews-photos';

// MIME types aceptados — espejo del bucket en Supabase.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

// Límites de contenido (espejo del CHECK constraint en SQL).
const TEXTO_MIN = 10;
const TEXTO_MAX = 1000;
const FOTOS_MAX = 3;

// ═════════════════════════════════════════════════════════════════
// HANDLER
// ═════════════════════════════════════════════════════════════════
export default createHandler(async (req, res) => {
  const body   = parseBody(req);
  const action = String(body.action || '').trim();

  switch (action) {
    case 'get':
      return handleGet(body, res);
    case 'get_upload_url':
      return handleGetUploadUrl(body, res);
    case 'create':
      return handleCreate(body, res, req);
    case 'list_public':
      return handleListPublic(body, res);
    default:
      return fail(res, 400, 'invalid_action');
  }
});

// ─────────────────────────────────────────────────────────────────
// ACTION: get
// Consulta si un pedido ya tiene reseña. Se usa al cargar seguimiento.
// Devuelve { review: {...} } si existe, { review: null } si no.
// ─────────────────────────────────────────────────────────────────
async function handleGet(body, res) {
  const orderId = String(body.order_id || '').trim();
  const email   = String(body.email    || '').trim().toLowerCase();

  if (!orderId) return fail(res, 400, 'order_id_required');
  if (!email)   return fail(res, 400, 'email_required');

  // Validamos que el pedido existe y pertenece a ese email antes de
  // devolver info. Defensa-en-profundidad contra enumeración.
  const { data: order, error: ordErr } = await supabase
    .from('orders')
    .select('id, email, estado, numero, nombre, apellido')
    .eq('id', orderId)
    .ilike('email', email)
    .maybeSingle();

  if (ordErr) return fail(res, 500, 'db_error', ordErr.message);
  if (!order) return fail(res, 404, 'order_not_found');

  // Buscar la reseña (puede no existir todavía)
  const { data: review, error: revErr } = await supabase
    .from('reviews')
    .select('id, rating, texto, fotos_urls, estado, reward_coupon_codigo, created_at')
    .eq('order_id', orderId)
    .maybeSingle();

  if (revErr) return fail(res, 500, 'db_error', revErr.message);

  return ok(res, {
    review: review || null,
    order_estado: order.estado,  // el frontend usa esto para decidir si mostrar form
  });
}

// ─────────────────────────────────────────────────────────────────
// ACTION: get_upload_url
// Genera URL firmada para subir UNA foto al bucket público.
// El cliente la usa antes de submit, una vez por foto.
// ─────────────────────────────────────────────────────────────────
async function handleGetUploadUrl(body, res) {
  const filename = String(body.filename || '').trim();
  const mime     = String(body.mime     || '').trim().toLowerCase();

  if (!filename) return fail(res, 400, 'filename_required');
  if (!mime)     return fail(res, 400, 'mime_required');

  if (!ALLOWED_MIME.has(mime)) {
    return fail(res, 400, 'mime_not_allowed',
      'Tipo de archivo no permitido. Aceptamos: JPG, PNG, WEBP.');
  }

  // Path estructurado: yyyymm/<uuid>-<slug>.<ext>
  // Prefijo mensual facilita auditoría y eventual limpieza por antigüedad.
  const ext  = MIME_TO_EXT[mime];
  const uid  = crypto.randomBytes(4).toString('hex');
  const slug = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'review';

  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  const path = `${yyyymm}/${uid}-${slug}.${ext}`;

  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    console.error('[reviews/upload_url] storage error:', error.message, { path });
    return fail(res, 500, 'storage_error',
      'No pudimos preparar la subida. Intentá de nuevo.');
  }

  // Construir URL pública final (la que se va a guardar en reviews.fotos_urls)
  const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return ok(res, {
    path,                                 // ruta interna en bucket
    uploadUrl: data.signedUrl,            // URL firmada para PUT
    token:     data.token,
    publicUrl: pubData.publicUrl,         // URL pública final
    bucket:    BUCKET,
  });
}

// ─────────────────────────────────────────────────────────────────
// ACTION: create
// Crea la reseña + autoriza al email a usar el cupón de recompensa.
// ─────────────────────────────────────────────────────────────────
async function handleCreate(body, res, req) {
  // Rate limit (anti-spam por IP)
  if (!(await enforceRateLimit('create_review', req, res))) return;

  // ── Parseo y validación de inputs ──────────────────────────────
  const orderId = String(body.order_id || '').trim();
  const email   = String(body.email    || '').trim().toLowerCase();
  const rating  = parseInt(body.rating, 10);
  const texto   = String(body.texto    || '').trim();
  const location = String(body.author_location || '').trim().slice(0, 60);

  if (!orderId)         return fail(res, 400, 'order_id_required');
  if (!email)           return fail(res, 400, 'email_required');
  if (!rating || rating < 1 || rating > 5) {
    return fail(res, 400, 'rating_invalid',
      'La calificación debe ser un número del 1 al 5.');
  }
  if (texto.length < TEXTO_MIN) {
    return fail(res, 400, 'texto_too_short',
      `La reseña debe tener al menos ${TEXTO_MIN} caracteres.`);
  }
  if (texto.length > TEXTO_MAX) {
    return fail(res, 400, 'texto_too_long',
      `La reseña no puede superar los ${TEXTO_MAX} caracteres.`);
  }

  // fotos_urls: array, máximo 3, debe ser URL del bucket esperado
  const fotosRaw = Array.isArray(body.fotos_urls) ? body.fotos_urls : [];
  if (fotosRaw.length > FOTOS_MAX) {
    return fail(res, 400, 'fotos_too_many',
      `Máximo ${FOTOS_MAX} fotos por reseña.`);
  }
  const fotos = fotosRaw
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter(u => u.includes(`/storage/v1/object/public/${BUCKET}/`));
  // Si pasaron URLs inválidas, las descartamos silenciosamente (mejor que
  // fallar — la reseña sin foto sigue siendo válida).

  // ── Validar que el pedido existe, pertenece al email y está Entregado ──
  const { data: order, error: ordErr } = await supabase
    .from('orders')
    .select(`
      id, numero, email, estado,
      nombre, apellido,
      order_items ( product_name, color )
    `)
    .eq('id', orderId)
    .ilike('email', email)
    .maybeSingle();

  if (ordErr) return fail(res, 500, 'db_error', ordErr.message);
  if (!order) return fail(res, 404, 'order_not_found',
    'No encontramos un pedido con esos datos.');

  if (order.estado !== 'Entregado') {
    return fail(res, 400, 'order_not_delivered',
      'Solo podés dejar una reseña cuando tu pedido figure como entregado.');
  }

  // ── Verificar que no haya reseña previa para este pedido ──────────
  // (También está garantizado por el UNIQUE constraint, pero damos
  // mensaje claro antes que esperar el error de DB)
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (existing) {
    return fail(res, 409, 'already_reviewed',
      'Ya dejaste una reseña para este pedido.');
  }

  // ── Resolver producto reseñado ─────────────────────────────────
  // Usamos el primer item del pedido como "producto principal".
  // Si en algún momento permitimos reseñas por item, refactorizamos.
  const firstItem  = (order.order_items || [])[0] || {};
  const productName = firstItem.product_name || 'Founder';
  const productColor = firstItem.color || null;

  // Lookup del product_id por nombre (puede ser null si el producto fue borrado)
  let productId = null;
  if (productName) {
    const slug = productName.replace(/^Founder\s+/i, '').toLowerCase().trim();
    const { data: prod } = await supabase
      .from('products')
      .select('id')
      .or(`nombre.ilike.${productName},slug.ilike.%${slug}%`)
      .limit(1)
      .maybeSingle();
    productId = prod?.id || null;
  }

  const authorName = `${order.nombre || ''} ${(order.apellido || '').charAt(0)}.`.trim();

  // ── Insertar la reseña ─────────────────────────────────────────
  const { data: review, error: insErr } = await supabase
    .from('reviews')
    .insert({
      order_id:        orderId,
      product_id:      productId,
      product_name:    productName,
      product_color:   productColor,
      author_email:    email,
      author_name:     authorName,
      author_location: location || null,
      rating,
      texto,
      fotos_urls:      fotos,
      estado:          'pendiente',  // siempre arranca pendiente
    })
    .select('id, created_at')
    .single();

  if (insErr) {
    console.error('[reviews/create] insert error:', insErr.message);
    return fail(res, 500, 'db_error',
      'No pudimos guardar tu reseña. Intentá de nuevo en un momento.');
  }

  // ── Autorizar al email a usar el cupón de recompensa ──────────
  // Si no hay cupón configurado, la reseña queda sin recompensa y
  // devolvemos reward_coupon = null. NO fallamos al cliente.
  let rewardCoupon = null;
  try {
    const { data: rewardRows } = await supabase.rpc('get_review_reward_coupon');
    const reward = Array.isArray(rewardRows) ? rewardRows[0] : rewardRows;

    if (reward && reward.id && reward.codigo) {
      // Insertar autorización (idempotente: si ya estaba, el UNIQUE lo bloquea
      // pero igual seguimos)
      const { error: authErr } = await supabase
        .from('coupon_authorized_emails')
        .insert({
          coupon_id:  reward.id,
          email,
          reason:     'review_reward',
          review_id:  review.id,
        });

      if (authErr && authErr.code !== '23505') {
        // 23505 = unique violation (el email ya estaba autorizado, no es error)
        console.error('[reviews/create] coupon auth error:', authErr.message);
      }

      // Persistir el código en la reseña para que el cliente lo vea
      await supabase
        .from('reviews')
        .update({ reward_coupon_codigo: reward.codigo })
        .eq('id', review.id);

      rewardCoupon = {
        codigo: reward.codigo,
        tipo:   reward.tipo,
        valor:  reward.valor,
      };
    }
  } catch (err) {
    console.error('[reviews/create] reward flow error:', err?.message || err);
    // sigue sin reward — no rompemos el flujo
  }

  // ── Disparar email de agradecimiento (fire-and-forget con timeout) ──
  // Patrón estándar del proyecto: Vercel mata la función al retornar, así
  // que necesitamos un mini-await con timeout para que tenga tiempo de salir.
  try {
    await Promise.race([
      sendReviewThankYou(order, {
        rating,
        texto,
        rewardCoupon,
      }),
      new Promise(resolve => setTimeout(resolve, 3500)),
    ]);
  } catch (err) {
    console.error('[reviews/create] email error:', err?.message || err);
  }

  return ok(res, {
    review_id:     review.id,
    reward_coupon: rewardCoupon,  // { codigo, tipo, valor } o null
  });
}

// ─────────────────────────────────────────────────────────────────
// ACTION: list_public
// Endpoint público de lectura — devuelve reseñas aprobadas filtradas
// opcionalmente por product_id. Lo usa producto.html para mostrar
// reseñas reales en lugar de las 4 mock históricas.
//
// Solo devuelve campos SAFE para mostrar al público:
//   - rating, texto, fotos_urls
//   - author_name (ya viene como "Juan P." desde el create)
//   - author_location (ej "Montevideo")
//   - created_at
// NUNCA devuelve: author_email, order_id, reward_coupon_codigo.
// ─────────────────────────────────────────────────────────────────
async function handleListPublic(body, res) {
  const productId   = String(body.product_id || '').trim();
  const productName = String(body.product_name || '').trim();
  const limit       = Math.min(parseInt(body.limit, 10) || 20, 50);

  let q = supabase
    .from('reviews')
    .select(`
      rating, texto, fotos_urls,
      author_name, author_location,
      product_name, product_color,
      created_at
    `)
    .eq('estado', 'aprobada')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Filtrar por producto: priorizar product_id (más exacto), después
  // product_name como fallback (por si la reseña vieja perdió la FK).
  if (productId) {
    q = q.eq('product_id', productId);
  } else if (productName) {
    q = q.ilike('product_name', productName);
  }

  const { data, error } = await q;
  if (error) return fail(res, 500, 'db_error', error.message);

  return ok(res, { reviews: data || [] });
}
