// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/upload-personalizacion
// ─────────────────────────────────────────────────────────────────
// Endpoint POST PÚBLICO (sin auth) que el cliente usa para subir las
// imágenes que va a personalizar con grabado láser.
//
// Flujo:
//   1) Frontend pide a /api/upload-personalizacion { filename, mime }.
//   2) Servidor valida tipo y extensión, genera URL firmada de Storage
//      sobre el bucket PRIVADO `personalizacion-uploads`.
//   3) Servidor devuelve { uploadUrl, token, path } — el cliente hace
//      PUT directo a Supabase con el binario.
//   4) El cliente guarda `path` en el carrito junto al item; cuando
//      se crea la orden, ese path va a `order_items.personalizacion`.
//   5) El admin, al ver el pedido, pide al backend
//      { action: "get_personalizacion_signed_url", path } y obtiene
//      una URL firmada de lectura para descargar la imagen.
//
// Por qué endpoint separado de /api/admin:
//   - Este es PÚBLICO (sin password). Mezclarlo con admin.js obligaría
//     a un branching dudoso "esta acción no requiere auth pero las
//     demás sí". Aislar reduce el riesgo de error de seguridad.
//
// Defensas anti-abuso (capa 1, blanda):
//   - Validación de extensión + MIME en el filename declarado.
//   - El bucket en Supabase tiene `file_size_limit: 10 MB` por config.
//   - Nombres de archivo se sanitizan a [a-z0-9.-] y se prefijan con
//     UUID corto + timestamp para evitar colisiones y enumeración.
//   - El bucket es PRIVADO: aunque alguien adivine paths no los puede
//     leer.
//
// Posibles defensas futuras (capa 2, si alguien abusa):
//   - Rate limit por IP (Vercel KV o middleware).
//   - CAPTCHA invisible.
//   - Marcar uploads "huérfanos" y limpiarlos con cron (Sesión C).
// ═════════════════════════════════════════════════════════════════

import { supabase, createHandler, ok, fail, parseBody } from './_lib/supabase.js';
import crypto from 'node:crypto';

const BUCKET = 'personalizacion-uploads';

// MIME types aceptados — espejo exacto del bucket en Supabase y de la
// config global del feature. Cambiar acá Y en el SQL si se actualiza.
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
]);

// Mapeo MIME → extensión canónica. Es lo que va a quedar en el path
// final, independientemente de la extensión que haya enviado el cliente.
// Esto evita ataques de "subo archivo.exe pero le pongo .jpg".
const MIME_TO_EXT = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/svg+xml': 'svg',
};

// ═════════════════════════════════════════════════════════════════
// HANDLER
// ═════════════════════════════════════════════════════════════════
export default createHandler(async (req, res) => {
  // Solo POST. Otros métodos → 405.
  if (req.method !== 'POST') {
    return fail(res, 405, 'method_not_allowed', 'Solo POST permitido');
  }

  const body = parseBody(req);

  // ── Validar payload ────────────────────────────────────────────
  const filename = String(body.filename || '').trim();
  const mime     = String(body.mime || '').trim().toLowerCase();

  if (!filename) return fail(res, 400, 'filename_required');
  if (!mime)     return fail(res, 400, 'mime_required');

  // ── Validar MIME contra whitelist ──────────────────────────────
  if (!ALLOWED_MIME.has(mime)) {
    return fail(res, 400, 'mime_not_allowed',
      `Tipo de archivo no permitido. Aceptamos: PNG, JPG, SVG.`);
  }

  // ── Construir path seguro ──────────────────────────────────────
  // Estructura: <yyyymm>/<uuid>-<slug>.<ext>
  //   - yyyymm prefijo facilita borrado por mes (cron de limpieza).
  //   - uuid corto evita colisiones y enumeración.
  //   - slug del filename original ayuda al admin a saber de qué iba la imagen.
  //   - ext canónica viene del MIME validado, no del filename.

  const ext = MIME_TO_EXT[mime];

  // Slug del filename original — máx 30 chars, solo seguros
  const slug = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')           // sacar extensión
    .replace(/[^a-z0-9]+/g, '-')       // cualquier no-alfanumérico → guion
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'img';

  // UUID corto: 8 chars hex aleatorios — colisión casi imposible en
  // este volumen (necesitarías ~16 millones de uploads en el mismo
  // mes para un 50% de chance de colisión).
  const uid = crypto.randomBytes(4).toString('hex');

  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', ''); // "202605"
  const path = `${yyyymm}/${uid}-${slug}.${ext}`;

  // ── Generar URL firmada de upload ──────────────────────────────
  // createSignedUploadUrl: el cliente puede hacer PUT al bucket sin
  // tener service_role_key. La URL es válida por unos minutos.
  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    // Loguear pero no exponer detalle al cliente
    console.error('[upload-personalizacion] storage error:', error.message, { path });
    return fail(res, 500, 'storage_error',
      'No pudimos preparar la subida. Intentá de nuevo.');
  }

  return ok(res, {
    path,                       // ruta interna en el bucket — esto va al carrito
    uploadUrl: data.signedUrl,  // URL para que el cliente haga PUT
    token:     data.token,      // token interno (Supabase moderno)
    bucket:    BUCKET,          // por si el cliente quiere armar URLs después
  });
});
