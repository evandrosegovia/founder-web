# FOUNDER.UY — Estado del proyecto
**Última actualización:** Abril 2026 — Cierre de Sesión 9
**URL del sitio:** https://founder-web-gules.vercel.app
**Deploy:** Vercel → GitHub (auto-deploy en push a main)

---

## ⚠️ NOTA PARA LA PRÓXIMA SESIÓN

**Al iniciar la próxima sesión, leer esto antes de cualquier cosa:**

1. Leer este archivo (`ESTADO.md`) primero — contexto general.
2. Revisar el bloque **"5 propuestas para próximas sesiones"** al final.
3. Pedirle al usuario que elija una (o aporte una propia) antes de implementar.

**Resumen rápido del estado actual:**
- Sesión 9 cerrada con la **migración a componentes compartidos** completada (Tarea 1, Opción A).
- También se aplicó la **Tarea 2** (micro-ajuste de padding en badges OFERTA/AGOTADO).
- Header, footer, modales legales, burbuja WhatsApp y carrito ya viven en **3 archivos JS**, no duplicados en cada HTML.
- Las 7 páginas públicas se redujeron de ~11.774 a ~7.496 líneas (–36%).
- Cero errores en la validación final automática.

**Regla crítica que se mantiene:** la clave interna `'sin_stock'` (en JSON de columna G del Sheet, en JS, en admin) **NO se modifica jamás**. Solo se cambia el texto visible al usuario.

---

## Datos clave del proyecto

| Dato | Valor |
|------|-------|
| Google Sheet ID | `1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8` |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbx8LByXXY7QwzHEB0RyvP0Ejbmqyw099F4ntbbwRIdkRv8JlUDaryn_vQj2aL9kANA/exec` |
| WhatsApp | 598098550096 |
| Instagram | @founder.uy |
| Password admin | `nerito20` (solo en admin.html — nunca en archivos públicos) |
| Google Client ID | `733837099876-opi6t9ohpru1c7su1hbgj8kqrvmqp1nh.apps.googleusercontent.com` |
| Envío gratis desde | $2.000 UYU |
| Costo de envío | **$250 UYU** — vía agencia UES (o cadetería en Montevideo) |
| Descuento transferencia | 10% — **solo por transferencia bancaria, no por efectivo** |
| Agencia de envíos | UES (o cadetería para Montevideo) |
| Retiro en local | Zona Prado, Montevideo — dirección exacta se coordina por WhatsApp |

---

## Archivos del proyecto

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `index.html` | Tienda principal — hero, grilla, modal vista rápida, menú mobile | ✅ Activo + componentizado |
| `producto.html` | Página de producto — galería, colores, specs dinámicas, estados, relacionados | ✅ Activo + componentizado |
| `checkout.html` | Checkout — formulario, cupones, confirmación | ✅ Activo (NO usa componentes) |
| `seguimiento.html` | Seguimiento de pedidos — fotos de productos | ✅ Activo + componentizado (sin cart por diseño) |
| `envios.html` | Página informativa de envíos | ✅ Activo + componentizado |
| `admin.html` | Panel de administración — specs, estados de color, tracking, pedidos | ✅ Activo (NO usa componentes) |
| `contacto.html` | Página de contacto | ✅ Activo + componentizado |
| `tecnologia-rfid.html` | Página informativa RFID | ✅ Activo + componentizado |
| `sobre-nosotros.html` | Página institucional | ✅ Activo + componentizado |
| `components/header.js` | Header + menú mobile (compartido) | ✅ NUEVO Sesión 9 |
| `components/footer.js` | Footer + modales legales + burbuja WhatsApp (compartido) | ✅ NUEVO Sesión 9 |
| `components/cart.js` | Drawer del carrito lateral (compartido) | ✅ NUEVO Sesión 9 |
| `ESTADO.md` | Este archivo — estado general del proyecto | 📄 Documentación |

---

## Sistema de componentes compartidos (Sesión 9)

### Arquitectura
- **Carpeta:** `components/`
- **Patrón:** componentes JavaScript inyectados (Opción A)
- **Estrategia:** cada componente es una IIFE (función auto-ejecutable) que renderiza su HTML en un `<div id="...">` y, si necesita CSS no global, lo inyecta en `<head>`.
- **Páginas que los usan:** las 7 páginas públicas (`index`, `producto`, `contacto`, `envios`, `seguimiento`, `sobre-nosotros`, `tecnologia-rfid`).
- **Páginas excluidas a propósito:** `checkout.html` (header simplificado propio) y `admin.html` (panel interno).
- **Excepción:** `seguimiento.html` usa header y footer compartidos pero **no incluye el drawer del carrito** — decisión de diseño.

### Patrón de uso en cualquier página HTML
```html
<!-- Donde antes había <header>...</header> + menu drawer: -->
<div id="site-header"></div>
<script src="components/header.js"></script>

<!-- Donde antes había <footer>...</footer> + modales legales + burbuja WA: -->
<div id="site-footer"></div>
<script src="components/footer.js"></script>

<!-- Donde antes había el cart-overlay + cart-sidebar: -->
<div id="site-cart"></div>
<script src="components/cart.js"></script>
```

### Cómo editar contenido compartido

| Quiero cambiar… | Edito… |
|---|---|
| Un link del nav (ej: agregar "Blog") | `components/header.js` → array `NAV_LINKS` |
| Un link del footer (productos o info) | `components/footer.js` → arrays `FOOTER_PRODUCTS` o `FOOTER_INFO` |
| Texto de los modales legales | `components/footer.js` → constantes `LEGAL_PRIVACY`, `LEGAL_TERMS`, `LEGAL_RETURNS` |
| El número de WhatsApp de la burbuja | `components/footer.js` (busca `wa.me/598`) y `components/header.js` (drawer mobile) |
| El markup del carrito | `components/cart.js` (no la lógica, que sigue en cada página) |

### Cómo agregar una página nueva al sitio
1. Copiar `contacto.html` como base (es la más simple con componentes).
2. Reemplazar el contenido principal entre el placeholder del header y el del footer.
3. Agregar el link en `components/header.js` → `NAV_LINKS` con `match: 'nombre-archivo-sin-html'`.
4. Si querés que aparezca en el footer "Info", agregar también en `FOOTER_INFO`.

### Detección automática del link activo
El componente `header.js` tiene una función `getCurrentPage()` que detecta el archivo HTML en el que estás (ej: `tecnologia-rfid.html` → `'tecnologia-rfid'`) y aplica `is-active` al link que coincide con el `match` declarado en `NAV_LINKS`. **No hay que tocar nada manualmente** al cambiar de página.

### Funciones globales que provee `footer.js`
- `window.showLegal('privacy' | 'terms' | 'returns')` — abre el modal legal correspondiente.
- `window.hideLegal('privacy' | 'terms' | 'returns')` — lo cierra.

> ⚠️ Las versiones locales de `showLegal` / `hideLegal` que vivían en el JS de `index.html` y `producto.html` fueron eliminadas en Sesión 9 — ahora `footer.js` es la única fuente de verdad.

### CSS autocontenido en footer.js
`footer.js` inyecta automáticamente las reglas CSS de `.legal-page` y `.wa-bubble` en `<head>` si no existen. Esto permite que las páginas "secundarias" (que antes no tenían modales legales) ahora los muestren correctamente. La inyección es idempotente: aunque el script se cargue dos veces, el `<style id="founder-footer-css">` se inserta una sola vez.

---

## Arquitectura técnica

- **Sin frameworks** — vanilla JS puro en todos los archivos
- **Sin backend propio** — Google Sheets + Apps Script como base de datos
- **Carrito compartido** — clave `founder_cart` en localStorage entre index, producto, checkout y demás páginas
- **Fotos de productos** — cargadas desde Google Sheets vía GViz API
- **Pedidos** — escritos directamente a Sheets vía Apps Script al confirmar
- **Cupones** — validados en tiempo real contra Sheets; usos registrados vía Apps Script
- **Tracking** — columnas Q y R del Sheet `pedidos` para nro y URL de seguimiento
- **Confirmación rápida** — datos del último pedido guardados en `sessionStorage` para reenvío y pre-llenado de seguimiento
- **Páginas legales** — modales unificados vía `components/footer.js` (`showLegal()` / `hideLegal()`)
- **Estados de color** — columna G del Sheet `productos`, clave `colores_estado` en JSON de extras
- **🆕 Plantilla compartida** — header + footer + carrito en `components/*.js` (Sesión 9)

> ✅ **Deuda técnica resuelta en Sesión 9:** ya NO hay que editar 9 archivos para cambiar un link o un dato del header/footer/carrito. Se edita un solo archivo en `components/`.

---

## Estructura Google Sheets

### Hoja `productos`
`A=nombre | B=precio | C=descripcion | D=colores | E=specs | F=url_banner (solo F2) | G=extras JSON`

**Estructura del JSON en columna G (extras):**
```json
{
  "material": "Texto opcional — si está vacío usa el default",
  "nota": "Nota especial en dorado — opcional",
  "capacidad": "Ej: 5-6 tarjetas",
  "dimensiones": "Ej: 9.5 × 6.5 × 0.8 cm",
  "billetes": "Sí / No",
  "monedas": "Sí / No",
  "colores_estado": {
    "Negro": "activo",
    "Camel": "sin_stock",
    "Marrón": "oferta",
    "Marrón_precio_oferta": 1490
  }
}
```

> ⚠️ Al guardar desde el admin, siempre se hace **merge** del JSON existente. Nunca se sobreescribe completo.
> Si un color no aparece en `colores_estado`, se asume `"activo"`.
> El precio de oferta es un entero en UYU, sin símbolo de moneda.
> **La clave interna `'sin_stock'` es inmutable** — aunque en UI se muestre "Agotado", internamente el valor es siempre `sin_stock`.

### Hoja `fotos`
`A=modelo | B=color | C=foto1 | D=foto2 | E=foto3 | F=foto4 | G=foto5`

### Hoja `pedidos`
```
A=id | B=fecha | C=nombre | D=apellido | E=celular | F=email
G=entrega | H=direccion | I=productos | J=subtotal | K=descuento
L=envio | M=total | N=pago | O=estado | P=notas
Q=nro_seguimiento | R=url_seguimiento
```

### Hoja `cupones`
`A=codigo | B=tipo(fijo/porcentaje) | C=valor | D=uso(multiuso/unico/por-email) | E=minCompra | F=activo(true/false) | G=usos | H=emails_usados | I=desde(DD/MM/YYYY) | J=hasta(DD/MM/YYYY)`

---

## Navegación — estructura actual

### Nav del header (definido en `components/header.js` → `NAV_LINKS`)
```
Inicio | Productos | Tecnología RFID | Seguí tu compra | Sobre nosotros | Contacto
```

| Página | Link activo |
|---|---|
| `index.html` | Inicio |
| `producto.html` | (ninguno por defecto — no hay match en NAV_LINKS) |
| `tecnologia-rfid.html` | Tecnología RFID |
| `seguimiento.html` | Seguí tu compra |
| `sobre-nosotros.html` | Sobre nosotros |
| `contacto.html` | Contacto |
| `envios.html` | Ninguno (no figura en nav, solo en footer) |
| `checkout.html` | Header simplificado — excluido del nav |
| `admin.html` | Nav interno propio — excluido |

> Cambio en Sesión 9: el link "Productos" del nav apunta SIEMPRE a `index.html#productos` (decisión 3 del usuario), reemplazando el anterior comportamiento mixto.

**Footer columna Info (definido en `components/footer.js` → `FOOTER_INFO`):**
```
Tecnología RFID | Envíos y Devoluciones | Seguimiento | Sobre nosotros | Contacto
```

---

## Menú mobile (hamburguesa)

Implementado en **todas las páginas públicas** excepto `checkout.html`.
Ahora vive en `components/header.js` (parte del mismo componente que el header desktop).

- Botón `☰` a la izquierda del logo, visible solo en mobile (≤900px)
- Drawer lateral izquierdo: 50% del ancho (min 240px, max 320px), desliza de izquierda a derecha
- Incluye los mismos links del nav desktop + accesos directos a WhatsApp e Instagram al pie
- Función `toggleMenu()` sigue siendo **local en cada archivo** (no se centralizó porque maneja `document.body.style.overflow` y otras particularidades)
- Clases: `.menu-btn`, `.menu-overlay`, `.menu-drawer`, `.menu-drawer__link.is-active`

---

## Funcionalidades implementadas

### Tienda (index.html + producto.html)
- ✅ Carga dinámica de productos desde Google Sheets
- ✅ Modal de vista rápida con galería de fotos y selector de colores
- ✅ Página de producto dedicada con galería sticky, tabs de detalles, productos relacionados
- ✅ Swatches rectangulares con CSS variables para colores consistentes
- ✅ Estados de color en index.html y producto.html: activo / sin_stock / oferta
- ✅ Texto visible "Agotado" en toda la UI (clave interna `'sin_stock'` preservada)
- ✅ Precio de oferta en el carrito y aviso si hay producto sin stock
- ✅ Specs dinámicas en producto.html
- ✅ Carrito lateral con fotos, cantidades, nota de envío gratis
- ✅ Recuperación de fotos rotas en carrito
- ✅ Botón sticky en móvil en página de producto
- ✅ Trust badges (RFID / Envío gratis / Cambios 7 días)
- ✅ Banner dinámico en hero (cargado desde col F del Sheet)
- ✅ SEO dinámico en producto.html
- ✅ Favicon con "F" dorada en todas las páginas
- ✅ Burbuja flotante de WhatsApp en todas las páginas (vía componente)
- ✅ Burbuja WA se desplaza al abrir el carrito
- ✅ Modales legales funcionales (Privacidad, Términos, Devoluciones) — **ahora en TODAS las páginas públicas vía componente**
- ✅ Footer completo con 4 columnas — **ahora unificado vía componente**
- ✅ Menú hamburguesa mobile con drawer lateral — **ahora unificado vía componente**
- ✅ **🆕 Sesión 9:** plantilla compartida implementada (Opción A)
- ✅ **🆕 Sesión 9:** padding de badges OFERTA/AGOTADO afinado a `2px 2px`

### Checkout, seguimiento y admin
(Sin cambios en Sesión 9 — siguen funcionando exactamente igual que antes)

---

## Convenciones de código y nombres

- `_fotoCache` — cache en seguimiento.html para no repetir consultas GViz por sesión
- `parsearProductos(str)` — en seguimiento.html, parsea texto de col I en objetos `{nombre, color, cantidad, precio}`
- `SHIPPING_COST = 250`, `FREE_SHIPPING = 2000`, `CART_KEY = 'founder_cart'` — constantes en todos los archivos
- `toggleMenu()` / `toggleCart()` — funciones locales en cada archivo (no globales)
- `OD_PASOS_ENVIO / OD_PASOS_RETIRO` — arrays de pasos en admin
- `estadoAPaso(estado)` — normaliza texto libre del Sheet a índice numérico (0-3, -1=cancelado)
- `sessionStorage` se limpia automáticamente al cerrar la pestaña
- Event listener del grid de productos registrado **UNA SOLA VEZ** en `init()` (no en `renderProducts()`)
- `selectColor()` en index y producto: colores sin stock son clickeables para ver fotos; solo bloquea el carrito

### Convenciones de Sesión 8 (mantenidas)
- `todoAgotado` — flag calculada en `renderProductCard()` de index; `true` solo si `p.colors.length > 0` y **todos** los colores tienen estado `sin_stock`. Gana al badge "OFERTA" en la tarjeta de la grilla.
- **Patrón BEM unificado para badges de estado** en selectores de color:
  - `producto.html` → `.color-item__badge` (base) + `.color-item__badge--oferta` / `.color-item__badge--agotado`
  - `index.html` modal → `.color-option__badge` (base) + `.color-option__badge--oferta` / `.color-option__badge--agotado`
  - `index.html` tarjeta → `.product-card__badge-oferta` / `.product-card__badge-agotado` (comparten reglas base)

### 🆕 Convenciones agregadas en Sesión 9
- **Carpeta `components/`** — todos los componentes JS compartidos viven aquí, una IIFE por archivo.
- **`window.showLegal()` / `window.hideLegal()`** — definidas en `footer.js`, eliminadas las versiones locales en `index.html` y `producto.html`.
- **Clases unificadas:** se eliminó la dualidad `.site-header / .header`. Estándar único: **`.header / .footer / .nav / .logo / .nav__link`** (BEM corto).
- **Footer unificado:** estructura BEM `.footer__grid / .footer__col / .footer__brand / .footer__bottom / .footer__legal`. Las viejas `.footer-grid`, `.footer-col`, etc. fueron renombradas en las 5 páginas que las usaban.
- **Patrón de inyección:** componentes usan `mount.outerHTML = buildMarkup()` — el `<div id="site-...">` se reemplaza por el markup, no se queda como wrapper.
- **CSS autocontenido en footer.js:** se inyecta `<style id="founder-footer-css">` con reglas de `.legal-page` y `.wa-bubble` (idempotente).

---

## ✅ Sesión 9 — Cambios aplicados

| # | Cambio | Archivos |
|---|--------|----------|
| 1 | Creación de `components/header.js` con detección automática del link activo | NUEVO |
| 2 | Creación de `components/footer.js` con modales legales + burbuja WA + CSS autocontenido | NUEVO |
| 3 | Creación de `components/cart.js` con markup del drawer | NUEVO |
| 4 | Refactor de `index.html`: header/footer/cart reemplazados por placeholders | index |
| 5 | Refactor de `producto.html`: header/footer/cart reemplazados por placeholders | producto |
| 6 | Refactor de `contacto.html`: header/footer/cart reemplazados por placeholders | contacto |
| 7 | Refactor de `envios.html`: header/footer/cart reemplazados por placeholders | envios |
| 8 | Refactor de `seguimiento.html`: header/footer reemplazados (sin cart por diseño) | seguimiento |
| 9 | Refactor de `sobre-nosotros.html`: header/footer/cart reemplazados | sobre-nosotros |
| 10 | Refactor de `tecnologia-rfid.html`: header/footer/cart reemplazados | tecnologia-rfid |
| 11 | Unificación de clases CSS: `.site-*` → estándar BEM corto | 5 archivos |
| 12 | Unificación BEM del footer: `.footer-grid` → `.footer__grid`, etc. | 5 archivos |
| 13 | Eliminación de `showLegal/hideLegal` duplicados (ahora solo en footer.js) | index, producto |
| 14 | Tarea 2: micro-ajuste padding badges `2px 3px` → `2px 2px` | index, producto |

**Reducción total:** 11.774 → 7.496 líneas de HTML (–36% en las 7 páginas públicas).

**Validación final:** 0 errores, 0 warnings.

---

## 💡 5 propuestas para próximas sesiones

> Estas son sugerencias técnicas que aportarían valor concreto al proyecto.
> El usuario debería leerlas en la próxima sesión y elegir cuál priorizar
> (o aportar una propia). NO implementar sin que el usuario lo pida.

### 🟢 Propuesta 1 — Página "Gracias por tu compra" dedicada
**Por qué:** hoy la confirmación post-checkout vive como un estado interno de `checkout.html`. Una página dedicada (`gracias.html`) habilita: tracking de conversión limpio (Google Analytics, Meta Pixel), un mensaje más cuidado, y la posibilidad de mostrar productos relacionados o un cupón de "primera compra" para fidelizar.
**Impacto:** mejora UX post-venta + abre la puerta a remarketing.
**Esfuerzo:** 1 sesión.
**Riesgo:** bajo (no toca el flujo de compra existente, solo lo extiende).

### 🟡 Propuesta 2 — Filtros en la grilla de productos
**Por qué:** hoy `index.html` muestra todos los productos sin opción de filtrar. Cuando el catálogo crezca a 8-10+ productos, el usuario necesitará poder filtrar por: precio (rango), color disponible, o estado (en oferta / disponibles). Esto se puede hacer 100% en cliente leyendo los datos ya cargados.
**Impacto:** mejora discoverability cuando el catálogo escale.
**Esfuerzo:** 1-1.5 sesiones.
**Riesgo:** medio (toca el render de la grilla, hay que cuidar performance y mobile).

### 🟡 Propuesta 3 — Sistema de reseñas / testimonios
**Por qué:** la prueba social es uno de los factores más fuertes para convertir en e-commerce de productos premium. Se puede implementar leve: una hoja `reseñas` en el mismo Google Sheet (`producto | nombre | rating | texto | fecha`), un endpoint en el Apps Script para escribir, y un bloque `★★★★★` en cada `producto.html` que muestre las 3-5 más recientes. Moderación manual (vos aprobás antes de publicar).
**Impacto:** alto en conversión.
**Esfuerzo:** 1.5-2 sesiones.
**Riesgo:** medio (suma una hoja al Sheet y un endpoint nuevo al Apps Script).

### 🔵 Propuesta 4 — Migrar el JS principal de cada página a componentes compartidos
**Por qué:** la Sesión 9 resolvió la duplicación de **HTML** (header/footer/cart). Pero todavía hay funciones JavaScript duplicadas entre `index.html` y `producto.html`: `addToCart()`, `updateCart()`, `toggleCart()`, `recoverCartPhoto()`, parseo de fotos, helpers de formato, etc. Migrarlas a `components/cart.js` (lógica) y `components/utils.js` (helpers) eliminaría más deuda técnica y dejaría cada HTML enfocado solo en su lógica única.
**Impacto:** alto en mantenibilidad a largo plazo (sigue la línea de Sesión 9).
**Esfuerzo:** 2 sesiones (es delicado: hay que identificar bien qué es genérico vs. específico de cada página).
**Riesgo:** alto si se hace todo de golpe; bajo si se hace por fases.

### ⚪ Propuesta 5 — PWA básica (manifest + service worker)
**Por qué:** convertir el sitio en una Progressive Web App permite que los usuarios "instalen" Founder.uy en su celular como una app, abre la posibilidad de notificaciones push (futuro: avisar cuando un producto agotado vuelve a estar disponible), y mejora dramáticamente el comportamiento offline (caché de productos ya vistos). Para una marca de lujo/premium, sumar el botón "Agregar a inicio" eleva la percepción.
**Impacto:** medio en UX, alto en percepción de marca y retención.
**Esfuerzo:** 1 sesión para versión básica (manifest + service worker simple); 2-3 si se suman push notifications.
**Riesgo:** bajo (la PWA es aditiva, si falla algo el sitio sigue funcionando como SPA normal).

---

## ⬜ Backlog general (sin priorizar)

- ⬜ Mejoras de performance: lazy loading más agresivo, preconnect adicional
- ⬜ Accesibilidad: revisar contraste de colores y navegación con teclado en cada componente
- ⬜ Internacionalización: preparar el sitio para vender fuera de Uruguay (multi-moneda, multi-idioma)
- ⬜ Programa de referidos: cupón único por cliente que regala % al referido y al referente
- ⬜ Suscripción a newsletter con cupón de bienvenida
- ⬜ Galería 360° o video de productos
