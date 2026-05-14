// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/cleanup-personalizacion (Sesión 29 + 31 + 42 + 43)
// ─────────────────────────────────────────────────────────────────
// Cron de mantenimiento semanal — encapsula CUATRO tareas independientes:
//
//   A) Limpieza de imágenes obsoletas del bucket privado
//      `personalizacion-uploads` (Sesión 29 — Bloque C).
//
//   B) Limpieza de filas viejas de `rate_limits` (Sesión 31 — Bloque B).
//
//   C) Limpieza de fotos huérfanas del bucket `reviews-photos`
//      (Sesión 42 — Opción G del backlog).
//      Defensa contra el caso en que `delete_review` falla al borrar
//      del storage, o el cliente sube fotos pero no completa la reseña.
//
//   D) Envío de emails automáticos de RECOMPRA (Sesión 43 — Opción B).
//      A cada cliente con pedido en estado 'Entregado' cuyo `updated_at`
//      tiene ≥10 días Y aún no recibió email de recompra, le manda un
//      email con cupón de descuento (vencimiento +30 días, solo en texto).
//      Flag de dedup: columna `orders.recompra_email_sent_at`.
//      Feature OPT-IN: requiere env var `REPURCHASE_COUPON_CODE`;
//      si no está → skip silencioso.
//
// Por qué las tareas en un mismo cron:
//   Vercel Hobby permite 2 crons máximo y el segundo cron NO se
//   registra de forma estable en el panel (bug conocido del plan
//   gratuito — el deploy se hace, pero el cron no aparece). Solución:
//   un solo cron que ejecuta múltiples tareas en serie.
//   Cuando se pase a Vercel Pro en el futuro, separar de nuevo es
//   trivial (5 min de refactor).
//
// Modos de invocación:
//   1) GET  ?trigger=auto                            → cron auto (corre A + B + C + D)
//   2) POST { action: "get_cleanup_status",  ... }   → solo A (lectura)
//   3) POST { action: "run_cleanup_manual",  ... }   → solo A (manual)
//   4) POST { action: "list_cleanup_logs",   ... }   → historial (incluye A, C y D)
//   5) POST { action: "get_reviews_orphans_status",  ... }  → solo C (lectura)
//   6) POST { action: "run_reviews_orphans_manual",  ... }  → solo C (manual)
//   7) POST { action: "get_recompra_status",  ... }         → solo D (lectura)
//   8) POST { action: "run_recompra_manual",  ... }         → solo D (manual)
//
// Reglas de retención de IMÁGENES (tarea A):
//   🟡 Huérfanas (uploads sin orden): borrar a los 10 días
//   🟢 De pedidos activos: nunca se borran
//   🔵 De pedidos entregados: borrar a los 60 días desde la entrega
//
// Reglas de retención de RATE_LIMITS (tarea B):
//   🔵 Filas con created_at > 2 horas: se borran
//      (las ventanas más largas de rate limit son de 1 hora;
//       2h da margen contra races con requests en curso)
//
// Reglas de retención de FOTOS DE RESEÑAS (tarea C):
//   🟢 Referenciadas en `reviews.fotos_urls`: nunca se borran
//   🟡 Huérfanas con MÁS de 24h: se borran (tope 100/run)
//   🔵 Huérfanas con MENOS de 24h: NO se borran (cliente puede estar
//      en pleno upload mientras corre el cron)
//
// Reglas de envío de EMAILS DE RECOMPRA (tarea D):
//   ✉️  Candidatos: estado='Entregado' AND recompra_email_sent_at IS NULL
//                   AND updated_at <= now() - 10 days
//   ⏸️  Tope: 50 emails por corrida (si hay más, se distribuyen semana a semana)
//   🔁 Dedup: tras envío exitoso se setea recompra_email_sent_at = now()
//   ❌ Si email falla: NO se setea el flag → se reintenta la semana siguiente
//
// "Hace más de 60 días": como NO hay columna `fecha_entrega` explícita,
//   usamos `orders.updated_at` cuando estado = 'Entregado'. Si el admin
//   marca "Entregado" manualmente, updated_at se setea automáticamente
//   por el trigger de la tabla.
//
// Seguridad:
//   - GET ?trigger=auto solo se acepta si hay header "x-vercel-cron: 1"
//     que Vercel agrega automáticamente. Curl externo → 403.
//   - POST requiere auth admin (JWT bearer o password).
//
// Topes:
//   - MAX_DELETE_PER_RUN         = 500 (imágenes de personalización)
//   - MAX_REVIEW_DELETE_PER_RUN  = 100 (fotos de reseñas — más conservador)
//   - MAX_RECOMPRA_PER_RUN       = 50  (emails recompra — muy conservador,
//                                       protege rate limit de Resend)
//   - Rate_limits: sin tope (delete masivo en una query, filas triviales)
// ═════════════════════════════════════════════════════════════════

import { supabase, ok, fail, parseBody, buildCorsHeaders } from './_lib/supabase.js';
import { checkAdminAuth } from './_lib/admin-auth.js';
import { sendRecompraEmail } from './_lib/email.js';

const BUCKET = 'personalizacion-uploads';

const HUERFANA_DIAS      = 10;
const POST_ENTREGA_DIAS  = 60;
const MAX_DELETE_PER_RUN = 500;

// Sesión 42 — Tarea C: cleanup de fotos huérfanas de reseñas.
// `delete_review` borra las fotos del bucket online cuando se elimina la
// reseña desde el admin, pero si el storage falla (timeout, error de red)
// las fotos quedan huérfanas sin referencia en `reviews.fotos_urls`.
// También quedan huérfanas las fotos subidas durante el formulario que
// nunca llegaron a finalizar la creación de la reseña.
const BUCKET_REVIEWS_PHOTOS = 'reviews-photos';
// Margen de seguridad antes de borrar: nunca tocar archivos recién
// creados — el cliente podría estar en pleno upload mientras corre el cron.
const REVIEWS_MIN_AGE_HORAS = 24;
// Tope conservador: las fotos de reseñas son por naturaleza menos
// volumen que las de personalización, así que 100 es suficiente.
const MAX_REVIEW_DELETE_PER_RUN = 100;

async function listAllFiles() {
  const all = [];

  const { data: rootEntries, error: rootErr } = await supabase
    .storage
    .from(BUCKET)
    .list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });

  if (rootErr) throw new Error(`storage_list_root_failed: ${rootErr.message}`);

  for (const entry of (rootEntries || [])) {
    if (entry?.id && entry?.metadata) {
      all.push({
        path:       entry.name,
        size:       entry.metadata?.size || 0,
        created_at: entry.created_at || entry.updated_at,
      });
      continue;
    }

    const folder = entry.name;
    const { data: fileList, error: listErr } = await supabase
      .storage
      .from(BUCKET)
      .list(folder, { limit: 1000, offset: 0 });

    if (listErr) {
      console.warn(`[cleanup] no se pudo listar carpeta ${folder}:`, listErr.message);
      continue;
    }

    for (const f of (fileList || [])) {
      if (!f?.metadata) continue;
      all.push({
        path:       `${folder}/${f.name}`,
        size:       f.metadata?.size || 0,
        created_at: f.created_at || f.updated_at || new Date().toISOString(),
      });
    }
  }

  return all;
}

async function loadAlivePaths() {
  const { data: items, error } = await supabase
    .from('order_items')
    .select(`
      personalizacion,
      orders ( id, estado, updated_at )
    `)
    .not('personalizacion', 'is', null);

  if (error) throw new Error(`db_load_items_failed: ${error.message}`);

  const aliveSet     = new Set();
  const now          = Date.now();
  const sixtyDaysMs  = POST_ENTREGA_DIAS * 24 * 60 * 60 * 1000;

  for (const it of (items || [])) {
    const p = it.personalizacion;
    if (!p || typeof p !== 'object') continue;

    const order = it.orders;
    let canDelete = false;
    if (order && order.estado === 'Entregado') {
      const deliveredAt = new Date(order.updated_at || 0).getTime();
      if (deliveredAt > 0 && (now - deliveredAt) > sixtyDaysMs) {
        canDelete = true;
      }
    }
    if (canDelete) continue;

    for (const slot of ['adelante', 'interior', 'atras']) {
      const ref = p[slot];
      if (ref && typeof ref === 'object' && typeof ref.path === 'string' && ref.path) {
        aliveSet.add(ref.path);
      }
    }
  }

  return aliveSet;
}

function classifyFiles(allFiles, aliveSet) {
  const now       = Date.now();
  const tenDaysMs = HUERFANA_DIAS * 24 * 60 * 60 * 1000;

  const borrables = [];
  const vivas     = [];

  for (const f of allFiles) {
    if (aliveSet.has(f.path)) {
      vivas.push(f);
      continue;
    }
    const created = new Date(f.created_at || 0).getTime();
    const ageMs   = created > 0 ? (now - created) : 0;
    if (ageMs > tenDaysMs) borrables.push(f);
    else                   vivas.push(f);
  }

  return { borrables, vivas };
}

async function deleteBatch(paths) {
  if (!paths.length) return { borradas: 0, error: null };
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) return { borradas: 0, error: error.message };
  return { borradas: (data || []).length, error: null };
}

async function writeCleanupLog({ trigger, borradas, liberados_mb, detalle }) {
  try {
    const { error } = await supabase
      .from('cleanup_logs')
      .insert({ trigger, borradas, liberados_mb, detalle });
    if (error) console.warn('[cleanup] no se pudo escribir cleanup_logs:', error.message);
  } catch (e) {
    console.warn('[cleanup] excepción escribiendo cleanup_logs:', e?.message || e);
  }
}

async function computeStatus() {
  const [allFiles, aliveSet] = await Promise.all([
    listAllFiles(),
    loadAlivePaths(),
  ]);

  const cls           = classifyFiles(allFiles, aliveSet);
  const totalSize     = allFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  const borrablesSize = cls.borrables.reduce((acc, f) => acc + (f.size || 0), 0);

  return {
    total_imagenes:  allFiles.length,
    total_mb:        +(totalSize / 1024 / 1024).toFixed(2),
    vivas_count:     cls.vivas.length,
    borrables_count: cls.borrables.length,
    borrables_mb:    +(borrablesSize / 1024 / 1024).toFixed(2),
    paths_borrables: cls.borrables.map(f => f.path),
  };
}

async function executeCleanup(trigger) {
  const status = await computeStatus();

  let pathsToDelete = status.paths_borrables;
  let capped = false;
  if (pathsToDelete.length > MAX_DELETE_PER_RUN) {
    capped = true;
    console.warn(`[cleanup] ${pathsToDelete.length} archivos para borrar — limitando a ${MAX_DELETE_PER_RUN}`);
    pathsToDelete = pathsToDelete.slice(0, MAX_DELETE_PER_RUN);
  }

  const { borradas, error } = await deleteBatch(pathsToDelete);
  const liberados_mb = status.borrables_count > 0
    ? +((borradas / status.borrables_count) * status.borrables_mb).toFixed(2)
    : 0;

  await writeCleanupLog({
    trigger,
    borradas,
    liberados_mb,
    detalle: {
      total_imagenes:  status.total_imagenes,
      vivas_count:     status.vivas_count,
      borrables_count: status.borrables_count,
      capped,
      cap_limit:       capped ? MAX_DELETE_PER_RUN : null,
      delete_error:    error,
    },
  });

  return {
    borradas,
    liberados_mb,
    capped,
    cap_limit:    capped ? MAX_DELETE_PER_RUN : null,
    delete_error: error,
  };
}

// ═════════════════════════════════════════════════════════════════
// TAREA B — Cleanup de rate_limits (Sesión 31 Bloque B)
// ─────────────────────────────────────────────────────────────────
// Borra filas de `rate_limits` cuyo created_at sea más viejo que
// 2 horas. Esas filas ya no afectan ningún chequeo de rate limit
// (la ventana máxima es de 1 hora).
//
// Se ejecuta como parte del cron auto, después de la limpieza de
// imágenes. Si falla, NO interrumpe la función — loggea y sigue
// (el cron de imágenes ya completó su trabajo, no queremos perder
// ese resultado por un error secundario).
//
// No tiene endpoint público manual: la limpieza es automática y
// suficiente al ritmo semanal del cron.
// ═════════════════════════════════════════════════════════════════
const RATE_LIMITS_RETENCION_HORAS = 2;

async function cleanupRateLimits() {
  const cutoff = new Date(
    Date.now() - RATE_LIMITS_RETENCION_HORAS * 60 * 60 * 1000
  ).toISOString();

  try {
    const { error } = await supabase
      .from('rate_limits')
      .delete()
      .lt('created_at', cutoff);

    if (error) {
      console.error('[cleanup-rate-limits] error:',
        JSON.stringify({
          message: error.message || null,
          code:    error.code    || null,
          details: error.details || null,
          hint:    error.hint    || null,
        }));
      return { ok: false, cutoff, error: error.message };
    }

    console.log(`[cleanup-rate-limits] OK — filas anteriores a ${cutoff} eliminadas`);
    return { ok: true, cutoff };

  } catch (err) {
    console.error('[cleanup-rate-limits] excepción:', err?.message || String(err));
    return { ok: false, cutoff, error: String(err?.message || err) };
  }
}

// ═════════════════════════════════════════════════════════════════
// TAREA C — Cleanup de fotos huérfanas de RESEÑAS (Sesión 42)
// ─────────────────────────────────────────────────────────────────
// Detecta y borra archivos del bucket `reviews-photos` que NO están
// referenciados en `reviews.fotos_urls`. Dos casos típicos:
//
//   1) `delete_review` borró la reseña pero el `storage.remove` falló
//      (timeout, error transitorio de Supabase). El log queda en
//      Vercel logs pero las fotos quedan en el bucket sin dueño.
//
//   2) El cliente subió 1-3 fotos durante el formulario de reseña,
//      pero NO completó el `create` final (cerró pestaña, error de
//      validación, etc). Las fotos quedaron en el bucket.
//
// Salvaguardas:
//   • Solo se borra lo que tiene MÁS de 24 horas en el bucket.
//     Esto protege contra el caso "cliente en pleno upload AHORA":
//     una foto subida hace 30 segundos NO se borra aunque todavía no
//     esté referenciada (la reseña tarda otros 30 segundos en crearse).
//
//   • Tope MAX_REVIEW_DELETE_PER_RUN: limita a 100 borrados por
//     corrida. Si el bucket tiene más huérfanas (caso patológico),
//     se irán limpiando semana a semana sin riesgo.
//
//   • Lee TODA la tabla `reviews` para construir el set de vivas.
//     Es eficiente porque `fotos_urls` es text[] y el SELECT solo
//     trae esa columna — no hace falta join ni filtros.
//
// Estructura del bucket:
//   Las fotos viven en `YYYYMM/UID-slug.ext` (ver reviews.js línea 160).
//   `listAllReviewPhotos` recorre todas las subcarpetas YYYYMM.
// ═════════════════════════════════════════════════════════════════

/**
 * Lista todos los archivos del bucket reviews-photos, recursivamente
 * por subcarpetas YYYYMM. Devuelve [{ path, size, created_at }].
 */
async function listAllReviewPhotos() {
  const all = [];

  // Listar nivel raíz — devuelve folders (YYYYMM) y posibles archivos sueltos
  const { data: rootEntries, error: rootErr } = await supabase
    .storage
    .from(BUCKET_REVIEWS_PHOTOS)
    .list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });

  if (rootErr) throw new Error(`storage_list_reviews_root_failed: ${rootErr.message}`);

  for (const entry of (rootEntries || [])) {
    // Si el entry es un archivo (tiene id y metadata), va directo
    if (entry?.id && entry?.metadata) {
      all.push({
        path:       entry.name,
        size:       entry.metadata?.size || 0,
        created_at: entry.created_at || entry.updated_at,
      });
      continue;
    }

    // Si no tiene metadata, es una carpeta — recursión un nivel
    const folder = entry.name;
    const { data: fileList, error: listErr } = await supabase
      .storage
      .from(BUCKET_REVIEWS_PHOTOS)
      .list(folder, { limit: 1000, offset: 0 });

    if (listErr) {
      console.warn(`[cleanup-reviews] no se pudo listar carpeta ${folder}:`, listErr.message);
      continue;
    }

    for (const f of (fileList || [])) {
      if (!f?.metadata) continue;
      all.push({
        path:       `${folder}/${f.name}`,
        size:       f.metadata?.size || 0,
        created_at: f.created_at || f.updated_at || new Date().toISOString(),
      });
    }
  }

  return all;
}

/**
 * Lee todas las URLs en reviews.fotos_urls y extrae los paths internos
 * del bucket. Devuelve un Set de paths "vivos" (= referenciados).
 *
 * Formato esperado de URLs:
 *   https://<host>/storage/v1/object/public/reviews-photos/<path>
 */
async function loadAliveReviewPaths() {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('fotos_urls')
    .not('fotos_urls', 'is', null);

  if (error) throw new Error(`db_load_reviews_failed: ${error.message}`);

  const aliveSet = new Set();
  const marker   = `/storage/v1/object/public/${BUCKET_REVIEWS_PHOTOS}/`;

  for (const r of (reviews || [])) {
    const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls : [];
    for (const url of fotos) {
      const s   = String(url || '');
      const idx = s.indexOf(marker);
      if (idx === -1) continue;
      const path = s.slice(idx + marker.length);
      if (path) aliveSet.add(path);
    }
  }

  return aliveSet;
}

/**
 * Clasifica archivos en borrables (huérfanos con >24h) y vivos.
 * Los archivos huérfanos pero recientes (<24h) NO se borran — un cliente
 * podría estar en pleno upload mientras corre el cron.
 */
function classifyReviewPhotos(allFiles, aliveSet) {
  const now           = Date.now();
  const minAgeMs      = REVIEWS_MIN_AGE_HORAS * 60 * 60 * 1000;

  const borrables    = [];
  const vivas        = [];
  const recientes    = []; // huérfanos pero protegidos por el margen de 24h

  for (const f of allFiles) {
    if (aliveSet.has(f.path)) {
      vivas.push(f);
      continue;
    }
    const created = new Date(f.created_at || 0).getTime();
    const ageMs   = created > 0 ? (now - created) : 0;
    if (ageMs > minAgeMs) borrables.push(f);
    else                   recientes.push(f);
  }

  return { borrables, vivas, recientes };
}

/**
 * Ejecuta la limpieza completa de fotos huérfanas de reseñas.
 * Devuelve el resumen — NO tira, captura todos los errores internamente
 * para no interrumpir el cron que corre A → B → C en serie.
 */
async function cleanupReviewOrphans() {
  try {
    const [allFiles, aliveSet] = await Promise.all([
      listAllReviewPhotos(),
      loadAliveReviewPaths(),
    ]);

    const cls = classifyReviewPhotos(allFiles, aliveSet);

    let pathsToDelete = cls.borrables.map(f => f.path);
    let capped = false;
    if (pathsToDelete.length > MAX_REVIEW_DELETE_PER_RUN) {
      capped = true;
      console.warn(`[cleanup-reviews] ${pathsToDelete.length} archivos para borrar — limitando a ${MAX_REVIEW_DELETE_PER_RUN}`);
      pathsToDelete = pathsToDelete.slice(0, MAX_REVIEW_DELETE_PER_RUN);
    }

    let borradas = 0;
    let deleteError = null;
    if (pathsToDelete.length > 0) {
      const { data, error } = await supabase
        .storage
        .from(BUCKET_REVIEWS_PHOTOS)
        .remove(pathsToDelete);
      if (error) {
        deleteError = error.message;
        console.error('[cleanup-reviews] delete error:', error.message);
      } else {
        borradas = (data || []).length;
      }
    }

    const borrablesSize = cls.borrables.reduce((acc, f) => acc + (f.size || 0), 0);
    const liberados_mb  = cls.borrables.length > 0
      ? +((borradas / cls.borrables.length) * (borrablesSize / 1024 / 1024)).toFixed(2)
      : 0;

    const summary = {
      total_fotos_bucket: allFiles.length,
      vivas_count:        cls.vivas.length,
      huerfanas_count:    cls.borrables.length,
      recientes_count:    cls.recientes.length,  // huérfanas pero <24h
      borradas,
      liberados_mb,
      capped,
      cap_limit:          capped ? MAX_REVIEW_DELETE_PER_RUN : null,
      delete_error:       deleteError,
    };

    // Logueamos en cleanup_logs con tipo distinguible en `detalle`.
    // Usamos trigger='auto' y borradas/liberados con los valores reales
    // para que el panel histórico del admin muestre la corrida.
    await writeCleanupLog({
      trigger:      'auto',
      borradas:     borradas,
      liberados_mb: liberados_mb,
      detalle: {
        tipo:               'reviews_orphans',  // ← distinguible del cleanup de imágenes
        total_fotos_bucket: summary.total_fotos_bucket,
        vivas_count:        summary.vivas_count,
        huerfanas_count:    summary.huerfanas_count,
        recientes_count:    summary.recientes_count,
        capped:             summary.capped,
        cap_limit:          summary.cap_limit,
        delete_error:       summary.delete_error,
      },
    });

    return summary;
  } catch (err) {
    console.error('[cleanup-reviews] excepción:', err?.message || String(err));
    return { ok: false, error: String(err?.message || err) };
  }
}

// ═════════════════════════════════════════════════════════════════
// TAREA D — Email automático de RECOMPRA (Sesión 43)
// ─────────────────────────────────────────────────────────────────
// Detecta pedidos entregados hace ≥10 días que aún no recibieron el
// email de recompra y los procesa: por cada uno envía un email con
// cupón de descuento y marca la columna `recompra_email_sent_at`
// para que no se repita.
//
// Feature OPT-IN — requiere env var `REPURCHASE_COUPON_CODE`:
//   • Si no está configurada → skip silencioso (log + return).
//   • Si está configurada pero el cupón no existe o está inactivo
//     en DB → skip con warning (no rompe el cron).
//
// Razones de diseño:
//   • El cupón se referencia por código vía env (no hardcoded en JS)
//     para que el admin pueda cambiarlo sin redeploy del código fuente.
//     Cambiar la env en Vercel + redeploy es <1 minuto.
//
//   • Vencimiento solo en TEXTO del email (+30 días). NO se valida en
//     DB. Si el admin quiere validación dura, debe setear `coupons.hasta`
//     manualmente en el admin. Decisión consciente (Sesión 43): mantener
//     simple para v1.
//
//   • Tope de 50 emails/run: protege rate limit de Resend (límite Free
//     es 100/día). 50/semana es ampliamente sostenible.
//
//   • Fail-safe: si un email falla, el flag NO se setea → se reintenta
//     la próxima semana. Si el cupón está mal configurado o Resend cae,
//     no perdemos pedidos pendientes.
//
//   • Update del flag SIN re-select: usamos UPDATE ... WHERE
//     recompra_email_sent_at IS NULL como defensa adicional contra
//     una doble corrida concurrente (race condition teórica).
// ═════════════════════════════════════════════════════════════════
const RECOMPRA_MIN_DIAS_POST_ENTREGA = 10;
const RECOMPRA_VENCIMIENTO_DIAS      = 30;
const MAX_RECOMPRA_PER_RUN           = 50;

// Meses en español para formatear la fecha de vencimiento del cupón.
// Se usa solo para el TEXTO del email (no para validación DB).
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Formatea una fecha como "13 de junio de 2026" (estilo español).
 * @param {Date} d
 * @returns {string}
 */
function formatFechaEs(d) {
  const dia  = d.getDate();
  const mes  = MESES_ES[d.getMonth()];
  const anio = d.getFullYear();
  return `${dia} de ${mes} de ${anio}`;
}

/**
 * Lee el cupón de recompra desde Supabase, dado el código del env.
 * Valida que esté activo y dentro de fechas (si tiene `hasta`).
 *
 * Devuelve null si:
 *   • La env REPURCHASE_COUPON_CODE no está seteada.
 *   • El cupón no existe en DB.
 *   • Está marcado inactivo.
 *   • Está fuera de fechas (desde / hasta).
 *
 * En todos esos casos: log warning y skip — no rompe el cron.
 *
 * @returns {Promise<null | { codigo, tipo, valor }>}
 */
async function loadRecompraCoupon() {
  const code = String(process.env.REPURCHASE_COUPON_CODE || '').trim();
  if (!code) {
    console.warn('[cleanup-recompra] REPURCHASE_COUPON_CODE no configurado — skip');
    return null;
  }

  const { data, error } = await supabase
    .from('coupons')
    .select('id, codigo, tipo, valor, activo, desde, hasta')
    .eq('codigo', code)
    .maybeSingle();

  if (error) {
    console.error('[cleanup-recompra] error leyendo cupón:', error.message);
    return null;
  }
  if (!data) {
    console.warn(`[cleanup-recompra] cupón "${code}" no existe en DB — skip`);
    return null;
  }
  if (data.activo !== true) {
    console.warn(`[cleanup-recompra] cupón "${code}" está inactivo — skip`);
    return null;
  }

  // Validación de fechas (si las tiene)
  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (data.desde && hoy < data.desde) {
    console.warn(`[cleanup-recompra] cupón "${code}" aún no vigente (desde=${data.desde}) — skip`);
    return null;
  }
  if (data.hasta && hoy > data.hasta) {
    console.warn(`[cleanup-recompra] cupón "${code}" vencido (hasta=${data.hasta}) — skip`);
    return null;
  }

  return { codigo: data.codigo, tipo: data.tipo, valor: data.valor };
}

/**
 * Busca pedidos candidatos para recibir el email de recompra.
 * Criterios:
 *   • estado = 'Entregado'
 *   • recompra_email_sent_at IS NULL (no enviado aún)
 *   • updated_at <= now() - 10 días (entregado hace ≥10 días)
 *   • Tope MAX_RECOMPRA_PER_RUN
 *
 * Se ordena por updated_at ASC (los más viejos primero) para que si
 * hay backlog se vacíe primero la cola anterior.
 *
 * @returns {Promise<Array<{id, numero, nombre, email}>>}
 */
async function findRecompraCandidates() {
  const cutoffIso = new Date(
    Date.now() - RECOMPRA_MIN_DIAS_POST_ENTREGA * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from('orders')
    .select('id, numero, nombre, email')
    .eq('estado', 'Entregado')
    .is('recompra_email_sent_at', null)
    .lte('updated_at', cutoffIso)
    .order('updated_at', { ascending: true })
    .limit(MAX_RECOMPRA_PER_RUN);

  if (error) {
    throw new Error(`db_load_recompra_candidates_failed: ${error.message}`);
  }
  return data || [];
}

/**
 * Marca un pedido como "email de recompra enviado" seteando el
 * timestamp en la columna recompra_email_sent_at.
 *
 * Usa filtro adicional `recompra_email_sent_at IS NULL` como defensa
 * contra una eventual doble corrida del cron (race condition teórica
 * en caso de retry de Vercel). Si otra corrida ya marcó el flag,
 * este UPDATE no afecta filas — no es error.
 */
async function markRecompraSent(orderId, sentAtIso) {
  const { error } = await supabase
    .from('orders')
    .update({ recompra_email_sent_at: sentAtIso })
    .eq('id', orderId)
    .is('recompra_email_sent_at', null);

  if (error) {
    console.error(`[cleanup-recompra] error marcando flag para ${orderId}:`, error.message);
    return false;
  }
  return true;
}

/**
 * Ejecuta la tarea D completa: detecta candidatos, envía emails y
 * marca flags. Nunca tira — captura todos los errores internamente
 * para no interrumpir el cron que corre A → B → C → D en serie.
 *
 * Modo solo lectura (dryRun=true): devuelve el conteo de candidatos
 * sin enviar nada. Usado por la acción POST get_recompra_status para
 * mostrar en el admin "hay X pedidos pendientes de recompra".
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.dryRun=false] si true, no envía emails (solo cuenta)
 */
async function processRecompraEmails(opts = {}) {
  const dryRun = opts.dryRun === true;

  try {
    const coupon = await loadRecompraCoupon();
    if (!coupon) {
      return {
        ok: true,
        skipped: true,
        reason: 'no_coupon_configured',
        sent: 0,
        failed: 0,
        candidates: 0,
      };
    }

    const candidates = await findRecompraCandidates();

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        candidates: candidates.length,
        coupon_code: coupon.codigo,
      };
    }

    if (candidates.length === 0) {
      return {
        ok: true,
        sent: 0,
        failed: 0,
        candidates: 0,
        coupon_code: coupon.codigo,
      };
    }

    // Calculamos la fecha de vencimiento del cupón (texto solamente).
    // +30 días desde HOY (la fecha en que sale el email).
    const expDate  = new Date(Date.now() + RECOMPRA_VENCIMIENTO_DIAS * 24 * 60 * 60 * 1000);
    const expiraEn = formatFechaEs(expDate);

    const couponInfo = {
      codigo:   coupon.codigo,
      tipo:     coupon.tipo,
      valor:    coupon.valor,
      expiraEn,
    };

    let sent   = 0;
    let failed = 0;
    const errors = [];

    // Procesamos en serie. Resend acepta paralelismo pero serializar
    // mantiene el rate-limit de Resend Free (100/día) bien controlado
    // y permite parar limpiamente si hay error transitorio.
    for (const order of candidates) {
      const result = await sendRecompraEmail(order, couponInfo);
      if (result?.ok) {
        const flagSet = await markRecompraSent(order.id, new Date().toISOString());
        if (flagSet) {
          sent++;
        } else {
          // El email salió pero el flag no se pudo marcar. NO contamos
          // como failed porque el cliente sí recibió el email; solo
          // loggeamos para que vos veas en logs si pasa.
          console.warn(`[cleanup-recompra] email OK pero flag NO seteado — ${order.numero}`);
          sent++;
        }
      } else {
        failed++;
        errors.push({
          numero: order.numero,
          error:  result?.error || 'unknown',
        });
        console.error(`[cleanup-recompra] email falló — ${order.numero}: ${result?.error || 'unknown'}`);
      }
    }

    const summary = {
      ok: true,
      candidates: candidates.length,
      sent,
      failed,
      coupon_code:    coupon.codigo,
      coupon_valor:   coupon.valor,
      coupon_tipo:    coupon.tipo,
      vencimiento_en: expiraEn,
      errors:         errors.length > 0 ? errors : undefined,
    };

    // Log en cleanup_logs con discriminador `tipo='recompra_emails'`
    // para que el panel histórico del admin pueda distinguir.
    await writeCleanupLog({
      trigger:      'auto',
      borradas:     sent,           // reusamos columna `borradas` como "procesadas"
      liberados_mb: 0,              // no aplica para emails
      detalle: {
        tipo:           'recompra_emails',  // ← distinguible de los otros logs
        candidates:     candidates.length,
        sent,
        failed,
        coupon_code:    coupon.codigo,
        coupon_valor:   coupon.valor,
        vencimiento_en: expiraEn,
        capped:         candidates.length === MAX_RECOMPRA_PER_RUN,
      },
    });

    return summary;
  } catch (err) {
    console.error('[cleanup-recompra] excepción:', err?.message || String(err));
    return { ok: false, error: String(err?.message || err) };
  }
}


export default async function handler(req, res) {
  // CORS dinámico — siempre aplicar antes de cualquier respuesta
  const cors = buildCorsHeaders(req);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!supabase) {
    return fail(res, 500, 'server_misconfigured',
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }

  try {
    if (req.method === 'GET') {
      const url     = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const trigger = url.searchParams.get('trigger');

      if (trigger === 'auto') {
        const isCron = req.headers['x-vercel-cron'] === '1';
        if (!isCron) {
          return fail(res, 403, 'forbidden',
            'Solo Vercel Cron puede disparar trigger=auto');
        }

        // Ejecutamos las CUATRO tareas en serie. Si la primera falla
        // tira excepción y va al catch — no llegamos a las siguientes.
        // Si la segunda, tercera o cuarta fallan, quedan loggeadas pero NO rompen
        // la respuesta del cron (las anteriores ya quedaron persistidas
        // en cleanup_logs y vale la pena reportarlas).
        const cleanupImagesResult     = await executeCleanup('auto');
        console.log('[cleanup-images] auto-run completed:', cleanupImagesResult);

        const cleanupRateLimitsResult = await cleanupRateLimits();
        console.log('[cleanup-rate-limits] auto-run completed:', cleanupRateLimitsResult);

        // Sesión 42 — Tarea C: fotos huérfanas de reseñas.
        const cleanupReviewOrphansResult = await cleanupReviewOrphans();
        console.log('[cleanup-reviews] auto-run completed:', cleanupReviewOrphansResult);

        // Sesión 43 — Tarea D: emails automáticos de recompra.
        const recompraResult = await processRecompraEmails();
        console.log('[cleanup-recompra] auto-run completed:', recompraResult);

        return ok(res, {
          images:         cleanupImagesResult,
          rate_limits:    cleanupRateLimitsResult,
          review_orphans: cleanupReviewOrphansResult,
          recompra:       recompraResult,
        });
      }

      return fail(res, 400, 'unknown_mode',
        'Modo no soportado en GET. Usá ?trigger=auto (solo cron).');
    }

    if (req.method === 'POST') {
      const body   = parseBody(req);
      const action = String(body.action || '').trim();

      // Sesión 31 Bloque C: auth compartida (JWT bearer o password)
      const auth = checkAdminAuth(req, body);
      if (!auth.ok) {
        const msg = auth.error === 'invalid_token'
          ? 'Token inválido o expirado'
          : 'Contraseña incorrecta';
        return fail(res, 401, 'unauthorized', msg);
      }

      if (action === 'get_cleanup_status') {
        const status = await computeStatus();
        return ok(res, status);
      }

      if (action === 'run_cleanup_manual') {
        const result = await executeCleanup('manual');
        return ok(res, result);
      }

      if (action === 'list_cleanup_logs') {
        const limit = Math.min(parseInt(body.limit, 10) || 10, 50);
        const { data, error } = await supabase
          .from('cleanup_logs')
          .select('id, ejecutado_at, trigger, borradas, liberados_mb, detalle')
          .order('ejecutado_at', { ascending: false })
          .limit(limit);
        if (error) return fail(res, 500, 'db_error', error.message);
        return ok(res, { logs: data || [] });
      }

      // Sesión 42 — manejo manual de la Tarea C (fotos huérfanas reseñas)
      if (action === 'get_reviews_orphans_status') {
        // Solo lectura — útil para mostrar en el admin "hay X huérfanas".
        try {
          const [allFiles, aliveSet] = await Promise.all([
            listAllReviewPhotos(),
            loadAliveReviewPaths(),
          ]);
          const cls = classifyReviewPhotos(allFiles, aliveSet);
          const borrablesSize = cls.borrables.reduce((acc, f) => acc + (f.size || 0), 0);
          return ok(res, {
            total_fotos_bucket: allFiles.length,
            vivas_count:        cls.vivas.length,
            huerfanas_count:    cls.borrables.length,
            recientes_count:    cls.recientes.length,
            huerfanas_mb:       +(borrablesSize / 1024 / 1024).toFixed(2),
          });
        } catch (err) {
          return fail(res, 500, 'cleanup_reviews_status_error', String(err?.message || err));
        }
      }

      if (action === 'run_reviews_orphans_manual') {
        // Disparo manual desde el admin. Útil si vos detectás que hubo un
        // delete_review con error y querés limpiar sin esperar al cron.
        const result = await cleanupReviewOrphans();
        return ok(res, result);
      }

      // Sesión 43 — manejo manual de la Tarea D (emails de recompra)
      if (action === 'get_recompra_status') {
        // Solo lectura. Devuelve cuántos pedidos están pendientes
        // de email de recompra sin enviar nada.
        const result = await processRecompraEmails({ dryRun: true });
        return ok(res, result);
      }

      if (action === 'run_recompra_manual') {
        // Disparo manual del envío de emails de recompra. Útil para
        // testear la feature recién configurada o forzar una corrida
        // sin esperar al domingo.
        const result = await processRecompraEmails();
        return ok(res, result);
      }

      return fail(res, 400, 'unknown_action', `action desconocida: "${action}"`);
    }

    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    console.error('[cleanup-personalizacion] error:', err);
    return fail(res, 500, 'internal_error', String(err?.message || err));
  }
}
