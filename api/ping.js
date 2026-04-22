// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/ping
// ─────────────────────────────────────────────────────────────────
// Endpoint de diagnóstico temporal. No hace queries.
// Solo devuelve:
//   - status de las variables de entorno (configuradas o no)
//   - versión de node.js del runtime
//   - timestamp del servidor
//
// Se puede borrar después de validar el deploy (es completamente
// seguro dejarlo: no expone ningún dato sensible).
// ═════════════════════════════════════════════════════════════════

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    node: process.version,
    env: {
      SUPABASE_URL_present:              !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ADMIN_PASSWORD_present:            !!process.env.ADMIN_PASSWORD,
    },
    message: 'Founder API alive 🚀',
  });
}
