# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 17 — cierre (23/04/2026)
**Próxima sesión:** 18 — Pendientes de limpieza + evaluación de campañas pagas

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y retomamos después de Sesión 17. Todas las fases principales
> están completas. El sitio corre 100% sobre Supabase + Vercel, con dominio
> custom `www.founder.uy` y tracking de Meta (Pixel + CAPI con deduplicación
> dual) funcionando. Hay una lista de pendientes menores al final del archivo.
> Decidime qué querés priorizar de esa lista.

---

## 🗺️ Hoja de ruta de fases

| Fase | Estado | Descripción |
|---|---|---|
| **1** — Setup inicial | ✅ Completa | Supabase creado, 6 tablas, schema base |
| **2A** — Migrar catálogo | ✅ Completa | products, product_colors, product_photos cargados |
| **2B** — Frontend público | ✅ Completa | index/producto/carrito leen de Supabase |
| **3A** — Checkout + Seguimiento | ✅ Completa | Ambos migrados a `/api/checkout` y `/api/seguimiento` |
| **3B** — Admin | ✅ Completa | `admin.html` migrado a `/api/admin` — sin Sheets ni Drive |
| **3C** — Limpieza | ✅ Completa | Apps Script apagado, Sheet archivado, código libre de legacy |
| **4** — Meta Pixel + CAPI | ✅ **Completa** | Dominio custom activo, tracking dual operativo |

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

### Estado de precondiciones (actualizado Sesión 17)
1. ✅ **Business Manager de Meta** creado (`founder.uy` — Business portfolio).
2. ✅ **Facebook Page** conectada (`founder.uy.oficial`, ID `1058647090653828`).
3. ✅ **Instagram Business** conectado (`@founder.uy`, ID `17841474091434639`).
4. ✅ **Ad Account** conectada (`Publicidad FOUNDER`, ID `1653222205862527`).
5. ✅ **Pixel / Dataset** creado (`Founder Pixel`, ID `2898267450518541`).
6. ✅ **Access Token de CAPI** generado (guardado fuera del repo — va como
   env var en Vercel).
7. ⚠️ **Dominio de Meta**: `www.founder.uy` (dominio custom activo, con
   redirect 301 desde `founder.uy` y desde `founder-web-gules.vercel.app`).
8. 🚫 **Verificación de dominio en Meta**: BLOQUEADA por bug de Meta con
   ccTLDs `.uy` — el validador del campo "Add domain" rechaza `founder.uy`,
   `www.founder.uy` y variantes con error *"Confirm your domain is correctly
   formatted"*. Ver sección "Pendientes externos" abajo.

### Pendientes externos (no bloqueantes para Pixel + CAPI)
- **Verificación de dominio en Meta**: Meta bloquea el alta del dominio por
  bug conocido con ccTLDs regionales (Public Suffix List). No afecta el
  funcionamiento del Pixel ni de CAPI — solo impacta la optimización AEM
  (Aggregated Event Measurement) para campañas pagas en iOS 14.5+. Plan:
  abrir ticket con Meta Pro Support cuando vayamos a arrancar campañas
  pagas, o esperar que Meta corrija el bug en su lado.

### Checks preventivos al arrancar implementación (Paso 4)
- Confirmar que no hay ningún Pixel instalado ya (grep `fbq(` y
  `connect.facebook.net/en_US/fbevents.js` en el repo).
- Confirmar que existe el `event_id` único generado en el checkout
  (actualmente se usa el `order.numero` estilo `F910752` — servirá).
- Identificar el mejor lugar para inyectar el Pixel: `<head>` de cada HTML
  vía un componente nuevo `components/meta-pixel.js`.
- Evaluar si usar consentimiento de cookies previo (GDPR/LGPD) — en UY no
  es legalmente obligatorio, pero es buena práctica.

### Variables de entorno nuevas en Vercel
- `META_PIXEL_ID` = `2898267450518541` (pública, puede ir al frontend).
- `META_CAPI_TOKEN` = `EAA...` (sensitive, solo server-side).
- `META_TEST_EVENT_CODE` (opcional, para pruebas en Events Manager).

### Archivos a crear/modificar (estimado)
- `components/meta-pixel.js` — nuevo, ~100 líneas. Carga `fbevents.js` y
  expone `window.fbq(evento, params)`.
- `index.html`, `producto.html`, `checkout.html`, `seguimiento.html`,
  `contacto.html`, `sobre-nosotros.html`, `envios.html`,
  `tecnologia-rfid.html` — agregar tag en el `<head>`.
- `producto.html` — disparar `ViewContent` cuando carga un producto.
- `cart.js` — disparar `AddToCart` al agregar un producto al carrito.
- `founder-checkout.js` — disparar `InitiateCheckout` al cargar.
- `api/checkout.js` — en el handler de `create_order`, al final, llamar a
  CAPI con el Purchase duplicado (con `event_id = order.numero`).

### Decisiones tomadas al arrancar Sesión 17
1. ✅ Usar un solo Pixel (`Founder Pixel`).
2. ✅ Incluir datos personales hasheados (email, teléfono) en CAPI Purchase
   para mejorar match rate. Se hashean con SHA-256 antes de enviar.
3. ⏳ Consentimiento de cookies: diferir — se puede agregar después si se
   decide. UY no lo exige legalmente.

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
1. Abrir https://www.founder.uy
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
| URL sitio producción | https://www.founder.uy |
| URL sin www (redirect 308 → www) | https://founder.uy |
| URL Vercel legacy (redirect 301 → www) | https://founder-web-gules.vercel.app |
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
  eliminado.
- **Sesión 17 (Fase 4):** Dominio custom `founder.uy` conectado a Vercel con
  SSL. Dominio principal: `www.founder.uy`; redirects 301/308 desde `founder.uy`
  y desde `founder-web-gules.vercel.app`. Meta Business Portfolio creado con
  Facebook Page + Instagram Business + Pixel (`2898267450518541`) + Access
  Token CAPI. Componente nuevo `components/meta-pixel.js` implementado con
  helpers tipados (ViewContent, AddToCart, InitiateCheckout, Purchase). Módulo
  nuevo `api/_lib/meta-capi.js` para tracking dual server-side. Checkout
  modificado con `await` + timeout 3s para que Vercel no mate el fetch antes
  de que complete. Test end-to-end confirmado: `events_received: 1` con
  `fbtrace_id` válido. ← **Acá terminamos.**
- **Sesión 18:** Pendientes menores + evaluación de campañas pagas. ← **Próxima.**

---

## ✅ Lo que quedó funcionando en Sesión 17 (Fase 4)

### Dominio custom
- `founder.uy` comprado y conectado a Vercel con SSL automático.
- **Dominio principal**: `www.founder.uy` (con www).
- `founder.uy` (sin www) → redirect 308 → `www.founder.uy`.
- `founder-web-gules.vercel.app` → redirect 301 → `www.founder.uy`.
- Código actualizado: 9 referencias en `index.html`, `producto.html`,
  `admin.html`, `components/founder-admin.js` ahora apuntan a `www.founder.uy`.

### Meta Business Portfolio
- Business: `founder.uy`.
- Facebook Page: `founder.uy.oficial` (ID `1058647090653828`).
  - Nota: Meta no aceptó el username `founder.uy` ni `founderuy` — tuvimos
    que conformarnos con `founder.uy.oficial`. Cuando Meta libere `founder.uy`
    (puede ser en meses), vale la pena cambiarlo.
- Instagram Business: `@founder.uy` (ID `17841474091434639`).
- Ad Account: `Publicidad FOUNDER` (ID `1653222205862527`).
- Hay una Ad Account sin nombre (`26140748312219895`) auto-creada por Meta —
  ignorada, se evalúa limpieza en Sesión 18.
- Dataset/Pixel: `Founder Pixel` (ID `2898267450518541`).
- Hay un dataset "NO" (ID `1472474751248750`) creado por accidente al testear
  — no afecta nada pero conviene eliminarlo en Sesión 18.

### Meta Pixel + CAPI
- `META_PIXEL_ID` y `META_CAPI_TOKEN` configurados en Vercel Environment
  Variables. **Importante**: NO marcadas como "Sensitive" por issues de
  propagación en el plan Hobby. Funcionan bien sin ese flag.
- `components/meta-pixel.js` (nuevo, ~230 líneas): wrapper oficial del Pixel
  con API pública `window.founderPixel`. Dispara PageView automático + helpers
  tipados para ViewContent, AddToCart, InitiateCheckout, Purchase.
- Script `<script src="components/meta-pixel.js">` agregado a los 8 HTML del
  sitio.
- `producto.html` dispara ViewContent al renderizar + AddToCart al agregar.
- `index.html` dispara AddToCart al agregar desde modal.
- `components/founder-checkout.js` dispara InitiateCheckout + Purchase cliente.
- `api/_lib/meta-capi.js` (nuevo, ~230 líneas): módulo CAPI con hasheado
  SHA-256 de email/teléfono/nombre, extracción de IP/UA/fbp/fbc, POST a
  `graph.facebook.com/v19.0/{pixel_id}/events`. Fallo silencioso si faltan
  env vars.
- `api/checkout.js` modificado para invocar `sendPurchaseEvent` con `await`
  + `Promise.race` con timeout de 3s — crítico para que Vercel Serverless no
  mate el fetch antes de que complete. Sin esto, el evento se perdía.
- `event_id` unificado = `order.numero` (ej. `F378204`) → Meta deduplica
  automáticamente los eventos Pixel y CAPI que llegan con mismo ID.

### Verificación end-to-end (pedido F378204)
```
23:02:59.125  [meta-capi] sendPurchaseEvent invoked { token_length: 201 }
23:02:59.343  [meta-capi] Purchase enviado OK { received: 1, trace: A3wc3i... }
23:02:59.343  [checkout] CAPI result: { ok: true, events_received: 1 }
```
218ms desde invocación hasta confirmación de Meta. `messages: []` = payload
perfecto, sin warnings.

---

## 📋 Pendientes para Sesión 18 (no bloqueantes)

### Prioridad alta — solo cuando se arranquen campañas pagas
1. **Verificación de dominio en Meta**: actualmente BLOQUEADA por bug del
   Public Suffix List con ccTLDs `.uy`. El validador del campo "Add domain"
   rechaza `founder.uy`, `www.founder.uy` y variantes con "Confirm your
   domain is correctly formatted". No afecta el funcionamiento de Pixel ni
   CAPI — solo impacta AEM (Aggregated Event Measurement) para optimización
   en iOS 14.5+. Plan: abrir ticket con Meta Pro Support cuando se vayan a
   correr ads con optimización de Purchase.

### Prioridad media — mejoras de orden
2. **Limpiar dataset "NO"** (ID `1472474751248750`) creado por error en Meta.
3. **Evaluar Ad Account `26140748312219895`** sin nombre (probablemente
   auto-generada por Meta) — renombrar o eliminar.
4. **Resolver warning de Vercel**: "Node.js functions compiled from ESM to
   CommonJS". Agregar `"type": "module"` al `package.json` raíz.
5. **Limpiar archivo duplicado `api/supabase.js`** — hay una copia idéntica
   en `api/_lib/supabase.js` que es la que consumen los endpoints. El
   duplicado suelto no se usa pero ocupa espacio.
6. **Agregar email de contacto al Instagram** en Meta Business Portfolio
   (badge "Missing contact info" en Users → People).

### Prioridad baja — pulido
7. **Reintentar username `founder.uy` para la Page de Facebook** cuando Meta
   lo libere (actualmente quedó como `founder.uy.oficial`).
8. **Borrar el pedido de prueba `F378204`** (testcapi3@prueba.com) y otros
   pedidos de prueba acumulados durante esta sesión:
   ```sql
   delete from public.orders
   where email like '%@prueba.com' or email like 'testcapi%';
   ```

### Incidentes resueltos durante Sesión 17 (documentados por si se repiten)
- **Meta rechazó `founder.uy` en verificación de dominio**: bug del Public
  Suffix List con ccTLDs. Workaround: decidimos saltear la verificación ya que
  no bloquea el tracking.
- **Upload parcial a GitHub**: la interfaz web a veces no sube todos los
  archivos cuando son muchos. Regla: verificar archivo por archivo, o subir
  en tandas chicas (2-3 archivos).
- **Archivo subido a carpeta equivocada**: `meta-capi.js` se subió a `api/`
  en vez de `api/_lib/`. Causa: al dar "Add file → Upload" hay que verificar
  el breadcrumb antes de arrastrar.
- **Variables "Sensitive" en Vercel Hobby**: las env vars marcadas Sensitive
  tuvieron issues de propagación en runtime. Solución: crear sin el flag.
- **Fire-and-forget cortado por Vercel Serverless**: el primer diseño del
  CAPI usaba `sendPurchaseEvent().catch(...)` sin await. Vercel mataba el
  proceso al retornar la respuesta HTTP, perdiendo el fetch a Meta. Fix:
  `await Promise.race([capiPromise, timeoutPromise(3000)])`. Lección: en
  serverless, fire-and-forget NO funciona — siempre await + timeout.

---

**FIN** — Cerramos Sesión 17. Fase 4 completa. El sitio corre 100% sobre
Supabase + Vercel, con dominio custom `www.founder.uy` + tracking dual de
Meta (Pixel + CAPI) operativo. Pedido de prueba F378204 confirmó
deduplicación funcionando end-to-end. Próximo paso: limpieza de pendientes
menores + evaluación de primera campaña paga. 🎯
