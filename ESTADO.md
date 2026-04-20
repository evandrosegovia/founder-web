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

**Si un producto del carrito se agota → se elimina automáticamente del carrito + notificación recuadrada.**

- Sin opciones, sin botones por-item. Decisión final del usuario en esta sesión.
- La notificación recuadrada aparece dentro del drawer del carrito (al abrirlo) o arriba del formulario de checkout (si el usuario llegó directo al checkout). Lista todos los productos eliminados, tiene un botón ✕ para cerrar, y se cierra automáticamente a los 8 segundos.

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

- **`saveStockSnapshot(products)`** — Guarda la lista de combos `modelo|color` agotados. Solo lo llaman `index.html` y `producto.html` tras cargar el catálogo de Google Sheets.
- **`pruneAndQueue(cart)`** — Elimina del carrito los items agotados según el snapshot, los encola en sessionStorage para notificar, persiste el cart limpio. Devuelve el cart purgado.
- **`flushRemovedNotice()`** — Renderiza el banner recuadrado dentro del drawer del carrito (requiere `#cartItems` en el DOM). Se llama al abrir el carrito vía `toggleCart`.
- **`bootPage(updateFn)`** — Boot centralizado para páginas secundarias. Espera `DOMContentLoaded`, llama `pruneAndQueue(cart)`, luego `updateFn`.

### Flujo de datos
```
1. Usuario visita index.html o producto.html
   → cart.js se carga
   → Página carga catálogo desde Google Sheets
   → window.founderCart.saveStockSnapshot(products)  ← snapshot en localStorage
   → window.founderCart.pruneAndQueue(state.cart)    ← purga cart + encola notice

2. Usuario navega a cualquier página secundaria (envios, contacto, etc.)
   → cart.js se carga (expone API)
   → window.founderCart.bootPage(updateCartUI)
       ├─ espera DOMContentLoaded
       ├─ pruneAndQueue(cart)                        ← purga cart + encola notice
       └─ updateCartUI()                             ← render del drawer

3. Usuario abre el drawer (click en ícono de carrito)
   → toggleCart() → window.founderCart.flushRemovedNotice()
   → Banner recuadrado aparece arriba del carrito

4. Usuario va a checkout.html
   → Al arrancar, purgeSinStock() lee snapshot y purga el carrito persistido
   → Si hubo items eliminados, showRemovedNotice muestra banner arriba del form
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

### Sesión 11 consolidada (esta)
**Decisión final del usuario después de varias iteraciones:**
> "Si un producto está agotado, se elimina del carrito automáticamente + notificación recuadrada. En todas las páginas. Punto."

**Cambios aplicados:**
- **`components/cart.js` reescrito desde cero** con 4 funciones: `saveStockSnapshot`, `pruneAndQueue`, `flushRemovedNotice`, `bootPage`. Y el CSS del banner recuadrado inyectado automáticamente.
- **Eliminado código obsoleto de las iteraciones intermedias:**
  - Funciones `checkCartStock`, `isItemSinStock`, `removeSinStockItem`, `buscarOtroModelo`, `canCheckout`.
  - Clases CSS `.cart-item--sin-stock`, `.cart-item__stock-alert`, `.stock-btn`, `.cart-stock-warning`.
  - Elemento `#cartStockWarning` del drawer.
  - Bloqueos de "Finalizar compra" (ya no son necesarios — el item nunca llega al checkout).
- **`index.html` y `producto.html`** integrados al nuevo módulo — guardan snapshot tras cargar catálogo + llaman `flushRemovedNotice` al abrir el drawer.
- **4 páginas secundarias** (`envios`, `sobre-nosotros`, `tecnologia-rfid`, `seguimiento`) — patch idéntico: `bootPage(updateCartUI)` al final + `flushRemovedNotice` en `toggleCart`.
- **`checkout.html`** — tiene lógica inline (no carga `cart.js`) que purga el carrito al cargar y muestra banner arriba del form si se eliminaron items.
- **Test end-to-end con JSDOM: 9/9 checks pasan** (snapshot guardado, cart purgado, item agotado eliminado, item OK preservado, bootPage dispara updateCartUI, notificación renderizada, menciona producto, tiene botón cerrar, queue limpiada tras flush).

**Arquitectura final validada:**
- 1 sola responsabilidad por función.
- 0 duplicación de lógica entre archivos.
- 0 referencias a código obsoleto en todo el repo.
- Sintaxis JS OK en los 10 archivos.

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
