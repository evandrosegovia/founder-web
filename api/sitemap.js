// ═════════════════════════════════════════════════════════════════
// FOUNDER — /api/sitemap
// ─────────────────────────────────────────────────────────────────
// Endpoint GET que sirve sitemap.xml dinámicamente.
//
// Por qué dinámico (en lugar de un sitemap.xml estático en raíz):
//   El catálogo de productos vive en Supabase. Si agregamos o
//   removemos un producto, el sitemap tiene que reflejarlo sin
//   tener que editar y redeployar manualmente.
//
// Flujo:
//   1) Listar páginas estáticas hardcodeadas (las que no cambian).
//   2) Pedir a Supabase los productos activos (id + updated_at).
//   3) Construir un <url>...</url> por cada producto:
//        https://www.founder.uy/producto.html?id=<id>
//   4) Devolver XML con Content-Type correcto + cache headers.
//
// Ruta pública:
//   GET https://www.founder.uy/sitemap.xml
//   (mapeada vía rewrite en vercel.json → este endpoint)
//
// Cache:
//   Cacheamos 1 hora en CDN. Si publicás un producto nuevo,
//   se ve en Google en ≤1 hora. Suficiente — Google igual tarda
//   días en re-crawlear.
// ═════════════════════════════════════════════════════════════════

import { supabase } from './_lib/supabase.js';

// ── Config ──────────────────────────────────────────────────────
const SITE_URL = 'https://www.founder.uy';

// Páginas estáticas que queremos que Google indexe.
// Orden importa: primero las más relevantes (priority alto).
// changefreq es solo una sugerencia para Google — no obliga a nada.
const STATIC_PAGES = [
  { loc: '/',                     priority: '1.0', changefreq: 'weekly'  },
  { loc: '/sobre-nosotros.html',  priority: '0.7', changefreq: 'monthly' },
  { loc: '/tecnologia-rfid.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/envios.html',          priority: '0.6', changefreq: 'monthly' },
  { loc: '/contacto.html',        priority: '0.6', changefreq: 'monthly' },
];

// ── Helper: escapar caracteres XML reservados ───────────────────
// Aunque los IDs de productos suelen ser alfanuméricos limpios,
// blindamos contra cualquier valor raro (& < > " ').
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Helper: formato ISO8601 corto (YYYY-MM-DD) para <lastmod> ──
function toW3CDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ── Handler principal ───────────────────────────────────────────
export default async function handler(req, res) {
  // Solo aceptamos GET. HEAD también es buena práctica (Google lo usa).
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // ── 1) Pedir productos a Supabase ─────────────────────────
    // Solo necesitamos id + updated_at para construir la URL +
    // <lastmod>. No traemos todo el row para minimizar payload.
    const { data: products, error } = await supabase
      .from('products')
      .select('id, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[sitemap] error pidiendo productos:', error.message);
      // Fallback: igual servimos las páginas estáticas. El sitemap
      // sin productos es mejor que devolver 500 a Google.
    }

    // ── 2) Construir XML ──────────────────────────────────────
    const today = toW3CDate(new Date());
    const urls = [];

    // 2.a) Páginas estáticas
    for (const page of STATIC_PAGES) {
      urls.push(
        '  <url>\n' +
        `    <loc>${SITE_URL}${page.loc}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${page.changefreq}</changefreq>\n` +
        `    <priority>${page.priority}</priority>\n` +
        '  </url>'
      );
    }

    // 2.b) Productos (si Supabase respondió OK)
    if (Array.isArray(products)) {
      for (const p of products) {
        if (!p?.id) continue;
        const lastmod = toW3CDate(p.updated_at) || today;
        urls.push(
          '  <url>\n' +
          `    <loc>${SITE_URL}/producto.html?id=${escapeXml(p.id)}</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          '    <changefreq>weekly</changefreq>\n' +
          '    <priority>0.9</priority>\n' +
          '  </url>'
        );
      }
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') + '\n' +
      '</urlset>\n';

    // ── 3) Responder ──────────────────────────────────────────
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Cache 1h en CDN, navegador puede usar la versión vieja mientras
    // se revalida en background (stale-while-revalidate).
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
    );
    return res.status(200).send(xml);

  } catch (err) {
    console.error('[sitemap] error inesperado:', err);
    return res.status(500).send('Error generating sitemap');
  }
}
