// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/download-personalizacion-bulk (Sesión 29 — Bloque C)
// ─────────────────────────────────────────────────────────────────
// Genera un archivo ZIP descargable con imágenes de personalización.
// Dos modos:
//   POST { action: "download_order_zip",     orderId,  password }
//        → ZIP con todas las imágenes del pedido (envío al taller del láser)
//   POST { action: "download_borrables_zip",           password }
//        → ZIP con todas las imágenes que se borrarían en una limpieza
//          (backup local previo a borrar)
//
// Por qué no usamos librerías externas (jszip, archiver, etc.):
//   • Cero dependencias nuevas (mismo principio que email.js / mp.js).
//   • ZIP es un formato simple si no querés compresión: STORED method
//     (0x00) solo concatena los archivos con headers. Cualquier extractor
//     (Windows, macOS, Linux, 7zip) lee STORE-only sin problema.
//   • Las imágenes (PNG/JPG) ya están comprimidas, no se gana casi nada
//     comprimiéndolas otra vez.
//
// Implementación: build manual del ZIP en memoria como Buffer.
// Estructura: [Local File Header + filename + data] x N + [Central
// Directory Headers] + [End of Central Directory]. Spec PKZIP 6.3.4.
//
// Tope práctico: ~50 imágenes de 5 MB c/u = 250 MB en memoria.
// Vercel Lambda tiene 1024 MB de RAM por default — alcanza.
// Si en el futuro un pedido tiene >50 imágenes, paginamos.
//
// Seguridad:
//   - Requiere password admin (mismo que /api/admin).
//   - Para download_order_zip: valida que orderId exista.
//   - Path traversal: las paths vienen de la DB, no del cliente.
// ═════════════════════════════════════════════════════════════════

import { supabase, ok, fail, parseBody, buildCorsHeaders } from './_lib/supabase.js';
import { checkAdminAuth } from './_lib/admin-auth.js';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const BUCKET = 'personalizacion-uploads';

// ── ZIP builder en memoria (formato STORED, sin compresión) ───────
// Spec: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
function buildZip(files) {
  // files = [{ name: "logo.png", data: Buffer }]
  const localParts   = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf  = Buffer.from(file.name, 'utf8');
    const dataBuf  = file.data;
    const crc32    = zlib.crc32(dataBuf);
    const size     = dataBuf.length;
    const dosTime  = 0; // simplificación: timestamp 1980-01-01
    const dosDate  = ((1980 - 1980) << 9) | (1 << 5) | 1;

    // Local file header (30 bytes + nombre)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20,         4); // version needed
    localHeader.writeUInt16LE(0,          6); // general purpose flags (0 = no encryption, no extra)
    localHeader.writeUInt16LE(0,          8); // compression method (0 = STORED)
    localHeader.writeUInt16LE(dosTime,   10); // last mod time
    localHeader.writeUInt16LE(dosDate,   12); // last mod date
    localHeader.writeUInt32LE(crc32,     14); // crc-32
    localHeader.writeUInt32LE(size,      18); // compressed size = size (STORED)
    localHeader.writeUInt32LE(size,      22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // filename length
    localHeader.writeUInt16LE(0,         28); // extra field length

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central directory header (46 bytes + nombre)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // signature
    centralHeader.writeUInt16LE(20,         4);  // version made by
    centralHeader.writeUInt16LE(20,         6);  // version needed
    centralHeader.writeUInt16LE(0,          8);  // flags
    centralHeader.writeUInt16LE(0,         10);  // method (STORED)
    centralHeader.writeUInt16LE(dosTime,   12);
    centralHeader.writeUInt16LE(dosDate,   14);
    centralHeader.writeUInt32LE(crc32,     16);
    centralHeader.writeUInt32LE(size,      20);
    centralHeader.writeUInt32LE(size,      24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0,         30);  // extra field length
    centralHeader.writeUInt16LE(0,         32);  // file comment length
    centralHeader.writeUInt16LE(0,         34);  // disk number start
    centralHeader.writeUInt16LE(0,         36);  // internal attributes
    centralHeader.writeUInt32LE(0,         38);  // external attributes
    centralHeader.writeUInt32LE(offset,    42);  // offset of local header

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralStart = offset;
  const centralBuf   = Buffer.concat(centralParts);
  const centralSize  = centralBuf.length;

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);     // signature
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // disk where central dir starts
  eocd.writeUInt16LE(files.length, 8);   // entries on this disk
  eocd.writeUInt16LE(files.length, 10);  // total entries
  eocd.writeUInt32LE(centralSize, 12);   // size of central directory
  eocd.writeUInt32LE(centralStart, 16);  // offset of central directory
  eocd.writeUInt16LE(0, 20);             // .ZIP comment length

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ── Sanear nombres de archivo dentro del ZIP ─────────────────────
function safeFilename(name) {
  return String(name || 'archivo')
    .replace(/[\\/:*?"<>|]/g, '_') // chars no permitidos en Windows
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

// ── Descargar archivos del bucket vía signed URLs ─────────────────
// createSignedUrls (plural) trae N URLs en una sola call.
async function fetchFilesFromStorage(paths) {
  if (!paths.length) return [];

  const { data: signedList, error: signErr } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrls(paths, 300); // 5 minutos

  if (signErr) throw new Error(`signed_urls_failed: ${signErr.message}`);

  // Descargar en paralelo (con tope razonable)
  const downloads = await Promise.all((signedList || []).map(async (sig, idx) => {
    if (!sig?.signedUrl) return null;
    try {
      const resp = await fetch(sig.signedUrl);
      if (!resp.ok) {
        console.warn(`[bulk-zip] fetch fallo ${paths[idx]}: ${resp.status}`);
        return null;
      }
      const arr = await resp.arrayBuffer();
      return { path: paths[idx], data: Buffer.from(arr) };
    } catch (e) {
      console.warn(`[bulk-zip] fetch excepción ${paths[idx]}:`, e?.message || e);
      return null;
    }
  }));

  return downloads.filter(Boolean);
}

// ── Modo 1: ZIP por pedido ────────────────────────────────────────
async function buildOrderZip(orderId) {
  // Traer items del pedido con personalización
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(`
      numero,
      order_items ( id, product_name, color, personalizacion )
    `)
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { error: 'order_not_found', detail: orderErr?.message };
  }

  // Recolectar paths con su nombre lógico para el ZIP
  const fileSpecs = []; // [{ path, zipName }]
  for (const it of (order.order_items || [])) {
    const p = it.personalizacion;
    if (!p || typeof p !== 'object') continue;

    for (const slot of ['adelante', 'interior', 'atras']) {
      const ref = p[slot];
      if (ref && typeof ref === 'object' && typeof ref.path === 'string' && ref.path) {
        // Nombre dentro del ZIP: "{producto}-{color}-{slot}-{filename}"
        const ext = (ref.path.match(/\.([a-z0-9]+)$/i) || [])[1] || 'png';
        const original = safeFilename(ref.filename || `${slot}.${ext}`);
        const zipName  = safeFilename(
          `${it.product_name || 'item'}_${it.color || ''}_${slot}_${original}`
        );
        fileSpecs.push({ path: ref.path, zipName });
      }
    }

    // Si hay texto/indicaciones, los metemos como TXT dentro del ZIP
    if (p.texto || p.indicaciones) {
      const txt = `Pedido: ${order.numero}\nProducto: ${it.product_name}\nColor: ${it.color}\n` +
        (p.texto        ? `\nTEXTO A GRABAR:\n${p.texto}\n` : '') +
        (p.indicaciones ? `\nINDICACIONES:\n${p.indicaciones}\n` : '');
      const txtName = safeFilename(
        `${it.product_name || 'item'}_${it.color || ''}_texto.txt`
      );
      fileSpecs.push({ path: null, zipName: txtName, inlineText: txt });
    }
  }

  if (!fileSpecs.length) return { error: 'no_files' };

  // Descargar binarios del bucket
  const pathsToFetch = fileSpecs.filter(s => s.path).map(s => s.path);
  const downloaded   = await fetchFilesFromStorage(pathsToFetch);
  const byPath       = new Map(downloaded.map(d => [d.path, d.data]));

  // Armar lista para el ZIP
  const zipFiles = [];
  for (const spec of fileSpecs) {
    if (spec.inlineText) {
      zipFiles.push({ name: spec.zipName, data: Buffer.from(spec.inlineText, 'utf8') });
    } else {
      const buf = byPath.get(spec.path);
      if (buf) zipFiles.push({ name: spec.zipName, data: buf });
    }
  }

  if (!zipFiles.length) return { error: 'all_downloads_failed' };

  return {
    zipBuffer: buildZip(zipFiles),
    filename:  `personalizacion-${order.numero || orderId}.zip`,
  };
}

// ── Modo 2: ZIP de borrables (backup previo a limpieza) ───────────
async function buildBorrablesZip() {
  // Reutilizamos la lógica de cleanup importando paths borrables.
  // No importamos del otro módulo para evitar bundling extra de lógica
  // que no usamos acá; replicamos la query mínima.
  const HUERFANA_DIAS     = 10;
  const POST_ENTREGA_DIAS = 60;

  // Listar archivos
  const all = [];
  const { data: rootEntries } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  for (const entry of (rootEntries || [])) {
    if (entry?.id && entry?.metadata) {
      all.push({ path: entry.name, created_at: entry.created_at || entry.updated_at });
      continue;
    }
    const folder = entry.name;
    const { data: list } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
    for (const f of (list || [])) {
      if (!f?.metadata) continue;
      all.push({
        path:       `${folder}/${f.name}`,
        created_at: f.created_at || f.updated_at || new Date().toISOString(),
      });
    }
  }

  // Cargar paths vivos
  const { data: items } = await supabase
    .from('order_items')
    .select(`personalizacion, orders ( estado, updated_at )`)
    .not('personalizacion', 'is', null);

  const aliveSet    = new Set();
  const now         = Date.now();
  const sixtyDaysMs = POST_ENTREGA_DIAS * 24 * 60 * 60 * 1000;

  for (const it of (items || [])) {
    const p = it.personalizacion;
    if (!p || typeof p !== 'object') continue;
    const order = it.orders;
    let canDelete = false;
    if (order && order.estado === 'Entregado') {
      const dt = new Date(order.updated_at || 0).getTime();
      if (dt > 0 && (now - dt) > sixtyDaysMs) canDelete = true;
    }
    if (canDelete) continue;
    for (const slot of ['adelante', 'interior', 'atras']) {
      const ref = p[slot];
      if (ref?.path) aliveSet.add(ref.path);
    }
  }

  // Filtrar borrables
  const tenDaysMs = HUERFANA_DIAS * 24 * 60 * 60 * 1000;
  const borrables = all.filter(f => {
    if (aliveSet.has(f.path)) return false;
    const created = new Date(f.created_at || 0).getTime();
    return created > 0 && (now - created) > tenDaysMs;
  });

  if (!borrables.length) return { error: 'no_files' };

  const downloaded = await fetchFilesFromStorage(borrables.map(b => b.path));
  if (!downloaded.length) return { error: 'all_downloads_failed' };

  const zipFiles = downloaded.map(d => ({
    name: safeFilename(d.path.replace('/', '_')),
    data: d.data,
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    zipBuffer: buildZip(zipFiles),
    filename:  `personalizacion-backup-${stamp}.zip`,
  };
}

// ═════════════════════════════════════════════════════════════════
// HANDLER
// ═════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // CORS dinámico — siempre aplicar antes de cualquier respuesta
  const cors = buildCorsHeaders(req);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  if (!supabase) {
    return fail(res, 500, 'server_misconfigured',
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }

  try {
    const body   = parseBody(req);
    const action = String(body.action || '').trim();

    // Sesión 31 Bloque C: auth compartida (JWT bearer o password)
    const auth = checkAdminAuth(req, body);
    if (!auth.ok) {
      const msg = auth.error === 'invalid_token'
        ? 'Token inválido o expirado'
        : 'Contraseña incorrecta';
      return fail(res, 401, 'unauthorized', msg);
    }

    let result;
    if (action === 'download_order_zip') {
      const orderId = String(body.orderId || '').trim();
      if (!orderId) return fail(res, 400, 'orderId_required');
      result = await buildOrderZip(orderId);
    } else if (action === 'download_borrables_zip') {
      result = await buildBorrablesZip();
    } else {
      return fail(res, 400, 'unknown_action');
    }

    if (result.error) {
      return fail(res, 404, result.error, result.detail);
    }

    // Devolver el binario como JSON con base64. Más simple para el frontend
    // que streamear binario; el frontend reconstruye Blob y dispara download.
    // (Los headers CORS ya se setearon al inicio del handler.)
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200);
    res.end(JSON.stringify({
      ok:       true,
      filename: result.filename,
      base64:   result.zipBuffer.toString('base64'),
      bytes:    result.zipBuffer.length,
    }));
  } catch (err) {
    console.error('[download-personalizacion-bulk] error:', err);
    return fail(res, 500, 'internal_error', String(err?.message || err));
  }
}
