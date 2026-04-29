# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 24 — cierre EXITOSO con aprendizaje (28/04/2026)
**Próxima sesión:** 25 — Continuación de optimización de performance. Sitio con imágenes optimizadas vía Cloudinary CDN (ahorro 92% medido). Score actual: 85 mobile / 98 desktop. Pendiente clave de Sesión 25: optimización de Google Fonts (intento fallido en Sesión 24, ver lección documentada). Pendientes secundarios: limpiar pedidos prueba, datos bancarios reales para email transferencia, primera campaña Meta Ads.

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

## 🚀 Para iniciar el chat siguiente (Sesión 25)

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y retomamos después de Sesión 24. La Sesión 24 cerró
> con éxito principal: migración de imágenes a Cloudinary CDN en fetch
> mode (21 puntos de render, 6 presets responsive, ahorro 92% en page
> weight). Score Lighthouse mobile 85-90 / desktop 95-99. Cuenta
> Cloudinary `founder-uy` plan Free configurada con fetch desde Supabase
> autorizado. Limpieza de fotos legacy en Drive completada (todas las
> URLs `googleusercontent.com` removidas, sitio sigue funcionando OK).
> **PERO la sesión también tuvo un intento fallido**: optimización de
> Google Fonts (preload+onload) causó regresión grave (-26 puntos
> desktop) y fue revertido vía Vercel rollback. **El código fallido sigue
> en main de GitHub** — primer pendiente urgente de Sesión 25 es
> resincronizar GitHub (revertir el commit "perf: carga no-bloqueante
> de Google Fonts"). Después: re-intentar optimización de fonts con
> técnica diferente (auto-host / font-display: optional / etc), limpieza
> de pedidos prueba (NO borrar F203641 — Florencia Risso), datos
> bancarios reales para email transferencia, primera campaña Meta Ads.

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
| **12** — Optimización de Google Fonts | 🔴 Intentada y revertida | Sesión 24 intentó `preload+onload` y causó regresión (-26 score desktop). Rollback vía Vercel. Pendiente: re-intentar con técnica diferente + resincronizar GitHub con producción. Para Sesión 25 |

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
├── index.html                     ✅ (Sesión 22: toasts con variantes verde/rojo)
├── producto.html                  ✅ (2446 líneas — Sesión 22: toasts variantes + toast eliminar)
├── checkout.html                  ✅ (Sesión 22: CSS variantes toast)
├── seguimiento.html               ✅
├── admin.html                     ✅ (Sesión 22: filtro Pago rechazado)
├── contacto.html                  ✅
├── sobre-nosotros.html            ✅
├── envios.html                    ✅
├── tecnologia-rfid.html           ✅
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅
│   ├── cart.js                    ✅
│   ├── supabase-client.js         ✅
│   ├── meta-pixel.js              ✅
│   ├── founder-checkout.js        ✅ (~910 líneas — Sesión 22: MP redirect/return + toasts variantes)
│   ├── founder-seguimiento.js     ✅
│   └── founder-admin.js           ✅ (~1769 líneas — Sesión 22: estado Pago rechazado)
├── api/
│   ├── _lib/
│   │   ├── supabase.js            ✅
│   │   ├── meta-capi.js           ✅
│   │   ├── mercadopago.js         ✅ (Sesión 22: NUEVO — wrapper REST API MP)
│   │   ├── email.js               ✅ (Sesión 22: NUEVO — wrapper Resend)
│   │   └── email-templates.js     ✅ (Sesión 22: NUEVO — 3 templates HTML)
│   ├── checkout.js                ✅ (Sesión 22: bifurcación MP + email transfer paralelo)
│   ├── seguimiento.js             ✅
│   ├── admin.js                   ✅
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
| **Email remitente** | `info@founder.uy` (Sesión 22) |
| Pedido de prueba histórico | `F910752` / `test@prueba.com` / Confort Negro / $2.490 |
| ⚠️ NO BORRAR | Pedido `F203641` / Florencia Risso / `florenciar.1196@gmail.com` (cliente real) |

---

## 📋 Pendientes para Sesión 23

### 🔥 Prioridad alta — bloqueado por acceso a MP de la esposa
1. **Tests reales con tarjetas de prueba de MP** (Test 1: aprobado, Test 2:
   rechazado, Test 3: pendiente). Validar:
   - Webhook actualiza correctamente el estado en Supabase.
   - Email "Recibimos tu pago" llega cuando aprueba.
   - Email "Tu pedido está esperando el pago" llega cuando es pending.
   - CAPI Purchase se dispara solo cuando aprueba (Meta deduplica con
     event_id = numero).
   - Estado `'Pago rechazado'` aparece en admin cuando MP rechaza.
2. **Cambiar a credenciales de PRODUCCIÓN de MP** (`APP_USR-...` en lugar
   de `TEST-...`). Requiere:
   - Activar credenciales productivas en panel MP.
   - Reemplazar `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en Vercel con
     los valores prod.
   - Redeploy en Vercel.
   - Validación: pago real chico (ej $100) con tarjeta propia para
     confirmar que todo funciona en modo productivo.

### 🟡 Prioridad media — definición pendiente del usuario
3. **Datos bancarios reales en email de transferencia**. El template
   actual dice "Te enviamos los datos por WhatsApp". Cuando se definan
   (banco, tipo de cuenta, CBU, titular), agregar bloque con datos
   directos en el email para que el cliente no tenga que pedirlos.
4. **Decisión sobre el modal de index.html**. Postergada de Sesión 22.
   Usuario quería evaluar si conviene eliminarlo y redirigir directo a
   `producto.html`, o rediseñar con 2 CTAs equivalentes. Decisión: dejar
   como está, revisar "en un tiempo" — idealmente cuando arranquen
   campañas pagas y haya datos de comportamiento real.

### 🟢 Prioridad baja — pulido
5. **DMARC en DNS** (Resend lo recomienda pero no es obligatorio).
   Mejorar entregabilidad de emails. Agregar registro `_dmarc` con
   política `p=none` inicialmente.
6. **Primera campaña paga de Meta Ads** con optimización de Purchase.
   Todo listo desde Sesión 17-18. Definir presupuesto, producto,
   audiencia.
7. **Limpieza de pedidos de prueba acumulados** (5 min desde admin):
   - `F237553`, `F839362`, `F029945` — Evandro Segovia con CIs random.
   - `F264440`, `F515156` — pedidos de prueba.
   - `F378204` — test CAPI.
   - **+ pedidos nuevos generados durante Sesión 22 testing**.
   - ⚠️ **NO BORRAR**: `F203641` — Florencia Risso (cliente real).
8. **Pendientes Meta Business** (3 clics en Chrome):
   - Renombrar dataset "NO" (ID `1472474751248750`) con prefijo `ZZ-`.
   - Renombrar/ignorar Ad Account `26140748312219895`.
   - Agregar email de contacto al Instagram.
9. **Drop columna `products.banner_url`** (legacy desde Sesión 21).
   `ALTER TABLE products DROP COLUMN banner_url;`

### 🔵 Direcciones nuevas (a discutir)
- **Email de cambios de estado del admin**: cuando el admin cambia un
  pedido a "En preparación", "En camino", "Entregado", mandar email
  automático al cliente. Requiere modificar `api/admin.js` action
  `update_order_status` para disparar email según el estado destino.
- **Mejoras UX en otras páginas**: `index.html`, `contacto.html`,
  `sobre-nosotros.html`. Consistencia con el polish de `producto.html`.
- **Sistema de reseñas reales**: cuando haya clientes con compras
  validadas — reemplazar las 4 reseñas mock de Sesión 20.

### Optimizaciones de performance restantes (NO urgentes — score actual 94)
- **Imágenes en formatos modernos (WebP/AVIF)**: ahorro 5-6 MB en mobile.
  Requiere Supabase Pro ($25/mes) o CDN externo. Solo evaluar si campañas
  pagas muestran CR bajo en mobile.
- **Fuentes Google no bloqueantes**: ahorro 1.930 ms. Tocar 9 HTMLs.
  Score actual ya es 94 → ganancia marginal.
- **Cache headers en Supabase Storage**.
- **Reducir 34 KB de JS sin usar**.

---

## 📜 Historial de incidentes resueltos

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
  ← **Acá terminamos.**
- **Sesión 23:** Cerrar tests reales de Mercado Pago con tarjetas de prueba
  (necesita acceso a cuenta MP de la esposa). Después: definir datos
  bancarios reales, primera campaña paga Meta, decisión sobre modal de
  index.html. ← **Próxima.**

---

**FIN** — Cerramos Sesión 24. **Sesión con éxito principal y un aprendizaje
documentado.** Sobre la base de Sesión 23 (e-commerce profesional con MP en
producción real), Sesión 24 sumó la **migración de imágenes a Cloudinary
CDN en fetch mode**: page weight bajó de ~3,5 MB a ~290 KB (-92%), todas
las imágenes ahora se sirven en formatos modernos AVIF/WebP con tamaños
responsive según dispositivo, sin tocar la base de datos de Supabase.
Score Lighthouse: 85-90 mobile / 95-99 desktop con variación natural.
**También tuvo un intento fallido:** optimización de Google Fonts con
preload+onload causó regresión y fue revertida en producción vía Vercel
rollback (deploy anterior promovido). El código de la optimización fallida
sigue en `main` de GitHub — pendiente urgente de Sesión 25 es
resincronizar GitHub con producción antes de cualquier deploy nuevo.
**Lección importante:** en sitios con CSS inline grande (como este), las
técnicas de carga no-bloqueante de fonts pueden empeorar Speed Index por
reflow. Próxima vez, probar auto-host de fuentes o `font-display: optional`.
**El sitio quedó listo para arrancar campañas Meta Ads** con LCP optimizado.
La pieza arquitectural de Cloudinary (fetch mode) garantiza rollback
instantáneo y heredabilidad automática para todas las imágenes futuras
que se suban desde el admin. 🚀
