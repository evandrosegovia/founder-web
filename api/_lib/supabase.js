// ═════════════════════════════════════════════════════════════════
// FOUNDER — Utilidades compartidas para los endpoints /api/*
// ─────────────────────────────────────────────────────────────────
// No es un endpoint público (su nombre empieza con "_"). Solo se
// usa por imports desde checkout.js, seguimiento.js y admin.js.
//
// Responsabilidades:
//   1) Instanciar UN SOLO cliente Supabase con service_role key,
//      reutilizable entre invocaciones (cold-start tuning).
//   2) Helpers de respuesta HTTP (json, error) con CORS ya seteado.
//   3) Wrapper que maneja preflight OPTIONS + método permitido.
// ═════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ── Cliente Supabase singleton ─────────────────────────────────
// Se crea una vez por instancia "caliente" de la función serverless
// y se reusa. Si falta alguna var de entorno, se detecta al inicio
// en vez de fallar en cada request.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Solo loggea en cold-start; los endpoints responden 500 con mensaje claro.
  console.error('[founder/api] Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ── Helpers de respuesta HTTP ──────────────────────────────────
// Lista blanca de orígenes permitidos para CORS.
// Solo se permite el dominio oficial del sitio (con y sin www).
// Cualquier otro origen recibe Access-Control-Allow-Origin: null.
//
// Importante: CORS protege contra requests cross-origin de NAVEGADORES.
// Los webhooks (server-to-server, como Mercado Pago) no envían header
// Origin → no son afectados por CORS. Esta whitelist no rompe webhooks.
const ALLOWED_ORIGINS = new Set([
  'https://www.founder.uy',
  'https://founder.uy',
]);

/** Devuelve el Origin si está permitido, sino 'null' (string literal). */
function resolveAllowOrigin(req) {
  const origin = req?.headers?.origin || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'null';
}

/** Construye el set de headers CORS dinámico según Origin de la request.
 *  Exportado para uso en endpoints que no usan createHandler. */
export function buildCorsHeaders(req) {
  return {
    'Access-Control-Allow-Origin':  resolveAllowOrigin(req),
    'Vary':                         'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

// Compatibilidad con código viejo: algunos endpoints importaban CORS_HEADERS.
// Mantengo un objeto estático mínimo (sin Allow-Origin, que se setea dinámico)
// por si algún endpoint hace `Object.entries(CORS_HEADERS).forEach(...)`.
// Los endpoints nuevos deberían usar buildCorsHeaders(req) directamente.
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Responde con JSON + status code. Siempre incluye CORS dinámico si hay req. */
export function json(res, status, payload, req) {
  res.status(status);
  if (req) {
    const cors = buildCorsHeaders(req);
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  } else {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/** Atajo para errores: { ok:false, error: "codigo_legible" } + status. */
export function fail(res, status, code, extra) {
  return json(res, status, { ok: false, error: code, ...(extra ? { detail: extra } : {}) });
}

/** Atajo para éxito: { ok:true, ...payload }. */
export function ok(res, payload = {}) {
  return json(res, 200, { ok: true, ...payload });
}

// ── Wrapper: preflight OPTIONS + método permitido + try/catch ─
/**
 * Envuelve una función de endpoint para:
 *   - Responder 204 a preflight CORS (OPTIONS) sin lógica.
 *   - Validar método HTTP permitido (por defecto POST).
 *   - Capturar cualquier excepción y devolver 500 JSON.
 *   - Validar que el cliente Supabase esté inicializado.
 *   - Setear CORS dinámico (whitelist) según Origin de la request.
 */
export function createHandler(handler, { method = 'POST' } = {}) {
  return async (req, res) => {
    // CORS dinámico — siempre aplicar antes de cualquier respuesta
    const cors = buildCorsHeaders(req);
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

    // Preflight CORS
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== method) {
      return fail(res, 405, 'method_not_allowed');
    }

    if (!supabase) {
      return fail(res, 500, 'server_misconfigured',
        'Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
    }

    try {
      await handler(req, res);
    } catch (err) {
      console.error('[founder/api] Unhandled error:', err);
      return fail(res, 500, 'internal_error', String(err?.message || err));
    }
  };
}

/** Parsea el body seguro (Vercel ya lo parsea como JSON en Node runtime,
 *  pero si viene como string por alguna razón, igual lo cubre). */
export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}
