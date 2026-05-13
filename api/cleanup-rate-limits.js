// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/cleanup-rate-limits (Sesión 31 — Bloque B)
// ─────────────────────────────────────────────────────────────────
// Limpia filas viejas de la tabla `rate_limits`.
//
// Cómo se invoca:
//   GET  /api/cleanup-rate-limits?trigger=auto
//     → Solo Vercel Cron (header x-vercel-cron: 1). Curl externo → 403.
//
// Frecuencia: lunes 5 AM (ver vercel.json: "0 5 * * 1").
//
// Política de retención:
//   - Las ventanas más largas de rate limit son de 1 hora.
//   - Borramos filas con created_at más viejo que 2 horas
//     (las que ya no afectan ningún chequeo de rate limit).
//   - Como el cron corre 1 vez/semana, durante esa semana la tabla
//     acumula filas viejas, pero los índices (key + created_at)
//     hacen que el conteo siga siendo instantáneo. En escala de
//     miles de filas no hay impacto de performance.
//
// Por qué semanal y no diario:
//   - Vercel Hobby permite 2 crons máximo. El registro del segundo
//     cron en frecuencia diaria es inestable (no aparece en el panel).
//     Frecuencia semanal funciona consistentemente.
//   - El volumen de tráfico actual (e-commerce chico) genera pocas
//     filas/semana — no hay problema de performance ni de espacio.
//   - Si en algún momento el tráfico crece 10×, considerar pasar a
//     Vercel Pro y volver a cron diario.
//
// Por qué archivo separado (no integrado a cleanup-personalizacion):
//   - Single Responsibility: cada cron hace una cosa.
//   - Cuando agregue una limpieza más en el futuro, es trivial
//     extenderlo sin tocar el de imágenes.
// ═════════════════════════════════════════════════════════════════

import { supabase, ok, fail, buildCorsHeaders } from './_lib/supabase.js';

// Borramos filas más viejas que 2 horas. El máximo windowSec es 3600 (1h);
// 2h da margen para evitar race conditions con requests en curso.
// (No depende de la frecuencia del cron — siempre borramos lo que ya
// no puede afectar ningún chequeo de rate limit.)
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
