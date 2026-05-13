// ═════════════════════════════════════════════════════════════════
// FOUNDER — Autenticación admin compartida (Sesión 31 Bloque C)
// ─────────────────────────────────────────────────────────────────
// Módulo único para validar requests de admin desde cualquier endpoint.
// Soporta dos modos en paralelo:
//
//   1) JWT Bearer (preferido, post-login):
//      Header: Authorization: Bearer <token>
//      → verifyToken valida firma + expiración.
//
//   2) Password en body (compat / login inicial):
//      Body: { password: "..." }
//      → comparación timing-safe con ADMIN_PASSWORD.
//
// Por qué módulo aparte y no inline en admin.js:
//   - DRY: cleanup-personalizacion y download-personalizacion-bulk
//     usan la misma lógica. Antes tenían cada uno su copia de safeEqual
//     + checkAdminPassword (≈10 líneas duplicadas).
//   - Una única fuente de verdad para auth — si encontramos un bug
//     o queremos cambiar política, se hace en un solo lugar.
//   - Facilita futuros refactors (ej. agregar revocación de tokens).
// ═════════════════════════════════════════════════════════════════

import { timingSafeEqual } from 'node:crypto';
import { verifyToken, extractBearerToken } from './jwt.js';

/** Compara en tiempo constante para no filtrar info vía timing. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifica que la request tiene autenticación válida de admin.
 *
 * Devuelve un objeto con:
 *   - ok: boolean — si la auth es válida
 *   - mode: 'jwt' | 'password' | null — qué método se usó
 *   - error: string | null — código de error si ok=false
 *
 * NO escribe en res — el caller decide cómo responder.
 *
 * @param {object} req   La request HTTP (para leer header Authorization)
 * @param {object} body  El body parseado (para leer password en modo compat)
 */
export function checkAdminAuth(req, body) {
  // Modo 1: JWT bearer (preferido)
  const bearer = extractBearerToken(req);
  if (bearer) {
    try {
      const payload = verifyToken(bearer);
      if (payload?.sub === 'admin') {
        return { ok: true, mode: 'jwt', error: null };
      }
      return { ok: false, mode: null, error: 'invalid_token' };
    } catch (err) {
      // JWT_SECRET no configurada o similar. Loggeamos y fallamos limpio.
      console.error('[admin-auth] JWT verify error:', err?.message || err);
      return { ok: false, mode: null, error: 'jwt_misconfigured' };
    }
  }

  // Modo 2: password en body (compat / acción login)
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    return { ok: false, mode: null, error: 'server_misconfigured' };
  }
  const provided = body?.password || '';
  if (!provided) {
    return { ok: false, mode: null, error: 'no_credentials' };
  }
  if (!safeEqual(provided, expected)) {
    return { ok: false, mode: null, error: 'wrong_password' };
  }
  return { ok: true, mode: 'password', error: null };
}
