# FOUNDER.UY — Estado del proyecto

**Última actualización:** Abril 2026 — Cierre de Sesión 13 (Fase 2 Supabase)
**URL del sitio:** https://founder-web-gules.vercel.app
**Deploy:** Vercel → GitHub (auto-deploy en push a `main`)

---

## ⚠️ INSTRUCCIONES PARA LA PRÓXIMA SESIÓN

1. Leer este archivo (`ESTADO.md`) primero — es la única fuente de verdad del proyecto.
2. **El usuario no sabe programar.** Todas las explicaciones deben ser paso a paso, claras y concretas. Cada paso que requiera acción del usuario debe estar numerado y explicado.
3. Confirmar con el usuario en qué **Fase de la migración a Supabase** están (ver más abajo).
4. Respetar las reglas críticas listadas más abajo.
5. Antes de aplicar cambios: analizar arquitectura actual, mantener consistencia con estilos/nomenclatura existentes, refactorizar cuando sea necesario, validar efectos colaterales.

---

## 🚧 Migración a Supabase — Hoja de ruta

**Decisión estratégica (Sesión 12):** migrar de Google Sheets + Apps Script a **Supabase (PostgreSQL)** antes de instalar Meta Pixel + CAPI. Motivo: mejor velocidad (50-200ms vs 1-3s), escalabilidad real, integraciones modernas.

### Estado de fases

| Fase | Tarea | Estado |
|---|---|:-:|
| **1** | Setup Supabase (cuenta, proyecto, 6 tablas) | ✅ |
| **2A** | Carga de datos en Supabase (productos, colores, fotos) | ✅ |
| **2B** | Conectar sitio a Supabase (lectura de catálogo) | ✅ |
| **3** | Migración de pedidos (checkout, admin, seguimiento, cupones) | ⏳ Pendiente |
| **4** | Meta Pixel + CAPI sobre la nueva arquitectura | ⏳ Pendiente |

### ✅ Fase 1 — COMPLETADA (Sesión 12)
- Cuenta Supabase creada vía GitHub (email base: `founder.uy@gmail.com`).
- Organización: `Founder` (plan Free). Proyecto: `founder-web`, región São Paulo (sa-east-1).
- 6 tablas creadas con schema SQL, RLS, triggers, índices.

### ✅ Fase 2A — COMPLETADA (Sesión 13)
- Script `02_carga_datos.sql` ejecutado con éxito.
- Cargado: 4 productos, 21 colores, 16 fotos.
- Normalizaciones aplicadas: "Rosado" → "Rosa", "Gris oscuro" → "Gris Oscuro" (ambos en Simple).
- Camel (Confort) marcado como `oferta` con `precio_oferta=2290`.
- Cupón `15OFF` NO se cargó (expirado). Pedidos NO se migraron (todos eran pruebas).
- Verificación: 4 / 21 / 1 / 16 (productos / colores / en_oferta / fotos). ✅ Confirmado por usuario.

### ✅ Fase 2B — COMPLETADA (Sesión 13)

**Cambios aplicados al código:**
1. **Nuevo: `components/supabase-client.js`** — cliente REST directo (sin SDK) a la anon key. Expone `window.founderDB.fetchProducts()`, `fetchPhotoMap()`, `fetchBannerUrl()`. Los objetos que devuelve tienen la **misma forma** que los que devolvía el parser del Sheet, para no tocar el render.
2. **`components/cart.js`** — reemplazó `fetchProductosRaw()` + `extractAgotadosFromRows()` por `fetchAgotadosFromSupabase()` que usa `window.founderDB`. La lógica de purga/notificación quedó 100% intacta.
3. **`index.html`** — reemplazó `fetchSheet(CONFIG.SHEET_PRODUCTOS/FOTOS)` + `parseProducts()` + `parsePhotoMap()` por llamadas a `window.founderDB`. Banner se lee vía `fetchBannerUrl()`. El mixin `enrichColors()` aplica `COLOR_MAP` después del fetch. `recoverCartPhoto()` también migrado.
4. **`producto.html`** — mismo patrón que `index.html`. `recoverCartPhoto()` también migrado.
5. **`checkout.html`** — `loadPhotos()` ahora usa `window.founderDB.fetchPhotoMap()`. `CONFIG.SHEET_ID` se mantiene para cupones (Fase 3).
6. **Script tag `<script src="components/supabase-client.js">`** agregado en las 8 páginas que cargan `cart.js`: `index`, `producto`, `checkout`, `contacto`, `envios`, `tecnologia-rfid`, `sobre-nosotros`, `seguimiento`. Siempre ANTES de `cart.js`.

**Lo que NO se tocó en Fase 2B (intencionalmente):**
- ❌ `admin.html` y `seguimiento.html` en su lectura de pedidos → Fase 3.
- ❌ `checkout.html` → envío de pedidos al Apps Script + lectura de cupones del Sheet → Fase 3.
- ❌ El Google Sheet sigue funcionando y actualizado. Si Supabase fallara, se podría revertir rápido.

**Validaciones ejecutadas:**
- Sintaxis JS de los 10 archivos: ✅ OK (`node --check`).
- Tests unitarios del conversor `toLegacyProduct`: 14/14 ✅.
- Residuos del Sheet en archivos migrados: 0 (solo queda `sheet=cupones` en checkout.html, intencional).
- Script tag `supabase-client.js` presente y ANTES de `cart.js` en las 8 páginas: ✅.
- Balance de llaves/paréntesis con parser tokenizer: 0/0/0 en todos los JS externos.

### ⏳ Fase 3 — Próxima sesión grande
1. Reescribir `processOrder()` de `checkout.html` para INSERT en `orders` + `order_items` (Supabase) en vez de POST al Apps Script.
2. Reescribir `admin.html` para leer/editar pedidos desde Supabase. **Problema de seguridad**: requiere `service_role key`, que NO debe ir al frontend. Opciones:
   - Proxy vía Vercel Serverless Function con password admin validada server-side (recomendado).
   - Usar Supabase Auth (más cambios, más seguro).
3. Reescribir `seguimiento.html` para buscar pedidos en Supabase por número.
4. Migrar lógica de cupones a Supabase (validación, contador de usos, `emails_usados`). Actualmente siguen leyéndose del Sheet.
5. Eliminar dependencias del Apps Script del código del sitio.
6. Decidir qué hacer con Apps Script: apagarlo o dejarlo como notificador (email/WA al admin cuando entra un pedido).

### ⏳ Fase 4 — Meta Pixel + CAPI
1. Crear componente `components/meta-pixel.js` con código base + `PageView`.
2. Agregar eventos: `ViewContent` (producto.html), `AddToCart` (index + producto), `InitiateCheckout` (checkout), `Purchase` (checkout tras INSERT), `Contact` (contacto.html).
3. Implementar CAPI. **Recomendación:** Vercel Serverless Function `/api/meta-capi.js` — ahora que Supabase está en su lugar, es la opción más limpia (disparar CAPI desde el mismo flujo post-INSERT).
4. Implementar `event_id` para deduplicación browser ↔ server.
5. Actualizar Política de Privacidad mencionando tecnologías de seguimiento.
6. Validar con Meta Pixel Helper (extensión Chrome).

---

## 🗄️ Supabase — Datos del proyecto

| Dato | Valor |
|---|---|
| URL del proyecto | `https://qedwqbxuyhieznrqryhb.supabase.co` |
| Organización | `Founder` (Free) |
| Región | São Paulo (sa-east-1) |
| Anon key | (guardada en `components/supabase-client.js`, expira 2036-04-21) |
| Service role key | Pendiente de obtener en Fase 3 (Project Settings → API → service_role) |

### Schema SQL (6 tablas ejecutado en Sesión 12)

1. **`products`** — id (uuid PK), slug (unique), nombre, precio (int), descripcion, especificaciones (text[]), capacidad, dimensiones, material, nota, lleva_billetes (bool), lleva_monedas (bool), banner_url, orden (int), activo (bool), created_at, updated_at.
2. **`product_colors`** — id (uuid PK), product_id (FK), nombre, estado (check: activo/sin_stock/oferta), precio_oferta (int nullable), orden, created_at. Unique (product_id, nombre).
3. **`product_photos`** — id (uuid PK), color_id (FK), url, orden, es_principal (bool), created_at.
4. **`orders`** — id, numero (unique), fecha, datos del cliente, entrega, direccion, totales, pago, estado (8 valores), notas, nro_seguimiento, url_seguimiento, cupon_codigo, created_at, updated_at.
5. **`order_items`** — id, order_id (FK cascade), product_name, color, cantidad, precio_unitario.
6. **`coupons`** — id, codigo (unique), tipo, valor, uso, min_compra, activo, usos_count, emails_usados (text[]), desde, hasta, created_at.

**Triggers:** `set_updated_at()` en `products` y `orders`.
**RLS:** catálogo = lectura pública; pedidos/coupons = solo service_role.

### Script de rollback
```sql
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.product_photos cascade;
drop table if exists public.product_colors cascade;
drop table if exists public.products cascade;
drop table if exists public.coupons cascade;
drop function if exists public.set_updated_at() cascade;
```

---

## 🎯 Regla de negocio final: manejo de productos agotados

**Si un producto del carrito está agotado → se elimina automáticamente + notificación recuadrada.**

- **TODAS las páginas** consultan el stock actual al cargar — ahora desde Supabase vía `window.founderDB`.
- La notificación aparece dentro del drawer (páginas con `cart.js`) o arriba del formulario (checkout).
- En checkout, doble seguro: revalidación al cargar + al confirmar pedido.
- La notificación incluye link "Ver otros modelos →" a `index.html#productos`.

### Reglas críticas NO NEGOCIABLES
- La clave interna `'sin_stock'` NO se modifica jamás.
- Sistema de componentes (`header.js`, `footer.js`, `cart.js`, `supabase-client.js`) es la única fuente de verdad. No replicar markup/lógica en HTMLs.
- `supabase-client.js` DEBE cargarse ANTES que `cart.js` en todas las páginas — `cart.js` depende de `window.founderDB`.
- `checkout.html` y `admin.html` quedan excluidos del sistema de header/footer compartido — ambos tienen header propio.
- Cuando se toque `cart.js`, recordar que 8 páginas dependen de él. Validar sintaxis + probar flujo completo.
- Durante la migración: NO tocar manualmente las tablas desde el dashboard. Todos los cambios vía SQL versionado.
- La `anon` key de Supabase es pública por diseño (va en el frontend). La `service_role` NUNCA va al frontend.

---

## 📂 Arquitectura actual (POST-Fase 2B)

### Flujo de lectura del catálogo
```
PÁGINA HTML
   ├─ <script src="components/supabase-client.js">  → expone window.founderDB
   ├─ <script src="components/cart.js">              → expone window.founderCart
   │
   ├─ Init:
   │   ├─ window.founderDB.fetchProducts()   → productos con colores embebidos
   │   ├─ window.founderDB.fetchPhotoMap()   → { modelo: { color: [urls] } }
   │   └─ window.founderDB.fetchBannerUrl()  → string | null (solo index)
   │
   ├─ enrichColors(products) → inyecta hex/css/pattern desde COLOR_MAP local
   ├─ state.products / state.photoMap / state.cart
   ├─ window.founderCart.saveStockSnapshot(state.products)  [en index/producto]
   ├─ window.founderCart.pruneAndQueue(state.cart)          [en index/producto]
   │   OR
   ├─ window.founderCart.bootPage(updateCartUI)             [en páginas 2ᵃrias]
   │   → internamente llama fetchStockAndPurge() que consulta Supabase
   │
   └─ Render (renderProducts / renderProduct / renderOrderSummary)
```

### Datos persistidos en el navegador
| Clave | Storage | Escrito por | Leído por |
|---|---|---|---|
| `founder_cart` | localStorage | todas (vía cart.js) | todas |
| `founder_stock_snapshot` | localStorage | index/producto + cart.js.fetchStockAndPurge | todas |
| `founder_removed_notice` | sessionStorage | cart.js (al purgar) | cart.js (al abrir drawer) + checkout.html |

### API de `components/supabase-client.js` (nuevo en Fase 2B)
Expuesto en `window.founderDB`:
- **`fetchProducts()`** → Array de productos activos ordenados, con colores embebidos. Cada producto tiene la forma `{id, name, price, desc, colors:[{name}], specs, extras:{capacidad, dimensiones, material, nota, billetes, monedas, colores_estado}}`. **Los datos visuales (hex/css/pattern) NO vienen del servidor** — los agrega `enrichColors()` en cada página desde su `COLOR_MAP` local.
- **`fetchPhotoMap()`** → `{ "Confort": { "Camel": ["url1","url2"], ... }, ... }`. Mismo formato que producía el parser del Sheet.
- **`fetchBannerUrl()`** → URL del banner del hero (primer producto activo). null si no hay.

### API de `components/cart.js` (sin cambios desde Sesión 11, solo migró la fuente)
En `window.founderCart`:
- **`fetchStockAndPurge()`** ⭐ Ahora lee de Supabase vía `window.founderDB`.
- **`bootPage(updateFn)`** — boot centralizado para páginas 2ᵃrias.
- **`flushRemovedNotice()`** — banner rojo dentro del drawer.
- **`saveStockSnapshot(products)`** — guarda snapshot desde productos parseados.
- **`pruneAndQueue(cart)`** — purga síncrona con snapshot en memoria.
- **`getRemovedQueue()` / `clearRemovedQueue()`** — queue de notificaciones.

---

## 🗂️ Archivos del proyecto

| Archivo | Descripción | Fase 2B |
|---|---|:-:|
| `index.html` | Tienda principal | ✅ Migrado a Supabase |
| `producto.html` | Ficha de producto | ✅ Migrado a Supabase |
| `checkout.html` | Checkout (header propio) | ⚠️ Fotos OK, pedidos y cupones siguen en Sheet |
| `admin.html` | Admin (password) | ⏳ Fase 3 |
| `seguimiento.html` | Seguimiento de pedido | ⏳ Fase 3 (búsqueda de pedidos) |
| `contacto.html` | Contacto | ✅ Script tag agregado |
| `envios.html` | Envíos y devoluciones | ✅ Script tag agregado |
| `sobre-nosotros.html` | Sobre nosotros | ✅ Script tag agregado |
| `tecnologia-rfid.html` | Tecnología RFID | ✅ Script tag agregado |
| `components/header.js` | Header compartido + menú mobile | — |
| `components/footer.js` | Footer compartido + modales legales + WA | — |
| `components/cart.js` | **Drawer + API `window.founderCart` + lectura de stock desde Supabase** | ✅ Migrado |
| `components/supabase-client.js` | **NUEVO** — API `window.founderDB` (REST directo a Supabase) | ✅ Creado |
| `ESTADO.md` | Este archivo — fuente de verdad del proyecto | — |

---

## 📦 Datos clave del proyecto

| Dato | Valor |
|---|---|
| **Supabase URL** | `https://qedwqbxuyhieznrqryhb.supabase.co` |
| **Supabase región** | São Paulo (sa-east-1) |
| Google Sheet ID (legacy — solo checkout/cupones en 2B) | `1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8` |
| Apps Script URL (legacy — solo envío de pedidos en 2B) | `https://script.google.com/macros/s/AKfycbx8LByXXY7QwzHEB0RyvP0Ejbmqyw099F4ntbbwRIdkRv8JlUDaryn_vQj2aL9kANA/exec` |
| WhatsApp | 598098550096 |
| Instagram | @founder.uy |
| Password admin | `nerito20` (solo en admin.html) |
| Google Client ID | `733837099876-opi6t9ohpru1c7su1hbgj8kqrvmqp1nh.apps.googleusercontent.com` |
| Envío gratis desde | $2.000 UYU |
| Costo de envío | $250 UYU — agencia UES (o cadetería en Montevideo) |
| Descuento transferencia | 10% — solo por transferencia bancaria |
| Retiro en local | Zona Prado, Montevideo |

---

## 🧪 Cómo probar que todo funciona (POST-Fase 2B)

1. Abrí el sitio en producción.
2. **Prueba 1 — Grilla de productos:** la home carga 4 productos con sus colores. El precio de Confort muestra tachado/oferta en Camel ($2490 → $2290). Banner del hero visible.
3. **Prueba 2 — Detalle de producto:** `producto.html?p=Confort` carga con todos los colores. Al seleccionar Camel, el precio cambia a $2290. Al seleccionar otro color vuelve a $2490.
4. **Prueba 3 — Stock agotado:**
   - Agregá Founder Confort Crema al carrito.
   - En Supabase Dashboard → Table Editor → `product_colors` → editar fila de Confort-Crema → cambiar `estado` a `sin_stock` y guardar.
   - Recargar cualquier página del sitio (incluso secundarias como `envios.html`).
   - **Esperado:** el item desaparece del carrito, contador del header se actualiza. Al abrir el drawer aparece banner rojo recuadrado. Se auto-cierra en 8s.
5. **Prueba 4 — Checkout:** con items válidos, el checkout debe cargar con las fotos correctas de los productos.
6. **IMPORTANTE:** revertir el cambio en Supabase después de la prueba (volver a `activo`).

### Cómo verificar desde la consola del navegador
```javascript
// En cualquier página del sitio:
window.founderDB._url         // URL de Supabase
await window.founderDB.fetchProducts()   // Lista de productos
await window.founderDB.fetchPhotoMap()   // Mapa de fotos
```

---

## 🎯 Propuestas estratégicas (pendientes)

| # | Prioridad | Propuesta |
|---|---|---|
| 0 | 🔴 **Crítica** | **Fase 3 de migración** (pedidos, admin, seguimiento, cupones) |
| 1 | 🟠 Alta | **Aplicar patch de founderCart a `contacto.html`** (verificar si sigue siendo necesario post-2B) |
| 2 | 🟠 Alta | Fase 4: Meta Pixel + CAPI |
| 3 | 🟢 Baja | Página "Gracias por tu compra" + cupón fidelización |
| 4 | 🟡 Media | Filtros en grilla (cuando crezca el catálogo) |
| 5 | 🟡 Media | Reseñas/testimonios de clientes |
| 6 | 🔵 Técnica | PWA / instalable (manifest + service worker) |

---

## ✅ Historial de sesiones

### Sesión 9
Migración a componentes compartidos. 7 páginas: 11.774 → 7.496 líneas (–36%). Unificación BEM, deduplicación modales legales.

### Sesión 10
4 tareas UX + reconstrucción de `seguimiento.html` usando `envios.html` como plantilla.

### Sesión 11
4 tareas UX mobile + primer intento de aviso sin stock + mejora header en `producto.html`.

### Sesión 11 consolidada — FIX DEFINITIVO
`fetchStockAndPurge()` en `cart.js`: cada página es autónoma al cargar su stock (antes solo lo hacían index/producto). Checkout ahora carga `cart.js` y revalida al confirmar.

### Sesión 12 — Setup Supabase
Análisis comparativo de alternativas (Supabase ganó). Auditoría del Sheet actual. Diseño del schema de 6 tablas. Ejecución del SQL inicial. 0 código tocado del sitio en producción.

### Sesión 13 — Fase 2A + Fase 2B completas

**Fase 2A (datos en Supabase):**
- Análisis del `founder-productos.xlsx`: 4 productos, 21 filas de fotos (16 con URL), 1 cupón expirado, 6 pedidos de prueba.
- Script SQL generado automáticamente con Python: `02_carga_datos.sql`.
- Ejecutado con éxito. Verificación: 4 productos, 21 colores, 16 fotos, 1 en oferta. ✅
- Camel de Confort marcado como `oferta` con `precio_oferta=2290`.
- Normalizaciones: "Rosado"→"Rosa", "Gris oscuro"→"Gris Oscuro" en Simple.

**Fase 2B (conectar sitio):**
- Decisión: usar **fetch directo** contra la REST API de PostgREST (sin SDK). Razones: más liviano (~50KB ahorrados), sin dependencias, código más corto, consistente con el estilo del resto del sitio.
- Anon key validada: `role=anon`, válida hasta 2036-04-21.
- Creado `components/supabase-client.js` con 3 funciones públicas y un conversor `toLegacyProduct()` que mantiene la forma del objeto que el código existente esperaba. Tests unitarios: 14/14 ✅.
- Migrados: `cart.js`, `index.html`, `producto.html`, `checkout.html` (solo fotos).
- Script tag agregado en las 8 páginas que cargan `cart.js`.
- `recoverCartPhoto()` migrado en ambos (index + producto) — fallback cuando una imagen del carrito falla.
- `CONFIG.SHEET_ID` y `APPS_SCRIPT_URL` se mantienen en los 3 HTMLs porque `checkout.html` los usa para cupones y envío de pedidos (Fase 3).
- Validaciones: sintaxis JS OK en 10 archivos, balance de llaves 0/0/0, 0 residuos del Sheet en archivos migrados.

**Decisiones clave de arquitectura (Sesión 13):**
- `supabase-client.js` devuelve objetos con la **misma forma** que `parseProducts`/`parsePhotoMap` del código viejo. Así se migra por abajo sin tocar el render.
- `enrichColors()` vive en cada página (no en el cliente) porque `COLOR_MAP` con hex/css/pattern es data visual que pertenece al frontend, no a la DB.
- La `anon` key va publicada en el frontend (es pública por diseño). RLS de Supabase la limita a lectura del catálogo.
- NO se borró código del Sheet ni del Apps Script — queda vivo como backup hasta completar Fase 3.

---

## 📌 Contexto para la próxima sesión (Fase 3)

**Lo más urgente (crítico):**
1. **Migrar `processOrder()` de `checkout.html`** para que haga INSERT en `orders` + `order_items` en Supabase en vez de POST al Apps Script. Mantener el Apps Script activo como backup o eliminarlo después de validar.
2. **Decidir arquitectura de `admin.html`.** Problema: la `service_role` key no puede ir al frontend. Opciones:
   - A) Vercel Serverless Function `/api/admin.js` que valida el password y proxea requests a Supabase con la service_role.
   - B) Supabase Auth (más cambios pero más correcto a largo plazo).
   - Recomendación: opción A, es el menor cambio y aprovecha Vercel.
3. **Migrar `seguimiento.html`** para buscar pedidos en Supabase por número.
4. **Migrar cupones:** `fetchCupon()` de checkout.html debe leer de `coupons` en Supabase. También migrar el conteo de usos y `emails_usados`.

**Para empezar Fase 3 en nuevo chat:**
> "Leé ESTADO.md y arrancá con Fase 3 de la migración a Supabase. La base está lista: catálogo ya lee de Supabase. Falta migrar pedidos, admin, seguimiento y cupones. Confirmar arquitectura de admin primero."
