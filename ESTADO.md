# FOUNDER.UY — Estado del proyecto
**Última actualización:** Abril 2026 — Cierre completo de Sesión 11 + S11-bis (sistema global de validación de stock)
**URL del sitio:** https://founder-web-gules.vercel.app
**Deploy:** Vercel → GitHub (auto-deploy en push a main)

---

## ⚠️ NOTA PARA LA PRÓXIMA SESIÓN

**Al iniciar la próxima sesión, leer en este orden:**

1. Leer este archivo (`ESTADO.md`) primero — contexto general.
2. Confirmar con el usuario qué tarea abordar. Hay 4 propuestas estratégicas pendientes (ver sección al final).

**Resumen rápido:**
- Sesión 9: migración a componentes compartidos — completa.
- Sesión 10: 4 tareas UX — completa.
- Sesión 10 EXTRA: reconstrucción de `seguimiento.html` usando `envios.html` como plantilla — resolvió bugs crónicos.
- Sesión 11: 4 tareas UX mobile + aviso de sin stock por-item — completa.
- **Sesión 11-bis:**
  - Header de `producto.html` arreglado (clases viejas `.header__nav` → estándar `.nav`).
  - Aviso "Agotado" ahora se valida y muestra en **TODO el sitio** (las 7 páginas públicas + checkout), no solo en index/producto.
  - Módulo central en `components/cart.js` con API `window.founderCart`.
  - Bloqueo de "Finalizar compra" si hay items agotados (con toast + scroll al item).
  - Auto-eliminación de items agotados al volver el usuario + toast "Sacamos X de tu carrito porque se agotó".

**Regla crítica:** la clave interna `'sin_stock'` NO se modifica jamás. Solo el texto visible ("Agotado").

---

## Datos clave del proyecto

| Dato | Valor |
|------|------|
| Google Sheet ID | `1dna_Tf8kmJNHLhzhozVAzBxTMAVTT_Tvi7fARdbZvh8` |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbx8LByXXY7QwzHEB0RyvP0Ejbmqyw099F4ntbbwRIdkRv8JlUDaryn_vQj2aL9kANA/exec` |
| WhatsApp | 598098550096 |
| Instagram | @founder.uy |
| Password admin | `nerito20` (solo en admin.html) |
| Google Client ID | `733837099876-opi6t9ohpru1c7su1hbgj8kqrvmqp1nh.apps.googleusercontent.com` |
| Envío gratis desde | $2.000 UYU |
| Costo de envío | $250 UYU — vía agencia UES (o cadetería en Montevideo) |
| Descuento transferencia | 10% — solo por transferencia bancaria |
| Retiro en local | Zona Prado, Montevideo |

---

## Archivos del proyecto

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `index.html` | Tienda principal — modal fullscreen mobile + aviso sin stock + integra módulo founderCart (S11-bis) | ✅ |
| `producto.html` | Página producto — header arreglado + 4 ajustes mobile + integra módulo founderCart (S11-bis) | ✅ |
| `checkout.html` | Checkout — revalida stock al cargar + bloquea processOrder si hay agotados (S11-bis) | ✅ |
| `seguimiento.html` | Seguimiento — integra módulo founderCart (S11-bis) | ✅ |
| `envios.html` | Envíos — integra módulo founderCart (S11-bis) | ✅ |
| `admin.html` | Admin (NO usa componentes) | ✅ |
| `contacto.html` | Contacto — ⚠️ pendiente integrar módulo founderCart manualmente | ⚠️ |
| `tecnologia-rfid.html` | RFID — integra módulo founderCart (S11-bis) | ✅ |
| `sobre-nosotros.html` | Sobre nosotros — integra módulo founderCart (S11-bis) | ✅ |
| `components/header.js` | Header + menú mobile — soporta `data-cart` (S10) | ✅ |
| `components/footer.js` | Footer — link "Envíos y Devoluciones" en mobile (S11) | ✅ |
| `components/cart.js` | Drawer del carrito + **módulo central `window.founderCart`** + CSS unificado del aviso "Agotado" (S11-bis) | ✅ |
| `ESTADO.md` | Este archivo | 📄 |

---

## Sistema de componentes compartidos

### Arquitectura
- Carpeta `components/`. Patrón IIFE que inyecta markup en placeholders `<div id="site-*">`.
- Configurables por atributo: `header.js` lee `data-cart` del mount (default `true`).

### Páginas que usan los 3 componentes (header + footer + cart)
Todas las públicas EXCEPTO `checkout.html` y `admin.html`:
- `index.html`, `producto.html`, `contacto.html`, `envios.html`, `sobre-nosotros.html`, `tecnologia-rfid.html`, `seguimiento.html`

### Footer responsive (S10)
- Desktop/tablet (>600px): grilla 4 columnas + bottom bar.
- Mobile (≤600px): logo + 4 links inline (Contacto · WhatsApp · Privacidad · Términos) + copyright. Navegación completa en el menú hamburguesa.

---

## ✅ Sesión 9 (resumen)
Sistema de componentes compartidos completo. 7 páginas públicas: 11.774 → 7.496 líneas (–36%). Unificación BEM, deduplicación modales legales, micro-ajuste badges.

---

## ✅ Sesión 10 — Cambios aplicados

### Tarea 1 — Header en `producto.html` + botón Volver
- Reglas CSS viejas (`.header__nav`, etc.) renombradas al estándar (`.nav`, `.nav__link`).
- Botón "← Volver" restaurado via page-script. Función `goBack()` con patrón de checkout.html.
- Oculto en mobile (<900px).

### Tarea 2 — `seguimiento.html` sin carrito + alineaciones
- `header.js`: botón carrito opcional vía `data-cart="false"` (retrocompatible).
- Variables CSS completadas en `:root`.
- CSS muerto eliminado.

### Tarea 3 — Footer mobile minimalista
- `components/footer.js`: nuevo bloque `.footer__mobile` con logo + 4 links inline + copyright.
- CSS autocontenido. En mobile (≤600px) oculta grilla y bottom-bar.

### Tarea 4 — Modal vista rápida en `index.html`
- 4a: Botón "Ver página completa" en blanco.
- 4b: Specs en grilla 2×3.
- 4c: Eliminada estrella ★ del swatch oferta.
- 4d: Filtro mobile solo 3 specs (monedero/rfid/tarjeta) con fallback.
- 4e: Título modal en mobile en una sola línea.

### S10 EXTRA — Reconstrucción de `seguimiento.html`
- **Problema:** CSS divergente, `.logo` duplicado, `main` con padding insuficiente (título cortado), faltaba `cart.js`.
- **Decisión del usuario:** aplicar las MISMAS condiciones que `envios.html`.
- **Solución:** reconstrucción completa usando `envios.html` como plantilla. Mismo head, tokens CSS, header `position: sticky`, los 3 componentes activos. Contenido propio intacto.
- Resultado: 1498 → 1875 líneas (aumento porque ahora incluye sistema de carrito completo que antes no tenía).

### Decisiones del usuario S10
- Orden: bugs primero (1, 2), luego mejoras (3, 4).
- Botón "← Volver" en producto: restaurar solo en esa página.
- Footer mobile: Opción C minimalista.
- `seguimiento.html`: aplicar las mismas condiciones que `envios.html`.

---

## ✅ Sesión 11 — Cambios aplicados

### Tarea 3 — Footer mobile: link "Envíos y Devoluciones"
- `components/footer.js`: en el bloque `footer__mobile-links`, el link a WhatsApp fue reemplazado por un link a `envios.html` con texto "Envíos y Devoluciones".
- Mantiene la misma capitalización que el link del footer desktop (consistencia con `FOOTER_INFO`).
- La burbuja flotante de WhatsApp (`.wa-bubble`) NO se tocó — sigue disponible globalmente.

### Tarea 2 — 4 ajustes mobile en `producto.html`
- **2a — Specs 3+3:** en `@media (max-width: 900px)` se cambió `.specs-list { grid-template-columns: 1fr; }` por `1fr 1fr` con gap ajustado. Los 6 puntos quedan en 2 columnas.
- **2b — Burbuja WA no tapa "Agregar al carrito":** se extendió el `IntersectionObserver` existente del sticky para que también toggle la clase `has-sticky-add` en `body`. Nueva regla `body.has-sticky-add .wa-bubble { opacity: 0; pointer-events: none; }` en mobile. Al aparecer el footer, el sticky desaparece y la burbuja WA vuelve a mostrarse.
- **2c — Menos separación bajo trust-badges:** `.trust-badges { margin-bottom: 4px; }` + `.details-section { padding: 28px 24px 60px; }` (antes era `60px 24px`) en mobile.
- **2d — 3 tabs entran sin scroll:** en `@media (max-width: 600px)` se agregó override `.tabs { overflow-x: visible }` + `.tab-btn { flex: 1; padding: 14px 6px; font-size: 9px; letter-spacing: 1.5px; white-space: normal; text-align: center; line-height: 1.3; }`. Desktop queda igual.

### Tarea 1 — Modal fullscreen mobile en `index.html`
- En `@media (max-width: 600px)` se agregó bloque `S11 T1`:
  - `.modal-overlay { padding: 0 }` — elimina el padding de 40px.
  - `.modal` pasa a `100vw` × `100dvh` sin borde (uso de `100dvh` para iOS — altura dinámica de viewport).
  - `.modal__close` pasa a `position: fixed` arriba-derecha, 40×40, círculo semi-transparente con `backdrop-filter: blur(8px)` para ser siempre visible al scrollear.
- Desktop queda exactamente igual (max-width 900px, max-height 90vh centrado).

### Tarea 4 — Aviso de sin stock por-item (reemplaza el aviso global)
**Decisión arquitectónica clave:** el aviso global `#cartStockWarning` vivía en `components/cart.js`, pero sólo se activaba desde `checkCartStock()` en `index.html` y `producto.html`. Las otras 5 páginas que usan `cart.js` (contacto, envios, sobre-nosotros, tecnologia-rfid, seguimiento) nunca lo activaban → era código muerto en esas páginas.

**Cambios aplicados:**
- **`components/cart.js`:** removido el `<div id="cartStockWarning">` y actualizada la documentación del header del archivo. La lista de IDs expuestos ya no incluye `#cartStockWarning`.
- **`index.html` y `producto.html`** (idénticos para consistencia):
  - CSS: se reemplazó `.cart-stock-warning` por 3 clases nuevas: `.cart-item--sin-stock` (borde rojo izquierdo al item), `.cart-item__stock-alert` (bloque rojo interno con mensaje + botones), `.stock-btn` / `.stock-btn--remove` / `.stock-btn--other`.
  - `.cart-item` recibió `flex-wrap: wrap` para que la alerta interna caiga debajo ocupando todo el ancho del item.
  - `updateCart()`: ahora marca cada item con `.cart-item--sin-stock` y renderiza el bloque de alerta con 2 botones si `isItemSinStock(item)` es true.
  - Nueva función `isItemSinStock(item)`: reemplaza a la vieja `checkCartStock()`. Resuelve según el state disponible: en `index.html` usa `state.products`; en `producto.html` usa `state.allProducts` con fallback a `state.product` si el catálogo completo aún no cargó.
  - Nuevas funciones `removeSinStockItem(idx)` (elimina + toast) y `buscarOtroModelo(idx)` (elimina + cierra carrito + scroll a grilla en index.html o `window.location.href = 'index.html#productos'` desde producto.html).
  - `toggleCart()` ahora llama a `updateCart()` al abrir (antes llamaba `checkCartStock()`).
  - Tras cargar el catálogo se llama `updateCart()` si hay carrito persistido — garantiza que los avisos aparezcan desde la primera vez que el usuario abre el carrito.
  - Eliminada la función `checkCartStock()` en ambos archivos.

### Decisiones del usuario S11
- Orden de ejecución: 3 → 2 → 1 → 4 (recomendado, de menos a más riesgoso).
- Tarea 3: aplicar solo en footer mobile (desktop queda con "Envíos y Devoluciones" ya existente).
- Tarea 2b: **ocultar** la burbuja WA cuando el sticky-add está visible (no subirla).

---

## ✅ Sesión 11-bis — Cambios aplicados (refuerzo post-Sesión 11)

### Bug reportado por el usuario
1. Header de `producto.html` roto (menú desalineado en mobile y desktop).
2. Aviso del item sin stock con recuadro "no cerrado" — estética pobre.
3. Texto "Sin stock" → preferencia "Agotado".
4. **Bug funcional crítico**: si el comprador navegaba a una página secundaria (envios, contacto, etc.), el aviso de agotado NO se mostraba, y peor: podía **finalizar compra igual** desde ahí.

### Fix 1 — Header de `producto.html`
Las reglas CSS del header tenían nomenclatura vieja (`.header__nav`, `.header__nav-link`, `.header__right`, `.header__back`) que no matcheaba el markup inyectado por `components/header.js` (que usa `.nav` y `.nav__link`). Renombradas al estándar. CSS muerto eliminado.

### Fix 2 — Recuadro cerrado + texto "Agotado"
- El `.cart-item--sin-stock` pasó de tener solo `border-left: 3px` a ser un **recuadro completo** con borde en los 4 lados, padding uniforme (14px) y border-radius. La alerta interna queda simétrica adentro.
- Texto del mensaje: "Este producto se quedó sin stock" → **"Este producto está agotado"**.
- Texto del toast al eliminar: "Producto sin stock eliminado" → "Producto agotado eliminado".

### Fix 3 — Sistema global de validación de stock (cambio arquitectónico mayor)

**Problema raíz:** la lógica `isItemSinStock()` vivía duplicada en `index.html` y `producto.html`, dependía de variables locales (`state.products`, `state.allProducts`) que no existen en las 5 páginas secundarias. Resultado: navegar a otra página hacía "desaparecer" los avisos y el usuario podía confirmar la compra.

**Solución: módulo central en `components/cart.js` con API `window.founderCart`:**

- **`getStockSnapshot()` / `saveStockSnapshot(products)`**: cache en `localStorage` (key `founder_stock_snapshot`) con la lista de combos `modelo|color` agotados. Lo **escriben** solo `index.html` y `producto.html` (que cargan el catálogo desde Google Sheets); lo **leen** TODAS las páginas.
- **`isItemSinStock(item)`**: devuelve `true/false` leyendo el cache. No requiere tener el catálogo en memoria.
- **`renderStockAlertHTML(idx)`**: devuelve el HTML del bloque rojo interno con mensaje + 2 botones. Consumido por `updateCart()`/`updateCartUI()` en cada página.
- **`pruneSinStock(cart)`**: auto-elimina items agotados al arrancar la página (respuesta a la decisión del usuario: "auto-eliminar con toast"). Encola los nombres eliminados en `sessionStorage` (key `founder_autoremoved`).
- **`flushAutoRemoveToast()`**: dispara el toast **"Sacamos X de tu carrito porque se agotó"** en la próxima llamada a `updateCart`. Centralizado y consistente en todas las páginas.
- **`canCheckout(cart)`**: valida el carrito antes de ir al checkout. Devuelve `{ ok, blockedItem, message }`.

**CSS unificado:** los estilos de `.cart-item--sin-stock`, `.cart-item__stock-alert`, `.stock-btn` se migraron desde `index.html`/`producto.html` hacia `components/cart.js` (se inyectan automáticamente). Elimina duplicación.

**Bloqueo de "Finalizar compra":** en las 6 páginas con `cart.js`, `openCheckout()` ahora llama `founderCart.canCheckout()` antes de redirigir. Si hay agotados → toast de advertencia + scroll al item bloqueante. Botón **activo** (no deshabilitado), coherente con la decisión del usuario.

**Doble seguro en `checkout.html`:** como `checkout.html` no carga `cart.js` (tiene header propio), inyecté inline las helpers `_stockSnapshot()` y `findSinStockInCart()` que leen el mismo cache. Esto revalida al cargar la página y vuelve a chequear dentro de `processOrder()` — ni siquiera con link directo se puede confirmar un pedido con agotados.

### Decisiones del usuario S11-bis
- Recuadro: **cerrado** con bordes parejos.
- Texto: "⚠ Este producto está agotado".
- Botón "Finalizar compra": **activo pero con toast de advertencia al click**.
- Auto-eliminación: **silenciosa + toast al volver** ("Sacamos X de tu carrito porque se agotó").

### Archivos tocados en S11-bis
`components/cart.js` (corazón del sistema) · `index.html` · `producto.html` · `envios.html` · `sobre-nosotros.html` · `tecnologia-rfid.html` · `seguimiento.html` · `checkout.html`. Total: **8 archivos.**

### ⚠️ Archivo NO tocado: `contacto.html`
Ese archivo no estaba disponible en la carpeta del proyecto en esta sesión. **Queda pendiente aplicarle el mismo patch manualmente** (lo mismo que `sobre-nosotros.html`): integrar `founderCart` en su `updateCartUI` + reemplazar `openCheckout`. Ver ESTADO para detalle de cambios a aplicar.

---

## 📋 Sesión 12 — Pendiente de definir

Ver "Propuestas estratégicas" abajo.

| # | Prioridad | Propuesta |
|---|---|---|
| 1 | 🔴 Alta | **Aplicar patch de founderCart a `contacto.html`** (quedó sin tocar en S11-bis) |
| 2 | 🟢 Baja | Página "Gracias por tu compra" + cupón fidelización |
| 3 | 🟡 Media | Filtros en grilla (cuando crezca el catálogo) |
| 4 | 🟡 Media | Reseñas/testimonios de clientes |
| 5 | 🔵 Técnica | PWA / instalable (manifest + service worker) |

---

## Navegación

### Nav del header (`components/header.js` → `NAV_LINKS`)
```
Inicio | Productos | Tecnología RFID | Seguí tu compra | Sobre nosotros | Contacto
```

| Página | Link activo | Carrito | Notas |
|---|---|---|---|
| `index.html` | Inicio | ✅ | Modal vista rápida + grilla |
| `producto.html` | — | ✅ | + botón "← Volver" |
| `tecnologia-rfid.html` | Tecnología RFID | ✅ | — |
| `seguimiento.html` | Seguí tu compra | ✅ | S10 extra: reconstruido base envios |
| `sobre-nosotros.html` | Sobre nosotros | ✅ | — |
| `contacto.html` | Contacto | ✅ | — |
| `envios.html` | — (solo footer) | ✅ | — |
| `checkout.html` | Excluido | ❌ | Header propio |
| `admin.html` | Excluido | ❌ | Panel con password |

**Footer columna Info:** Tecnología RFID · Envíos y Devoluciones · Seguimiento · Sobre nosotros · Contacto
**Footer mobile (S11):** FOUNDER · Contacto · Envíos y Devoluciones · Privacidad · Términos · © 2026

---

## Menú mobile (hamburguesa)
En todas las páginas públicas excepto `checkout.html`. Vive en `components/header.js`.
