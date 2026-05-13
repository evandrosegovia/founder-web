// ═════════════════════════════════════════════════════════════════
// FOUNDER — Rate limiting para los endpoints /api/*
// ─────────────────────────────────────────────────────────────────
// Sesión 31 Bloque B: protección contra abuso (brute-force, spam,
// scraping, DoS de bajo volumen). Sliding window sobre Supabase.
//
// Cómo funciona:
//   1) Cada intento se registra como una fila en `rate_limits`
//      con key = "{accion}:{IP}" y created_at = now.
//   2) Antes de procesar, contamos filas con la misma key cuyo
//      created_at esté dentro de la ventana de tiempo.
//   3) Si excede el límite → 429. Si no → seguimos.
//
// Por qué sliding window y no fixed window:
//   - Fixed window ("contar por hora calendario") permite ráfagas
//     2× el límite en el borde (59min59s + 0min0s).
//   - Sliding window cuenta desde "hace X segundos hasta ahora",
//     no resetea, no permite ráfagas.
//
// Por qué Supabase y no Redis/KV:
//   - Cero infraestructura nueva.
//   - Volumen esperado (~100 req/min de tráfico real) está MUY
//     debajo de la capacidad de la DB.
//   - Cleanup semanal con el cron que ya tenemos.
//
// Identificación del cliente:
//   - Prioridad: x-forwarded-for (Vercel siempre lo setea con la
//     IP real del cliente como primer valor).
//   - Fallback: x-real-ip o req.socket.remoteAddress.
//   - En desarrollo local puede venir "::1" — válido para tests.
// ═════════════════════════════════════════════════════════════════

import { supabase } from './supabase.js';

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Extrae la IP del cliente desde la request.
 * Vercel pone la IP real en x-forwarded-for (primer valor).
 * Devolvemos un string normalizado, nunca null.
 */
export function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    // x-forwarded-for puede ser "IP1, IP2, IP3" — la primera es el cliente real
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  const xri = req.headers?.['x-real-ip'];
  if (xri) return String(xri).trim();
  const sock = req.socket?.remoteAddress || req.connection?.remoteAddress;
  return String(sock || 'unknown').trim();
}

// ── Función principal ────────────────────────────────────────────

/**
 * Chequea si una acción está dentro del límite para una IP.
 *
 * @param {string} action       Identificador único de la acción
 *                              (ej: "admin_login", "create_order").
 * @param {string} ip           IP del cliente (de getClientIp(req)).
 * @param {number} max          Máximo de intentos permitidos en la ventana.
 * @param {number} windowSec    Tamaño de la ventana en segundos.
 * @returns {Promise<{allowed: boolean, count: number, retryAfter: number}>}
 *
 * Comportamiento:
 *   - Si la DB falla, devolvemos { allowed: true } (fail-open).
 *     Mejor dejar pasar que romper el sitio si la DB tiene un hipo.
 *   - Si el cliente excede, devolvemos retryAfter en segundos
 *     (cuánto falta para que se libere el primer intento de la ventana).
 */
export async function checkRateLimit(action, ip, max, windowSec) {
  // Si por alguna razón Supabase no está inicializado, fail-open.
  if (!supabase) {
    console.warn('[rate-limit] supabase no inicializado — fail-open');
    return { allowed: true, count: 0, retryAfter: 0 };
  }

  const key = `${action}:${ip}`;
  const windowStart = new Date(Date.now() - windowSec * 1000).toISOString();

  try {
    // 1) Contar intentos en la ventana.
    //
    // Sintaxis: select('*', { count: 'exact', head: true }) es el patrón
    // oficial de Supabase para "solo count, sin data". El comportamiento
    // de head:true varía entre versiones del SDK — si en algún momento
    // dejara de funcionar, este try/catch + logging detallado lo detecta.
    //
    // Importante: cuando head:true está activo y la consulta es válida,
    // `data` viene null y `count` trae el número. El error solo aparece
    // si la tabla/columna/sintaxis es inválida.
    const countResult = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart);

    if (countResult.error) {
      // Logueamos TODO el error para diagnóstico — no solo .message,
      // porque algunos errores de Supabase vienen con .code, .details
      // o .hint y .message vacío.
      console.error('[rate-limit] count error:',
        JSON.stringify({
          message: countResult.error.message || null,
          code:    countResult.error.code    || null,
          details: countResult.error.details || null,
          hint:    countResult.error.hint    || null,
          status:  countResult.status        || null,
        }));
      return { allowed: true, count: 0, retryAfter: 0 }; // fail-open
    }

    const currentCount = countResult.count || 0;

    // 2) Si ya está al límite, calcular retryAfter mirando el más viejo
    if (currentCount >= max) {
      const oldestResult = await supabase
        .from('rate_limits')
        .select('created_at')
        .eq('key', key)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      let retryAfter = windowSec; // fallback conservador
      if (oldestResult.data?.created_at) {
        const oldestTime = new Date(oldestResult.data.created_at).getTime();
        const expiresAt  = oldestTime + windowSec * 1000;
        retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      }

      return { allowed: false, count: currentCount, retryAfter };
    }

    // 3) Está bajo el límite — registrar el intento y dejar pasar
    const insResult = await supabase
      .from('rate_limits')
      .insert({ key });

    if (insResult.error) {
      // Si el insert falla, igual dejamos pasar (no penalizamos al usuario
      // por un problema de infra). Sí lo loggeamos con detalle completo.
      console.error('[rate-limit] insert error:',
        JSON.stringify({
          message: insResult.error.message || null,
          code:    insResult.error.code    || null,
          details: insResult.error.details || null,
          hint:    insResult.error.hint    || null,
        }));
    }

    return { allowed: true, count: currentCount + 1, retryAfter: 0 };

  } catch (err) {
    console.error('[rate-limit] unexpected error:', err?.message || String(err));
    return { allowed: true, count: 0, retryAfter: 0 }; // fail-open
  }
}

// ── Configuración centralizada de límites ───────────────────────
// Acá viven TODOS los límites del sitio. Si querés ajustar uno,
// cambiás solo este objeto — no hay que tocar los endpoints.
//
// Filosofía: límites GENEROSOS para usuarios reales, suficientes
// para frenar abuso automatizado. Es preferible no molestar a un
// cliente legítimo aunque el abuso pase un poco más lento.
export const LIMITS = Object.freeze({
  admin_login:     { max: 5,  windowSec: 15 * 60 },  // 5 / 15min  → brute-force del password
  create_order:    { max: 10, windowSec: 60 * 60 },  // 10 / 1h    → spam de pedidos
  validate_coupon: { max: 20, windowSec: 60 * 60 },  // 20 / 1h    → enumeración de cupones
  seguimiento:     { max: 30, windowSec: 60 * 60 },  // 30 / 1h    → scraping de pedidos
  create_review:   { max: 5,  windowSec: 60 * 60 },  // 5 / 1h     → spam de reseñas (Sesión 38)
});

/**
 * Helper de alto nivel: chequea rate limit con la config preset.
 * Si el cliente excede, responde 429 directamente y devuelve false.
 * Si está OK, devuelve true y el caller sigue con su lógica.
 *
 * Uso típico al inicio de un handler:
 *   if (!(await enforceRateLimit('admin_login', req, res))) return;
 */
export async function enforceRateLimit(action, req, res) {
  const cfg = LIMITS[action];
  if (!cfg) {
    console.warn(`[rate-limit] acción sin config: "${action}" — fail-open`);
    return true;
  }

  const ip = getClientIp(req);
  const { allowed, retryAfter } = await checkRateLimit(action, ip, cfg.max, cfg.windowSec);

  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      error: 'rate_limited',
      detail: `Demasiados intentos. Probá de nuevo en ${formatRetry(retryAfter)}.`,
      retryAfter,
    }));
    return false;
  }

  return true;
}

/** Formatea segundos en "X min" o "Y seg" para mensaje al usuario. */
function formatRetry(sec) {
  if (sec >= 60) {
    const min = Math.ceil(sec / 60);
    return `${min} minuto${min === 1 ? '' : 's'}`;
  }
  return `${sec} segundo${sec === 1 ? '' : 's'}`;
}
