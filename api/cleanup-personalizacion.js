// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/cleanup-personalizacion (Sesión 29 — Bloque C)
// ─────────────────────────────────────────────────────────────────
// Limpia imágenes obsoletas del bucket privado `personalizacion-uploads`.
//
// Modos de invocación:
//   1) GET  ?trigger=auto       → cron automático (Vercel Cron, sin password)
//   2) POST { action: "get_cleanup_status",  password } → solo lee
//   3) POST { action: "run_cleanup_manual",  password } → borra
//   4) POST { action: "list_cleanup_logs",   password } → historial
//
// Reglas de retención:
//   🟡 Huérfanas (uploads sin orden): borrar a los 10 días
//   🟢 De pedidos activos: nunca se borran
//   🔵 De pedidos entregados: borrar a los 60 días desde la entrega
//
// "Hace más de 60 días": como NO hay columna `fecha_entrega` explícita,
//   usamos `orders.updated_at` cuando estado = 'Entregado'. Si el admin
//   marca "Entregado" manualmente, updated_at se setea automáticamente
//   por el trigger de la tabla.
//
// Seguridad:
//   - GET ?trigger=auto solo se acepta si hay header "x-vercel-cron: 1"
//     que Vercel agrega automáticamente. Curl externo → 403.
//   - POST requiere password admin.
//
// Tope: MAX_DELETE_PER_RUN = 500.
// ═════════════════════════════════════════════════════════════════

import { supabase, ok, fail, parseBody } from './_lib/supabase.js';
import crypto from 'node:crypto';

const BUCKET = 'personalizacion-uploads';

const HUERFANA_DIAS      = 10;
const POST_ENTREGA_DIAS  = 60;
const MAX_DELETE_PER_RUN = 500;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkAdminPassword(provided) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  return safeEqual(provided, expected);
}

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
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
        const result = await executeCleanup('auto');
        console.log('[cleanup] auto-run completed:', result);
        return ok(res, result);
      }

      return fail(res, 400, 'unknown_mode',
        'Modo no soportado en GET. Usá ?trigger=auto (solo cron).');
    }

    if (req.method === 'POST') {
      const body   = parseBody(req);
      const action = String(body.action || '').trim();

      if (!checkAdminPassword(body.password)) {
        return fail(res, 401, 'unauthorized', 'Contraseña incorrecta');
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

      return fail(res, 400, 'unknown_action', `action desconocida: "${action}"`);
    }

    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    console.error('[cleanup-personalizacion] error:', err);
    return fail(res, 500, 'internal_error', String(err?.message || err));
  }
}
