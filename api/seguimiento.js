// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/seguimiento
// ─────────────────────────────────────────────────────────────────
// Endpoint POST que busca un pedido en Supabase a partir de su
// número + email.
//
// Body: { numero, email }
//
// Devuelve:
//   - 200 { ok:true, pedido: {...} } si existen AMBOS coincidentes.
//   - 404 { ok:false, error:"not_found" } si no hay match.
//
// Seguridad:
//   - Requiere numero Y email simultáneamente (no se puede listar
//     pedidos solo con el número).
//   - El email se compara en lower-case para evitar mismatch por
//     mayúsculas/minúsculas.
//   - Nunca se devuelve información sensible como service_role, IP
//     del admin, etc. Solo el pedido del cliente.
//
// Formato de "numero" aceptado:
//   - "F123456"  (el ID actual del checkout)
//   - "FND-0042" (el formato viejo del sheet, se normaliza)
//   - "42"       (se busca LIKE %42%)
// ═════════════════════════════════════════════════════════════════

import { supabase, createHandler, ok, fail, parseBody } from './_lib/supabase.js';
import { enforceRateLimit } from './_lib/rate-limit.js';

function normalizarNumero(raw) {
  // Ej: "FND-0042" → "42", "F123456" queda igual, "42" queda "42"
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  return s.replace(/^FND-?0*/, '');  // saca prefijo FND- y ceros a la izquierda
}

export default createHandler(async (req, res) => {
  // Rate limit (Sesión 31): 30 consultas / hora por IP.
  // Frena scraping de pedidos por fuerza bruta (probar muchos números).
  if (!(await enforceRateLimit('seguimiento', req, res))) return;

  const body = parseBody(req);

  const numeroRaw = String(body.numero || '').trim();
  const email     = String(body.email  || '').trim().toLowerCase();

  if (!numeroRaw || !email) {
    return fail(res, 400, 'missing_params', 'Ingresá número de pedido y email');
  }

  // Normalizamos para que "42", "FND-0042", "F123456" todos pueden matchear
  const numeroNorm = normalizarNumero(numeroRaw);

  // Estrategia: intentar match EXACTO por numero original (case-insensitive).
  // Si no hay match, probamos contra la versión normalizada comparando como LIKE.
  // En ambos casos filtramos también por email (AND).
  // Esto mantiene compatibilidad con IDs actuales "F123456" y con los viejos "FND-0042".

  // Intento 1: numero === body.numero (tal cual, upper)
  let { data, error } = await supabase
    .from('orders')
    .select(`
      id, numero, fecha, nombre, apellido, celular, email,
      entrega, direccion, productos,
      subtotal, descuento, envio, total,
      pago, estado, notas, cupon_codigo, personalizacion_extra,
      nro_seguimiento, url_seguimiento,
      order_items ( product_name, color, cantidad, precio_unitario, personalizacion )
    `)
    .ilike('numero', numeroRaw.toUpperCase())
    .ilike('email',  email)
    .maybeSingle();

  if (error) return fail(res, 500, 'db_error', error.message);

  // Intento 2: si no encontró, probamos por la versión normalizada
  if (!data && numeroNorm && numeroNorm !== numeroRaw.toUpperCase()) {
    const retry = await supabase
      .from('orders')
      .select(`
        id, numero, fecha, nombre, apellido, celular, email,
        entrega, direccion, productos,
        subtotal, descuento, envio, total,
        pago, estado, notas, cupon_codigo, personalizacion_extra,
        nro_seguimiento, url_seguimiento,
        order_items ( product_name, color, cantidad, precio_unitario, personalizacion )
      `)
      .ilike('numero', `%${numeroNorm}%`)
      .ilike('email',  email)
      .limit(2);

    if (retry.error) return fail(res, 500, 'db_error', retry.error.message);
    // Solo acepto si la búsqueda devolvió EXACTAMENTE 1 resultado.
    // Si hay 2+ matches parciales, consideramos el pedido no encontrado
    // por seguridad (evita revelar info de pedidos de terceros).
    if (retry.data && retry.data.length === 1) {
      data = retry.data[0];
    }
  }

  if (!data) {
    return fail(res, 404, 'not_found',
      'No encontramos ningún pedido con esos datos. Verificá el número y el email.');
  }

  return ok(res, { pedido: data });
});
