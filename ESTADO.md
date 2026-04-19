# FOUNDER.UY — Estado del proyecto
**Última actualización:** Abril 2026 — Cierre parcial de Sesión 10 (Tareas 1 y 2)
**URL del sitio:** https://founder-web-gules.vercel.app
**Deploy:** Vercel → GitHub (auto-deploy en push a main)

---

## ⚠️ NOTA PARA LA PRÓXIMA SESIÓN

**Al iniciar la próxima sesión, leer en este orden:**

1. Leer este archivo (`ESTADO.md`) primero — contexto general.
2. Leer `PLAN_SESION_10.md` — **solo Tareas 3 y 4** (las 1 y 2 ya están cerradas).
3. Confirmar con el usuario si quiere seguir con las tareas pendientes de Sesión 10 o abrir propuestas nuevas.

**Resumen rápido del estado actual:**
- Sesión 9 cerrada con la **migración a componentes compartidos** completada.
- **Sesión 10 abierta y cerrada parcialmente:**
  - ✅ Tarea 1 aplicada: header arreglado en `producto.html` + botón "← Volver" restaurado.
  - ✅ Tarea 2 aplicada: botón carrito ya no aparece en `seguimiento.html` y footer alineado al estándar.
  - ⏳ Tarea 3 (footer mobile, Opción C minimalista) — **pendiente**, decisión ya tomada.
  - ⏳ Tarea 4 (modal vista rápida, 5 sub-cambios) — **pendiente**.

**Regla crítica que se mantiene:** la clave interna `'sin_stock'` **NO se modifica jamás**. Solo se cambia el texto visible al usuario.

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
| `producto.html` | Página de producto — galería, colores, specs dinámicas, estados, relacionados | ✅ Activo + componentizado + botón Volver restaurado (S10) |
| `checkout.html` | Checkout — formulario, cupones, confirmación | ✅ Activo (NO usa componentes) |
| `seguimiento.html` | Seguimiento de pedidos — fotos de productos | ✅ Activo + componentizado (sin cart, `data-cart="false"`) |
| `envios.html` | Página informativa de envíos | ✅ Activo + componentizado |
| `admin.html` | Panel de administración — specs, estados de color, tracking, pedidos | ✅ Activo (NO usa componentes) |
| `contacto.html` | Página de contacto | ✅ Activo + componentizado |
| `tecnologia-rfid.html` | Página informativa RFID | ✅ Activo + componentizado |
| `sobre-nosotros.html` | Página institucional | ✅ Activo + componentizado |
| `components/header.js` | Header + menú mobile (compartido) — **soporta `data-cart="false"` desde S10** | ✅ |
| `components/footer.js` | Footer + modales legales + burbuja WhatsApp (compartido) | ✅ |
| `components/cart.js` | Drawer del carrito lateral (compartido) | ✅ |
| `ESTADO.md` | Este archivo — estado general del proyecto | 📄 Documentación |
| `PLAN_SESION_10.md` | Plan de tareas para Sesión 10 (tareas 3 y 4 pendientes) | 📄 Documentación |

---

## Sistema de componentes compartidos (Sesión 9)

### Arquitectura
- **Carpeta:** `components/`
- **Patrón:** componentes JavaScript inyectados (Opción A)
- **Estrategia:** cada componente es una IIFE (función auto-ejecutable) que renderiza su HTML en un `<div id="...">` y, si necesita CSS no global, lo inyecta en `<head>`.
- **Footer unificado:** estructura BEM `.footer__grid / .footer__col / .footer__brand / .footer__bottom / .footer__legal`.
- **Patrón de inyección:** componentes usan `mount.outerHTML = buildMarkup()` — el `<div id="site-...">` se reemplaza por el markup, no se queda como wrapper.
- **CSS autocontenido en footer.js:** se inyecta `<style id="founder-footer-css">` con reglas de `.legal-page` y `.wa-bubble` (idempotente).
- **NUEVO S10: opciones configurables por atributo** — `header.js` ahora lee `data-cart` del mount para decidir si renderiza el botón del carrito. Default `true` (retrocompatible). Este patrón queda como estándar para futuras opciones del componente.

---

## ✅ Sesión 9 — Cambios aplicados

| # | Cambio | Archivos |
|---|--------|----------|
| 1 | Creación de `components/header.js` con detección automática del link activo | NUEVO |
| 2 | Creación de `components/footer.js` con modales legales + burbuja WA + CSS autocontenido | NUEVO |
| 3 | Creación de `components/cart.js` con markup del drawer | NUEVO |
| 4-10 | Refactor de las 7 páginas públicas: header/footer/cart reemplazados por placeholders | 7 archivos |
| 11 | Unificación de clases CSS: `.site-*` → estándar BEM corto | 5 archivos |
| 12 | Unificación BEM del footer: `.footer-grid` → `.footer__grid`, etc. | 5 archivos |
| 13 | Eliminación de `showLegal/hideLegal` duplicados (ahora solo en footer.js) | index, producto |
| 14 | Tarea 2: micro-ajuste padding badges `2px 3px` → `2px 2px` | index, producto |

**Reducción total S9:** 11.774 → 7.496 líneas de HTML (–36% en las 7 páginas públicas).

---

## ✅ Sesión 10 (parcial) — Cambios aplicados

| # | Cambio | Archivos tocados |
|---|--------|------------------|
| 1 | **Tarea 1 — Header arreglado en `producto.html`**: renombradas las 5 reglas CSS viejas (`.header__nav`, `.header__nav-link`, `.header__nav-link:hover`, `.header__nav-link.is-active`, `.header__right`) al estándar del sistema (`.nav`, `.nav__link`, etc.). Gap alineado a 36px (igual que `index.html`). Media query mobile actualizado. | `producto.html` |
| 2 | **Tarea 1 — Botón "← Volver" restaurado**: se agregó un page-script al final del bloque del header que inyecta el botón dentro del `<header>` ya renderizado por el componente, más la función `goBack()` (mismo patrón que `checkout.html`). Decisión: el componente `header.js` queda agnóstico — el botón es exclusivo de `producto.html` y no contamina las otras 6 páginas. Oculto en mobile (<900px) para no competir con el hamburguesa. | `producto.html` |
| 3 | **Tarea 2 — Botón carrito opcional en el componente**: `header.js` ahora acepta un atributo `data-cart="false"` en el placeholder para omitir el botón del carrito. Default `true` → retrocompatible con las 6 páginas que ya lo usan. Patrón escalable si en el futuro hace falta desactivar otros elementos del header por página. | `components/header.js` |
| 4 | **Tarea 2 — `seguimiento.html` sin carrito**: el placeholder pasó a `<div id="site-header" data-cart="false">`. El botón fantasma "Carrito 0" que aparecía sin funcionalidad desde S9 queda eliminado. | `seguimiento.html` |
| 5 | **Tarea 2 — Footer corrido en `seguimiento.html` corregido**: el footer tenía valores hardcoded (`60px 40px 32px`, `48px`, `rgba(255,255,255,0.07)`, `gap: 10px`) que divergían del resto del sitio. Se reemplazaron por las variables CSS del sistema (`var(--space-xl)`, `var(--space-lg)`, `var(--color-border)`, `gap: 12px`). El media query mobile también se igualó al master. | `seguimiento.html` |

**Validación final S10 parcial:** 32/33 checks automáticos pasaron. El único "fallo" era un falso positivo del script (regex multi-línea) verificado manualmente OK.

**Diferencias de líneas:**
- `producto.html`: 1437 → 1469 (+32 líneas, por el script del botón Volver)
- `seguimiento.html`: 1567 → 1568 (+1 línea, el atributo `data-cart`)
- `components/header.js`: 106 → 117 (+11 líneas, lógica condicional + documentación)

**Decisiones que tomó el usuario durante la sesión:**
- Orden: primero los 2 bugs (1 y 2). Las mejoras 3 y 4 se postergan para validar el sitio antes.
- Botón "← Volver" en producto: **restaurar** (solo en esa página).
- Footer mobile (cuando se haga): **Opción C — minimalista** (logo + 4 links inline + copyright).

---

## 🔴 Pendientes para la próxima sesión

| # | Prioridad | Tarea | Tipo | Archivos |
|---|---|---|---|---|
| 3 | 🟡 Media | Footer mobile minimalista (Opción C ya elegida) | Mejora UX | `components/footer.js` |
| 4 | 🟡 Media | Modal vista rápida en `index.html` (5 sub-cambios: 4a botón blanco, 4b grilla 2 cols, 4c quitar estrella swatch oferta, 4d mobile solo 3 specs, 4e título en 1 línea) | Mejora UX | `index.html` |

Ver `PLAN_SESION_10.md` para el detalle técnico de ambas.

---

## 💡 Propuestas estratégicas (para después de cerrar Sesión 10 completa)

### 🟢 Propuesta 1 — Página "Gracias por tu compra" dedicada
Habilita tracking de conversión limpio y permite un mensaje post-venta más cuidado. Esfuerzo: 1 sesión. Riesgo: bajo.

### 🟡 Propuesta 2 — Filtros en la grilla de productos
Útil cuando el catálogo crezca a 8-10+ productos. Filtrar por precio, color, o estado. Esfuerzo: 1-1.5 sesiones. Riesgo: medio.

### 🟡 Propuesta 3 — Sistema de reseñas / testimonios
Una hoja `reseñas` en el mismo Sheet + endpoint en Apps Script + bloque `★★★★★` en `producto.html`. Moderación manual. Esfuerzo: 1.5-2 sesiones. Riesgo: medio.

### 🔵 Propuesta 4 — Migrar el JS principal a componentes compartidos
Continuar la línea de S9: `addToCart()`, `updateCart()`, `toggleCart()`, etc. están duplicados entre `index.html` y `producto.html`. Migrarlos a `components/cart.js` (lógica) y `components/utils.js` (helpers). Esfuerzo: 2 sesiones en fases. Riesgo: alto si se hace de golpe.

### 🔵 Propuesta 5 — PWA / instalable
Convertir el sitio en PWA con manifest + service worker. Permite "instalar" la tienda como app en el celular. Esfuerzo: 1 sesión. Riesgo: bajo.

---

## Navegación — estructura actual

### Nav del header (definido en `components/header.js` → `NAV_LINKS`)
```
Inicio | Productos | Tecnología RFID | Seguí tu compra | Sobre nosotros | Contacto
```

| Página | Link activo | Carrito en header |
|---|---|---|
| `index.html` | Inicio | ✅ |
| `producto.html` | (ninguno) + botón "← Volver" adicional | ✅ |
| `tecnologia-rfid.html` | Tecnología RFID | ✅ |
| `seguimiento.html` | Seguí tu compra | ❌ (`data-cart="false"`) |
| `sobre-nosotros.html` | Sobre nosotros | ✅ |
| `contacto.html` | Contacto | ✅ |
| `envios.html` | Ninguno (no está en nav, solo en footer) | ✅ |
| `checkout.html` | Header simplificado — excluido del nav | ❌ (propio) |
| `admin.html` | Nav interno propio — excluido | ❌ (propio) |

**Footer columna Info (definido en `components/footer.js` → `FOOTER_INFO`):**
```
Tecnología RFID | Envíos y Devoluciones | Seguimiento | Sobre nosotros | Contacto
```

---

## Menú mobile (hamburguesa)

Implementado en **todas las páginas públicas** excepto `checkout.html`.
Vive en `components/header.js` (parte del mismo componente que el header desktop).
