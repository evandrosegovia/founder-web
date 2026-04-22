# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 15 (22/04/2026)
**Próxima sesión:** 16 — Fase 3C (limpieza: apagar Apps Script + borrar `api/ping.js`)

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y arrancá con la **Fase 3C** (limpieza final).
> Ya están migrados **checkout**, **seguimiento** y **admin** (Fases 3A y 3B completas).
> La admin ya usa `/api/admin` + Supabase, sin Google Sheets ni Drive.
> Queda: apagar el Apps Script viejo, borrar `api/ping.js`, archivar el Sheet, y verificar que nada en el código siga apuntando al Sheet ID.

---

## 🗺️ Hoja de ruta de fases

| Fase | Estado | Descripción |
|---|---|---|
| **1** — Setup inicial | ✅ Completa | Supabase creado, 6 tablas, schema base |
| **2A** — Migrar catálogo | ✅ Completa | products, product_colors, product_photos cargados |
| **2B** — Frontend público | ✅ Completa | index/producto/carrito leen de Supabase |
| **3A** — Checkout + Seguimiento | ✅ Completa | Ambos migrados a `/api/checkout` y `/api/seguimiento` |
| **3B** — Admin | ✅ **Completa** | `admin.html` migrado a `/api/admin` — sin Sheets ni Drive |
| **3C** — Limpieza | ⏳ **Pendiente** | Apagar Apps Script, borrar `api/ping.js`, archivar Sheet |
| **4** — Meta Pixel + CAPI | ⏳ Pendiente | Tracking para Facebook/Instagram Ads |

---

## ✅ Lo que quedó funcionando en Sesión 15 (Fase 3B)

### Admin migrado completo
- **`components/founder-admin.js`** — ~1730 líneas, IIFE. Contiene toda la lógica del panel. Expone a `window` las 38 funciones que el HTML usa por `onclick=` inline.
- **`admin.html`** — bajó de 2448 → 726 líneas (-70%). Solo se reemplazó el bloque `<script>` inline por `<script src="components/founder-admin.js">`. HTML/CSS preservados salvo:
  - Quitado el botón/status de "Conectar Drive" del topbar.
  - Quitados los enlaces a "Planilla" y "Google Drive" del sidebar.
  - Quitada la sección "Configuración inicial" (inicializar headers del Sheet ya no aplica).
  - Quitado el modal "drive-gate" que pedía conectar Drive al entrar.
  - Actualizados los info-box de Productos y Banner para reflejar que ahora todo vive en Supabase.
  - Limpiado CSS huérfano: `.drive-status`, `.drive-gate-*`, `.panel-blocked`.

### Cambios funcionales
- **Login**: ahora valida contra `/api/admin` (action `login`) en vez de un password hardcodeado en el JS. El password se guarda en `sessionStorage['founder_admin_pw']` durante la sesión del navegador. Si el server responde 401, se hace logout automático.
- **Pedidos**: lista, filtros por estado, detalle con barra de progreso, cambio de estado y tracking de envío — todo sobre `/api/admin` (list_orders, update_order_status, update_order_tracking).
- **Productos**: CRUD completo con colores (activo/sin_stock/oferta+precio_oferta) y fotos (hasta 5 por color), todo sobre `save_product` / `delete_product` / `list_products`.
- **Fotos**: upload directo a Supabase Storage con signed URL (action `get_upload_url`). El binario NO pasa por Vercel. Bucket `product-photos` público.
- **Cupones**: CRUD completo sobre `list_coupons` / `create_coupon` / `update_coupon` / `delete_coupon`.
- **Banner del hero**: se persiste en `products.banner_url` del primer producto activo (mismo campo que lee `supabase-client.js → fetchBannerUrl`). Se usa `save_product` pasando el producto completo + el nuevo `banner_url`, preservando colores y fotos existentes para evitar corrupción.
- **Conversor de links de Drive**: se mantiene como herramienta de utilidad (no depende de Drive, solo parsea URLs localmente). Texto actualizado para dejar claro que es opcional.

### Eliminado del código
- Todas las referencias a `gapi`, `google.accounts.oauth2`, `accounts.google.com/gsi/client`, `apis.google.com`.
- Variables globales `SHEET_ID`, `SHEET_URL`, `FOTOS_URL`, `SHEET_PEDIDOS_URL`, `CUPONES_SHEET_URL`, `CLIENT_ID`, `SCOPES`, `accessToken`, `driveReady`, `tokenClient`.
- Funciones `connectDrive`, `connectDriveGate`, `skipDriveGate`, `initGoogleClient`, `uploadToDrive`, `findOrCreateFolder`, `updateSheetCell`, `writeOrderToSheet`, `writeBannerToSheet`, `syncPendingOrders`, `initPedidosHeaders`, `initCuponesHeaders`.
- Uso de `localStorage['founder_pedidos']` y `localStorage['founder_pedidos_pending']` como fallback (ya no se usan — Supabase es la única fuente).

---

## ✅ Lo que quedó funcionando en Sesión 14 (Fase 3A)

### Infraestructura nueva
- **Vercel Serverless Functions** desplegadas en `/api/*`:
  - `/api/ping` — diagnóstico (ok, borrar en Fase 3C)
  - `/api/checkout` — validar cupón + crear pedido (atómico)
  - `/api/seguimiento` — buscar pedido por número+email
  - `/api/admin` — 14 acciones (login, pedidos, cupones, productos, banner, upload) — **conectado desde `admin.html` en Sesión 15**
- **Variables de entorno en Vercel** (Production+Preview):
  - `SUPABASE_URL` ✅
  - `SUPABASE_SERVICE_ROLE_KEY` (Sensitive) ✅
  - `ADMIN_PASSWORD` = `nerito20` (Sensitive) ✅
- **Storage bucket `product-photos`** creado en Supabase (público, ya listo para que admin suba fotos).
- **Función RPC `apply_coupon_and_create_order(jsonb, jsonb, text)`** — transacción atómica con lock FOR UPDATE del cupón.

### Componentes frontend nuevos
- `components/founder-checkout.js` — ~500 líneas, IIFE. Expone 10 funciones a `window` (goBack, setEntrega, setPago, applyCoupon, removeCoupon, processOrder, reenviarPedido, verDetallesCompra, showLegal, hideLegal). Usa `fetch('/api/checkout')`.
- `components/founder-seguimiento.js` — ~500 líneas, IIFE. Expone 5 funciones (buscarPedido, resetear, copiarNroSeguimiento, abrirUrlSeguimiento, coordinarRetiro). Usa `fetch('/api/seguimiento')`.

### HTMLs modificados
- `checkout.html` — 1132 → 552 líneas. Solo cambió el bloque `<script>` inline por `<script src="components/founder-checkout.js">`. HTML/CSS 100% intactos (verificado con diff).
- `seguimiento.html` — 1881 → 1321 líneas. Mismo patrón: el bloque del carrito (1206-1317) quedó sin tocar; se reemplazó solo el bloque de seguimiento (1319-1879) por el script externo.

### Pedido de prueba validado
- **Número:** `F910752`
- **Email:** `test@prueba.com`
- **Producto:** Confort Negro × 1 — $2.490
- **Entrega:** Envío — Falsa 123 2222, Montevideo
- **Pago:** Transferencia
- **Estado:** Pendiente
- Guardado en `orders` + `order_items` en Supabase.
- Visible en `/seguimiento.html?pedido=F910752&email=test@prueba.com`.

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

1. **`products`** — id, slug, nombre, precio, descripcion, especificaciones, capacidad, dimensiones, material, nota, lleva_billetes, lleva_monedas, banner_url, orden, activo, created_at, updated_at.
2. **`product_colors`** — id, product_id, nombre, estado (check: `activo`/`sin_stock`/`oferta`), precio_oferta, orden, created_at.
3. **`product_photos`** — id, color_id, url, orden, es_principal, created_at.
4. **`orders`** — 22 columnas: id (uuid), numero (unique), fecha, nombre, apellido, celular, email, entrega, direccion, productos, subtotal, descuento, envio, total, pago, estado, notas, nro_seguimiento, url_seguimiento, cupon_codigo, created_at, updated_at.
5. **`order_items`** — id, order_id (FK cascade), product_name, color, cantidad, precio_unitario.
6. **`coupons`** — id, codigo (unique), tipo (`fijo`/`porcentaje`), valor, uso (`multiuso`/`unico`/`por-email`), min_compra, activo, usos_count, emails_usados (text[]), desde, hasta, created_at.
7. **`site_settings`** — key (PK), value, updated_at.

### Constraints CHECK en `orders` (alineados con frontend)
- `orders_entrega_check` → `entrega IN ('Envío','Retiro')`
- `orders_pago_check` → `pago IN ('Mercado Pago','Transferencia')`
- `orders_estado_check` → `estado IN ('Pendiente pago','Pendiente confirmación','Confirmado','En preparación','En camino','Listo para retirar','Entregado','Cancelado')`
- `orders_subtotal_check`, `orders_descuento_check`, `orders_envio_check`, `orders_total_check` → todos `>= 0`

### Permisos (después de todos los fixes de Sesión 14)
| Tabla | anon | authenticated | service_role |
|---|---|---|---|
| `products` | SELECT (RLS) | SELECT (RLS) | — |
| `product_colors` | SELECT (RLS) | SELECT (RLS) | — |
| `product_photos` | SELECT (RLS) | SELECT (RLS) | — |
| `site_settings` | SELECT | SELECT | ALL |
| `orders` | ❌ | ❌ | ALL |
| `order_items` | ❌ | ❌ | ALL |
| `coupons` | ❌ | ❌ | ALL |

### Trigger
- `trg_orders_updated_at` — actualiza `updated_at` en cada UPDATE de `orders`.
- `set_updated_at()` en `products` (ya existía).

---

## 📂 Archivos del proyecto (estructura actual en GitHub)

```
founder-web/
├── index.html                     ✅ (Fase 2B)
├── producto.html                  ✅ (Fase 2B)
├── checkout.html                  ✅ (migrado Paso 4)
├── seguimiento.html               ✅ (migrado Paso 5)
├── admin.html                     ✅ (migrado Paso 6 — Sesión 15)
├── contacto.html                  ✅
├── sobre-nosotros.html            ✅
├── envios.html                    ✅
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅
│   ├── cart.js                    ✅ (depende de founderDB)
│   ├── supabase-client.js         ✅ (fuente de verdad del catálogo)
│   ├── founder-checkout.js        ✅
│   ├── founder-seguimiento.js     ✅
│   └── founder-admin.js           ✅ NUEVO (Sesión 15)
├── api/
│   ├── _lib/supabase.js           ✅
│   ├── ping.js                    ⏳ (borrar en Fase 3C)
│   ├── checkout.js                ✅
│   ├── seguimiento.js             ✅
│   └── admin.js                   ✅ conectado desde admin.html (Sesión 15)
├── package.json                   ✅ (declara @supabase/supabase-js)
├── vercel.json                    ✅ (CORS + maxDuration 15s)
└── ESTADO.md                      ← este archivo
```

---

## 🎯 Plan técnico para Fase 3C (limpieza)

### Qué eliminar/archivar
1. **Borrar `api/ping.js`** — era solo diagnóstico, ya no hace falta.
2. **Apagar el Apps Script** (`https://script.google.com/macros/s/AKfycbx8.../exec`) — ya nadie lo consume.
3. **Archivar el Google Sheet** (`1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8`) — hacer backup, después marcarlo como read-only o mover a una carpeta "archivo".
4. **Revisar cliente OAuth de Google** en Google Cloud Console — desactivarlo o borrarlo (CLIENT_ID `733837099876-opi6t9ohpru...`).

### Checks preventivos
Correr en `grep` sobre el repo completo para asegurar que no quedó ninguna referencia al Sheet ID ni al Apps Script:
```bash
grep -rn "1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8" .
grep -rn "script.google.com" .
grep -rn "gviz/tq" .
grep -rn "gapi\|google.accounts" .
```
Todos deberían devolver vacío (excepto tal vez este ESTADO.md, lo cual es aceptable).

### Decisiones a confirmar al arrancar Sesión 16
1. ¿Hacemos backup del Sheet antes de archivarlo? (recomendado: descargar como XLSX).
2. ¿Mantenemos el Apps Script como "deprecado" unos días o lo apagamos de una?
3. ¿Limpiamos también el bloque `SHEET_ID` aún mencionado en la variable `Google Sheet (legacy)` de este doc?

---

## 📜 Historial — Fase 3B (lo que se hizo en Sesión 15)

### Archivos creados
- `components/founder-admin.js` (1730 líneas).

### Archivos modificados
- `admin.html` (2448 → 726 líneas).
- `ESTADO.md` (este archivo).

### Archivos sin tocar
- Todos los demás componentes (`supabase-client.js`, `cart.js`, `founder-checkout.js`, `founder-seguimiento.js`, etc.).
- Todos los endpoints `/api/*` (ya estaban listos desde Sesión 14).
- El schema de Supabase (no hizo falta ningún SQL).

### Incidentes/decisiones de diseño
- El backend `/api/admin` ya existía desde Sesión 14 con las 14 actions necesarias. No hubo que tocar nada del server side.
- Decisión: el banner se sigue guardando en `products.banner_url` (no en `site_settings`) para mantener consistencia con cómo lo lee el frontend público (`supabase-client.js → fetchBannerUrl`).
- Decisión: se conserva la página "Conversor de imágenes" porque sigue siendo útil para links antiguos de Drive que el usuario pueda tener guardados. No depende de ningún API.
- Descarte de `site_settings` para el banner: había una doble vía de guardado posible (get/set_setting vs products.banner_url). Usar `products.banner_url` evita una potencial inconsistencia donde la UI admin mostrara un valor pero el frontend público leyera otro.

---

## 📜 Historial de incidentes resueltos en Sesión 14

Seis problemas aparecieron en cascada durante el testing del checkout/seguimiento. Todos resueltos con SQLs versionados:

| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Home sin fotos, error 401 "permission denied for table product_photos" | Políticas RLS viejas tenían rol `{public}` en vez de `{anon,authenticated}` | `04_fix_rls.sql` — recrear 4 policies con rol correcto |
| 2 | Persiste 401 tras fix RLS | Faltaba GRANT SELECT a nivel tabla (las policies RLS no bastan) | `05_fix_grants.sql` — GRANT SELECT a anon/authenticated |
| 3 | Checkout: "column productos does not exist" | Columna `productos` (y 11 más) no existían en `orders` | `06_fix_orders_schema.sql` — ADD COLUMN IF NOT EXISTS + trigger updated_at |
| 4 | Checkout: "violates check constraint orders_entrega_check" | Constraint viejo rechazaba `'Envío'` (tenía otros valores) | `07_fix_entrega_check.sql` — DROP + ADD con valores correctos |
| 5 | Checkout: "violates check constraint orders_pago_check" | Mismo caso con `pago` — rechazaba `'Mercado Pago'` | `08_fix_pago_check.sql` — DROP + ADD con valores correctos |
| 6 | Seguimiento: "permission denied for table orders" | service_role NO bypassea GRANTs de tabla (solo RLS). Faltaba GRANT ALL a service_role en las 4 tablas privadas | `09_fix_service_role_grants.sql` — GRANT ALL a service_role + REVOKE de anon/authenticated |

---

## ⚠️ Reglas críticas NO NEGOCIABLES (aprendidas en esta sesión)

### Reglas de código
- La clave interna `'sin_stock'` NO se modifica jamás.
- Sistema de componentes (`header.js`, `footer.js`, `cart.js`, `supabase-client.js`, `founder-checkout.js`, `founder-seguimiento.js`) es la **única fuente de verdad**. No replicar markup/lógica en HTMLs.
- `supabase-client.js` SIEMPRE antes que `cart.js` (y antes que cualquier componente que use `window.founderDB`).
- `checkout.html` y `admin.html` quedan excluidos del sistema de header/footer compartido — tienen header propio.
- `service_role` NUNCA va al frontend — solo en `/api/*` Vercel Functions con env var.

### Reglas de base de datos (NUEVAS en esta sesión)
- **Cuando se cree una tabla o se active RLS, SIEMPRE emitir explícitamente `GRANT SELECT/ALL ... TO anon|authenticated|service_role`**. Las RLS policies por sí solas **NO alcanzan** — PostgreSQL requiere los dos niveles (GRANT + policy).
- **Los constraints CHECK de `orders` deben coincidir EXACTO con los strings que manda el frontend**. Cualquier desalineamiento rompe el INSERT.
- **`service_role` NO bypassea GRANTs de tabla** — solo bypassea RLS. Siempre GRANT ALL a service_role en tablas privadas.
- Las 4 tablas privadas (`orders`, `order_items`, `coupons`, + parcialmente `site_settings`) **SOLO se tocan vía `/api/*`**. El frontend con anon key no tiene acceso directo.
- Durante la migración: NO tocar manualmente las tablas desde el dashboard. Todos los cambios vía SQL versionado.

---

## 🧪 Cómo probar todo lo que está hecho

### Prueba end-to-end de compra
1. Abrir https://founder-web-gules.vercel.app
2. Agregar producto al carrito → checkout.
3. Completar, confirmar pedido.
4. Ver "🎉 ¡Pedido enviado!" con número `F######`.
5. Verificar en Supabase Dashboard → Table Editor → `orders` (fila nueva) + `order_items` (items del pedido).

### Prueba de seguimiento
1. Ir a `https://founder-web-gules.vercel.app/seguimiento.html?pedido=NUMERO&email=EMAIL`
2. Debería mostrar el detalle completo con barra de progreso, productos con foto, totales, etc.

### Prueba de cupón (opcional)
```sql
insert into public.coupons (codigo, tipo, valor, uso, min_compra, activo)
values ('TEST10', 'porcentaje', 10, 'multiuso', 0, true);
```
Aplicarlo en el checkout → debería restar 10% del subtotal y sumar 1 a `usos_count`.

### Limpieza de pedidos de prueba
```sql
delete from public.orders where email = 'test@prueba.com';
-- Los order_items asociados se borran en cascada automáticamente.
```

---

## 🔐 Datos clave (guardar en lugar seguro)

| Recurso | Valor |
|---|---|
| URL sitio producción | https://founder-web-gules.vercel.app |
| Repo GitHub | (usuario: evandrosegovia-1171s-projects) |
| Usuario Vercel | evandrosegovia-1171s-projects |
| Password admin | `nerito20` |
| Supabase URL | `https://qedwqbxuyhieznrqryhb.supabase.co` |
| Pedido de prueba vigente | `F910752` / `test@prueba.com` / Confort Negro / $2.490 |
| Google Sheet (legacy) | `1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8` (sigue vivo para admin hasta Fase 3B) |
| Apps Script (legacy) | `https://script.google.com/macros/s/AKfycbx8LByXXY7QwzHEB0RyvP0Ejbmqyw099F4ntbbwRIdkRv8JlUDaryn_vQj2aL9kANA/exec` (apagar en Fase 3C) |

---

## 📋 Historial de sesiones

- **Sesión 9-11:** Setup inicial, componentes, catálogo en Google Sheets.
- **Sesión 12:** Supabase configurado, schema inicial creado, catálogo migrado.
- **Sesión 13 (Fase 2):** Frontend público migrado a `window.founderDB`.
- **Sesión 14 (Fase 3A):** Checkout y seguimiento migrados a Supabase vía Vercel Serverless Functions. 6 incidentes de permisos/schema resueltos en cascada.
- **Sesión 15 (Fase 3B):** Admin migrado a `/api/admin` + Supabase Storage. `founder-admin.js` creado (1730 líneas). `admin.html` bajó 70% (2448→726 líneas). Eliminadas todas las dependencias de Google (gapi/OAuth/Sheets/Drive). ← **Acá terminamos.**
- **Sesión 16 (Fase 3C):** Limpieza — apagar Apps Script + borrar ping.js + archivar Sheet. ← **Próxima.**
- **Sesión 17+ (Fase 4):** Meta Pixel + CAPI.

---

**FIN** — Cerramos Sesión 15. Fases 3A y 3B completas. Fase 3C (limpieza) pendiente. 🎯
