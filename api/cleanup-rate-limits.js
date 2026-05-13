// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/cleanup-rate-limits (Sesión 31 — Bloque B)
// ─────────────────────────────────────────────────────────────────
// Limpia filas viejas de la tabla `rate_limits`.
//
// Cómo se invoca:
//   GET  /api/cleanup-rate-limits?trigger=auto
//     → Solo Vercel Cron (header x-vercel-cron: 1). Curl externo → 403.
//
// Política de retención:
//   - Las ventanas más largas de rate limit son de 1 hora.
//   - Borramos filas con created_at más viejo que 2 horas
//     (margen de seguridad para evitar borrar una fila justo cuando
//     todavía debería contar).
//
// Por qué cron diario en vez de cada N inserts:
//   - Cron es deterministico, predecible y NO suma latencia al user.
//   - Volumen esperado: tráfico modesto → unas pocas miles de filas
//     por día. Borrarlas todas en una query es trivial.
//
// Por qué archivo separado (no integrado a cleanup-personalizacion):
//   - Single Responsibility: cada cron hace una cosa.
//   - El cleanup de imágenes corre 1× por semana (suficiente para
//     archivos lentos en crecer). El de rate limits debería correr
//     diario (filas crecen rápido).
// ═════════════════════════════════════════════════════════════════

import { supabase, ok, fail, buildCorsHeaders } from './_lib/supabase.js';

// Borramos filas más viejas que 2 horas. El máximo windowSec es 3600 (1h);
// 2h da margen para evitar race conditions con requests en curso.
const RETENCION_HORAS = 2;

export default async function handler(req, res) {
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

  if (req.method !== 'GET') {
    return fail(res, 405, 'method_not_allowed');
  }

  // Solo aceptamos invocación desde Vercel Cron.
  const url     = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const trigger = url.searchParams.get('trigger');

  if (trigger !== 'auto') {
    return fail(res, 400, 'unknown_mode',
      'Este endpoint solo acepta GET ?trigger=auto desde Vercel Cron.');
  }

  if (req.headers['x-vercel-cron'] !== '1') {
    return fail(res, 403, 'forbidden',
      'Solo Vercel Cron puede disparar trigger=auto');
  }

  try {
    const cutoff = new Date(Date.now() - RETENCION_HORAS * 60 * 60 * 1000).toISOString();

    // Borramos en una sola query. Supabase no devuelve count en DELETE
    // a menos que pidamos .select(), que en un cleanup masivo es caro.
    // Logueamos solo el éxito; si necesitamos contar exacto, podemos
    // hacerlo con un SELECT previo (no lo hacemos para optimizar).
    const { error } = await supabase
      .from('rate_limits')
      .delete()
      .lt('created_at', cutoff);

    if (error) {
      console.error('[cleanup-rate-limits] error:', error.message);
      return fail(res, 500, 'db_error', error.message);
    }

    console.log(`[cleanup-rate-limits] OK — filas anteriores a ${cutoff} eliminadas`);
    return ok(res, { cutoff });

  } catch (err) {
    console.error('[cleanup-rate-limits] excepción:', err);
    return fail(res, 500, 'internal_error', String(err?.message || err));
  }
}
