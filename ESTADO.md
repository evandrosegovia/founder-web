# FOUNDER.UY — Estado del proyecto
**Última actualización:** Abril 2026 — Cierre completo de Sesión 10
**URL del sitio:** https://founder-web-gules.vercel.app
**Deploy:** Vercel → GitHub (auto-deploy en push a main)

---

## ⚠️ NOTA PARA LA PRÓXIMA SESIÓN

**Al iniciar la próxima sesión, leer en este orden:**

1. Leer este archivo (`ESTADO.md`) primero — contexto general.
2. Confirmar con el usuario qué tarea quiere abordar (todo el plan de Sesión 10 está cerrado).
3. Si hay nuevos bugs o pedidos, documentar en un nuevo `PLAN_SESION_11.md`.

**Resumen rápido del estado actual:**
- Sesión 9: migración a componentes compartidos (header, footer, cart) — completa.
- **Sesión 10: bugs + mejoras UX — completa.** 4 tareas aplicadas, 0 pendientes.
- Próximos pasos posibles: ver sección "Propuestas estratégicas" más abajo.

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
| `index.html` | Tienda principal — modal vista rápida mejorada (S10 T4) | ✅ |
| `producto.html` | Página de producto — header arreglado + botón "← Volver" (S10 T1) | ✅ |
| `checkout.html` | Checkout — formulario, cupones, confirmación | ✅ (NO usa componentes) |
| `seguimiento.html` | Seguimiento — sin carrito + footer alineado (S10 T2) | ✅ (`data-cart="false"`) |
| `envios.html` | Página informativa de envíos | ✅ |
| `admin.html` | Panel de administración | ✅ (NO usa componentes) |
| `contacto.html` | Página de contacto | ✅ |
| `tecnologia-rfid.html` | Página informativa RFID | ✅ |
| `sobre-nosotros.html` | Página institucional | ✅ |
| `components/header.js` | Header + menú mobile — soporta `data-cart="false"` (S10 T2) | ✅ |
| `components/footer.js` | Footer + modales legales + WhatsApp — **mobile minimalista (S10 T3)** | ✅ |
| `components/cart.js` | Drawer del carrito lateral | ✅ |
| `ESTADO.md` | Este archivo | 📄 |

---

## Sistema de componentes compartidos

### Arquitectura
- **Carpeta:** `components/`
- **Patrón:** IIFEs que inyectan markup en placeholders `<div id="site-*">`.
- **Opciones configurables por atributo:** `header.js` lee `data-cart` del mount; default `true`. Patrón estándar para futuras opciones.

### Footer — comportamiento responsive (S10)
- **Desktop / tablet (>600px):** grilla 4 columnas clásica (brand + productos + info + legal) + bottom bar.
- **Mobile (≤600px):** versión minimalista — logo + 4 links inline (Contacto · WhatsApp · Privacidad · Términos) + copyright. La grilla desktop se oculta. La navegación completa vive en el menú hamburguesa.

---

## ✅ Sesión 9 — Cambios aplicados (resumen)

Sistema de componentes compartidos completo: `header.js`, `footer.js`, `cart.js`. 7 páginas públicas pasaron de 11.774 a 7.496 líneas (–36%). Unificación BEM, deduplicación de modales legales, micro-ajuste badges.

---

## ✅ Sesión 10 — Cambios aplicados (completa)

### Tarea 1 — Header arreglado en `producto.html` + botón Volver restaurado
- **Archivo:** `producto.html`
- **Qué:**
  - Renombradas las 5 reglas CSS viejas (`.header__nav`, `.header__nav-link`, `.header__nav-link:hover`, `.header__nav-link.is-active`, `.header__right`) al estándar del sistema (`.nav`, `.nav__link`). Gap 36px (igual a master).
  - Botón "← Volver" restaurado via page-script que lo inyecta en el `<header>` ya renderizado. Función `goBack()` con mismo patrón que `checkout.html`. El componente `header.js` queda agnóstico — el botón es exclusivo de `producto.html`.
  - Oculto en mobile (<900px) para no competir con el hamburguesa.

### Tarea 2 — `seguimiento.html` sin carrito + header + footer alineados
- **Archivos:** `components/header.js`, `seguimiento.html`
- **Qué:**
  - `header.js`: botón carrito ahora opcional vía `data-cart="false"` en el placeholder. Default `true` → retrocompatible con las 6 páginas que ya lo usan.
  - `seguimiento.html`: `<div id="site-header" data-cart="false">` → elimina botón fantasma.
  - `seguimiento.html`: **completadas las variables CSS faltantes** en `:root` (`--space-xs/sm/md/lg/xl/xxl`, `--transition-fast/base`, `--color-border`, `--color-danger`, `--z-header/cart/modal/toast`). Antes las usaba el footer pero no existían → por eso se veía "roto".
  - `seguimiento.html`: header CSS reemplazado por el estándar del sistema (padding con `var(--space-lg)`, gap 36px, z-index y border alineados al master).
  - `seguimiento.html`: eliminado CSS muerto (`.header-back-btn`, `.wa-header-btn`, `.nav-link` sin BEM) — 31 líneas menos.
  - `seguimiento.html`: footer CSS pasa a usar variables del sistema (antes hardcoded).

### Tarea 3 — Footer mobile minimalista (Opción C)
- **Archivo:** `components/footer.js`
- **Qué:**
  - Nuevo bloque `<div class="footer__mobile">` al markup con: logo FOUNDER + 4 links inline separados por `·` (Contacto · WhatsApp · Privacidad · Términos) + copyright.
  - CSS autocontenido: en desktop `.footer__mobile { display: none }`. En mobile (≤600px) se oculta la grilla y bottom-bar, se muestra solo el bloque minimal.
  - No se tocó ninguna página individual — todo vive en el componente compartido. Se aplica automáticamente a las 7 páginas.

### Tarea 4 — Modal vista rápida en `index.html` (5 sub-cambios)
- **Archivo:** `index.html`
- **4a:** Botón "Ver página completa" ahora en blanco (`color: var(--color-text)` y `border: 1px solid var(--color-text)`). Hover dorado mantenido.
- **4b:** Specs del modal pasan de columna única a grilla 2×3 (`grid-template-columns: 1fr 1fr; gap: 10px 20px`).
- **4c:** Eliminada la regla `.color-option--oferta .color-swatch::after` (estrella ★). El badge rectangular dorado OFERTA se mantiene.
- **4d:** Filtrado de specs en mobile — muestra solo las que contengan keywords `monedero / rfid / tarjeta` (case-insensitive, substring). Fallback: si no matchea ninguna, muestra las primeras 3.
- **4e:** En mobile el título `.modal__name` pasa a `font-size: 26px`, `letter-spacing: 2px`, `white-space: nowrap` con `text-overflow: ellipsis` como seguro. Las specs vuelven a 1 columna en mobile.

### Decisiones tomadas por el usuario en la sesión
- Orden: primero bugs (1, 2), después mejoras (3, 4).
- Botón "← Volver" en `producto.html`: **restaurar** (solo en esa página).
- Footer mobile: **Opción C minimalista**.

### Validación final Sesión 10
- **40/40 checks automáticos pasaron**, 0 errores, 0 warnings.
- Sintaxis JS válida en `header.js` y `footer.js`.
- Tags HTML balanceados en las 3 páginas modificadas.
- Otras 5 páginas sin modificar siguen intactas.

### Diferencias de líneas
| Archivo | Antes | Después | Diff |
|---|---|---|---|
| `producto.html` | 1437 | 1469 | +32 (script botón Volver) |
| `seguimiento.html` | 1567 | 1536 | **−31 (CSS muerto eliminado)** |
| `index.html` | 1631 | 1646 | +15 (filtro specs + media query modal) |
| `components/header.js` | 106 | 117 | +11 (lógica `data-cart`) |
| `components/footer.js` | 228 | 298 | +70 (markup + CSS mobile minimalista) |

---

## 🎯 Propuestas estratégicas (para próximas sesiones)

### 🟢 Propuesta 1 — Página "Gracias por tu compra" dedicada
Tracking de conversión + mensaje post-venta + cupón "primera compra". Esfuerzo: 1 sesión. Riesgo: bajo.

### 🟡 Propuesta 2 — Filtros en la grilla de productos
Filtrar por precio, color, estado. Útil cuando el catálogo crezca a 8-10+ productos. Esfuerzo: 1-1.5 sesiones. Riesgo: medio.

### 🟡 Propuesta 3 — Sistema de reseñas / testimonios
Hoja `reseñas` en el Sheet + endpoint Apps Script + bloque ★★★★★ en `producto.html`. Moderación manual. Esfuerzo: 1.5-2 sesiones. Riesgo: medio.

### 🔵 Propuesta 4 — Migrar JS duplicado a componentes compartidos
`addToCart()`, `updateCart()`, `toggleCart()` están duplicados entre `index.html` y `producto.html`. Mover a `components/cart.js` + `components/utils.js`. Esfuerzo: 2 sesiones por fases. Riesgo: alto si se hace de golpe, bajo por fases.

### 🔵 Propuesta 5 — PWA / instalable
Manifest + service worker para que el sitio se "instale" como app en el celular. Esfuerzo: 1 sesión. Riesgo: bajo.

---

## Navegación — estructura actual

### Nav del header (`components/header.js` → `NAV_LINKS`)
```
Inicio | Productos | Tecnología RFID | Seguí tu compra | Sobre nosotros | Contacto
```

| Página | Link activo | Carrito | Particularidades |
|---|---|---|---|
| `index.html` | Inicio | ✅ | Modal vista rápida + grilla |
| `producto.html` | (ninguno) | ✅ | + botón "← Volver" exclusivo |
| `tecnologia-rfid.html` | Tecnología RFID | ✅ | — |
| `seguimiento.html` | Seguí tu compra | ❌ | `data-cart="false"` |
| `sobre-nosotros.html` | Sobre nosotros | ✅ | — |
| `contacto.html` | Contacto | ✅ | — |
| `envios.html` | — (solo footer) | ✅ | — |
| `checkout.html` | Excluido | ❌ | Header simplificado propio |
| `admin.html` | Excluido | ❌ | Panel con password |

**Footer columna Info:** Tecnología RFID · Envíos y Devoluciones · Seguimiento · Sobre nosotros · Contacto
**Footer mobile (S10):** FOUNDER · Contacto · WhatsApp · Privacidad · Términos · © 2026

---

## Menú mobile (hamburguesa)
Implementado en todas las páginas públicas excepto `checkout.html`. Vive en `components/header.js`.
