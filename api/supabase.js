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
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Responde con JSON + status code. Siempre incluye CORS. */
export function json(res, status, payload) {
  res.status(status);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
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
 */
export function createHandler(handler, { method = 'POST' } = {}) {
  return async (req, res) => {
    // Preflight CORS
    if (req.method === 'OPTIONS') {
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
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
