# FOUNDER.UY — Estado del proyecto

**Última actualización:** Abril 2026 — Cierre de Sesión 11 consolidada
**URL del sitio:** https://founder-web-gules.vercel.app
**Deploy:** Vercel → GitHub (auto-deploy en push a `main`)

---

## ⚠️ INSTRUCCIONES PARA LA PRÓXIMA SESIÓN

1. Leer este archivo (`ESTADO.md`) primero — es la única fuente de verdad del proyecto.
2. Confirmar con el usuario qué tarea abordar (ver **Propuestas estratégicas** al final).
3. Respetar las reglas críticas listadas más abajo.

---

## 🎯 Regla de negocio final: manejo de productos agotados

**Si un producto del carrito está agotado → se elimina automáticamente del carrito + notificación recuadrada.**

- **TODAS las páginas** consultan el stock actual al cargar — no dependen de que el usuario haya pasado por index/producto antes.
- La notificación recuadrada aparece dentro del drawer del carrito (páginas con `cart.js`) o arriba del formulario (checkout).
- En el checkout, hay **doble seguro**: revalidación al cargar + revalidación al confirmar pedido (por si el producto se agotó mientras el usuario llenaba el form).
- La notificación incluye un link "Ver otros modelos →" que lleva a `index.html#productos`.

### Reglas críticas NO NEGOCIABLES
- La clave interna `'sin_stock'` NO se modifica jamás. Solo el texto visible para el usuario.
- El sistema de componentes (`components/header.js`, `footer.js`, `cart.js`) es la única fuente de verdad para header/footer/carrito. No replicar markup en HTMLs.
- `checkout.html` y `admin.html` quedan excluidos del sistema de componentes — ambos tienen header propio.
- Cuando se toque `cart.js`, recordar que 6 páginas dependen de él. Validar sintaxis + probar el flujo completo.

---

## 📂 Arquitectura del sistema de carrito

### Datos persistidos
| Clave | Storage | Escrito por | Leído por |
|---|---|---|---|
| `founder_cart` | localStorage | todas las páginas (vía cart.js) | todas las páginas |
| `founder_stock_snapshot` | localStorage | `index.html`, `producto.html` | todas las páginas (vía cart.js) |
| `founder_removed_notice` | sessionStorage | `cart.js` (al purgar) | `cart.js` (al abrir drawer) |

### API expuesta por `components/cart.js`
Disponible en `window.founderCart` en TODAS las páginas que carguen el componente:

- **`fetchStockAndPurge()`** — **⭐ CLAVE**: trae el estado de stock fresco desde Google Sheets, actualiza el snapshot en localStorage, purga del carrito los items agotados y encola la notificación. Lo llaman TODAS las páginas vía `bootPage`. Hace que cualquier página sea autónoma (no depende de que el usuario haya pasado por index/producto).
- **`bootPage(updateFn)`** — Boot centralizado para páginas que usan `updateCartUI`. Espera `DOMContentLoaded`, llama `fetchStockAndPurge`, luego `updateFn`, y si el drawer ya está abierto muestra la notice inmediatamente.
- **`flushRemovedNotice()`** — Renderiza el banner recuadrado dentro del drawer del carrito. Se llama al abrir el carrito vía `toggleCart`.
- **`saveStockSnapshot(products)`** — Guarda el snapshot a partir de productos ya parseados. Usado por `index.html` y `producto.html` que ya tienen el catálogo completo en memoria.
- **`pruneAndQueue(cart)`** — Versión síncrona: purga según el snapshot guardado (sin fetch). Usado por `index.html` y `producto.html`.
- **`getRemovedQueue()` / `clearRemovedQueue()`** — Lectura/limpieza de la queue de notificaciones pendientes.

### Flujo de datos (corregido — cada página es autónoma)
```
CADA PÁGINA (al cargar):
   ├─ cart.js se carga → expone window.founderCart
   ├─ bootPage(updateCartUI) [páginas 2ᵃrias]
   │     OR fetchStockAndPurge() [checkout.html]
   │
   ├─ fetchStockAndPurge()
   │   1) Hace GET al Sheet de productos
   │   2) Parsea estados de stock (extras.colores_estado)
   │   3) Guarda snapshot en localStorage
   │   4) Purga items agotados del carrito en localStorage
   │   5) Encola nombres en sessionStorage para notificar
   │
   └─ updateCartUI() / renderOrderSummary()
         → pinta el carrito SIN los items agotados

USUARIO abre el drawer (toggleCart):
   └─ flushRemovedNotice()
         → muestra banner recuadrado rojo arriba del carrito
         → incluye link "Ver otros modelos →"

checkout.html (doble seguro):
   ├─ init()      → fetchStockAndPurge + notice arriba del form
   └─ processOrder() → REVALIDA stock antes de enviar la orden
         Si se agotó algo mientras el user llenaba el form → corta el pedido
```

---

## 🗂️ Archivos del proyecto

| Archivo | Descripción | Usa cart.js |
|---|---|:-:|
| `index.html` | Tienda principal — carga catálogo, guarda snapshot | ✅ |
| `producto.html` | Ficha de producto — carga catálogo, guarda snapshot | ✅ |
| `envios.html` | Envíos y devoluciones | ✅ |
| `sobre-nosotros.html` | Sobre nosotros | ✅ |
| `tecnologia-rfid.html` | Tecnología RFID | ✅ |
| `seguimiento.html` | Seguimiento de pedido | ✅ |
| `contacto.html` | Contacto | ⚠️ pendiente integrar |
| `checkout.html` | Checkout — header propio, purga inline | ❌ (lógica inline) |
| `admin.html` | Admin — password protegido | ❌ |
| `components/header.js` | Header compartido + menú mobile | — |
| `components/footer.js` | Footer compartido + modales legales + burbuja WA | — |
| `components/cart.js` | **Drawer del carrito + API `window.founderCart` (corazón del sistema)** | — |
| `ESTADO.md` | Este archivo — fuente de verdad del proyecto | — |

### ⚠️ `contacto.html` — patch pendiente
Este archivo no estaba disponible en esta sesión. Para la próxima, el patch es simple:
1. En `toggleCart()`, agregar: `if (isOpen) window.founderCart.flushRemovedNotice();`
2. Al final del `<script>`, reemplazar `updateCartUI();` por `window.founderCart.bootPage(updateCartUI);`

Es idéntico al patch aplicado a `sobre-nosotros.html`.

---

## 📦 Datos clave del proyecto

| Dato | Valor |
|---|---|
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

## ✅ Historial

### Sesión 9
Migración a componentes compartidos. 7 páginas públicas: 11.774 → 7.496 líneas (–36%). Unificación BEM, deduplicación modales legales.

### Sesión 10
4 tareas UX + reconstrucción de `seguimiento.html` usando `envios.html` como plantilla.

### Sesión 11
4 tareas UX mobile (modal fullscreen, specs 3+3, tabs en mobile, footer link) + primer intento de aviso de sin stock por-item. Mejora de header en `producto.html`.

### Sesión 11 consolidada (esta) — FIX DEFINITIVO

**Bug reportado:** en páginas como `envios.html`, si el usuario tenía un producto agotado en el carrito, el estado NO se detectaba. Iba al checkout y podía finalizar la compra. El problema raíz: el snapshot de stock solo se escribía en `index.html`/`producto.html`. Si el usuario nunca pasaba por ahí, no había snapshot.

**Solución definitiva:** `fetchStockAndPurge()` — cada página carga su propio stock desde Google Sheets.

**Cambios aplicados:**
- **`components/cart.js` reescrito** con fetch autónomo. La nueva función `fetchStockAndPurge()` hace GET al Sheet, parsea estados, actualiza snapshot y purga el carrito. Se invoca desde `bootPage()` en todas las páginas 2ᵃrias y directamente en `checkout.html`.
- **`checkout.html`** ahora carga `components/cart.js` (antes no lo hacía). Su `init()` es `async` y llama `fetchStockAndPurge()`. Su `processOrder()` revalida el stock antes de enviar la orden — si algo se agotó mientras el user llenaba el form, corta el pedido con notice.
- **Link "Ver otros modelos →"** agregado a la notification en drawer y checkout, apunta a `index.html#productos`.
- **Eliminado código obsoleto:** `purgeSinStock` inline de checkout.html, helpers inline duplicados.

**Arquitectura final:**
- 1 sola fuente de verdad del stock: Google Sheets.
- Todas las páginas son autónomas: cada una consulta el Sheet al cargar.
- 0 duplicación de lógica entre archivos.
- Sintaxis JS OK en los 10 archivos + llaves balanceadas.

---

## 🎯 Propuestas estratégicas (pendientes)

| # | Prioridad | Propuesta |
|---|---|---|
| 1 | 🔴 Alta | **Aplicar patch de founderCart a `contacto.html`** (quedó sin tocar en esta sesión) |
| 2 | 🟢 Baja | Página "Gracias por tu compra" + cupón fidelización |
| 3 | 🟡 Media | Filtros en grilla (cuando crezca el catálogo) |
| 4 | 🟡 Media | Reseñas/testimonios de clientes |
| 5 | 🔵 Técnica | PWA / instalable (manifest + service worker) |

---

## 🧪 Cómo probar que todo funciona

1. Agregá un producto al carrito (ej: Founder Confort color Crema) desde `index.html` o `producto.html`.
2. En el Google Sheet, cambiá el estado de ese color a `sin_stock`.
3. Recargá cualquier página del sitio (incluso una secundaria como `envios.html`).
4. **Resultado esperado:**
   - El item desaparece del carrito (el contador en el header se actualiza).
   - Al abrir el drawer del carrito aparece un banner rojo recuadrado arriba listando el producto eliminado.
   - El banner tiene un botón ✕ para cerrar.
   - A los 8 segundos se cierra solo con fade out.
5. Si el usuario está en `checkout.html` cuando se agota → banner aparece arriba del formulario.
6. Si quedó con el carrito vacío → pantalla de "carrito vacío" + notificación.

---

## Navegación del sitio

### Nav del header (`components/header.js` → `NAV_LINKS`)
```
Inicio | Productos | Tecnología RFID | Seguí tu compra | Sobre nosotros | Contacto
```

### Footer (desktop)
- **Productos:** Simple · Classic · Confort · Essential
- **Info:** Tecnología RFID · Envíos y Devoluciones · Seguimiento · Sobre nosotros · Contacto
- **Legal:** Política de Privacidad · Términos · Cambios y Devoluciones

### Footer (mobile)
FOUNDER · Contacto · Envíos y Devoluciones · Privacidad · Términos · © 2026
