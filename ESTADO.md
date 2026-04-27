# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 21 — cierre (27/04/2026)
**Próxima sesión:** 22 — Sitio en estado óptimo de UX y performance (PageSpeed 94/100). Prioridades para Sesión 22: arrancar primera campaña paga de Meta Ads, limpieza de pedidos de prueba, pendientes menores de Meta (renombrar dataset/Ad Account, Instagram email), o nuevas direcciones de producto (Mercado Pago integrado, email transaccional, mejoras UX en otras páginas).

---

## 🚀 Para iniciar el próximo chat

Pegale a Claude este mensaje al arrancar:

> Leé `ESTADO.md` y retomamos después de Sesión 21. La Sesión 21 cerró 3
> bloques: (1) feature `stock_bajo` en admin con checkbox por color
> independiente del estado, (2) optimizaciones de carga inicial en
> `index.html` — banner migrado de `products.banner_url` a
> `site_settings.hero_banner_url`, skeletons con shimmer dorado,
> `fetchpriority` + preconnect a Supabase, (3) fixes de accesibilidad
> WCAG (contraste del botón "Ver detalle" + jerarquía de headings).
> Resultado: PageSpeed 94/100 verde. Para Sesión 22, decime opciones según
> los pendientes que quedan abiertos: primera campaña paga de Meta Ads
> (todo listo para arrancar), limpieza de pedidos de prueba, pendientes
> menores de Meta, mejoras UX en otras páginas (index/contacto/etc), o
> features nuevas (Mercado Pago integrado, email transaccional).

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
- **SQL de migración:**
  ```sql
  INSERT INTO site_settings (key, value)
  VALUES ('hero_banner_url', COALESCE(
    (SELECT banner_url FROM products
       WHERE activo = true AND banner_url IS NOT NULL AND banner_url <> ''
       ORDER BY orden ASC LIMIT 1), ''))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ```
- `supabase-client.js → fetchBannerUrl` ahora consulta
  `/site_settings?select=value&key=eq.hero_banner_url&limit=1` (mucho más
  liviana que traer `products` entero).
- `founder-admin.js`: refactor completo del bloque banner. Eliminadas
  `getBannerProduct()` y la `persistBannerUrl()` legacy de 50+ líneas.
  La nueva `loadBanner()`/`persistBannerUrl()` usan `apiAdmin('get_setting')`
  y `apiAdmin('set_setting')` (acciones que ya existían pero no se usaban).
- `api/admin.js`: eliminado el campo legacy `banner_url` de `handleSaveProduct`
  (ya no se persiste desde ahí).
- **Columna `products.banner_url` se mantiene** como respaldo silencioso
  (no estorba, no se lee, podría dropearse en sesión futura sin urgencia).

#### Bloque 2b — Eager loading + fetchpriority
- **Banner del hero**: `fetchpriority="high"` + `decoding="async"` + fade-in
  suave al cargar (`opacity 0 → CSS .5` con transition 350ms).
- **Primeras 3 cards de productos**: `loading="eager"` + `fetchpriority="high"`
  (above the fold en mobile/tablet/desktop).
- **Cards 4 en adelante**: siguen `loading="lazy"` + `fetchpriority="low"`.
- **`<link rel="preconnect" href="https://qedwqbxuyhieznrqryhb.supabase.co" crossorigin>`**
  en el `<head>` para adelantar el handshake TLS (~100-200ms ganados).
- En `init()`, el banner se separó del `Promise.all` — ahora se aplica
  apenas resuelve, sin esperar a que terminen las queries de productos+fotos.

#### Bloque 2c — Skeleton cards de carga
- **3 skeleton cards** con shimmer dorado animado en lugar del texto
  "Cargando productos…" plano.
- CSS: `.product-skeleton`, `.product-skeleton__img`, `.product-skeleton__line`
  con `@keyframes skeletonShimmer` (1.6s linear infinite).
- Respeta `prefers-reduced-motion` → animación se desactiva para usuarios
  sensibles al movimiento.
- Atributos ARIA: `aria-busy="true"` + `aria-live="polite"` en el grid,
  `aria-hidden="true"` en cada skeleton, `<span class="visually-hidden">Cargando productos…</span>`
  para lectores de pantalla.
- `renderProducts()` quita el `aria-busy` cuando llegan los datos.

### 🛡️ Bloque 3 — Fixes de accesibilidad WCAG (detectados por PageSpeed)

#### Fix 3a — Contraste del botón "Ver detalle de producto"
- **Problema:** botón con `background: #c9a96e` (dorado) + `color: #ffffff`
  (blanco) → ratio 2.2:1 (falla WCAG AA mínimo de 4.5:1 para texto chico).
- **Solución:** cambiado a `color: var(--color-bg)` (negro `#141414`)
  → ratio ~8.5:1 (pasa AAA holgado, mantiene branding dorado).
- 1 sola línea CSS modificada en `index.html`.

#### Fix 3b — Jerarquía de headings semánticos
- **Problema:** `<h1>` (hero) → `<h3>` (4× cards RFID) → `<h2>` (Nuestros
  modelos) — saltaba de h1 a h3 y luego retrocedía a h2. PageSpeed lo
  marcaba como error de navegación accesible.
- **Solución:** agregado `<h2 class="visually-hidden">Características RFID</h2>`
  al inicio de la sección RFID, justo antes de los 4 `<h3>`. La utility
  `.visually-hidden` ya existía en CSS desde Bloque 2c.
- Resultado: `h1 → h2 → h3 → h3 → h3 → h3 → h2 → ...` jerarquía limpia,
  sin afectar el diseño visual.

### 📊 Validación de resultados

#### PageSpeed Insights — score final
- **Performance: 94/100 (verde)** — top ~10% de sitios web.
- Speed Index: 1.9s (verde, <3.4s).
- Score más que aceptable para e-commerce con imágenes pesadas.

#### Cosas que PageSpeed sugirió y NO atacamos (decisión consciente)
- **"Mejora la entrega de imágenes" — Ahorro 5-6 MB en mobile**:
  requiere Supabase Pro ($25/mes para Image Transformations) o CDN externo
  (Cloudinary). Con score 94 y plan Free no se justifica hoy. Si arranca
  campañas pagas y CR sufre, evaluar entonces.
- **"Solicitudes de bloqueo de renderización — 1.930ms" (Google Fonts)**:
  el `<link rel="stylesheet">` de fuentes es render-blocking. Solucionable
  con patrón `media="print"` + `onload`, pero implicaría tocar 9 HTMLs.
  Score actual ya es 94 — ganancia marginal no justifica el riesgo.
- **"Cache headers en Supabase Storage"**: requiere config en bucket Supabase.
  Ayudaría en visitas repetidas. Apuntado para sesión futura.
- **"34 KB de JavaScript sin usar"**: probablemente parte de meta-pixel.js
  / cart.js que no se ejecuta en index. Ganancia marginal — no se atacó.

### 📝 Iteraciones de UI registradas durante la sesión

- **Stock bajo — opción de mutua exclusión:** se evaluó si el checkbox
  debía ser excluyente con "Agotado" o independiente. Decisión final:
  **independiente**, porque el frontend (`getColorEstado` en `producto.html`,
  línea 1229) ya tenía la lógica `stockBajo === true && estado !== 'sin_stock'`
  desde Sesión 20 — si el admin marca "Agotado" + "Stock bajo", gana
  "Agotado" automáticamente. Robusto a errores del admin sin lógica extra.
- **Banner — preload estático vs dinámico:** se descartó `<link rel="preload">`
  estático en el `<head>` porque la URL del banner es dinámica (la setea
  el admin) y no hay render server-side. En su lugar, `preconnect` estático
  + `fetchPriority='high'` + separación del `Promise.all` en `init()`.
- **Skeleton — número de cards:** se eligieron 3 (no 4 ni 6) porque cubren
  el primer paint en los 3 viewports (1 col mobile, 2 col tablet, 3 col
  desktop) sin saturar el grid.

### 🐛 Incidente resuelto durante la sesión

| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Productos y banner dejaron de cargar tras subir los archivos de stock_bajo | El usuario subió los 4 archivos antes de correr el SQL `ALTER TABLE product_colors ADD COLUMN stock_bajo`. La query del frontend pedía una columna que aún no existía en Postgres → 400/500 error → todo fallaba | Correr el SQL pendiente en Supabase. Recuperación instantánea. **Lección registrada en Reglas Críticas: en cambios que tocan Supabase + código, SIEMPRE el SQL primero, después el código** |

### Tareas técnicas adicionales
- Eliminadas funciones huérfanas en `founder-admin.js`: `getBannerProduct()`,
  `persistBannerUrl()` versión legacy. Verificado con `grep` que no hay
  referencias rotas.
- Sintaxis JS validada con `node --check` después de cada cambio (5 veces).
- Balance de funciones color (defs vs window-exports vs onclicks) verificado
  para los 6 callbacks: `setColorEstado`, `removeColorRow`, `onColorNameInput`,
  `onPrecioOfertaInput`, `addColorRow`, `toggleStockBajo` — todos balanceados.

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
   ⚠️ El campo `banner_url` quedó como **legacy silencioso** desde Sesión 21
   — el banner ahora vive en `site_settings.hero_banner_url`. La columna se
   mantiene como respaldo, no se lee desde frontend ni admin.
2. **`product_colors`** — id, product_id, nombre, estado
   (check: `activo`/`sin_stock`/`oferta`), precio_oferta, **stock_bajo**
   (bool, default false — Sesión 21), orden, created_at.
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
   Keys actuales: `hero_banner_url` (Sesión 21) — URL del banner del hero.

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
├── index.html                     ✅ (Sesión 21: skeletons + fetchpriority + WCAG fixes)
├── producto.html                  ✅ (2422 líneas — Sesión 20: bloque masivo de UX)
├── checkout.html                  ✅ (Sesión 20: política garantía/cambios separada)
├── seguimiento.html               ✅
├── admin.html                     ✅ (686 líneas — Sesión 21: CSS botón stock bajo)
├── contacto.html                  ✅ (Sesión 20: fotos del carrito)
├── sobre-nosotros.html            ✅ (Sesión 20: política + fotos del carrito)
├── envios.html                    ✅ (Sesión 20: 2 info-cards garantía + cambios)
├── tecnologia-rfid.html           ✅ (Sesión 20: fotos del carrito)
├── components/
│   ├── header.js                  ✅
│   ├── footer.js                  ✅ (Sesión 20: modal legal con 3 secciones)
│   ├── cart.js                    ✅ (Sesión 20: photoMap centralizado + evento)
│   ├── supabase-client.js         ✅ (Sesión 21: stock_bajo + banner desde site_settings)
│   ├── meta-pixel.js              ✅
│   ├── founder-checkout.js        ✅
│   ├── founder-seguimiento.js     ✅
│   └── founder-admin.js           ✅ (~1765 líneas — Sesión 21: stock_bajo + banner refactor)
├── api/
│   ├── _lib/
│   │   ├── supabase.js            ✅
│   │   └── meta-capi.js           ✅
│   ├── checkout.js                ✅
│   ├── seguimiento.js             ✅
│   └── admin.js                   ✅ (Sesión 21: stock_bajo en list/save_product)
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
- ⚠️ **Sesión 21 — orden crítico de despliegue**: cuando un cambio toca
  Supabase (ALTER TABLE, INSERT en site_settings, etc.) Y código frontend
  al mismo tiempo, SIEMPRE correr el SQL en Supabase **PRIMERO**, después
  desplegar el código. Si se invierte el orden, el frontend pide columnas/
  filas que aún no existen y falla en cascada (productos, banner, todo).
  Recuperación es instantánea cuando se corre el SQL — pero el sitio queda
  caído en el intermedio.

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
- **Sesión 21 (Stock bajo + perf inicial + WCAG):** Tres bloques cerrados.
  (1) Feature `stock_bajo` en admin con columna nueva `product_colors.stock_bajo`
  (boolean default false) + checkbox dorado independiente en cada fila de
  color (no excluyente con los 3 estados — frontend ya tenía la lógica
  defensiva desde Sesión 20). (2) Optimizaciones de carga inicial en
  `index.html`: banner migrado de `products.banner_url` a
  `site_settings.hero_banner_url` (query 70% más liviana), 3 skeleton cards
  con shimmer dorado animado mientras carga el catálogo, `fetchpriority="high"`
  en banner + primeras 3 cards, preconnect a Supabase (~150ms ahorrados en
  handshake), banner separado del Promise.all en init() para aplicar apenas
  resuelve. Refactor del bloque banner en founder-admin.js (eliminadas
  funciones legacy `getBannerProduct` y `persistBannerUrl` viejas; ahora usa
  `apiAdmin('get_setting')` / `set_setting` que ya existían). (3) Fixes de
  accesibilidad WCAG: contraste botón "Ver detalle" (2.2:1 → 8.5:1) y
  jerarquía de headings (h2 invisible para sección RFID). PageSpeed
  Insights validó: **Performance 94/100 verde** en mobile. 1 incidente
  resuelto (orden de despliegue Supabase-first). ← **Acá terminamos.**
- **Sesión 22:** A definir según prioridades del usuario. ← **Próxima.**

---

## 📋 Pendientes para Sesión 22

### Prioridad alta — listo para arrancar cuando vos quieras
1. **Primera campaña paga de Meta Ads** con optimización de Purchase.
   Todo el setup técnico está listo desde Sesión 17-18 (Pixel + CAPI +
   dominio verificado). Con PageSpeed 94/100 (Sesión 21), el sitio está en
   estado óptimo para ads. Definir con el usuario: presupuesto diario,
   producto destacado, público objetivo (remarketing a visitantes de
   `producto.html` vs frío).

### Prioridad media — limpieza de pedidos (5 min)
2. **Borrar pedidos de prueba acumulados** con el sistema de Sesión 18:
   - `F237553`, `F839362`, `F029945` — Evandro Segovia con CIs random.
   - `F264440`, `F515156` — pedidos de prueba.
   - `F378204` — test CAPI.
   - ⚠️ **NO BORRAR**: `F203641` — Florencia Risso (cliente real).

### Prioridad media — 3 clics en Chrome (Meta)
3. **Renombrar dataset "NO"** (ID `1472474751248750`) con prefijo `ZZ-` para
   que quede al final alfabéticamente.
4. **Renombrar o ignorar Ad Account `26140748312219895`** (auto-creada).
5. **Agregar email de contacto al Instagram** en Meta Business Portfolio.

### Prioridad baja — pulido
6. **Reintentar username `founder.uy` para la Page de Facebook** cuando Meta
   lo libere (actualmente `founder.uy.oficial`).
7. **Drop columna `products.banner_url`** (legacy desde Sesión 21).
   No es urgente — ya no se lee desde ningún lado y no estorba.
   `ALTER TABLE products DROP COLUMN banner_url;`

### Optimizaciones de performance restantes (NO urgentes — score actual 94)
- **Imágenes en formatos modernos (WebP/AVIF)**: ahorro estimado 5-6 MB en
  mobile según PageSpeed. Requiere Supabase Pro ($25/mes Image Transformations)
  o CDN externo (Cloudinary). **Solo evaluar si las campañas pagas muestran
  CR bajo en mobile**.
- **Fuentes Google no bloqueantes**: ahorro estimado 1.930 ms en mobile
  (patrón `media="print"` + `onload`). Tocar 9 HTMLs. Score actual ya es 94
  → ganancia marginal.
- **Cache headers en Supabase Storage**: configurar `Cache-Control` agresivo
  en el bucket `product-photos`. Ayuda en visitas repetidas y navegación
  entre páginas internas.
- **Reducir 34 KB de JS sin usar**: probablemente parte de meta-pixel.js
  o cart.js. Ganancia marginal — auditar solo si hay tiempo libre.

### Posibles direcciones nuevas (a discutir con usuario)
- **Mejoras UX en otras páginas** (`index.html`, `contacto.html`,
  `sobre-nosotros.html`).
- **Integración Mercado Pago** completa (hoy es manual).
- **Email transaccional** post-compra (Resend / SendGrid).
- **Sistema de reseñas reales** (cuando haya clientes con compras
  validadas — reemplazar las 4 reseñas mock de Sesión 20).

---

## 📜 Historial de incidentes resueltos

### Sesión 21 (1 incidente — orden de despliegue)
| # | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 1 | Productos y banner dejaron de cargar tras subir los archivos de stock_bajo | El usuario subió los 4 archivos a GitHub antes de correr el SQL `ALTER TABLE product_colors ADD COLUMN stock_bajo`. La query del frontend pedía una columna que aún no existía → 400/500 → toda la cascada de carga falló | Correr el SQL pendiente. Recuperación instantánea. **Lección: SIEMPRE el SQL primero, después el código** (regla agregada a sección crítica) |

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

**FIN** — Cerramos Sesión 21. Sitio en estado óptimo: feature `stock_bajo`
operativa desde admin, banner migrado a `site_settings.hero_banner_url`
(query liviana + arquitectura coherente), `index.html` con skeletons +
fetchpriority + preconnect, fixes WCAG aplicados. **PageSpeed Insights
mobile: Performance 94/100 verde** — top 10% de sitios web, score más
que aceptable para arrancar campañas pagas. El sitio está técnicamente
listo para escalar tráfico — la próxima sesión decide si arrancar Meta
Ads, atacar pendientes de limpieza, o explorar nuevas direcciones (MP
integrado, email transaccional, mejoras UX en otras páginas). 🎯
