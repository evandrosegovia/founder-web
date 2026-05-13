// ═════════════════════════════════════════════════════════════════
// FOUNDER — JWT minimalista para sesión admin (Sesión 31 Bloque C)
// ─────────────────────────────────────────────────────────────────
// Implementación nativa de JSON Web Tokens (HS256) sin librerías.
// Formato estándar — interoperable con jsonwebtoken, jose, etc.
//
// Por qué propio en vez de "jsonwebtoken":
//   - Cero deps nuevas (mantenemos package.json minimal).
//   - El subset que necesitamos es chico (~80 líneas).
//   - Mejor auditabilidad: cualquier issue de seguridad lo vemos
//     directo en este archivo, no en un paquete externo.
//
// Comparación de seguridad con timing-safe:
//   La verificación de la firma usa timingSafeEqual de crypto, igual
//   que jsonwebtoken internamente.
//
// Token shape:
//   header:    { alg: "HS256", typ: "JWT" }
//   payload:   { sub: "admin", iat: <ts>, exp: <ts> }
//   signature: HMAC-SHA256(base64url(header)+"."+base64url(payload), secret)
//
// Encoding: base64url (RFC 4648 §5). Diferente de base64 normal:
//   '+' → '-', '/' → '_', sin padding '='. Lo implementamos en
//   funciones helpers para no depender de Buffer.toString('base64url')
//   que no está disponible en versiones viejas de Node (estamos en 22,
//   pero por las dudas).
// ═════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'node:crypto';

// Duración del token: 8 horas. Suficiente para una jornada de trabajo
// sin obligar al admin a reloguear constantemente, lo bastante corto
// para que un token robado tenga ventana limitada.
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

// ── Helpers de base64url ──────────────────────────────────────────

function base64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  // Restaurar padding y caracteres
  let padded = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  return Buffer.from(padded, 'base64');
}

// ── Lectura del secret con validación ─────────────────────────────

/**
 * Obtiene el JWT_SECRET desde el entorno. Lanza error si no está
 * configurado o es demasiado corto (la entropía mínima recomendada
 * para HS256 es 256 bits = 32 bytes = ~32 chars alfanuméricos).
 */
function getSecret() {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) {
    throw new Error('JWT_SECRET no configurada en Vercel');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET demasiado corto (mínimo 32 caracteres)');
  }
  return secret;
}

// ── API pública ───────────────────────────────────────────────────

/**
 * Firma un payload y devuelve el token JWT.
 *
 * @param {object} payload  Datos a embeber. Se agregan iat y exp automáticamente.
 * @returns {{ token: string, expiresAt: number }}  Token + timestamp de expiración (ms).
 */
export function signToken(payload = {}) {
  const secret = getSecret();

  const header = { alg: 'HS256', typ: 'JWT' };
  const now    = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const headerEnc  = base64urlEncode(JSON.stringify(header));
  const payloadEnc = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerEnc}.${payloadEnc}`;

  const sig    = createHmac('sha256', secret).update(signingInput).digest();
  const sigEnc = base64urlEncode(sig);

  return {
    token:     `${signingInput}.${sigEnc}`,
    expiresAt: fullPayload.exp * 1000, // en ms para el frontend
  };
}

/**
 * Verifica un token. Devuelve el payload si es válido, o null si:
 *   - El formato es inválido (no son 3 partes)
 *   - La firma no coincide
 *   - El token expiró
 *   - El header no es HS256
 *
 * Nunca tira excepciones por tokens inválidos — devuelve null.
 * SÍ tira si JWT_SECRET no está configurada (error de infra, no del usuario).
 */
export function verifyToken(token) {
  if (typeof token !== 'string' || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerEnc, payloadEnc, sigEnc] = parts;

  // 1) Verificar firma con timing-safe equal
  const secret = getSecret(); // si falla, es error de infra → propagamos
  const expected = createHmac('sha256', secret)
    .update(`${headerEnc}.${payloadEnc}`)
    .digest();

  let provided;
  try {
    provided = base64urlDecode(sigEnc);
  } catch {
    return null;
  }

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  // 2) Parsear header — debe ser HS256
  let header;
  try {
    header = JSON.parse(base64urlDecode(headerEnc).toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;

  // 3) Parsear payload y validar expiración
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadEnc).toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload?.exp !== 'number') return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec >= payload.exp) return null;  // expirado

  return payload;
}

/**
 * Extrae un token Bearer del header Authorization de una request.
 * Devuelve el token sin el prefijo "Bearer ", o null si no hay header válido.
 *
 * Acepta:
 *   "Authorization: Bearer <token>"
 *   "authorization: bearer <token>"   (case-insensitive)
 */
export function extractBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || '';
  const match  = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
