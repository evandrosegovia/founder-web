// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/cleanup-personalizacion (Sesión 29 + 31 + 42)
// ─────────────────────────────────────────────────────────────────
// Cron de mantenimiento semanal — encapsula TRES tareas independientes:
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
// Por qué las tareas en un mismo cron:
//   Vercel Hobby permite 2 crons máximo y el segundo cron NO se
//   registra de forma estable en el panel (bug conocido del plan
//   gratuito — el deploy se hace, pero el cron no aparece). Solución:
//   un solo cron que ejecuta múltiples tareas en serie.
//   Cuando se pase a Vercel Pro en el futuro, separar de nuevo es
//   trivial (5 min de refactor).
//
// Modos de invocación:
//   1) GET  ?trigger=auto                            → cron auto (corre A + B + C)
//   2) POST { action: "get_cleanup_status",  ... }   → solo A (lectura)
//   3) POST { action: "run_cleanup_manual",  ... }   → solo A (manual)
//   4) POST { action: "list_cleanup_logs",   ... }   → historial (incluye A y C)
//   5) POST { action: "get_reviews_orphans_status",  ... }  → solo C (lectura)
//   6) POST { action: "run_reviews_orphans_manual",  ... }  → solo C (manual)
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
//   - MAX_DELETE_PER_RUN       = 500 (imágenes de personalización)
//   - MAX_REVIEW_DELETE_PER_RUN = 100 (fotos de reseñas — más conservador)
//   - Rate_limits: sin tope (delete masivo en una query, filas triviales)
// ═════════════════════════════════════════════════════════════════

import { supabase, ok, fail, parseBody, buildCorsHeaders } from './_lib/supabase.js';
import { checkAdminAuth } from './_lib/admin-auth.js';

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

        // Ejecutamos las TRES tareas en serie. Si la primera falla
        // tira excepción y va al catch — no llegamos a las siguientes.
        // Si la segunda o tercera fallan, quedan loggeadas pero NO rompen
        // la respuesta del cron (las anteriores ya quedaron persistidas
        // en cleanup_logs y vale la pena reportarlas).
        const cleanupImagesResult     = await executeCleanup('auto');
        console.log('[cleanup-images] auto-run completed:', cleanupImagesResult);

        const cleanupRateLimitsResult = await cleanupRateLimits();
        console.log('[cleanup-rate-limits] auto-run completed:', cleanupRateLimitsResult);

        // Sesión 42 — Tarea C: fotos huérfanas de reseñas.
        const cleanupReviewOrphansResult = await cleanupReviewOrphans();
        console.log('[cleanup-reviews] auto-run completed:', cleanupReviewOrphansResult);

        return ok(res, {
          images:         cleanupImagesResult,
          rate_limits:    cleanupRateLimitsResult,
          review_orphans: cleanupReviewOrphansResult,
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

      return fail(res, 400, 'unknown_action', `action desconocida: "${action}"`);
    }

    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    console.error('[cleanup-personalizacion] error:', err);
    return fail(res, 500, 'internal_error', String(err?.message || err));
  }
}
