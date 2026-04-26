# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 20 — cierre (26/04/2026)
**Próxima sesión:** 21 — Definir prioridades tras la gran cantidad de mejoras UX cerradas en Sesión 20. Posibles caminos: cerrar pendientes menores de Meta, evaluar primera campaña paga, agregar features admin (campo `stock_bajo` en producto), o trabajar otras páginas (index.html / contacto / etc).

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y retomamos después de Sesión 20. La Sesión 20 fue muy
> larga y ahí cerramos un paquete enorme de mejoras UX en `producto.html`
> (galería con autoplay/zoom/swipe, sección comparativa, reseñas con
> carrusel mobile, SEO dinámico, sticky CTA mobile+desktop coordinado con
> burbuja WhatsApp, fix touch iOS, política garantía/cambios separadas en
> 5 archivos, fotos del carrito en todas las páginas). Ver sección
> "Lo que quedó funcionando en Sesión 20" para todo el detalle. Para
> Sesión 21, decime opciones según los pendientes que quedan abiertos:
> Meta, ads, admin (campo stock_bajo), o trabajar otras páginas.

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

---

## ✅ Lo que quedó funcionando en Sesión 20

Sesión muy larga centrada en **producto.html**. Se abordaron múltiples bloques
de mejoras UX, todas validadas en producción por el usuario. El archivo pasó
de ~1394 líneas a 2422 líneas (+1028) sumando galería interactiva, sección
comparativa, sección de reseñas con carrusel mobile, SEO dinámico, sticky CTA
inteligente, integración con burbuja WhatsApp, y un fix crítico de iOS.

### 🎨 Bloque 1 — Galería de fotos producto.html (5 mejoras)

#### 1. Ajuste de imagen principal desktop (Opción A aplicada)
- `.product-main`: `padding-top` de `40px` a `20px`.
- `.gallery`: `top` sticky de `70px` a `76px`.
- Resultado: thumbnails respiran mejor en laptops 13-14". Usuario validó OK.

#### 2. Autoplay del carrusel de fotos
- Constante `AUTOPLAY` con `INTERVAL_MS: 4000`, `PAUSE_AFTER_CLICK: 12000`,
  `MAX_CYCLES: 3`.
- Funciones nuevas: `startPhotoAutoplay`, `stopPhotoAutoplay`,
  `pausePhotoAutoplay`, `advancePhotoAutoplay`, `bindAutoplayEvents`,
  `prefersReducedMotion`.
- Pausa hover desktop, pausa 12s click manual, reset al cambiar color, respeta
  `prefers-reduced-motion`, Page Visibility API, para tras 3 ciclos.

#### 3. Zoom hover desktop
- `transform: scale(1.5)` (originalmente 2x, bajado a pedido del usuario).
- `transform-origin` dinámico siguiendo cursor con `requestAnimationFrame`
  para batchear paints a 1 por frame.
- Solo aplica en `@media (min-width: 901px)` — mobile usa pinch nativo.
- Función `bindZoomEvents()` engancha listeners una sola vez.

#### 4. Swipe touch mobile + flechas laterales
- Touch listeners passive sobre `.gallery__main`.
- Flechas circulares 32x32px (achicadas de 44px) con corrección óptica
  del span interno (translateY -1px, translateX ±1px).
- Funciones: `goToPrevPhoto`, `goToNextPhoto`, `currentPhotoCount`,
  `updateArrowsVisibility`.

#### 5. Lazy-loading inteligente
- Foto activa: `loading="eager"` + `fetchpriority="high"`.
- Fotos no activas: `loading="lazy"` + `fetchpriority="low"`.
- `preloadFirstPhotoOfEachColor()` con `requestIdleCallback` (fallback
  `setTimeout 800ms` para Safari iOS antiguo).

### 📱 Bloque 2 — Mobile UX (3 ajustes)
- Specs en 2 columnas (3+3) en mobile, gap 14px 12px.
- Tabs sin scroll horizontal: `flex: 1`, padding 14px 8px, font-size 9px.
- Espacio vacío reducido: `.product-info` padding-bottom 80→40px,
  `.details-section` 60→32px.

### 🛡️ Bloque 3 — Política Garantía 60d vs Cambios 7d (5 archivos)
**Decisión clave:** separadas en 2 políticas distintas (corrigió error de
unificación previa).
- **Cambios 7 días, sin uso** (devolución por arrepentimiento).
- **Garantía 60 días por defectos de fábrica** (NO cubre mal uso, desgaste,
  accidentes).

Archivos modificados con consistencia exacta:
- `producto.html`: trust-badge "Garantía 60 días" con ✅ verde (cambiado de
  🔒 al final de la sesión); 2 spec-cells separadas en tab Envíos.
- `components/footer.js` + `checkout.html`: modal legal con 3 secciones.
- `envios.html`: 2 info-cards separadas (Cambios + Garantía de fábrica).
- `sobre-nosotros.html`: ítem combinado "Cambios y garantía".

### 📊 Bloque 4 — Tabla comparativa Founder vs billetera tradicional
- 8 puntos comparativos.
- Item "Organización" con ✓ en ambas columnas (credibilidad — no decimos que
  somos mejores en todo).
- Variables CSS `--color-success` y `--color-muted`.
- Tras feedback: max-width 880→720px, padding celdas 20→12px, íconos 28→24px
  para hacer la sección más compacta.

### 🛒 Bloque 5 — Fotos del carrito en todas las páginas
**Decisión clave:** centralizado en `cart.js` (no duplicado en cada página).

Cambios en `cart.js`:
- `photoMap` privado, carga idempotente con `ensurePhotoMap()`.
- Helper `window.founderCart.getPhotoUrl(name, color)`.
- Evento custom `founder-cart-photos-ready` para auto-update cuando llegan fotos.
- Integrado en `bootPage()`.

5 páginas modificadas con render condicional + onerror fallback al placeholder
+ listener del evento. Casos especiales:
- `contacto.html`: agregado `ensurePhotoMap()` manual (no usaba bootPage).
- `sobre-nosotros.html`: agregada regla CSS `.cart-item__img` que faltaba.

### 🎯 Bloque 6 — 9 mejoras finales en producto.html

#### 1. Sticky CTA mobile + desktop coordinado
- Mismo `<div id="stickyBtnWrap">` para ambos viewports.
- Mobile: barra completa abajo con `padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px))`
  para respetar el notch del iPhone.
- Desktop: tarjeta abajo-derecha con `min-width: 320px; max-width: 480px`,
  `padding: 20px` interno, botón con `padding: 20px` idéntico al inline.
- IntersectionObserver del botón inline activa `.is-active` cuando inline sale
  del viewport.
- IntersectionObserver del footer activa `.is-hidden` cuando footer entra.

#### 2. Lógica de stock bajo (preparada, no visible hoy)
- Flag opcional `<color>_stock_bajo: true` en `extras.colores_estado` (admin).
- Función `getColorEstado` extendida para devolver `stockBajo`.
- Aviso dorado discreto "⏳ Pocas unidades disponibles" oculto por default.
- Listo para activar desde admin sin cambios de código.

#### 3. Texto de seguridad bajo el botón
- "🔒 Compra protegida · Pago seguro" (originalmente tenía también "Garantía
  60 días" pero se quitó tras detectar redundancia con el trust-badge).

#### 4. Confirmación visual al agregar al carrito
- `pulseAddButtons()` cambia el botón a verde + "✓ Agregado al carrito" 2s.
- Funciona en inline + sticky simultáneamente.
- Usa `dataset._orig` para guardar texto original (idempotente).

#### 5. Política de envío en 2 líneas
- "🚚 Envío $X UYU" / "Envío gratis"
- "📅 Recibís en 1 a 3 días hábiles"

#### 6. ~~FAQ~~ — saltado por decisión del usuario.

#### 7. Reseñas con uruguayos inventados + carrusel mobile
- 4 cards: Martín Rodríguez (Mvd), Lucía Fernández (PdE), Diego Pereira (Salto),
  Sofía Méndez (Maldonado).
- Desktop: grilla de 4 columnas.
- Mobile: carrusel autoplay 4s con flechas + dots dorados, pausa 12s al click
  manual, mismo patrón que carrusel de fotos.
- Funciones: `setActiveReview`, `goToPrevReview`, `goToNextReview`,
  `bindReviewsCarousel`, `start/stop/advanceReviewsAutoplay`.
- Constante `REVIEWS_AUTOPLAY` con mismos parámetros que fotos.
- Listener resize con debounce 200ms — si pasa a desktop, parar autoplay; si
  pasa a mobile, arrancar.

#### 8. Schema.org Product (JSON-LD)
- Función `injectProductSchema(p)` inyecta `<script type="application/ld+json"
  id="product-schema">` con name/description/brand/sku/image/offers
  (priceCurrency: UYU, availability: InStock).
- Idempotente: busca el script existente antes de crear nuevo.

#### 9. Open Graph + Twitter Card dinámicos
- Función `injectOpenGraph(p)` setea `og:type/title/description/url/site_name/image`
  + Twitter Card + canonical link + `document.title`.
- Helper `setMeta()` interno: crea o actualiza meta tags por selector.

#### 10. Botón "Compartir" cerca del precio
- Mensaje pre-armado: "Mirá esta billetera Founder X 👇 [URL]".
- `shareOnWhatsApp()` con `window.open(waUrl, '_blank', 'noopener')`.
- Iteraciones de posición:
  1. Inicialmente al lado del precio (con SVG WhatsApp + texto "Compartir por
     WhatsApp"). Look discreto outline gris.
  2. Movido a fila propia arriba del CTA, alineado a la derecha.
  3. Combinado en flex horizontal con la info de envío para eliminar espacio
     muerto vertical (versión final).

### 🔧 Bloque 7 — Coordinación burbuja WhatsApp + sticky CTA

**Problema:** la burbuja de WhatsApp (esquina inferior derecha) se superponía
con el sticky CTA cuando ambos estaban visibles.

**Solución arquitectural:** 2 clases independientes en `<body>`:
- `.has-sticky-cta` → eleva la burbuja
- `.footer-visible` → oculta burbuja + sticky con fade

```css
body.has-sticky-cta .wa-bubble {
  bottom: calc(88px + env(safe-area-inset-bottom, 0px));
}
@media (min-width: 901px) {
  body.has-sticky-cta .wa-bubble { bottom: 130px; }
}
body.footer-visible .wa-bubble { opacity: 0; pointer-events: none; }
```

**Bug detectado y arreglado al cierre:** cuando el usuario volvía del footer
hacia arriba, el sticky reaparecía con `.is-active` pero el body ya no tenía
`.has-sticky-cta` (la había removido al entrar al footer). Resultado:
superposición temporal hasta que el inline reentrara al viewport. Fix: en el
footer observer, cuando `footerVisible=false` Y `wrap.classList.contains('is-active')`,
agregar `.has-sticky-cta` al body de nuevo.

### 🐛 Bloque 8 — Fix bug touch iOS Safari

**Síntoma reportado:** al tocar la foto del producto y luego intentar
scrollear, la página se trababa o se movía lateralmente. Bug solo en iOS.

**Causa raíz:** los handlers de swipe usaban `passive: true` sin
`touch-action` CSS. Safari iOS scrolleaba lateralmente la página entera al
hacer swipe horizontal, y a veces el `touchend` no llegaba dejando el estado
"trancado".

**Solución multi-capa:**

1. **CSS:** `touch-action: pan-y` en `.gallery__main`. Le dice al navegador
   "este elemento solo permite scroll vertical nativo". El swipe horizontal
   queda bloqueado a nivel sistema → no más rebote lateral.

2. **JS:** reescritura de `bindSwipeEvents` con detección temprana de
   dirección vía `touchmove`. Ahora hay 4 listeners coordinados:
   - `touchstart`: registra inicio + activa timeout de seguridad (500ms).
   - `touchmove`: clasifica dirección apenas el gesto supera 10px en
     cualquier eje. La dirección se decide UNA vez y se queda fija.
   - `touchend`: solo dispara cambio de foto si el gesto fue claramente
     horizontal (>50px) y la dirección quedó como `'horizontal'`.
   - `touchcancel`: resetea estado si iOS interrumpe (llamada,
     notificación, etc).

3. **Reset de seguridad por timeout:** si por algún motivo el `touchend` no
   llega, a los 500ms se limpia el estado automáticamente. Previene que la
   página se quede "trancada".

4. **Estado interno con flag `active`:** coordinó los 4 handlers, así no
   quedan estados zombies de touches anteriores.

### 🧹 Bloque 9 — Revisión completa de código (cierre Sesión 20)

Antes de cerrar, se hizo una auditoría exhaustiva de `producto.html`:

#### Bugs encontrados y arreglados durante la auditoría
1. **`</div>` huérfano al final del archivo**: cierre suelto entre `</script>`
   y `</body>`. No causaba problema visible (navegador es indulgente) pero
   violaba estructura HTML. **Arreglado.**
2. **Variable JS muerta `priceRow`** en `selectColor`: declaraba
   `const priceRow = $('productPriceRow')` pero el ID nunca existió ni se
   usaba. **Arreglado.**
3. **Selector CSS muerto `.sticky-add-btn:active`**: regla `:active` que
   apuntaba a una clase inexistente. La clase real es `.purchase__add-btn`.
   **Arreglado.**
4. **Código duplicado en `injectOpenGraph`**: destructuring `const [, prop] = ...`
   redundante con `const m = ...` siguiente. **Arreglado.**
5. **Scrollbar fantasma en tabs desktop**: `.tabs { overflow-x: auto }`
   provocaba que algunos navegadores Windows reservaran espacio para
   scrollbar inexistente. **Arreglado** quitando `overflow-x: auto` (los 3
   tabs entran perfectamente sin scroll).

#### Validaciones que pasaron
- ✅ Sintaxis JS (`node --check`): cero errores.
- ✅ Balance de tags HTML: todos balanceados (body, section, div, button,
  script, style, article).
- ✅ IDs únicos: 44 declarados, 0 duplicados.
- ✅ Referencias JS → DOM: todas las funciones `getElementById` apuntan a
  IDs existentes (estáticos o creados dinámicamente).
- ✅ Funciones JS sin uso: 58 funciones declaradas, todas con al menos una
  invocación.
- ✅ Carruseles (fotos + reviews): 16 funciones + 8 fields del state, todos
  coherentes.
- ✅ Sticky CTA + burbuja WA: lógica de `has-sticky-cta` y `footer-visible`
  coordinada correctamente.
- ✅ SEO: Schema.org Product + Open Graph + Twitter Card + canonical, todos
  inyectados al cargar el producto.
- ✅ Performance: 2 setInterval ↔ 2 clearInterval, 1 resize listener
  debounceado, 2 IntersectionObservers limpios.
- ✅ Garantía 60d vs Cambios 7d: separadas y consistentes.

### Iteraciones de UI registradas durante la sesión

Para evitar volver a discutir decisiones ya tomadas:

- **Burbuja WhatsApp + sticky CTA:** el problema costó 4 iteraciones hasta
  resolverse. Lección clave: las superposiciones en mobile requieren tener
  en cuenta `env(safe-area-inset-bottom)` para iPhones modernos.
- **Tamaño botón sticky desktop:** decisión final = idéntico al inline
  (`padding: 20px`, font-size 11px, no más chico). Wrap con `min-width: 320px;
  max-width: 480px`.
- **Texto de seguridad bajo botón:** decisión final = "🔒 Compra protegida ·
  Pago seguro" (sin "Garantía 60 días" para no repetir el trust-badge).
- **Trust-badge garantía:** ícono ✅ verde (no 🔒 candado).
- **Botón Compartir:** outline gris discreto (no verde sólido WhatsApp). Texto
  solo "Compartir". Posición final: en la misma fila que el shipping note
  (flex horizontal, shipping a izquierda + botón a derecha).
- **Reseñas mobile:** carrusel con flechas + dots + autoplay 4s + pausa 12s
  click manual (mismo patrón que fotos).
- **Sticky mobile:** barra completa abajo (no tarjeta compacta).

### Validaciones automatizadas durante la sesión

A lo largo de las ~30 iteraciones de cambios:
- `node --check` extrayendo el JS inline con awk → ejecutado >25 veces.
- Conteos de funciones (def vs invocaciones) con grep → >15 veces.
- Verificación de IDs únicos → al cierre.
- Balance de tags HTML → al cierre (encontró el `</div>` huérfano).
- Análisis de clases CSS huérfanas → al cierre (encontró `.sticky-add-btn`).

### Deploys a producción

Múltiples commits durante la sesión, todos validados manualmente por el
usuario en producción tras cada deploy (~1-2 min en Vercel). El usuario
confirmó cada feature antes de pasar a la siguiente.

---

## ✅ Lo que quedó funcionando en Sesión 19

Sesión corta, enfocada en dos bugs reportados por el usuario tras el uso real
del sitio: **WhatsApp no abría automáticamente en iOS tras finalizar compra
por transferencia** y **el header de `producto.html` estaba visualmente roto**
(menú central sin estilos). Ambos resueltos con cambios limpios y modulares,
sin parches.

### 🐛 Fix 1 — WhatsApp automático en iOS post-checkout

**Causa raíz:** Safari iOS bloquea `window.open('url', '_blank')` si se llama
después de un `await` (pierde el "gesto de usuario" que autoriza popups).
En Chrome/Android no pasa. El flujo actual hacía `await apiCheckout(...)` y
luego `window.open(wa.me/...)` — el await tarda 1-3s → iOS bloqueaba.

**Solución:** patrón **pre-open + fallback** en `components/founder-checkout.js`:

- Nuevo helper modular con 3 funciones:
  - `preOpenWhatsAppTab()` → abre `about:blank` como placeholder ANTES del await.
  - `openWhatsApp(tab, url)` → asigna la URL a la pestaña pre-abierta. Fallback
    a `window.open` directo y finalmente a `window.location.href` si todo falla.
  - `closeWhatsAppTab(tab)` → cierra el placeholder si el pedido falla.
- `processOrder()`:
  - Llama a `preOpenWhatsAppTab()` al arrancar (dentro del tap del usuario).
  - 8 puntos de limpieza con `closeWhatsAppTab(waTab)` en los 7 returns de
    validación + 2 returns post-fetch (error de red, error de API).
  - En el happy path: `openWhatsApp(waTab, waUrl)` reemplaza al `window.open`.
- `reenviarPedido()` **no tocada** (no tiene `await` antes del `window.open`,
  funciona bien tal cual — principio: no refactorizar sin motivo).

### 🐛 Fix 2 — CSS del header roto en `producto.html`

**Causa raíz:** desfasaje de nomenclatura. `components/header.js` inyecta HTML
con clases BEM nuevas (`.nav`, `.nav__link`), pero el CSS de `producto.html`
se quedó con las viejas (`.header__nav`, `.header__nav-link`, `.header__back`,
`.header__right`). Las otras 8 páginas ya habían sido migradas en sesiones
anteriores — solo `producto.html` quedó desfasada. Resultado visible: el menú
central se renderizaba como texto plano sin espaciado ni tipografía correcta.

**Solución:** alineación con `index.html` como fuente de verdad.

- Reemplazado el bloque `/* SHARED — Header */` de `producto.html` con el
  mismo CSS que usa `index.html` (verificado con diff).
- Eliminadas selectores legacy inutilizados: `.header__back:active` del bloque
  de `:active` unificado.
- Eliminada `.header__nav-link`, `.header__right`, `.header__back` (ninguna
  usada en HTML — solo CSS muerto).
- Actualizada la regla responsive: `@media (max-width: 900px) { .nav { display: none; } }`
  reemplaza a `.header__nav { display: none; }`.

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
- La metaetiqueta se insertó en el `<head>` de **los 9 HTML del sitio**.
- Resultado: Meta confirmó **"Verified"** tras clic en "Verify domain".

**Impacto:** desbloquea AEM (Aggregated Event Measurement) para optimización de
eventos en iOS 14.5+ cuando se arranquen campañas pagas.

### 🆕 Feature — Sistema archivar/eliminar pedidos (Fase 5)

**Arquitectura:** soft delete reversible + hard delete con doble confirmación.

#### Cambios en Supabase
- Nueva columna `archivado boolean not null default false` en `orders`.
- Índice parcial `orders_archivado_idx on orders (archivado) where archivado = false`.

#### `api/admin.js` — 3 actions nuevas
- `archive_order` — soft delete (update `archivado=true`), reversible.
- `unarchive_order` — restaurar.
- `delete_order` — DELETE definitivo. Requiere `body.confirm === true`.
- `list_orders` extendido con `body.include_archived` (`'only'`/`'all'`/default).

#### `components/founder-admin.js` — vista archivados + 3 funciones
- `state.currentView = 'active' | 'archived'`.
- Botones condicionales por vista (Archivar/Eliminar en activos vs Desarchivar/Eliminar en archivados).
- `deleteOrder` con doble confirmación: confirm + prompt pidiendo el número exacto.

### Tareas técnicas adicionales
- `"type": "module"` en `package.json` (elimina warning ESM→CommonJS).
- Eliminado `api/supabase.js` duplicado (era idéntico a `api/_lib/supabase.js`).

---

## ✅ Lo que quedó funcionando en Sesión 17 (Fase 4)

### Dominio custom
- `founder.uy` comprado y conectado a Vercel con SSL automático.
- **Dominio principal**: `www.founder.uy` (con www).
- `founder.uy` (sin www) → redirect 308 → `www.founder.uy`.
- `founder-web-gules.vercel.app` → redirect 301 → `www.founder.uy`.

### Meta Business Portfolio
- Business: `founder.uy`.
- Facebook Page: `founder.uy.oficial` (ID `1058647090653828`).
- Instagram Business: `@founder.uy` (ID `17841474091434639`).
- Ad Account: `Publicidad FOUNDER` (ID `1653222205862527`).
- Pixel: `Founder Pixel` (ID `2898267450518541`).

### Meta Pixel + CAPI
- `META_PIXEL_ID` y `META_CAPI_TOKEN` en Vercel env vars (sin flag Sensitive).
- `components/meta-pixel.js` (~230 líneas): wrapper oficial del Pixel.
- `api/_lib/meta-capi.js` (~230 líneas): módulo CAPI con hasheado SHA-256.
- `api/checkout.js` invoca `sendPurchaseEvent` con `await Promise.race` timeout 3s.
- `event_id = order.numero` → Meta deduplica.
- Test E2E F378204: 218ms desde invocación a confirmación de Meta.

---

## ✅ Lo que quedó funcionando en Sesión 16 (Fase 3C)

- Incidente inicial: `/api/admin` 500 `"permission denied"` resuelto con
  `grant all on public.<tabla> to service_role` sobre las 7 tablas.
- Limpieza: eliminadas `SHEET_ID`, `APPS_SCRIPT_URL`, página "Conversor de
  imágenes" del admin, 6 funciones del conversor en `founder-admin.js`,
  `api/ping.js`.
- Apps Script archivado, Google Sheet movido a archivo con backup `.xlsx`,
  proyecto Google Cloud marcado para eliminación (~22/05/2026).

---

## ✅ Lo que quedó funcionando en Sesión 15 (Fase 3B)

- `components/founder-admin.js` — IIFE, expone 37 funciones a `window`.
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
  - `/api/admin` — 17 acciones
- Variables de entorno en Vercel:
  - `SUPABASE_URL` ✅
  - `SUPABASE_SERVICE_ROLE_KEY` (Sensitive) ✅
  - `ADMIN_PASSWORD` = `nerito20` (Sensitive) ✅
  - `META_PIXEL_ID` ✅ (agregada Sesión 17)
  - `META_CAPI_TOKEN` ✅ (agregada Sesión 17)
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
2. **`product_colors`** — id, product_id, nombre, estado
   (check: `activo`/`sin_stock`/`oferta`), precio_oferta, orden, created_at.
   `extras` JSONB con `colores_estado` que puede contener `<color>_stock_bajo: true`
   (Sesión 20: lógica preparada en frontend, esperando uso desde admin).
3. **`product_photos`** — id, color_id, url, orden, es_principal, created_at.
4. **`orders`** — 23 columnas: id (uuid), numero (unique), fecha, nombre,
   apellido, celular, email, entrega, direccion, productos, subtotal, descuento,
   envio, total, pago, estado, notas, nro_seguimiento, url_seguimiento,
   cupon_codigo, **archivado** (bool, default false), created_at, updated_at.
5. **`order_items`** — id, order_id (FK cascade), product_name, color,
   cantidad, precio_unitario.
6. **`coupons`** — id, codigo (unique), tipo, valor, uso, min_compra, activo,
   usos_count, emails_usados (text[]), desde, hasta, created_at.
7. **`site_settings`** — key (PK), value, updated_at.

### Constraints CHECK en `orders`
- `orders_entrega_check` → `entrega IN ('Envío','Retiro')`
- `orders_pago_check` → `pago IN ('Mercado Pago','Transferencia')`
- `orders_estado_check` → `estado IN ('Pendiente pago','Pendiente confirmación','Confirmado','En preparación','En camino','Listo para retirar','Entregado','Cancelado')`

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

---

## 📂 Archivos del proyecto (estructura actual en GitHub)

```
founder-web/
├── index.html                     ✅
├── producto.html                  ✅ (2422 líneas — Sesión 20: bloque masivo de UX)
├── checkout.html                  ✅ (Sesión 20: política garantía/cambios separada)
├── seguimiento.html               ✅
├── admin.html                     ✅ (686 líneas)
├── contacto.html                  ✅ (Sesión 20: fotos del carrito)
├── sobre-nosotros.html            ✅ (Sesión 20: política + fotos del carrito)
├── envios.html                    ✅ (Sesión 20: 2 info-cards garantía + cambios)
├── tecnologia-rfid.html           ✅ (Sesión 20: fotos del carrito)
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅ (Sesión 20: modal legal con 3 secciones)
│   ├── cart.js                    ✅ (Sesión 20: photoMap centralizado + evento)
│   ├── supabase-client.js         ✅
│   ├── meta-pixel.js              ✅
│   ├── founder-checkout.js        ✅
│   ├── founder-seguimiento.js     ✅
│   └── founder-admin.js           ✅ (~1810 líneas)
├── api/
│   ├── _lib/
│   │   ├── supabase.js            ✅
│   │   └── meta-capi.js           ✅
│   ├── checkout.js                ✅
│   ├── seguimiento.js             ✅
│   └── admin.js                   ✅
├── package.json                   ✅
├── vercel.json                    ✅
├── README.md                      ✅
└── ESTADO.md                      ← este archivo
```

---

## 🔧 API /api/admin — Acciones (17 totales)

| Categoría | Action | Qué hace |
|---|---|---|
| **Auth** | `login` | Valida password, devuelve 200 si es correcto |
| **Pedidos** | `list_orders` | Lista con filtro `include_archived` |
| | `update_order_status` | Cambia `orders.estado` |
| | `update_order_tracking` | Guarda nro_seguimiento + url_seguimiento |
| | `archive_order` | Soft delete (archivado=true). Reversible |
| | `unarchive_order` | Restaurar (archivado=false) |
| | `delete_order` | DELETE definitivo. Requiere `body.confirm=true` |
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
- `supabase-client.js` SIEMPRE antes que `cart.js`.
- `checkout.html` y `admin.html` quedan excluidos del sistema de header/footer.
- `service_role` NUNCA va al frontend.
- **El `delete_order` del admin requiere DOBLE confirmación del usuario** +
  backend valida `body.confirm === true`. Nunca eliminar esa defensa.
- **Nunca refactorizar producto.html sin antes correr los chequeos del Bloque 9
  de Sesión 20** (sintaxis JS, balance de divs, IDs únicos, CSS huérfano).
  Ese archivo tiene >2400 líneas y muchas funciones interconectadas.

### Reglas de base de datos
- Cuando se cree una tabla o se active RLS, SIEMPRE emitir explícitamente
  `GRANT SELECT/ALL ... TO anon|authenticated|service_role`.
- Los constraints CHECK de `orders` deben coincidir EXACTO con los strings
  que manda el frontend.
- `service_role` NO bypassea GRANTs de tabla — solo bypassea RLS.
- Las 4 tablas privadas (`orders`, `order_items`, `coupons`, + parcialmente
  `site_settings`) **SOLO se tocan vía `/api/*`**.

### Reglas de navegador
- **Para probar cambios en paneles de Meta Business, usar Google Chrome**.
  Opera tiene bugs de validación intermitentes.
- **Para probar deploys en Vercel, hacer hard refresh (`Ctrl+F5`) o usar
  ventana incógnito**.

### Reglas de UX (Sesión 20)
- **Mobile fixes deben respetar `env(safe-area-inset-bottom)`** para iPhones
  modernos. Cualquier elemento `position: fixed` cerca del borde inferior
  necesita compensación del notch.
- **Touch handlers deben usar `touch-action: pan-y` en CSS** + clasificación
  temprana de dirección en `touchmove`. Sin esto, iOS Safari rompe el scroll.
- **Burbuja WhatsApp y sticky CTA se coordinan vía 2 clases en `<body>`**:
  `.has-sticky-cta` (eleva burbuja) y `.footer-visible` (oculta ambos).
  Sus observers son independientes y NO deben fusionarse.

---

## 🧪 Cómo probar todo lo que está hecho

### Prueba end-to-end de compra
1. Abrir https://www.founder.uy
2. Agregar producto al carrito → checkout.
3. Completar, confirmar pedido.
4. Ver "🎉 ¡Pedido enviado!" con número `F######`.
5. Verificar en Supabase Dashboard → Table Editor → `orders` + `order_items`.

### Prueba de seguimiento
Ir a `/seguimiento.html?pedido=F910752&email=test@prueba.com`.

### Prueba de admin
Entrar a `/admin.html` con password `nerito20`.

### Prueba de mejoras UX producto.html (Sesión 20)
**Desktop:**
1. Abrir un producto. Ver galería con autoplay cada 4s.
2. Pasar el mouse sobre la foto principal → debe pausarse el autoplay y
   activarse el zoom 1.5x siguiendo el cursor.
3. Click en un thumbnail → autoplay se pausa 12s y reanuda.
4. Cambiar de color → el autoplay se reinicia desde la foto 0.
5. Scrollear hacia abajo. Cuando el botón "Agregar al carrito" sale de
   pantalla, debe aparecer la **tarjeta sticky abajo a la derecha**.
6. Cuando aparece el sticky, **la burbuja de WhatsApp sube automáticamente**.
7. Llegás al footer → **se ocultan ambos** (sticky + burbuja).
8. Subís de nuevo → **reaparecen ambos sin superposición**.
9. Click en "Compartir" → abre WhatsApp Web con mensaje pre-armado.
10. Bajar a la sección de reseñas → grilla de 4 columnas con testimonios.

**Mobile:**
1. Galería: swipe izquierda/derecha cambia de foto. Flechas circulares ‹ ›
   superpuestas. Toca el thumbnail también.
2. Specs en 2 columnas (3+3), no 1 columna larga.
3. Scrollear hacia abajo → **botón sticky aparece como barra completa abajo**.
4. La burbuja WhatsApp queda visiblemente arriba del sticky con aire.
5. Sección de reseñas: **carrusel autoplay 4s con flechas + dots dorados**.
   Tocar una flecha pausa 12s.

**iOS Safari específico:**
1. Tocar la foto y arrastrar hacia abajo → debe scrollear normal, sin
   trabarse.
2. Tocar la foto y arrastrar horizontal → debe cambiar de foto, **sin que
   la página se mueva lateralmente**.
3. El sticky no queda tapado por el home indicator (barra negra inferior).

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
| WhatsApp del negocio | `598098550096` |
| FREE_SHIPPING threshold | `2000` UYU |
| SHIPPING_COST | `250` UYU |
| Pedido de prueba histórico | `F910752` / `test@prueba.com` / Confort Negro / $2.490 |
| ⚠️ NO BORRAR | Pedido `F203641` / Florencia Risso / `florenciar.1196@gmail.com` (cliente real) |

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
- **Sesión 20 (Polish UX producto.html):** Sesión muy larga. Galería
  interactiva (autoplay 4s + zoom 1.5x + swipe + flechas + lazy-loading),
  política Garantía 60d vs Cambios 7d separada en 5 archivos, tabla
  comparativa Founder vs tradicional, fotos del carrito centralizadas en
  cart.js, sección de reseñas con carrusel mobile, Schema.org Product +
  Open Graph dinámico, sticky CTA mobile+desktop coordinado con burbuja
  WhatsApp via 2 clases independientes en body, fix bug touch iOS Safari
  con `touch-action: pan-y` + 4 listeners coordinados + reset por timeout,
  botón Compartir WhatsApp, revisión completa con 5 bugs encontrados y
  arreglados (div huérfano, código muerto, scrollbar fantasma).
  ← **Acá terminamos.**
- **Sesión 21:** A definir según prioridades del usuario. ← **Próxima.**

---

## 📋 Pendientes para Sesión 21

### Prioridad alta (no bloqueante) — solo cuando arranquen ads
1. **Evaluar primera campaña paga de Meta Ads** con optimización de Purchase.
   Con el dominio verificado, AEM debería funcionar correctamente en iOS 14.5+.
   Definir: presupuesto diario, producto destacado, público objetivo
   (remarketing a visitantes de `producto.html` vs frío).

### Prioridad media — feature admin nueva
2. **Agregar campo `stock_bajo` en admin** para activar el aviso "⏳ Pocas
   unidades disponibles" preparado en Sesión 20. La lógica de frontend ya
   está lista — solo falta:
   - Agregar checkbox por color en `founder-admin.js` (sección de edición
     de producto).
   - Setear `extras.colores_estado.<NombreColor>_stock_bajo: true` cuando
     el admin lo marca.
   - Verificar que se guarda en `product_colors.extras` JSONB.

### Prioridad media — 3 clics en Chrome (Meta)
3. **Renombrar dataset "NO"** (ID `1472474751248750`) con prefijo `ZZ-` para
   que quede al final alfabéticamente.
4. **Renombrar o ignorar Ad Account `26140748312219895`** (auto-creada).
5. **Agregar email de contacto al Instagram** en Meta Business Portfolio.

### Prioridad media — limpieza de pedidos
6. **Borrar pedidos de prueba acumulados** con el sistema de Sesión 18:
   - `F237553`, `F839362`, `F029945` — Evandro Segovia con CIs random.
   - `F264440`, `F515156` — pedidos de prueba.
   - `F378204` — test CAPI.
   - ⚠️ **NO BORRAR**: `F203641` — Florencia Risso (cliente real).

### Prioridad baja — pulido
7. **Reintentar username `founder.uy` para la Page de Facebook** cuando Meta
   lo libere (actualmente `founder.uy.oficial`).

### Posibles direcciones nuevas (a discutir con usuario)
- **Mejoras UX en otras páginas** (index.html, contacto, sobre-nosotros).
- **Integración Mercado Pago** completa (hoy es manual).
- **Email transaccional** post-compra (Resend / SendGrid).
- **Sistema de reseñas reales** (cuando haya clientes con compras
  validadas — reemplazar las 4 reseñas mock de Sesión 20).

---

## 📜 Historial de incidentes resueltos

### Sesión 20 (5 incidentes resueltos en revisión final + 1 bug iOS crítico)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | iOS Safari: tocar la foto trababa el scroll vertical y movía la página lateralmente | Touch handlers con `passive: true` sin `touch-action` CSS — Safari permitía scroll lateral nativo y a veces el touchend se perdía | `touch-action: pan-y` en CSS + 4 listeners (start/move/end/cancel) con clasificación de dirección temprana + reset por timeout 500ms |
| 2 | Burbuja WhatsApp tapaba el sticky CTA al volver del footer | El observer del footer removía `.has-sticky-cta` al entrar al footer pero nadie lo restauraba al salir si el sticky seguía activo | En el footer observer, cuando footer se va: si `wrap.classList.contains('is-active')`, restaurar `.has-sticky-cta` |
| 3 | `</div>` huérfano al cierre del archivo | Pre-existente de sesiones anteriores | Eliminado |
| 4 | Variable JS `priceRow` declarada pero nunca usada | Código muerto en `selectColor` | Eliminada |
| 5 | Selector CSS `.sticky-add-btn:active` apuntando a clase inexistente | Refactor previo dejó el selector huérfano | Eliminado |
| 6 | Scrollbar fantasma en tabs desktop | `overflow-x: auto` reservaba espacio para scroll que no existía | Quitado `overflow-x` (los 3 tabs entran perfectamente) |

### Sesión 19 (2 incidentes)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | iOS Safari: WhatsApp no abría automáticamente tras finalizar compra | `window.open` post-`await` pierde "user gesture" en iOS | Patrón pre-open: abrir `about:blank` ANTES del await, asignar URL después |
| 2 | Header `producto.html` sin estilos | CSS legacy (`.header__nav*`) no coincidía con HTML BEM (`.nav*`) | Reemplazado bloque CSS por el de `index.html` |

### Sesión 18 (3 incidentes)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Meta rechazaba `www.founder.uy` | Bug del validador en Opera | Usar Chrome |
| 2 | Filtro "Archivados" no aparecía tras deploy | Cache de Opera | `Ctrl+F5` |
| 3 | Meta no permite eliminar dataset/Ad Account auto-creados | Limitación UI | Renombrar con `ZZ-` o ignorar |

### Sesión 17 (5 incidentes)
- Meta rechazó dominio → era Opera, resuelto en Sesión 18.
- Upload parcial a GitHub web → tandas de 2-3 archivos.
- Archivo en carpeta equivocada → verificar breadcrumb.
- Variables Sensitive en Vercel Hobby → crear sin el flag.
- Fire-and-forget cortado por Vercel → `await Promise.race`.

### Sesión 16 (1 incidente)
- Admin 500 `permission denied` → `grant all to service_role` sobre 7 tablas.

### Sesión 14 (6 incidentes en cascada)
- Permisos RLS, GRANT, columnas faltantes en orders, constraints CHECK
  desalineados, GRANT a service_role en tablas privadas.

---

**FIN** — Cerramos Sesión 20. Sesión muy larga centrada exclusivamente en
`producto.html` (de 1394 a 2422 líneas, +1028). Todo el polish UX
sustantivo del catálogo está listo: galería interactiva con autoplay/zoom/swipe,
sección comparativa, reseñas con carrusel mobile, SEO dinámico para Google y
redes sociales, sticky CTA mobile+desktop coordinado armónicamente con la
burbuja WhatsApp, fix crítico de touch en iOS, política garantía/cambios
separada y consistente en 5 archivos, fotos del carrito centralizadas. Auditoría
final detectó 5 bugs menores que se arreglaron antes de cerrar. El sitio está
en estado de polish UX listo para campañas pagas — la próxima sesión decide si
arrancar ads, agregar la feature `stock_bajo` desde admin, atacar otras
páginas, o evaluar nuevos caminos. 🎯
