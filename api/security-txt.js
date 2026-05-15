// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/security-txt
// ─────────────────────────────────────────────────────────────────
// Endpoint GET que sirve /.well-known/security.txt (RFC 9116).
//
// Qué es security.txt:
//   Archivo estándar donde un sitio publica cómo reportar problemas
//   de seguridad. Investigadores y herramientas (PentestTools, etc.)
//   lo buscan automáticamente en /.well-known/security.txt.
//
// Por qué endpoint dinámico (en lugar de archivo plano):
//   1) Tenemos que firmar la fecha de expiración (RFC pide refresh
//      anual). Calcular "ahora + 1 año" en cada request evita tener
//      que acordarse de actualizar un archivo a mano.
//   2) Mantiene consistencia con el patrón ya usado en /api/sitemap:
//      rewrite en vercel.json → endpoint serverless.
//
// Ruta pública:
//   GET https://www.founder.uy/.well-known/security.txt
//   (mapeada vía rewrite en vercel.json → este endpoint)
//
// Cache:
//   24h en CDN. El contenido casi nunca cambia.
// ═════════════════════════════════════════════════════════════════

// ── Config ──────────────────────────────────────────────────────
const SITE_URL = 'https://www.founder.uy';
const CONTACT_EMAIL = 'info@founder.uy';

// Política de divulgación: 1 año desde hoy.
// Recalculado en cada request para que nunca quede vencido.
function getExpiresISO() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  // Normalizar a medianoche UTC para que el contenido sea estable
  // dentro de un mismo día (mejor para el cache).
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Handler ─────────────────────────────────────────────────────
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const expires = getExpiresISO();
  const preferredLanguages = 'es, en';

  // Formato RFC 9116. Comentarios con '#' permitidos.
  const body = [
    '# ═══════════════════════════════════════════════════════════',
    '# FOUNDER.UY — security.txt (RFC 9116)',
    '# Canal para reportar problemas de seguridad responsablemente.',
    '# ═══════════════════════════════════════════════════════════',
    '',
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    `Preferred-Languages: ${preferredLanguages}`,
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return res.status(200).send(body);
}
