# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 17 — inicio (22/04/2026)
**En curso:** 17 — Fase 4 (Dominio custom + Meta Pixel + CAPI)

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y arrancá con la **Fase 4** (Meta Pixel + CAPI).
> Las Fases 1, 2, 3A, 3B y 3C están completas. El sitio corre 100% sobre
> Supabase + Vercel Serverless. Ya no existe ninguna dependencia de Google
> (Sheets, Apps Script, Drive, OAuth, Cloud) — todo fue apagado y archivado.
> El repo está completamente libre de código legacy (grep confirmado).
> Queda: integrar Meta Pixel del lado cliente + Conversion API del lado server,
> para tracking de Facebook/Instagram Ads. Antes de tocar nada, hacé los checks
> preventivos de `ESTADO.md` sección "Plan técnico para Fase 4".

---

## 🗺️ Hoja de ruta de fases

| Fase | Estado | Descripción |
|---|---|---|
| **1** — Setup inicial | ✅ Completa | Supabase creado, 6 tablas, schema base |
| **2A** — Migrar catálogo | ✅ Completa | products, product_colors, product_photos cargados |
| **2B** — Frontend público | ✅ Completa | index/producto/carrito leen de Supabase |
| **3A** — Checkout + Seguimiento | ✅ Completa | Ambos migrados a `/api/checkout` y `/api/seguimiento` |
| **3B** — Admin | ✅ Completa | `admin.html` migrado a `/api/admin` — sin Sheets ni Drive |
| **3C** — Limpieza | ✅ **Completa** | Apps Script apagado, Sheet archivado, OAuth y proyecto Cloud borrados, código 100% libre de legacy |
| **4** — Meta Pixel + CAPI | ⏳ **Pendiente** | Tracking para Facebook/Instagram Ads |

---

## ✅ Lo que quedó funcionando en Sesión 16 (Fase 3C)

La Fase 3C se ejecutó en 2 grandes frentes: limpieza del código + apagado de todos los servicios de Google.

### Incidente inicial resuelto
Al arrancar la sesión, el admin no cargaba productos: `/api/admin` devolvía 500
`"permission denied for table products"`. Causa raíz: `service_role` no tenía
`GRANT ALL` sobre las 3 tablas del catálogo (`products`, `product_colors`,
`product_photos`). La tabla de permisos documentada en Sesión 14 era incorrecta
(decía que `service_role` usaba RLS, cuando en realidad necesita GRANTs
explícitos — `service_role` bypassea RLS pero no GRANTs).

**Fix aplicado (SQL):** `grant all on public.<tabla> to service_role` sobre las
7 tablas del sistema. Idempotente. Ver snippet guardado en Supabase como
*"Fix service_role Table Permissions"*.

### Limpieza del código
- **`index.html` + `producto.html`**: eliminadas las constantes `SHEET_ID` y
  `APPS_SCRIPT_URL` del `CONFIG` (eran código muerto sin consumidores). Comentarios
  de cabezal actualizados para reflejar que el catálogo vive en Supabase.
- **`admin.html`**: eliminada la página completa *"Conversor de imágenes"* (sidebar
  item + `<div id="page-imagenes">` + contenido). -42 líneas. Las clases CSS
  `.conv-row`, `.conv-inp`, `.conv-btn`, `.conv-result` se preservaron porque las
  reutiliza la página Banner.
- **`founder-admin.js`**: eliminadas las 6 funciones del conversor
  (`extractDriveId`, `convertToDirectLink`, `convertDriveLink`, `copyConverted`,
  `convertBulk`, `copyBulkLink`) + sus 4 exports a `window`. -70 líneas.
- **Cabezales reescritos** en `founder-admin.js`, `founder-checkout.js`,
  `founder-seguimiento.js`, `checkout.js`, `seguimiento.js` y `cart.js`: eliminadas
  todas las menciones históricas a GViz, gapi, Apps Script, Google Sheet, Drive.
- **`api/ping.js` eliminado**: era endpoint de diagnóstico temporal, cumplido.

### Validación final con grep
Las 7 categorías del chequeo quedaron en cero resultados:
```bash
grep -rn "1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8"   # ✅ limpio
grep -rn "script\.google\.com\|Apps Script"               # ✅ limpio
grep -rn "gviz\|GViz"                                     # ✅ limpio
grep -rn "gapi\|google\.accounts\|apis\.google\.com"      # ✅ limpio
grep -rn "SHEET_ID\|APPS_SCRIPT_URL"                      # ✅ limpio
grep -rn "Google Sheet\|Google Drive"                     # ✅ limpio
grep -rn "convertDriveLink\|page-imagenes\|driveInput"    # ✅ limpio (huérfanos)
```

### Apagados/archivados en Google
1. **Apps Script**: implementación archivada. La URL `/exec` ahora devuelve
   error. El código del proyecto se conserva en la cuenta por si alguna vez se
   quiere consultar.
2. **Google Sheet**: renombrado a
   `[ARCHIVADO 2026-04] FOUNDER — legacy pre-Supabase` y movido a la carpeta
   `FOUNDER — archivo legacy (pre-Supabase)` en Drive. Backup `.xlsx` descargado
   y guardado localmente + copia en la misma carpeta de archivo.
3. **Proyecto de Google Cloud**: marcado para eliminación. Google lo conserva
   30 días (hasta ~22/05/2026), después se borra definitivamente. Con esto se
   elimina también el OAuth Client asociado.

### Deploys a producción
Dos deploys durante la sesión, ambos validados en incógnito:
- Commit 1: *"Fase 3C paso 1: limpiar CONFIG legacy..."*
- Commit 2: *"Fase 3C paso 2: eliminar Conversor imágenes + limpiar comentarios legacy"*
- Commit 3: *"Fase 3C paso 3: borrar api/ping.js"*

Todas las funciones del sitio (home, producto, carrito, checkout, seguimiento,
admin completo) validadas post-deploy y OK.

---

## ✅ Lo que quedó funcionando en Sesión 15 (Fase 3B)

### Admin migrado completo
- **`components/founder-admin.js`** — ~1660 líneas (-70 tras limpieza Sesión 16),
  IIFE. Contiene toda la lógica del panel. Expone a `window` las 34 funciones
  que el HTML usa por `onclick=` inline (antes eran 38, -4 del conversor).
- **`admin.html`** — 685 líneas (tras limpieza Sesión 16). HTML/CSS preservados
  salvo la eliminación del bloque del Conversor de imágenes.

### Cambios funcionales
- **Login**: valida contra `/api/admin` (action `login`). Password en
  `sessionStorage['founder_admin_pw']`. Logout automático en 401.
- **Pedidos**: lista, filtros por estado, detalle con barra de progreso, cambio
  de estado y tracking de envío — todo sobre `/api/admin`.
- **Productos**: CRUD completo con colores y fotos (hasta 5 por color).
- **Fotos**: upload directo a Supabase Storage con signed URL. El binario NO
  pasa por Vercel. Bucket `product-photos` público.
- **Cupones**: CRUD completo.
- **Banner del hero**: se persiste en `products.banner_url` del primer producto
  activo (mismo campo que lee `supabase-client.js → fetchBannerUrl`).

---

## ✅ Lo que quedó funcionando en Sesión 14 (Fase 3A)

### Infraestructura
- **Vercel Serverless Functions** desplegadas en `/api/*`:
  - `/api/checkout` — validar cupón + crear pedido (atómico via RPC)
  - `/api/seguimiento` — buscar pedido por número+email
  - `/api/admin` — 14 acciones para el panel
- **Variables de entorno en Vercel** (Production+Preview):
  - `SUPABASE_URL` ✅
  - `SUPABASE_SERVICE_ROLE_KEY` (Sensitive) ✅
  - `ADMIN_PASSWORD` = `nerito20` (Sensitive) ✅
- **Storage bucket `product-photos`** en Supabase (público).
- **RPC `apply_coupon_and_create_order(jsonb, jsonb, text)`** — transacción
  atómica con lock FOR UPDATE del cupón.

### Componentes frontend
- `components/founder-checkout.js` — ~620 líneas, IIFE. Expone 10 funciones a `window`.
- `components/founder-seguimiento.js` — ~620 líneas, IIFE. Expone 5 funciones.

### Pedido de prueba vigente
- **Número:** `F910752` / **Email:** `test@prueba.com`
- **Producto:** Confort Negro × 1 — $2.490
- **Estado:** Pendiente
- Visible en `/seguimiento.html?pedido=F910752&email=test@prueba.com`

---

## 🗄️ Schema Supabase — estado actual

### Proyecto
| Dato | Valor |
|---|---|
| URL | `https://qedwqbxuyhieznrqryhb.supabase.co` |
| Región | São Paulo (sa-east-1) |
| Plan | Free |
| Anon key | En `components/supabase-client.js` (pública por diseño) |
| Service role key | En Vercel env `SUPABASE_SERVICE_ROLE_KEY` — NUNCA al frontend |

### Tablas (7)

1. **`products`** — id, slug, nombre, precio, descripcion, especificaciones,
   capacidad, dimensiones, material, nota, lleva_billetes, lleva_monedas,
   banner_url, orden, activo, created_at, updated_at.
2. **`product_colors`** — id, product_id, nombre, estado
   (check: `activo`/`sin_stock`/`oferta`), precio_oferta, orden, created_at.
3. **`product_photos`** — id, color_id, url, orden, es_principal, created_at.
4. **`orders`** — 22 columnas: id (uuid), numero (unique), fecha, nombre,
   apellido, celular, email, entrega, direccion, productos, subtotal,
   descuento, envio, total, pago, estado, notas, nro_seguimiento,
   url_seguimiento, cupon_codigo, created_at, updated_at.
5. **`order_items`** — id, order_id (FK cascade), product_name, color,
   cantidad, precio_unitario.
6. **`coupons`** — id, codigo (unique), tipo (`fijo`/`porcentaje`), valor,
   uso (`multiuso`/`unico`/`por-email`), min_compra, activo, usos_count,
   emails_usados (text[]), desde, hasta, created_at.
7. **`site_settings`** — key (PK), value, updated_at.

### Constraints CHECK en `orders` (alineados con frontend)
- `orders_entrega_check` → `entrega IN ('Envío','Retiro')`
- `orders_pago_check` → `pago IN ('Mercado Pago','Transferencia')`
- `orders_estado_check` → `estado IN ('Pendiente pago','Pendiente confirmación','Confirmado','En preparación','En camino','Listo para retirar','Entregado','Cancelado')`
- `orders_subtotal/descuento/envio/total_check` → todos `>= 0`

### Permisos (corregidos en Sesión 16)

| Tabla | anon | authenticated | service_role |
|---|---|---|---|
| `products` | SELECT (RLS) | SELECT (RLS) | **ALL** ✅ |
| `product_colors` | SELECT (RLS) | SELECT (RLS) | **ALL** ✅ |
| `product_photos` | SELECT (RLS) | SELECT (RLS) | **ALL** ✅ |
| `site_settings` | SELECT | SELECT | ALL |
| `orders` | ❌ | ❌ | ALL |
| `order_items` | ❌ | ❌ | ALL |
| `coupons` | ❌ | ❌ | ALL |

⚠️ **Corrección respecto al doc anterior:** en las 3 primeras tablas del
catálogo `service_role` NECESITA `ALL` explícito, aunque solo usemos RLS para
`anon`/`authenticated`. PostgreSQL requiere GRANT + policy — `service_role`
bypassea RLS pero NO bypassea GRANTs de tabla.

### Trigger
- `trg_orders_updated_at` — actualiza `updated_at` en cada UPDATE de `orders`.
- `set_updated_at()` en `products` (ya existía).

---

## 📂 Archivos del proyecto (estructura actual en GitHub)

```
founder-web/
├── index.html                     ✅ (limpio Sesión 16)
├── producto.html                  ✅ (limpio Sesión 16)
├── checkout.html                  ✅
├── seguimiento.html               ✅
├── admin.html                     ✅ (685 líneas tras Sesión 16)
├── contacto.html                  ✅
├── sobre-nosotros.html            ✅
├── envios.html                    ✅
├── tecnologia-rfid.html           ✅
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅
│   ├── cart.js                    ✅ (limpio Sesión 16)
│   ├── supabase-client.js         ✅ (fuente de verdad del catálogo)
│   ├── founder-checkout.js        ✅ (limpio Sesión 16)
│   ├── founder-seguimiento.js     ✅ (limpio Sesión 16)
│   └── founder-admin.js           ✅ (1660 líneas tras Sesión 16)
├── api/
│   ├── _lib/supabase.js           ✅
│   ├── checkout.js                ✅ (limpio Sesión 16)
│   ├── seguimiento.js             ✅ (limpio Sesión 16)
│   └── admin.js                   ✅
├── package.json                   ✅ (declara @supabase/supabase-js)
├── vercel.json                    ✅ (CORS + maxDuration 15s)
├── README.md                      ✅
└── ESTADO.md                      ← este archivo
```

**Eliminado en Sesión 16:** `api/ping.js`.

---

## 🎯 Plan técnico para Fase 4 (Meta Pixel + Conversion API)

### Qué es
- **Meta Pixel**: script JS de Facebook/Meta que corre en el navegador del
  visitante. Registra eventos como PageView, ViewContent, AddToCart, Purchase.
  Permite optimizar campañas de Facebook/Instagram Ads y armar audiencias
  de retargeting.
- **Conversion API (CAPI)**: llamada del lado servidor desde Vercel hacia
  Meta, que **duplica** los eventos importantes (especialmente Purchase). Sirve
  para tener datos confiables cuando el usuario tiene bloqueadores de ads,
  navega en iOS con ITP, etc.

### Eventos a trackear

| Evento | Disparo | Pixel | CAPI |
|---|---|---|---|
| `PageView` | Carga de cualquier página | ✅ | — |
| `ViewContent` | Carga de `producto.html` | ✅ | — |
| `AddToCart` | Click en "Agregar al carrito" | ✅ | — |
| `InitiateCheckout` | Carga de `checkout.html` | ✅ | — |
| `Purchase` | `/api/checkout` responde ok en `create_order` | ✅ | ✅ (source of truth) |

**Decisión clave:** Purchase SIEMPRE va por CAPI desde el server, con `event_id`
único. Si además llega por Pixel del cliente, Meta hace deduplicación por
`event_id`. Si el Pixel es bloqueado (ad blocker, Brave, etc.), CAPI salva el
evento.

### Precondiciones antes de arrancar
1. Tener un **Business Manager de Meta** y haber creado un **Pixel ID**
   (ej. `1234567890123456`).
2. Haber generado un **Access Token de CAPI** desde Events Manager → Settings.
3. Tener definido el **dominio de Meta**: `founder.uy` (dominio custom
   activo desde Sesión 17).
4. Verificación de dominio en Meta (requerida para iOS 14+).

### Checks preventivos al arrancar Sesión 17
- Confirmar que no hay ningún Pixel instalado ya (buscar `fbq(` o
  `connect.facebook.net/en_US/fbevents.js` en el repo).
- Confirmar que existe el `event_id` único generado en el checkout (actualmente
  se usa el `order.numero` estilo `F910752` — servirá).
- Identificar el mejor lugar para inyectar el Pixel: probablemente en el
  `<head>` de cada HTML vía un componente nuevo `components/meta-pixel.js`.
- Evaluar si usar consentimiento de cookies previo (GDPR/LGPD) — en UY no es
  legalmente obligatorio, pero es buena práctica.

### Variables de entorno nuevas en Vercel
- `META_PIXEL_ID` (pública, puede ir al frontend)
- `META_CAPI_TOKEN` (sensitive, solo server-side)
- `META_TEST_EVENT_CODE` (opcional, para pruebas en Events Manager)

### Archivos a crear/modificar (estimado)
- `components/meta-pixel.js` — nuevo, ~100 líneas. Expone `window.fbq(evento, params)`.
- `index.html`, `producto.html`, `checkout.html` — agregar tag en el `<head>`.
- `founder-checkout.js` — disparar `InitiateCheckout` al cargar, `AddToCart`
  al agregar (este ya está en `cart.js`).
- `cart.js` — disparar `AddToCart` al agregar un producto.
- `api/checkout.js` — en el handler de `create_order`, al final, llamar a
  CAPI con el Purchase duplicado.

### Decisiones a confirmar al arrancar Sesión 17
1. ¿Ya existe el Pixel ID en Meta Business Manager? Si no, crearlo primero.
2. ¿Usar un solo Pixel o múltiples (uno por campaña)? Recomendado: uno solo.
3. ¿Incluir datos personales del cliente en el CAPI Purchase (email, teléfono
   hasheados)? Recomendado sí — mejora la match rate, es la práctica estándar.
4. ¿Agregar consentimiento de cookies antes de activar el Pixel? Decisión
   producto-legal.

---

## ⚠️ Reglas críticas NO NEGOCIABLES

### Reglas de código
- La clave interna `'sin_stock'` NO se modifica jamás.
- Sistema de componentes (`header.js`, `footer.js`, `cart.js`,
  `supabase-client.js`, `founder-checkout.js`, `founder-seguimiento.js`,
  `founder-admin.js`) es la **única fuente de verdad**. No replicar
  markup/lógica en HTMLs.
- `supabase-client.js` SIEMPRE antes que `cart.js` (y antes que cualquier
  componente que use `window.founderDB`).
- `checkout.html` y `admin.html` quedan excluidos del sistema de header/footer
  compartido — tienen header propio.
- `service_role` NUNCA va al frontend — solo en `/api/*` Vercel Functions con
  env var.

### Reglas de base de datos
- **Cuando se cree una tabla o se active RLS, SIEMPRE emitir explícitamente
  `GRANT SELECT/ALL ... TO anon|authenticated|service_role`**. Las RLS policies
  por sí solas **NO alcanzan** — PostgreSQL requiere los dos niveles
  (GRANT + policy).
- **Los constraints CHECK de `orders` deben coincidir EXACTO con los strings
  que manda el frontend**. Cualquier desalineamiento rompe el INSERT.
- **`service_role` NO bypassea GRANTs de tabla** — solo bypassea RLS. Siempre
  `GRANT ALL` a service_role en TODAS las tablas, sean privadas o del catálogo.
- Las 4 tablas privadas (`orders`, `order_items`, `coupons`, + parcialmente
  `site_settings`) **SOLO se tocan vía `/api/*`**. El frontend con anon key
  no tiene acceso directo.
- NO tocar manualmente las tablas desde el dashboard. Todos los cambios vía
  SQL versionado guardado como snippet en Supabase.

---

## 🧪 Cómo probar todo lo que está hecho

### Prueba end-to-end de compra
1. Abrir https://founder.uy
2. Agregar producto al carrito → checkout.
3. Completar, confirmar pedido.
4. Ver "🎉 ¡Pedido enviado!" con número `F######`.
5. Verificar en Supabase Dashboard → Table Editor → `orders` + `order_items`.

### Prueba de seguimiento
Ir a `/seguimiento.html?pedido=F910752&email=test@prueba.com` — debe mostrar
el detalle del pedido.

### Prueba de admin
Entrar a `/admin.html` con password `nerito20`. Deberían cargar productos,
pedidos y cupones sin errores 500.

### Prueba de cupón
```sql
insert into public.coupons (codigo, tipo, valor, uso, min_compra, activo)
values ('TEST10', 'porcentaje', 10, 'multiuso', 0, true);
```
Aplicarlo en checkout → debe restar 10% + sumar 1 a `usos_count`.

### Limpieza de pedidos de prueba
```sql
delete from public.orders where email = 'test@prueba.com';
-- Los order_items asociados se borran en cascada.
```

---

## 🔐 Datos clave (guardar en lugar seguro)

| Recurso | Valor |
|---|---|
| URL sitio producción | https://founder.uy |
| URL sitio Vercel (legacy) | https://founder-web-gules.vercel.app (redirect 301 → founder.uy) |
| Repo GitHub | github.com/evandrosegovia-1171s-projects/founder-web |
| Usuario Vercel | evandrosegovia-1171s-projects |
| Password admin | `nerito20` |
| Supabase URL | `https://qedwqbxuyhieznrqryhb.supabase.co` |
| Supabase región | São Paulo (sa-east-1) |
| Pedido de prueba vigente | `F910752` / `test@prueba.com` / Confort Negro / $2.490 |
| Backup del Sheet viejo | `.xlsx` guardado localmente + en carpeta "FOUNDER — archivo legacy (pre-Supabase)" en Drive |

---

## 📜 Historial de incidentes resueltos

### Sesión 16 (1 incidente)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Admin 500 `"permission denied for table products"` | `service_role` sin `GRANT ALL` sobre las 3 tablas del catálogo (la doc Sesión 14 era incorrecta) | SQL `grant all on public.<tabla> to service_role` sobre las 7 tablas |

### Sesión 14 (6 incidentes en cascada)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Home sin fotos, 401 `"permission denied for table product_photos"` | Políticas RLS con rol `{public}` | `04_fix_rls.sql` |
| 2 | Persiste 401 tras fix RLS | Faltaba GRANT SELECT a nivel tabla | `05_fix_grants.sql` |
| 3 | Checkout: `"column productos does not exist"` | Columna `productos` (y 11 más) faltaban en `orders` | `06_fix_orders_schema.sql` |
| 4 | Checkout: `"violates check constraint orders_entrega_check"` | Constraint viejo rechazaba `'Envío'` | `07_fix_entrega_check.sql` |
| 5 | Checkout: `"violates check constraint orders_pago_check"` | Mismo caso con `pago` | `08_fix_pago_check.sql` |
| 6 | Seguimiento: `"permission denied for table orders"` | Faltaba `GRANT ALL` a service_role en tablas privadas | `09_fix_service_role_grants.sql` |

---

## 📋 Historial de sesiones

- **Sesión 9-11:** Setup inicial, componentes, catálogo en Google Sheets.
- **Sesión 12:** Supabase configurado, schema inicial, catálogo migrado.
- **Sesión 13 (Fase 2):** Frontend público migrado a `window.founderDB`.
- **Sesión 14 (Fase 3A):** Checkout y seguimiento migrados a Supabase vía
  Vercel Serverless. 6 incidentes resueltos en cascada.
- **Sesión 15 (Fase 3B):** Admin migrado a `/api/admin` + Supabase Storage.
  `founder-admin.js` creado. `admin.html` bajó 70%. Eliminadas dependencias
  de Google (gapi/OAuth/Sheets/Drive) del código.
- **Sesión 16 (Fase 3C):** Limpieza final. Incidente inicial de permisos
  resuelto con `GRANT ALL`. Código 100% libre de legacy (grep confirmado en 7
  categorías). Apps Script apagado, Sheet archivado con backup, proyecto de
  Google Cloud marcado para eliminación (se borra el ~22/05/2026). `api/ping.js`
  eliminado. ← **Acá terminamos.**
- **Sesión 17 (Fase 4):** Meta Pixel + CAPI para tracking de Facebook/Instagram
  Ads. ← **Próxima.**

---

**FIN** — Cerramos Sesión 16. Fase 3C completa. El sitio corre 100% sobre
Supabase + Vercel, sin ninguna dependencia viva de Google. Próximo paso:
integrar Meta Pixel + Conversion API para tracking de campañas. 🎯
