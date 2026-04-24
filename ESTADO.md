# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 18 — cierre (23/04/2026)
**Próxima sesión:** 19 — Cierre de pendientes Meta + primer pedido de prueba del sistema archivar/eliminar + evaluación de campañas pagas

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y retomamos después de Sesión 18. Todas las fases principales
> están completas. El sitio corre 100% sobre Supabase + Vercel con dominio
> custom `www.founder.uy`, tracking dual de Meta (Pixel + CAPI) operativo y
> **dominio verificado en Meta Business**. En Sesión 18 también se agregó un
> sistema de archivar/eliminar pedidos en el admin. Quedan 3 pendientes menores
> en Meta y la prueba manual del sistema de archivar/eliminar con los pedidos
> de prueba acumulados. Decidime qué querés priorizar.

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
| **4** — Meta Pixel + CAPI | ✅ Completa | Dominio custom activo, tracking dual operativo, **dominio verificado en Meta** |
| **5** — Hardening admin | ✅ Completa | Archivar + Eliminar pedidos desde UI con protecciones (ver Sesión 18) |

---

## ✅ Lo que quedó funcionando en Sesión 18

La Sesión 18 se ejecutó en 3 frentes: **desbloqueo de la verificación de dominio** (crítico, estaba marcado como indefinido), **cierre de pendientes técnicos de código**, y **feature nueva de gestión de pedidos** (archivar/eliminar desde admin).

### 🏆 Logro principal — Verificación de dominio en Meta

**El "bloqueo" de Sesión 17 era un bug del navegador, no de Meta.**

- El validador "Add domain" de Meta rechazaba `founder.uy` / `www.founder.uy` con
  error *"Confirm your domain is correctly formatted"* cuando se usaba **Opera**.
- En **Google Chrome**, el mismo formulario acepta el dominio sin problemas.
- Se agregó `www.founder.uy` en Meta Business Settings → Dominios.
- Meta generó una metaetiqueta única:
  ```
  <meta name="facebook-domain-verification" content="6qpwim4axainj6z7q5d06778d8qsxd">
  ```
- La metaetiqueta se insertó en el `<head>` de **los 9 HTML del sitio**:
  - `index.html`, `producto.html`, `checkout.html`, `seguimiento.html`
  - `contacto.html`, `sobre-nosotros.html`, `envios.html`, `tecnologia-rfid.html`
  - `admin.html`
- Posición: inmediatamente después del `<meta name="viewport">`, con comentario
  explicativo `<!-- Meta (Facebook) Domain Verification — Fase 4 / Sesión 18 -->`.
- Estilo respetado por archivo: archivos con `<meta ... />` (seguimiento, contacto,
  sobre-nosotros, envios, tecnologia-rfid) usan cierre autocerrado; el resto usa
  `<meta ...>` sin slash.
- Resultado: Meta confirmó **"Verified"** tras clic en "Verify domain".

**Impacto:** desbloquea AEM (Aggregated Event Measurement) para optimización de
eventos en iOS 14.5+ cuando se arranquen campañas pagas.

### ✅ Tarea 4 — `"type": "module"` en `package.json`

- Agregada línea `"type": "module"` después de `"description"`.
- Elimina el warning de Vercel *"Node.js functions compiled from ESM to CommonJS"*.
- Chequeo previo: `grep -rn "require(\|module.exports" /api/*.js` devolvió 0
  resultados. Todos los endpoints ya usaban sintaxis ESM (`import/export`).
- Riesgo: cero. Cambio validado post-deploy con los 5 chequeos (ver sección
  "Cómo probar").

### ✅ Tarea 5 — Eliminado `api/supabase.js` duplicado

- Había un archivo `api/supabase.js` idéntico a `api/_lib/supabase.js`.
- Los 4 endpoints (`checkout.js`, `seguimiento.js`, `admin.js`, `meta-capi.js`)
  importan desde `./_lib/supabase.js` (verificado con grep).
- El duplicado suelto no tenía consumidores → eliminado del repo sin impacto.

### 🆕 Feature nueva — Sistema archivar/eliminar pedidos (Fase 5 — Hardening admin)

**Motivación:** los pedidos se acumulan con el tiempo. Sin un mecanismo de
depuración, la lista del admin se vuelve inmanejable. Además había 6 pedidos
de prueba acumulados de Sesión 17 (ver "Pendientes" abajo).

**Arquitectura elegida: soft delete reversible + hard delete con doble confirmación.**

#### Cambios en Supabase (schema)
```sql
-- Columna nueva en orders + índice parcial
alter table public.orders
  add column if not exists archivado boolean not null default false;

create index if not exists orders_archivado_idx
  on public.orders (archivado)
  where archivado = false;
```
- Snippet guardado en Supabase como *"Sesión 18 — Agregar archivado a orders"*.
- Idempotente (se puede correr varias veces).
- El índice parcial acelera la query principal (solo pedidos activos).

#### Cambios en `api/admin.js` (+75 / −2 líneas)
- **3 actions nuevas** registradas en el dispatcher:
  - `archive_order` — soft delete (update `archivado=true`), reversible.
  - `unarchive_order` — restaurar (update `archivado=false`).
  - `delete_order` — DELETE definitivo, cascade a `order_items`. Requiere
    `body.confirm === true` como defensa en profundidad contra requests
    accidentales.
- **`list_orders` extendido:** acepta `body.include_archived`:
  - `'only'` → solo archivados (vista "Archivados").
  - `'all'` → activos + archivados (sin uso actual, disponible para futuro).
  - resto → solo activos (default, la lista principal).
- Cada action registra auth en el body y valida `id_required`.

#### Cambios en `components/founder-admin.js` (+150 / −16 líneas)
- **Nuevo estado:** `state.currentView = 'active' | 'archived'`.
- **`loadOrders(opts)` aceptó un parámetro `view`** para alternar entre vistas.
  Las métricas del dashboard SOLO se recalculan cuando `view === 'active'` —
  los archivados no ensucian las estadísticas.
- **`filterOrders(filter, btn)` extendida:**
  - Filtro especial `'archivados'` → dispara recarga desde el server con
    `include_archived: 'only'`.
  - Cualquier filtro normal estando en vista archivados → vuelve a `'active'`.
- **`renderOrders` muestra botones condicionales:**
  - En vista activa: botones de estado + `📁 Archivar` + `🗑 Eliminar`.
  - En vista archivados: badge "ARCHIVADO" + `↩ Desarchivar` + `🗑 Eliminar`.
- **3 funciones nuevas** con confirmaciones graduales:
  - `archiveOrder(id, numero)` → 1 confirm (reversible, baja fricción).
  - `unarchiveOrder(id)` → 1 confirm.
  - `deleteOrder(id, numero)` → **doble confirmación obligatoria**:
    1. `confirm()` con warning ⚠️.
    2. `prompt()` exige escribir el número exacto (ej: `F515156`).
    3. Backend valida `body.confirm === true` (3ra capa de defensa).
- Todas las funciones actualizan `state.allOrders` localmente tras el ok del
  server (no hacen full reload — UX rápida).
- 3 nuevas exposiciones a `window`: `archiveOrder`, `unarchiveOrder`, `deleteOrder`.

#### Cambios en `admin.html` (+1 línea)
- Botón nuevo al final de la barra de filtros: `📁 Archivados`.
- Alineado a la derecha (`margin-left: auto`) para separarlo visualmente de
  los filtros de estado.
- Borde sutil con tono gold para distinguirlo.

### Chequeos automáticos aplicados durante la sesión
- Sintaxis válida en los 2 `.js` (`node --check`).
- Meta-verification presente y única en los 9 HTML.
- 3 handlers backend registrados + 3 entradas en dispatcher (verificado).
- 3 funciones frontend definidas + exportadas a `window` (verificado).
- Funciones existentes intactas (`loadOrders`, `filterOrders`, `renderOrders`,
  `changeOrderStatus`, `viewOrder`, `saveTracking` — todas con exactamente 1
  definición).
- Filtro "Archivados" presente en `admin.html` (1 ocurrencia).
- Comunicación frontend↔backend usa mismo nombre `include_archived`.

### Validación post-deploy (5 chequeos)
1. ✅ Los 2 deploys (package.json + delete de supabase.js) quedaron en verde.
2. ✅ Warning de ESM→CommonJS desaparecido de los Build Logs.
3. ✅ Sitio público carga normal (home, producto, carrito).
4. ✅ Admin carga productos y pedidos sin errores.
5. ✅ Seguimiento funciona (endpoint `/api/seguimiento`).

### Validación visual del sistema archivar/eliminar
- Captura del usuario confirmó: tarjetas de pedido con botones `📁 Archivar`
  y `🗑 Eliminar` visibles en los 5 pedidos activos.
- Filtro `📁 Archivados` visible en la barra (confirmado en Chrome y Opera
  tras hard refresh — Opera había cacheado el `admin.html` viejo).

### Incidentes resueltos durante Sesión 18
- **Opera cacheó `admin.html` viejo** tras el deploy: el filtro "Archivados"
  no aparecía hasta forzar `Ctrl+F5`. Lección: en cambios de HTML, siempre
  validar primero en Chrome (menos cache agresivo) o en ventana incógnito.
- **Meta NO aceptaba dominio en Opera pero SÍ en Chrome**: bug del validador
  del formulario. Invalida el diagnóstico de Sesión 17 que decía "Meta rechaza
  ccTLDs `.uy`". El problema era el navegador, no Meta. Lección: ante errores
  de validación extraños en paneles de Meta, probar Chrome antes de asumir bug
  del lado del proveedor.
- **Datasets y Ad Accounts sin botón de eliminar** en Business Manager UI:
  Meta no ofrece delete para datasets/ad accounts auto-creados. Workaround
  aceptable: dejarlos como están (no afectan nada) o renombrar con prefijo
  `ZZ-` para que queden al final alfabéticamente.

### Deploys a producción
Cinco deploys durante la sesión, todos validados:
- Commit 1: *"feat: agregar meta-verification de Meta en los 9 HTML"*
- Commit 2: *"chore: agregar \"type\": \"module\" al package.json"*
- Commit 3: *"chore: eliminar api/supabase.js duplicado"*
- Commit 4: *"feat: agregar archive/unarchive/delete para pedidos (api/admin.js)"*
- Commit 5: *"feat: botones archivar/desarchivar/eliminar en tarjetas de pedido (founder-admin.js)"*
- Commit 6: *"feat: filtro Archivados en barra de pedidos (admin.html)"*

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
  se evaluó en Sesión 18 y Meta no permite eliminarla. Se deja.
- Dataset/Pixel: `Founder Pixel` (ID `2898267450518541`).
- Hay un dataset "NO" (ID `1472474751248750`) creado por accidente al testear
  — se intentó eliminar en Sesión 18 pero Meta no permite delete vía UI. Se deja.

### Meta Pixel + CAPI
- `META_PIXEL_ID` y `META_CAPI_TOKEN` configurados en Vercel Environment
  Variables. **Importante**: NO marcadas como "Sensitive" por issues de
  propagación en el plan Hobby. Funcionan bien sin ese flag.
- `components/meta-pixel.js` (~230 líneas): wrapper oficial del Pixel con API
  pública `window.founderPixel`. Dispara PageView automático + helpers tipados
  para ViewContent, AddToCart, InitiateCheckout, Purchase.
- Script `<script src="components/meta-pixel.js">` en los 8 HTML públicos.
- `producto.html` dispara ViewContent al renderizar + AddToCart al agregar.
- `index.html` dispara AddToCart al agregar desde modal.
- `components/founder-checkout.js` dispara InitiateCheckout + Purchase cliente.
- `api/_lib/meta-capi.js` (~230 líneas): módulo CAPI con hasheado SHA-256 de
  email/teléfono/nombre, extracción de IP/UA/fbp/fbc, POST a
  `graph.facebook.com/v19.0/{pixel_id}/events`. Fallo silencioso si faltan
  env vars.
- `api/checkout.js` invoca `sendPurchaseEvent` con `await` + `Promise.race`
  con timeout de 3s — crítico para que Vercel Serverless no mate el fetch.
- `event_id` unificado = `order.numero` → Meta deduplica automáticamente.

### Verificación end-to-end (pedido F378204)
```
23:02:59.125  [meta-capi] sendPurchaseEvent invoked { token_length: 201 }
23:02:59.343  [meta-capi] Purchase enviado OK { received: 1, trace: A3wc3i... }
23:02:59.343  [checkout] CAPI result: { ok: true, events_received: 1 }
```
218ms desde invocación hasta confirmación de Meta. `messages: []` = payload
perfecto.

---

## ✅ Lo que quedó funcionando en Sesión 16 (Fase 3C)

### Incidente inicial resuelto
`/api/admin` devolvía 500 `"permission denied for table products"`. Causa:
`service_role` no tenía `GRANT ALL` sobre las 3 tablas del catálogo. Fix:
`grant all on public.<tabla> to service_role` sobre las 7 tablas (snippet
*"Fix service_role Table Permissions"*).

### Limpieza del código
- `index.html` + `producto.html`: eliminadas `SHEET_ID` y `APPS_SCRIPT_URL`.
- `admin.html`: eliminada página *"Conversor de imágenes"* (-42 líneas).
- `founder-admin.js`: eliminadas 6 funciones del conversor (-70 líneas).
- Cabezales reescritos en 6 archivos (sin menciones a GViz/gapi/Apps Script/Drive).
- `api/ping.js` eliminado.

### Apagados en Google
1. Apps Script: archivado. La URL `/exec` devuelve error.
2. Google Sheet: renombrado `[ARCHIVADO 2026-04]`, movido a carpeta de archivo.
   Backup `.xlsx` local + en Drive.
3. Proyecto de Google Cloud: marcado para eliminación (~22/05/2026).

---

## ✅ Lo que quedó funcionando en Sesión 15 (Fase 3B)

- `components/founder-admin.js` — IIFE, expone 37 funciones a `window` tras
  Sesión 18 (eran 34 tras Sesión 16, ahora +3 por archivar/desarchivar/eliminar).
- `admin.html` — 686 líneas tras Sesión 18.
- Login valida contra `/api/admin` action `login`. Password en sessionStorage.
- Pedidos, productos (con upload directo a Storage), cupones y banner todos
  sobre `/api/admin`.

---

## ✅ Lo que quedó funcionando en Sesión 14 (Fase 3A)

### Infraestructura
- Vercel Serverless Functions en `/api/*`:
  - `/api/checkout` — validar cupón + crear pedido (atómico via RPC)
  - `/api/seguimiento` — buscar pedido por número+email
  - `/api/admin` — 17 acciones (14 + 3 nuevas de Sesión 18)
- Variables de entorno en Vercel:
  - `SUPABASE_URL` ✅
  - `SUPABASE_SERVICE_ROLE_KEY` (Sensitive) ✅
  - `ADMIN_PASSWORD` = `nerito20` (Sensitive) ✅
  - `META_PIXEL_ID` ✅ (agregada Sesión 17)
  - `META_CAPI_TOKEN` ✅ (agregada Sesión 17)
- Storage bucket `product-photos` público.
- RPC `apply_coupon_and_create_order(jsonb, jsonb, text)` — transacción atómica.

### Pedido de prueba histórico
- Número: `F910752` / `test@prueba.com` / Confort Negro × 1 / $2.490.

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
4. **`orders`** — 23 columnas (Sesión 18: +`archivado`): id (uuid), numero
   (unique), fecha, nombre, apellido, celular, email, entrega, direccion,
   productos, subtotal, descuento, envio, total, pago, estado, notas,
   nro_seguimiento, url_seguimiento, cupon_codigo, **archivado** (bool,
   default false), created_at, updated_at.
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

### Índices (Sesión 18)
- `orders_archivado_idx` — parcial sobre `archivado = false`. Acelera la
  query principal del admin que lista solo pedidos activos.

### Permisos

| Tabla | anon | authenticated | service_role |
|---|---|---|---|
| `products` | SELECT (RLS) | SELECT (RLS) | **ALL** ✅ |
| `product_colors` | SELECT (RLS) | SELECT (RLS) | **ALL** ✅ |
| `product_photos` | SELECT (RLS) | SELECT (RLS) | **ALL** ✅ |
| `site_settings` | SELECT | SELECT | ALL |
| `orders` | ❌ | ❌ | ALL |
| `order_items` | ❌ | ❌ | ALL |
| `coupons` | ❌ | ❌ | ALL |

⚠️ En las 3 primeras tablas del catálogo `service_role` NECESITA `ALL` explícito,
aunque solo usemos RLS para `anon`/`authenticated`. PostgreSQL requiere GRANT +
policy — `service_role` bypassea RLS pero NO bypassea GRANTs de tabla.

### Triggers
- `trg_orders_updated_at` — actualiza `updated_at` en cada UPDATE de `orders`.
- `set_updated_at()` en `products`.

---

## 📂 Archivos del proyecto (estructura actual en GitHub)

```
founder-web/
├── index.html                     ✅ (Sesión 18: +meta-verification)
├── producto.html                  ✅ (Sesión 18: +meta-verification)
├── checkout.html                  ✅ (Sesión 18: +meta-verification)
├── seguimiento.html               ✅ (Sesión 18: +meta-verification)
├── admin.html                     ✅ (686 líneas — Sesión 18: +meta-verif + filtro Archivados)
├── contacto.html                  ✅ (Sesión 18: +meta-verification)
├── sobre-nosotros.html            ✅ (Sesión 18: +meta-verification)
├── envios.html                    ✅ (Sesión 18: +meta-verification)
├── tecnologia-rfid.html           ✅ (Sesión 18: +meta-verification)
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅
│   ├── cart.js                    ✅
│   ├── supabase-client.js         ✅ (fuente de verdad del catálogo)
│   ├── meta-pixel.js              ✅ (Sesión 17)
│   ├── founder-checkout.js        ✅
│   ├── founder-seguimiento.js     ✅
│   └── founder-admin.js           ✅ (~1810 líneas — Sesión 18: +150 por archive/delete)
├── api/
│   ├── _lib/
│   │   ├── supabase.js            ✅
│   │   └── meta-capi.js           ✅ (Sesión 17)
│   ├── checkout.js                ✅
│   ├── seguimiento.js             ✅
│   └── admin.js                   ✅ (Sesión 18: +75 por archive/unarchive/delete)
├── package.json                   ✅ (Sesión 18: +"type": "module")
├── vercel.json                    ✅ (CORS + maxDuration 15s)
├── README.md                      ✅
└── ESTADO.md                      ← este archivo
```

**Eliminado en Sesión 18:** `api/supabase.js` (era duplicado de `api/_lib/supabase.js`).
**Eliminado en Sesión 16:** `api/ping.js`.

---

## 🔧 API /api/admin — Acciones (17 totales)

| Categoría | Action | Qué hace |
|---|---|---|
| **Auth** | `login` | Valida password, devuelve 200 si es correcto |
| **Pedidos** | `list_orders` | Lista con filtro `include_archived` (`'only'`/`'all'`/default=activos) |
| | `update_order_status` | Cambia `orders.estado` |
| | `update_order_tracking` | Guarda nro_seguimiento + url_seguimiento |
| | `archive_order` 🆕 | Soft delete (archivado=true). Reversible |
| | `unarchive_order` 🆕 | Restaurar (archivado=false) |
| | `delete_order` 🆕 | DELETE definitivo. Requiere `body.confirm=true` |
| **Cupones** | `list_coupons` | Lista todos |
| | `create_coupon` | Alta |
| | `update_coupon` | Toggle activo + editar |
| | `delete_coupon` | Elimina |
| **Productos** | `list_products` | Lista con colores y fotos |
| | `save_product` | Upsert (producto + colores + fotos) |
| | `delete_product` | Elimina con cascada |
| **Settings** | `get_setting` | Lee `site_settings[key]` |
| | `set_setting` | Escribe `site_settings[key]` |
| **Storage** | `get_upload_url` | Genera signed URL para upload directo al bucket |

---

## ⚠️ Reglas críticas NO NEGOCIABLES

### Reglas de código
- La clave interna `'sin_stock'` NO se modifica jamás.
- Sistema de componentes (`header.js`, `footer.js`, `cart.js`,
  `supabase-client.js`, `meta-pixel.js`, `founder-checkout.js`,
  `founder-seguimiento.js`, `founder-admin.js`) es la **única fuente de
  verdad**. No replicar markup/lógica en HTMLs.
- `supabase-client.js` SIEMPRE antes que `cart.js` (y antes que cualquier
  componente que use `window.founderDB`).
- `checkout.html` y `admin.html` quedan excluidos del sistema de header/footer
  compartido — tienen header propio.
- `service_role` NUNCA va al frontend — solo en `/api/*` Vercel Functions con
  env var.
- **El `delete_order` del admin requiere DOBLE confirmación del usuario** +
  backend valida `body.confirm === true`. Nunca eliminar esa defensa.

### Reglas de base de datos
- **Cuando se cree una tabla o se active RLS, SIEMPRE emitir explícitamente
  `GRANT SELECT/ALL ... TO anon|authenticated|service_role`**. Las RLS policies
  por sí solas **NO alcanzan** — PostgreSQL requiere los dos niveles.
- **Los constraints CHECK de `orders` deben coincidir EXACTO con los strings
  que manda el frontend**. Cualquier desalineamiento rompe el INSERT.
- **`service_role` NO bypassea GRANTs de tabla** — solo bypassea RLS.
- Las 4 tablas privadas (`orders`, `order_items`, `coupons`, + parcialmente
  `site_settings`) **SOLO se tocan vía `/api/*`**.
- NO tocar manualmente las tablas desde el dashboard. Todos los cambios vía
  SQL versionado guardado como snippet en Supabase.

### Reglas de navegador (nuevo — Sesión 18)
- **Para probar cambios en paneles de Meta Business, usar Google Chrome**.
  Opera tiene bugs de validación intermitentes que causan diagnósticos
  erróneos. Firefox y Edge tampoco están recomendados.
- **Para probar deploys en Vercel, hacer hard refresh (`Ctrl+F5`) o usar
  ventana incógnito**. Opera (y a veces Chrome) cachean HTML agresivamente.

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

### Prueba del sistema archivar/eliminar (Sesión 18)
1. En `/admin.html → Pedidos`, verificar que cada tarjeta muestre al final:
   botones de estado + `📁 Archivar` + `🗑 Eliminar` (rojo).
2. Clic en **📁 Archivar** sobre un pedido → confirmar → debe desaparecer
   de la lista con toast verde.
3. Clic en filtro **📁 Archivados** (último botón de la barra, alineado a
   la derecha) → debe aparecer el pedido con badge "ARCHIVADO".
4. Clic en **↩ Desarchivar** → confirmar → desaparece de ahí.
5. Volver a filtro "Todos" → reaparece en la lista normal.
6. Clic en **🗑 Eliminar** sobre un pedido de prueba → confirmar warning →
   prompt pide escribir el número exacto (ej: `F515156`) → escribir → aceptar
   → borrado definitivo con toast.
7. Verificar en Supabase que `orders` y `order_items` asociados se borraron.

### Prueba de cupón
```sql
insert into public.coupons (codigo, tipo, valor, uso, min_compra, activo)
values ('TEST10', 'porcentaje', 10, 'multiuso', 0, true);
```
Aplicarlo en checkout → debe restar 10% + sumar 1 a `usos_count`.

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
| Meta Business | founder.uy (Business portfolio) |
| Meta Pixel ID | `2898267450518541` (Founder Pixel) |
| Meta domain-verification token | `6qpwim4axainj6z7q5d06778d8qsxd` (en los 9 HTML) |
| Pedido de prueba histórico | `F910752` / `test@prueba.com` / Confort Negro / $2.490 |
| Backup del Sheet viejo | `.xlsx` guardado localmente + en carpeta "FOUNDER — archivo legacy (pre-Supabase)" en Drive |

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
  resuelto con `GRANT ALL`. Código 100% libre de legacy. Apps Script apagado,
  Sheet archivado con backup, proyecto de Google Cloud marcado para
  eliminación (se borra ~22/05/2026). `api/ping.js` eliminado.
- **Sesión 17 (Fase 4):** Dominio custom `founder.uy` conectado a Vercel.
  Meta Business Portfolio creado con Facebook Page + Instagram Business +
  Pixel + Access Token CAPI. Componente `meta-pixel.js` + módulo
  `api/_lib/meta-capi.js`. Tracking dual operativo. Test end-to-end F378204
  confirmó deduplicación.
- **Sesión 18 (Fase 4 cierre + Fase 5 inicio):** Desbloqueada y completada la
  verificación de dominio en Meta (era bug de Opera, no de Meta). Metaetiqueta
  agregada en los 9 HTML. Limpieza técnica: `"type": "module"` en package.json
  + eliminado `api/supabase.js` duplicado. **Nueva feature: sistema archivar/
  eliminar pedidos** con 3 actions en backend, 3 funciones frontend, doble
  confirmación para delete, vista separada de archivados, nueva columna
  `archivado` en `orders` + índice parcial. ← **Acá terminamos.**
- **Sesión 19:** 3 pendientes menores de Meta + prueba del sistema archivar/
  eliminar con pedidos de prueba acumulados + evaluación de campañas pagas.
  ← **Próxima.**

---

## 📋 Pendientes para Sesión 19

### Prioridad media — 3 clics en Chrome
Las 3 se intentaron en Sesión 18 pero Meta Business Manager **no ofrece delete
en la UI** para estos recursos. Alternativas aceptables:

1. **Renombrar dataset "NO"** (ID `1472474751248750`) con prefijo `ZZ-` para
   que quede al final alfabéticamente. Si ni renombrar deja, ignorar.
2. **Renombrar o ignorar Ad Account `26140748312219895`** (auto-creada, sin
   nombre).
3. **Agregar email de contacto al Instagram** en Meta Business Portfolio
   (badge "Missing contact info" en Users → People).

### Prioridad media — usar la nueva funcionalidad
4. **Borrar pedidos de prueba acumulados** con el nuevo sistema de eliminar
   desde el admin (en lugar del SQL). Candidatos detectados en captura de
   Sesión 18:
   - `F237553`, `F839362`, `F029945` — Evandro Segovia con CIs tipo `77777777`
     / `5555555` / `11111458` y direcciones random (`erwre`, `dsfsdf`, `erf`).
   - `F264440`, `F515156` — `enadro e eeef` + `enadro e eddd` / `fdfd@gmail.com`
     con CIs random.
   - `F378204` — pedido de prueba de CAPI (Sesión 17).
   - ⚠️ **NO BORRAR**: `F203641` — Florencia Risso / `florenciar.1196@gmail.com`
     → parece un pedido real, confirmar antes de tocar.

### Prioridad baja — pulido
5. **Reintentar username `founder.uy` para la Page de Facebook** cuando Meta
   lo libere (actualmente `founder.uy.oficial`).

### Prioridad alta (no bloqueante) — solo cuando arranquen ads
6. **Evaluar primera campaña paga de Meta Ads** con optimización de Purchase.
   Con el dominio verificado, AEM debería funcionar correctamente en iOS 14.5+.
   Definir: presupuesto diario, producto destacado, público objetivo
   (remarketing a visitantes de `producto.html` vs frío).

---

## 📜 Historial de incidentes resueltos

### Sesión 18 (3 incidentes)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Meta rechazaba agregar `www.founder.uy` en Business Settings (Sesión 17 lo reportó como "bug del PSL con ccTLDs .uy") | Bug del validador del formulario en Opera — en Chrome funciona | Usar Chrome para operaciones en Meta Business Manager |
| 2 | Filtro "📁 Archivados" no aparecía en admin tras deploy | Cache agresivo de Opera — el HTML antiguo seguía sirviéndose | `Ctrl+F5` (hard refresh) o ventana incógnito |
| 3 | Intento de eliminar dataset "NO" y Ad Account sin nombre en Meta | Meta no ofrece botón delete en UI para recursos auto-creados | Dejar como están o renombrar con prefijo `ZZ-` |

### Sesión 17 (5 incidentes)
- Meta rechazó `founder.uy` en verificación de dominio → **era Opera**, resuelto en Sesión 18.
- Upload parcial a GitHub con la interfaz web → subir en tandas chicas de 2-3 archivos.
- Archivo subido a carpeta equivocada (`meta-capi.js` en `api/` en vez de `api/_lib/`) → verificar breadcrumb antes de arrastrar.
- Variables "Sensitive" en Vercel Hobby con issues de propagación → crear sin el flag.
- Fire-and-forget cortado por Vercel Serverless → `await Promise.race([capiPromise, timeoutPromise(3000)])`.

### Sesión 16 (1 incidente)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Admin 500 `"permission denied for table products"` | `service_role` sin `GRANT ALL` sobre las 3 tablas del catálogo | SQL `grant all on public.<tabla> to service_role` sobre las 7 tablas |

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

**FIN** — Cerramos Sesión 18. Fase 4 definitivamente completa (dominio verificado
en Meta). Fase 5 iniciada con el sistema archivar/eliminar pedidos. El sitio
corre 100% sobre Supabase + Vercel, con dominio custom `www.founder.uy`
verificado en Meta, tracking dual (Pixel + CAPI) operativo, y admin con
herramientas de gestión escalable. Próximo paso: cerrar los 3 pendientes
menores de Meta y evaluar primera campaña paga. 🎯
