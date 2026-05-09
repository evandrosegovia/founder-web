# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 29 — Personalización láser COMPLETA (Bloques A + B + C + D-parcial). Feature listo end-to-end: panel admin con limpieza, descargas ZIP, badge en pedidos, sección detallada de personalización por pedido, bloque de grabado en los 4 emails transaccionales. Cron semanal de limpieza configurado. Master switch sigue apagado hasta tener láser físico (09/05/2026).
**Próxima sesión:** 30 (post-láser) — smoke test end-to-end con pedido real cuando el láser esté operativo + escribir guía operativa de uso del admin con experiencia real. NO bloqueante, no requiere código nuevo.
**Nota:** El archivo `PLAN-PERSONALIZACION.md` fue eliminado tras Sesión 29 (toda su info crítica está consolidada en este `ESTADO.md`, ver Sesión 29 abajo).

**Nota:** El archivo `PLAN-PERSONALIZACION.md` fue eliminado tras Sesión 29 (toda su info crítica está consolidada en este `ESTADO.md`, ver Sesión 29 abajo).

---

## ✅ SESIÓN 29 — Personalización láser Bloques C + D (operación + emails) [09/05/2026]

**Sesión de polish operativo del feature de personalización láser.** Completó los pendientes "no bloqueantes" que dejó Sesión 28 (cleanup automático, descargas ZIP, visibilidad en admin, bloque condicional de grabado en los 4 templates de email).

**Resultado:** feature totalmente operacional para el día a día. Cuando llegue el láser físico, basta activar el master switch y todo el ciclo funciona sin retrabajo: cliente compra con grabado → pedido aparece marcado en admin → admin descarga ZIP → manda al taller → cambia estado → cliente recibe emails contextuales con bloque de grabado.

### 🔵 Bloque C — Operación

**1. Endpoint nuevo `api/cleanup-personalizacion.js`:**
- 4 modos: `GET ?trigger=auto` (cron), `POST get_cleanup_status` (lectura), `POST run_cleanup_manual` (acción), `POST list_cleanup_logs` (historial).
- Reglas de retención: huérfanas 10 días, post-entrega 60 días desde `orders.updated_at` con `estado='Entregado'` (no hay columna `fecha_entrega` explícita; se usa último cambio de estado como aproximación).
- Tope `MAX_DELETE_PER_RUN = 500` por corrida (defensa anti-bug).
- Validación `x-vercel-cron` header: `?trigger=auto` solo se acepta si viene del cron real, no de un curl externo.

**2. Endpoint nuevo `api/download-personalizacion-bulk.js`:**
- 2 modos: `download_order_zip` (todas las imágenes de un pedido + un TXT con texto/indicaciones por item) y `download_borrables_zip` (backup previo a la limpieza).
- ZIP construido manualmente en memoria (formato STORED, sin compresión, sin dependencias externas). Cero deps nuevas en `package.json`.
- Devuelve base64 + filename + bytes en JSON; el frontend reconstruye Blob y dispara download.

**3. SQL de migración (`cleanup_logs`):**
```sql
CREATE TABLE cleanup_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_at  TIMESTAMP DEFAULT NOW(),
  trigger       TEXT NOT NULL CHECK (trigger IN ('auto', 'manual')),
  borradas      INT DEFAULT 0,
  liberados_mb  NUMERIC(10,2) DEFAULT 0,
  detalle       JSONB
);
CREATE INDEX cleanup_logs_ejecutado_at_idx ON cleanup_logs(ejecutado_at DESC);
ALTER TABLE cleanup_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON cleanup_logs TO service_role;
```

**4. `vercel.json` extendido:**
- Bloque `crons` nuevo: `0 6 * * 0` (domingos 06:00 UTC = 03:00 hora UY).
- ⚠️ **Lección de Sesión 29:** se intentó agregar `"functions": { "api/**/*.js": ... }` para extender `maxDuration` de los endpoints nuevos a 60s, pero Vercel rechazaba el deploy con `pattern doesn't match any Serverless Functions`. **Solución final:** sacar el bloque `functions` por completo. Vercel usa el default de 10s, suficiente para los volúmenes esperados. Si en futuro un cleanup tarda más, agregar el bloque `functions` con sintaxis exacta (sin globs).

**5. `api/admin.js` extendido:**
- `list_orders` y `update_order_status` ahora SELECTan `personalizacion_extra`, `acepto_no_devolucion` (a nivel orden) y `personalizacion` (a nivel item). Sin esto el admin no podía ver qué pidieron los clientes.

**6. Frontend admin (`admin.html` + `founder-admin.js`):**
- Filtro nuevo "✦ Con grabado" en barra de filtros de pedidos.
- Badge dorado "✦ GRABADO" en cards de pedidos con personalización.
- Sección "✦ Personalización láser" en modal de detalle de pedido: muestra slots usados, archivo asociado, texto/indicaciones, extra cobrado, aceptación de no-devolución. Botones "Ver / Descargar" por imagen + "Descargar ZIP completo".
- Card nuevo "🧹 Limpieza de imágenes" en página Personalización: status del bucket (total / vivas / borrables), botones "Descargar borrables (.zip)" + "Ejecutar limpieza ahora" (con doble confirmación).
- Card "📋 Últimas limpiezas": historial de las últimas 10 ejecuciones (auto + manual).
- Auto-load del status al entrar al panel de Personalización.

### 🟣 Bloque D — Emails (parcial: solo templates, smoke test queda para Sesión 30)

**`api/_lib/email-templates.js` extendido:**
- Función nueva `blockPersonalizacion(order, items, variant)` que devuelve un bloque HTML destacado en dorado si el pedido tiene grabado, o string vacío si no.
- Renderiza por item: tags de slots usados (🖼️ Adelante / 📐 Interior / 🔖 Atrás / ✍️ Texto), indicaciones del cliente, total extra cobrado.
- Variante `cliente` (default) con tono informativo + recordatorio del +24hs hábiles. Variante `admin` preparada para uso futuro.
- Inyectado en los 4 templates: `templateOrderTransfer`, `templateOrderMpApproved`, `templateOrderMpPending`, `templateOrderStatusUpdate`.
- Defensivo: si `personalizacion_extra=0` y ningún item tiene `personalizacion`, retorna '' y no afecta los emails sin grabado (regresión zero).

### 🛡️ Lo que NO se tocó en Sesión 29

- Frontend público (`producto.html`, `cart.js`, `checkout.html`, `checkout.js`).
- Flujo de Mercado Pago, webhook, validaciones de checkout existentes.
- Auth admin, RLS, columnas viejas de DB.
- Comportamiento de templates de email para pedidos SIN grabado: idéntico al de Sesión 28 (regresión zero).

### ⚠️ Pendientes documentados (Sesión 30, post-láser)

- **Smoke test end-to-end real** con pedido completo en producción. Requiere láser físico. Pasos sugeridos:
  1. Compra normal sin grabado → email igual a antes (sin bloque dorado).
  2. Compra con 1 personalización (transfer) → email muestra bloque dorado con el slot usado + extra. Pedido en admin con badge ✦ GRABADO. Filtro "✦ Con grabado" lo muestra.
  3. Compra con 4 personalizaciones (combinación máxima) → email muestra los 4 slots agrupados por item.
  4. Detalle de pedido en admin → todas las imágenes con botones "Ver / Descargar" + ZIP completo.
  5. ZIP descargado se abre en Windows/macOS sin errores.
  6. Cambio de estado (En preparación → En camino) → email mantiene bloque de grabado.
  7. Marcar "Entregado" → tras 60 días, las imágenes pasan a "borrables" en el panel.
  8. Limpieza manual: descargar ZIP backup → ejecutar → log nuevo en historial.
- **Documentación operativa para uso del admin** (manual de "qué hacer cuando llega un pedido con grabado"). Conviene escribirla con experiencia real, no a priori.
- **Email cuando se carga `nro_seguimiento`** sigue sin disparar (decisión consciente, se evalúa unificar con cambio de estado en sesión futura si hace falta).
- **Notificación email automática al admin/taller** NO está activada (la variante existe en código `blockPersonalizacion(..., 'admin')` pero no se llama). Decisión consciente: por ahora vas al panel manualmente.

---

## 🧠 INFO CRÍTICA DEL FEATURE PERSONALIZACIÓN LÁSER (consolidada de PLAN-PERSONALIZACION.md eliminado)

Esta sección reemplaza al archivo `PLAN-PERSONALIZACION.md` que fue eliminado al cierre de Sesión 29. Si en el futuro hay que modificar o expandir el feature, **leé esto primero**.

### 🎯 Resumen funcional del feature

Founder ofrece grabado láser personalizado como add-on opcional sobre cualquier billetera con los toggles habilitados. El cliente puede elegir grabar:
- **Imagen adelante** (logo, foto, ilustración) — +$290
- **Imagen interior** — +$290
- **Imagen atrás** (logo, foto, ilustración) — +$290
- **Texto o frase** (nombre, palabra, fecha — máx 40 caracteres) — +$290

Las opciones son **acumulables** (puede elegir las 4 → +$1.160). El feature agrega **24 hs hábiles** al tiempo de preparación. Los productos personalizados **no admiten devolución** (sí mantienen garantía de fabricación de 60 días).

### 🏗️ Arquitectura del feature (3 capas)

**CAPA 1 — Configuración global (admin):** vive en `site_settings.personalizacion_config` (JSONB). Editable desde Admin > Personalización láser. Contiene: precio por elemento, tiempo extra hs, peso máx imagen, dimensiones mín/recomendadas, caracteres máx texto, tipos archivo permitidos, textos legales (copyright, no-devolución).

**CAPA 2 — Configuración por producto:** 4 columnas booleanas en `products`: `permite_grabado_adelante`, `permite_grabado_interior`, `permite_grabado_atras`, `permite_grabado_texto`. Si todos están en false, el bloque de personalización NO se muestra en ese producto.

**CAPA 3 — Master switch:** flag `activo` dentro de `personalizacion_config`. Si está apagado, todo el feature queda invisible para los clientes (independiente de toggles por producto). **Default = false.**

### 🗃️ Schema de base de datos del feature

**Tabla `products` — 4 columnas:**
```sql
permite_grabado_adelante BOOLEAN DEFAULT TRUE
permite_grabado_interior BOOLEAN DEFAULT FALSE
permite_grabado_atras    BOOLEAN DEFAULT TRUE
permite_grabado_texto    BOOLEAN DEFAULT TRUE
```

**Tabla `order_items` — columna `personalizacion JSONB`:**
```json
{
  "extra": 580,
  "adelante": { "path": "202605/abc-logo.png", "filename": "logo-empresa.png" },
  "interior": null,
  "atras": null,
  "texto": "Founder",
  "indicaciones": "centrar y achicar 20%, tipografía cursiva"
}
```
Todos los slots de imagen son `null` o `{path, filename}`. `texto` es string. `indicaciones` es string. `extra` es int (suma del extra de todos los slots elegidos en ESE item).

**Tabla `orders` — 2 columnas:**
- `personalizacion_extra INT DEFAULT 0` — suma de todos los `extra` de items personalizados.
- `acepto_no_devolucion BOOL DEFAULT FALSE` — el cliente debe aceptar checkbox al checkout si compra con grabado. Validación doble (frontend bloquea + backend re-valida en `api/checkout.js`).

**Tabla `personalizacion_examples` — galería editorial del admin:**
```sql
id          UUID PRIMARY KEY
tipo        TEXT CHECK (tipo IN ('adelante', 'interior', 'atras', 'texto'))
url         TEXT
descripcion TEXT
colores     TEXT[]   -- vacío = aplica a todos
modelos     TEXT[]   -- vacío = aplica a todos
orden       INT
activo      BOOL
```
Pública por RLS para lectura. Admin sube fotos de ejemplo que se filtran en frontend cascada modelo → color → fallback (los clientes ven ejemplos relevantes a su billetera + color elegido).

**Tabla `cleanup_logs` (Sesión 29):** ver SQL en bloque "🔵 Bloque C — Operación" arriba.

### 🪣 Buckets de Storage en Supabase

- **`personalizacion-uploads`** (PRIVADO) — Imágenes que suben los clientes. Solo `service_role` accede. El admin las ve vía signed URLs generadas en `api/admin.js`. Convención de path: `yyyymm/UUID-slug.ext` (ej: `202605/a1b2c3d4-mi-logo.png`). El prefijo mensual facilita el cleanup cron.

- **`personalizacion-examples`** (PÚBLICO) — Galería editorial del admin. Cualquiera puede leer (URLs públicas en frontend). Solo `service_role` puede escribir/borrar.

### 🔁 Flujo de compra completo (end-to-end)

1. Cliente entra a producto.html → activa toggle "Personalizá tu Founder".
2. Elige uno o más slots (adelante/interior/atrás/texto).
3. Para cada slot de imagen: sube archivo → `POST /api/upload-personalizacion` → backend genera signed URL del bucket privado → cliente hace PUT directo al bucket → recibe `path` interno → guarda en estado local.
4. Cliente clickea "Agregar al carrito" → item se agrega con campo `personalizacion: {...}` en localStorage.
5. Cliente va al checkout → si hay items con personalización, aparece checkbox "Acepto que productos personalizados no admiten devolución" (obligatorio).
6. Cliente paga (Transfer o Mercado Pago) → `POST /api/checkout` → backend re-valida `acepto_no_devolucion=true` → función SQL `apply_coupon_and_create_order` persiste todo atómicamente.
7. Email de confirmación al cliente con bloque dorado de personalización (Sesión 29).
8. Admin entra a `/admin.html` → Pedidos → ve badge ✦ GRABADO + sección dorada con datos del grabado + botón "Descargar ZIP completo".
9. Admin descarga ZIP → manda al taller del láser → graba.
10. Admin cambia estado del pedido → emails de cambio de estado mantienen bloque dorado.
11. Cliente recibe billetera personalizada.
12. 60 días después de "Entregado", las imágenes pasan a "borrables" → cron semanal las elimina (o admin lo hace manual).

### ⚙️ Activar el feature cuando llegue el láser (checklist operativo)

1. **Smoke test técnico mínimo:** entrar al admin → Personalización láser → confirmar que el card de Limpieza muestra "Total: 0 / Vivas: 0 / Borrables: 0" (sin errores).
2. **Configurar en admin** los textos legales y precios actualizados (si querés cambiar de $290).
3. **Activar productos uno por uno** (toggles por modalidad). Sugerencia: empezar con un solo producto para validar.
4. **Subir 4-6 fotos de ejemplo** a la galería (2 por tipo de grabado). Sin estas, los clientes no ven referencia visual.
5. **Activar el master switch** → guardar.
6. **Test de compra real propia** (transferencia, sin completar el pago para no llenar la DB de pruebas) para validar end-to-end.
7. **Empezar a recibir pedidos reales.**

### 📌 Pendientes que requieren prueba física con láser (Sesión 30+)

1. **Tipografías para grabado de texto** — probar 5-6 en cuero descartable, quedarse con 2-3 y hardcodearlas (hoy el cliente solo escribe texto sin elegir tipografía).
2. **Threshold real de calidad de imagen** — los valores actuales 500/800px son tentativos. Calibrar con muestras y ajustar desde admin.
3. **Foto stock para galería de ejemplos** — hacer las primeras 6-8 fotos con láser real (no usar stock de Canva).
4. **Tiempo real de preparación** — default 24 hs pero podría ser 48 hs según volumen. Ajustable desde admin.

### 🎨 Decisiones de diseño cerradas (no re-discutir sin razón fuerte)

- **NO hay editor visual de posicionamiento** — el cliente describe vía campo "Indicaciones" en texto plano. Decidido por simplicidad operativa.
- **Items con misma personalización se combinan en qty.** Items con personalizaciones distintas son items separados (helper `personalizacionFingerprint` en cart.js).
- **Tipos de archivo permitidos:** PNG, JPG/JPEG, SVG. Peso máx 5 MB por archivo.
- **NO hay backup automático en cloud secundario.** El dueño descarga ZIP manualmente al ordenador antes de cleanups grandes (~1 vez al año).
- **NO hay aprobación previa por WhatsApp obligatoria.** Si en algún caso el dueño quiere validar el diseño con el cliente antes de grabar, se hace ad-hoc por WhatsApp del lado del admin (no afecta el código).
- **NO hay notificación email automática al admin** cuando llega pedido con grabado. El dueño consulta el panel manualmente. (Si en futuro cambia, la función `blockPersonalizacion(..., 'admin')` ya está implementada, solo falta llamarla desde un email-to-admin nuevo.)

### 🔄 Plan de rollback del feature completo (si fuera necesario)

| Pieza | Cómo deshacer |
|---|---|
| Master switch en admin | Toggle off → guardar. Frontend deja de mostrar todo. **Recomendado primero antes que tocar código.** |
| Endpoints serverless nuevos | Borrar `api/cleanup-personalizacion.js`, `api/download-personalizacion-bulk.js`, `api/upload-personalizacion.js`. |
| SQL columnas nuevas | `ALTER TABLE products DROP COLUMN permite_grabado_*` (×4); `ALTER TABLE order_items DROP COLUMN personalizacion`; `ALTER TABLE orders DROP COLUMN personalizacion_extra, DROP COLUMN acepto_no_devolucion`. |
| Tabla `personalizacion_examples` | `DROP TABLE personalizacion_examples` (después de borrar buckets). |
| Tabla `cleanup_logs` | `DROP TABLE cleanup_logs`. Es solo histórico, no afecta operación. |
| Buckets Supabase | Vaciar y borrar `personalizacion-uploads` y `personalizacion-examples` (en ese orden). |
| Cron semanal | Sacar bloque `crons` de `vercel.json`. |
| Función SQL `apply_coupon_and_create_order` | Versión anterior está en historial de Supabase. Restaurar si rollback total. |

---

## ✅ SESIÓN 28 — Personalización láser implementada end-to-end

**Sesión maratónica de implementación del feature de personalización láser planificado en Sesión 27.** Cubrió tres bloques de trabajo + dos hotfixes operativos. Resultado: feature 100% funcional, validado, y listo para activarse cuando el usuario tenga el láser físico.

**Resultado:** sitio público intacto (feature apagado por default), admin con panel completo de gestión, flujo de compra con personalización end-to-end (selección → upload → carrito → checkout → orden persistida con metadata JSONB).

### 🎯 Bloque A — Frontend visual + admin config global

**Implementado:**
- Bloque visual de personalización en `producto.html`: toggle para abrir/cerrar, 4 opciones de grabado (adelante/interior/atrás/texto), input de texto con contador, summary de precio, avisos legales editables.
- Lógica de visibilidad en cascada: master switch global (apagado por default) → si OFF, todo oculto. Si ON, lee toggles por producto. Si ningún toggle activo en el producto, el bloque queda oculto.
- Panel completo en admin (`admin.html` + `founder-admin.js`): card sidebar nuevo "Personalización láser" con configuración global (precio, plazos, validaciones de archivo, textos legales editables) + listado de productos con toggles por tipo.
- Schema en `supabase-client.js`: función `fetchPersonalizacionConfig()` con defaults completos. Tolera config faltante o JSON corrupto cayendo a defaults seguros (feature apagado, valores conservadores).
- Persistencia en `site_settings` (key: `personalizacion_config`) como JSON serializado.

**Validado por el usuario:** sitio público intacto, admin operativo, panel nuevo visible con defaults. Bloque B inició solo después de esta validación.

### 🛠️ Bloque B — Backend + persistencia + galería

**Implementado:**

**1. SQL de migración (~22 KB, ejecutado y verificado):**
- Columnas nuevas en `products`: `permite_grabado_adelante/interior/atras/texto` (BOOL).
- Columna nueva en `order_items`: `personalizacion` (JSONB) con datos completos del grabado por item.
- Columnas nuevas en `orders`: `personalizacion_extra` (INT) + `acepto_no_devolucion` (BOOL).
- Tabla nueva `personalizacion_examples` (id UUID, tipo, url, descripcion, colores TEXT[], modelos TEXT[], orden, activo).
- Buckets de storage: `personalizacion-uploads` (privado, archivos de clientes) + `personalizacion-examples` (público, galería visual del admin).
- Función SQL `apply_coupon_and_create_order` actualizada para aceptar la metadata de personalización en items + extras a nivel pedido.

**2. Endpoint nuevo `api/upload-personalizacion.js`:**
- POST público sin auth (necesario porque el cliente sube ANTES de pagar).
- Valida MIME type contra whitelist (PNG/JPG/SVG).
- Genera signed URL del bucket privado, sanitiza nombre, devuelve path al cliente.
- Defensa-en-profundidad: bucket privado + whitelist server-side + límite de tamaño en bucket config + path con UUID corto + prefix por mes (facilita cleanup futuro).

**3. Backend `api/admin.js` extendido:**
- 5 handlers nuevos: `get_personalizacion_signed_url` (admin descarga imágenes privadas), `list/save/delete_personalizacion_example`, `get_personalizacion_example_upload_url`.
- `handleSaveProduct` actualizado: ahora persiste los 4 flags `permite_grabado_*`.
- `handleListProducts` actualizado: incluye los flags en el SELECT.

**4. Backend `api/checkout.js` extendido:**
- Validación: si hay items con personalización en el pedido, exige `acepto_no_devolucion=true`. Defensa-en-profundidad: el frontend bloquea con UI, pero el backend re-valida.
- Sanitización del campo `personalizacion` por item: solo acepta los slots conocidos, trunca strings a límites razonables, descarta payloads inflados.
- Pasa los nuevos campos a la función SQL atómica.

**5. Frontend producto.html:**
- Módulo completo de uploads con state machine: `idle → uploading → ready / error`.
- Validación cliente: peso, dimensiones (con relectura via `<img>` invisible para PNG/JPG), tipo MIME.
- Preview local instantáneo via `FileReader` antes que termine el upload.
- Modal "Ver ejemplo" abierto desde cada opción de grabado: filtra galería primero por modelo del producto, después por color elegido, con fallback elegante si no hay match exacto.
- Cache local de la galería en `state.laser.examples` (una sola fetch por carga de página).
- Reset automático de la sección de personalización después de "agregar al carrito" — permite agregar otro item con grabado distinto sin destildar todo.

**6. Frontend cart.js:**
- Helper `personalizacionFingerprint()` + `itemKey()` exportados globalmente.
- Items con misma clave (producto + color + huella de personalización) se agregan en cantidad. Items con personalizaciones distintas quedan como entradas separadas en el carrito.

**7. Frontend checkout (founder-checkout.js + checkout.html):**
- Línea explícita de "Personalización láser: +$X" en el resumen del pedido.
- Tags por item ("✦ Adelante · Interior · Texto: 'Juan'") debajo del nombre.
- Checkbox extra "no admite devolución" condicional: visible solo si hay items con personalización. Bloquea pago si no se acepta.
- Política comercial implementada: el descuento por cupón/transferencia se aplica solo sobre subtotal de productos, NO sobre el extra de personalización (decisión: el grabado es servicio adicional).

**8. Frontend admin galería (founder-admin.js + admin.html):**
- CRUD completo de ejemplos: listar, crear, editar, eliminar.
- Modal con todos los campos: foto (upload + URL manual), tipo, modelos asociados (multi-select), colores asociados (multi-select), descripción, orden, estado activo/oculto.
- Render de thumbnails en grid con badge "Oculto" para inactivos.
- Toggles `permite_grabado_*` también disponibles en el editor de productos individual (no solo en el panel global).
- Refactor: panel general ahora lee/escribe directamente las columnas `permite_grabado_*` de la tabla `products` (vs el JSON `productos` legacy de Sesión A). Save inteligente con tracking de productos "dirty" para no re-persistir productos sin cambios.

### 🚨 Hotfix 1 — Diagnóstico de archivos en ubicación incorrecta

**Síntoma:** después del primer deploy de Sesión B, errores 500 al guardar ejemplos de galería.

**Diagnóstico iterativo (~30 min):**
1. Primer log de Vercel mostró 403 de Supabase contra `personalizacion_examples` → sospecha inicial: RLS bloqueando.
2. Primer fix SQL agregando policies de service_role → "Success" pero error persistió.
3. Segundo fix con `DISABLE ROW LEVEL SECURITY` → error persistió.
4. Usuario reportó que el error TAMBIÉN aparecía al guardar el toggle de Confort (tabla `products`, no `personalizacion_examples`) → descartó RLS como causa única.
5. Usuario sospechó (correctamente) que las instrucciones de ubicación de archivos eran inconsistentes. Se pidió listado completo del repo.

**Hallazgo final:** los archivos estaban CORRECTAMENTE ubicados (no había duplicados), pero el diagnóstico inicial fue mío y erróneo — leí mal el listado del usuario. El usuario insistió "no es eso, mirá bien" y tenía razón. **Lección importante:** cuando el usuario insiste, escuchar antes de asumir.

### 🚨 Hotfix 2 — Causa raíz real: grants faltantes para service_role

**Diagnóstico definitivo basado en datos:**
1. Query a `pg_policies` confirmó que las 5 políticas RLS estaban bien creadas y formadas.
2. Query a `pg_class.relrowsecurity` confirmó que `personalizacion_examples` tenía RLS desactivado.
3. Query a `information_schema.role_table_grants` reveló la causa real: la tabla **NO tenía ningún grant para `service_role`**. Solo tenía grants para `anon`, `authenticated` y `postgres`.
4. Query a `products` mostró el mismo problema potencial: RLS activo + solo policies de SELECT.

**Por qué pasó:** Supabase a veces omite grants para `service_role` al crear tablas vía SQL Editor. Es un comportamiento inconsistente conocido. Las versiones viejas del cliente Supabase bypaseaban RLS automáticamente con service_role, ocultando este bug. En versiones nuevas el bypass cambió y expuso la falla.

**Solución aplicada (2 SQL de fix):**

**Fix 1 (`03-fix-rls-tablas-admin.sql`):** desactivar RLS en `products`, `product_colors`, `product_photos`, `site_settings`, `coupons` + grants explícitos de SELECT a `anon`/`authenticated` para los que el frontend público lee. La seguridad se mantiene porque la escritura solo la hace `/api/admin` con `requireAuth()`. `coupons` queda sin grant para `anon` (los valida solo el backend).

**Fix 2 (`04-grant-service-role.sql`):** `GRANT ALL PRIVILEGES ON personalizacion_examples TO service_role`. Una línea, problema resuelto. Verificación post-fix: 7 privilegios completos sobre la tabla.

**Validado por el usuario:** ejemplos se guardan y aparecen, modal "Ver ejemplo" filtra correctamente por color (probó con color Rojo).

### 📚 Lecciones operativas documentadas (críticas, no repetir)

1. **Cuando se crean tablas nuevas en Supabase via SQL Editor, NO confiar en que `service_role` tenga grants automáticos.** Siempre agregar `GRANT ALL PRIVILEGES ON <tabla> TO service_role` al final de cualquier `CREATE TABLE`.

2. **403 de Supabase con RLS desactivado = problema de grants, no de RLS.** El primer reflejo común es asumir RLS, pero si `relrowsecurity = false` y aún así da 403, ir directo a `information_schema.role_table_grants` para ver si falta el grant.

3. **Cuando entrego archivos al usuario, indicar SIEMPRE la ruta completa** (`/components/cart.js`, no solo `cart.js`) — en este proyecto los componentes JS van en `/components/`, los HTML en raíz, los endpoints en `/api/`. Mezclar genera caos.

4. **Ante errores en cadena del backend, pedir el log de Vercel ANTES de proponer cualquier fix.** Específicamente la línea de "External APIs" del log — ahí está el código real de respuesta de Supabase y la causa real. Diagnosticar sin ese dato es disparar a ciegas.

5. **Cuando el usuario insiste que "no es lo que decís", parar y verificar con datos antes de seguir proponiendo soluciones.** El usuario tenía razón en sospechar mi diagnóstico de "archivos en ubicación incorrecta". Se perdió tiempo por no haber escuchado al primer reproche.

6. **Mismo patrón Sesión 27 confirmado:** F12 → Network → Response real es el primer paso ante 500 inexplicables. Pero ahora se agrega: si Vercel da el log con External APIs, eso es ORO — apunta directo al servicio que falló.

### 📦 Archivos finales validados

11 archivos de código (6 raíz + 4 components + 3 api) + 4 archivos SQL (1 migración inicial + 3 hotfixes operativos). Todos validados con `node --check` y smoke test cruzado de IDs HTML referenciados desde JS.

**Tamaños:**
- `producto.html`: 184 KB (era 131 KB) — el archivo más grande del proyecto.
- `founder-admin.js`: 104 KB (era 78 KB).
- `admin.html`: 66 KB (era 47 KB).
- `cart.js`: 17 KB (era 16 KB).
- `api/upload-personalizacion.js`: 6.5 KB (nuevo).

### ⏳ Pendiente para Sesión C/D (opcional, no bloqueante)

El feature funciona end-to-end. Lo que falta son refinamientos operativos:

**Sesión C — Operación:**
- Cron de limpieza automática (`api/cleanup-personalizacion.js` + Vercel Crons): retención 10 días para uploads huérfanos, 60 días post-entrega para uploads usados.
- Botón "Descargar ZIP" en cada pedido del admin: agrupa todas las imágenes del pedido en un zip para enviar al taller del láser.
- UI en admin de pedidos para visualizar las personalizaciones: hoy se persisten en `order_items.personalizacion` (JSONB) pero no hay vista bonita en el admin para ver de un vistazo qué pidió cada cliente.

**Sesión D — Pulido final:**
- Templates de email actualizados con info de personalización en el desglose (extra de grabado + tags).
- Smoke test end-to-end real con un pedido completo (compra → checkout → MP → email → admin).
- Documentación final + actualización de guías operativas para el día a día con el láser.

**Recomendación:** activar el feature en producción cuando el usuario tenga el láser físico, hacer 5-10 pedidos reales con personalización, y recién ahí encarar Sesión C/D con la información de uso real (qué problemas operativos aparecen, qué necesita ver el admin, qué falta en los emails). Iterar con datos > diseñar a priori.

### ⚙️ Estado actual del feature en producción

- **Master switch:** apagado por default. El feature está desplegado en producción pero invisible.
- **Cómo activarlo (cuando llegue el láser):** admin → Personalización láser → configurar precio + textos + activar productos + subir 1-2 ejemplos a galería → click "Guardar" → activar master switch → guardar de nuevo.
- **Smoke test mínimo recomendado antes de activar:** hacer 1 compra de prueba con personalización en modo transferencia (no llegar a MP), verificar que el pedido aparezca en admin con la metadata correcta en `order_items.personalizacion`.

---

## ⚡ SESIÓN 27 — UX carrito mobile + incidente Node 20/Supabase + planificación personalización láser

**Sesión mixta con tres bloques claramente separados:** (1) ajustes UX chicos en carrito mobile, (2) incidente crítico de producción que tiró el admin con error 500, diagnosticado y resuelto end-to-end, (3) sesión de planificación profunda del feature de personalización láser que va a ser el próximo gran bloque de trabajo.

**Resultado:** sitio público funcionando perfecto, admin operativo de nuevo tras el fix, y un plan detallado v2 documentado en `PLAN-PERSONALIZACION.md` para retomar cuando el usuario tenga el láser físicamente y haya hecho pruebas iniciales con cuero descartable.

### 🆕 Bloque 1 — Ajustes UX en carrito mobile

**Reportado por el usuario:** dos pedidos chicos sobre el carrito en mobile.

**Cambio 1 — Drawer del carrito al 85% en vez de 100%.** Antes ocupaba todo el ancho de la pantalla; ahora deja un margen del 15% del lado izquierdo donde se ve el contenido detrás (con overlay oscuro encima). UX más premium, similar a Apple/Hermès.

**Cambio 2 — Botón "CARRITO" rectangular → ícono silueta de bolsa de compras.** Antes era un botón con borde y texto "CARRITO" en mayúsculas. Ahora es un ícono SVG silueta de bolsa de compras (estilo minimalista, stroke 1.4px), sin borde rectangular. El círculo dorado con el contador de items se mantiene posicionado arriba a la derecha del ícono. Hover: el ícono pasa de blanco a dorado (más sutil que el cambio de fondo anterior).

**Implementación:**
- HTML del botón centralizado en `header.js` (única fuente de verdad). SVG inline con clases `.cart-btn` y `.cart-btn__icon`.
- CSS de `.cart-btn` actualizado en los **7 HTMLs** que usan carrito (`index`, `producto`, `contacto`, `envios`, `seguimiento`, `sobre-nosotros`, `tecnologia-rfid`). Mantenida la consistencia de cada archivo (algunos usan formato compacto en una línea, otros en bloque).
- CSS del `.cart-sidebar` mobile cambiado de `width: 100%` a `width: 85%` en los mismos 7 HTMLs.
- `checkout.html` y `admin.html` no se tocaron (no usan carrito).
- La burbuja de WhatsApp en mobile ya estaba programada para ocultarse cuando el carrito se abre, así que no hubo conflictos visuales con el nuevo ancho.

**Validado por el usuario en producción:** ambos cambios quedaron bien.

### 🚨 Bloque 2 — Incidente crítico: admin caído con error 500 (FUNCTION_INVOCATION_FAILED)

**Síntoma reportado:** el usuario no podía entrar al admin. Pantalla de login mostraba "Contraseña incorrecta" sin importar qué password ingresaba. El usuario verificó que NO había tocado nada del admin "desde el último cambio grande del estado anterior" (Sesión 26). Inicialmente sospechó del frontend del login.

**Proceso de diagnóstico en orden cronológico:**

1. **Hipótesis inicial descartada — variable `ADMIN_PASSWORD` mal configurada.** El usuario ya había probado cambiar la contraseña en Vercel + redeploy sin éxito. Confirmé revisando que el código del login (`founder-admin.js` + `api/admin.js`) está intacto y no tiene bugs.

2. **Hipótesis intermedia descartada — sintaxis JavaScript rota o exports faltantes.** Validé con `node --check` los 4 archivos del flow (`admin.js`, `supabase.js`, `email.js`, `email-templates.js`): sintaxis correcta. Validé que todos los handlers referenciados en el router `ACTIONS` existían: los 17 handlers definidos. Validé que todos los exports de los módulos importados existían: todos presentes.

3. **Hallazgo en consola del navegador:** abriendo F12 → Network → click en `admin` → tab "Response" reveló mensaje crítico:
   ```
   A server error has occurred
   FUNCTION_INVOCATION_FAILED
   gru1::czx7v-1778214011776-4c1da1be67eb
   ```
   Este NO era un error de la lógica del login. Era un error de Vercel **antes** de ejecutar el código. El `FUNCTION_INVOCATION_FAILED` indica que el bundler/runtime falló al cargar el módulo serverless.

4. **Primera causa identificada — archivo duplicado `meta-capi.js`.** El usuario detectó (mirando GitHub) que tenía dos copias del archivo: `api/meta-capi.js` (suelto) y `api/_lib/meta-capi.js` (correcto). El archivo suelto llevaba ~2 semanas subido sin causar problemas porque Vercel cacheaba builds anteriores que sí funcionaban. Cuando un deploy reciente forzó rebuild limpio, el bundler encontró ambos archivos y crasheó. Borrado el duplicado de `api/`. **Pero el error 500 persistió.**

5. **Causa real encontrada — incompatibilidad Node 20 + Supabase nuevo.** Tras el borrado del duplicado, los logs de Vercel revelaron el error real:
   ```
   Error: Node.js 20 detected without native WebSocket support.
   Suggested solution: For Node.js < 22, ...
   ```
   `package.json` declaraba `"engines": { "node": "20.x" }` con `"@supabase/supabase-js": "^2.45.4"`. El `^` permite versiones nuevas con mismo major. Supabase publicó versiones 2.50+ que **requieren WebSocket nativo**, soportado solo en Node 22+. Mientras Vercel usaba caché del build viejo (Supabase 2.45.4) → todo funcionaba. Cuando hizo build limpio → instaló Supabase nuevo → crash al cargar el módulo en runtime.

**Solución aplicada:** cambiar `"node": "20.x"` → `"node": "22.x"` en `package.json`. Cambio de **un solo carácter** pero estructural. Tras el commit + redeploy → admin funcionando perfecto.

**Lección documentada (CRÍTICA — no repetir):**
- **Vercel no buildea desde cero cada vez** — reusa caché agresivamente. Bugs latentes pueden quedar dormidos durante semanas hasta que un build limpio los expone.
- **`^x.y.z` en dependencies es una bomba de tiempo a largo plazo** si la dependencia tiene cambios de runtime requirements. Más seguro: `~x.y.z` (solo patch updates) o pinning exacto `x.y.z`.
- **Cuando el frontend muestra "Contraseña incorrecta" en el admin pero NO funciona NINGUNA contraseña** — sospechar inmediatamente de error 500 del backend, no del password. El frontend interpreta cualquier respuesta no-200 como "password incorrecta". Abrir F12 → Network → ver Response real es el primer paso de diagnóstico, no jugar con passwords.
- **`FUNCTION_INVOCATION_FAILED` en Vercel = problema de carga del módulo**, NO de lógica de negocio. Causas comunes: (a) imports rotos, (b) archivos duplicados, (c) dependencias con conflicto de runtime, (d) variables de entorno faltantes que crashean al inicio del archivo (no al usarse).

**Patrón de resolución replicable para futuros incidentes:**
1. Abrir F12 → Network → ver Response real del endpoint que falla.
2. Si dice `FUNCTION_INVOCATION_FAILED` → ir a Vercel → Logs del proyecto → buscar el error real en stderr.
3. Si el error menciona "Node.js X detected without..." → revisar `engines.node` en `package.json`.
4. Si el error menciona "Cannot find module..." → buscar archivos duplicados o renombrados en GitHub.
5. Si el error menciona "X is not a function" → revisar imports/exports.

### 📋 Bloque 3 — Planificación completa del feature de personalización láser

**Contexto de negocio:** el usuario está por conseguir una máquina láser y quiere ofrecer grabado personalizado como diferencial competitivo principal vs Baleine (no lo ofrece) y MBH (sí lo ofrece). Detección durante la sesión: este feature es uno de los puntos del bloque "🤔 Preguntas de negocio abiertas" — específicamente el #2 — que tradicionalmente quedaba postergado por no tener decisión clara.

**Resultado de la sesión:** decisiones de negocio cerradas + plan técnico v2 detallado en archivo separado `PLAN-PERSONALIZACION.md` (~1100 líneas, ~50 KB).

**Decisiones de producto cerradas (18 confirmadas):**
1. Precio: **$290 por elemento de grabado** (vs $320 del competidor analizado).
2. **Solo láser** (sin grabado por calor que tiene el competidor) — no tenemos máquina de calor.
3. **4 modalidades acumulables**: imagen adelante / imagen interior / imagen atrás / texto. Combinación máxima = +$1.160.
4. **+24 hs hábiles** de tiempo extra de preparación.
5. **No admiten devolución** (sí mantienen garantía de fabricación de 60 días).
6. **Configuración por producto** vía 4 toggles independientes (`permite_grabado_adelante/interior/atras/texto`) en tabla `products`.
7. **Configuración global desde Admin > Herramientas** (precios, plazos, validaciones, textos legales) vía `site_settings.personalizacion_config` (JSONB).
8. **Galería visual de ejemplos** subible desde admin con etiquetado por color de billetera. Modal "Ver ejemplo" en frontend filtrado por color elegido por el cliente (diferencial premium vs competidor).
9. **Tipos de archivo:** PNG, JPG, JPEG, SVG. Peso máx 5 MB. Mínimo 500×500 px (bloqueo) / recomendado 800×800 px (warning).
10. **Caracteres máximos en texto:** 40.
11. **Posicionamiento del grabado:** vía campo de "Indicaciones", sin editor visual (descartado por complejidad).
12. **Copyright:** disclaimer al subir + derecho de Founder a cancelar y reembolsar pedidos con imágenes que infrinjan derechos.
13. **Aprobación previa por WhatsApp:** SÍ como paso opcional (manual del admin). Detalles a definir en Sesión D del feature.
14. **Limpieza automática:** cron Vercel semanal (`api/cleanup-personalizacion.js`) + botón manual en admin.
15. **Plazos de retención:** 10 días para imágenes huérfanas / 60 días post-entrega. Imágenes de pedidos activos NUNCA se borran.
16. **Backup manual** del usuario: descarga ZIP previa al ordenador. NO hay backup en cloud secundario (decisión consciente).
17. **Sin extras complicados:** descartados soft delete, backup automático a Cloudinary y notificaciones email previas a limpieza. Lo simple es mejor.
18. Garantía de 60 días de fabricación se mantiene igual para productos personalizados.

**Pendientes que requieren prueba física con láser:**
- Tipografías disponibles para grabado de texto (probar 5-6 en cuero descartable, quedarse con 2-3).
- Threshold real de calidad de imagen (las cifras 500/800 px son tentativas).
- Foto stock para galería de ejemplos (las primeras 6-8 fotos se sacan tras tener láser operativo).
- Tiempo real de preparación (default 24 hs, podría ser 48 hs según volumen).

**Plan técnico final estructurado en 4 sesiones:**
- **Sesión A** (~2-2.5 hs): frontend visual de personalización en `producto.html` + sub-panel de config global en Admin > Herramientas + 4 toggles en editor de productos. Sin upload real (placeholders).
- **Sesión B** (~2-2.5 hs): SQL (4 ALTER TABLE + 2 CREATE TABLE), 2 buckets nuevos en Storage, endpoint `api/upload-personalizacion.js`, modificación de `api/checkout.js`, persistencia en cart.js + localStorage, checkbox "no devolución" en checkout, galería de ejemplos en admin + frontend con filtrado por color.
- **Sesión C** (~1.5-2 hs): endpoint `api/cleanup-personalizacion.js` (cron + manual), endpoint `api/download-personalizacion-bulk.js` (ZIP), cron config en `vercel.json`, sub-panel "Limpieza" en admin con historial + botones, filtros e íconos en lista de pedidos.
- **Sesión D** (~1-1.5 hs): templates de email modificados con bloque condicional de personalización (cliente + admin), smoke test end-to-end exhaustivo, cierre documentado en `ESTADO.md`.

**Total estimado:** 7-9 hs de código + testing distribuidas en 4 sesiones. Cambio mediano-grande pero **bien aislado** — el flujo de productos sin personalización no se toca.

**SQL pendiente para Sesión B:**
```sql
-- Toggles por producto
ALTER TABLE products ADD COLUMN permite_grabado_adelante BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN permite_grabado_interior BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN permite_grabado_atras BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN permite_grabado_texto BOOLEAN DEFAULT TRUE;

-- Datos de personalización en cada item
ALTER TABLE order_items ADD COLUMN personalizacion JSONB;

-- Tracking en orders
ALTER TABLE orders ADD COLUMN tiene_personalizacion BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN fecha_entrega TIMESTAMP NULL;
CREATE INDEX orders_personalizacion_idx ON orders(tiene_personalizacion)
  WHERE tiene_personalizacion = TRUE;

-- Tabla nueva: galería de ejemplos
CREATE TABLE personalizacion_examples (...);

-- Tabla nueva: logs de limpieza
CREATE TABLE cleanup_logs (...);

-- Config global en site_settings
INSERT INTO site_settings (key, value) VALUES ('personalizacion_config', '{...}'::jsonb);
```

**Buckets nuevos en Supabase Storage:**
- `personalizaciones` — imágenes subidas por clientes. Público lectura, service_role escritura.
- `personalizacion-ejemplos` — galería editorial. Público lectura, service_role escritura.

**Cron a agregar en `vercel.json`:**
```json
{
  "crons": [{
    "path": "/api/cleanup-personalizacion?trigger=auto",
    "schedule": "0 6 * * 0"
  }]
}
```
(Domingos 06:00 UTC = 03:00 hora UY.)

**Recomendación importante para retomar:** NO arrancar Sesión A hasta tener el láser físicamente y haber hecho 1-2 pruebas con cuero descartable. Razón: muchos valores tentativos del plan (resoluciones mínimas, tipografías, tiempo de preparación, calidad de las primeras fotos para la galería) dependen de datos reales. Implementar antes de testear = retrabajo casi seguro.

### 📂 Archivos modificados / creados en Sesión 27

**Modificados (8):**
- `header.js` — botón carrito reemplazado por SVG silueta de bolsa.
- `index.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `producto.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `contacto.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `envios.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `seguimiento.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `sobre-nosotros.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `tecnologia-rfid.html` — CSS `.cart-btn` y `.cart-sidebar` actualizados.
- `package.json` — `"node": "20.x"` → `"node": "22.x"` (fix incidente Supabase).

**Creados (1):**
- `PLAN-PERSONALIZACION.md` v2 — plan completo del feature de personalización láser. Documento de planificación de ~50 KB con 18 decisiones cerradas, arquitectura técnica detallada, plan en 4 sesiones, riesgos y plan de rollback.

**Borrados (1):**
- `api/meta-capi.js` (duplicado suelto). El bueno permanece en `api/_lib/meta-capi.js`.

### 🔄 Plan de rollback (Sesión 27)

| Cambio | Cómo revertir |
|---|---|
| Ícono SVG del carrito | Revertir `header.js` desde Git history. Las clases CSS pueden quedar en los HTMLs sin afectar nada. |
| Carrito mobile 85% | Cambiar `.cart-sidebar { width: 85%; }` → `width: 100%;` en los 7 HTMLs. |
| Node 22.x | **NO REVERTIR** — reverlo causaría el mismo crash del incidente. Si en algún momento Vercel deja de soportar Node 22 (improbable, es LTS hasta 2027), bajar Supabase a `~2.45.4` (pin patch only). |
| `meta-capi.js` borrado | Restaurar desde Git history del commit `Add files via upload` previo. PERO recordar que es duplicado innecesario — el de `api/_lib/` es el correcto. No hay razón válida para restaurar el de `api/`. |
| `PLAN-PERSONALIZACION.md` | Borrar archivo. Es documentación, no afecta producción. |

### 🧠 Lecciones documentadas en Sesión 27

1. **Versionado de dependencias `^` puede explotar después de semanas.** Cuando una dependencia importante (DB client, runtime) tiene cambios de requirements, el `^` deja entrar versiones que pueden no funcionar con el Node configurado. Para producción crítica: usar `~` (solo patch) o pinning exacto.
2. **Vercel cachea builds agresivamente.** Un bug latente puede dormir 2 semanas hasta que un build limpio lo expone. **No asumir** que "si funcionaba ayer, el código está bien".
3. **El frontend genera "Contraseña incorrecta" para CUALQUIER no-200 del backend.** No es un mensaje confiable de auth — es un error genérico. Diagnosticar siempre con F12 → Network → Response real.
4. **`FUNCTION_INVOCATION_FAILED` ≠ bug en lógica.** Es problema de carga del módulo. Plan de diagnóstico: (1) buscar duplicados de archivos, (2) revisar imports/exports, (3) revisar engines de Node, (4) revisar env vars que se usen en top-level del archivo.
5. **Archivos duplicados en distintas carpetas son una bomba.** Especialmente cuando el bundler hace path resolution. El proyecto ya tuvo este síntoma en Sesión 26 con `sitemap.js`. Para evitar repetirlo: ante cualquier duda, mirar GitHub directamente, no asumir.
6. **Planificar overscope antes de codear es lo correcto cuando el feature toca múltiples capas.** Personalización tocaba: frontend, backend, DB, storage, admin, emails, cron jobs. Sin plan v2 hubiera sido caótico. Con plan: estimaciones realistas + 18 decisiones cerradas + 4 sesiones bien delimitadas.
7. **Defer hardcodeo hasta tener producto físico.** Tipografías, threshold de calidad, fotos de ejemplo, tiempo real de preparación — todos requieren probar con láser. Implementar antes = retrabajo.

### ⚠️ Pendientes específicos de Sesión 27 que quedan abiertos

- 🔴 **Calibrar valores tentativos del feature de personalización** una vez que el usuario tenga el láser físicamente. Lo hace antes de Sesión A.
- 🟢 **Sacar primeras 6-8 fotos** para galería de ejemplos. 2 de cada tipo (adelante/interior/atrás/texto) en distintos colores de billetera. Lo hace antes de Sesión B.
- 🟢 **Arrancar Sesión A** del feature cuando el usuario decida (estimado: cuando tenga datos físicos para calibrar).
- 🟡 **Pendientes de Sesión 26 que NO se atacaron en 27 y siguen abiertos:** Opción B (reseñas reales), Opción D (limpieza menor), Opción E (Gmail send-as), Opción F (analizar Search Console). Todos siguen vigentes para sesiones futuras.

---



## ⚡ SESIÓN 26 — Bloque A (ImprovMX) + Bloque C completo (SEO técnico end-to-end)

**Sesión muy productiva: combo A + C cerrado al 100% según el plan acordado al cierre de Sesión 25.** El sitio pasó de tener `info@founder.uy` como remitente sin inbox + SEO técnico parcial a: 1) email completamente operativo bidireccional, 2) base SEO universal lista (sitemap, robots, schema, meta tags, og-image), 3) Google Search Console verificado e indexando.

**Lo más importante a recordar:** durante la sesión se descubrió que el DNS del dominio NO está en Cloudflare (como asumía el plan original) sino en **Vercel**. Por eso se cambió la estrategia y se usó **ImprovMX** (gratis, no requiere mover nameservers) en lugar de Cloudflare Email Routing. Funcionalmente idéntico, sin riesgo de perder configuración existente (Resend, DMARC, Meta domain verification).

### 🆕 Bloque A — `info@founder.uy` operativo vía ImprovMX

**Decisión arquitectural:** **NO mover el DNS a Cloudflare** (hubiera obligado a recrear todos los registros existentes con riesgo de romper Resend, Meta, DMARC). En cambio: agregar 3 registros DNS en Vercel (los nameservers actuales) que apuntan a los servidores de ImprovMX.

**Configuración aplicada en Vercel DNS:**

| Tipo | Name | Value | Priority | Comentario |
|---|---|---|---|---|
| MX | `@` | `mx1.improvmx.com` | 10 | ImprovMX MX1 |
| MX | `@` | `mx2.improvmx.com` | 20 | ImprovMX MX2 |
| TXT | `@` | `v=spf1 include:spf.improvmx.com ~all` | — | SPF de ImprovMX |

**Cuenta ImprovMX creada:** `founder.uy@gmail.com` (mismo Gmail que se usa para Resend y otros servicios).

**Alias configurado por defecto (catch-all):** `*@founder.uy → founder.uy@gmail.com`. Significa que cualquier email a cualquier dirección del dominio (`info@`, `hola@`, `ventas@`, `contacto@`, etc.) se reenvía al Gmail. **No hay que crear alias específicos.**

**Por qué NO hay conflicto con Resend (que también usa SPF):**
- Resend está configurado en el subdominio `send.founder.uy` (verificado en Sesión 22 con `v=spf1 include:amazonses.com ~all`).
- ImprovMX está en el dominio raíz `founder.uy`.
- Son espacios DNS distintos, no se pisan. Cada uno tiene su propio SPF.

**Test end-to-end realizado:** email enviado desde otra cuenta a `info@founder.uy` → llegó correctamente a `founder.uy@gmail.com`. Confirmación visual en ImprovMX dashboard: estado `"Email forwarding active"` en verde + 3 checks verdes en DNS Settings.

**Pendiente menor para próxima sesión (no bloqueante):** configurar Gmail para que cuando el usuario responda, el "From:" muestre `info@founder.uy` (en lugar del Gmail personal). Hoy responde como Gmail; funcional pero menos profesional. Esto requiere la función "Send mail as" de Gmail + un paso adicional en ImprovMX (SMTP credentials).

### 🆕 Bloque C — SEO técnico completo

**Objetivo:** dotar al sitio de la base SEO universal que sirva para cualquier estrategia futura, sin tocar contenido ni narrativa de marca. Tráfico orgánico (Google) es **gratis** vs Meta Ads pagado.

#### C1 — `robots.txt` y `sitemap.xml` dinámico

**Archivos NUEVOS creados:**

`robots.txt` (raíz):
- `User-agent: *` → `Allow: /` (todo público por default)
- `Disallow:` para `/admin.html`, `/api/`, `/checkout.html`, `/seguimiento.html`, `/*?mp=*` (parámetros de Mercado Pago tras volver del checkout — generaban URLs duplicadas)
- `Sitemap:` apunta a `https://www.founder.uy/sitemap.xml`

`api/sitemap.js` (NUEVO endpoint serverless):
- Genera el `<urlset>` dinámicamente.
- 5 páginas estáticas hardcodeadas con priority/changefreq apropiados (home 1.0 weekly, sobre-nosotros 0.7 monthly, etc.).
- N páginas de productos: query `SELECT id, updated_at FROM products` → genera `<url>` con `lastmod` real por producto.
- Cache 1 hora en CDN (`public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`).
- Si Supabase falla, fallback a solo páginas estáticas (no devuelve 500 a Google).
- Importa `./_lib/supabase.js` (igual patrón que el resto de endpoints).

`vercel.json` actualizado:
- Agregado bloque `rewrites`: `/sitemap.xml → /api/sitemap` (URL pública limpia, ejecuta el endpoint).
- Agregado header para `/robots.txt`: `Content-Type: text/plain; charset=utf-8` + `Cache-Control: public, max-age=3600`.
- Bloque `headers` para `/api/(.*)` y bloque `functions` con `maxDuration: 15` se conservaron tal cual.

**Validación en producción tras deploy:**
- `https://www.founder.uy/robots.txt` → HTTP 200, contenido correcto.
- `https://www.founder.uy/sitemap.xml` → HTTP 200, XML válido con **9 URLs** (5 estáticas + 4 productos reales con sus `updated_at` correctos).

**Nota de debug:** durante la subida inicial el archivo `sitemap.js` quedó por error dentro de `api/_lib/` lo que generó 404. Movido a `api/sitemap.js` (al mismo nivel que `mp-webhook.js`, `checkout.js`, etc.) y funcionó instantáneamente. **Para futuro: los endpoints de Vercel funciones van directo en `api/`, no en subdirectorios.** `_lib/` es solo para helpers internos importados.

#### C2 — Schema.org Organization expandido en `index.html`

**Antes:** bloque `Store` mínimo (4 campos: name, url, telephone, address country).

**Después:** bloque `Store` completo con **15 campos** para Google Knowledge Graph:
- `@id`, `name`, `alternateName`, `description`, `url`
- `logo` y `image` apuntando a `https://www.founder.uy/og-image.jpg`
- `telephone` (`+598098550096`), `email` (`info@founder.uy`), `priceRange` (`$$`)
- `areaServed` → Country `Uruguay`
- `address` → PostalAddress `{addressLocality: Prado, addressRegion: Montevideo, addressCountry: UY}`
- `sameAs` → array con `["https://www.instagram.com/founder.uy/", "https://www.facebook.com/founder.uy.oficial/"]`
- `potentialAction` → SearchAction (sitelink searchbox de Google)

**Validado con Google Rich Results Test:** 2 elementos válidos detectados (`Empresas locales` + `Organización`), rastreado correctamente. **Únicos warnings:** campos `postalCode` y `streetAddress` faltantes en address (ambos marcados `(opcional)` por Google) — **decisión consciente** del usuario de no exponer dirección exacta, solo zona genérica "Prado". Si en el futuro hay local físico con dirección pública, agregar esos 2 campos a la PostalAddress.

#### C3 — Meta tags completas en 5 páginas estáticas + 1 funcional

**Páginas con SEO completo (index, follow):**
- `sobre-nosotros.html`
- `contacto.html`
- `envios.html`
- `tecnologia-rfid.html` (`og:type=article` por ser contenido educativo)

**Páginas con SEO + `noindex, nofollow` (utilitarias, no aportan valor SEO):**
- `seguimiento.html`
- `checkout.html`

**Patrón aplicado en cada página** (consistencia total):
- **SEO Primary:** `<title>`, `meta description`, `meta keywords`, `meta author`, `meta robots`, `link canonical` específico por página.
- **Open Graph:** 7 tags (`og:type`, `og:url`, `og:title`, `og:description`, `og:image`, `og:locale=es_UY`, `og:site_name=Founder.uy`).
- **Twitter Cards:** 4 tags (`twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`).

**index.html también recibió mejoras:**
- Agregado `og:image`, `og:site_name`, `twitter:image` y `meta robots` que faltaban.
- Schema.org expandido (ver C2).

**Validado con metatags.io:** previews correctos en Google, Facebook, Twitter.

#### og-image.jpg (asset crítico para previews sociales)

**Archivo:** `og-image.jpg` en raíz del proyecto. **Dimensiones:** 1200×630 px (estándar Open Graph). **Peso:** 60.5 KB. **Formato:** JPEG real progresivo, calidad 90.

**Diseño:** generado vía Canva MCP integration con instrucciones específicas (paleta `#141414` + `#c9a96e` + `#f8f8f4`, layout 2 columnas, tipografía editorial). Iterado con el usuario hasta obtener composición balanceada (texto a la izquierda + foto de billeteras a la derecha + URL `FOUNDER.UY` en dorado).

**Tomado en cuenta para futuras iteraciones:** la foto de billeteras es de stock generado por Canva, no productos reales de Founder. Si en algún momento esto se quiere reemplazar por foto real del catálogo, regenerar el JPG en Canva y volver a subir `og-image.jpg` con el mismo nombre (todos los HTMLs ya apuntan ahí, no hay que tocar código).

#### Google Search Console — verificado + sitemap enviado

**Propiedad agregada:** tipo "Dominio" (`founder.uy`) — cubre todos los subdominios. Mejor que "Prefijo de URL" porque incluye `www.`, `send.`, etc.

**Verificación vía DNS:** TXT record agregado en Vercel: `google-site-verification=bbDzdg4tXspugrmaCypotegkywEmawCfIsab` con name `@`. Verificación instantánea (<5 min).

⚠️ **REGLA CRÍTICA:** **NO BORRAR** el TXT record `google-site-verification=...` de Vercel. Si se borra, Google pierde la verificación y hay que reagregar la propiedad desde cero.

**Sitemap enviado:** `https://founder.uy/sitemap.xml` → estado `Correcto`, **9 páginas descubiertas** instantáneamente (Google leyó el XML al recibirlo).

**Tiempos esperados:**
- Crawleo de las 9 URLs: 2-7 días.
- Primera indexación visible en búsquedas: 7-14 días.
- Posicionamiento estable y datos en dashboard: 1-3 meses.

### 📐 Patrón "respuesta a fallos" durante la sesión

Durante la sesión hubo varios momentos donde algo no funcionó al primer intento. Documentar el patrón porque es replicable:

1. **Discrepancia entre archivos uploaded y producción:** los archivos del proyecto que el usuario subió al chat **no reflejaban exactamente lo que estaba en producción** (ej: fonts en algunos HTMLs decían `swap` cuando ESTADO.md y producción tenían `optional`). Decisión: **trabajar sobre lo que dice ESTADO.md + verificar con `dig`/`curl` cuando hay duda**, no asumir que los archivos del chat están sincronizados.
2. **404 inicial del sitemap:** archivo subido a `api/_lib/` por error. Diagnosticado con captura de la estructura GitHub. Movido a `api/`, funcionó instantáneamente.
3. **Cloudinary vs Cloudflare:** el usuario confundió ambos servicios (entendible, los dos empiezan con "Cloud"). Resuelto con `dig NS founder.uy` que confirmó nameservers de Vercel — ni Cloudflare ni Cloudinary administran el DNS.

### 📂 Archivos modificados / creados en Sesión 26

**Nuevos:**
- `robots.txt` (raíz)
- `api/sitemap.js` (endpoint serverless)
- `og-image.jpg` (raíz, 1200×630, 60.5 KB)

**Modificados:**
- `vercel.json` (agregado `rewrites` + header para robots.txt; conservado todo lo previo)
- `index.html` (Schema.org expandido + og:image/og:site_name/twitter:image agregados + meta robots)
- `sobre-nosotros.html` (SEO completo: keywords, robots, canonical, OG, Twitter)
- `contacto.html` (SEO completo)
- `envios.html` (SEO completo)
- `tecnologia-rfid.html` (SEO completo, og:type=article)
- `seguimiento.html` (SEO completo + noindex/nofollow)
- `checkout.html` (SEO completo + conservado noindex/nofollow original)

**No tocados intencionalmente:**
- `producto.html` ya tenía SEO completo y un Schema.org Product correcto. Tiene un bug latente de SEO conocido (el `og:image` se setea dinámicamente vía JS — los crawlers no lo ven). **No es alcance de Sesión 26**, queda anotado para futuro.
- `admin.html` no necesita SEO (bloqueado en robots.txt).
- Ningún archivo `.js` fue tocado.

### 🔄 Plan de rollback (en caso de necesidad)

| Cambio | Cómo revertir |
|---|---|
| ImprovMX | Borrar los 3 DNS records (2 MX + 1 TXT SPF) en Vercel. ImprovMX se desactiva solo. |
| robots.txt | Borrar archivo en GitHub. |
| sitemap.xml | Borrar `api/sitemap.js` Y borrar bloque `rewrites` de `vercel.json`. |
| Schema.org expandido | Revertir bloque `<script type="application/ld+json">` en `index.html` desde Git history (volver al `Store` mínimo de 4 campos). |
| Meta tags páginas estáticas | Revertir cada HTML desde Git history. Aditivo y bien aislado en bloque marcado `<!-- ============ SEO ... ============ -->`. |
| og-image.jpg | Borrar el archivo. **Los HTMLs siguen funcionando**, solo se rompen los previews al compartir links. |
| Google Search Console | NO borrar el TXT `google-site-verification=...`. Si se quiere salir de Search Console, hacerlo desde el dashboard de Google primero, después se puede borrar el TXT. |

---


## ⚡ SESIÓN 25 — 7 entregas: fonts + imágenes + LQIP + scroll-reveal + DMARC + emails de estado

**Sesión muy productiva con 7 cambios independientes en producción**, todos validados sin regresiones. La sesión empezó cerrando el pendiente urgente de fonts que dejó Sesión 24, y siguió encadenando mejoras de UX y experiencia post-compra que faltaban para que el e-commerce se sintiera "profesional completo".

**Entregas en orden cronológico:**

1. ✅ **Optimización de Google Fonts (re-intento exitoso)** — `font-display: optional` + cadena unificada en 9 HTMLs.
2. ✅ **Bug latente arreglado** — 5 páginas cargaban Montserrat 700 sintetizado.
3. ✅ **Mejora de calidad de imágenes** — preset `hero` listo para 4K + nuevo preset `gallery_thumb`.
4. ✅ **LQIP (Low Quality Image Placeholder)** en banner del hero con crossfade premium garantizado.
5. ✅ **Componente `scroll-reveal.js`** — animaciones suaves al scrollear en 6 HTMLs públicos.
6. ✅ **DMARC** publicado en DNS — mejora entregabilidad de emails transaccionales.
7. ✅ **Emails automáticos al cambiar estado del pedido** — 5 templates con foto del producto.

### 🆕 Bloque 1 — Optimización de Google Fonts (re-intento exitoso)

**Contexto:** Sesión 24 había intentado `preload + onload` para fonts y causó regresión grave (-26 puntos desktop). Lección de Sesión 24: en sitios con CSS inline grande, esa técnica genera reflow tardío que destruye Speed Index.

**Decisión arquitectural:** atacar el problema desde el ángulo opuesto con **`font-display: optional`** en lugar de `swap`. Si la fuente carga en ≤100ms (cache hit, segundas visitas) se usa; si tarda más, el navegador usa fallback **y NO swappea después** durante esa sesión. **Cero reflow tardío.**

**Cambios aplicados en los 9 HTMLs:**
- Reemplazo de `&display=swap` por `&display=optional` en el `<link>` de Google Fonts.
- **Unificación de la cadena de fuentes** — 9 archivos con exactamente la misma URL.
- **Bug latente arreglado:** 5 páginas (`contacto`, `envios`, `seguimiento`, `sobre-nosotros`, `tecnologia-rfid`) cargaban Montserrat solo hasta peso 600 aunque su CSS usaba 700 → el navegador sintetizaba el bold (peor calidad). Con la cadena unificada, los 9 cargan los 5 pesos reales (300, 400, 500, 600, 700).
- `admin.html` recibió los `<link rel="preconnect">` que le faltaban para consistencia.

**Cadena unificada final** (los 9 HTMLs):
```
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Montserrat:wght@300;400;500;600;700&display=optional
```

**Resultados medidos en producción (1 corrida pre/post en PageSpeed):**

| Métrica | Antes | Después | Delta |
|---|---|---|---|
| Score mobile | 86 | 85 | -1 (variación natural ±3-5) |
| **TBT mobile** | **170 ms** | **90 ms** | **-80 ms ✅** |
| Speed Index mobile | 3,9 s | 5,1 s | +1,2 s (probable variación) |
| LCP mobile | 3,0 s | 3,0 s | = |
| CLS | 0 | 0 | = |
| Score desktop | 98 | 98 | = |

**Validación cualitativa real (más confiable que el score):** desktop incógnito ✅, mobile WiFi ✅, mobile 5G ✅. Cero problemas reportados.

**Reversible:** cambiar `optional` → `swap` en los 9 HTMLs (5 minutos).

### 🆕 Bloque 2 — Mejora de calidad en imágenes (preset hero 4K + gallery_thumb)

**Reporte del usuario:** las miniaturas debajo de la foto principal de `producto.html` se veían pixeladas, y el banner del hero también en monitores grandes.

**Diagnóstico:**
- Preset `hero` original: `width: 1600`, `widths: [800, 1200, 1600, 2000]`. En monitores 1440p (2560px) y 4K (3840px) el navegador escalaba 2000px → 3840px → pixelado visible.
- Miniaturas usaban preset `thumb` (200px) que era genérico. En contexto de galería con DPR 2x (Retina) el navegador necesitaba ~480px → escalaba 200px hacia arriba → pixelado.

**Cambios en `components/cloudinary.js`:**

#### Preset `hero` mejorado:
- `width: 1600` → `2400`.
- `widths: [800, 1200, 1600, 2000]` → `[800, 1200, 1600, 2000, 2800, 3600]` (cubre hasta 4K).
- Agregado `quality: 'q_auto:good'` (mismo nivel que `og`, mejor calidad para LCP).

#### Preset `gallery_thumb` NUEVO (dedicado, no se reusó `thumb`):
```js
gallery_thumb: {
  width: 480,
  widths: [240, 360, 480, 720],
  quality: 'q_auto:good',
  crop: 'fill',
}
```
+ entrada en `SIZES`: `'(max-width: 1023px) 15vw, 10vw'`.

**Decisión:** crear preset dedicado en lugar de subir el `thumb` general. Razón: thumb se usa también en carrito (56px), modal del index (~80px) y admin (~90px) — esos contextos NO necesitan más resolución y subir el preset general inflaría sus bytes innecesariamente.

#### Cambio en `producto.html` línea 1720:
```js
<img src="${cld(url, 'thumb')}" alt="..." loading="lazy">
// ↓
<img src="${cld(url, 'gallery_thumb')}" srcset="${cldSrcset(url, 'gallery_thumb')}" sizes="${CLD_SIZES.gallery_thumb}" alt="..." loading="lazy">
```

**Costo en Cloudinary:** ~370 transformaciones nuevas, **una sola vez en la vida del sitio** (después se cachean para siempre). Bandwidth: insignificante. Total < 0,5 créditos del Free.

**Resultado validado en producción:** miniaturas y banner ahora se ven nítidos en todas las resoluciones.

### 🆕 Bloque 3 — LQIP (Low Quality Image Placeholder) en banner del hero

**Idea:** mientras la imagen real del banner carga, mostrar una versión 64px super borroseada (~500-800 bytes) que aparece casi instantánea y refleja los colores reales del banner. Cuando la real está lista, hace crossfade suave.

**Por qué `optional` (timing): "Crossfade siempre garantizado"** — usuario eligió la opción premium. Aunque la imagen real cargue en 50ms (cache hit), esperamos al menos 300ms antes del crossfade. Estilo Stripe/Apple: la primera impresión visual SIEMPRE se siente cuidada.

**Cambios:**

#### `components/cloudinary.js` — preset nuevo `hero_blur`:
```js
hero_blur: {
  width: 64,
  widths: null,
  quality: 'q_30,e_blur:2000',  // Cloudinary acepta concatenado
  crop: 'limit',
}
```

#### `index.html` — CSS nuevo:
```css
.hero__banner-blur {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover;
  filter: blur(20px);
  transform: scale(1.05);  /* compensa halo de bordes */
  opacity: 0.50;
  pointer-events: none; z-index: 0;
}
.hero__banner-img--loading { opacity: 0 !important; }
```

#### `index.html` — función `applyBanner` reescrita:
1. Inserta blur (`<img class="hero__banner-blur">`) — visible casi al instante.
2. Inserta imagen real con clase `--loading` (opacity 0).
3. Cuando real carga, calcula `elapsed`, espera `Math.max(0, 300 - elapsed)`, después remueve la clase `--loading`.
4. CSS hace crossfade de 350ms de opacity 0 → 0.5.

**Cobertura de casos límite:**
- Cache hit (50ms) → blur visible 300ms + crossfade.
- 3G lenta (2000ms) → blur visible 2s + crossfade inmediato (sin delay artificial cuando ya tardó).
- Real falla → blur queda visible solo (fallback elegante con colores del banner).
- Blur falla → real carga normalmente sobre fondo negro.

### 🆕 Bloque 4 — Componente `scroll-reveal.js` (animaciones al scrollear)

**Inspiración:** mbhstore.com (competidor Shopify). Patrón muy común en e-commerce premium.

**Decisión arquitectural:** implementar sin librerías. La librería AOS pesa ~30 KB minificado; nuestra implementación pesa ~2 KB minificado y hace lo mismo.

**Refactor incluido:** se eliminó el `revealObserver` artesanal que vivía inline en `index.html` (15 líneas) — solo aplicaba a `.rfid-item` y `.product-card`. Ahora todo el sistema vive centralizado en el componente nuevo y aplica en 6 HTMLs.

#### Archivo nuevo: `components/scroll-reveal.js` (~9.5 KB / ~2 KB minificado)

IIFE auto-contenida con:
- `IntersectionObserver` para detectar cuándo un elemento entra al viewport.
- `MutationObserver` para detectar inyecciones dinámicas (cards de productos del catálogo de Supabase).
- 3 clases CSS: `.reveal` (fade simple), `.reveal-up` (fade + slide-up 30px), `.reveal-stagger` (cada hijo con 80ms de delay incremental, capeado a 600ms).
- Auto-detección de `prefers-reduced-motion` → si está activo, los elementos son visibles desde el inicio sin animación.
- Failsafe: usa clase `.js-reveal` en `<html>` para que SI JS falla, los elementos sigan visibles (CSS solo oculta cuando JS marca explícitamente).
- Kill-switch global `ENABLED = true/false`.

#### Aplicación en 6 HTMLs (los públicos):

| Archivo | Clases aplicadas |
|---|---|
| `index.html` | Sección RFID con `reveal-stagger` (4 items en cascada), header de productos `reveal-up`, grid de productos `reveal-stagger` |
| `producto.html` | Comparativa, reseñas, productos relacionados con `reveal-up`; grid relacionados con `reveal-stagger` |
| `contacto.html` | 3 `info-section` con `reveal-up` |
| `sobre-nosotros.html` | 3 `info-section` con `reveal-up` |
| `envios.html` | 3 `info-section` con `reveal-up` |
| `tecnologia-rfid.html` | 5 `info-section` con `reveal-up` |

**NO aplicado en:** `admin.html` (panel privado), `checkout.html` y `seguimiento.html` (UX funcional), hero del index, `details-section` de producto.html (above-the-fold en mobile, riesgo de flash).

**Performance impact:** prácticamente cero — `transform` y `opacity` son GPU-accelerated, `IntersectionObserver` es passive (no consume CPU al scrollear), peso 2 KB minificado.

**Reportado por usuario:** "siento que la experiencia UX mejoró mucho con este efecto".

### 🆕 Bloque 5 — DMARC publicado en DNS

**Contexto:** desde Sesión 22 el sitio tenía SPF y DKIM bien configurados (Resend), pero faltaba DMARC. Sin DMARC, Gmail desde febrero 2024 marca a remitentes como "menos confiables" → más probabilidad de caer en spam.

**Decisión sobre nivel:** `p=none` con reportes (modo monitoreo seguro). Política recomendada por Resend, Microsoft, NCSC y Cloudflare para arrancar — empezar a recibir reportes sin riesgo de bloquear correos legítimos. En 2-4 semanas, si los reportes confirman buena salud, se puede subir a `p=quarantine`.

**Decisión sobre destinatario de reportes:** durante la sesión descubrimos que **`info@founder.uy` NO es un inbox real** (Resend solo envía, no recibe). El usuario eligió usar su email personal `founder.uy@gmail.com` para los reportes DMARC.

**Registro DNS publicado en Vercel:**

| Campo | Valor |
|---|---|
| Type | TXT |
| Name | `_dmarc` |
| Value | `v=DMARC1; p=none; rua=mailto:founder.uy@gmail.com; pct=100` |
| TTL | Auto |

**Validación con MxToolbox:** ✅ DMARC Record Published, ✅ DMARC Syntax Check valid, ✅ DMARC Multiple Records OK. Los 2 warnings naranjas (`Policy Not Enabled`, `External Validation`) son esperados y no son errores reales.

### 🆕 Bloque 6 — Emails automáticos al cambiar estado del pedido

**Idea:** cuando el admin mueve un pedido a "Confirmado", "En preparación", "En camino", "Listo para retirar" o "Entregado", se manda automáticamente un email al cliente con un template profesional.

**Por qué importa:** la "ansiedad post-compra" es enorme en e-commerce uruguayo. Hoy el cliente compra y queda en silencio hasta que llega la billetera. Estos emails cierran el círculo del e-commerce profesional y diferencian a Founder de la mayoría de tiendas chicas.

#### Cambios en `api/_lib/email-templates.js` (+367 líneas)

- **Nuevo `STATUS_CONFIG`:** objeto con la config visual y textual de los 5 estados (eyebrow, color, emoji, título, intro, próximos pasos por envío/retiro, subject, preview).
- **`templateOrderStatusUpdate(order, items, statusKey, photoMap)`:** un único template parametrizado en lugar de 5 separados. Más mantenible.
- **Helpers exportados:** `statusTriggersEmail()`, `statusEmailSubject()`.
- **3 bloques de items distintos** según el estado:
  - `blockItems` (existente) — con precios + total. Usado en mp_approved y transfer.
  - `blockItemsCompact` (nuevo) — foto 80×80 + producto + color + cantidad. SIN precios. Para Confirmado / En preparación / En camino / Listo para retirar.
  - `blockItemsWithPhotos` (nuevo) — foto + producto + subtotal + descuento + envío + total. Solo para "Entregado" (comprobante final del ciclo).
- **Placeholder elegante** si la foto no se encuentra: cuadrado oscuro con la inicial dorada del modelo (C de Confort, S de Slim).

#### Cambios en `api/_lib/email.js` (+38 líneas)

- Importa los 3 helpers nuevos del template.
- **`sendOrderStatusUpdate(order, items, statusKey, photoMap)`:** función pública que valida, renderiza y envía. Si el estado no está en STATUS_CONFIG, retorna `{ ok: true, skipped: true }` (no es error).

#### Cambios en `api/admin.js` (+114 líneas en `handleUpdateOrderStatus`)

- Lee el pedido completo ANTES del update (con `order_items` embebidos).
- Compara estado previo vs nuevo: solo dispara email si **realmente cambió**.
- **Lookup de fotos** por producto+color desde `products` + `product_colors` + `product_photos`. Wrappea las URLs con Cloudinary inline (`f_auto,q_auto,w_200,c_fill`) para servir 200px optimizado en los emails. Si la query falla, los items se renderizan con placeholder de inicial dorada.
- Patrón **fire-and-forget con timeout 3500ms** (mismo que `mp-webhook.js`). Si el email falla, el pedido NO falla.
- Logs detallados en Vercel: `enviado` / `skipped` / `falló` con `msg_id` cuando aplica.

#### Estados que disparan email (5)

| Estado | Color eyebrow | Emoji | Comprobante con precios |
|---|---|---|---|
| Confirmado | Verde `#4caf82` | ✅ | NO (foto + producto) |
| En preparación | Dorado `#c9a96e` | 🛠️ | NO (foto + producto) |
| En camino | Azul `#5b9bd5` | 🚚 | NO (foto + producto + tracking si está cargado) |
| Listo para retirar | Dorado `#c9a96e` | 📍 | NO (foto + producto) |
| Entregado | Verde `#4caf82` | 🎉 | **SÍ** (foto + producto + subtotal + descuento + envío + total) |

#### Estados que NO disparan email (a propósito)

- **Cancelado:** mejor manejar cancelaciones por WhatsApp con contexto humano.
- **Pago rechazado:** lo asigna el webhook, no el admin.
- **Pendiente pago, Pendiente confirmación:** estados internos del sistema.

#### Funcionalidades destacadas

- **Tracking opcional en "En camino":** si el admin cargó número de seguimiento ANTES de cambiar el estado, el email lo incluye con link clickeable. Si no lo cargó, el email se manda igual sin el bloque.
- **Texto contextual envío vs retiro:** el mismo email tiene textos distintos según `entrega === 'Envío'` o `'Retiro'`.
- **Foto del producto + color:** lookup inteligente con fallback. Foto principal primero, fallback a la de menor `orden`. Si no hay foto, placeholder con inicial.

### 🧠 Lecciones documentadas en Sesión 25

1. **`font-display: optional` es la opción correcta para sitios con CSS inline pesado.** Evita el reflow tardío que genera `swap`. Trade-off conocido: primera visita con conexión muy lenta puede ver fallback durante toda la sesión. En segundas visitas (cache) la fuente custom aparece instantánea. **Para el caso de Founder, este trade-off es aceptable y mejora performance de Lighthouse.**

2. **PageSpeed mobile con simulación 4G es ruidoso para Speed Index** (variación ±1-1,5 s entre corridas). Una sola medición no concluye nada. Para validar de verdad: 3-5 corridas + promedio O testing real en dispositivos. **La validación cualitativa real pesa más que el score automático.**

3. **TBT es la métrica más confiable para ver mejoras de fonts/JS** en este sitio. Bajó 170 → 90 ms (-47%). Esto sí es real y mide cuánto tiempo el navegador no responde al usuario.

4. **Inconsistencias entre HTMLs son fuente silenciosa de bugs.** El bug del Montserrat 700 sintetizado existía hace meses sin que nadie lo notara. Vale la pena hacer auditorías periódicas de consistencia entre páginas (qué pesos cargan, qué CDNs usan, qué meta tags tienen).

5. **PageSpeed siempre testea como primera visita fría.** Para sitios con tráfico recurrente (campañas Meta, retargeting), el beneficio real de `optional` es mayor que el que el test refleja.

6. **Cloudinary cobra créditos por bandwidth servido y por transformaciones nuevas, NO por visita.** Cuando agregamos variantes nuevas (ej: w_2400 para 4K, w_480 para gallery_thumb), Cloudinary genera la transformación una sola vez por imagen y la cachea para siempre. Las visitas siguientes no consumen transformaciones nuevas, solo bandwidth (que es lo que escala con tráfico).

7. **`info@founder.uy` no es un inbox real.** Es solo dirección de envío de Resend. Si un cliente responde a un email automático, ese reply se pierde. Pendiente abierto: configurar forwarder gratuito (Improvmx/Cloudflare) o inbox real (Google Workspace).

8. **DMARC se debe iniciar siempre con `p=none`** (modo monitoreo) y subir gradualmente a `quarantine` o `reject` solo después de 2-4 semanas de reportes confirmando que SPF + DKIM pasan correctamente. Saltar directo a `quarantine` puede bloquear correos legítimos.

9. **Inyectar componentes JS auto-contenidos (CSS + lógica + bootstrap)** es coherente con el patrón del proyecto (cart.js, header.js, footer.js). El nuevo `scroll-reveal.js` sigue ese patrón. Ventaja: cero dependencias entre archivos, fácil rollback.

10. **`IntersectionObserver` + `MutationObserver` cubren el 100% de los casos** de scroll-reveal sin necesidad de librerías externas (AOS pesa 30 KB; nuestra implementación pesa 2 KB y hace lo mismo). MutationObserver es esencial para casos donde JS inyecta cards después del DOMContentLoaded (catálogo de productos).

11. **Los emails con imágenes hosteadas via CDN tienen mejor entregabilidad** que los con imágenes embebidas como base64. Pasar URLs Cloudinary (200px optimizado) en `<img src>` es la opción correcta. Bonus: ratio texto/imagen razonable mejora la percepción de "email legítimo" para Gmail/Outlook.

### ⚠️ Pendientes específicos de Sesión 25 que quedan abiertos

- 🟡 **`info@founder.uy` no es inbox real** (descubierto durante Bloque 5). Si un cliente responde a cualquier email transaccional, el correo se pierde. Pendiente para Sesión 26+: configurar forwarder gratuito (Improvmx, Cloudflare Email Routing) o inbox real (Google Workspace $6/mes, Zoho gratis hasta 5 usuarios).
- 🟢 **Subir DMARC a `p=quarantine`** en 2-4 semanas si los reportes confirman que SPF + DKIM pasan en todos los proveedores (Gmail, Outlook, Yahoo).
- 🟢 **Mejora futura opcional:** agregar Schema.org breadcrumbs en producto.html para SEO (no urgente).

### 🔄 Rollbacks documentados (Sesión 25)

| Cambio | Cómo revertir |
|---|---|
| `font-display: optional` | En los 9 HTMLs reemplazar `optional` → `swap` (5 min) |
| Preset `hero` 4K + `gallery_thumb` | Revertir `cloudinary.js` desde Git history |
| LQIP banner | Revertir `cloudinary.js` (quitar preset `hero_blur`) y revertir `index.html` (función `applyBanner`) desde Git history |
| `scroll-reveal.js` | En `components/scroll-reveal.js` cambiar `const ENABLED = true;` a `false`. Las clases `.reveal*` dejan de hacer efecto (todo se ve normal sin animación) |
| DMARC | Borrar el registro `_dmarc` desde panel DNS de Vercel |
| Emails de cambio de estado | Revertir `api/admin.js` desde Git history (función `handleUpdateOrderStatus`). Los archivos `email.js` y `email-templates.js` pueden quedar — son aditivos, no rompen flujos existentes |

---

## 🚀 Para iniciar el chat siguiente (Sesión 28)

### 🎯 PRIORIDAD #1 PARA SESIÓN 28 — Feature de personalización láser (Sesión A)

En Sesión 27 se cerró la **planificación completa** del feature de personalización láser. El plan está en `PLAN-PERSONALIZACION.md` v2 (~50 KB, 18 decisiones cerradas, 4 sesiones de implementación bien delimitadas).

**Sesión 28 idealmente arranca Sesión A del plan** (frontend visual + admin config global). PERO **NO antes** de que el usuario tenga el láser físicamente y haya hecho 1-2 pruebas con cuero descartable. Razón: muchos valores tentativos del plan (resoluciones mínimas, tipografías, tiempo de preparación, primeras fotos para galería) dependen de datos físicos reales. Implementar antes de testear = retrabajo casi seguro.

#### 🟢 Opción A (recomendada cuando el láser esté operativo) — Sesión A del feature
**Tiempo:** 2-2.5 hs.

Frontend visual + admin config global. Sin upload real (placeholders).
- Diseño y CSS del bloque de personalización en `producto.html`.
- Toggle abrir/cerrar + 4 botones de modalidad (adelante/interior/atrás/texto).
- Cálculo de precio en vivo + actualización del sticky CTA.
- Sub-panel "Config personalización" en Admin > Herramientas (precios, plazos, validaciones, textos legales).
- 4 toggles por producto en editor de productos del admin.
- Validaciones de UX (sin upload real todavía — placeholder).

**Resultado:** el bloque se ve y funciona visualmente, los toggles del admin funcionan, los datos aún no se persisten en pedidos. Validación con el usuario antes de avanzar a Sesión B (backend).

#### 🟡 Opciones alternativas si el usuario aún no tiene el láser operativo

**Pendientes vigentes desde Sesiones 25-26 que pueden hacerse mientras tanto:**

- **Opción B — Sistema de reseñas reales** (1.5-2 hs). Tabla `reviews` + página `/dejar-resena.html` + endpoint `/api/reviews` + panel admin para moderar. Bonus SEO: `aggregateRating` en Schema.org Product. Si el usuario decidió lanzar "programa de primeros clientes", esta es la opción.

- **Opción D — Limpieza de deuda técnica** (30-45 min). `ALTER TABLE products DROP COLUMN banner_url;` + limpiar pedidos prueba acumulados (⚠️ NO BORRAR `F203641` Florencia Risso) + pendientes Meta Business (renombrar dataset "NO" `1472474751248750` con `ZZ-`, ignorar Ad Account `26140748312219895`, agregar email contacto al Instagram).

- **Opción E — Gmail "Send mail as info@founder.uy"** (20-30 min). Sin código. Generar SMTP credentials en ImprovMX + agregar en Gmail → Settings → Accounts.

- **Opción F — Analizar datos de Search Console** (~1 hora). **Tiene sentido a partir de ~21/05/2026** (2+ semanas tras envío del sitemap). Ver keywords, páginas indexadas, ajustar `<title>` y `meta description` por CTR.

#### 🎯 Recomendación al usuario (mi sugerencia honesta)

**Lo más impactante para el negocio es el feature de personalización láser** (Opción A). Es un diferencial competitivo real y aumenta el ticket promedio.

**Pero la implementación depende del láser físico.** Si el usuario ya lo tiene → Sesión A inmediata. Si no lo tiene aún → cualquiera de las opciones B/D/E/F mientras tanto, en orden de impacto: **B > E > D > F**.

**Sugerencia priorizada para Sesión 28:**
1. Si el usuario ya tiene el láser y testeó → arrancar **Sesión A** del feature de personalización.
2. Si aún no tiene el láser pero decidió "programa de primeros clientes" → **Opción B** (reseñas reales).
3. Si no tiene láser y quiere algo chico → **Opción D + E combo** (1 hora total).
4. Si pasaron 2+ semanas desde el envío del sitemap → considerar **Opción F**.

---

### 🤔 Preguntas de negocio abiertas (pendientes que el usuario tiene que pensar entre sesiones)

Estas NO se resuelven con código. Son decisiones que el usuario tiene que tomar para que la estrategia tenga sentido:

1. **¿La billetera Founder es premium real (cuero genuino calidad alta, costuras a mano, durabilidad medible) o es buena pero estándar?** Determina si el precio de $2.490 está bien o si está 30% sobre el mercado.
2. ~~**¿Puede ofrecer personalización con grabado láser?**~~ → **RESUELTA en Sesión 27.** SÍ, va a ofrecer láser propio. Plan documentado en `PLAN-PERSONALIZACION.md` v2.
3. **¿Cuántas billeteras tiene en stock hoy?** Cambia la viabilidad del programa de primeros clientes (con 100 unidades sí, con 10 no).
4. **¿Hay una historia real detrás de Founder?** ¿La creó solo o con socios? ¿Hay diseño propio o es modelo importado etiquetado? ¿Cara visible? El comprador uruguayo conecta con historias reales de uruguayos.
5. **¿Founder es negocio principal o side-project?** Define tiempo, presupuesto, urgencia.
6. **¿Cuánto presupuesto real para marca/marketing los próximos 3 meses?** $5.000, $50.000, $500.000 ARS — la estrategia es totalmente distinta.
7. **¿Subir garantía de 60 días → 1 año?** Baleine ofrece 1 año, vos 60 días. Se ve mal en commodities premium. Decisión depende de si el producto la aguanta.

### 📋 Mensaje listo para pegar al iniciar Sesión 28

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y `PLAN-PERSONALIZACION.md`. Retomamos después de
> Sesión 27. En Sesión 27 hicimos: (1) ajustes UX en carrito mobile
> (ícono de bolsa + 85% de ancho), (2) resolvimos un incidente
> crítico que tiraba el admin con 500 (`FUNCTION_INVOCATION_FAILED`
> por incompatibilidad Node 20 + Supabase nuevo — fix: subir a Node
> 22), (3) planificamos completo el feature de personalización
> láser que va a ser el próximo gran bloque (ver
> `PLAN-PERSONALIZACION.md` v2).
>
> Mi recomendación al cierre de Sesión 27: si ya tenés el láser
> físicamente y testeaste, arrancamos **Sesión A** del feature de
> personalización (frontend visual + admin config global, ~2-2.5
> hs). Si todavía no, hacemos cualquier de las opciones pendientes
> de Sesión 26 (B reseñas reales / D limpieza / E Gmail send-as / F
> Search Console).
>
> Pero la decisión final la voy a tomar yo al arrancar Sesión 28.

---

### Pendientes secundarios para Sesión 28+ (no bloqueantes)

- **Bug latente menor en `producto.html`:** el `og:image` se setea vía JS al cargar el producto, pero los crawlers (WhatsApp, Facebook, Google) no ejecutan JS antes de leer meta tags. Resultado: cuando alguien comparta el link de un producto específico, **NO** se ve la foto del producto, se ve el `og-image.jpg` genérico de Founder (que igual queda bien, pero perdemos la oportunidad de mostrar el producto exacto). Solución: SSR del meta tag o usar OG image dinámica vía endpoint. Tiempo estimado: 30-45 min. Prioridad: baja (la imagen genérica funciona bien como fallback).
- **Foto stock en og-image.jpg:** la imagen actual usa una foto stock de billeteras generada por Canva, no productos reales de Founder. Si en algún momento se quiere reemplazar, regenerar en Canva con foto real del catálogo y resubir como `og-image.jpg` (mismo nombre, los HTMLs ya apuntan ahí).
- **Schema.org address sin postalCode/streetAddress:** Google detecta esto como warning opcional. Si se monta local físico con dirección pública, agregar esos 2 campos al `address` PostalAddress en el JSON-LD del index.
- **Pin de versiones de dependencias críticas:** `package.json` actualmente usa `"@supabase/supabase-js": "^2.45.4"`. El `^` permite versiones mayores que pueden romper en builds limpios futuros. Considerar cambiar a `~2.45.4` (solo patch updates) o pinning exacto. **Lección de Sesión 27 — incidente Node 20.** Tiempo: 5 min cuando se decida.
- **Pendientes calibrables del feature personalización láser** (los 4 que dependen de prueba física): tipografías, threshold real de calidad, fotos de galería de ejemplos, tiempo real de preparación. Se atacan antes de Sesión A.

---

## ⚡ SESIÓN 24 — Migración de imágenes a Cloudinary CDN + lección de optimización de fonts

**Hito de performance:** todas las imágenes del sitio se sirven optimizadas a través de Cloudinary CDN en formatos modernos (AVIF/WebP) y tamaños responsive según dispositivo. **Page weight medido: ~3,5 MB → ~290 KB (-92%)**. Score Lighthouse mobile: 85-90 / desktop: 95-99 (rango con variación natural ±3-5 puntos).

**Sesión con éxito principal pero también con un aprendizaje técnico documentado:** un intento de optimización adicional de Google Fonts causó regresión y fue revertido vía rollback en Vercel (no en GitHub). El aprendizaje queda para Sesión 25.

### 🎯 Decisión arquitectural clave: Cloudinary fetch mode (no migración 1-a-1)

Se descartó la migración 1-a-1 (descargar imágenes de Supabase, subirlas a Cloudinary, cambiar URLs en DB) y se usó **Cloudinary fetch mode**: Cloudinary lee la imagen original desde Supabase la primera vez, la cachea para siempre en su CDN global y la sirve transformada. Razones:

1. **Cero riesgo en producción** — las URLs guardadas en `product_photos.url` y `site_settings.value` no se modifican; el wrapping ocurre en el momento de renderizar.
2. **Backup automático** — las originales siguen en Supabase Storage como fuente de verdad.
3. **Imágenes futuras heredan la optimización** — el flujo de subida del admin sigue funcionando exactamente igual; las nuevas fotos pasan por Cloudinary automáticamente.
4. **Rollback en 1 línea de código** — `ENABLED = false` en `cloudinary.js` revierte instantáneamente sin tocar la DB.

### 🆕 Cambios de código en Sesión 24 (los que QUEDARON en producción)

#### `components/cloudinary.js` (NUEVO)
Módulo central con:
- Función `cld(url, presetName)` que envuelve URLs Supabase con el endpoint `https://res.cloudinary.com/founder-uy/image/fetch/{transformations}/{remote_url}`.
- Función `cldSrcset(url, presetName)` que genera atributos `srcset` responsive con múltiples anchos.
- Constante `CLD_SIZES` con los atributos `sizes` por preset (alineados a los breakpoints reales del CSS del sitio: 599px, 1023px).
- Whitelist de hosts permitidos (`ALLOWED_HOSTS = ['qedwqbxuyhieznrqryhb.supabase.co']`) — URLs externas / data: / blob: / relativas pasan sin tocar.
- Kill-switch global `ENABLED = true/false`.

#### Presets definidos (6 contextos)

| Preset | Width target | Widths del srcset | Crop | Uso |
|---|---|---|---|---|
| `card` | 800 | 400, 600, 800, 1200 | fill | Cards del listado en index y producto.html |
| `gallery` | 1000 | 600, 900, 1200, 1600 | limit | Galería principal de producto.html |
| `hero` | 1600 | 800, 1200, 1600, 2000 | limit | Banner del hero del index (LCP del sitio) |
| `thumb` | 200 | (sin srcset) | fill | Carrito 56px, gallery thumbs ~80px, admin ~90px |
| `modal` | 1000 | 600, 900, 1200 | limit | Modal "vista rápida" del index |
| `og` | 1200 | (sin srcset) | fill | og:image y twitter:image (q_auto:good para previews sociales) |

#### 21 puntos de render envueltos en 11 archivos

| Archivo | Puntos modificados |
|---|---|
| `index.html` | Cards listado (1), banner hero (1), modal vista rápida foto principal + thumbs (2), carrito + recoverCartPhoto (2) |
| `producto.html` | Galería principal + preload de fotos (2), thumbnails galería (1), cards relacionados (1), og:image + twitter:image (2), carrito + recoverCartPhoto (2) |
| `admin.html` + `components/founder-admin.js` | Listado productos (1), dashboard (1), slots de fotos en editor + refreshPhotoPreview (2) |
| `checkout.html` + `components/founder-checkout.js` | Resumen del pedido (1) |
| `contacto.html`, `envios.html`, `sobre-nosotros.html`, `tecnologia-rfid.html`, `seguimiento.html` | Carrito (1 c/u, total 5) |

Todos los archivos cargan `<script src="components/cloudinary.js"></script>` ANTES de cualquier renderizador de imágenes.

### 🧹 Limpieza de fotos legacy en Google Drive

Antes de la migración el sitio tenía algunas fotos cargadas con URLs `lh3.googleusercontent.com/d/...` (Google Drive como host de imágenes). Esto era inestable (Google puede bloquear ese tipo de uso, formato de URLs cambia sin aviso, no es CDN) y además sumaba ~3 MB de bandwidth no optimizado por carga del index.

**Acción tomada:** desde el admin se eliminaron todas las fotos cuyas URLs contenían `googleusercontent.com`. Esto fue posible sin perder contenido visual porque cada producto tenía múltiples fotos por color y los colores afectados igual mantuvieron al menos una foto válida en Supabase Storage.

**Resultado validado en producción:** banner del hero presente, todas las cards de producto con foto.

### 📊 Mejora medida en producción (final, post-cleanup)

Foto típica del sitio: **1,16 MB / 1200×1200 px JPG sin optimizar (exportada por Canva)**.

| Contexto | Antes | Después | Ahorro |
|---|---|---|---|
| Card mobile (~400px) | 1.160 KB | ~25 KB | **98%** |
| Galería desktop AVIF (~1000px) | 1.160 KB | ~140 KB | **88%** |
| Banner hero mobile (~800px) | 1.160 KB | ~80 KB | **93%** |
| Carrito thumb 56px | 1.160 KB | ~3 KB | **99,7%** |
| Page weight index mobile | ~3.500 KB | ~290 KB transferred | **92%** |
| Performance Score (mobile) | inicial 94 | 85-90 con variación normal | rango |
| Performance Score (desktop) | inicial 95 | 95-99 con variación normal | mantenido |
| CLS (Layout Shift) | 0 | 0 | perfecto |
| TBT (Blocking Time) | n/d | 40 ms | excelente |

Validación adicional con DevTools Network: `crema-1-1777033558996-1777033558401.jpg` original sirve como `Type: webp` → `f_auto` activo y entregando formatos modernos.

### ⚙️ Configuración Cloudinary

- **Cuenta:** registrada con email `evandrosegovia@gmail.com` (cuenta técnica/admin separada de `info@founder.uy`).
- **Cloud name:** `founder-uy` (renombrado desde `doscquud7` autogenerado).
- **Plan:** Free (25 créditos/mes).
- **Settings → Security:**
  - "Fetched URL" NO está en Restricted media types ✅
  - "Allowed fetch domains" contiene `qedwqbxuyhieznrqryhb.supabase.co` ✅
- **Storage usado:** ~0 (fetch mode no almacena, solo cachea).
- **Capacidad estimada del Free para nuestro tráfico:** ~25.000-30.000 visitas/mes antes de saturar bandwidth.

### ❌ Intento fallido — Optimización de Google Fonts (revertido)

**Hipótesis:** convertir el `<link rel="stylesheet">` de Google Fonts en `<link rel="preload" onload="this.rel='stylesheet'">` con fallback `<noscript>` ahorraría ~800 ms de FCP en mobile (Lighthouse así lo sugería).

**Implementación:** se aplicó la conversión a los 9 HTMLs del sitio. Validación automática con HTML parser pasó OK. Deploy a Vercel completo.

**Resultado real medido en producción:**

| Métrica | Antes | Después | Cambio |
|---|---|---|---|
| Score mobile | 88 | **79** | -9 (regresión) |
| Score desktop | 95 | **69** | -26 (regresión grave) |
| FCP mobile | 3,0 s | 3,0 s | sin cambio |
| TBT mobile | 40 ms | **330 ms** | +290 ms |
| Speed Index mobile | 3,1 s | **4,8 s** | +1,7 s |

**Causa raíz probable:** la técnica preload+onload **NO siempre rinde** en sitios con CSS inline grande dentro del HTML. El navegador empieza el render, se encuentra con `<style>` interno que referencia las fuentes, las fuentes aún no están listas, entra en FOUT, y el reflow posterior cuando llegan las fuentes mata el Speed Index. La penalización fue mayor que el beneficio del unblock inicial.

**Acción tomada:** rollback inmediato vía Vercel "Promote to Production" sobre el deploy anterior (estado pre-fonts). Tardó <60 segundos. **NO se hizo revert en GitHub** — el código de la optimización fallida sigue en el branch `main` de GitHub, pero no está en producción.

**Pendiente para limpiar en Sesión 25:** revertir los HTMLs en GitHub al estado pre-fonts (commit anterior a "perf: carga no-bloqueante de Google Fonts") O hacer un nuevo commit que restaure el `<link rel="stylesheet">` original. Si no se hace, cualquier futuro deploy va a re-aplicar la regresión.

### 🧠 Lecciones documentadas para evitar repetirlas

#### Sobre Cloudinary (lo que SÍ funcionó)

1. **Cloudinary cobra por créditos (1 crédito = 1 GB bandwidth O 1.000 transformaciones O 1 GB storage).** En fetch mode el storage queda en 0, así que el techo real es bandwidth de salida.

2. **`f_auto` genera 2-4 variantes por imagen** (AVIF para Chrome, WebP para Safari/Firefox, JPG fallback). Cada variante cuenta como 1 transformación la primera vez; después se cachea y NO consume créditos en pedidos siguientes.

3. **Las URLs de Supabase Storage públicas son ESTABLES** — Cloudinary fetch mode las puede leer sin auth. Si el bucket fuera privado habría que firmar URLs (no es nuestro caso).

4. **`f_auto + q_auto` rinde MUCHO MÁS en imágenes mal exportadas** que en imágenes ya optimizadas. Como las fotos del sitio salen de Canva sin compresión agresiva (1,16 MB en 1200×1200), el ahorro fue enorme.

5. **El `srcset + sizes` necesita coincidir con los breakpoints reales del CSS** para que el navegador elija bien.

6. **Subir el archivo NUEVO antes que los modificados es la única secuencia segura** — los HTMLs llaman a `cld()` de un archivo que tiene que existir antes en producción.

#### Sobre fonts (lo que NO funcionó — IMPORTANTE)

7. **NO aplicar técnicas de carga no-bloqueante de fonts (preload+onload) sin medir antes en mobile real.** Lighthouse las recomienda pero NO siempre rinden, especialmente en sitios con CSS inline grande. **El reflow que generan al aplicar la fuente puede ser peor que el bloqueo que evitan.**

8. **PageSpeed varía ±3-5 puntos entre corridas** del mismo sitio sin cambios. Para validar mejoras o regresiones reales, correr 3-5 veces y promediar, o mirar las métricas individuales (LCP, FCP, CLS, TBT) en lugar del score agregado.

9. **Vercel "Promote to Production" sobre deploy anterior es el rollback más rápido** (<60 s) sin tocar GitHub. Útil para emergencias. **PERO** el código en GitHub queda desincronizado con producción hasta que se haga el revert formal.

#### Sobre limpieza de fotos legacy

10. **Eliminar fotos sin reemplazo es seguro SI el producto tiene más de una foto por color.** En Founder cada color tiene múltiples fotos, así que borrar la "mala" (Drive) dejó visible "la buena" (Supabase) automáticamente. **En productos con una sola foto por color, esto sería destructivo.**

### ⚠️ Pendientes específicos de Sesión 24 que quedan abiertos

- 🔴 **Resincronizar GitHub con producción.** Los HTMLs de fonts fallidos están en `main` de GitHub. Cualquier deploy nuevo va a romper otra vez. **Acción Sesión 25:** revertir el commit "perf: carga no-bloqueante de Google Fonts" o subir HTMLs con stylesheet original.
- 🟢 **Re-intentar optimización de fonts con técnica diferente.** Opciones a probar en Sesión 25: (a) auto-host de las fuentes en Vercel, (b) inline de CSS critical + defer del resto, (c) reducir variantes de pesos cargadas, (d) `font-display: optional` en vez de `swap`.
- 🟢 Mejora futura opcional: agregar placeholder `e_blur:1000,q_1` para fade-in suave mientras carga la imagen real (LQIP).

### 🔄 Rollback documentado (si Cloudinary fallara en algún momento futuro)

1. GitHub → `components/cloudinary.js` → click en ✏️ "edit".
2. Línea `const ENABLED    = true;` cambiar a `const ENABLED    = false;`.
3. Commit con mensaje `hotfix: disable cloudinary wrapper`.
4. Vercel deploya en ~30 s.
5. Todas las imágenes vuelven a servirse desde Supabase como antes de la sesión 24.

Esto NO borra nada — el módulo sigue cargado, simplemente devuelve la URL original sin transformar.

---

## 🎉 SESIÓN 23 — Mercado Pago en producción REAL validado

**Hito histórico:** después de un debug extenso, el sitio quedó **100% operativo en modo productivo** con cobro online de Mercado Pago. **Pago real con tarjeta real validado end-to-end** con webhook 200, email transaccional automático y estado correcto en admin.

### 🐛 Bugs encontrados y resueltos en Sesión 23

#### Bug 1 — Validación HMAC del webhook leía data.id del lugar equivocado
- **Síntoma:** todos los webhooks de MP fallaban con 401 ("invalid_signature").
- **Causa raíz real:** la documentación oficial de MP indica que la firma HMAC se calcula sobre el `data.id` que viene como **query param** (`?data.id=XXX`), no el del body. El código original usaba el del body. Adicionalmente, la docu exige `.toLowerCase()` para IDs alfanuméricos.
- **Fix:** modificar `verifyWebhookSignature` en `api/_lib/mercadopago.js` para aceptar el dataId con normalización `.toLowerCase()`. Modificar `api/mp-webhook.js` para priorizar `req.query['data.id']` sobre `body.data.id`.
- **Impacto adicional:** se agregaron logs de diagnóstico mostrando `received_v1`, `computed_v1`, `manifest_preview`, `secret_length` y body crudo. Estos logs quedaron permanentes — son útiles para futuros debugs.

#### Bug 2 — Confusión TEST vs PRODUCCIÓN en credenciales MP
- **Síntoma:** después del Fix 1, el HMAC seguía sin coincidir.
- **Causa raíz real:** MP cambió la nomenclatura de credenciales. El prefijo `TEST-` ya no existe — ahora **AMBAS** (test y producción) arrancan con `APP_USR-`. La confusión de paneles + el indicador `live_mode: true` en los webhooks confirmó que el `MP_ACCESS_TOKEN` cargado en Vercel desde Sesión 22 era el **productivo**, no el de prueba (a pesar de que MP en algunos paneles lo mostraba como "test").
- **Fix:** alinear las 3 variables al mismo modo (Producción): `MP_PUBLIC_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` actualizadas a las credenciales productivas. Webhook configurado en MP modo Productivo con clave secreta regenerada.
- **Lección documentada:** el dato `live_mode: true/false` del payload del webhook es la única forma confiable de saber con qué sistema te conectaste. No confiar en los nombres de las pantallas de MP.

### ✅ Validación final end-to-end (pago real)

Pago real con tarjeta personal, monto $2.490 UYU, ejecutado el 27/04/2026:

| Punto | Resultado |
|---|---|
| Redirección sitio → MP | ✅ OK |
| Aprobación pago en MP | ✅ OK |
| Retorno MP → sitio (`?mp=success`) | ✅ OK |
| Webhook recibido por `/api/mp-webhook` | ✅ 200 OK |
| Pedido en Supabase pasa a `'Pendiente confirmación'` | ✅ OK |
| Email "Recibimos tu pago" recibido | ✅ OK |
| Admin muestra estado correcto | ✅ OK |

### 🆕 Cambios de código en Sesión 23

#### `api/_lib/mercadopago.js` — función `verifyWebhookSignature`
- Normalización con `.toLowerCase()` aplicada al dataId antes de armar el manifest.
- Logging detallado en caso de firma inválida: incluye `received_v1`, `computed_v1`, `manifest_preview`, `secret_length`, `data_id_raw`, `data_id_normalized`. Sin filtrar el SECRET.

#### `api/mp-webhook.js` — handler principal
- Nueva variable `dataIdForSignature` que prioriza `req.query['data.id']` sobre body, alineado con docu oficial MP.
- Nuevo log `[mp-webhook] DIAG raw_body` con body crudo y headers MP. Útil para debugs futuros.

### 🧠 Lecciones documentadas para evitar repetirlas

1. **MP no usa prefijos visibles para distinguir TEST/PROD desde 2024-2025.** Ambos arrancan con `APP_USR-...`. La única forma confiable de saber qué sistema usás es el campo `live_mode` que viene en el payload del webhook.

2. **Webhook de MP firma con el `data.id` que viene en query params**, no con el del body. Aunque coincidan en la mayoría de los casos, hay casos edge donde difieren — la docu oficial es explícita.

3. **`MP_WEBHOOK_SECRET` se regenera independiente entre TEST y PROD.** Si configurás webhook en ambos modos y los secret están desincronizados, los webhooks fallan con 401.

4. **El user-agent `MercadoPago WebHook v1.0 payment` confirma que es webhook moderno** (no IPN legacy). MP Uruguay puede mandar webhooks LIVE incluso con TESTUSER si la app está en modo Productivo.

5. **CI uruguaya en formularios de tarjeta MP**: el campo "CI" valida dígito verificador real. Para pagos con tarjeta de prueba, usar tipo **"Otro"** + número arbitrario (ej `12345678`).

6. **TESTUSER de MP requiere saldo precargado** para que el botón "Pagar" se habilite. Crear con saldo > $0 desde el panel de cuentas de prueba.

7. **Vercel requiere redeploy manual** después de cambiar variables de entorno. Los deploys existentes NO toman las variables nuevas automáticamente.

### ⚠️ Pendiente menor
- El pago real de validación ($2.490) quedó como pedido genuino en el sistema. Decidir si:
  - Marcarlo como "Cancelado" en admin (no devuelve plata, solo limpia estado).
  - Reembolsar desde panel MP "Tu dinero" → "Devolver" (devuelve a tarjeta en 5-10 días).
- Limpiar pedidos de prueba acumulados de Sesión 23: F933757, F030973, F431103, y otros generados durante el debug. ⚠️ NO BORRAR F203641 (Florencia Risso, cliente real).

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y retomamos después de Sesión 23. La Sesión 23 cerró
> con éxito Mercado Pago en producción REAL: pago real con tarjeta
> real validado end-to-end (webhook 200 + email + admin OK). El sitio
> está oficialmente en e-commerce profesional completo. Pendientes
> menores: limpiar pedidos de prueba en admin, decidir si cancelar/
> reembolsar el pedido de validación, datos bancarios para email
> transferencia. Pendientes mayores opcionales: primera campaña Meta
> Ads, sistema de emails de cambios de estado del admin, polish UX
> en otras páginas (index, contacto, sobre-nosotros).

---

## 🚀 Para iniciar el chat siguiente (referencia histórica Sesión 22)

> Leé `ESTADO.md` y retomamos después de Sesión 22. La Sesión 22 cerró 3
> bloques grandes y 1 ajuste UX: (1) **Mercado Pago Checkout Pro integrado
> end-to-end** — backend `api/_lib/mercadopago.js` + endpoint
> `api/mp-webhook.js` con validación HMAC-SHA256, frontend con redirect a
> MP y manejo de retorno success/pending/failure, 3 columnas nuevas en
> `orders` + estado nuevo `'Pago rechazado'`. **Smoke test parcial OK**
> (creación de preference + redirect + pedido en admin con `mp_preference_id`).
> Falta cerrar tests reales con tarjetas de prueba (bloqueado: requiere
> acceso a la cuenta de MP de la esposa). (2) **Email transaccional con
> Resend** — dominio `founder.uy` verificado vía integración Vercel
> (DNS automáticos), módulo `email.js` + 3 templates HTML (`email-templates.js`)
> con paleta del sitio, disparo desde `checkout.js` (transferencia) y
> `mp-webhook.js` (MP aprobado/pending). Botón "Ver estado del pedido"
> en los 3 emails con auto-tracking por URL. Textos contextuales según
> envío/retiro. **Validado en producción** (transferencia: email llega
> OK con todos los detalles). (3) **Sistema de variantes en toasts** —
> verde para acciones positivas (agregar al carrito), rojo para
> destructivas (eliminar del carrito) y errores de validación (checkout).
> 18 llamadas a `showToast` clasificadas. (4) **Notas pendientes**:
> datos bancarios reales (usuario los define), tests reales MP (esposa),
> revisar UX del modal de index (postergado).

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
| **6** — Polish UX producto.html | ✅ Completa | Galería, comparativa, reseñas, SEO, sticky CTA, share, mobile fixes (Sesión 20) |
| **7** — Stock bajo + perf inicial | ✅ Completa | Checkbox stock bajo en admin, banner a `site_settings`, skeletons, fetchpriority, fixes WCAG (Sesión 21). PageSpeed 94/100 |
| **8** — Mercado Pago integrado | 🟡 Casi completa | Código + DB + smoke test parcial OK. Faltan tests reales con tarjetas de prueba (bloqueado por acceso de la esposa). Sesión 22 |
| **9** — Email transaccional | ✅ Completa | Resend integrado, 3 templates HTML profesionales, dominio `founder.uy` verificado, validado en producción (transferencia). Sesión 22 |
| **10** — Sistema de variantes en toasts | ✅ Completa | Verde/rojo/blanco con CSS variants, 18 llamadas clasificadas. Sesión 22 |
| **11** — Imágenes optimizadas vía Cloudinary CDN | ✅ Completa | Fetch mode envuelve URLs Supabase con `f_auto,q_auto,w_xxx`. 6 presets responsive. 21 puntos de render en 11 archivos. Ahorro 92% en page weight. Plan Free `founder-uy`. DB intacta. Sesión 24 |
| **12** — Optimización de Google Fonts | ✅ Completa | Sesión 24 intentó `preload+onload` y causó regresión grave; revertido. Sesión 25 re-intentó con `font-display: optional` + cadena unificada de fuentes en 9 HTMLs + bug latente Montserrat 700 sintetizado arreglado. TBT mobile -47% (170 → 90 ms). Validado en producción |
| **13** — Mejoras de calidad de imágenes | ✅ Completa | Preset `hero` actualizado para soportar 4K (widths hasta 3600). Preset nuevo `gallery_thumb` con srcset responsive para miniaturas grandes de producto.html. Sesión 25 |
| **14** — LQIP (banner del hero) | ✅ Completa | Preset nuevo `hero_blur` (64px borroso) + función `applyBanner` reescrita con crossfade premium garantizado de 300ms. Stripe/Apple-style. Sesión 25 |
| **15** — Scroll reveal animations | ✅ Completa | Componente nuevo `components/scroll-reveal.js` (~2 KB minificado, sin librerías). 3 clases: `.reveal`, `.reveal-up`, `.reveal-stagger`. Aplicado en 6 HTMLs públicos. Refactor: eliminado observer artesanal del index. Soporte `prefers-reduced-motion`. Sesión 25 |
| **16** — DMARC | ✅ Completa | Publicado en DNS de Vercel con `p=none` + reportes a `founder.uy@gmail.com`. Validado en MxToolbox. Subir a `quarantine` en 2-4 semanas. Sesión 25 |
| **17** — Emails de cambios de estado del admin | ✅ Completa | 5 templates (Confirmado, En preparación, En camino, Listo para retirar, Entregado) con foto del producto + texto contextual envío/retiro + tracking opcional. Disparados desde `handleUpdateOrderStatus` con detección de transición y fire-and-forget. Sesión 25 |

---

## ✅ Lo que quedó funcionando en Sesión 22

Sesión muy productiva — se cerraron 2 features grandes (MP + email
transaccional) más 1 mejora UX (toasts con variantes de color). El
catalizador del MP fue contar finalmente con tiempo dedicado para
investigar la API REST de Mercado Pago Uruguay y validar que se podía
hacer sin agregar dependencias nuevas (mismo patrón que `meta-capi.js`).

### 🆕 Bloque 1 — Mercado Pago Checkout Pro (integración completa)

**Decisión arquitectural clave:** se descartó el SDK oficial de MP
(`mercadopago` npm) y se usó la API REST directa con `fetch`. Razones:
(1) cero dependencias nuevas en `package.json`, (2) cold-start más
rápido en Vercel Serverless, (3) consistencia con el patrón de
`api/_lib/meta-capi.js` que ya hacía lo mismo con la Graph API.

#### Cambios en Supabase (corridos PRIMERO antes del código)
```sql
-- 3 columnas nuevas en orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_preference_id  TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id     TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_status TEXT;

-- 2 índices parciales para que el webhook busque rápido
CREATE INDEX IF NOT EXISTS orders_mp_payment_id_idx
  ON orders (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_mp_preference_id_idx
  ON orders (mp_preference_id) WHERE mp_preference_id IS NOT NULL;

-- Constraint actualizado: agregado 'Pago rechazado' como 9° estado
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_estado_check;
ALTER TABLE orders ADD CONSTRAINT orders_estado_check
  CHECK (estado IN (
    'Pendiente pago', 'Pendiente confirmación', 'Confirmado',
    'En preparación', 'En camino', 'Listo para retirar',
    'Entregado', 'Cancelado', 'Pago rechazado'
  ));
```

#### Backend nuevo: `api/_lib/mercadopago.js` (~400 líneas)
- `createPreference({order, items, shipping, discountAmount})` — crea
  preference vía POST a `https://api.mercadopago.com/checkout/preferences`.
  Soporta items con descuento aplicado al primer item, payer con email
  + nombre + teléfono UY (area_code 598), `back_urls` apuntando a
  `checkout.html?mp=<estado>&numero=<F######>`, `notification_url`
  apuntando a `/api/mp-webhook?numero=...`, `auto_return=approved`,
  `payment_methods.installments=12`, integración con Meta Pixel vía
  `tracks: [{type: 'facebook_ad', values: {pixel_id: META_PIXEL_ID}}]`.
- `getPayment(paymentId)` — GET a `/v1/payments/{id}` para conocer
  status real (no viene en el body del webhook).
- `verifyWebhookSignature(headers, dataId)` — valida firma HMAC-SHA256
  según especificación MP: extrae `ts` y `v1` del header `x-signature`,
  recalcula `HMAC-SHA256(MP_WEBHOOK_SECRET, "id:DATA_ID;request-id:REQ_ID;ts:TS;")`,
  compara hex strings. Si falla retorna `false` (rechazo defensivo).
- Helper privado `mpFetch()` con timeout de 8s + idempotencyKey
  (`pref-{numero}`) para evitar duplicados en reintentos.

#### Backend nuevo: `api/mp-webhook.js` (~310 líneas)
- Endpoint POST que MP llama cuando hay cambios de estado de pago.
- Flujo completo:
  1. CORS preflight + GET handshake (200 OK con `{service: 'mp-webhook'}`).
  2. Filtra `body.type === 'payment'` (otros tipos → 200 OK ignorados).
  3. Extrae `payment_id` de `body.data.id` (con fallback a query params
     para compatibilidad con IPN legacy).
  4. **Valida firma HMAC** → si falla, 401 (MP reintenta).
  5. `getPayment(paymentId)` para conocer status real.
  6. Busca pedido en Supabase por `external_reference === order.numero`
     (con fallback a `?numero=` query param defensivo).
  7. Mapea `mp.status` → estado interno vía `STATUS_MAP`:
     - `approved`/`authorized` → `'Pendiente confirmación'`
     - `pending`/`in_process` → `'Pendiente pago'`
     - `rejected` → `'Pago rechazado'`
     - `cancelled`/`refunded`/`charged_back` → `'Cancelado'`
  8. **Idempotencia**: si `order.mp_payment_id === paymentId && order.mp_payment_status === mpStatus`,
     skip (mismo webhook reintentado).
  9. **Defensa contra sobrescritura manual**: si el admin ya movió el
     pedido a `'En preparación'`, `'En camino'`, etc., NO bajamos el
     estado por un webhook tardío — solo actualizamos columnas mp_*.
  10. UPDATE en `orders`.
  11. **Eventos secundarios** (CAPI + emails) solo en transición nueva:
      - Si `approved`/`authorized`: dispara CAPI Purchase (con dedup
        vía `event_id = numero`) + email "Recibimos tu pago".
      - Si `pending`/`in_process`: dispara email "Esperando tu pago".
      - Todos con `Promise.race + timeout 3500ms` (fire-and-forget pattern).

#### Backend modificado: `api/checkout.js`
- Bifurcación según `cleanOrder.pago === 'Mercado Pago'`:
  - **Si MP**: después de crear pedido, llama `createPreference()`,
    guarda `mp_preference_id` en la orden y devuelve `init_point` al
    frontend. Si MP falla devolvemos `502 mp_error`.
  - **Si transferencia**: dispara CAPI + email Transfer en
    `Promise.all([...])` con timeout 3500ms cada uno (paralelo, no
    secuencial — más rápido que la versión anterior con CAPI solo).

#### Frontend modificado: `components/founder-checkout.js` (+186 líneas)
- Nuevo `parseMpReturn()` — detecta `?mp=success/pending/failure&numero=`
  en URL al cargar la página.
- Nuevo `handleMpReturn(mpReturn)` — dispatcher que maneja los 3 casos:
  - `success`: muestra confirmación normal, limpia carrito, abre WhatsApp
    (best-effort post-redirect).
  - `pending`: pantalla específica con mensaje sobre Abitab/Redpagos,
    NO limpia carrito, botón "Volver a la tienda".
  - `failure`: pantalla de error con 2 botones (volver al checkout,
    contactar WhatsApp), NO limpia carrito.
- Nuevo `showMpStatusScreen()` — reescribe `#confirmScreen` con ícono,
  título, msg y botones específicos por caso (no requiere HTML nuevo).
- Modificado `processOrder()` — si la respuesta trae `init_point`,
  guarda snapshot en sessionStorage, cierra waTab y redirige a MP.
  Si no, mantiene flujo de transferencia idéntico al original.
- **Estado inicial unificado**: ahora ambos métodos arrancan como
  `'Pendiente pago'`. Antes MP iniciaba como `'Pendiente confirmación'`
  asumiendo confirmación inmediata por WhatsApp; ahora el webhook
  sube a `'Pendiente confirmación'` solo cuando MP aprueba.

#### Frontend admin: `components/founder-admin.js` (+3 líneas) y `admin.html` (+1 línea)
- 3 lugares actualizados con `'Pago rechazado'`:
  - `estadoConfig` del gráfico de estados (con ícono ⚠️ rojo).
  - `statusMap` del listado de pedidos (clase `status-cancelado`).
  - `statusMap` interno de `viewOrder` (mismo).
- Filtro nuevo en `admin.html` (botón "Pago rechazado" entre
  "Entregados" y "Cancelados").
- **Decisión consciente**: NO se agregó `'Pago rechazado'` al array
  de botones de cambio manual (`'Pendiente pago','Pendiente confirmación','Confirmado','Entregado','Cancelado'`).
  El estado lo asigna el webhook automáticamente, el admin solo lo VE
  pero no lo asigna manualmente.

#### Variables de entorno nuevas en Vercel
- `MP_ACCESS_TOKEN` (NO Sensitive — patrón de Sesión 17 con CAPI)
- `MP_WEBHOOK_SECRET` (NO Sensitive)
- `MP_PUBLIC_KEY` (NO Sensitive — cargada pero no usada por backend
  todavía; queda lista para Bricks si en el futuro queremos checkout
  embebido)

#### Setup en MP (panel)
- App "Founder web" creada en https://www.mercadopago.com.uy/developers/panel
- Tipo: Pagos online → CheckoutPro → Productos físicos
- Webhook configurado en modo Prueba con URL `https://www.founder.uy/api/mp-webhook`
- Eventos: solo "Pagos" (`payment`)
- Modo Productivo también configurado con la misma URL

#### Testing realizado
- ✅ **Smoke test parcial**: pedido creado en Supabase con estado
  `'Pendiente pago'`, `mp_preference_id` lleno, redirect a `init_point`
  funciona, vuelve a `?mp=success/...` correctamente.
- 🔒 **Tests reales pendientes** (necesitan acceso a cuenta MP de la
  esposa): pago aprobado real con tarjeta de prueba, pago rechazado,
  pago pendiente Abitab, validación end-to-end del webhook actualizando
  el estado a `'Pendiente confirmación'` y disparando email + CAPI.

### 🆕 Bloque 2 — Email transaccional con Resend

**Decisión arquitectural clave:** se eligió Resend (vs SendGrid /
Mailgun / Gmail SMTP) por (1) plan free generoso (3.000 mails/mes,
100/día), (2) API REST simple (cero SDK), (3) integración nativa con
Vercel para auto-configurar DNS, (4) dashboard claro para debugging.

#### Setup
- Cuenta Resend creada (free, sin tarjeta).
- Dominio `founder.uy` agregado en Resend → región `sa-east-1` (São
  Paulo, mejor latencia para Uruguay).
- DNS auto-configurados vía integración Vercel (popup "Connect Resend"
  → "Allow"): MX + SPF + DKIM. **Sin entrar a Net.uy** porque el
  dominio está gestionado por Vercel. DMARC pendiente (recomendado
  pero no obligatorio para arrancar).
- API Key creada (`Sending access` permission, no `Full access` por
  buena práctica de mínimo privilegio).
- `RESEND_API_KEY` cargada en Vercel (NO Sensitive, mismo criterio).

#### Backend nuevo: `api/_lib/email.js` (~180 líneas)
- Wrapper liviano para Resend API. Patrón calcado de `meta-capi.js` y
  `mercadopago.js`: `fetch` directo, timeout 5s, sin SDK.
- 3 funciones públicas:
  - `sendOrderConfirmationTransfer(order, items)`
  - `sendOrderConfirmationMpApproved(order, items)`
  - `sendOrderConfirmationMpPending(order, items)`
- Helper privado `sendEmail({to, subject, html, type})` centraliza
  logging + manejo de errores. Las 3 funciones públicas son simétricas.
- Constantes: `FROM_EMAIL = 'Founder <info@founder.uy>'`, `REPLY_TO_EMAIL = 'info@founder.uy'`.
- Si falta `RESEND_API_KEY`, retorna early con error claro pero NO
  tira excepción — el caller decide qué hacer (ningún pedido falla
  por culpa de un email no enviado).

#### Backend nuevo: `api/_lib/email-templates.js` (~445 líneas)
- 3 templates HTML para los 3 emails. Convenciones de email HTML:
  - Layout con `<table>` (NO div+flex/grid — Outlook 2007-2019 no lo
    soporta bien).
  - CSS inline en cada elemento (Gmail filtra `<style>` en algunos
    casos).
  - Sin imágenes externas en V1 — logo en texto serif "FOUNDER".
  - Width fijo 600px (estándar de email).
  - Fuentes con fallback system: `Georgia` para serif, `Arial` para
    sans-serif (Cormorant/Montserrat no cargan confiable en email
    clients).
- Paleta consistente con el sitio: `#141414` bg, `#222` surface,
  `#f8f8f4` text, `#9a9a9a` muted, `#c9a96e` gold, `#2e2e2e` border.
- Bloques reutilizables:
  - `blockHeader()` — logo "FOUNDER" centrado.
  - `blockItems(items, total, envio, descuento)` — tabla con productos
    + líneas de descuento/envío + total.
  - `blockTrackingButton(numero, email)` — CTA outline dorado "Ver
    estado del pedido" linkeado a
    `seguimiento.html?pedido=...&email=...` (auto-llena formulario
    vía `founder-seguimiento.js initFromUrlParams`).
  - `blockFooter()` — WhatsApp CTA + redes + mensaje legal mínimo.
  - `wrapEmail(inner, previewText)` — table externa de 600px.
- Templates específicos por escenario:
  - **Transferencia**: hero "Gracias por tu pedido", bloque "Cómo
    transferir" con CTA "Pedir datos por WhatsApp" pre-armado, detalle
    del pedido, bloque "Bonificación 10%" con sub-mensaje contextual
    según envío/retiro ("Una vez confirmemos tu transferencia, te
    avisamos cuando esté en camino" / "...listo para retirar").
  - **MP Aprobado**: hero "Recibimos tu pago" con check verde, mensaje
    contextual envío/retiro ("código de seguimiento del envío" /
    "esté listo para retirar en zona Prado, Montevideo"), bloque
    "Próximos pasos" con ícono dinámico (📦 envío / 📍 retiro).
  - **MP Pendiente**: hero "Tu pedido está reservado", bloque
    "Importante" con timeline (3 días hábiles para pagar Abitab/Redpagos),
    bloque "¿Perdiste el cupón de pago?" con CTA WhatsApp.

#### Disparo de emails (modificaciones)
- `api/checkout.js` — disparo en paralelo con CAPI cuando es
  transferencia (`Promise.all` con timeout 3500ms cada uno).
- `api/mp-webhook.js` — disparo según el `mpStatus`:
  - `approved`/`authorized` → email Aprobado + CAPI Purchase
  - `pending`/`in_process` → email Pendiente (sin CAPI)
  - Otros → no dispara emails (rechazado, cancelado).
  - Solo en **transición nueva** (no en reintentos del webhook).

#### Validación en producción
- ✅ **Email de transferencia validado**: usuario hizo pedido real,
  email llegó a su inbox (no spam) sin retraso, se renderiza
  perfecto en Gmail desktop, todos los campos correctos (nombre,
  número de pedido, items, total, datos de entrega/retiro).

### 🆕 Bloque 3 — Sistema de variantes en toasts (verde/rojo/blanco)

**Decisión UX clave:** consistencia visual cross-página. El usuario
percibe el sitio entero comunicando con un solo lenguaje:
- ⚪ Blanco (default) → info neutral o validación suave
- 🟢 Verde (`success`) → acciones positivas (agregar al carrito)
- 🔴 Rojo (`error`) → destructivas o errores (eliminar, validación de
  formulario, error de red)

#### CSS en 3 archivos (HTML)
```css
.toast.is-visible { opacity: 1; transform: translateX(-50%) translateY(0); }
.toast--success { background: var(--color-success); color: #fff; }
.toast--error   { background: var(--color-danger);  color: #fff; }
```
- `--color-success: #4caf82` y `--color-danger: #ff3b30` ya existían
  en las 3 páginas (`index.html`, `producto.html`, `checkout.html`).
- 3 archivos modificados con CSS idéntico (consistencia visual).

#### Función `showToast` con 2° parámetro opcional (3 archivos JS)
```js
function showToast(msg, variant) {
  // ... limpia clases anteriores
  if (variant === 'success') t.classList.add('toast--success');
  else if (variant === 'error') t.classList.add('toast--error');
  // ...
}
```
- **Retrocompatible**: las llamadas viejas (`showToast('msg')` sin
  segundo parámetro) siguen funcionando como blanco neutro.
- Implementada en `index.html`, `producto.html`, `components/founder-checkout.js`.

#### Aplicación de variantes en 18 llamadas
- 🟢 **4 success**: agregados al carrito en index.html (1) y
  producto.html (1) + 2 en producto.html.
- 🔴 **13 error**: 4 al eliminar productos (`removeItem` y `changeQty`
  cuando llega a 0 en index/producto, mostrando "✕ Founder X removido
  del carrito") + 11 errores de validación/red en checkout (validaciones
  de formulario, error de red, errores de cupón, error reenvío).
- ⚪ **3 default**: validaciones suaves ("Seleccioná un color", "Este
  color está agotado") + info ("Abriendo WhatsApp...").

#### Feature nueva: toast al eliminar
Antes el `removeItem(idx)` y el `changeQty(idx, -1)` cuando llegaba a
0 NO mostraban feedback visual. Ahora ambos disparan toast rojo con
el nombre del producto eliminado: "✕ Founder Confort removido del
carrito".

### 📝 Otros ajustes UX en Sesión 22

- **Botón "Ver estado del pedido" en los 3 emails** — outline dorado,
  link a `seguimiento.html?pedido=...&email=...` que auto-rellena y
  dispara la búsqueda. Aprovecha la utilidad `initFromUrlParams` que
  ya existía en `founder-seguimiento.js` desde Sesión 14.
- **Textos contextuales por entrega/retiro en los 3 templates** — se
  detectó que decir "te avisamos cuando esté en camino" generaba
  confusión cuando el cliente había elegido retiro. Ahora cada template
  bifurca con `entrega.includes('env')` para mostrar mensaje correcto.
- **Iteración sobre el modal de index.html** — usuario detectó que el
  CTA "Ver página completa →" en el modal del index podría ser
  invisible para muchos visitantes, perdiendo oportunidad de conversión.
  Se evaluaron 3 opciones (eliminar modal, 2 botones equivalentes,
  invertir jerarquía). **Decisión: postergar** — dejar como está y
  revisar "en un tiempo". Cuando arranquen campañas pagas y haya datos
  reales de comportamiento, decidir.

### 📊 Validaciones automatizadas durante la sesión

A lo largo de los cambios:
- `node --check` sobre cada archivo JS → ejecutado >40 veces.
- Validación de JS embebido en HTMLs (extraído con regex) → 4 archivos.
- Conteo de imports vs exports → cada vez que se agregaba módulo nuevo.
- Conteo de `showToast` por variante → al cierre.
- Balance de tags HTML comparado contra original → al cierre (cero
  regresiones).
- Cross-check `onclick=` en checkout.html vs `window.X = X` exports
  en founder-checkout.js → 10 onclicks ↔ 10 exports.
- Validación end-to-end del flujo lógico (lectura del código) para
  los 4 casos: transferencia, MP aprobado, MP pending, MP failure.

### 🐛 Incidentes resueltos durante la sesión

| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Usuario reportó que el email mostraba envío $250 cuando el subtotal era >$2000 (debería ser gratis) | **Falso bug**: los previews de Claude tenían datos hardcodeados (`envio: 250` en el script de testing). El sistema productivo aplica bien la lógica `subtotalConDesc >= 2000 ? 0 : 250` en `calculateOrderTotals()`. El template solo renderiza, no calcula | Confirmado mirando un pedido real en admin. Re-generados los previews con datos coherentes (subtotal $2.490, envío 0, total $2.490) |
| 2 | Confusión sobre dónde estaba el dominio `founder.uy` registrado | El usuario lo había comprado vía Vercel mismo (no Net.uy directo). Esto era una BUENA NOTICIA: integración Vercel↔Resend ahorró el paso de configurar DNS manualmente | Click en "Allow" en el popup "Connect Resend" de Vercel — DNS auto-configurados |
| 3 | Decisión sobre flag "Sensitive" en variables de Vercel | Sesión 17 documentó bug en plan Hobby con Sensitive. No se sabía si seguía vigente | Decisión: **NO tildar** Sensitive — consistencia con `META_CAPI_TOKEN` y `ADMIN_PASSWORD` que funcionan así. Si en el futuro el plan Pro de Vercel resuelve esto y querés activarlo, se puede hacer en sesión dedicada |

### Tareas técnicas adicionales en Sesión 22
- Webhook MP configurado en modo Prueba **y también** modo Productivo
  (misma URL, mismos eventos) — listo para cuando se cambien
  credenciales.
- Pendientes para Sesión 23 marcados explícitamente al cierre.

---

## ✅ Lo que quedó funcionando en Sesión 21

Sesión enfocada en 3 bloques: **feature `stock_bajo` en admin** (cierra
pendiente de Sesión 20), **optimizaciones de carga inicial en index.html**
(banner + skeletons + priorización), y **fixes de accesibilidad WCAG**
detectados con PageSpeed Insights. El sitio cerró la sesión con score
**Performance 94/100 (verde)** en mobile.

### 🆕 Bloque 1 — Feature `stock_bajo` en admin

**Decisión arquitectural clave:** se descartó el plan original de Sesión 20
de usar `product_colors.extras` JSONB y se eligió una **columna nueva
`stock_bajo BOOLEAN NOT NULL DEFAULT FALSE`** en `product_colors`, paralela
a `estado` y `precio_oferta`. Razón: consistencia con el patrón existente,
simplicidad, y no requerir parsing de JSONB.

#### Cambios en Supabase
- Nueva columna `stock_bajo BOOLEAN NOT NULL DEFAULT FALSE` en `product_colors`.
- Default `FALSE` → todos los colores existentes quedaron compatibles sin migración.

#### Backend (`api/admin.js`)
- `handleListProducts` SELECT extendido con `stock_bajo`.
- `handleSaveProduct` INSERT incluye `stock_bajo: c.stock_bajo === true`.

#### Frontend público (`components/supabase-client.js`)
- Query `fetchProducts` agrega `stock_bajo` al SELECT de `product_colors`.
- En `toLegacyProduct`, cuando `c.stock_bajo === true` agrega la clave
  `colores_estado["<NombreColor>_stock_bajo"] = true` — exactamente el
  contrato que `producto.html` ya esperaba desde Sesión 20.

#### UI Admin (`components/founder-admin.js`)
- 4° botón "⏳ Stock bajo" en cada fila de color, **independiente** de los
  3 estados existentes (Activo/Agotado/Oferta).
- Nueva función `toggleStockBajo(uid)` (toggle simple, sin lógica excluyente
  — el frontend ignora el flag automáticamente si `estado === 'sin_stock'`).
- `loadProducts`, `editProduct`, `addColorRow`, `saveProduct`, `persistBannerUrl`
  hidratan/serializan `stock_bajo` en cada flujo.
- `window.toggleStockBajo` expuesto para `onclick` inline.

#### CSS (`admin.html`)
- Selector `.estado-btn--stockbajo.stockbajo--sel` con dorado claro `#f5c85a`,
  paralelo al patrón visual de los otros 3 estados.

### ⚡ Bloque 2 — Optimizaciones de carga inicial (index.html)

**Diagnóstico previo:** el banner del hero tardaba ~1.5-2s en aparecer porque
(1) la query del banner traía toda la fila de `products` solo para una URL,
(2) la imagen empezaba a descargarse después de que terminara `Promise.all`
con productos+fotos, (3) no había hints de prioridad para el navegador.

#### Bloque 2a — Banner migrado a `site_settings`
- `supabase-client.js → fetchBannerUrl` ahora consulta
  `/site_settings?select=value&key=eq.hero_banner_url&limit=1` (mucho más
  liviana que traer `products` entero).
- `founder-admin.js`: refactor completo del bloque banner. Eliminadas
  `getBannerProduct()` y la `persistBannerUrl()` legacy de 50+ líneas.
  La nueva `loadBanner()`/`persistBannerUrl()` usan `apiAdmin('get_setting')`
  y `apiAdmin('set_setting')`.
- `api/admin.js`: eliminado el campo legacy `banner_url` de `handleSaveProduct`.

#### Bloque 2b — Eager loading + fetchpriority
- **Banner del hero**: `fetchpriority="high"` + `decoding="async"` + fade-in
  suave (`opacity 0 → CSS .5` con transition 350ms).
- **Primeras 3 cards de productos**: `loading="eager"` + `fetchpriority="high"`.
- **Cards 4 en adelante**: siguen `loading="lazy"` + `fetchpriority="low"`.
- **`<link rel="preconnect" href="https://qedwqbxuyhieznrqryhb.supabase.co" crossorigin>`**
  en el `<head>` para adelantar el handshake TLS (~100-200ms ganados).

#### Bloque 2c — Skeleton cards de carga
- **3 skeleton cards** con shimmer dorado animado en lugar del texto plano.
- Respeta `prefers-reduced-motion`.
- Atributos ARIA correctos.

### 🛡️ Bloque 3 — Fixes de accesibilidad WCAG

#### Fix 3a — Contraste del botón "Ver detalle de producto"
- **Problema:** botón con `background: #c9a96e` (dorado) + `color: #ffffff`
  (blanco) → ratio 2.2:1 (falla WCAG AA).
- **Solución:** cambiado a `color: var(--color-bg)` (negro `#141414`)
  → ratio ~8.5:1 (pasa AAA).

#### Fix 3b — Jerarquía de headings semánticos
- **Solución:** agregado `<h2 class="visually-hidden">Características RFID</h2>`
  al inicio de la sección RFID.

### 📊 Validación de resultados

#### PageSpeed Insights — score final
- **Performance: 94/100 (verde)** — top ~10% de sitios web.
- Speed Index: 1.9s (verde, <3.4s).

---

## ✅ Lo que quedó funcionando en Sesión 20

Sesión muy larga centrada en **producto.html**. Se abordaron múltiples bloques
de mejoras UX, todas validadas en producción por el usuario. El archivo pasó
de ~1394 líneas a 2422 líneas (+1028) sumando galería interactiva, sección
comparativa, sección de reseñas con carrusel mobile, SEO dinámico, sticky CTA
inteligente, integración con burbuja WhatsApp, y un fix crítico de iOS.

[Detalle completo en versiones anteriores de ESTADO.md — resumido para legibilidad]

- 🎨 **Bloque 1**: Galería de fotos producto.html — autoplay 4s, zoom hover desktop,
  swipe mobile + flechas laterales, lazy-loading inteligente.
- 📱 **Bloque 2**: Mobile UX — specs en 2 columnas, tabs sin scroll, espacio reducido.
- 🛡️ **Bloque 3**: Política Garantía 60d vs Cambios 7d separadas en 5 archivos.
- 📊 **Bloque 4**: Tabla comparativa Founder vs billetera tradicional.
- 🛒 **Bloque 5**: Fotos del carrito centralizadas en cart.js (5 páginas).
- 🎯 **Bloque 6**: 9 mejoras finales — sticky CTA mobile+desktop, lógica de stock
  bajo (preparada), texto seguridad, confirmación visual, política de envío 2 líneas,
  reseñas con carrusel, Schema.org, OG/Twitter dinámicos, botón Compartir WhatsApp.
- 🔧 **Bloque 7**: Coordinación burbuja WhatsApp + sticky CTA via 2 clases body.
- 🐛 **Bloque 8**: Fix bug touch iOS Safari (`touch-action: pan-y` + 4 listeners).
- 🧹 **Bloque 9**: Revisión completa con 5 bugs encontrados y arreglados.

---

## ✅ Lo que quedó funcionando en Sesión 19

Sesión corta, enfocada en dos bugs reportados por el usuario tras el uso real
del sitio: **WhatsApp no abría automáticamente en iOS tras finalizar compra
por transferencia** y **el header de `producto.html` estaba visualmente roto**.

### 🐛 Fix 1 — WhatsApp automático en iOS post-checkout
**Causa raíz:** Safari iOS bloquea `window.open('url', '_blank')` si se llama
después de un `await`. Solución: patrón **pre-open + fallback** en
`components/founder-checkout.js`.

### 🐛 Fix 2 — CSS del header roto en `producto.html`
**Causa raíz:** desfasaje de nomenclatura (clases viejas `.header__nav*` vs
nuevas `.nav*`). Reemplazado con CSS de `index.html` (fuente de verdad).

---

## ✅ Lo que quedó funcionando en Sesión 18

3 frentes: **desbloqueo de la verificación de dominio en Meta** (era bug de
Opera, no de Meta — usar Chrome), **cierre de pendientes técnicos**, y
**feature nueva de gestión de pedidos** (archivar/eliminar desde admin con
soft delete reversible + hard delete con doble confirmación).

---

## ✅ Lo que quedó funcionando en Sesión 17 (Fase 4)

### Dominio custom
- `founder.uy` comprado y conectado a Vercel con SSL automático.
- Redirects 308/301 desde `founder.uy` y `founder-web-gules.vercel.app`.

### Meta Business Portfolio
- Business: `founder.uy`. Page: `founder.uy.oficial`. Instagram: `@founder.uy`.
- Pixel: `Founder Pixel` (ID `2898267450518541`).

### Meta Pixel + CAPI
- `META_PIXEL_ID` y `META_CAPI_TOKEN` en Vercel env vars.
- `components/meta-pixel.js` (~230 líneas): wrapper oficial del Pixel.
- `api/_lib/meta-capi.js` (~230 líneas): módulo CAPI con hasheado SHA-256.
- `event_id = order.numero` → Meta deduplica.

---

## ✅ Lo que quedó funcionando en Sesión 16 (Fase 3C)

- Limpieza: eliminadas `SHEET_ID`, `APPS_SCRIPT_URL`, página "Conversor de
  imágenes" del admin, `api/ping.js`. Apps Script archivado, Google Sheet
  movido a archivo con backup `.xlsx`.

---

## ✅ Lo que quedó funcionando en Sesión 15 (Fase 3B)

- `components/founder-admin.js` — IIFE, expone 37 funciones a `window`.
- Login valida contra `/api/admin` action `login`. Password en sessionStorage.

---

## ✅ Lo que quedó funcionando en Sesión 14 (Fase 3A)

### Infraestructura
- Vercel Serverless Functions en `/api/*` (`/api/checkout`, `/api/seguimiento`, `/api/admin`).
- Storage bucket `product-photos` público.
- RPC `apply_coupon_and_create_order(jsonb, jsonb, text)` — transacción atómica.

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
   ⚠️ El campo `banner_url` quedó como **legacy silencioso** desde Sesión 21.
2. **`product_colors`** — id, product_id, nombre, estado
   (check: `activo`/`sin_stock`/`oferta`), precio_oferta, **stock_bajo**
   (bool, default false — Sesión 21), orden, created_at.
3. **`product_photos`** — id, color_id, url, orden, es_principal, created_at.
4. **`orders`** — 26 columnas: id (uuid), numero (unique), fecha, nombre,
   apellido, celular, email, entrega, direccion, productos, subtotal, descuento,
   envio, total, pago, estado, notas, nro_seguimiento, url_seguimiento,
   cupon_codigo, archivado (bool, default false), **mp_preference_id** (Sesión 22),
   **mp_payment_id** (Sesión 22), **mp_payment_status** (Sesión 22), created_at,
   updated_at.
5. **`order_items`** — id, order_id (FK cascade), product_name, color,
   cantidad, precio_unitario.
6. **`coupons`** — id, codigo (unique), tipo, valor, uso, min_compra, activo,
   usos_count, emails_usados (text[]), desde, hasta, created_at.
7. **`site_settings`** — key (PK), value, updated_at.
   Keys actuales: `hero_banner_url` (Sesión 21).

### Constraints CHECK en `orders`
- `orders_entrega_check` → `entrega IN ('Envío','Retiro')`
- `orders_pago_check` → `pago IN ('Mercado Pago','Transferencia')`
- `orders_estado_check` → `estado IN ('Pendiente pago','Pendiente confirmación','Confirmado','En preparación','En camino','Listo para retirar','Entregado','Cancelado','Pago rechazado')` ← actualizado en Sesión 22

### Índices nuevos en Sesión 22
- `orders_mp_payment_id_idx` (parcial: `WHERE mp_payment_id IS NOT NULL`)
- `orders_mp_preference_id_idx` (parcial: `WHERE mp_preference_id IS NOT NULL`)

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

---

## 📂 Archivos del proyecto (estructura actual en GitHub)

```
founder-web/
├── index.html                     ✅ (Sesión 25: LQIP en banner + scroll-reveal classes + display=optional)
├── producto.html                  ✅ (Sesión 25: gallery_thumb preset + scroll-reveal classes + display=optional)
├── checkout.html                  ✅ (Sesión 25: display=optional)
├── seguimiento.html               ✅ (Sesión 25: display=optional)
├── admin.html                     ✅ (Sesión 25: display=optional + preconnect agregados)
├── contacto.html                  ✅ (Sesión 25: scroll-reveal classes + display=optional)
├── sobre-nosotros.html            ✅ (Sesión 25: scroll-reveal classes + display=optional)
├── envios.html                    ✅ (Sesión 25: scroll-reveal classes + display=optional)
├── tecnologia-rfid.html           ✅ (Sesión 25: scroll-reveal classes + display=optional)
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅
│   ├── cart.js                    ✅
│   ├── supabase-client.js         ✅
│   ├── meta-pixel.js              ✅
│   ├── cloudinary.js              ✅ (Sesión 24: NUEVO — Sesión 25: presets hero/gallery_thumb/hero_blur)
│   ├── scroll-reveal.js           ✅ (Sesión 25: NUEVO — IntersectionObserver + 3 clases reveal)
│   ├── founder-checkout.js        ✅ (~910 líneas — Sesión 22: MP redirect/return + toasts variantes)
│   ├── founder-seguimiento.js     ✅
│   └── founder-admin.js           ✅ (~1769 líneas — Sesión 22: estado Pago rechazado)
├── api/
│   ├── _lib/
│   │   ├── supabase.js            ✅
│   │   ├── meta-capi.js           ✅
│   │   ├── mercadopago.js         ✅ (Sesión 22: NUEVO — wrapper REST API MP)
│   │   ├── email.js               ✅ (Sesión 25: +sendOrderStatusUpdate)
│   │   └── email-templates.js     ✅ (Sesión 25: +templateOrderStatusUpdate, +blockItemsCompact, +blockItemsWithPhotos, +STATUS_CONFIG)
│   ├── checkout.js                ✅ (Sesión 22: bifurcación MP + email transfer paralelo)
│   ├── seguimiento.js             ✅
│   ├── admin.js                   ✅ (Sesión 25: handleUpdateOrderStatus dispara email con foto lookup)
│   └── mp-webhook.js              ✅ (Sesión 22: NUEVO — webhook MP con HMAC + email + CAPI)
├── package.json                   ✅
├── vercel.json                    ✅
├── README.md                      ✅
└── ESTADO.md                      ← este archivo
```

---

## 🔧 API /api/admin — Acciones (17 totales)

[Sin cambios desde Sesión 21 — ver versiones anteriores para detalle]

| Categoría | Action | Qué hace |
|---|---|---|
| **Auth** | `login` | Valida password |
| **Pedidos** | `list_orders`, `update_order_status`, `update_order_tracking`, `archive_order`, `unarchive_order`, `delete_order` (con `body.confirm=true`) |
| **Cupones** | `list_coupons`, `create_coupon`, `update_coupon`, `delete_coupon` |
| **Productos** | `list_products`, `save_product`, `delete_product` |
| **Settings** | `get_setting`, `set_setting` |
| **Storage** | `get_upload_url` |

---

## 🔧 API /api/checkout — Acciones (2 totales)

| Action | Qué hace |
|---|---|
| `validate_coupon` | Valida cupón sin registrarlo (read-only) |
| `create_order` | Crea pedido + items + (si hay) registra uso de cupón en RPC atómica. Si `pago === 'Mercado Pago'` → adicionalmente crea preference de MP y devuelve `init_point`. Si transferencia → dispara CAPI + email Transfer en paralelo |

---

## 🔧 API /api/mp-webhook — endpoint de Mercado Pago (Sesión 22)

| Acción | Detalle |
|---|---|
| **POST `/api/mp-webhook`** | Recibe avisos de cambios de estado de pago de MP. Valida firma HMAC-SHA256, busca pago en API MP, actualiza pedido en Supabase. En transición nueva: dispara CAPI Purchase (si aprobado) + email correspondiente (aprobado/pending) |
| **GET `/api/mp-webhook`** | Health check. Devuelve `{ok: true, service: 'mp-webhook', method: 'POST'}` |

---

## ⚠️ Reglas críticas NO NEGOCIABLES

### Reglas de código
- La clave interna `'sin_stock'` NO se modifica jamás.
- Sistema de componentes (`header.js`, `footer.js`, `cart.js`,
  `supabase-client.js`, `meta-pixel.js`, `founder-checkout.js`,
  `founder-seguimiento.js`, `founder-admin.js`) es la **única fuente de
  verdad**. No replicar markup/lógica en HTMLs.
- `supabase-client.js` SIEMPRE antes que `cart.js`.
- `checkout.html` y `admin.html` quedan excluidos del sistema de header/footer.
- `service_role` NUNCA va al frontend.
- **El `delete_order` del admin requiere DOBLE confirmación del usuario** +
  backend valida `body.confirm === true`.
- **Nunca refactorizar producto.html sin antes correr los chequeos del Bloque 9
  de Sesión 20** (sintaxis JS, balance de divs, IDs únicos, CSS huérfano).

### Reglas nuevas Sesión 22
- **El estado `'Pago rechazado'` NO tiene botón manual en el admin** — lo
  asigna SIEMPRE el webhook automáticamente al recibir `mpStatus === 'rejected'`.
  Si querés agregarlo manualmente desde el admin, antes considerá si no
  conviene `'Cancelado'` (que sí tiene botón).
- **El webhook NUNCA sobrescribe estados manuales del admin**. Si el admin
  movió un pedido a `'En preparación'`/`'En camino'`/etc., un webhook tardío
  de MP NO baja el estado — solo actualiza columnas mp_*.
- **Disparos secundarios (CAPI + emails) solo en transición nueva**. Detección
  vía comparación de `mp_payment_id + mp_payment_status` previo. Esto
  evita disparar 2 veces emails si MP reintenta el webhook.
- **Patrón `Promise.race + timeout 3500ms`** para todos los fire-and-forget
  desde funciones serverless de Vercel (CAPI, emails). Sin timeout, Vercel
  mata el proceso al retornar y se pierde el evento.

### Reglas de base de datos
- Cuando se cree una tabla o se active RLS, SIEMPRE emitir explícitamente
  `GRANT SELECT/ALL ... TO anon|authenticated|service_role`.
- Los constraints CHECK de `orders` deben coincidir EXACTO con los strings
  que manda el frontend (incluyendo `'Pago rechazado'` desde Sesión 22).
- ⚠️ **Orden crítico de despliegue** (regla de Sesión 21): cuando un cambio
  toca Supabase + código frontend al mismo tiempo, SIEMPRE correr el SQL
  en Supabase **PRIMERO**. Si se invierte el orden, el frontend pide
  columnas/filas que aún no existen y falla en cascada.

### Reglas de navegador
- **Para probar cambios en paneles de Meta Business, usar Google Chrome**
  (Opera tiene bugs intermitentes).
- **Para probar deploys en Vercel, hacer hard refresh (`Ctrl+F5`) o usar
  ventana incógnito**.

### Reglas de UX (Sesión 20-22)
- **Mobile fixes deben respetar `env(safe-area-inset-bottom)`** para iPhones
  modernos.
- **Touch handlers deben usar `touch-action: pan-y` en CSS** + clasificación
  temprana en `touchmove`.
- **Burbuja WhatsApp y sticky CTA se coordinan vía 2 clases en `<body>`**
  (`.has-sticky-cta`, `.footer-visible`) — observers independientes, NO
  fusionar.
- **Toasts respetan el sistema de variantes**: `success` (verde) para
  positivas, `error` (rojo) para destructivas/errores, default (blanco)
  para info neutral. Nuevas llamadas a `showToast` deben clasificar
  explícitamente con la variante correcta.

### Reglas nuevas Sesión 25
- **Fonts del sitio cargan con `display=optional`**, no con `swap`. La
  cadena debe ser idéntica en los 9 HTMLs. Los pesos cargados son los
  reales del CSS: Cormorant 300/400/500 + ital 300/400, Montserrat
  300/400/500/600/700. **NO modificar a `swap` sin medir** — la regresión
  de Speed Index es real para este sitio (CSS inline grande genera
  reflow tardío).
- **Presets nuevos en `cloudinary.js` requieren entrada en `SIZES`** si
  vienen con `widths` (srcset). El `sizes` attribute debe coincidir con
  los breakpoints reales del CSS (mobile <600, tablet 600-1024, desktop
  >1024). Falta de `SIZES` no rompe nada, pero el navegador no elige
  bien del srcset.
- **El componente `scroll-reveal.js` se carga con `defer`** y SOLO en
  los 6 HTMLs públicos (no admin, checkout, seguimiento). No animar
  elementos above-the-fold (LCP, sticky CTAs, header). El kill-switch
  `ENABLED = false` desactiva toda la lógica sin tocar HTMLs.
- **Emails de cambios de estado disparan SOLO en transición real** (estado
  previo ≠ estado nuevo). Estados que disparan email están listados en
  `STATUS_CONFIG` de `email-templates.js`. Estados como `Cancelado`,
  `Pago rechazado`, `Pendiente pago` y `Pendiente confirmación` están
  EXCLUIDOS a propósito.
- **`info@founder.uy` NO es inbox real** — los `reply_to` de los emails
  transaccionales se pierden. Hasta que se resuelva, no asumir que se
  pueda leer correo en esa dirección. Para reportes DMARC se usa el
  Gmail personal del usuario (`founder.uy@gmail.com`).
- **DMARC está en `p=none`** (modo monitoreo). NO subir a `quarantine`
  o `reject` sin antes confirmar 2-4 semanas que los reportes muestran
  SPF + DKIM passing en todos los proveedores.
- **NO duplicar lógica de Cloudinary en backend** — si un endpoint
  necesita wrappear URLs (ej `admin.js` para emails), hacerlo inline
  con la misma constante `CLD_BASE` y validación de host. NO importar
  `components/cloudinary.js` desde el backend (es frontend-only).

---

## 🧪 Cómo probar todo lo que está hecho

### Prueba end-to-end de compra por transferencia
1. Abrir https://www.founder.uy
2. Agregar producto al carrito → checkout.
3. Completar formulario, elegir **Transferencia**, confirmar pedido.
4. Verificar:
   - ✅ Toast verde "Founder X — Color agregado" al agregar (Sesión 22)
   - ✅ WhatsApp se abre con resumen
   - ✅ Pantalla "🎉 ¡Pedido enviado!" con número `F######`
   - ✅ Email llega a `info@founder.uy` con todos los detalles + botón
     "Ver estado del pedido" (Sesión 22)
   - ✅ Pedido en Supabase `orders` + `order_items` con estado `'Pendiente pago'`

### Prueba end-to-end de compra por Mercado Pago (modo PRUEBA)
> ⚠️ **Bloqueado actualmente**: requiere acceso a la cuenta de MP de la
> esposa para usar tarjetas de prueba.

1-3. Igual que transferencia pero elegir **Mercado Pago**.
4. Sitio redirige a `https://www.mercadopago.com.uy/checkout/v1/...`.
5. Pagar con tarjeta de prueba `5031 7557 3453 0604`, CVV `123`, vto `11/30`,
   titular **APRO** (aprobado), **OTHE** (rechazado), **CONT** (pendiente).
6. Verificar según el caso:
   - 🟢 **Aprobado**: vuelve a `?mp=success`, ve confirmación, recibe
     email "Recibimos tu pago", admin muestra estado `'Pendiente confirmación'`.
   - 🟡 **Pendiente**: vuelve a `?mp=pending`, ve mensaje sobre Abitab,
     recibe email "Tu pedido está esperando el pago", admin muestra
     `'Pendiente pago'`.
   - 🔴 **Rechazado**: vuelve a `?mp=failure`, ve error con botones,
     admin muestra `'Pago rechazado'` (después del webhook).

### Prueba de seguimiento (autocompletado por email)
1. Click en el botón "Ver estado del pedido" en cualquier email recibido.
2. Verificar:
   - ✅ Abre `seguimiento.html` con `?pedido=F######&email=...` en URL.
   - ✅ Formulario auto-rellenado con esos datos.
   - ✅ Búsqueda dispara automáticamente.
   - ✅ Se ve detalle del pedido + barra de progreso.

### Prueba de admin
- `/admin.html` con password `nerito20`.
- Verificar nuevo filtro **"Pago rechazado"** en la fila de filtros (Sesión 22).
- Verificar que en gráfico de "Estado de pedidos" aparece "⚠️ Pago rechazado"
  con color rojo.

### Prueba de toasts (Sesión 22)
- **🟢 Verde**: agregar producto al carrito desde index o producto.
- **🔴 Rojo (eliminación)**: abrir carrito → click ✕ en algún item.
  Toast: "✕ Founder X removido del carrito".
- **🔴 Rojo (validación)**: ir a checkout vacío y click "Continuar al pago".
  Toast: "Completá todos los datos personales".
- **⚪ Blanco (default)**: en producto, sin elegir color, click "Agregar al
  carrito". Toast: "Seleccioná un color".

### Prueba del webhook MP (smoke test)
- Abrir `https://www.founder.uy/api/mp-webhook` en navegador.
- Verificar respuesta JSON: `{"ok":true,"service":"mp-webhook","method":"POST"}`.

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
| Meta domain-verification token | `6qpwim4axainj6z7q5d06778d8qsxd` |
| WhatsApp del negocio | `598098550096` |
| FREE_SHIPPING threshold | `2000` UYU |
| SHIPPING_COST | `250` UYU |
| **MP App** | "Founder web" (Sesión 22) |
| **MP Webhook URL** | `https://www.founder.uy/api/mp-webhook` (configurada en modo Prueba **y** Productivo) |
| **Resend dominio** | `founder.uy` verificado en Resend, región `sa-east-1` (Sesión 22) |
| **Email remitente** | `info@founder.uy` (Sesión 22) — ⚠️ NO es inbox real, solo envía |
| **Cloudinary** | Cuenta `founder-uy` plan Free (Sesión 24), email admin `evandrosegovia@gmail.com` |
| **DMARC** | Publicado Sesión 25 con `p=none`, reportes a `founder.uy@gmail.com` |
| **Email reportes DMARC** | `founder.uy@gmail.com` (Gmail personal del usuario) |
| Pedido de prueba histórico | `F910752` / `test@prueba.com` / Confort Negro / $2.490 |
| ⚠️ NO BORRAR | Pedido `F203641` / Florencia Risso / `florenciar.1196@gmail.com` (cliente real) |

---

## 📋 Pendientes para Sesión 28

> **⚠️ IMPORTANTE:** la prioridad #1 para Sesión 28 está en la sección
> **"🎯 PRIORIDAD #1 PARA SESIÓN 28"** al inicio del documento (debajo
> del bloque "🚀 Para iniciar el chat siguiente (Sesión 28)"). Es el
> feature de personalización láser (Sesión A del plan documentado en
> `PLAN-PERSONALIZACION.md` v2). **Lo de abajo son pendientes
> secundarios** que se atacan en cualquier sesión libre.

### ✅ Resueltos en Sesión 26 (ya no son pendientes)
- ~~Resolver `info@founder.uy` (no es inbox real)~~ → resuelto con ImprovMX. Funcional bidireccional al 100%.
- ~~`sitemap.xml` y `robots.txt`~~ → resueltos (sitemap dinámico desde Supabase + robots con disallow apropiados).
- ~~Schema.org Organization básico~~ → resuelto (ahora completo con sameAs, areaServed, address, SearchAction).
- ~~Meta tags faltantes en páginas estáticas~~ → resueltos (5 páginas con SEO completo: keywords, robots, canonical, OG, Twitter).
- ~~og:image específico por página~~ → resuelto a nivel base (todas usan `og-image.jpg` central). Pendiente menor: og:image dinámica por producto.

### 🟢 Prioridad media — pulido / definición del usuario
1. **Datos bancarios reales en email de transferencia**. El template actual dice "Te enviamos los datos por WhatsApp". Cuando se definan (banco, tipo de cuenta, CBU, titular), agregar bloque con datos directos en el email.
2. **Decisión sobre el modal de index.html**. Postergada desde Sesión 22. Idealmente con datos de comportamiento real de campañas Meta.
3. **Primera campaña paga de Meta Ads** con optimización de Purchase. Todo listo desde Sesión 17-18. Definir presupuesto, producto, audiencia, creatividad.
4. **Subir DMARC a `p=quarantine`** en 2-4 semanas si los reportes confirman que SPF + DKIM pasan en todos los proveedores. Editar el TXT `_dmarc` en Vercel y cambiar `p=none` por `p=quarantine`. **Importante:** revisar primero los reportes XML que llegan a `founder.uy@gmail.com` para confirmar que ningún sender legítimo falla.
5. **Pendientes Meta Business** (3 clics en Chrome):
   - Renombrar dataset "NO" (ID `1472474751248750`) con prefijo `ZZ-`.
   - Renombrar/ignorar Ad Account `26140748312219895`.
   - Agregar email de contacto al Instagram.
6. **Drop columna `products.banner_url`** (legacy desde Sesión 21). `ALTER TABLE products DROP COLUMN banner_url;` — incluido en Opción D del menú principal.

### 🔵 Direcciones nuevas (a discutir)
- **Mejoras UX en otras páginas**: `index.html`, `contacto.html`, `sobre-nosotros.html`. Consistencia con el polish de `producto.html`. (El scroll-reveal de Sesión 25 ya dio un salto grande, pero las páginas estáticas todavía pueden refinar tipografía, espaciados, microinteracciones.)
- **Sistema de reseñas reales**: cuando haya clientes con compras validadas — reemplazar las 4 reseñas mock de Sesión 20. Ya está incluido como **Opción B** del menú principal de Sesión 27.
- **Email cuando se carga `nro_seguimiento` desde admin** (action `update_order_tracking`). Hoy NO dispara email — solo cambios de estado. Considerar si conviene unificar o mantener separado (ej: si admin marca "En camino" + carga tracking en pasos separados, hoy llega un email sin tracking y después no llega notificación con el código).
- **Schema.org BreadcrumbList en `producto.html`**. Era parte del plan original de Opción C de Sesión 25 pero se priorizaron meta tags base. Tiempo: 15-20 min. Bonus visual: Google muestra "Inicio › Productos › [nombre]" en lugar de la URL.
- **Schema.org Product `aggregateRating` + `review` fields** en `producto.html` cuando estén las reseñas reales (post-Opción B). Habilita estrellitas en resultados de Google → mucho mejor CTR.
- **og:image dinámica por producto en `producto.html`**. Hoy se setea vía JS, los crawlers no la ven. Solución vía endpoint `/api/og-image?id=X` que genere la imagen al vuelo, o vía SSR del meta tag. Tiempo: 30-45 min.
- **Gmail "Send mail as" desde info@founder.uy**. Ya incluido como **Opción E** del menú principal.

### Optimizaciones de performance restantes (NO urgentes — sitio en buen estado)
- **Cache headers en Supabase Storage** (Cloudinary ya cachea, pero header long-cache en origen sería bonus marginal).
- **Reducir JS sin usar** (auditoría con Coverage tab de DevTools).
- **Auto-host de Google Fonts** en Vercel (alternativa más agresiva al `display=optional` de Sesión 25). Solo evaluar si Lighthouse muestra que fonts siguen siendo bottleneck en el LCP.

---

## 📜 Historial de incidentes resueltos

### Sesión 27 (1 incidente CRÍTICO — admin caído)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Admin caído con "Contraseña incorrecta" sin importar password. Consola: `FUNCTION_INVOCATION_FAILED` (500) | **Doble causa:** (a) archivo `meta-capi.js` duplicado en `api/` (suelto) y `api/_lib/` desde hacía 2 semanas, sin causar problema porque Vercel cacheaba builds anteriores. (b) `package.json` declaraba Node 20, pero Supabase publicó versiones 2.50+ que requieren WebSocket nativo (solo Node 22+). El `^2.45.4` permitía la actualización automática | Borrado el duplicado de `api/meta-capi.js`. Cambiado `"node": "20.x"` → `"node": "22.x"` en `package.json`. **Lección crítica: `^x.y.z` en deps puede explotar después de semanas cuando una nueva versión cambia requirements de runtime. Considerar pinning con `~` o exacto en deps críticas** |

### Sesión 25 (2 hallazgos sin incidente real)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Banner del hero en monitores 4K se veía pixelado | Preset `hero` solo cubría hasta 2000px | Subir `widths` a `[800, 1200, 1600, 2000, 2800, 3600]` y `width` default a 2400. Agregado `q_auto:good` |
| 2 | Miniaturas debajo de foto principal en producto.html se veían pixeladas | Usaban preset `thumb` (200px) compartido con carrito; en Retina necesitan ~480px | Crear preset dedicado `gallery_thumb` (480px + srcset responsive). No tocar `thumb` que sigue OK para carrito/admin |
| 3 | `info@founder.uy` no es inbox real (descubierto al configurar DMARC) | Resend solo envía, no recibe — dirección configurada como remitente sin inbox detrás | ✅ Resuelto en Sesión 26: ImprovMX configurado (3 DNS records en Vercel, alias catch-all `*@founder.uy → founder.uy@gmail.com`) |

### Sesión 22 (3 incidentes)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Email mostraba envío $250 cuando subtotal >$2000 | **Falso bug**: previews de Claude tenían datos hardcodeados (`envio: 250`). Sistema productivo aplica bien la lógica | Confirmado mirando pedido real. Re-generados previews con datos coherentes |
| 2 | Confusión sobre registrador de `founder.uy` (¿Net.uy o Vercel?) | Dominio gestionado por Vercel directamente — integración Vercel↔Resend ahorró setup DNS manual | Click en "Allow" en popup "Connect Resend" — DNS auto-configurados |
| 3 | Decisión sobre flag "Sensitive" en variables Vercel para MP/Resend | Sesión 17 reportó bug en Hobby. No se sabía si seguía vigente | NO tildar Sensitive — consistencia con META_CAPI_TOKEN/ADMIN_PASSWORD que funcionan así |

### Sesión 21 (1 incidente — orden de despliegue)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Productos y banner dejaron de cargar tras subir archivos de stock_bajo | Usuario subió 4 archivos a GitHub antes de correr el SQL `ALTER TABLE product_colors ADD COLUMN stock_bajo`. Frontend pidió columna inexistente → 400/500 → cascada de fallas | Correr el SQL pendiente. Recuperación instantánea. **Lección: SIEMPRE el SQL primero, después el código** (regla agregada a sección crítica) |

### Sesión 20 (5 incidentes resueltos en revisión final + 1 bug iOS crítico)
[Detalle completo en versiones anteriores — touch handlers iOS, sticky CTA + footer, `</div>` huérfano, código JS muerto, CSS huérfano, scrollbar fantasma]

### Sesión 19 (2 incidentes)
[iOS Safari WhatsApp + CSS legacy header producto.html]

### Sesión 18 (3 incidentes)
[Meta validador Opera, cache Opera, dataset auto-creados Meta]

### Sesión 17 (5 incidentes)
[Meta dominio Opera, GitHub upload parcial, archivo carpeta equivocada, Sensitive Hobby, fire-and-forget Vercel]

### Sesión 16 (1 incidente)
[Admin 500 permission denied → grant all to service_role]

### Sesión 14 (6 incidentes en cascada)
[Permisos RLS, GRANT, columnas faltantes orders, constraints CHECK, GRANT service_role en tablas privadas]

---

## 📋 Historial de sesiones

- **Sesión 9-11:** Setup inicial, componentes, catálogo en Google Sheets.
- **Sesión 12:** Supabase configurado, schema inicial, catálogo migrado.
- **Sesión 13 (Fase 2):** Frontend público migrado a `window.founderDB`.
- **Sesión 14 (Fase 3A):** Checkout y seguimiento migrados a Supabase vía
  Vercel Serverless. 6 incidentes resueltos en cascada.
- **Sesión 15 (Fase 3B):** Admin migrado a `/api/admin` + Supabase Storage.
- **Sesión 16 (Fase 3C):** Limpieza final. Apps Script apagado, Sheet
  archivado, Google Cloud marcado para eliminación.
- **Sesión 17 (Fase 4):** Dominio custom `founder.uy`. Meta Business Portfolio
  creado. Meta Pixel + CAPI operativos. Test E2E F378204.
- **Sesión 18 (Fase 4 cierre + Fase 5 inicio):** Verificación de dominio
  desbloqueada (era bug de Opera). Nueva feature archivar/eliminar pedidos.
  `"type": "module"` + eliminado supabase.js duplicado.
- **Sesión 19 (Bugfixes UX):** Fix WhatsApp en iOS post-checkout (patrón
  pre-open) + fix CSS legacy del header en producto.html.
- **Sesión 20 (UX masiva producto.html):** Galería con autoplay, zoom,
  swipe, lazy-loading inteligente, política Garantía 60d/Cambios 7d separadas,
  comparativa Founder vs tradicional, fotos del carrito centralizadas en
  cart.js, sección de reseñas con carrusel mobile, Schema.org Product +
  Open Graph dinámico, sticky CTA mobile+desktop coordinado con burbuja
  WhatsApp via 2 clases independientes en body, fix bug touch iOS Safari,
  botón Compartir WhatsApp, revisión completa con 5 bugs encontrados.
- **Sesión 21 (Stock bajo + perf inicial + WCAG):** Tres bloques cerrados.
  Feature `stock_bajo` con columna nueva. Optimizaciones de carga inicial
  (skeletons, fetchpriority, preconnect). Fixes WCAG. PageSpeed 94/100.
- **Sesión 22 (Mercado Pago + Email + Toasts UX):** Tres bloques grandes.
  (1) **Mercado Pago Checkout Pro integrado end-to-end** vía API REST
  directa (sin SDK), módulo `api/_lib/mercadopago.js` + endpoint
  `api/mp-webhook.js` con HMAC-SHA256, frontend con redirect + manejo
  de retorno (success/pending/failure), 3 columnas nuevas en `orders`
  + estado nuevo `'Pago rechazado'`. **Smoke test parcial OK**, tests
  reales bloqueados por acceso a cuenta MP de la esposa. (2) **Email
  transaccional con Resend**: dominio `founder.uy` verificado vía
  integración Vercel (DNS automáticos), módulo `email.js` + 3 templates
  HTML profesionales (`email-templates.js`) con paleta del sitio,
  disparo desde `checkout.js` (transfer) y `mp-webhook.js` (MP
  approved/pending). Botón "Ver estado del pedido" en los 3 emails con
  auto-tracking por URL. Textos contextuales según envío/retiro.
  Validado en producción (transferencia: email llega OK). (3) **Sistema
  de variantes en toasts**: verde para acciones positivas (agregar al
  carrito), rojo para destructivas (eliminar) y errores de validación
  (checkout). 18 llamadas a `showToast` clasificadas. Toast nuevo "✕
  Founder X removido del carrito" en eliminación (antes era silenciosa).
- **Sesión 23 (MP en producción real validado):** debug extenso de HMAC
  (data.id viene del query param, no del body, con `.toLowerCase()`),
  confusión TEST vs PROD en credenciales (ambas con `APP_USR-` prefix
  desde 2024). **Pago real con tarjeta real validado end-to-end**:
  webhook 200 OK, email transaccional automático llegado, estado
  correcto en admin. Sitio oficialmente operativo en e-commerce
  profesional completo.
- **Sesión 24 (Cloudinary CDN + lección de fonts):** migración de
  imágenes a Cloudinary fetch mode (sin tocar DB de Supabase). Page
  weight -92% (3,5 MB → 290 KB). 21 puntos de render envueltos en 11
  archivos. 6 presets responsive (`card`, `gallery`, `hero`, `thumb`,
  `modal`, `og`). **Intento fallido:** optimización de Google Fonts
  con `preload+onload` causó regresión grave (-26 score desktop) por
  reflow tardío en sitios con CSS inline grande. Revertido vía Vercel
  Promote. El código fallido quedó en `main` de GitHub pendiente para
  Sesión 25.
- **Sesión 25 (7 entregas: fonts + imágenes + LQIP + scroll-reveal + DMARC + emails de estado):**
  re-intento exitoso de fonts con `font-display: optional` y unificación
  de cadena en 9 HTMLs (TBT mobile -47%); bug latente de Montserrat 700
  sintetizado arreglado de paso. Preset `hero` actualizado para 4K +
  preset nuevo `gallery_thumb` con srcset responsive (miniaturas no más
  pixeladas). LQIP en banner del hero con crossfade premium garantizado
  de 300ms (Stripe-style). Componente nuevo `components/scroll-reveal.js`
  (~2 KB, sin librerías) con 3 clases (`reveal`, `reveal-up`,
  `reveal-stagger`) aplicado en 6 HTMLs públicos; refactor: eliminado
  observer artesanal del index. DMARC publicado con `p=none` + reportes
  a `founder.uy@gmail.com`. **Emails automáticos al cambiar estado del
  pedido**: 5 templates (Confirmado, En preparación, En camino, Listo
  para retirar, Entregado) con foto del producto via Cloudinary lookup,
  texto contextual envío/retiro, tracking opcional. Disparados desde
  `handleUpdateOrderStatus` con detección de transición y fire-and-forget
  con timeout 3500ms. Descubrimiento: `info@founder.uy` no es inbox
  real (Resend solo envía); pendiente para Sesión 26 resolver con
  forwarder o Google Workspace. ← **Acá terminamos.**
- **Sesión 26:** ✅ Cerrada con combo A + C completo. **Bloque A:**
  ImprovMX configurado (3 DNS records en Vercel — 2 MX + 1 SPF), test
  end-to-end OK. **Bloque C:** robots.txt + sitemap.xml dinámico
  (endpoint `/api/sitemap.js` lee productos de Supabase, cache 1h,
  9 URLs descubiertas), Schema.org Store expandido con sameAs Instagram
  + Facebook, meta tags completas en 5 páginas estáticas + checkout,
  og-image.jpg 1200×630 generada via Canva MCP, Google Search Console
  verificado vía TXT y sitemap enviado con estado "Correcto". Decisión
  arquitectural clave: **NO mover DNS a Cloudflare** (hubiera roto
  Resend/Meta/DMARC) — usar ImprovMX en Vercel actual. ← **Acá terminamos.**
- **Sesión 27 (UX carrito + incidente Node 20 + planificación personalización):**
  Tres bloques. (1) **Ajustes UX en carrito mobile**: drawer al 85% en vez de
  100% + botón "CARRITO" rectangular reemplazado por ícono SVG silueta de
  bolsa de compras (8 archivos modificados, HTML del botón centralizado en
  `header.js`). (2) **Incidente crítico**: admin caído con 500
  `FUNCTION_INVOCATION_FAILED`. Doble causa diagnosticada: archivo
  `meta-capi.js` duplicado en `api/` (suelto) Y `api/_lib/` desde hacía 2
  semanas + Supabase nuevo (^2.45.4 → 2.50+) que requiere WebSocket nativo
  (Node 22+). Vercel cacheaba builds viejos por eso recién explotó al hacer
  build limpio. **Fix:** borrar duplicado + cambiar `package.json` `"node":
  "20.x"` → `"node": "22.x"`. **Lección crítica:** `^x.y.z` en deps puede
  explotar cuando una nueva versión cambia requirements de runtime. (3)
  **Planificación completa de feature de personalización láser**: documento
  `PLAN-PERSONALIZACION.md` v2 con 18 decisiones cerradas, arquitectura
  técnica, plan en 4 sesiones (A: visual + admin / B: backend + galería /
  C: limpieza + admin polish / D: emails + smoke test). Pendiente arrancar
  **Sesión A** después de tener el láser físico operativo. ← **Acá terminamos.**
- **Sesión 28:** Si el usuario tiene el láser físico y testeó → arrancar
  **Sesión A** del feature de personalización (frontend visual + admin
  config global, ~2-2.5 hs). Si no, alguna de las opciones pendientes de
  Sesión 26 (B reseñas reales, D limpieza, E Gmail send-as, F Search
  Console). ← **Próxima.**

---

**FIN — Cierre Sesión 27.** Sesión mixta con tres bloques: UX carrito,
incidente crítico resuelto, y planificación profunda del feature de
personalización láser.

**Lo más relevante para recordar:** el incidente del admin reveló que
el proyecto tenía un archivo duplicado dormido desde hacía 2 semanas
y una incompatibilidad latente Node 20 + Supabase nuevo. Ambos
estaban "funcionando por suerte" hasta que un build limpio los
expuso. **Lección documentada:** versionar deps con `~` o pinning
exacto en producción, y NUNCA asumir que "si funcionaba ayer, está
bien".

**Estado del sitio post-Sesión 27:**
- ✅ Performance excelente (95-99 desktop, 85-90 mobile)
- ✅ Email transaccional + bidireccional (`info@founder.uy` operativo)
- ✅ Base SEO universal completa (sitemap, robots, schema, meta tags, og-image)
- ✅ Google Search Console verificado e indexando
- ✅ Tracking Meta funcional con CAPI deduplicado
- ✅ Mercado Pago en producción real
- ✅ Emails automáticos al cambiar estado del pedido
- ✅ **Backend estabilizado** (Node 22 + sin archivos duplicados)
- ✅ **UX del carrito mobile mejorada** (ícono + 85%)
- 📋 **Plan completo de personalización láser documentado** (`PLAN-PERSONALIZACION.md` v2)

**Próximo gran bloque:** feature de personalización láser. Pendiente
de arrancar cuando el usuario tenga el láser físicamente y haya hecho
1-2 pruebas con cuero descartable para calibrar valores tentativos.
Estimación: 4 sesiones de trabajo (~7-9 hs total).

Sesión 28 va a ser corta o larga según qué decida el usuario y si
ya tiene el láser disponible. 🚀


