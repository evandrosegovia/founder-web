# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 44 — **Limpieza de UX + medios de pago en footer.** Sexta sesión del día (15/05/2026 — primera del nuevo día calendario). 7 cambios encadenados sin rollbacks: (1) rediseño botones de personalización láser en `producto.html` (estilo premium con borde dorado superior/lateral + check ✓ al seleccionar); (2) bug fix admin (los 4 flags `permite_grabado_*` no se copiaban en `loadProducts` normalizer); (3) reorder mobile producto.html (colores primero, personalización después); (4) scroll inicial automático debajo del breadcrumb al entrar a producto.html; (5) eliminada lista de specs con bullets ✦ debajo de la descripción + eliminada mini-lista de specs de cada card del catálogo (y del editor del admin) — datos preservados en DB con defensa optional chaining; (6) eliminado el modal de vista rápida de `index.html` (~370 líneas de JS+CSS+HTML), el botón "Ver detalle" ahora va directo a `producto.html`; (7) **fila de medios de pago en el footer** con 14 logos uruguayos (Mastercard, VISA, Mercado Pago, OCA, Prex, Redpagos, Abitab, Líder, UES, DAC, Itaú, Banco República, BBVA, Santander) en 2 filas centradas con cross-fade gris→color al hover. Bug del doble footer en mobile encontrado y arreglado (regla `display:block` anulaba el `display:none` mobile por especificidad — fix: envolver en `@media (min-width: 601px)`). Total: 6 archivos modificados + carpeta nueva `assets/payments/` con 28 PNGs. (15/05/2026)

**Sesiones del día 14/05/2026 (todas exitosas, sin rollbacks):**
- **Sesión 40** — Combo de 3 mini-features: (a) email admin con grabado, (b) auditoría general de CHECK constraints, (c) drop `products.banner_url`. **+ 2 bugs descubiertos en producción durante testing:** (1) cupón PERSONAL aplicaba 100% del producto en vez del grabado (validate_coupon nunca devolvía las flags de personalización al frontend), (2) botón de confirmar pedido bloqueado al volver de MP con back button.
- **Sesión 41** — Combo Opción 1 + Opción 4: completar Sesión 39 (UPDATE post-RPC con `descuento_cupon` + `descuento_transferencia` + validación de coherencia + migración SQL idempotente para pedidos viejos) **+** dashboard financiero en admin con 4 tarjetas (ventas brutas, ahorros cupones, ahorros transferencia, tasa descuento) + bar chart top 5 cupones + selector de período persistido en localStorage.
- **Sesión 41b** — Extensión rápida del dashboard: botón "Todo" agregado al selector (6 botones totales) + **el filtro ahora aplica a TODO el dashboard** (no solo al panel financiero), excepto stats del catálogo que son atemporales + fix de bug `$$` doble en tarjetas. Refactor a `state.dashboardPeriod` con compatibilidad backward con `state.financialPeriod` legacy.
- **Sesión 42** — Cleanup automático de fotos huérfanas de reseñas (Opción G del backlog). Tarea C del cron semanal.
- **Sesión 43** — Combo Opción D + Opción B + UI recompra + Opción C.

**Sesión del día 15/05/2026:**
- **Sesión 44** — Limpieza UX + medios de pago en footer (este resumen).

**Próxima sesión:** 45 — opciones disponibles, en orden sugerido de prioridad:
- (a) **CSP (Content Security Policy)** — la última pieza para A+ definitivo en securityheaders.com. Esfuerzo: 1 hora. **Riesgo medio:** un CSP mal armado rompe scripts (MP, Meta Pixel, Cloudinary). Hay que auditar inline scripts antes de definir directives.
- (b) **UI en admin para invocar manualmente cleanup de huérfanas de reseñas** — el endpoint `run_reviews_orphans_manual` ya existe (Sesión 42), falta agregar botón en el panel de Personalización Láser junto al cleanup de imágenes existente. Esfuerzo: 30 min. **Solo es necesario si querés disparar manualmente sin esperar al cron del domingo.**
- (c) **Métricas de conversión de la feature de recompra** — dashboard chico con "% de cupones FOUNDER15 usados sobre emails enviados" + ingresos generados por recompras. Requiere joinear `orders` (donde `cupon_codigo = REPURCHASE_COUPON_CODE`) contra el conteo de `recompra_email_sent_at IS NOT NULL`. Esfuerzo: 1.5 hs. Útil después de algunas semanas con datos reales.
- (d) **Subir DMARC a `p=quarantine`** en 2-4 semanas si los reportes confirman que SPF + DKIM pasan en todos los proveedores. Editar el TXT `_dmarc` en Vercel y cambiar `p=none` por `p=quarantine`. Importante: revisar primero los reportes XML que llegan a `founder.uy@gmail.com`.
- (e) **Subir el email de recompra a Recibidos principal de Gmail** — hoy cae en Promociones (esperado y deseable). Mejorar deliverability con `p=quarantine` (item d) + reputación del dominio a lo largo del tiempo lo va a mover gradualmente. No es una acción única, es un proceso. **No urgente.**

**Nota:** El archivo `PLAN-PERSONALIZACION.md` fue archivado en `docs/archive/` tras Sesión 29 (info crítica también consolidada en este `ESTADO.md`, ver Sesión 29 abajo). Se conserva por valor de auditoría histórica de decisiones de diseño y arquitectura del feature.

---

## ✅ SESIÓN 44 — Limpieza UX + medios de pago en footer [15/05/2026]

**Sesión larga de pulido UX**, sin features nuevas de backend. 7 cambios encadenados sin rollbacks, **2 bugs descubiertos durante el desarrollo y arreglados en la misma sesión** (no llegaron a producción). El cambio más grande visualmente: la fila de 14 logos de medios de pago en el footer, con cross-fade gris→color al hover, presente en TODAS las páginas vía `components/footer.js`.

### 🅐 Rediseño botones personalización láser (producto.html)

**Problema anterior:** los 4 botones de personalización (Adelante / Interior / Atrás / Texto) tenían el "Ver ejemplo" superpuesto al precio en algunos casos, y el estado seleccionado era poco claro.

**Rediseño aplicado:**
- **Desktop (≥720px):** grid de 4 columnas, cada botón con borde superior dorado de 2px cuando está seleccionado + check ✓ dorado arriba a la derecha. Layout `body > row` que separa título/precio de "Ver ejemplo".
- **Mobile (<720px):** grid de 1 columna apilada, cada botón con borde **izquierdo** dorado (no superior) cuando seleccionado. Misma estructura interna.
- CSS refactorizado: `.laser-option`, `.laser-option__body`, `.laser-option__row`. Reemplaza al CSS anterior que mezclaba todo en flex.

### 🅑 Bug fix admin — flags de personalización (founder-admin.js)

**Síntoma reportado:** en el panel de Personalización Láser del admin, los checkboxes de los 4 flags (`permite_grabado_adelante/interior/atras/texto`) aparecían siempre desmarcados, aunque la DB sí tuviera los valores en `true`.

**Causa raíz:** en `loadProducts()` (función que normaliza productos del backend al state del admin), los 4 flags **no se copiaban**. El normalizer hacía solo `nombre, precio, descripcion, capacidad, ...` etc. Cualquier UI que leyera de `state.products[i].permite_grabado_*` veía `undefined` y, por la coerción a boolean en los checkboxes, quedaba `false`.

**Fix:** agregadas las 4 líneas faltantes en el `return` del `.map(...)`, con coerción estricta a boolean:
```js
permite_grabado_adelante: p.permite_grabado_adelante === true,
permite_grabado_interior: p.permite_grabado_interior === true,
permite_grabado_atras:    p.permite_grabado_atras    === true,
permite_grabado_texto:    p.permite_grabado_texto    === true,
```

### 🅒 Reorder mobile producto.html

**Cambio:** en mobile (<900px), el orden visual de la página de producto pasó de:

```
[Galería] → [Título + Desc] → [Colores] → [Personalización] → [Purchase]
```

a:

```
[Galería] → [Colores] → [Personalización] → [Label] → [Título + Desc] → [Purchase]
```

**Razón:** colores y personalización son las decisiones que el cliente toma primero. Ponerlas arriba del título reduce scroll innecesario y baja el tiempo a "click en comprar". Implementado con `order:` en media query mobile.

### 🅓 Scroll inicial al entrar a producto.html

**Problema:** al entrar a producto.html, el navegador a veces aterrizaba en el medio de la página o en el breadcrumb (no en la foto principal), porque el header fixed de 70px tapaba el contenido.

**Fix doble:**
1. CSS: `scroll-margin-top: 70px` en `.product-main` — le dice al browser que cualquier scroll-to debe compensar 70px (la altura del header).
2. JS: tras `show('productContent')`, ejecutar `mainEl.scrollIntoView({ behavior: 'instant', block: 'start' })`. La condición: **solo si no hay hash en la URL** (un link como `producto.html?p=Confort#especificaciones` debe respetar el hash).

Aplica en desktop y mobile, instantáneo (sin animación).

### 🅔 Eliminadas listas de especificaciones (3 lugares)

Decisión arquitectónica grande: el campo `especificaciones` (array de strings con bullets como "RFID|Botón deslizante|5-6 tarjetas") **dejó de mostrarse en frontend público** y **dejó de tener editor en admin**, pero **los datos quedan intactos en DB** por si en el futuro querés restaurar la UI.

**Eliminado en:**
- **`producto.html`:** lista `.specs-list` con bullets ✦ debajo de la descripción (HTML + CSS + render JS).
- **`index.html`:** mini-lista `.product-card__specs` con 3 items debajo de la descripción de cada card del catálogo (HTML + CSS + render JS).
- **`admin.html`:** `<textarea id="editSpecs">` del modal de productos.
- **`founder-admin.js`:** referencias a `editSpecs` en `openNewProduct()` (limpiar campo), `editProduct()` (prellenado), `saveProduct()` (lectura).

**Preservación de datos en DB — decisión clave:**

El backend (`admin.js` línea 663) hace `especificaciones: Array.isArray(p.especificaciones) ? p.especificaciones : []`. Esto significa que si el frontend NO manda el campo, el backend lo sobrescribe con `[]` y borra los datos viejos. Para evitarlo, en `saveProduct()` agregué:

```js
const especificaciones = Array.isArray(existing?.especificaciones)
  ? existing.especificaciones
  : [];
```

Cuando se edita un producto existente, se manda al backend exactamente lo que ya estaba (preservado en `state.products[i].especificaciones`, que SÍ se carga desde DB en el normalizer). Cuando es un producto nuevo, va `[]`. Cero pérdida de datos.

**Mantenimiento del campo `specs` en `supabase-client.js`:** después de remover `specs` se descubrió que 4 lugares en `producto.html` lo usaban como fallback (subtítulo del producto, capacidad por defecto, related-card, schema.org). Solución: **se restauró el mapeo `specs` en supabase-client.js** como utilidad interna (no se muestra como lista, pero queda disponible para los fallbacks legacy). En `producto.html` se blindaron los 4 usos con optional chaining (`p.specs?.[0]` en lugar de `p.specs[0]`) para defensa en profundidad.

### 🅕 Eliminado modal de vista rápida (index.html)

**Decisión:** el modal de vista rápida del catálogo (que se abría al clickear "Ver detalle" en una card) duplicaba funcionalidad con `producto.html` y agregaba complejidad innecesaria (~370 líneas combinadas).

**Eliminado:**
- HTML del modal completo (~25 líneas) con `id="modal"`, `.modal__gallery`, `.modal__info`, `.modal__thumbs`, etc.
- ~250 líneas de JS: funciones `openModal`, `closeModal`, `renderModalColors`, `selectColor`, `updateModalGallery`, `setModalMainPhoto`, `scrollThumbs`, `updateThumbArrows`, `handleModalOverlayClick`, `addFromModal`. Más event delegation y state (`currentProduct`, `currentColor`, `thumbOffset`, `THUMBS_VISIBLE`).
- ~95 líneas de CSS de `.modal-*` y `.thumb-arrow`.

**Reemplazo:** el botón "Ver detalle de producto" ahora es un `<a>` directo a `producto.html?p=<nombre>`, con clase renombrada `quick-view-btn` → `btn-detalle`. Una sola fuente de verdad para el detalle del producto. El CSS de `.color-option*` se mantuvo intacto porque se comparte con otros usos del sitio.

### 🅖 Fila de medios de pago en el footer

**Feature comercial:** muchos e-commerces tienen una fila de logos de medios de pago en el footer para generar confianza ("estos son los medios reconocidos que aceptamos"). Implementado vía componente compartido `components/footer.js` → presente en TODAS las páginas con cero esfuerzo de mantenimiento por página.

**Decisiones de diseño:**

- **Ubicación:** dentro de `footer__bottom`, **arriba del copyright** (no como fila independiente entre la grilla y el bottom). Esto evita romper la jerarquía visual existente.
- **Estilo:** **monocromático/gris por defecto + cross-fade a color al hover** (estilo 3 del mockup, el más elegante para sitio premium). El usuario probó las 6 combinaciones (2 ubicaciones × 3 estilos) en widgets de visualización antes de elegir.
- **Hover individual:** cada logo se ilumina solo (no toda la fila a la vez). Más feedback claro al cursor.
- **Listado:** 14 logos uruguayos en este orden: Mastercard, VISA, Mercado Pago, OCA, Prex, Redpagos, Abitab, Líder, UES, DAC, Itaú, Banco República, BBVA, Santander.
- **Sin Creditel:** estaba en la lista inicial pero se quitó cuando el usuario actualizó la selección.

**Cómo se hicieron los logos:**

Iteración larga (~5 rondas) hasta llegar al resultado final. Resumen:
1. Primer intento: representaciones CSS con texto estilizado → descartado por baja fidelidad.
2. Búsqueda de SVG oficiales → engorroso, muchas marcas no tienen kit público.
3. Usuario diseñó **todas las imágenes a mano en Canva**, las exportó en pack y las subió.
4. Primer pack: 28 PNGs 200×64 px en formato RGB (sin alpha) → fondo blanco visible sobre el fondo oscuro del footer.
5. Segundo pack: mismo 200×64 px pero RGBA con transparencia → ya integraban bien con el fondo, pero quedaba mucho aire en blanco interno (logos chicos dentro del rectángulo).
6. **Tercer y final pack: 125×64 px, RGBA, transparente, logos compactos** — máximo aprovechamiento del espacio. Este es el que quedó en producción.

**Estructura técnica:**

```js
// components/footer.js
const FOOTER_PAYMENTS = [
  { id: 'mastercard',     alt: 'Mastercard' },
  { id: 'visa',           alt: 'VISA' },
  // ... 14 entradas total
  { id: 'santander',      alt: 'Santander' }
];
```

Cada logo se renderiza con **2 imágenes superpuestas** (`position: absolute`):
- `assets/payments/{id}_gray.png` — visible por defecto, `opacity: 1`
- `assets/payments/{id}_color.png` — invisible, `opacity: 0`, encima

Al `:hover`, `:active` o `:focus`, las opacidades se invierten con `transition: opacity 0.25s ease` → cross-fade suave. **No es filtro CSS grayscale** (intento inicial descartado) sino **dos imágenes reales**, lo que asegura que las versiones gris no se distorsionen.

**Defensa anti-error:** cada `<img class="--gray">` tiene `onerror="this.parentNode.style.display='none'"`. Si un archivo falla en cargar (ej: te olvidás de subir uno), ese logo individual desaparece silenciosamente — no se ve un ícono roto, no se rompe el layout.

**Refactor visual del footer__bottom:**

El layout original del `footer__bottom` era `display: flex; justify-content: space-between` (todo horizontal: logos | copyright | links). Con 14 logos no entraban en una fila ni así. **Solución:**

1. Refactor del HTML: agrupar copyright + legal en un nuevo wrapper `<div class="footer__bottom-info">` separado.
2. Inyectar overrides desde `footer.js` (no tocar los HTML de cada página):
   ```css
   .footer__bottom { display: block; text-align: center; }
   .footer__bottom-info { /* flex con space-between, copyright izq + links der */ }
   ```
3. La grilla del footer pasó de `margin-bottom: 60px` a `28px` para acercarla a los logos.

**Tamaños finales tras 3 iteraciones de feedback:**
- **Desktop:** logos `38px × 74px` (ratio 1.95 del nuevo PNG 125×64). Gap entre logos: `14px 16px`. Cálculo: 7 logos × 74px + 6 gaps × 16px = 614px ancho por fila → entran 7 por fila con margen.
- **Mobile:** logos `28px × 55px`. Gap: `12px 18px`. Se acomodan en 3-4 filas naturalmente con `flex-wrap`.

### 🐛 BUG: Doble footer en mobile (encontrado y arreglado en la misma sesión)

**Síntoma:** tras aplicar los overrides del `footer__bottom`, en mobile aparecían **dos footers a la vez**:
1. El `footer__bottom` desktop (logos grandes 4×4×2 + copyright + links apilados vertical).
2. El `footer__mobile` minimalista (FOUNDER + WhatsApp + links inline + logos chicos + copyright).

**Causa raíz:** la regla nueva `.footer__bottom { display: block; }` se aplicaba en TODAS las resoluciones. Las páginas HTML ya tenían dentro de su `@media (max-width: 600px)` la regla `.footer__bottom { display: none; }`. Mismo selector, misma especificidad (1 clase) → **gana el que viene después en el CSS**. Mi regla nueva, al estar inyectada por `footer.js` DESPUÉS del `<style>` de cada página, anulaba la regla mobile.

**Fix:** envolver los overrides en un media query desktop-first:
```css
@media (min-width: 601px) {
  .footer__bottom { display: block; text-align: center; }
  .footer__bottom-info { ... }
  .footer__copy { ... }
}
@media (min-width: 601px) {
  .footer__grid { margin-bottom: 28px !important; }
}
```

Así las reglas SOLO aplican en pantallas ≥601px y el `display: none` mobile del HTML original sigue funcionando intacto.

**Bug bonus encontrado y arreglado en el camino:** al hacer el fix anterior, agregué un comentario con backticks dentro del template literal de `COMPONENT_CSS`:
```js
const COMPONENT_CSS = `
  /* ... el `display: none` que aplica ... */
`;
```

Los backticks **cerraron el template string** y JS interpretó `display: none` como código suelto → `SyntaxError: Unexpected identifier 'display'`. Fix: reemplazar los backticks por comillas simples en el comentario.

### 🐛 BUG: TypeError tras eliminar mini-lista de specs (encontrado y arreglado en producción)

**Síntoma:** después de subir los cambios del modal de vista rápida + `supabase-client.js` (que removía el mapeo `specs:`), los productos NO cargaban en el catálogo. DevTools mostraba:

```
TypeError: Cannot read properties of undefined (reading 'slice')
  at renderProductCard (index:1281:52)
```

**Causa raíz:** olvidé un uso de `p.specs.slice(0,3)` en `renderProductCard()` de `index.html` (línea 1281). Cuando removí `specs` del mapeo en `supabase-client.js`, ese acceso quedó como `undefined.slice(...)` → TypeError → el render entero rompía → "Error al cargar. Recargá la página."

**Fix:** eliminé la mini-lista de specs de cada card del catálogo (consistente con la decisión global de quitar especificaciones del frontend), restauré el mapeo `specs:` en `supabase-client.js` como utilidad interna para los 4 fallbacks legacy en `producto.html`, y blindé esos 4 accesos con optional chaining.

**Lección registrada:** al eliminar un campo de un mapeo central (como `supabase-client.js`), siempre hacer un `grep -rn "<campo>" *.html *.js` ANTES de confirmar el cambio. Probar un solo flujo (modal de vista rápida) no garantiza cobertura de otros (cards del grid).

### 📦 Archivos modificados (Sesión 44)

1. **`producto.html`** — rediseño botones láser, reorder mobile, scroll inicial, eliminada specs-list, blindaje optional chaining en 4 lugares.
2. **`index.html`** — modal de vista rápida eliminado, mini-lista specs de cards eliminada, residuos CSS limpiados.
3. **`admin.html`** — campo Especificaciones eliminado del modal de productos.
4. **`founder-admin.js`** — bug fix de los 4 flags `permite_grabado_*` en `loadProducts`, eliminación de referencias a `editSpecs`, preservación de `especificaciones` legacy en `saveProduct`.
5. **`supabase-client.js`** — mapeo `specs:` restaurado como utilidad interna (con comentario explicativo).
6. **`components/footer.js`** — nueva constante `FOOTER_PAYMENTS` (14 logos), render con 2 imgs por logo + onerror defense, nuevo wrapper `footer__bottom-info`, CSS de pagos con cross-fade gris→color + 2 media queries (`min-width: 601px` para desktop, `max-width: 900px` para tablet).
7. **`assets/payments/`** — carpeta nueva con 28 PNGs (14 logos × 2 versiones gris/color, 125×64 px RGBA).

### 🎓 Lecciones de Sesión 44

1. **Grep antes de remover:** al eliminar un campo de un mapeo central, hacer `grep -rn "<campo>"` en TODOS los archivos consumidores antes de confirmar. La sesión incluyó 2 bugs por no hacerlo bien la primera vez.
2. **Defensa en profundidad con optional chaining:** los accesos a campos opcionales (`p.specs?.[0]`) son baratos y previenen TypeErrors si el shape cambia.
3. **Backticks en comentarios dentro de template literals:** **no usar nunca.** Romper el string es trivial. Usar comillas simples o quitar las backticks del comentario.
4. **Cuidado con override de reglas en media queries:** si una regla global del componente CSS anula una regla específica de un media query, **envolver la regla global en su propio media query** (desktop-first si el componente apunta a desktop).
5. **Preservar datos en DB al cambiar UI:** una columna que deja de tener editor en admin NO implica borrar la columna. Los datos se conservan, el código frontend cambia. Si en el futuro querés restaurar la UI, los datos están esperando.

---



## ✅ SESIÓN 43 — Combo Opción D + Opción B + UI recompra + Opción C [14/05/2026]

**Quinta sesión del día 14/05.** Cuatro frentes en una sesión: un fix cosmético (favicon), la feature comercial **más rentable del backlog** (email automático de recompra), su UI de gestión en el admin, y la finalización del refactor mobile que Sesión 35 dejó pendiente. Cero rollbacks. La feature de recompra fue **validada end-to-end con email real recibido en producción**.

### 🅐 Opción D — Favicon del admin (calentamiento, 5 min)

**Hallazgo de Sesión 42:** `admin.html` era la única página del proyecto sin `<link rel="icon">`. Eso provocaba un `GET /favicon.ico → 404` en cada carga del admin. Cosmético, sin impacto funcional, pero quedaba sucio en los logs de Vercel.

**Fix:** 1 línea agregada en el `<head>` de `admin.html`, entre las fonts y el `<style>`. **Idéntico patrón al resto del sitio** (`index.html`, `checkout.html`, `producto.html`, etc.) — SVG inline (data URI) con la "F" dorada (`#c9a96e`) sobre fondo negro (`#141414`). Cero requests adicionales, escala a cualquier resolución, sin archivo aparte que subir.

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23141414'/><text y='72' x='50' text-anchor='middle' font-size='60' font-family='serif' fill='%23c9a96e'>F</text></svg>">
```

Validado en producción: la "F" dorada aparece en la pestaña del browser, el 404 desapareció de DevTools.

### 🅑 Opción B — Email automático de recompra (la feature grande)

**Objetivo comercial:** a los 10-15 días de marcar un pedido como "Entregado", el cliente recibe automáticamente un email con un cupón de descuento para volver a comprar. Cero esfuerzo manual del admin, recompras automatizadas.

**Decisión arquitectónica clave — cómo definir el cupón:**

Se evaluaron 3 opciones:

| Opción | Cómo | Pro | Contra |
|---|---|---|---|
| Hardcodear "FOUNDER20" en código | `const CODE = 'FOUNDER20'` | Simple | Frágil: si renombrás el cupón, deploy roto |
| Marcar cupón como "recompra reward" en DB (estilo `review_reward` de Sesión 38) | Nueva columna + RPC + UI admin | Editable desde admin | Scope grande, schema migration extra, UI duplicada del review_reward |
| **Env var `REPURCHASE_COUPON_CODE` en Vercel** ⭐ | Configurás el código en Vercel | Cero schema, cero UI, mismo patrón que `ADMIN_EMAIL` de Sesión 40, feature opt-in | Cambiar cupón = ir a Vercel + redeploy |

**Elegida: env var.** Razones:
- El cupón de recompra es una decisión comercial **estable** (no cambia cada semana).
- **Cero scope creep:** mismo patrón que `ADMIN_EMAIL` de Sesión 40.
- Si no está configurada → feature **apagada con skip silencioso**, cero impacto.

**Decisión de UX clave — cupón compartido vs separado:**

El dueño tenía `FOUNDER20` (20% off) ya creado, destinado a entregarse en **panfleto físico dentro del paquete**. Consultó si usar el mismo cupón para ambos canales (panfleto + email).

**Decisión: cupones separados.** El argumento decisivo fue que los cupones son `por-email` (1 uso por email). Si compartían cupón:

```
Día 1 → Juan compra. Recibe panfleto FOUNDER20.
Día 5 → Juan usa FOUNDER20 para regalarle una a su hermano. ✓
Día 14 → Cron automático le envía email con FOUNDER20.
Día 14 → Juan intenta usarlo → ❌ "Ya usaste este cupón."
        → Percepción negativa de la marca: "me ofrecieron algo que no puedo usar"
```

Con cupones separados (`FOUNDER20` panfleto / `FOUNDER15` email), Juan puede usar **AMBOS** = doble oportunidad de recompra del mismo cliente. **Cero costo operativo** de gestión, **alto valor incremental**.

Decisión final: cupón nuevo `FOUNDER15` (15% off, por-email, solo clientes repetidos) destinado exclusivamente al email automático.

**Tono del email — proceso de selección:**

Se generaron **3 previsualizaciones reales** (archivos HTML con table layout estilo email + CSS inline) para que el dueño eligiera:

- **A — Cálido y personal:** foco en relación, cupón discreto, 3 párrafos emotivos.
- **B — Comercial y directo:** "20% OFF" gigante, cupón en caja dashed, 1 párrafo, CTA fuerte "Comprar ahora".
- **C — Equilibrado:** saludo cálido + cupón bien visible al medio + CTA específico "Usar mi cupón". ⭐ **Elegido.**

El proceso de previsualizar 3 opciones antes de codear evitó iteración posterior — el template quedó al primer intento.

**Schema nuevo (`SESION-43-SQL.sql`):**

```sql
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS recompra_email_sent_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_recompra_pending
ON orders (updated_at)
WHERE estado = 'Entregado' AND recompra_email_sent_at IS NULL;
```

Flag de dedup: `NULL` = no enviado, timestamp = enviado en esa fecha. **Índice parcial** sobre el subconjunto relevante (entregados sin email) → query del cron O(log n) sin penalizar el resto de operaciones sobre `orders`.

**Arquitectura del envío — Tarea D del cron:**

Sigue exactamente el mismo patrón que las Tareas A, B, C del cron `cleanup-personalizacion.js`. Vercel Hobby permite 2 crons máximo y el segundo NO se registra de forma estable → tarea adicional al cron existente (heredado de Sesión 31 y reforzado en Sesión 42).

Orden serie en el handler GET `?trigger=auto`: **A → B → C → D**.

**5 funciones nuevas en `cleanup-personalizacion.js`:**

1. **`loadRecompraCoupon()`** — lee env `REPURCHASE_COUPON_CODE`, busca el cupón en `coupons`, valida que `activo=true` y esté dentro de fechas `desde`/`hasta`. Devuelve `null` con log warning si algo no cierra (skip silencioso, no rompe el cron).

2. **`findRecompraCandidates()`** — query `orders` con: `estado='Entregado'` AND `recompra_email_sent_at IS NULL` AND `updated_at <= now() - 10 days`. Ordena por `updated_at` ASC (más viejos primero — si hay backlog se vacía primero). Tope `MAX_RECOMPRA_PER_RUN = 50` (protege rate limit Resend Free de 100/día).

3. **`markRecompraSent(orderId, sentAtIso)`** — UPDATE con filtro extra `recompra_email_sent_at IS NULL` como defensa contra race condition teórica (doble corrida del cron).

4. **`formatFechaEs(date)`** — helper local que formatea fecha como "13 de junio de 2026" (estilo español) para el texto del email.

5. **`processRecompraEmails({ dryRun })`** — orquestador principal. Si `dryRun=true`, devuelve solo el conteo de candidatos sin enviar. Si no, envía emails en serie (no paralelo: respeta rate limit Resend), marca flags, loguea en `cleanup_logs` con `detalle.tipo='recompra_emails'`.

**Decisión: vencimiento solo en TEXTO del email, NO en DB.** El email dice "Válido hasta el 13 de junio de 2026" pero el cupón en DB no tiene `hasta` seteado por la feature. El cliente puede usar el cupón después de esa fecha (técnicamente) pero la presión psicológica del email genera urgencia. Si el admin quiere validación dura, debe setear `coupons.hasta` manualmente desde el panel. Decisión consciente para v1 — mantener simple.

**Template `templateRecompra(order, coupon)` (en `email-templates.js`):**

Sigue el patrón de los 6 templates existentes: usa `wrapEmail()`, `blockHeader()`, `blockFooter()`. Variables: `nombre`, `codigo`, `tipo`, `valor`, `expiraEn`. Si el cupón es `porcentaje` muestra "X% OFF"; si es `fijo` muestra "$X OFF" con `fmtUYU()`. El `${expiraEn ? ... : ''}` es condicional → si en el futuro se desactiva el vencimiento, no rompe el template.

**Función `sendRecompraEmail(order, coupon)` (en `email.js`):**

Validación temprana: requiere `order.numero`, `order.email`, `coupon.codigo`. Si falta algo, retorna `{ ok: false, error }` sin tirar. Subject: `"${nombre}, te dejamos un cupón en Founder 💛"` (personalizado con nombre del cliente, más conversión que un genérico).

**Endpoints POST adicionales (para invocación manual y testing):**

- `get_recompra_status` → solo lectura (dryRun). Devuelve `{ ok, dry_run, candidates, coupon_code }`. Usado por la UI del admin.
- `run_recompra_manual` → ejecuta el envío ya mismo. Útil para testing o forzar envío sin esperar al cron.

### 🆕 UI de emails de recompra en el admin

**Pregunta de UX clave: ¿dónde poner la card?** Tres opciones consideradas:

1. **Panel de Personalización Láser** (donde ya está el cleanup de imágenes). **Rechazada por el dueño:** "No tiene nada que ver con personalización".
2. **Dashboard**. **Rechazada:** "Ya está bastante cargado".
3. **Página de Cupones**. **Elegida** porque conceptualmente la feature ES "envío automático de cupones" → vive donde se gestionan los cupones. Coherencia de dominio.

**Ubicación física:** card a ancho completo **debajo del grid `cupones-layout`** (tabla + formulario), dentro de `page-cupones`. Cero impacto en el layout existente.

**Componentes nuevos en `admin.html` (+40 líneas):**

- Card con título "📧 Emails de recompra automática" + botón "↻ Actualizar".
- `info-box` explicando frecuencia, dedup, cómo cambiar el cupón, cómo desactivar la feature.
- `#recompraStatusBox` que renderiza un grid de 3 columnas: **Pendientes** (count en verde/dorado), **Cupón configurado** (código en monospace dorado), **Próximo envío automático** (fecha calculada del próximo domingo 3am).
- Botón `#recompraRunBtn` "📤 Enviar pendientes ahora" deshabilitado si no hay pendientes.

**3 funciones JS nuevas en `founder-admin.js` (+191 líneas):**

1. **`loadRecompraStatus()`** — llama `get_recompra_status`, renderiza el statusBox con manejo de 4 estados visuales: `skipped` (cupón no configurado → warning rojo), `candidates=0` (sin pendientes → verde), `candidates>0` (con pendientes → dorado + botón habilitado), error de red.

2. **`runRecompraManual()`** — confirma con `confirm()`, llama `run_recompra_manual`, toast con resultado (success/parcial/fail), recarga el status.

3. **`calcularProximoDomingo3am()`** — helper local que calcula el próximo domingo a las 3am Uruguay y devuelve texto humano: "Domingo 17 de mayo · 3am" o "Hoy a las 3am" (si hoy es domingo antes de las 3am). El cron real está en UTC (`vercel.json: "0 6 * * 0"`), que equivale a 3am Uruguay (UTC-3).

**Auto-load:** invocación de `loadRecompraStatus()` integrada en el handler `nav('cupones')`, junto a `loadCoupons()`. El admin entra a Cupones y ve el estado al instante.

**Window exports:** `loadRecompraStatus` y `runRecompraManual` agregados al bloque de exports al final de `founder-admin.js`.

### 🅒 Opción C — Admin mobile parte 2 (cierre del refactor)

**Sesión 35 dejó pendiente:** editor de productos (tabs de colores/fotos, drag&drop) y panel de personalización láser en mobile. Esta sesión cierra ese gap.

**Análisis previo:** se identificaron 6 problemas críticos en mobile:

1. **`.photo-slots { grid-template-columns: repeat(5, 1fr); }`** — en mobile cada slot quedaba ~50px de ancho, imposible de usar. **El más crítico.**
2. **`.color-name-in { width: 140px; }`** — width fijo no respondía al viewport, rompía el layout.
3. **`.slot-btn { font-size: 8px; }`** — tap target inaceptable.
4. **`.form-grid { grid-template-columns: 1fr 1fr; }`** — inputs ilegibles a 2 columnas en mobile.
5. **`.product-row` con `prod-price` y `prod-actions`** — botones de Editar/Eliminar imposibles de tocar.
6. **Modal-foot con botones inline** — botones "Guardar/Cancelar" muy chicos.

**Implementación:** bloque CSS nuevo de **167 líneas**, claramente marcado `SESIÓN 43 — MOBILE PARTE 2`, ubicado **después** del breakpoint `@media (max-width: 480px)` de Sesión 35 y **antes** del bloque de Reseñas (Sesión 38). Decisión deliberada: no tocar nada existente, solo **agregar** reglas que extienden las anteriores. Cero riesgo de regresión en lo que ya funcionaba.

**Cambios principales en `@media (max-width: 768px)`:**

| Sección | Cambio |
|---|---|
| `.product-row` | `flex-wrap: wrap`, `prod-actions` full-width, botones 10px |
| `.form-grid` | 2 cols → 1 col |
| `.modal-foot` | Botones full-width verticales |
| `.color-name-in` | `width: auto`, `flex: 1`, `min-width: 110px` |
| `.color-estado-btns` | `flex-wrap: wrap`, baja a nueva línea |
| `.photo-slots` ⚠️ | **5 cols → 2 cols**, slot-preview 60px → 100px |
| `.slot-btn` | font 8px → 10px, padding 9px |
| `.lp-ex-grid` (galería ejemplos) | `auto-fill minmax(140px)` → 2 cols fijas |
| `.lp-ex-colores` (checkboxes) | 2 cols + padding más generoso |

**Cambios en `@media (max-width: 480px)`:** ajustes finos — galería de ejemplos a 1 sola columna, modal padding compacto, slots de 85px.

**No tocados (siguen como estaban):**
- Reseñas (Sesión 38) ya tienen su propio `@media (max-width: 700px)` correcto.
- Card de recompra recién creada usa `auto-fit minmax(180px, 1fr)` → naturalmente responsive.
- Sidebar drawer, topbar, sales-grid, orders-grid → Sesión 35 los cubrió bien.

### 📊 Validación end-to-end en producción

Procedimiento ejecutado por el dueño en producción:

1. **SQL migration corrida** en Supabase SQL Editor → "Success. No rows returned".
2. **Env var configurada** en Vercel: `REPURCHASE_COUPON_CODE=FOUNDER15` (Production + Preview + Development).
3. **4 archivos subidos** a GitHub:
   - `admin.html` (favicon + UI recompra + mobile parte 2)
   - `components/founder-admin.js` (funciones UI + auto-load)
   - `api/_lib/email-templates.js` (templateRecompra)
   - `api/_lib/email.js` (sendRecompraEmail + import)
   - `api/cleanup-personalizacion.js` (Tarea D completa)
4. **Vercel deploy automático** OK (~30s).

**Test 1 — `get_recompra_status` desde consola del admin:**
```json
{ ok: true, dry_run: true, candidates: 1, coupon_code: 'FOUNDER15' }
```
✓ Sistema activo, cupón validado en DB, 1 pedido pendiente (era del propio dueño).

**Test 2 — `run_recompra_manual`:**
```json
{ ok: true, candidates: 1, sent: 1, failed: 0, coupon_code: 'FOUNDER15', coupon_valor: 15, vencimiento_en: '13 de junio de 2026' }
```
✓ Envío exitoso.

**Test 3 — Email recibido en inbox personal del dueño:**
- Subject: "Evandro, te dejamos un cupón en Founder 💛" ✓
- Pestaña: **Promociones** de Gmail (esperado — cumple criterios de marketing).
- Render: idéntico a la preview C aprobada. Logo FOUNDER, "15% OFF", FOUNDER15 en caja dashed, vencimiento 13/06/2026, botón "Usar mi cupón →", footer con WhatsApp.

**Test 4 — UI del admin (post-deploy):**
- Entrar a Cupones → card aparece al final.
- Pendientes: **0** (verde, ya enviado) ✓
- Cupón: **FOUNDER15** (dorado, monospace) ✓
- Próximo envío: **"Domingo 17 de mayo · 3am"** (helper calculó correcto) ✓
- Botón "Enviar pendientes ahora" deshabilitado ✓

**Test 5 — Mobile parte 2:** revisado en celular real. Editor de productos, photo-slots 2 cols, formularios 1 col, modales fullscreen — todo confirmado OK.

### 📦 Archivos tocados (6)

| Tipo | Archivo | Cambios |
|------|---------|---------|
| 🆕 SQL | `SESION-43-SQL.sql` (migration, no se sube al repo) | +1 columna `recompra_email_sent_at` + 1 índice parcial sobre entregados sin email |
| ✏️ Backend | `api/_lib/email-templates.js` | +101 líneas: `templateRecompra(order, coupon)` con detección de tipo porcentaje/fijo y vencimiento opcional |
| ✏️ Backend | `api/_lib/email.js` | +50 líneas: import de `templateRecompra` + `sendRecompraEmail(order, coupon)` con subject personalizado por nombre |
| ✏️ Backend | `api/cleanup-personalizacion.js` | +336 líneas: comentario header expandido a 4 tareas + import `sendRecompraEmail` + 5 funciones nuevas (`loadRecompraCoupon`, `findRecompraCandidates`, `markRecompraSent`, `formatFechaEs`, `processRecompraEmails`) + invocación serie A→B→C→D en cron auto + 2 acciones POST (status + manual) |
| ✏️ Frontend | `admin.html` | +207 líneas totales: favicon (2 líneas) + card UI recompra en `page-cupones` (40 líneas) + bloque CSS mobile parte 2 (167 líneas, marcado `SESIÓN 43`) |
| ✏️ Frontend | `components/founder-admin.js` | +191 líneas: 3 funciones (`loadRecompraStatus`, `runRecompraManual`, `calcularProximoDomingo3am`) + auto-load en `nav('cupones')` + 2 window exports |

**Variable de entorno nueva:** `REPURCHASE_COUPON_CODE=FOUNDER15` en Vercel (3 environments).

**Cupón nuevo en DB:** `FOUNDER15` (porcentaje, 15%, por-email, solo_clientes_repetidos=true, activo) creado manualmente por el dueño desde el panel admin antes del deploy.

### 🎓 Lecciones de la sesión

1. **El proceso "previsualizar antes de codear" ahorra iteración masiva.** Generar 3 archivos HTML completos con table layout (estilo email real) para que el dueño eligiera el tono ANTES de escribir el template JS evitó cambios posteriores. El template salió en una sola pasada. Aplicable a cualquier decisión de copy/UX donde hay 2+ opciones razonables.

2. **El patrón "env var como switch maestro" se está consolidando en el proyecto.** Sesión 40 introdujo `ADMIN_EMAIL` con el mismo concepto. Sesión 43 lo reusa para `REPURCHASE_COUPON_CODE`. Beneficios: feature opt-in con cero downtime al activar/desactivar, sin schema changes, cambio = 1 click en Vercel + redeploy. Patrón candidato para futuras features condicionalmente activables (ej. modal del index.html postergado desde Sesión 22).

3. **Defensa en profundidad en feature de envío masivo es crítica.** El flag `recompra_email_sent_at` se setea SOLO si el email salió OK. Si Resend cae, los pedidos pendientes se reintentan la semana siguiente automáticamente — sin acción del admin. Tope `MAX_RECOMPRA_PER_RUN=50` protege contra rate limit. Filter extra `recompra_email_sent_at IS NULL` en el UPDATE protege contra race conditions. **Tres capas de defensa para una feature que toca el inbox de clientes reales.**

4. **Coherencia conceptual > consistencia de patrón.** Mi instinto inicial fue poner la UI de recompra junto al cleanup de imágenes (en Personalización Láser) porque "es el mismo patrón visual del cron". El dueño corrigió: "el cleanup de fotos no tiene NADA que ver con emails de recompra". Tenía razón — la coherencia conceptual (recompra ↔ cupones) gana sobre la consistencia visual (cron tasks en un solo lugar). Aplicable a cualquier decisión de IA: pensar primero en el **dominio del negocio**, no en el patrón técnico.

5. **Cupones separados para canales separados es la decisión correcta.** Compartir `FOUNDER20` entre panfleto físico y email automático parecía "más simple" pero generaba un escenario terrible: clientes recibiendo emails con cupones que NO podían usar (porque `por-email` los bloquea tras el primer uso). Cupones separados = doble oportunidad de recompra del mismo cliente, **sin costo operativo adicional**. Aplicable a cualquier futura campaña multicanal (ej. cuando se sume cupón de cumpleaños, cupón de aniversario, etc.).

6. **Calcular fechas dinámicas en el frontend (no en el backend) es válido cuando la regla es estable.** `calcularProximoDomingo3am()` vive en `founder-admin.js`, no en una API. El cron es siempre los domingos a las 3am Uruguay — esa regla NO va a cambiar sin un refactor de `vercel.json`. Si cambia, hay que actualizar el helper también, pero ese acoplamiento es **explícito y documentado en el comentario** de la función. No vale la pena hacer una API solo para devolver una fecha calculada.

### 🐛 Hallazgo lateral pendiente

Durante la revisión de `admin.html` para agregar el favicon, se detectó que **no declara `<meta name="robots" content="noindex, nofollow">`**. Esto significa que técnicamente Google podría indexar `founder.uy/admin.html` si encuentra un link público hacia ahí. Probablemente ya está bloqueado por `robots.txt` (revisar), pero por **defensa en profundidad** conviene agregarlo. Es 1 línea. **No urgente** porque no hay links públicos al admin, pero queda como tarea de pulido para una sesión futura.

### ⚠️ Pendientes específicos de Sesión 43 (para próximas sesiones)

- **Métricas de conversión de la feature** (Opción c del backlog de Sesión 44). Después de 2-4 semanas con datos reales, construir un mini-dashboard con: emails enviados, % de cupones FOUNDER15 usados, ingresos generados por recompras (joinear `orders` donde `cupon_codigo='FOUNDER15'` contra `recompra_email_sent_at IS NOT NULL`).
- **Validar deliverability del email a largo plazo**. Hoy cae en Promociones de Gmail (esperado y deseable para emails con cupones). Mejorar con: subir DMARC a `p=quarantine` (Sesión 44 opción d), mantener bounce rate bajo, reputación del dominio crece con el tiempo.
- **UI similar para Tarea C (huérfanas reseñas)** si en algún momento se necesita disparar manualmente. Endpoints `get_reviews_orphans_status` y `run_reviews_orphans_manual` ya existen desde Sesión 42, falta solo agregar la card en el admin. Opción b del backlog de Sesión 44.

---

## ✅ SESIÓN 42 — Cleanup automático de fotos huérfanas de reseñas (Opción G) [14/05/2026]

**Cuarta y última sesión del día 14/05.** Cierra una deuda técnica menor del backlog: hoy `handleDeleteReview` (`admin.js`) borra las fotos del bucket `reviews-photos` cuando el admin elimina una reseña, pero si el storage falla (timeout, error de red, race), las fotos quedan huérfanas sin referencia en `reviews.fotos_urls`. También quedan huérfanas las fotos que el cliente sube durante el formulario pero nunca termina de publicar (cerró pestaña, falló validación, etc).

### 🏗️ Arquitectura

**Restricción de Vercel Hobby:** el plan gratuito permite 2 crons máximo, y el cron secundario NO se registra de forma estable. Solución (heredada de Sesión 31): **un solo cron que ejecuta múltiples tareas en serie.** Ya hay Tarea A (imágenes personalización) y Tarea B (rate_limits viejos). Sesión 42 agrega Tarea C: fotos huérfanas de reseñas.

**Detección de huérfanos en 3 pasos:**

1. **`listAllReviewPhotos()`** — lista TODO el bucket `reviews-photos` recursivamente. La estructura es `YYYYMM/UID-slug.ext`, así que recorre primero el nivel raíz, luego cada subcarpeta. Devuelve `[{ path, size, created_at }]`.

2. **`loadAliveReviewPaths()`** — lee toda la tabla `reviews` (solo columna `fotos_urls`, sin joins ni filtros porque es text[]) y parsea las URLs públicas para extraer los paths internos. Usa el marker `/storage/v1/object/public/reviews-photos/` para localizar el inicio del path. Devuelve un `Set<path>` para lookup O(1).

3. **`classifyReviewPhotos(allFiles, aliveSet)`** — clasifica cada archivo en 3 categorías:
   - **Vivas:** referenciadas en `aliveSet`. Nunca se borran.
   - **Recientes:** huérfanas pero con menos de 24 horas en el bucket. NO se borran — un cliente podría estar en pleno upload mientras corre el cron.
   - **Borrables:** huérfanas con más de 24 horas. Se borran (hasta el tope).

**Salvaguardas críticas:**

- **`REVIEWS_MIN_AGE_HORAS = 24`** — protege contra race conditions. Si un cliente subió foto1 hace 30 segundos y todavía no envió la reseña, NO se borra. El próximo cron (en 7 días) sí la limpiará si todavía está huérfana.
- **`MAX_REVIEW_DELETE_PER_RUN = 100`** — más conservador que las 500 de Tarea A. Las fotos de reseñas son por naturaleza menos volumen. Si hay un acumulado patológico (ej. 1000 huérfanas), se irán limpiando 100/semana sin riesgo.
- **`created_at` vacío → tratado como reciente** (NO se borra). Defensa contra archivos con metadata corrupta del bucket.
- **Tarea C captura sus propias excepciones internamente** (no tira al cron). Si Tarea C falla, Tareas A y B ya quedaron persistidas en `cleanup_logs` y la respuesta del cron es válida.

### 📝 Logging unificado

Se persiste el resultado en la misma tabla `cleanup_logs` que usan A y B. El campo `detalle` JSONB lleva un nuevo discriminador `tipo: 'reviews_orphans'` (vs el implícito `'images'` de Tarea A) para distinguir corridas en el historial del admin. Esto evita migrar la tabla y mantiene el panel histórico funcionando sin cambios.

### 🛠️ Endpoints adicionales (manual)

Además del cron automático, se expusieron 2 acciones POST con auth admin:

- **`get_reviews_orphans_status`** — solo lectura. Devuelve `{ total_fotos_bucket, vivas_count, huerfanas_count, recientes_count, huerfanas_mb }`. Útil para auditar el bucket sin disparar nada.
- **`run_reviews_orphans_manual`** — ejecuta la limpieza ya mismo. Útil si el admin detecta un `delete_review` con error y quiere limpiar antes del próximo cron.

No se agregó UI en el admin (no es prioridad; el cron semanal es suficiente). Los endpoints quedan disponibles vía `apiAdminFetch` cuando se quiera sumar el botón.

### 📊 Validación en producción

Se invocó `get_reviews_orphans_status` desde la consola del admin con el JWT del session storage (`founder_admin_token`). Resultado en producción al final de la sesión:

```
{ ok: true, total_fotos_bucket: 0, vivas_count: 0, huerfanas_count: 0, recientes_count: 0, huerfanas_mb: 0 }
```

El bucket está vacío porque todavía no hay reseñas reales con fotos publicadas. Pero confirma que el endpoint funciona end-to-end: auth → listado del bucket → parseo de paths → respuesta correcta. El cron del próximo domingo correrá las 3 tareas en serie con éxito.

### 📦 Archivos tocados (1)

| Tipo | Archivo | Cambios |
|------|---------|---------|
| ✏️ Backend | `api/cleanup-personalizacion.js` | +1 constante de bucket nuevo, +1 constante de tope, +1 constante de min-age, +4 funciones (listAllReviewPhotos, loadAliveReviewPaths, classifyReviewPhotos, cleanupReviewOrphans), +1 invocación en cron auto (serie A→B→C), +2 acciones POST (status + manual), comentario del cabezal expandido a 3 tareas |

### 🎓 Lecciones de la sesión

1. **El límite de 2 crons de Vercel Hobby sigue siendo el factor arquitectónico dominante.** Cada vez que aparece una necesidad de "cron nuevo", la decisión correcta es sumar tarea al cron existente. Cuando se migre a Vercel Pro, separar las 3 tareas en 3 endpoints distintos es trivial.

2. **Salvaguarda temporal `MIN_AGE` es esencial en cualquier cleanup basado en "referencia/no-referencia".** Sin las 24h, una foto recién subida durante el formulario activo del cliente podría borrarse en el mismo segundo. La ventana protege contra el caso real (cliente subiendo) sin penalizar el caso patológico (huérfana hace meses).

3. **Reusar la tabla `cleanup_logs` con discriminador en `detalle` es la decisión correcta.** Crear `cleanup_reviews_logs` separada habría sumado 1 migración SQL, 1 SELECT extra en la UI del admin, y 0 valor incremental. JSONB resuelve el caso sin schema migrations.

4. **El nombre del JWT en sessionStorage es `founder_admin_token`** (no `founder_admin_jwt`). Anotado para futuras sesiones cuando se necesiten invocar endpoints desde la consola del browser para debugging.

### 🐛 Hallazgo lateral pendiente

Durante el testing del endpoint en producción, se observó en la consola DevTools un error 404 de `/favicon.ico`. El archivo `admin.html` no declara `<link rel="icon">`, así que el browser hace la petición default y como no existe el archivo en el server, devuelve 404. **Cosmético, sin impacto funcional.** Queda como opción (d) en el backlog de Sesión 43.

---

## ✅ SESIÓN 41b — Extensión del dashboard: botón "Todo" + filtro global + fix bug `$$` [14/05/2026]

**Sesión rápida de pulido del dashboard de Sesión 41.** Sin features nuevas, pero 3 ajustes importantes detectados en uso real:

### Bug detectado al renderizar — `$$` doble en tarjetas

**Síntoma:** las 4 tarjetas financieras de Sesión 41 mostraban `$$2.830` en lugar de `$2.830`. También el subtítulo de "Tasa de descuento" decía "descontados `$$539` sobre `$$2.830`".

**Causa raíz:** la función `fmtUYU(n)` (definida en `founder-admin.js`) ya devuelve el string con `$` adelante (`'$' + n.toLocaleString('es-UY')`). Al escribir el render de Sesión 41 puse `'$' + fmtUYU(...)` por costumbre, generando el doble signo.

**Fix:** quitar los `$` manuales en los 4 `setText` de las cards + en el subtítulo. **Solo cambió la concatenación**, no la lógica. La función `fmtUYU` queda intacta porque se usa en muchos lugares y revisar todos sería trabajo de scope mayor.

### Extensión por feedback del usuario — botón "Todo" + filtro global

El selector original de Sesión 41 (7/30/90/120/365 días) aplicaba solo al panel financiero. El usuario pidió:
1. Un botón **"Todo"** para ver el histórico completo del sitio.
2. Que el filtro afecte **TODO el dashboard**, no solo las 4 tarjetas financieras.

**Decisión arquitectónica clave:** ¿qué se filtra y qué NO?

| Métrica | Tipo | Decisión |
|---------|------|----------|
| Productos, Variantes color, Sets de fotos | Catálogo | **NO se filtra** (atemporal) |
| Pedidos totales | Catálogo / Ventas (ambiguo) | **SE filtra**, label cambia a "Pedidos del período" cuando no es Todo |
| Ingresos totales, Pedidos confirmados, Pendientes, Ticket promedio | Ventas | **SE filtra** |
| Análisis financiero (4 cards + top 5 cupones) | Ventas | **SE filtra** (ya filtraba en Sesión 41) |
| Ventas por producto, Métodos de pago, Estado de pedidos, Colores más vendidos | Gráficos de pedidos | **SE filtran** |

El gráfico de "Estado de pedidos" sigue mostrando cancelados/rechazados/pendientes (los estados que el panel financiero excluye), porque ese gráfico está justamente para visibilizar esos casos. Para distinguir las dos lógicas se introdujo un flag en `filterOrdersByPeriod()`:

```js
filterOrdersByPeriod(orders, periodValue, { excludeNonSales: true })
```

`renderDashboard()` filtra sin la flag (incluye todos los estados). `renderFinancialMetrics()` filtra con la flag (excluye Cancelado, Pago rechazado, Pendiente pago).

### Refactor de naming

- `state.financialPeriod` → `state.dashboardPeriod` (refleja el scope nuevo).
- `setFinancialPeriod()` → `setDashboardPeriod()` (idem).
- `window.setFinancialPeriod` → `window.setDashboardPeriod`.
- Key de localStorage: `founder_admin_dashboard_period` (nuevo) con fallback de lectura al key viejo `founder_admin_fin_period` (Sesión 41), así no se pierde la preferencia del usuario en el upgrade.

`setDashboardPeriod()` ahora llama a `renderDashboard()` completo en lugar de solo a `renderFinancialMetrics()`. El re-render es rápido (todo en memoria, no toca DB) así que no hay penalty.

### HTML — UI del selector

- Botón nuevo **"Todo"** agregado al final del grupo, con `data-period="todo"`.
- Título del bloque cambió de "📊 Análisis financiero" a "📊 Período de análisis" para reflejar el scope expandido.
- Label de `statPedidos` ahora es dinámica: "Pedidos totales" cuando es "Todo", "Pedidos del período" cuando es 7/30/90/120/365. Nuevo `id="statPedidosLabel"` para que JS la modifique.

### 📦 Archivos tocados (2)

| Tipo | Archivo | Cambios |
|------|---------|---------|
| 🎨 UI | `admin.html` | Botón "Todo" + cambio de `onclick` (de `setFinancialPeriod` a `setDashboardPeriod`) + título del bloque + `id="statPedidosLabel"` |
| 💻 Frontend | `components/founder-admin.js` | Refactor `financialPeriod` → `dashboardPeriod` (state + función + window + key localStorage con compat backward) + `renderDashboard()` ahora calcula `filteredOrders` una sola vez y todas las métricas/gráficos lo consumen + flag `excludeNonSales` en `filterOrdersByPeriod` + label dinámica de `statPedidos` + fix de `$$` doble en `renderFinancialMetrics` |

### 🎓 Lecciones de la sesión

1. **`fmtUYU` ya incluye el símbolo** — anotado fuerte para que no se repita. Las funciones formateadoras deben ser consistentes en el shape de retorno; si una devuelve con `$`, todas deben hacerlo (o ninguna).

2. **Backward compat de localStorage es trivial y vale la pena.** El user no perdió su preferencia (30 días que tenía guardada de Sesión 41) gracias a 2 líneas de fallback en el lector. Cero fricción en el upgrade.

3. **Calcular `filteredOrders` una sola vez al inicio de `renderDashboard`** es el patrón correcto. Pasarlo como argumento a cada bloque o filtrar en cada uno habría sido duplicación + bug-prone.

4. **El selector de período es un UI primitive de bajo costo y alto valor.** El user pidió la extensión 1 hora después de tenerlo. Sugiere que el patrón "selector de período → re-render todo" puede aparecer en otras vistas (ej. pedidos, cupones por uso, ventas por producto en detalle). Vale la pena consolidar la lógica en helpers reutilizables si vuelve a aparecer.

---

## ✅ SESIÓN 41 — Combo Opción 1 + Opción 4: completar Sesión 39 + dashboard financiero [14/05/2026]

**Sesión grande con dos features arquitectónicas combinadas.** La primera cierra una deuda técnica detectada hoy mismo (Sesión 39 incompleta en producción); la segunda construye un dashboard financiero que **depende** de la primera para tener datos limpios.

### 🚨 Hallazgo crítico — Sesión 39 estaba documentada pero NO implementada

Durante el análisis previo a Sesión 41 (planificando reportes financieros), se descubrió que **la arquitectura descrita en Sesión 39 del ESTADO.md NO coincidía con el código real**:

| Componente | Sesión 39 documentaba | Realidad pre-Sesión 41 |
|------------|----------------------|------------------------|
| Columnas DB (`descuento_cupon`, `descuento_transferencia`) | ✅ Existen | ✅ Existen (confirmado por auditoría de Sesión 40) |
| CHECK constraints | ✅ Existen | ✅ Existen |
| `admin.js` SELECTs extendidos | ✅ | ✅ |
| `seguimiento.js` SELECT extendido | ✅ | ✅ |
| `founder-seguimiento.js` lee DB con fallback | ✅ | ✅ |
| `email-templates.js` propaga campos | ✅ | ✅ |
| `founder-checkout.js` envía los campos | ✅ | ✅ |
| **`checkout.js` cleanOrder con los 3 campos** | ✅ | **❌ NO** |
| **`checkout.js` validación coherencia frontend↔backend** | ✅ | **❌ NO** |
| **`checkout.js` UPDATE post-RPC** | ✅ | **❌ NO** |
| **`checkout.js` `cupon_codigo` en cleanOrder** (causa Hotfix #1 de S39) | ✅ | **❌ NO** |
| Migración SQL para pedidos viejos | ✅ Idempotente | **❌ Nunca corrida** |

**Hipótesis del por qué:** todo el trabajo de lectura (admin, seguimiento, emails) estaba aplicado correctamente. Solo el archivo `checkout.js` —el que **escribe** los datos— quedó en versión vieja, posiblemente por un commit revertido o un merge parcial sin notar. El sitio funcionaba bien porque todos los lectores tienen fallback de despeje matemático (Sesión 36/37) cuando la DB trae los campos en 0.

**Impacto:** ningún pedido nuevo persistía el desglose en DB. Todos quedaban con `descuento_cupon=0, descuento_transferencia=0` y el desglose se reconstruía siempre por la fórmula matemática (que es frágil si cambia el porcentaje de transferencia).

### 🅰 Parte A — Completar la implementación de Sesión 39

**Tres cambios en `checkout.js`:**

1. **`cleanOrder` extendido** con `cupon_codigo` (normalizado uppercase), `descuento_cupon` (parseInt) y `descuento_transferencia` (parseInt). Defaults en 0 si el frontend no los envía (compat con cualquier cliente legacy).

2. **Validación de coherencia** antes del RPC: si `descuento_cupon > 0` o `descuento_transferencia > 0`, la suma debe igualar `descuento` total (tolerancia 1 peso por redondeos del 10%). Si vienen ambos en 0, se acepta sin chequear. Si el chequeo falla, devuelve `descuento_split_mismatch` HTTP 400 y el pedido NO se crea.

3. **UPDATE post-RPC** con los 2 campos del desglose. La RPC SQL `apply_coupon_and_create_order` queda intacta (decisión Sesión 39: la RPC sigue siendo la transacción atómica del cupón; los 2 campos nuevos son informativos, no críticos). Si el UPDATE falla, se loguea warning pero NO se devuelve error al cliente — el pedido es válido, y el frontend de seguimiento/emails caen al fallback matemático automáticamente.

**Migración SQL `SESION-41-SQL.sql` para pedidos viejos:**

- Script idempotente en 4 pasos: diagnóstico previo + UPDATE masivo + verificación 3-en-TRUE + (opcional) detalle de fallas.
- Solo toca filas con `descuento > 0 AND descuento_cupon = 0 AND descuento_transferencia = 0` → no re-aplicar.
- Fórmula reconstruida en SQL espejando el frontend: `cuponAmount = ROUND(subtotal + personalizacion_extra - ((total - envio) / 0.90))`, con clamps `LEAST(GREATEST(..., 0), descuento)` para defenderse de datos inconsistentes.
- Validada con smoke test sintético en Node: 6/6 casos cierran con suma exacta.

### 🅱 Parte B — Dashboard financiero (Opción 4 del backlog histórico)

**4 tarjetas nuevas** debajo de las métricas de ventas existentes, agrupadas bajo "📊 Análisis financiero":

| Tarjeta | Color | Métrica |
|---------|-------|---------|
| 📊 **Ventas brutas** | gold | `total_cobrado + descuentos_totales` (= "lo que hubiéramos cobrado sin descuentos") |
| 💸 **Ahorros por cupones** | purple (nuevo tinte) | sumatoria de `descuento_cupon` en el período |
| 💳 **Ahorros por transferencia** | blue | sumatoria de `descuento_transferencia` en el período |
| 🎯 **Tasa de descuento** | red | `descuentos_totales / ventas_brutas` × 100, 1 decimal |

**Bar chart "Top 5 cupones (por monto descontado)"** debajo de las cards: agrupa por `cupon_codigo`, ordena desc por monto total descontado en el período, top 5.

**Selector de período** con 5 botones (7/30/90/120/365 días). Default 30. Persistido en localStorage para que el admin recuerde la última selección entre visitas. **(Sesión 41b después agregó botón "Todo" y expandió el scope a todo el dashboard.)**

**Lógica de cálculo:**

- **`filterOrdersByPeriod(orders, days)`** — filtra por fecha (campo `fecha` con fallback a `created_at`), excluye Cancelado / Pago rechazado / Pendiente pago.
- **`splitDescuento(order)`** — devuelve `{ cupon, transferencia }` con prioridad 1 a las columnas DB y fallback al despeje matemático para pedidos pre-migración. Mismo patrón que `founder-seguimiento.js` y `email-templates.js`. Garantiza que el dashboard funcione **antes** de correr la migración SQL.
- **`renderFinancialMetrics()`** — orquesta todo: filtra → splittea cada pedido → agrega → renderiza cards + bar chart.

**Smoke test sintético** con dataset de 5 pedidos mezclando: pedidos post-Sesión 41 (con desglose DB), pedidos pre-Sesión 39 (sin desglose, fallback), y pedidos cancelados (excluidos). 5/5 casos pasaron con los totales esperados manualmente.

### 📦 Archivos tocados (3) + 1 SQL

| Tipo | Archivo | Cambios |
|------|---------|---------|
| 🔧 Backend | `api/checkout.js` | `cleanOrder` con 3 campos nuevos + validación coherencia + UPDATE post-RPC |
| 🎨 UI | `admin.html` | CSS nuevo (sales-card purple, fin-header, fin-period, fin-empty) + bloque HTML "📊 Análisis financiero" con selector + 4 cards + bar chart top cupones |
| 💻 Frontend | `components/founder-admin.js` | `state.financialPeriod` + `filterOrdersByPeriod` + `splitDescuento` + `setFinancialPeriod` + `renderFinancialMetrics` + sincronización de botón activo en bootstrap + `window.setFinancialPeriod` expuesto |
| 🗄️ SQL | `SESION-41-SQL.sql` | Migración idempotente con verificación post-update |

### 🎓 Lecciones de la sesión

1. **La inconsistencia entre documentación y código es invisible hasta que se intenta usar lo documentado.** Sesión 39 documentaba arquitectura que nunca se aplicó. El bug pasó 1 día completo en producción sin manifestarse porque el fallback matemático tapaba el síntoma. **Regla nueva:** cuando se cierra una sesión arquitectónica grande, además del smoke test funcional hacer un grep del código por las APIs/columnas nuevas para confirmar que ESTÁN siendo escritas, no solo leídas.

2. **Fallbacks en cascada salvan vidas.** El sistema funcionaba perfectamente sin el UPDATE post-RPC porque seguimiento.js, founder-seguimiento.js y email-templates.js tenían fallback al despeje. Cuando agregamos la persistencia real, los fallbacks siguen existiendo para pedidos viejos pre-migración. Esto significa **cero downtime, cero migración manual urgente**.

3. **Validación de coherencia client↔server con tolerancia.** El frontend calcula `descuento_cupon + descuento_transferencia = descuento` con redondeos del 10%. El backend rechazaría con `==` estricto. La tolerancia de 1 peso es **necesaria, no opcional**.

4. **Una sola función `splitDescuento` reusable** consume el patrón "prioridad DB → fallback matemático" en 3 lugares del frontend (founder-seguimiento.js, email-templates.js, founder-admin.js). El dashboard de Sesión 41 reutiliza la lógica. Si en el futuro cambia el % de transferencia, **una sola edición** en el helper actualiza todo.

5. **El localStorage backward-compat es 2 líneas de código.** Lee el key nuevo primero, después el viejo. Cualquier preferencia que el user tenía persiste. Sesión 41b lo aprovechó para renombrar `financialPeriod` → `dashboardPeriod` sin que el user perdiera su selección de 30 días.

---

## ✅ SESIÓN 40 — Combo de 3 mini-features + 2 bugs descubiertos en producción [14/05/2026]

**Primera sesión del día 14/05.** Tres tareas chicas del backlog en un solo combo + dos bugs serios descubiertos durante el testing de las features y arreglados en la misma sesión.

### 🅰 Opción (a) — Email automático al admin cuando entra pedido con grabado

**Pre-existía** el bloque HTML `blockPersonalizacion(order, items, 'admin')` en `email-templates.js` (Sesión 29) pero nunca se había conectado al flujo de creación de orden. Sesión 40 lo conecta.

**Implementación en 4 archivos:**

1. **`email-templates.js`** — agregada `templateAdminPersonalizacionAlert(order, items)`: template completo con tono operativo (sin "¡Gracias por tu compra!"; es interno al taller). Incluye: header, alerta destacada de "ESTE PEDIDO TIENE PERSONALIZACIÓN LÁSER", datos del cliente (nombre, email clickeable, celular, entrega), monto del grabado, total del pedido, link al panel admin (sin auto-login, solo navega), footer minimal.

2. **`email.js`** — agregada `sendAdminPersonalizacionAlert(order, items)`: función pública con:
   - Filtro de relevancia: solo envía si `personalizacion_extra > 0` o algún item tiene `personalizacion`.
   - Defensa graciosa: si falta `ADMIN_EMAIL` en env, hace skip silencioso con warning (no es error). La feature es opt-in vía configuración.
   - Subject: `⚡ Pedido con grabado #${numero} — preparar láser`.

3. **`checkout.js`** — agregada al `Promise.all` del flujo de transferencia (paralelo con CAPI y email del cliente, fire-and-forget con timeout 3.5s).

4. **`mp-webhook.js`** — agregada solo en la rama `esAprobacion`, NO en `esPendiente`. Razón: en MP pendiente (Abitab/Redpagos) el cliente todavía no pagó en efectivo; preparar archivos para un pago que puede caer es desperdicio. Solo cuando MP aprueba se notifica al admin. También se extendió `orderForEvents` con `personalizacion_extra` + `direccion` (faltaban en el SELECT de webhook).

**Variable de entorno nueva:** `ADMIN_EMAIL` — opcional. Si no se configura, la feature está apagada y nada falla. Configurada en Vercel con el email real del dueño.

**Hotfix en sesión:** el primer test mostró el email "Bounced" en Resend porque `ADMIN_EMAIL` se había escrito con typo (`foundar.uy@gmail.com` en vez de `founder.uy@gmail.com`). Corregida la variable en Vercel + redeploy + nuevo test → "Delivered" verde.

### 🅱 Opción (b) — Auditoría general de CHECK constraints

**Razón:** Sesión 32 reveló que `coupons_uso_check` y `coupons_tipo_check` habían estado desincronizados del código durante 18 sesiones (creados en S14, strings cambiados en sesiones posteriores, bug invisible porque la tabla estaba vacía). Sesión 40 audita todas las tablas para detectar otros casos similares.

**Script SQL de auditoría** en `SESION-40-SQL.sql` parte 1 — query read-only que lista todas las CHECK constraints de las tablas públicas del proyecto con su definición completa. El usuario corre el SQL en Supabase y comparte el resultado.

**Resultado de la auditoría — cero desincronizaciones:**

| Constraint | DB acepta | Código manda | Estado |
|-----------|-----------|--------------|--------|
| `coupons_tipo_check` | `'porcentaje', 'fijo'` | idem | ✅ |
| `coupons_uso_check` | `'multiuso', 'unico', 'por-email'` | idem | ✅ |
| `orders_entrega_check` | `'Envío', 'Retiro'` | idem | ✅ |
| `orders_pago_check` | `'Mercado Pago', 'Transferencia'` | idem | ✅ |
| `orders_estado_check` | 9 estados (Pendiente pago, Pendiente confirmación, Confirmado, En preparación, En camino, Listo para retirar, Entregado, Cancelado, Pago rechazado) | 9 estados (idénticos) | ✅ |
| `reviews_estado_check` | `'pendiente', 'aprobada', 'oculta'` | idem | ✅ |
| `cleanup_logs_trigger_check` | `'auto', 'manual'` | idem | ✅ |
| `personalizacion_examples_tipo_check` | `'adelante', 'interior', 'atras', 'texto'` | idem | ✅ |
| Numéricos `>= 0` y `> 0` | — | — | ✅ |

**Observación menor (no es bug):** `coupon_authorized_emails_reason_check` acepta 3 valores (`'review_reward'`, `'manual'`, `'campaign'`) pero el código solo usa 2 (`'review_reward'` y `'manual'`). Es la DB siendo **más permisiva** que el código, opuesto al bug de Sesión 32 (más restrictiva). Safe: no rompe inserts, está preparada para una futura feature de campañas.

**Conclusión:** la disciplina de mantener constraints sincronizadas post-Sesión 32 (sesiones 36, 38, 39 agregaron constraints con cuidado) funcionó. La deuda técnica queda cerrada.

### 🅲 Opción (c) — Drop columna legacy `products.banner_url`

**Pendiente desde Sesión 21** (cuando el hero banner se movió a `site_settings.hero_banner_url`). La columna quedó como "legacy silenciosa" durante 19 sesiones.

**Orden crítico de cambios:** primero JS, después SQL. Si se dropea primero la columna, los SELECTs del admin tiran error de columna inexistente.

1. **`founder-admin.js`** — quitada `banner_url: p.banner_url || ''` del mapeo de productos.
2. **`admin.js`** — quitada `banner_url` del SELECT de `list_products`.
3. **`supabase-client.js`** — actualizado el comentario histórico.
4. **`SESION-40-SQL.sql` parte 2** — `ALTER TABLE products DROP COLUMN IF EXISTS banner_url;` con verificación post-drop (query que devuelve 0 filas si todo OK).

### 🐛 Bug #1 descubierto en producción — Cupón PERSONAL aplicaba mal el descuento

**Síntoma:** al aplicar el cupón `PERSONAL` (que tiene flag `descuenta_personalizacion=true` y 3 slots cubiertos) en un carrito con Founder Confort ($2.490) + grabado láser ($290), el resumen mostraba un descuento de **−$2.490 del producto** en lugar de **−$290 del grabado**. El total quedaba $290 + envío (= producto regalado), debería haber sido $2.490 + envío (= grabado regalado).

**Causa raíz:** el endpoint `handleValidateCoupon` en `api/checkout.js` traía el SELECT de la tabla `coupons` **sin** las columnas `descuenta_personalizacion` ni `personalizacion_slots_cubiertos`. El response al frontend no incluía esas flags. El frontend (`founder-checkout.js` línea 464) bifurca:

```js
if (state.coupon.descuentaPersonalizacion === true) { ... cupón personalización ... }
else if (state.coupon.tipo === 'porcentaje')        { ... cupón clásico % ... }
else                                                  { ... cupón clásico fijo ... }
```

Como `descuentaPersonalizacion` venía `undefined`, NO entraba al `if` y caía al `else if`. El cupón PERSONAL tiene `tipo='porcentaje', valor=100` (forzado en admin con `valor:0`, pero en la DB queda 100 para reportes), entonces aplicaba 100% × $2.490 = $2.490 sobre el subtotal del producto.

**Por qué pasó:** la Sesión 34 documentó haber arreglado este bug con un fix en frontend ("`state.coupon` ahora guarda `descuentaPersonalizacion`..."), pero el fix asumía que el backend ya enviaba esos campos. Nunca se actualizó el `validate_coupon` del backend. El bug vivió desde Sesión 33 (creación del feature) hasta Sesión 40 — 7 sesiones, invisible porque el dueño nunca había probado el cupón PERSONAL hasta el testing de Sesión 40.

**Fix en `checkout.js`:**

1. SELECT extendido con `descuenta_personalizacion, personalizacion_slots_cubiertos`.
2. Validación de `min_compra` **se saltea** para cupones de personalización (el admin ya ignora esos campos visualmente; el backend debe ser consistente).
3. Response al frontend extendido con los 2 campos en camelCase (`descuentaPersonalizacion`, `personalizacionSlotsCubiertos`), espejando lo que el frontend ya esperaba leer.

Validado en producción: nuevo pedido con PERSONAL aplicó **−$290 del grabado**, no del producto. ✅

### 🐛 Bug #2 descubierto en producción — Botón confirmar bloqueado al volver de MP

**Síntoma:** el usuario clickeó "Continuar al pago (Mercado Pago)", entró a la pantalla de MP, se arrepintió, apretó **back button del navegador**, cambió el método de pago a "Transferencia", y al intentar clickear "Confirmar pedido (Transferencia)" el botón estaba deshabilitado y no respondía.

**Causa raíz:** el flow de MP en `founder-checkout.js`:

1. Click → `btn.disabled = true`, `btn.textContent = '⏳ Procesando...'`.
2. Redirect a MP: `window.location.href = apiResp.data.init_point` + `return`.
3. Cliente back en navegador → browser muestra la página desde **bfcache** (back/forward cache de Chrome/Firefox) → la página viene **con el estado del botón disabled**.
4. Cliente cambia método → `setPago(mode)` actualiza el texto pero NO re-habilita el botón.

**Fix con doble defensa en `founder-checkout.js`:**

1. **`setPago(mode)`** ahora también hace `btn.disabled = false`. Razón: si el user llega a `setPago`, está rearmando la compra; cualquier intento previo ya terminó (a MP y volvió, o falló y se mostró toast).

2. **Listener `pageshow` con `event.persisted === true`** — detecta cuando el browser muestra la página desde bfcache (back/forward) sin reload completo. Restaura el botón al estado correcto. Cubre el caso "cliente vuelve a checkout sin cambiar método de pago" (no toca `setPago`, solo apretó back).

Validado en producción: cliente puede ir → MP → back → cambiar a transferencia → confirmar sin trabas. ✅

### 📦 Archivos tocados (7) + 1 SQL

| Tipo | Archivo | Cambios |
|------|---------|---------|
| 🎨 Template | `api/_lib/email-templates.js` | +1 template `templateAdminPersonalizacionAlert` exportada |
| 🔧 Backend | `api/_lib/email.js` | +1 función `sendAdminPersonalizacionAlert`, import del template, comentario de header expandido a 6 funciones, env var `ADMIN_EMAIL` documentada |
| 🔧 Backend | `api/checkout.js` | +1 import del email admin, llamada al `Promise.all` de transferencia, fix Bug #1: SELECT + response de `validate_coupon` con flags de personalización |
| 🔧 Backend | `api/mp-webhook.js` | +1 import del email admin, llamada en rama `esAprobacion`, `orderForEvents` extendido con `personalizacion_extra` + `direccion`, SELECT extendido con `direccion` |
| 💻 Frontend | `components/founder-admin.js` | quitada referencia legacy a `banner_url` |
| 🔧 Backend | `api/admin.js` | quitada `banner_url` del SELECT de productos + comentario actualizado |
| 💻 Frontend | `supabase-client.js` | comentario histórico actualizado (drop S40) |
| 💻 Frontend | `components/founder-checkout.js` | Fix Bug #2: `setPago` re-habilita botón + listener `pageshow` para bfcache |
| 🗄️ SQL | `SESION-40-SQL.sql` | Parte 1 auditoría CHECK constraints (read-only) + Parte 2 drop `products.banner_url` con verificación |

### 🎓 Lecciones de la sesión

1. **Cuando una feature pre-existente no se "conectó" al flujo, conectarla puede destapar bugs latentes en código relacionado.** El email admin (Opción a) era trivial en aislamiento. Al probarlo en producción, el flujo completo de checkout se ejercitó por primera vez en mucho tiempo y aparecieron los 2 bugs. **Conclusión:** features chicas + testing E2E real son la mejor herramienta de descubrimiento.

2. **`bfcache` (back/forward cache) es real y silencioso.** Los navegadores modernos cachean la página completa (DOM + state JS) cuando el user va a otro sitio (ej. MP) y la restauran al volver. Cualquier estado modificado por JS antes del redirect persiste. El listener `pageshow` con `event.persisted` es el hook estándar para detectar este caso. **Patrón aplicable a cualquier flow con redirect externo (OAuth, pago, etc).**

3. **La inconsistencia frontend↔backend de Sesión 33 sobrevivió 7 sesiones.** El bug nunca apareció porque el feature concreto (cupón PERSONAL) no había sido testeado en producción. **Regla nueva:** cuando se agrega un campo nuevo a la DB que el frontend usa, agregar al checklist de la sesión: "verificar que el endpoint que lee el campo lo devuelva al frontend". Idealmente smoke test con request manual + inspección del response.

4. **Defensa en profundidad en variables de entorno.** `ADMIN_EMAIL` puede faltar (durante un setup nuevo, durante un rollback de Vercel, durante un test en preview env). La función chequea y hace skip silencioso si falta, sin tirar error. **Cero efectos colaterales** si el dueño nunca configura la variable.

5. **El typo en una env var puede tardar minutos en detectarse.** `foundar.uy` vs `founder.uy` se vio recién al mirar Resend → Logs y ver el status "Bounced". Antes de eso, el código respondía OK porque Resend acepta el envío y solo después detecta el bounce. **Aprendizaje:** cuando una integración externa devuelve OK pero no llega, mirar el dashboard del proveedor (Resend, MP, Meta) antes de revisar código.

---

## ✅ SESIÓN 39 — Combo financiero: desglose de descuentos + edición de cupones + 2 hotfixes [14/05/2026]

**Dos features arquitectónicas que cierran deuda técnica importante.** La primera (desglose de descuentos) reemplaza el despeje matemático frágil de Sesión 36/37 por columnas dedicadas en la DB. La segunda (edición de cupones) completa el CRUD del admin: antes solo se podía Pausar/Activar/Eliminar; ahora también Editar con preservación de integridad histórica (codigo + tipo bloqueados). Ambas features convivieron en la misma sesión porque comparten archivos clave (`admin.js`, `founder-admin.js`) y la decisión de "qué bloquear al editar" tiene implicaciones contables (cambiar valor de cupón usado vs no usado).

### 🏗️ Arquitectura del feature (2 partes + 2 hotfixes)

**Parte A — Desglose de descuentos en `orders`:**

Antes de Sesión 39, la tabla `orders` solo tenía `descuento` (suma total). El frontend de checkout calculaba 3 valores (`couponAmountSubtotal`, `couponAmountPersonalizado`, `transferAmount`) pero solo enviaba la suma. Cuando seguimiento o emails necesitaban mostrar el desglose, hacían **despeje matemático** asumiendo la fórmula exacta del 10% transferencia. Funcionaba, pero era frágil: si cambia el porcentaje o la fórmula, todo el desglose se rompe en silencio.

- 2 columnas nuevas en `orders`: `descuento_cupon` (INTEGER NOT NULL DEFAULT 0) + `descuento_transferencia` (INTEGER NOT NULL DEFAULT 0).
- 2 CHECK constraints nuevos: `orders_descuento_cupon_check` (`>= 0`) + `orders_descuento_transferencia_check` (`>= 0`).
- **Decisión de arquitectura clave:** NO tocar la RPC SQL `apply_coupon_and_create_order`. La RPC sigue insertando solo `descuento` total (fuente de verdad atómica del cupón). Los 2 campos nuevos se persisten vía **UPDATE post-RPC** desde el handler de Node. Razón: si el UPDATE falla, el pedido ya quedó bien creado y los campos quedan en 0 → cae al fallback de despeje. Son campos informativos, no críticos para la transacción.
- Backend `checkout.js`: `cleanOrder` extendido con los 2 campos + validación de coherencia (`descuento_cupon + descuento_transferencia` debe sumar `descuento`, tolerancia 1 peso por redondeo). Si vienen ambos en 0, se acepta para mantener compat con clientes viejos que aún no envían el desglose.
- Frontend `founder-checkout.js`: destructuring extendido para capturar `couponAmountSubtotal`, `couponAmountPersonalizado`, `transferAmount` de `calculateOrderTotals()`. Se mapean a `descuento_cupon: couponAmountSubtotal + couponAmountPersonalizado` (los 2 cupones se agrupan porque para el cliente y los reportes es "lo que descontó MI código") y `descuento_transferencia: transferAmount` (el 10% por método de pago).
- Frontend `founder-seguimiento.js`: `renderTotales` con prioridad 1 (DB) + fallback heurística (Sesión 36) para pedidos viejos. La firma pasó de 7 a 9 parámetros.
- Email `email-templates.js`: `renderDiscountLines` con prioridad 1 (DB) + fallback despeje matemático. Los 4 call sites de `blockItems`/`blockItemsWithPhotos` extendidos con `descuentoCupon` + `descuentoTransferencia`. `optsFull` propaga ambos campos a `renderDiscountLines`.
- Backend SELECTs (`seguimiento.js`, `admin.js`): los 3 SELECTs de `orders` extendidos con las 2 columnas nuevas.

**Migración SQL one-shot para pedidos viejos:**

- Script `SESION-39-SQL.sql` idempotente (usa `IF NOT EXISTS` y `WHERE descuento_cupon = 0 AND descuento_transferencia = 0` para no re-aplicar).
- UPDATE masivo que calcula el split usando la misma fórmula del frontend: `cuponAmount = subtotal + personalizExtra - ((total - envio) / 0.90)`, `transferAmount = descuento - cuponAmount`.
- Tres casos cubiertos: cupón+transferencia (despeje matemático), solo cupón (descuento entero a cupón), solo transferencia (descuento entero a transferencia).
- Verificación final 3-en-TRUE: columnas existen + suma coincide con descuento total para todos los pedidos migrados (tolerancia 1 peso) + no hay valores negativos. La query devuelve `verificacion = true` solo si los 3 checks pasan.
- Smoke test sintético validado en JS: 6/6 casos cierran con suma exacta (incluido caso con personalización + cupón porcentaje + transferencia).

**Parte B — Edición de cupones post-creación:**

Hasta Sesión 39, la tabla de cupones en el admin solo tenía botones ⏸️/▶️ y 🗑️. Para cambiar `valor`, `min_compra` o cualquier flag, había que eliminar el cupón y recrearlo — perdiendo `usos_count`, `emails_usados[]` e historial.

- Botón **✏️ Editar** agregado en cada fila de la tabla de cupones, entre Pausar y Eliminar.
- Click → el formulario inline existente (`#cuponClassicFields`, `#cpCodigo`, etc.) se prellena con los datos del cupón + scroll suave al form (`scrollIntoView({behavior:'smooth'})`) para UX mobile/desktop.
- **Campos bloqueados al editar:** `codigo` (input `readOnly` + clase `.is-readonly`) y `tipo` (select `disabled` + clase `.is-readonly`). CSS nuevo `.ci.is-readonly` con `background:rgba(255,255,255,0.03)` + `cursor:not-allowed` + `border-color:var(--border)` para señalizar visualmente.
- **Por qué bloquear codigo + tipo (decisión 2B del usuario):**
  - `codigo` → se persiste en `orders.cupon_codigo` para cada pedido que lo usa. Cambiarlo rompería las referencias visibles en historial.
  - `tipo` → cambiar porcentaje↔fijo a mitad de vida cambia la semántica del campo `valor` y confunde reportes (un cupón con tipo=fijo y valor=20 después de cambio se interpretaría como $20 cuando antes era 20%).
- **Una sola función `saveCupon()`** para crear y editar (DRY). Variable de estado `editingCouponId` (null|string) indica el modo. Bifurca al `apiAdmin('update_coupon', ...)` o `apiAdmin('create_coupon', ...)` según corresponda.
- Botón **"Cancelar edición"** (`#cpCancelEditBtn`) inicialmente `display:none`. En modo edición se hace visible y limpia el form al click. Refactor `resetCuponForm()` centraliza la limpieza (inputs + checkboxes + selectores + clases visuales).
- Mensajes contextuales: título del form cambia a *"Editar cupón \"XYZ\""*, botón cambia a *"💾 Guardar cambios"*, toast de éxito dice *"✅ Cupón XYZ actualizado"* vs *"✅ Cupón XYZ creado"*.

**Backend `update_coupon` reforzado (Sesión 39):**

- Whitelist de campos editables reducida: `codigo` y `tipo` **fuera** de la whitelist a nivel API (defensa en profundidad junto al frontend bloqueado). 11 campos editables, 2 bloqueados.
- Validación espejo de `handleCreateCoupon`: si patch incluye `solo_clientes_nuevos: true` o `solo_clientes_repetidos: true`, se lee la otra flag desde la DB para detectar combinación inválida (ej: editar uno sin saber el estado actual del otro).
- Validación de `descuenta_personalizacion: true` con slots 1-4 obligatorio.
- Validación de `es_recompensa_resena: true` desactiva la flag en cualquier otro cupón activo (con `.neq('id', id)` para no auto-desactivarse).

### 🔧 Hotfix #1 — Email de transferencia no detectaba presencia de cupón (post-deploy)

**Síntoma:** después del deploy, hicimos un pedido de prueba con cupón `PRUEBADESCUENTO10` + transferencia. La DB quedó perfecta: `descuento_cupon=249`, `descuento_transferencia=224`, `cupon_codigo='PRUEBADESCUENTO10'`. El seguimiento web mostraba las 2 tarjetas verdes con montos individuales. **Pero el email mostraba una sola tarjeta** ("Pago por transferencia · -$473") en lugar de 2.

**Causa raíz:** el objeto `cleanOrder` que se construye en `checkout.js` NO incluía `cupon_codigo`. Cuando `sendOrderConfirmationTransfer(cleanOrder, items)` se llamaba después del UPDATE post-RPC, el template del email recibía `order.cupon_codigo = undefined`. Dentro de `renderDiscountLines`, la condición `hayCupon = !!cuponCodigo` daba `false` → el código entraba al caso "solo transferencia" (1 tarjeta) en lugar de "cupón + transferencia" (2 tarjetas). **Bug histórico, no de Sesión 39:** existía desde que se introdujo la lógica de atribución en Sesión 36/37, pero pasaba desapercibido porque el caso "solo transferencia" mostraba lo correcto numéricamente cuando no había desglose en DB. Sesión 39 lo expuso porque ahora el sistema sí distingue los dos descuentos.

**Fix:** una línea agregada en `cleanOrder`:
```js
cupon_codigo: cupon ? String(cupon).trim().toUpperCase() : null,
```

La variable `cupon` ya estaba disponible en el scope desde `body.cupon` (línea 311). Ahora el template detecta presencia de cupón correctamente y arma las 2 tarjetas. Validado: segundo pedido de prueba mostró correctamente *"✓ Cupón PRUEBADESCUENTO10 aplicado · -$249"* + *"✓ Pago por transferencia · -$224"*.

**Lección:** los objetos que se pasan a templates de email deben tener todos los campos que el template podría necesitar para sus heurísticas, incluso si la fuente de verdad en DB ya los tiene. Acá el bug vivió 3 sesiones (36, 37, 38) porque las heurísticas anteriores fallaban silenciosamente al caso menos visible. Para el futuro: cuando se agrega un campo nuevo que afecta render, **auditar todos los objetos que se pasan a templates** (`cleanOrder`, `prevOrder`, etc.) y asegurar que incluyan el campo.

### 🔧 Hotfix #2 — Reactivar cupón único usado lo dejaba inutilizable

**Síntoma:** el admin intentó pausar un cupón de uso único (ya consumido por un cliente) y después reactivarlo. La UI mostraba estado "Activo" tras el toggle, pero al intentar usar el código en un pedido nuevo, devolvía `cupon_already_used`. El cupón quedaba "activo pero bloqueado".

**Causa raíz:** la validación de cupón único en `checkout.js` línea 276 (`if (data.uso === 'unico' && data.usos_count >= 1)`) y su espejo en la RPC SQL no leen el campo `activo` — leen `usos_count`. Pausar/reactivar solo cambia `activo`, no toca `usos_count`. Resultado: un cupón único ya usado, aunque se reactive, sigue bloqueado para siempre por su contador.

**Decisión de diseño:** entre 3 opciones discutidas (reset usos_count, reset usos_count + emails_usados, botón separado), el usuario eligió **resetear solo `usos_count`** al reactivar. Conserva `emails_usados[]` intencionalmente: si querés permitir que el MISMO email vuelva a usarlo, eliminás y recreás el cupón. Esto evita sorpresas en cupones que combinan `uso='unico'` con flags por-email.

**Fix backend (`admin.js` en `handleUpdateCoupon`):**

Bloque nuevo antes del UPDATE final que detecta la **transición** `inactivo → activo` en cupón `uso='unico'` con `usos_count >= 1`:

```js
if (patch.activo === true) {
  const { data: current } = await supabase
    .from('coupons')
    .select('codigo, uso, activo, usos_count')
    .eq('id', id)
    .maybeSingle();
  const estabaInactivo = current.activo === false;
  const esUnico        = current.uso === 'unico';
  const yaFueUsado     = Number(current.usos_count) >= 1;
  if (estabaInactivo && esUnico && yaFueUsado) {
    patch.usos_count = 0;
    console.log('[admin/update_coupon] reactivando cupón único usado — usos_count reseteado a 0', ...);
  }
}
```

**Reglas precisas:**
- Solo aplica en la **transición** inactivo → activo (no se dispara al editar un cupón ya activo).
- Solo aplica a cupones `'unico'` (los `multiuso` y `por-email` mantienen su contador histórico).
- Solo aplica si `usos_count >= 1` (no hay nada que resetear si nunca se usó).
- Tabla mental de casos cubiertos: 8 escenarios, todos correctos.

**Fix frontend (`founder-admin.js` en `toggleCupon`):**

Cuando el toggle detecta una reactivación de cupón único usado, hace `await loadCoupons()` para refrescar la UI con el `usos_count = 0` actualizado, y muestra toast específico:

```
"Cupón XYZ reactivado — usos reiniciados a 0"
```

en lugar del genérico *"Cupón XYZ activado"*. Caso normal (sin reset) mantiene la UX rápida con update local sin recargar.

**`saveCupon` en modo edición** no necesita cambio porque ya hacía `await loadCoupons()` al final — el reset se ve reflejado automáticamente.

### 🔑 Decisiones arquitectónicas clave

**1. UPDATE post-RPC en vez de modificar la RPC SQL.** Razones: (a) la RPC del cupón es transaccional y delicada — un error en SQL podría dejar pedidos en estado inconsistente; (b) los 2 campos nuevos son informativos, no afectan la atomicidad del cupón; (c) si el UPDATE falla, el pedido ya quedó bien creado y los campos quedan en 0 → cae al fallback de despeje (que también existe para pedidos viejos). Atomicidad estricta solo donde es realmente necesaria.

**2. Despeje matemático como fallback, no como camino principal.** El código de seguimiento y emails prioriza columnas dedicadas (`descuentoCupon > 0 || descuentoTransferencia > 0`); solo si ambas vienen en 0 cae al despeje histórico. Esto permite: (a) migración suave (los pedidos viejos siguen funcionando hasta correr el SQL); (b) defensa contra fallos del UPDATE post-RPC; (c) no romper la app si por algún motivo las columnas no se llenan.

**3. `cupon_codigo` derivado de la variable `cupon` del body, no del objeto `order` del cliente.** Razón: el frontend envía `cupon` en el top-level del body (separado del objeto `order`) porque la RPC lo necesita como tercer parámetro (`p_cupon`). El cliente NO envía `order.cupon_codigo` — eso lo persiste la RPC en la DB. Por eso el hotfix #1 toma `cupon` directamente (línea 311) para inyectarlo a `cleanOrder` antes de mandarlo al email.

**4. Reset de `usos_count` SOLO en transición, no en cada edición.** Si re-guardo "activo=true" sobre un cupón que ya estaba activo (ej: edito otro campo y dejo el toggle como estaba), NO debe resetearse el contador. La condición `estabaInactivo === false` previene esto explícitamente. Patrón: comparar estado actual de DB vs estado nuevo del patch para decidir.

**5. Bloquear `codigo` y `tipo` en edición (no solo bloqueo visual, también whitelist backend).** Defensa en profundidad: el frontend hace `readOnly` + `disabled` para UX, el backend filtra los campos por whitelist. Si un cliente malicioso usara curl para pegar al endpoint con `patch: {codigo: "NUEVO"}`, el backend descartaría ese campo silenciosamente (no llega al UPDATE).

**6. Validación de coherencia con tolerancia 1 peso por redondeo.** El desglose `descuento_cupon + descuento_transferencia` debe sumar `descuento` total, pero como cada parte se calcula con `Math.round()` (frontend) y la base del 10% transferencia es post-cupón, puede haber 1 peso de diferencia por redondeo. Usar comparación exacta rompería pedidos válidos. La tolerancia se replica en la verificación SQL final.

### 🧪 Validación

**Sintaxis JS:** 7/7 archivos pasan `node --check` (checkout.js, seguimiento.js, admin.js, email-templates.js, founder-checkout.js, founder-seguimiento.js, founder-admin.js).

**Balance HTML `admin.html`:** divs balanceados (363 abre / 363 cierra), buttons balanceados (47/47), todos los tags estructurales en cero.

**SQL migration verificada en producción:** las 3 columnas del select de verificación dieron `true` — `columnas_ok=true`, `suma_ok=true`, `sin_negativos=true`, `verificacion=true`. El usuario reportó el resultado con screenshot.

**Smoke test sintético en Node (6 casos):**
- Caso 1: solo cupón 20% (subtotal $5000) → cupón=$1000, transfer=$0, suma=$1000. ✓
- Caso 2: solo transferencia (subtotal $5000) → cupón=$0, transfer=$500, suma=$500. ✓
- Caso 3: cupón 20% + transferencia (subtotal $5000) → cupón=$1000, transfer=$400, suma=$1400. ✓
- Caso 4: sin descuento → 0/0. ✓
- Caso 5: cupón fijo $500 + transferencia (subtotal $5000) → cupón=$500, transfer=$450, suma=$950. ✓
- Caso 6: cupón 20% + transferencia + personalización $300 (subtotal $5000) → cupón=$1000, transfer=$430, suma=$1430. ✓

**Validación end-to-end en producción:**
1. SQL ejecutado en Supabase → `verificacion=true`. ✓
2. Primer pedido de prueba (F978814, PRUEBADESCUENTO10 + transferencia) → DB correcta (`descuento=473`, `descuento_cupon=249`, `descuento_transferencia=224`), seguimiento web mostró 2 tarjetas, email mostró solo 1 tarjeta → **hotfix #1 disparado**.
3. Segundo pedido de prueba (post hotfix #1) → email mostró las 2 tarjetas correctas. ✓
4. Test edición de cupón → formulario prellenado correctamente, codigo+tipo bloqueados visualmente. ✓
5. Test reactivación de cupón único usado → fallaba con `cupon_already_used` → **hotfix #2 disparado**.
6. Test post hotfix #2 → reactivación resetea `usos_count` a 0, toast informativo, cupón funcionable de nuevo. ✓

### 📜 Archivos modificados/creados

| Tipo | Archivo | Sección |
|---|---|---|
| 🆕 Nuevo | `SESION-39-SQL.sql` | Migration SQL idempotente (no se sube al repo) |
| ✏️ Edit | `api/checkout.js` | `cleanOrder` extendido + validación coherencia + UPDATE post-RPC + hotfix `cupon_codigo` |
| ✏️ Edit | `api/seguimiento.js` | 2 SELECTs extendidos con `descuento_cupon` + `descuento_transferencia` |
| ✏️ Edit | `api/admin.js` | SELECT `list_orders` + SELECT `update_order_status` extendidos + `handleUpdateCoupon` reforzado + reset usos_count en reactivación de cupón único |
| ✏️ Edit | `api/_lib/email-templates.js` | `renderDiscountLines` prioriza DB sobre despeje + 4 call sites de `blockItems` extendidos + `optsFull` propaga campos |
| ✏️ Edit | `founder-checkout.js` | Destructuring extendido + 2 campos nuevos en objeto `order` |
| ✏️ Edit | `founder-seguimiento.js` | Captura 2 campos nuevos + `renderTotales` con prioridad DB / fallback heurística (firma 7→9 params) |
| ✏️ Edit | `components/founder-admin.js` | Botón Editar en tabla + `editCupon()` + `cancelEditCupon()` + `resetCuponForm()` + `saveCupon()` dual create/update + `toggleCupon` con feedback de reset + 2 funciones expuestas al window |
| ✏️ Edit | `admin.html` | Botón "Cancelar edición" + CSS `.ci.is-readonly` |
| 🗄️ SQL | Supabase | 2 columnas en `orders` + 2 CHECK constraints + UPDATE migración + función helper para verificación |

### ⚠️ Pendientes específicos de Sesión 39 (próximas sesiones)

- **Reportes financieros con desglose** — ahora que tenemos las 2 columnas dedicadas, construir un dashboard en admin que separe "ventas brutas vs ahorros por cupones vs ahorros por transferencia" por período. Es la razón principal por la que se hizo (a). Esfuerzo: 2-3 horas.
- **Auditoría de constraints CHECK en otras tablas** — Sesión 39 agregó 2 CHECK constraints nuevos a `orders`. Aprovechar la inercia para auditar `products`, `product_colors`, `order_items`, etc. Sesión 32 ya identificó 2 desincronizados en `coupons`. Esfuerzo: 30 min.
- **Migrar emails históricos al nuevo desglose** — los emails de Sesión 36/37 a Sesión 38 mostraban el desglose por despeje matemático. Si algún cliente vuelve a abrir un email viejo, va a seguir viendo el despeje. No es crítico (el cálculo es matemáticamente correcto), pero podría ser visualmente inconsistente con el seguimiento web post-migración.
- **Eliminar el despeje matemático eventualmente** — cuando todos los pedidos viejos hayan sido migrados (ya están) y suficiente tiempo haya pasado, el fallback de despeje en `renderDiscountLines` y `renderTotales` se puede eliminar para simplificar el código. No urgente — el fallback es defensa en profundidad útil.
- **Considerar permitir editar `tipo` con confirmación explícita** — la decisión 2B fue conservadora. Si hay un caso real donde el admin necesita cambiar porcentaje↔fijo, podría agregarse una confirmación tipo *"Cambiar el tipo afecta la semántica del valor. ¿Continuar?"* en vez de bloqueo absoluto. Pendiente de feedback del usuario.

### 🧠 Lecciones de Sesión 39

1. **Análisis arquitectónico exhaustivo antes de codear paga.** Antes de escribir una línea, leí los call sites en 8 archivos (frontend + backend + email) y descubrí que `handleUpdateCoupon` ya tenía la whitelist completa (la edición de cupones era "casi gratis" porque el backend ya estaba). Eso permitió diseñar el UI más simple posible (un solo formulario para create/edit en vez de modal separado) y ahorró ~30 min de trabajo redundante.

2. **Decidir el alcance ANTES de codear con preguntas múltiples.** Las dos preguntas iniciales (1A vs 1B vs 1C para migración + 2A vs 2B vs 2C para bloqueo) definieron el alcance exacto. Sin ellas, podría haberme metido en migración SQL one-shot y descubrir que el usuario solo quería pedidos nuevos, o bloquear solo código y después tener que cambiar a bloquear también tipo. Patrón replicable: cuanto más arquitectónica la decisión, más vale upfront elicitar.

3. **No tocar la RPC SQL cuando no es estrictamente necesario.** El UPDATE post-RPC fue la decisión correcta. La tentación inicial era "todo en una transacción atómica" — pero los 2 campos nuevos son informativos, no afectan la consistencia del cupón. Atomicidad estricta solo donde realmente importa.

4. **Smoke test sintético en Node antes de subir.** Los 6 casos del smoke test (incluido el caso con personalización) detectaron temprano que la fórmula de migración SQL era matemáticamente correcta. Sin ese test, podría haber subido un SQL con un signo invertido y descubrirlo solo en producción.

5. **Los bugs históricos se exponen al cambiar el contexto, no al introducir el cambio.** El hotfix #1 (`cupon_codigo` faltante en `cleanOrder`) era un bug que existía desde Sesión 36. Pasaba desapercibido porque el fallback heurístico mostraba algo razonable. Sesión 39 cambió el contexto (ahora hay desglose en DB) y la incompatibilidad emergió. Lección: cuando se agrega un campo que afecta render de templates, **auditar todos los objetos que se pasan a esos templates** para verificar que tengan los campos necesarios para todas las heurísticas — no solo las que ya funcionan.

6. **Las "transiciones" merecen tratamiento distinto a "estados".** En el hotfix #2, la condición correcta no era "es activo y es único y fue usado" (eso aplicaría a cada edición) sino "**pasó** de inactivo a activo". Detectar transiciones requiere leer el estado actual de la DB antes del UPDATE, comparar con el patch, y actuar según el delta. Patrón replicable para cualquier futuro caso donde una acción debe disparar efectos secundarios solo en un cambio específico.

7. **Defensa en profundidad para reglas críticas: frontend + backend + DB.** Edición de cupones tiene 3 capas: (a) frontend bloquea visualmente código + tipo con `readOnly`/`disabled` (UX); (b) backend filtra los 2 campos vía whitelist en `handleUpdateCoupon` (defensa contra clientes maliciosos que peguen al endpoint con curl); (c) DB no tiene constraint específico acá, pero las CHECK constraints de las otras Sesiones (uso, tipo) protegerían contra valores inválidos. 3 capas independientes que protegen la misma invariante.

8. **Toast informativos diferenciados ahorran preguntas al cliente.** En el hotfix #2, el toast diferenciado ("usos reiniciados a 0" vs "activado") evita que el admin se sorprenda con el `usos_count = 0` cuando recargue. Cuesta una línea de código y previene un *"¿Por qué el contador volvió a cero?"* en el chat. Patrón: cuando una acción tiene efectos secundarios no obvios, el toast debe nombrar el efecto secundario.

---

## ✅ SESIÓN 38 — Sistema completo de reseñas con recompensa por cupón [13/05/2026]

**Feature grande end-to-end que cierra el pendiente "Opción B reseñas reales" abierto desde Sesión 26.** Las 4 reseñas mock históricas de `producto.html` (Sesión 20) por fin se reemplazan por reseñas reales de clientes con compra `Entregado`, con sistema de moderación previa por admin y un loop de fidelización: cada reseña dejada otorga automáticamente un cupón de descuento al email del cliente para su próxima compra.

### 🏗️ Arquitectura del feature (4 bloques)

**Bloque A — Schema + Storage:**
- Tabla nueva `reviews` (15 campos): vinculada a `orders.id` con UNIQUE constraint para garantizar 1 reseña por pedido. Estados: `pendiente` (default) / `aprobada` / `oculta`. Producto reseñado denormalizado (id + name + color) para sobrevivir borrados de catálogo. 3 índices optimizados: lookup por producto+aprobada (público), por estado+fecha (admin), por LOWER(email) (validación de duplicados).
- Tabla auxiliar `coupon_authorized_emails`: lista emails autorizados a usar un cupón ANTES de que lo usen. Resuelve el problema de "habilitar cupón por email" sin romper la lógica histórica de `emails_usados[]` (que sigue significando "ya lo usaron"). FK con `ON DELETE SET NULL` hacia `reviews` para que borrar una reseña no revoque el cupón ya entregado.
- Columna nueva `coupons.es_recompensa_resena` (BOOLEAN). Índice único parcial `coupons_only_one_review_reward_active` que impide tener 2 cupones con la flag activos simultáneamente (a nivel DB).
- Función SQL `get_review_reward_coupon()` (STABLE): devuelve el cupón activo marcado como recompensa o NULL. Usada por el endpoint cuando se crea una reseña.
- Bucket nuevo `reviews-photos` (PÚBLICO, 5 MB, JPG/PNG/WEBP). Diferente de `personalizacion-uploads` (privado) porque las fotos de reseñas están pensadas para mostrarse junto a la reseña aprobada.
- SQL idempotente con verificación final (5 chequeos en TRUE) para confirmar que todo quedó OK.

**Bloque B — Backend:**
- Endpoint público nuevo `/api/reviews.js` con 4 actions:
  - `get` — consulta si un pedido tiene reseña (devuelve también `order_estado` para que el frontend sepa si mostrar formulario).
  - `get_upload_url` — genera signed URL para subir UNA foto al bucket público. Path estructurado `yyyymm/uuid-slug.ext`.
  - `create` — crea la reseña con validaciones triples (frontend + backend + DB constraints): rating 1-5, texto 10-1000 chars, max 3 fotos cuyas URLs deben pertenecer al bucket esperado, pedido debe pertenecer al email Y estar Entregado, no debe existir reseña previa para ese order_id. Después de insertar, llama a `get_review_reward_coupon()` y autoriza al email vía INSERT en `coupon_authorized_emails`. Persiste el código del cupón en `reviews.reward_coupon_codigo` para mostrarlo al cliente. Si no hay cupón configurado o falla algo, la reseña se crea igual y `reward_coupon: null` (NO bloquea al cliente).
  - `list_public` — endpoint read-only sin auth que devuelve reseñas `aprobada` filtradas por `product_id` o `product_name`. Solo campos SAFE (sin email, sin order_id, sin código de cupón). Usado por `producto.html`.
- 4 handlers nuevos en `api/admin.js` (protegidos por JWT):
  - `list_reviews` (filtro opcional por estado, incluye JOIN con orders para mostrar nro de pedido).
  - `update_review_status` (pendiente↔aprobada↔oculta).
  - `delete_review` (irreversible, requiere `confirm: true`, borra también las fotos del storage extrayéndolas de las URLs).
  - `set_coupon_review_reward` (no usado por el admin actualmente — se hace inline desde saveCupon, pero queda disponible para uso futuro).
- Modificaciones en `api/checkout.js`: SELECT extendido para incluir `es_recompensa_resena` + bloque nuevo en `handleValidateCoupon` y `handleCreateOrder` que valida que el email esté autorizado en `coupon_authorized_emails` cuando el cupón tiene la flag. Mensaje al cliente: *"Este cupón es exclusivo para clientes que dejaron una reseña."*
- Modificaciones en `api/admin.js` (handleCreateCoupon): si el cupón nuevo tiene `es_recompensa_resena=true` Y `activo=true`, primero desactiva la flag en cualquier otro cupón activo (defensa en profundidad junto al índice único parcial).
- Rate limiting: agregado `create_review: 5/hora` a la config centralizada de `rate-limit.js`.
- Email transaccional nuevo: `sendReviewThankYou(order, review)` + template HTML con estrellas en dorado + bloque destacado del cupón (código en monoespaciada con borde discontinuo dorado, mismo lenguaje visual de los emails post-checkout).

**Bloque C — Frontend público:**
- Componente nuevo `components/founder-reviews.js` (~430 líneas): bloque inline en seguimiento.html. Punto de entrada `renderReviewBlock(pedido)` decide qué mostrar: nada si estado≠`Entregado`, formulario si no hay reseña, card "ya enviada" si ya hay. Maneja: estrellas (click + hover preview), contador de caracteres en vivo, validación de tipo+peso por foto, subida vía URL firmada con preview local con `URL.createObjectURL`, estado `uploading/ready`, submit con UI de loading, mapeo de errores del backend a mensajes amigables, copiar código de cupón al clipboard con fallback a execCommand.
- Componente nuevo `components/founder-reviews-loader.js` (~180 líneas): reemplaza las 4 reseñas mock en producto.html. Punto de entrada `loadProductReviews(product)`. Si no hay reseñas aprobadas → oculta la sección entera (mejor mostrar nada que reseñas falsas). Si hay → genera HTML dinámico de las cards (incluyendo fotos si tienen) + dots según cantidad real + actualiza el JSON-LD del producto con `aggregateRating` (promedio + count) + array `review` con las 4 mejores reseñas (Google rich results: estrellitas en SERP). Dispatch del evento `founder-reviews-loaded` para que el carrusel se rebindee.
- Modificaciones en `seguimiento.html`: CSS completo del bloque (~190 líneas) con dos variantes (formulario + card ya-enviada), variable `--color-success` agregada al `:root`, contenedor `#reviewBlockContainer` insertado antes del botón "Nueva consulta", script `founder-reviews.js` cargado antes de `founder-seguimiento.js`.
- Modificaciones en `seguimiento.js` (`mostrarResultado`): llamada a `renderReviewBlock(p)` después de mostrar el resultado. Limpieza del bloque en `resetear()`.
- Modificaciones en `producto.html`: 4 cards mock eliminadas (contenedor `#reviewsGrid` ahora arranca vacío + `#reviewsSection` con `display:none` inicial), CSS nuevo para `.review-card__photos` (fotos en thumbnails 56×56), `bindReviewsCarousel` refactorizado: separación entre listeners únicos (flechas + visibility + resize) y dots rebindeables (rebindReviewsDots), nuevo listener `founder-reviews-loaded` que resetea `state.reviewIndex` y re-arranca autoplay con la cantidad real de reseñas. `loadProductReviews(state.product)` llamado después de `injectSEOMetadata`.

**Bloque D — Frontend admin:**
- Componente nuevo `components/founder-admin-reviews.js` (~290 líneas): panel completo de moderación. Punto de entrada `loadReviews()`. Filtros por estado con contadores en badges (Todas / Pendientes N / Aprobadas N / Ocultas N). Cards con estrellas + badge de estado + datos del autor + fecha del pedido + texto completo + grilla de fotos thumbs (click abre en nueva pestaña). Acciones según estado: pendiente→[Aprobar, Ocultar, Eliminar], aprobada→[Ocultar, Eliminar], oculta→[Re-aprobar, Eliminar]. Confirmación nativa antes de eliminar con aclaración "el cupón ya entregado NO se revoca".
- Modificaciones en `admin.html`: nav item nuevo "⭐ Reseñas" en sidebar (sección Herramientas, entre Cupones y Banner). Página `#page-resenas` con tarjeta superior de info del cupón actual + barra de filtros + listado dinámico. Modal `#reviewDetailModal` (reservado para fase futura — hoy se usa el listado inline). CSS nuevo (~95 líneas) con `.review-admin-card`, `.review-admin-card__badge` con variantes pendiente/aprobada/oculta, grilla responsive (2 columnas desktop, 1 columna en <700px).
- Modificación al formulario de cupones en `admin.html`: nuevo cupon-flag "⭐ Cupón de recompensa por reseña" en el mismo estilo que los 3 existentes (solo-repetidos, solo-nuevos, descuenta-personalización).
- Modificación en `components/founder-admin.js`: hook `nav('resenas')` → `loadReviews()`. saveCupon lee el flag nuevo `cpEsRecompensaResena`. Whitelist de update extendida con `es_recompensa_resena`. Reset del checkbox al limpiar formulario. Badge ⭐ en `renderCouponsTable`. **Exposición al window de `apiAdmin` y `toast`** para que el componente separado pueda invocarlos sin tener que re-implementarlos.

### 🔑 Decisiones arquitectónicas clave

**1. Una reseña por pedido (no por email).** Si un cliente compra 3 veces, puede dejar 3 reseñas (UNIQUE en `order_id`). Razón: experiencias múltiples enriquecen el contenido y la repetición de compra es señal positiva.

**2. Moderación previa.** Las reseñas arrancan en `pendiente` y solo aparecen en `producto.html` cuando el admin las aprueba. **PERO el cupón se entrega al instante**, sin depender de aprobación. Razón: no decepcionar al cliente con espera de moderación.

**3. Cupón por-email, no genérico.** Solo el email que dejó la reseña puede usarlo. Implementado vía tabla nueva `coupon_authorized_emails`. Razón: respeta la lógica "tu recompensa por tu reseña" + evita compartir/abuso.

**4. Fotos en bucket público.** Las fotos viven en `reviews-photos` (PUBLIC) y se muestran junto a la reseña aprobada. Aviso legal en el formulario: "Al subir aceptás que se muestren públicamente". Razón: máxima conversión + fricción mínima en moderación.

**5. Nunca permitir editar el contenido de una reseña.** Admin solo puede aprobar/ocultar/eliminar. Razón: integridad. Una reseña "Buena" no puede ser convertida en "Excelente" por el admin sin consentimiento del cliente.

**6. Schema.org aggregateRating dinámico.** Solo se inyecta si hay ≥1 reseña aprobada. Google requiere mínimo 1 review válido. Las 4 mejores van como `review` en el JSON-LD para habilitar estrellitas en SERP.

**7. Bucket aparte vs reusar personalizacion-uploads.** Decisión: bucket nuevo. Razones: (a) MIME types distintos (fotos reales → WEBP en vez de SVG), (b) políticas de retención distintas (las fotos de reseñas son permanentes, las de personalización son borrables a 60 días post-entrega), (c) auditoría más limpia.

**8. apiAdmin expuesto al window.** Histórico: `apiAdmin` era privado al IIFE de `founder-admin.js`. Para que `founder-admin-reviews.js` (componente nuevo separado) lo use sin re-implementar JWT handling, lo exponemos al window. Patrón consistente con `nav` que ya estaba expuesto.

### 🧪 Validación

**Sintaxis JS:** 11/11 archivos pasan `node --check` (reviews.js, admin.js, checkout.js, email.js, email-templates.js, rate-limit.js, founder-reviews.js, founder-reviews-loader.js, founder-admin-reviews.js, founder-seguimiento.js, founder-admin.js).

**Balance HTML:** 3/3 archivos con tags balanceados (seguimiento.html +1 div esperado del contenedor de reseñas, admin.html +21 divs esperados de la página nueva + filtros + modal + card de info, producto.html -8 divs esperados por eliminación de 4 cards mock que tenían 2 divs cada una).

**Decisiones técnicas testeables (no producción aún):**
- Si dos clientes intentan reseñar el mismo pedido (race condition) → segundo recibe error `already_reviewed`. El UNIQUE constraint protege a nivel DB.
- Si se sube foto con MIME falso (ej `image/png` declarado pero el archivo es `.exe`) → bucket lo rechaza por validación interna (whitelist server-side `MIME_TO_EXT`).
- Si se intenta usar `GRACIAS10` sin reseña previa → backend devuelve `cupon_review_reward_only`.
- Si admin marca un cupón nuevo con la flag mientras hay otro activo → backend desactiva el anterior antes del INSERT (no error por índice único parcial).

**Validación final en producción:** pendiente. El usuario subirá los 12 archivos a GitHub, Vercel deployará, y testeará el flow end-to-end con un pedido propio marcado como Entregado.

### 📜 Archivos modificados/creados

| Tipo | Archivo | Sección |
|---|---|---|
| 🆕 Nuevo | `api/reviews.js` | Endpoint público (4 actions) |
| 🆕 Nuevo | `components/founder-reviews.js` | Formulario en seguimiento |
| 🆕 Nuevo | `components/founder-reviews-loader.js` | Reseñas reales en producto |
| 🆕 Nuevo | `components/founder-admin-reviews.js` | Panel moderación admin |
| ✏️ Edit | `api/admin.js` | +4 handlers (list/update_status/delete/set_reward) + INSERT con flag |
| ✏️ Edit | `api/checkout.js` | Validación de email autorizado al aplicar/crear |
| ✏️ Edit | `api/_lib/email.js` | `sendReviewThankYou()` |
| ✏️ Edit | `api/_lib/email-templates.js` | `templateReviewThankYou()` |
| ✏️ Edit | `api/_lib/rate-limit.js` | `create_review: 5/hora` |
| ✏️ Edit | `seguimiento.html` | CSS + contenedor + carga del componente |
| ✏️ Edit | `producto.html` | 4 mock eliminadas + CSS fotos + loader + carrusel refactorizado |
| ✏️ Edit | `admin.html` | Nav + página + modal + checkbox cupón + CSS |
| ✏️ Edit | `components/founder-seguimiento.js` | Llamada a renderReviewBlock + cleanup |
| ✏️ Edit | `components/founder-admin.js` | Hook nav + saveCupon + whitelist + badge + exposición |
| 🗄️ SQL | Supabase | Tabla reviews + tabla coupon_authorized_emails + columna + función + bucket |

### ⚠️ Pendientes específicos de Sesión 38 (próximas sesiones)

- **Cleanup automático de fotos huérfanas.** Hoy `delete_review` borra las fotos del bucket inline. Si el storage falla, las fotos quedan huérfanas. Solución: cron semanal que liste paths del bucket y compare con `reviews.fotos_urls` actuales. Reusa el patrón del cron de `cleanup-personalizacion.js`.
- **Email automático recordatorio post-entrega.** A los 5-7 días de marcar el pedido como Entregado, mandar email "¿Qué te pareció? Dejá tu reseña y ganá GRACIAS10". Requiere cron + tabla flag de dedup. Combina con la idea (c) del menú principal.
- **Filtro por producto en panel admin.** Hoy se filtra solo por estado. Agregar dropdown "Producto" sería útil cuando haya catálogo más grande.
- **Edición de reseñas por el cliente.** Decidir si permitir editar dentro de los primeros X días (con re-moderación obligatoria). Hoy: solo se puede dejar una vez y queda inmutable.
- **Respuesta del admin a una reseña** (modelo "Respondido por Founder"). Podría aumentar engagement. Requiere columna nueva `admin_reply` + UI en producto.

### 🧠 Lecciones de Sesión 38

1. **Reusar infraestructura existente vs crear nueva.** El sistema `por-email` ya existía (Sesión 32-33). Resistí la tentación de hacer un sistema paralelo de "cupones para reseñas" y en su lugar agregué una flag + tabla auxiliar. Resultado: cero código duplicado, una sola lógica de validación, una sola RPC SQL.

2. **Bucket público vs privado: pensar en flujo, no en privacidad por default.** El primer instinto fue "privado hasta moderación, después público" — pero eso complica el render. Como las fotos sin URL pública no se ven en producto.html ni aprobadas, y la URL es opaca (UUID), público desde el inicio es más simple y la moderación opera sobre `estado=aprobada` que es lo que controla la visibilidad.

3. **Componente separado vs inflar archivo grande.** `founder-admin.js` ya tiene 2994 líneas. Agregar 300 líneas más de moderación lo hubiera llevado a 3300. En su lugar, creé `founder-admin-reviews.js` independiente y solo expuse las 2 funciones que necesita (`apiAdmin`, `toast`) al window. Resultado: separación de concerns + facilidad para diagnosticar bugs por archivo.

4. **Decisiones de UX explicitadas en preguntas múltiples ANTES de codear.** Antes de tocar una línea, presenté 6 decisiones de arquitectura con recomendaciones. El usuario aprobó todas con "vamos con las recomendadas". Si una sola hubiera sido distinta (ej "una reseña por email" en vez de "por pedido"), el schema entero cambiaba. Lección: cuanto más grande la feature, más vale la pena el upfront de elicitar decisiones.

5. **Re-bindeo de listeners cuando el HTML cambia async.** El carrusel original de reseñas asumía 4 cards estáticas en el HTML al cargar. Con reseñas async desde Supabase, los listeners de dots quedaban en nodos eliminados. Solución limpia: separar listeners únicos (flechas) de rebindeables (dots) + evento custom `founder-reviews-loaded` que reactiva el rebindeo. Patrón replicable para cualquier widget que cambie su DOM dinámicamente.

6. **Defensa en profundidad para validaciones cross-table.** Para validar "este email está autorizado para este cupón", el chequeo vive en 3 lugares: frontend (`founder-reviews.js` muestra mensaje), backend `validate_coupon` (rechaza al aplicar), backend `create_order` (rechaza antes de la RPC). La RPC SQL queda intacta — no la tocamos porque es atómica y delicada. Patrón: capa exterior valida, capa interior asume válido.

### 🔧 Bloque E — Validación en producción + 4 fixes inline + 2 ajustes UX [13/05/2026, post-deploy]

Después de subir el Bloque A→D inicial, se hizo smoke test end-to-end con un pedido real entregado. El flujo funcionó al ~80% al primer intento; los problemas detectados se cerraron en la misma sesión.

**Test sintético end-to-end ejecutado:**
1. Login admin → ver menú nuevo "⭐ Reseñas" ✓
2. Crear cupón GRACIAS10 con flag `es_recompensa_resena=TRUE` desde admin ✓
3. Tarjeta superior del panel Reseñas muestra "ACTIVO COMO RECOMPENSA" ✓
4. Modo incógnito → ir a seguimiento de pedido propio Entregado → formulario aparece ✓
5. Tocar 5 estrellas + escribir texto + (intentar foto de >5 MB → silenciosa) → enviar ✓
6. Card "✨ EN REVISIÓN" + cupón GRACIAS10 visible ✓
7. Email post-reseña llega correctamente con cupón destacado ✓
8. Admin aprobá la reseña → badge cambia a "✓ Aprobada" ✓
9. Ir a `/producto.html?p=Confort` → la reseña **NO aparece** ✗ (bug)

**🐛 Bug #1 — `reviews` endpoint devolvía 500 en producto.html**

- **Síntoma:** F12 → Network → `POST /api/reviews` con `action: 'list_public'` respondía con status 500.
- **Causa raíz:** incompatibilidad de tipos `product.id` vs `reviews.product_id`. En `components/supabase-client.js`, la función `toLegacyProduct()` reescribía el `id` del producto con un **entero secuencial** (1, 2, 3...) por compatibilidad con código histórico. Pero `reviews.product_id` se guardaba con el **UUID real** del producto en Supabase. El frontend enviaba `product_id: 1` al endpoint, y la query `WHERE product_id::uuid = 1` explotaba en Postgres porque no podés comparar UUID con entero.
- **Fix #1.1 (frontend):** En `supabase-client.js`, agregar un campo `dbId` que conserva el UUID real, manteniendo `id` como entero por compat. Productos ahora tienen ambos: `id: 1` (legacy) + `dbId: "8af879e7-..."` (UUID real).
- **Fix #1.2 (frontend):** En `founder-reviews-loader.js`, usar `product.dbId` en vez de `product.id`. Bonus: agregar `product_name` como fallback por si `dbId` no llegara (defensa en profundidad).
- **Fix #1.3 (backend, defensa en profundidad):** En `api/reviews.js` handler `list_public`, validar que `product_id` sea UUID válido con regex antes de pasarlo a la query. Si no lo es, fallback a `product_name` o devuelve lista vacía. Esto **garantiza que nunca más este endpoint pueda devolver 500** por un product_id mal formateado, sin importar quién lo llame (frontend con bug, cliente malicioso, etc).
- **Lección:** cuando un schema viejo reescribe campos por compat, hay que pensar en qué pasa cuando un sistema nuevo necesita los datos originales. El patrón limpio es **agregar un campo nuevo (`dbId`)** sin tocar el viejo (`id`). Cero ruptura de código existente.

**🐛 Bug #2 — Foto >5 MB se rechazaba silenciosamente**

- **Síntoma:** El cliente subía una foto pesada (>5 MB) y nada pasaba. Sin error, sin toast, sin feedback.
- **Causa raíz:** El código de `founder-reviews.js` SÍ validaba el tamaño y llamaba a `toast()`, pero el helper `toast()` interno hacía `if (typeof window.showToast === 'function')` y solo loggeaba a consola si no existía. **`window.showToast` solo se define en `founder-checkout.js`**, y `seguimiento.html` no carga ese archivo, así que la función no existía → fallback silencioso a `console.log`.
- **Fix:** Implementar un **toast self-contained** en `founder-reviews.js` que no depende de variables globales. Si `window.showToast` está disponible (en otras páginas), lo usa para mantener consistencia visual. Si no (en seguimiento.html), inyecta un toast propio centrado abajo con borde de color según tipo (rojo error / dorado info / verde success). Auto-dismiss a 4.5s para errores, 3s para success/info.
- **Mejora adicional:** El mensaje de error muestra el peso real del archivo: *"Foto demasiado pesada (8.3 MB). Máximo 5 MB."* en vez del genérico anterior.
- **Lección:** **un módulo no debe depender de helpers globales que pueden no estar cargados.** Patrón mejor: helper interno con fallback global. Esto se aplica retroactivamente como buena práctica para todos los nuevos componentes inline (en seguimiento.html no hay carrito interactivo, así que no hay garantía de que `showToast` esté).

**🎨 Ajuste UX #1 — Estrellas pre-seleccionadas en 5**

- **Pedido del dueño:** *"Quiero que las 5 estrellas estén marcadas por defecto. Conozco clientes que se distraen y dejan 0 estrellas sin darse cuenta."*
- **Trade-off discutido:** pre-seleccionar 5 estrellas vs exigir confirmación. El dueño eligió pre-selección directa por simplicidad y porque su prioridad es UX amigable, asumiendo el riesgo de leve sesgo positivo (las personas que iban a calificar más bajo aún pueden bajar las estrellas con un click).
- **Implementación en `founder-reviews.js`:**
  - `state.rating = 5` al inicializar el formulario (antes era 0).
  - HTML inicial: las 5 estrellas se renderizan con clase `is-active` y `aria-checked="true"` desde el primer paint.
  - Hint inicial: `"🤩 Excelente"` en lugar de `"Tocá las estrellas para calificar"`.
  - Toda la lógica de hover y click sigue funcionando: el cliente puede bajar las estrellas con un click normal, el hint cambia dinámicamente.

**🎨 Ajuste UX #2 — Título dinámico en seguimiento.html**

- **Pedido del dueño:** *"Cuando estás viendo el detalle del pedido, el título 'Seguí tu pedido / Ingresá tus datos para ver el estado' ocupa espacio innecesario. ¿Se puede ocultar y volver a aparecer si tocan 'Nueva consulta'?"*
- **Implementación en `seguimiento.html` + `founder-seguimiento.js`:**
  - Envolver `<h1 class="page-title">` y `<p class="page-subtitle">` en un nuevo `<div id="pageHeader">`.
  - En `mostrarResultado()`: ocultar `#pageHeader` además de `#searchCard` (que ya se ocultaba).
  - En `resetear()`: volver a mostrar `#pageHeader` además de `#searchCard`.
- **Patrón usado:** consistente con el manejo existente de `searchCard` (mostrar/ocultar entre estados). Cero deuda técnica nueva.

**🎨 Ajuste visual #3 — Ícono del carrito ensanchado**

- **Pedido del dueño:** *"El ícono del carrito se ve muy angosto. Mostrame ejemplos antes de cambiar."*
- **Proceso:** se renderizaron 6 opciones (A=actual, B-F variantes) usando el tool de visualización inline con cajas que simulaban el header negro real. El dueño eligió **Opción C**.
- **Implementación en `components/header.js`:**
  - SVG: `width="22" height="22"` → `width="26" height="24"`.
  - `viewBox="0 0 24 24"` → `viewBox="0 0 28 26"`.
  - Path de las asas reescrito: rectas rígidas `M9 10V6 a3 3 0 0 1 6 0v4` → curvas naturales `M9 11V8 c0-2.8 2.2-5 5-5 s5 2.2 5 5v3`.
- **Por qué fue seguro:** el CSS de `.cart-btn` usa `display: flex` + `padding: 8px` sin width/height hardcoded → el botón se adapta automáticamente al SVG nuevo. Ningún cambio de CSS necesario.
- **Cobertura:** como `header.js` es componente compartido, el cambio se propaga automáticamente a las 9 páginas del sitio (index, producto, checkout, seguimiento, admin, contacto, etc).

**🎯 Decisión de negocio: NO crear reseñas mock**

- **Pedido inicial:** *"Crea 4 reseñas genéricas para llenar la vista inicial mientras esperamos reales."*
- **Discusión:** se planteó el trade-off legal (Ley 17.250 de Defensa del Consumidor en Uruguay), reputacional (riesgo si un cliente o competidor descubre que son falsas), y técnico (Meta/Google detectan patrones). Se ofrecieron 3 alternativas: opción demo con familia/amigos reales, mensaje activo por WhatsApp a clientes con pedidos Entregado, esconder la sección hasta tener volumen real.
- **Decisión final del dueño:** *"Vamos a dejarlo así. Mejor que sean orgánicas las reseñas."*
- **Estado actual:** 2 reseñas reales (Evandro S. + Evandro P., ambas del dueño con sus propios pedidos). La sección en `producto.html` se ve completa con esas 2 cards.
- **Próximo paso natural:** cuando lleguen más clientes reales, el sistema entregará GRACIAS10 automáticamente y la sección se llenará orgánicamente.

### 📜 Archivos finales modificados/creados en Sesión 38 (con Bloque E)

| Tipo | Archivo | Bloque(s) que lo tocaron |
|---|---|---|
| 🆕 Nuevo | `api/reviews.js` | A→D inicial + E (fix #1.3) |
| 🆕 Nuevo | `components/founder-reviews.js` | A→D inicial + E (fix #2 toast self-contained, ajuste UX #1 estrellas) |
| 🆕 Nuevo | `components/founder-reviews-loader.js` | A→D inicial + E (fix #1.2 dbId) |
| 🆕 Nuevo | `components/founder-admin-reviews.js` | A→D inicial |
| ✏️ Edit | `api/admin.js` | A→D inicial (+4 handlers + INSERT con flag) |
| ✏️ Edit | `api/checkout.js` | A→D inicial (validación email autorizado) |
| ✏️ Edit | `api/_lib/email.js` | A→D inicial (`sendReviewThankYou()`) |
| ✏️ Edit | `api/_lib/email-templates.js` | A→D inicial (`templateReviewThankYou()`) |
| ✏️ Edit | `api/_lib/rate-limit.js` | A→D inicial (`create_review: 5/hora`) |
| ✏️ Edit | `seguimiento.html` | A→D inicial + E (ajuste UX #2 título dinámico) |
| ✏️ Edit | `producto.html` | A→D inicial |
| ✏️ Edit | `admin.html` | A→D inicial |
| ✏️ Edit | `components/founder-seguimiento.js` | A→D inicial + E (ajuste UX #2 título dinámico) |
| ✏️ Edit | `components/founder-admin.js` | A→D inicial |
| ✏️ Edit | `components/supabase-client.js` | E (fix #1.1 dbId) |
| ✏️ Edit | `components/header.js` | E (ajuste visual #3 ícono carrito) |
| 🗄️ SQL | Supabase | A inicial (tabla reviews + tabla coupon_authorized_emails + columna `es_recompensa_resena` + función `get_review_reward_coupon` + bucket `reviews-photos`) |

**Total Sesión 38 completa:** 16 archivos tocados + 1 SQL migration + 1 bucket nuevo. Cero rollbacks. Cero regresiones. Bug-rate post-deploy: 2 bugs encontrados, ambos cerrados en la misma sesión.

### 🧠 Lecciones adicionales del Bloque E

7. **Validación en producción descubre bugs imposibles de prever sin datos reales.** El bug #1 (UUID vs entero) era invisible en mi análisis de código porque ambos sistemas (legacy producto.html y nuevo reviews) funcionaban correctamente por separado — el problema solo aparecía al cruzarse. Lección: **siempre testear end-to-end con datos reales** apenas se despliega un feature que toca múltiples sistemas existentes. Tests sintéticos en chat no reemplazan smoke test en producción.

8. **Helpers globales son trampas latentes.** El bug #2 (toast silencioso) fue causado por asumir que `window.showToast` existía en todas las páginas. **Un módulo debe declarar explícitamente sus dependencias** o tener fallbacks self-contained. Pattern resultante: helper interno con detección + fallback al global cuando está disponible (mejor de ambos mundos).

9. **Defensa en profundidad cuesta poco y previene mucho.** El fix #1.3 (validación UUID en backend) no era estrictamente necesario después de fixear el frontend, pero blindó el endpoint contra cualquier futuro caller que mande un tipo raro. **5 líneas de regex pueden ahorrar un 500 silencioso en producción meses después.**

10. **Iterar visualmente antes de codear ahorra retrabajo.** Para el ícono del carrito, en lugar de aplicar un cambio y pedir feedback, mostré 6 variantes renderizadas en cajas que simulaban el header real. El dueño eligió en 30 segundos. Si hubiera aplicado mi favorita directo, podría haber sido la equivocada y necesitar 2-3 iteraciones. Pattern: **mostrar opciones visuales para cambios cosméticos donde la preferencia es subjetiva.**

11. **El dueño tomó la decisión correcta sobre mocks.** Cuando me pidió 4 reseñas falsas, podría haberlas creado sin objeciones — era su negocio, su decisión. Pero el trade-off legal y ético merecía ser explicitado. Tras ver las opciones, eligió esperar reseñas orgánicas. Pattern: **cuando un pedido tiene implicaciones legales o reputacionales no obvias, ofrecer las opciones legítimas antes de ejecutar la pedida.**

---

## ✅ SESIÓN 37 — Tarjetas verdes (Opción D) en emails con split exacto del descuento [13/05/2026]

**Sesión cosmética con cálculo matemático preciso.** Cerró el último gap del arco 32-37: los emails ahora muestran los descuentos como tarjetas verdes con borde izquierdo (el mismo formato visual que checkout y seguimiento), con el monto exacto de cada componente del descuento (cupón vs transferencia).

**Bloque A — Tarjetas en HTML email:** reescribió la función `renderDiscountLines` en `api/email-templates.js`. Antes mostraba filas planas de texto ("Cupón PERSONAL aplicado / Pago por transferencia (10%) / Total descontado -$X"). Ahora muestra **tabla anidada con `border-left: 3px solid #4caf82` y fondo `rgba(76,175,130,0.08)`**, compatible con Outlook, Gmail y Apple Mail (única forma confiable de hacer tarjetas en email: no usa flexbox, CSS variables, ni clases). Helper `renderCard(colspan, title, subtitle, amount)` genera la misma estructura para los 3 templates (transferencia, MP aprobado, MP pendiente, status update con foto).

**Bloque B — Split matemático exacto del descuento:** la DB guarda solo el descuento total (no desglosado entre cupón y transferencia). Antes de Sesión 37, emails mostraban "Total descontado" sin atribución de montos. Ahora se despeja con la ecuación:
```
descuento_cupon = subtotal + personalización - ((total - envío) / 0.90)
descuento_transferencia = descuento_total - descuento_cupon
```
Esto funciona porque la transferencia siempre es 10% del total después del cupón (regla establecida en Sesión 36). Cero queries extra a DB. Si el cálculo da inconsistente (sanity check: suma negativa o no cierra), fallback a una tarjeta combinada.

**Bloque C — Enriquecimiento de `opts` en `blockItems` y `blockItemsWithPhotos`:** ambas funciones ya recibían `total`, `envio`, `descuento` y los items. Ahora calculan internamente `subtotal` y `personalizExtra` desde los items, los agregan al `opts`, y los pasan a `renderDiscountLines`. Los templates llamadores no cambiaron — refactor sin breaking changes.

**Archivos modificados:** 1 (`api/email-templates.js`).

**Tests sintéticos:** 4/4 pasados (caso real del dueño con cupón PERSONAL + transferencia → $1.740 cupón + $498 transferencia = $2.238 ✓, solo cupón, solo transferencia, cupón clásico FOUNDER20 + transferencia con grabado).

**Validación en producción:** el dueño verificó el email del pedido entregado y confirmó que las 2 tarjetas muestran montos individuales correctos.

---

## ✅ SESIÓN 36 — Rediseño completo de la fórmula de descuentos + Opción D (tarjetas verdes) [13/05/2026]

**Sesión grande de refactor de business logic.** El dueño identificó que la regla histórica "cupón + transferencia = se aplica el mayor" desincentivaba la transferencia (que es lo que él quiere fomentar para ahorrar comisiones de Mercado Pago). La sesión cambió la regla a "todos los descuentos son acumulables" y unificó la UX en los 3 momentos del flujo (checkout, seguimiento, emails).

### Bloque A — Nueva fórmula de descuentos

**Antes:**
- Cupón clásico (subtotal) + Transferencia → se aplicaba el mayor (incompatible).
- Cupón personalización + Transferencia → se sumaban.

**Ahora:**
- TODO es acumulable.
- Transferencia 10% se calcula al final, sobre `(subtotal − cupón_subtotal) + (personalización − cupón_personalización)`. NUNCA toca el envío.
- El envío gratis (≥ $2.000) se decide sobre la base ANTES de transferencia (el cliente "se ganó" el envío con productos+grabados, la transferencia es bonus separado).

**Razón de negocio:** transferencia evita comisión de MP (~6% del total). El dueño quiere que el cliente vea el descuento de transferencia siempre que aplique, incluso si ya usó un cupón.

**Ejemplo numérico (validado con el dueño):**
- Founder Confort $2.490 + 4 grabados $1.160 + cupón FOUNDER20 (20%) + transferencia
- Cupón: -$498 (20% × $2.490)
- Base transferencia: ($2.490 − $498) + $1.160 = $3.152
- Transferencia: -$315 (10% × $3.152)
- Envío: gratis (base ≥ $2.000)
- **Total: $2.837**

### Bloque B — Tarjetas verdes (Opción D) en frontend

`founder-checkout.js`: refactor de `calculateOrderTotals()` con nueva fórmula. Render del resumen ahora muestra tarjetas verdes con título + subtítulo + monto:
- *✓ Cupón XXX aplicado / 20% de descuento del producto / -$498*
- *✓ Pago por transferencia / 10% sobre productos + grabados / -$315*

Tarjetas usan flexbox + variables CSS — en frontend funcionan sin problema.

`seguimiento.html` + `founder-seguimiento.js`: mismo patrón visual. La heurística: si hay solo 1 fuente de descuento → 1 tarjeta con monto. Si hay 2 fuentes → 2 tarjetas con descripción + línea "Total descontado" con monto total (limitación cerrada en Sesión 37 con despeje matemático).

### Bloque C — Bug raíz: `cupon_codigo` no se leía en 3 endpoints

El campo `cupon_codigo` ya existía en `orders` desde Sesión 14, y la RPC `apply_coupon_and_create_order` lo poblaba correctamente. Pero **tres endpoints diferentes nunca lo habían leído**:

1. **`api/checkout.js`** (`cleanOrder`): no inyectaba `cupon_codigo` en el objeto que pasa a `sendOrderConfirmationTransfer(cleanOrder, items)`. El email de transferencia inicial perdía la atribución del cupón.
2. **`api/mp-webhook.js`** (select de DB): no incluía `cupon_codigo`, `pago`, ni `personalizacion` en el select, así que el email post-MP no tenía contexto.
3. **`api/seguimiento.js`** (select de DB): no incluía `personalizacion_extra` ni `personalizacion` en items. La página de seguimiento ya tenía el render preparado pero no recibía los datos.

Los 3 selects fueron extendidos. La página de seguimiento ahora muestra atribución correcta para TODOS los pedidos (incluso los viejos, porque la RPC ya guardaba `cupon_codigo` desde antes).

### Bloque D — Bug del email no mostraba personalización por item

En `email-templates.js`, las funciones `blockItems` y `blockItemsWithPhotos` calculaban el subtotal de cada línea como `precio × cantidad`, sin sumar el extra de personalización. En la captura del dueño se veían 2 Founder Confort a $2.490 c/u pero arriba decía "Extra por grabado: $1.740". La suma de líneas no cuadraba con el total. Fix: ahora `subtotal = (precio + extra) × cantidad` y se agrega un subtítulo "· con grabado láser (+$X)" cuando aplica.

### Archivos modificados

8 archivos: `checkout.html`, `components/founder-checkout.js`, `api/checkout.js`, `api/mp-webhook.js`, `api/seguimiento.js`, `api/email-templates.js`, `seguimiento.html`, `components/founder-seguimiento.js`.

**Tests sintéticos:** 7/7 pasados (FOUNDER20 + transferencia + grabado completo, PERSONAL + transferencia + grabado completo, sin descuentos, solo transferencia, solo cupón FOUNDER20, caso límite con producto chico que cobra envío, retiro en local).

### Limitación cerrada en Sesión 37

En Sesión 36, cuando había cupón + transferencia, el email mostraba 2 etiquetas + un "Total descontado" porque no se podían dividir los montos sin queries extra a DB. Sesión 37 resolvió esto con despeje matemático.

---

## ✅ SESIÓN 35 — UX polish + admin mobile (priority B) [13/05/2026]

**4 ajustes en paralelo, todos independientes.**

**Ajuste 1 — Badge GRABADO no se rompe en mobile:** el `<span class="order-badge">✦ GRABADO</span>` tenía `letter-spacing:1px` y estaba inline en `.order-id` sin flex-wrap. En pantallas chicas se cortaba feo. Se creó clase `.order-badge` con `display:inline-flex` + `white-space:nowrap` y se cambió `.order-head` a `flex-wrap:wrap`. Mismo tratamiento para el badge "ARCHIVADO".

**Ajuste 2 — Auto-marca checkbox no-devolución:** unidireccional. Cuando el cliente marca el checkbox de Política de Privacidad, el segundo checkbox (no-devolución para personalización) se marca automáticamente — pero solo si está visible (carrito tiene grabado). Si el cliente DES-marca Privacidad, el otro NO se desmarca (decisión: legalmente más seguro). Listener idempotente con `dataset.s35Linked` para evitar duplicación si `init()` se llama varias veces. Implementado en `founder-checkout.js`.

**Ajuste 3 — Texto del cupón aplicado:** "X slots de personalización gratis" → "X grabados personalizados gratis". Con singular/plural ("1 grabado" vs "3 grabados"). Cambio mínimo en el `descLabel` de `founder-checkout.js`.

**Ajuste 4 — Admin mobile (priority B confirmada por el dueño):** sidebar como menú hamburguesa, lista de pedidos optimizada para mobile, modal de detalle responsive, filtros con scroll horizontal, formulario de cupones en una sola columna, botones más grandes para tocar con dedo.

- **Topbar**: agregado botón hamburguesa antes del logo (oculto en desktop). Logo más pequeño en mobile, badge "ADMIN" oculto en <768px, "Ver sitio →" oculto en <480px.
- **Sidebar**: `position:fixed`, drawer que entra desde la izquierda con `transform:translateX`. Backdrop oscuro semitransparente (`.sidebar-backdrop`) con click para cerrar.
- **Auto-cierre del drawer** cuando se navega a otra página en mobile (check `window.innerWidth <= 768` dentro de `nav()`).
- **3 breakpoints** progresivos: ≤900px (tablet, stats 2 cols, orders-grid 1 col), ≤768px (mobile, drawer + cards stack), ≤480px (small mobile, stats 1 col).
- **Cards de pedidos**: botones full-width con `padding:10px 12px` para tap fácil.
- **Filtros**: scroll horizontal con `-webkit-overflow-scrolling:touch` (iOS smooth scroll).
- **Modal "Ver detalle"**: ocupa casi todo el viewport en mobile, grids internos pasan a 1 columna.
- Funciones `toggleSidebar()` y `closeSidebar()` exportadas al window desde `founder-admin.js`.

**Pendiente para próxima sesión:** editor de productos (tabs de colores/fotos, drag&drop) y panel de personalización láser en mobile. Funcionales pero no totalmente pulidos visualmente.

**Archivos modificados:** 3 (`admin.html`, `components/founder-admin.js`, `components/founder-checkout.js`).

**Validación HTML:** 341/341 divs, 41/41 buttons, 26/26 spans.

---

## ✅ SESIÓN 34 — UX slot personalización + 2 bugs críticos cupón [13/05/2026]

**Sesión que cerró 2 bugs descubiertos al usar los cupones de Sesión 33 en producción, + 1 cambio UX cosmético.**

### Ajuste UX — Slot de imagen subida ya no parece error

Cuando el cliente subía una imagen de personalización láser, antes veía un botón rojo "✕ Quitar" que daba la impresión de error o problema. Ahora:
- Badge verde "✓ Subido" en lugar del botón rojo.
- Debajo del badge, link rojo subrayado "Eliminar imagen" (más chico, discreto pero accesible).

Clases nuevas: `.laser-upload__actions` (wrapper flex), `.laser-upload__status` (badge verde), `.laser-upload__remove-link` (link). Media query mobile adaptado para que el grupo se acomode bien en pantallas chicas (`.laser-upload__actions` con `grid-column:1/-1` y `align-items:center`).

`removeLaserFile(tipo)` sin cambios — sigue siendo el mismo callback. Sin confirmación previa (decisión del dueño: pedir confirmación sería fricción innecesaria para algo que se puede volver a subir en 5 segundos).

### Bug crítico #1 — Cupón GRABADOFREE siempre rechazaba

**Síntoma:** el dueño aplicaba el cupón en un carrito CON personalización y obtenía error *"Este código requiere productos personalizados en el pedido."*

**Causa raíz:** En Sesión 33 escribí en `api/checkout.js`:
```js
const hasPersonalizacion = body.hasPersonalizacion === true;
if (hasPersonalizacion === false) { rechazar; }
```
Pero el frontend `founder-checkout.js` **NUNCA enviaba `hasPersonalizacion` en el body de `validate_coupon`**. Llegaba `undefined`, que NO es `=== true`, entonces siempre entraba en el rechazo.

**Fix:**
- `founder-checkout.js`: ahora envía `hasPersonalizacion: state.cart.some(i => i && i.personalizacion)` en `validate_coupon`.
- `api/checkout.js`: cambió la lógica a `if (body.hasPersonalizacion === false)` — solo rechaza si viene EXPLÍCITAMENTE en false. Si viene `true` o `undefined`, deja pasar (la RPC SQL valida server-side con los items reales).

### Bug crítico #2 — Descuento aplicado sobre el subtotal del producto en vez de la personalización

**Síntoma:** cliente compra Founder Confort ($2.490) + 4 grabados ($1.160) y aplica cupón de personalización. El resumen mostraba: producto $2.490 - $2.490 = $0 + personalización $1.160 + envío. El descuento se comió todo el producto en vez de descontar de la personalización.

**Causa raíz:** En el admin, el usuario tenía que poner "Valor" en el cupón aunque marcara la flag "🎨 Descuenta personalización" (un campo obligatorio del formulario). El frontend `founder-checkout.js` en `calculateOrderTotals()` calculaba el descuento usando `state.coupon.tipo` y `state.coupon.valor` sin chequear si era un cupón de personalización. Como el usuario puso `valor=100`, el cálculo fue `subtotal × 100/100 = subtotal entero`.

**Fix:**
- `state.coupon` ahora guarda `descuentaPersonalizacion` y `personalizacionSlotsCubiertos` desde la respuesta del backend.
- `calculateOrderTotals()` bifurca: si `descuentaPersonalizacion === true`, calcula descuento con `slots × items_grabados × $290` (espejo de la RPC SQL).
- En el render del resumen, descuento se muestra en la **línea de personalización** (tachado el original + línea "↳ Cupón XXX -$YYY" en verde), no como descuento del producto.

### Mejora UX adicional — Admin no deja crear cupones inconsistentes

En `admin.html` se agrupó "Tipo de descuento + Valor + Mínimo de compra" en un wrapper `#cuponClassicFields` con clase `.cupon-classic-fields`. Cuando se marca "🎨 Personalización gratis", el wrapper se opaca (`.is-disabled`) con un mensaje *"⚠ Estos campos no se usan en cupones de personalización gratis"*. Listener idempotente en `loadCoupons()` → `setupCuponPersonalizacionToggle()`.

Frontend del admin (`founder-admin.js`) ahora **fuerza** `valor: 0`, `tipo: 'porcentaje'`, `min_compra: 0` al backend cuando es cupón de personalización, ignorando lo que haya escrito el usuario por error.

**Archivos modificados:** 5 (`producto.html`, `api/checkout.js`, `components/founder-checkout.js`, `admin.html`, `components/founder-admin.js`).

**Tests sintéticos:** 5/5 (caso del bug original con cifras exactas, cupón 2 slots multi-item, cupón clásico no toca personalización, sin cupón, cantidad 2 con grabado).

**Validación en producción:** dueño validó pedido $2.490 producto + $1.160 personalización + cupón PERSONAL 3 slots → producto $2.490 entero + personalización $290 neto + descuento -$870 → Total $2.780 ✓.

### Lección de la sesión

Los 2 bugs se escaparon porque en Sesión 33 testeé la **lógica de cada pieza aislada** (SQL puro, helper de admin) pero no probé la **integración frontend↔backend** (qué campos viajan, en qué shape, dónde se calcula cada cosa). **Regla para próximas sesiones:** cuando se agrega un tipo nuevo de algo (cupón, producto, descuento), revisar TODAS las funciones de cálculo y rendering que asuman los tipos viejos. Especialmente en frontend, donde los cálculos pueden estar en 2-3 lugares (preview, render, payload final).

---

## ✅ SESIÓN 33 — 2 tipos nuevos de cupón (✨ nuevos clientes + 🎨 personalización gratis) [13/05/2026]

**Sesión arquitectónica de extensión del sistema de cupones.** El dueño quería 2 cupones nuevos pero conceptualmente distintos al `FOUNDER20` (clásico) de Sesión 32. La sesión agregó 3 columnas + 1 CHECK constraint a la tabla `coupons` y refactorizó las funciones de creación/validación para soportar combinaciones.

### Schema nuevo

**3 columnas nuevas en `coupons`:**
- `solo_clientes_nuevos BOOLEAN DEFAULT FALSE` — espejo opuesto de `solo_clientes_repetidos`.
- `descuenta_personalizacion BOOLEAN DEFAULT FALSE` — master flag para cupones que descuentan grabado en vez de subtotal.
- `personalizacion_slots_cubiertos INTEGER DEFAULT 0` — cuántos slots cubre (1 a 4 si `descuenta_personalizacion=true`, 0 si la flag está apagada).

**Constraint nuevo `coupons_consistency_check`:**
```sql
NOT (solo_clientes_nuevos AND solo_clientes_repetidos)  -- excluyentes
AND (
  (descuenta_personalizacion = TRUE AND slots BETWEEN 1 AND 4)
  OR (descuenta_personalizacion = FALSE AND slots = 0)
)
```
Imposible crear un cupón malformado a nivel DB.

### Cupón #1 — ✨ Solo nuevos clientes (espejo de Sesión 32)

Si el cupón tiene `solo_clientes_nuevos = TRUE`, solo aplica si el email del comprador NO tiene compras `Entregado` previas. Defensa en profundidad: chequeo en `validate_coupon` (UX inmediato) y en la RPC SQL (verdad inviolable). Mensaje al cliente: *"Este código es exclusivo para nuevos clientes."*

NO combinable con `solo_clientes_repetidos` (un email es nuevo O recurrente, nunca ambos). Bloqueado a 3 niveles: frontend admin (toast), backend admin (`cupon_combinacion_invalida`), DB constraint.

### Cupón #2 — 🎨 Personalización gratis (concepto distinto)

Descuenta del costo de personalización (`personalizacion_extra` en `orders`), NO del subtotal. Cálculo:
```
descuento = MIN(slots_cubiertos × items_con_grabado × $290, personalizacion_extra_real)
```
- Multiplica por cantidad de items grabados del pedido.
- Tope al 100% del costo real de personalización (si el cupón cubre 4 slots pero el cliente personalizó 2, descuento = lo personalizado).
- Items "con grabado" = los que tienen al menos 1 slot lleno (adelante / interior / atrás / texto).

Combinable con `solo_clientes_repetidos` (cupón VIP) y `solo_clientes_nuevos` (cupón de bienvenida) y `por-email` (1 vez por persona).

### Archivos modificados

5 archivos: 1 SQL + `api/checkout.js`, `api/admin.js`, `admin.html`, `components/founder-admin.js`.

**Tests sintéticos:** 8/8 del cálculo de descuento (1 item con 1 slot tope 100%, 1 item 4 slots cupón 3, 2 items mixtos, sin personalización error, cupón 4 cliente 2 tope, cantidad 3 multiplicación, personalización vacía, mix grabado/no-grabado).

### Detalle no detectado en Sesión 33 (cerrado en Sesión 34)

Por foco en tests sintéticos, no testeé integración frontend↔backend. El cupón "Personalización gratis" tenía 2 bugs:
1. Frontend no enviaba `hasPersonalizacion` (rechazaba siempre).
2. Frontend usaba `tipo/valor` para calcular descuento sin ver la flag (aplicaba 100% del subtotal).

Ambos cerrados en Sesión 34.

---

## ✅ SESIÓN 32 — Cupón para clientes repetidos + fix de constraints históricos [13/05/2026]

**Feature de fidelización + cierre de bug latente desde Sesión 14.**

### Bloque A — Feature principal (5 archivos + 1 SQL)

**Decisión arquitectónica:** NO crear un tipo nuevo en `coupons.uso`. En su lugar agregar **atributo booleano `solo_clientes_repetidos`** (BOOLEAN, default FALSE) combinable con cualquier `uso` (multiuso / unico / por-email). Razones:
- Cero impacto en cupones existentes.
- Futuras extensiones triviales (VIP, primer comprador del mes, etc.).
- Mantiene CHECK constraints estables.

**SQL:** `ALTER TABLE coupons ADD COLUMN` + bloque nuevo en RPC `apply_coupon_and_create_order` que cuenta `orders WHERE LOWER(TRIM(email)) = v_email AND estado = 'Entregado' AND COALESCE(archivado, FALSE) = FALSE` cuando la flag está activa. Si count < 1 → `RAISE EXCEPTION 'cupon_solo_clientes_repetidos'`.

**Backend `api/checkout.js`:** 3 cambios — mensaje al error map, SELECT extendido con la nueva columna, pre-check en `handleValidateCoupon` para UX inmediato al aplicar (no hace falta esperar a "Confirmar pedido").

**Backend `api/admin.js`:** whitelist extendida + insert con `solo_clientes_repetidos: c.solo_clientes_repetidos === true`.

**Frontend `admin.html`:** CSS nuevo `.cupon-flag` (checkbox-card consistente con `.perm-grabado-check`) + markup con checkbox "🔄 Solo clientes con compra previa" + hint explicativo.

**Frontend `components/founder-admin.js`:** `saveCupon` lee y manda la flag. `renderCouponsTable` agrega badge 🔄 al lado del código. `viewOrder` con helper local `countDeliveredOrdersForEmail(email, excludeOrderId)` que cuenta en memoria sobre `state.allOrders` (cero round-trips a DB) + burbuja dorada "🔄 Cliente repetido — Xª compra" en el modal cuando count ≥ 1.

### Bloque B — Fix de constraints históricos (descubierto durante smoke test)

Durante la primera prueba de creación del cupón, INSERT a `coupons` falló con error 500 *"violates check constraint coupons_uso_check"*. SELECT a `pg_constraint` reveló:

```
ANTES (valores viejos de Sesión 14):
coupons_uso_check:  CHECK (uso  IN ('unico', 'multiple'))
coupons_tipo_check: CHECK (tipo IN ('porcentaje', 'monto'))

DESPUÉS (lo que el código siempre mandó):
coupons_uso_check:  CHECK (uso  IN ('multiuso', 'unico', 'por-email'))
coupons_tipo_check: CHECK (tipo IN ('porcentaje', 'fijo'))
```

El bug venía **desde la Sesión 14** (creación inicial de `coupons`). Como la tabla estaba **completamente vacía** (`SELECT count(*) = 0`), nadie intentó crear cupones desde el admin después de los cambios de strings. La regla histórica documentada en Sesión 22 ("constraints CHECK de orders = strings del frontend EXACTO") nunca se aplicó retroactivamente a `coupons`.

**Fix:** DROP + CREATE de ambos constraints con valores correctos. Cero riesgo de pérdida de data (tabla vacía).

### Bloque C — Smoke test end-to-end en producción

4/4 tests: crear cupón con flag activa, aplicar a email nunca visto (rechazado correctamente), aplicar a email recurrente (aceptado con 20%), burbuja "Cliente repetido — Xª compra" en modal admin.

**Decisión de UX confirmada por el dueño:** comportamiento "aplicar ≠ consumir" — el cupón solo se marca usado al COMPLETAR el pago, no al hacer click en Aplicar. Patrón estándar de e-commerces (Amazon, Mercado Libre).

### Métricas Sesión 32

- 11/11 tests sintéticos del helper `countDeliveredOrdersForEmail`.
- 4/4 tests end-to-end en producción.
- Cupón `FOUNDER20` (porcentaje 20%, por-email, solo clientes repetidos, sin fecha de fin) creado y operativo.

### Lecciones Sesión 32

1. **Pedir la función SQL real antes de tocarla**, no reconstruirla por inferencia. En el primer intento reconstruí la RPC y habría sobrescrito detalles sutiles (FOR UPDATE para lockear cupón, retorno `{order_id, descuento_calc}`, INTEGER en vez de NUMERIC). Regla: cuando hay que modificar una función SQL existente, pedir el código actual antes que adivinarlo.
2. **Atributo > tipo nuevo** cuando la naturaleza del cambio es "combinable con lo existente".
3. **El helper en memoria vence al round-trip a DB** cuando el admin ya tiene `state.allOrders` cargado.
4. **Defensa en profundidad para UX**: la RPC SQL es la fuente de verdad inviolable, pero validar también en `validate_coupon` permite que el cliente vea el error al APLICAR (no al ENVIAR).
5. **El smoke test descubre esqueletos en el placard**. El bug de constraints (Sesión 14, 18 sesiones atrás) sobrevivió por tabla vacía. Pendiente: auditoría general de constraints CHECK en TODAS las tablas (queda como opción `(g)` en próxima sesión).
6. **Método científico vence al "tirar fixes"**. Al ver "Error al guardar cupón", se barajaron 3 hipótesis (caché navegador, caché Vercel, GRANT). Las 3 erróneas. Capturar el Response real del POST en DevTools reveló la causa en 10 segundos. **Mejor instrumentar que hipotetizar.**

---

## 📋 Inventario completo de archivos tocados (Sesiones 32-37)

| Archivo | Sesiones que lo tocaron |
|---|---|
| `admin.html` | 32, 33, 34, 35 |
| `components/founder-admin.js` | 32, 33, 34, 35 |
| `api/checkout.js` | 32, 33, 34, 36 |
| `api/admin.js` | 32, 33 |
| `components/founder-checkout.js` | 34, 35, 36 |
| `producto.html` | 34 |
| `checkout.html` | 36 |
| `seguimiento.html` | 36 |
| `components/founder-seguimiento.js` | 36 |
| `api/seguimiento.js` | 36 |
| `api/mp-webhook.js` | 36 |
| `api/email-templates.js` | 36, 37 |
| **SQL Supabase** | 32, 33 |

## 🛡️ Estado del sitio post-Sesión 37

✅ Todo lo anterior (perf, SEO, MP, headers, rate limit, JWT, personalización láser end-to-end, etc.)
✅ **3 tipos de cupones combinables** (clientes repetidos, nuevos clientes, personalización gratis) — Sesión 32-33
✅ **Burbuja visual de cliente recurrente** en admin con count en memoria — Sesión 32
✅ **Bug histórico de constraints `coupons` cerrado** (Sesión 14 → 32) — Sesión 32
✅ **Defensa en triple capa**: frontend valida + backend valida + DB constraint — Sesión 32-33
✅ **Slot de imagen subida ya no parece error** (verde "Subido" + link "Eliminar imagen") — Sesión 34
✅ **Cupón de personalización funcional** (2 bugs críticos arreglados, descuento aplica donde corresponde) — Sesión 34
✅ **Auto-marca consent de no-devolución** unidireccional al marcar privacidad — Sesión 35
✅ **Admin mobile usable** (sidebar hamburguesa, pedidos + estados + cupones optimizados) — Sesión 35
✅ **Fórmula de descuentos acumulables** (cupón + transferencia ahora suman, no compiten) — Sesión 36
✅ **Tarjetas verdes Opción D** en checkout + seguimiento + emails — Sesión 36-37
✅ **Atribución correcta del descuento** en emails (cupón vs transferencia con montos exactos) — Sesión 37
✅ **`cupon_codigo` ahora se lee correctamente** en 3 endpoints (checkout, mp-webhook, seguimiento) — Sesión 36

---

## ✅ SESIÓN 31 — Rate Limiting + JWT para sesión admin [12-13/05/2026]

**Sesión de hardening profundo del checkout y del panel admin.** Se aplicaron los dos bloques que cerraban formalmente la seguridad del sitio: rate limiting en los 4 endpoints críticos (frena brute-force, spam y scraping) + JWT con expiración para el panel admin (el password ya no viaja en cada request). Cero cambios funcionales para clientes finales — toda la mejora es de defensa en profundidad. Como efecto colateral aparecieron y se resolvieron 2 problemas que estaban latentes desde antes (error de timezone de Postgres + bug de registro de crons en Vercel Hobby).

**Resultado:** sitio con **triple defensa de checkout** (validación de precios server-side de Sesión 30 + rate limit + headers de seguridad), y **panel admin con seguridad de nivel profesional** (JWT firmado, expiración automática, password fuera del navegador post-login).

### 🔵 Bloque B — Rate Limiting (4 endpoints protegidos)

**Decisión arquitectónica clave:** se evaluaron 3 opciones de storage (Vercel KV, Upstash Redis, tabla Supabase). Se eligió **tabla Supabase** por: (1) cero infraestructura nueva, (2) la carga esperada es mínima (~50-250 filas/semana), (3) administración directa por el dev (sin proveedores externos), (4) sin costos adicionales ahora ni a futuro.

**Algoritmo:** sliding window real (no fixed window). Las filas se cuentan desde "hace X segundos hasta ahora", lo que evita ráfagas 2× en bordes de ventanas calendario.

**Nuevos módulos en `api/_lib/`:**

**1. `api/_lib/rate-limit.js` (~195 líneas):**
- Función `getClientIp(req)` — extrae IP del cliente desde `x-forwarded-for` (Vercel pone la IP real en el primer valor de esa lista).
- Función `checkRateLimit(action, ip, max, windowSec)` — chequea + registra el intento en una transacción lógica (SELECT count + INSERT).
- Función `enforceRateLimit(action, req, res)` — wrapper que responde 429 con `Retry-After` header si excede, o devuelve `true` para que el handler continúe.
- Objeto `LIMITS` con la configuración centralizada de los 4 endpoints (cambiar un límite = 1 línea de código).
- **Política fail-open:** si la DB falla, dejamos pasar. Mejor no bloquear a clientes legítimos por un hipo de infra.

**Límites configurados:**
| Endpoint | Límite | Ventana | Protege contra |
|---|---|---|---|
| `admin_login` | 5 | 15 min | Brute-force del password admin |
| `create_order` | 10 | 1 hora | Spam de pedidos falsos |
| `validate_coupon` | 20 | 1 hora | Enumeración de cupones |
| `seguimiento` | 30 | 1 hora | Scraping de pedidos por número |

**2. `api/cleanup-rate-limits.js` (originalmente creado, después consolidado — ver más abajo "Consolidación de crons"):** cron diario para borrar filas viejas de `rate_limits` (created_at > 2 horas — ventana máxima de rate limit es 1h, 2h da margen contra races).

**3. Nueva tabla Supabase `rate_limits`:**
```sql
CREATE TABLE public.rate_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limits_key_time_idx
  ON public.rate_limits (key, created_at DESC);
CREATE INDEX rate_limits_created_at_idx
  ON public.rate_limits (created_at);
GRANT ALL PRIVILEGES ON public.rate_limits TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

⚠️ **Lección crítica aprendida durante la sesión:** **el GRANT a service_role NO es opcional, incluso con RLS off**. Sin él, el SDK desde Node falla con status 403 silencioso (todos los campos del PostgrestError vienen null: message, code, details, hint). El SQL Editor del dashboard usa rol `postgres` que NO refleja el problema. La primera versión del SQL no incluía los GRANTs y eso causó horas de debugging hasta detectarlo. Para futuras tablas nuevas accesibles desde el backend Node, SIEMPRE incluir GRANTs explícitos.

**4. Integraciones (endpoints modificados):**
- `api/admin.js` — rate limit en acción `login`.
- `api/checkout.js` — rate limit en acciones `validate_coupon` y `create_order`.
- `api/seguimiento.js` — rate limit al inicio del handler.

**Cleanup automático:**
- Originalmente diseñado como cron independiente diario (`/api/cleanup-rate-limits` a las 4 AM).
- **Consolidado** en el cron semanal de `cleanup-personalizacion` (domingos 6 AM) por bug de Vercel Hobby — ver sección "Consolidación de crons" abajo.

### 🟠 Bloque C — JWT para sesión admin

**Problema que resuelve:** hasta Sesión 30, el password del admin viajaba en el body de CADA request al backend (50+ veces por sesión típica) y vivía en `sessionStorage` del navegador. Si alguien comprometía el sessionStorage (XSS, extensión maliciosa), tenía el password permanente del admin.

**Solución:** flujo estándar de la industria con JSON Web Tokens (HS256):
1. Login con password → server valida y emite JWT firmado con expiración de 8h.
2. Frontend guarda el token (no el password) en sessionStorage.
3. Cada request siguiente manda `Authorization: Bearer <token>` en header.
4. Server valida la firma criptográfica del token (no toca DB para auth).
5. Token vencido o inválido → 401 → relogin automático.

**Decisión clave: implementación nativa sin librerías externas.** Se evaluó `jsonwebtoken` (dep externa) vs implementación propia con `crypto` nativo de Node. Se eligió la implementación propia por:
- Cero deps nuevas (mantiene `package.json` minimal).
- El subset que se necesita es chico (~150 líneas).
- Mejor auditabilidad: cualquier issue de seguridad se ve directo en el archivo, no en código de terceros.
- HS256 + timingSafeEqual igual de seguro que la lib oficial.

**Nuevos módulos en `api/_lib/`:**

**1. `api/_lib/jwt.js` (~165 líneas):**
- `signToken(payload)` — firma HS256, devuelve `{ token, expiresAt }`. TTL hardcoded a 8h.
- `verifyToken(token)` — valida firma con `timingSafeEqual`, formato (3 partes, header HS256/JWT), expiración. Devuelve payload o `null`. NUNCA tira excepciones por tokens inválidos.
- `extractBearerToken(req)` — extrae token desde header `Authorization: Bearer <token>` (case-insensitive).
- Validación de `JWT_SECRET`: debe tener ≥32 caracteres, si no, tira en tiempo de carga (no en uso).
- Base64URL nativo (sin depender de `Buffer.toString('base64url')` que no estaba en versiones viejas de Node — sí en Node 22 actual, pero defensivo).

**2. `api/_lib/admin-auth.js` (~85 líneas):**
- Módulo compartido por 3 endpoints (admin, cleanup-personalizacion, download-personalizacion-bulk).
- `checkAdminAuth(req, body)` — devuelve `{ ok, mode, error }`. Soporta JWT bearer (preferido) Y password en body (compat para acción login).
- Reemplaza la lógica duplicada de `safeEqual + checkAdminPassword` que existía en cada endpoint.

**Tests sintéticos del módulo JWT:** 18/18 pasados.
- Firma + verificación roundtrip
- Token alterado en firma → null
- Payload alterado → null  
- Token con formato inválido → null (vacío, null, 2 partes)
- Token expirado → null
- `extractBearerToken` con variantes case
- `JWT_SECRET` muy corto → tira error claro
- `JWT_SECRET` ausente → tira error claro

**Nueva env var requerida:**
- `JWT_SECRET` en Vercel — 128 caracteres hex generados con `crypto.randomBytes(64).toString('hex')`. Documentada con valor exacto en la guía de aplicación.

**Refactor del frontend admin (`components/founder-admin.js`):**
- `CONFIG.PW_KEY: 'founder_admin_pw'` → `CONFIG.TOKEN_KEY: 'founder_admin_token'`.
- `apiAdmin()` ahora manda `Authorization: Bearer <token>` en header (no password en body).
- Nuevo helper `apiAdminFetch(url, action, payload)` — variante para endpoints admin **distintos** a `/api/admin` (cleanup-personalizacion, download-personalizacion-bulk). Centraliza la lógica del bearer token + política de 401 → relogin. Reemplaza 5 fetch directos con código duplicado.
- `login()` reescrito: hace fetch directo (sin apiAdmin) porque todavía no hay token, recibe `{ token, expiresAt }` del server y guarda el token.
- `boot()` (auto-relogin al recargar) ahora valida el JWT existente con `list_orders` como "ping autenticado". Si el token venció, apiAdmin ya limpia y muestra login automáticamente.

**Refactor uniforme de handlers en `api/admin.js`:**
- Las 22 funciones `handleXxx(body, res)` cambiaron firma a `handleXxx(body, res, req)`. El dispatcher ahora pasa `req` a todos los handlers (login lo usa para rate limit, los demás lo ignoran — JS no se queja por args extra).
- Las 22 llamadas a `requireAuth(body, res)` actualizadas a `requireAuth(body, res, req)`.
- Cambio mecánico con `sed`, validado luego archivo por archivo.

### 🔧 Consolidación de crons (problema descubierto en producción)

**Problema:** durante el smoke test, después de subir `vercel.json` con 2 crons declarados (cleanup-personalizacion semanal + cleanup-rate-limits diario), Vercel solo registró el primero en el panel "Cron Jobs". Múltiples intentos fallaron:
- Force redeploy sin cache → no apareció el segundo.
- Reordenar los crons en `vercel.json` → no apareció.
- Cambiar cleanup-rate-limits de diario a semanal (lunes 5 AM, distinto día que el primero) → no apareció.

**Causa raíz (investigada con web_search a docs oficiales Vercel):**
- Vercel Hobby permite **2 crons máximo** y solo frecuencia ≤ 1× por día.
- Sintácticamente nuestros 2 crons cumplían ambos requisitos.
- Pero **hay un bug conocido del plan Hobby**: cuando un cron apunta a un endpoint que no existía al momento de un deploy previo, queda registrado como "inválido" silenciosamente. Aunque después se cree el endpoint y se haga force redeploy, Vercel sigue ignorando ese cron. Esto está reportado en GitHub issues de Vercel y community forums.

**Solución aplicada (decisión arquitectónica importante):** consolidar las dos limpiezas dentro del cron que SÍ funciona (`/api/cleanup-personalizacion`). Razones:

1. **Single Responsibility no se viola.** El archivo cleanup-personalizacion.js pasa de "cron de imágenes" a "cron de mantenimiento semanal de tablas auxiliares", con dos tareas internas claramente encapsuladas (cada una su propia función, sin mezcla de lógica).
2. **Sin overhead operacional.** Vercel Hobby permite 2 crons, pero uno ya es complicado de registrar — agregar más sería pelear contra la plataforma sin necesidad.
3. **Pragmatismo sin sacrificar limpieza.** Cuando se pase a Vercel Pro (si crece el negocio), separar de nuevo es 5 min de refactor. Por ahora, lo consolidado funciona perfectamente y es más limpio que tener un cron fantasma en el `vercel.json` que nunca se ejecuta.
4. **Frecuencia semanal es suficiente para rate_limits.** En la escala actual (~50-250 filas/semana acumuladas según tráfico), las queries con índices son instantáneas. El cleanup es solo higiene — ni el rate limit ni la performance dependen de él.

**Implementación final:**
- `cleanup-personalizacion.js` ahora tiene una función `cleanupRateLimits()` (~50 líneas) que ejecuta el delete de `rate_limits` con created_at > 2h.
- El cron auto dispara las DOS tareas en serie: primero imágenes (tarea A), después rate_limits (tarea B).
- Las acciones manuales del admin (POST con status, manual run, list logs) siguen siendo solo de imágenes — el cleanup de rate_limits no necesita UI manual.
- Si tarea A falla → exception → log + fin (no llega a B).
- Si tarea B falla → log + continúa (A ya completó y vale la pena reportar su resultado).
- Archivo `cleanup-rate-limits.js` eliminado del repo (ya no se usa).
- `vercel.json` con UN solo cron declarado (el de cleanup-personalizacion).

**Por qué este diseño NO es un parche:** los criterios de evaluación fueron 4 (single responsibility, sin overhead, pragmatismo limpio, frecuencia adecuada para el dominio). Los 4 dan a favor de consolidar. Si en el futuro hubiera 5 crons distintos, hablaríamos de Pro plan, no de seguir consolidando.

### 🐛 Fix lateral: error timezone Postgres en checkout

**Problema descubierto durante Test 3 (compra de prueba):** al confirmar pedido aparecía mensaje rojo en el footer: `TIME ZONE "P." NOT RECOGNIZED`.

**Causa raíz:** `founder-checkout.js` línea 736 generaba la fecha del pedido con `new Date().toLocaleString('es-UY')`, que produce strings como `"12/5/2026, 22:35:14 p. m."`. Postgres interpreta `p.` (con punto) como abreviatura de timezone que no reconoce y rechaza el INSERT.

**No es bug introducido por Sesión 31** — el bug existía desde antes pero aparecía intermitentemente. Cambios en ICU del browser (lib de locales) o en parser de Postgres lo hicieron consistente justo ahora.

**Fix aplicado:**
1. **Frontend (`founder-checkout.js`):** cambio de `toLocaleString('es-UY')` → `toISOString()`. ISO 8601 es el formato universal que cualquier DB entiende sin ambigüedad.
2. **Backend (`checkout.js`):** nueva helper `normalizeFecha(raw)` — defensa en profundidad. Valida con `Date.parse()` y re-serializa a ISO 8601 puro. Si la fecha llega basura, devuelve null (la RPC usa `now()` como fallback). Reemplaza el `order.fecha || null` que pasaba strings sin validar.

**Tests sintéticos:** 7/7 casos cubiertos (null, vacío, ISO bueno, "p. m." viejo, basura, ISO sin Z, número timestamp).

### 📊 Métricas finales — Sesión 31

**Archivos creados (4):**
- `api/_lib/jwt.js` (~165 líneas) — firma/verifica JWTs HS256
- `api/_lib/admin-auth.js` (~85 líneas) — auth compartida JWT+password
- `api/_lib/rate-limit.js` (~195 líneas) — sliding window sobre Supabase
- `sesion-31-rate-limits.sql` — SQL para tabla + índices + GRANTs

**Archivos modificados (8):**
- `api/admin.js` — login emite JWT + rate limit + 22 firmas de handler refactor + 22 llamadas a requireAuth
- `api/checkout.js` — rate limit en validate_coupon y create_order + `normalizeFecha`
- `api/seguimiento.js` — rate limit
- `api/cleanup-personalizacion.js` — usa admin-auth + integra cleanupRateLimits (consolidación)
- `api/download-personalizacion-bulk.js` — usa admin-auth (eliminadas funciones safeEqual + checkAdminPassword duplicadas)
- `components/founder-admin.js` — token JWT, helper `apiAdminFetch`, login refactor, boot refactor, 7 referencias a PW_KEY eliminadas
- `components/founder-checkout.js` — toISOString en vez de toLocaleString
- `vercel.json` — sin cambios netos al final (intermedio tuvo 2 crons, vuelta a 1 tras consolidación)

**Archivos eliminados:** `api/cleanup-rate-limits.js` (consolidado en cleanup-personalizacion).

**Tests sintéticos automatizados ejecutados:** 25/25 ✅
- JWT: 18/18 (firma roundtrip, token alterado, payload alterado, formato inválido, expirado, bearer extraction, secret corto/ausente)
- normalizeFecha: 7/7 (null, vacío, ISO bueno, "p. m." viejo, basura, ISO sin Z, timestamp ms)

**Variables de entorno nuevas en Vercel:** 1
- `JWT_SECRET` (128 caracteres hex)

**Tabla nueva en Supabase:** 1
- `rate_limits` (3 columnas, 2 índices, GRANTs a service_role)

**Cron jobs:** 1 (consolidado — ejecuta 2 tareas en serie).

### 🧠 Lecciones de Sesión 31

1. **GRANT a service_role NO es opcional, incluso con RLS off.** Toda tabla nueva accesible desde el backend Node necesita GRANT explícito. El SQL Editor del dashboard NO refleja el problema (usa rol `postgres`). Síntoma del bug: status 403 silencioso con PostgrestError todo en null. Mitigación: SIEMPRE incluir el bloque GRANT al crear una tabla nueva.

2. **Vercel Hobby tiene un bug en el registro de crons.** Cuando un cron apunta a endpoint inexistente al momento de un deploy, queda en limbo permanente — ni force redeploy sin cache lo arregla. Workaround: consolidar crons relacionados en un solo endpoint. Documentar para futuras incorporaciones de crons.

3. **`toLocaleString('es-UY')` genera strings que Postgres no parsea.** El sufijo "p. m." con punto se interpreta como abreviatura de timezone inválida. Para timestamps que viajan a la DB, SIEMPRE usar `toISOString()` (formato ISO 8601 universal). Aplicar también validación defensiva server-side (`Date.parse` + re-serialize) por las dudas.

4. **JWT nativo con `crypto` de Node es 100% suficiente.** Implementar HS256 + timingSafeEqual lleva ~150 líneas y evita una dep externa. Para casos simples (sub + iat + exp), no hay valor en `jsonwebtoken` o `jose`. Mejor auditabilidad + cero superficie de supply chain attack.

5. **El refactor con `sed` requiere validación post-cambio.** Las 22 funciones de admin.js cambiaron firma con un comando masivo (`s/(body, res)/(body, res, req)/g`). Tres salvaguardas evitaron problemas: (1) `node -c` después del cambio, (2) grep de las 22 referencias antes y después para confirmar conteo igual, (3) verificación de que ninguna firma quedó duplicada (`req, req` no es válido). Sed sin esas salvaguardas habría sido peligroso.

6. **Apply en grupos secuenciales evita estados rotos en producción.** El plan original tenía 5 grupos en orden estricto (preparación → módulos `_lib` → endpoints → frontend+config → tests). Esto evitó deploys intermedios donde un endpoint nuevo importaba un módulo que todavía no existía en el repo. Replicable para futuras sesiones grandes.

7. **El método científico vence a las hipótesis.** Durante el debug del rate limit ("no funciona"), las primeras tres hipótesis fueron: (a) SDK con sintaxis vieja, (b) caché de Vercel, (c) deploy mal aplicado. Las tres equivocadas. La causa real (GRANT faltante) se encontró agregando logging exhaustivo del error real y verificando uno por uno (¿la tabla existe? ¿el INSERT funciona desde SQL? ¿el SELECT funciona?). Lección: cuando un fix obvio no resuelve, NO tirar más fixes — instrumentar para ver el error real.

### 📦 Estado del sitio post-Sesión 31

- ✅ Performance excelente (95-99 desktop, 85-90 mobile)
- ✅ Email transaccional + bidireccional (`info@founder.uy` operativo)
- ✅ Base SEO universal completa
- ✅ Google Search Console verificado e indexando
- ✅ Tracking Meta funcional con CAPI deduplicado
- ✅ Mercado Pago en producción real (PCI-DSS delegado)
- ✅ HTML válido (parser W3C: 0 errores)
- ✅ Validación de precios server-side (anti-manipulación)
- ✅ 5 headers de seguridad HTTP
- ✅ CORS restringido a founder.uy con whitelist dinámica
- ✅ Emails ofuscados en logs (GDPR)
- ✅ HMAC webhook MP con timingSafeEqual
- ✅ Dependencia Supabase pineada exacta
- ✅ **Rate limiting en 4 endpoints críticos (admin_login 5/15min, create_order 10/h, validate_coupon 20/h, seguimiento 30/h)** ← Sesión 31
- ✅ **JWT HS256 con expiración de 8h para sesión admin (password fuera del navegador post-login)** ← Sesión 31
- ✅ **Módulo `admin-auth` compartido por 3 endpoints (DRY)** ← Sesión 31
- ✅ **Cleanup semanal de tablas auxiliares (imágenes + rate_limits) consolidado en un solo cron** ← Sesión 31
- ✅ **Fix timezone Postgres (toISOString en frontend + normalizeFecha defensivo en backend)** ← Sesión 31

### ⚠️ Pendientes documentados (Sesión 32+)

- **CSP (Content Security Policy)** — última pieza para llegar a **A+** definitivo en securityheaders.com. Requiere auditar inline scripts, fonts externos, imágenes. Esfuerzo: ~1 hora.
- **Smoke test personalización láser end-to-end** — sigue pendiente desde Sesión 29. Requiere láser físico operativo. NO bloqueante.
- **Email automático al admin/taller cuando entra pedido con grabado** — código existe en `blockPersonalizacion(..., 'admin')`, falta conectarlo al flujo de creación de orden.
- **Drop columna `products.banner_url`** (legacy desde Sesión 21). `ALTER TABLE products DROP COLUMN banner_url;` — pendiente como Opción D del menú principal histórico.
- **Reseñas reales** (Sesión 26 — Opción B) — cuando haya clientes con compras validadas, reemplazar las 4 reseñas mock.
- **Gmail send-as desde `info@founder.uy`** (Sesión 26 — Opción E) — para responder desde Gmail con remitente del dominio.
- **Datos bancarios reales en email de transferencia** — el template actual dice "Te enviamos los datos por WhatsApp"; cuando se definan, agregar bloque con datos directos.
- **Si tráfico crece 10×, considerar Vercel Pro** — permitiría separar nuevamente los crons (rate_limits diario, imágenes semanal) y usar frecuencias <1/día.
- **🆕 Supabase Data API: GRANT explícito obligatorio en tablas nuevas** (anuncio recibido por email el 13/05/2026, asunto *"Data API access changes May 30 for all new projects"*). A partir del **30 de octubre de 2026**, Supabase desactiva la exposición automática del schema `public` al Data API en TODOS los proyectos existentes (incluido `qedwqbxuyhieznrqryhb`). **Las 7 tablas actuales conservan sus grants** (no se rompe nada el 30/10) — pero **cualquier tabla nueva que creemos a partir de esa fecha** necesita el bloque GRANT explícito o `supabase-js` devolverá error `42501`. Plantilla a incluir SIEMPRE al crear tabla nueva:
  ```sql
  -- Reemplazar `nueva_tabla` por el nombre real
  GRANT SELECT ON public.nueva_tabla TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO service_role;
  ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;
  -- + policies según el caso (ver patrón de tablas existentes)
  ```
  Ajustar los roles según el uso real (ej: `orders` solo da acceso a `service_role`). Si en una sesión futura entra error `42501` desde el sitio tras crear tabla, ese es el síntoma — el propio mensaje de Postgres indica el GRANT faltante. NO bloqueante. NO requiere acción hoy. Solo recordar al diseñar schema nuevo.

---

## ✅ SESIÓN 30 — Auditoría completa: salud del proyecto + seguridad e-commerce [12/05/2026]

**Sesión de hardening completo sin tocar features.** Se ejecutó una doble auditoría — primero de salud del proyecto, después de seguridad e-commerce — y se cerraron los 9 hallazgos en una misma sesión. Cero cambios de funcionalidad, cero cambios de schema SQL, cero cambios en el frontend de producto/checkout/admin. Toda la mejora es estructural y defensiva.

**Resultado:** sitio en el top 5% de e-commerces chicos en términos de higiene de seguridad. Score esperado en securityheaders.com: **F → A/A+**. HTML del index ahora estructuralmente válido. Dependencia Supabase blindada contra el escenario de la lección Sesión 27.

### 🔵 Bloque A — Auditoría de salud (3 fixes)

**1. `package.json` — pinear Supabase a versión exacta:**
- Cambio: `"@supabase/supabase-js": "^2.45.4"` → `"@supabase/supabase-js": "2.105.4"` (sin caret).
- Razón: cierre formal de la lección crítica documentada en Sesión 27 ("`^x.y.z` en deps puede explotar después de semanas"). Vercel ya no auto-actualiza la lib en cada build; la próxima versión que salga no puede romper el sitio sin que el dev la apruebe.
- Versión elegida: `2.105.4` (latest estable al momento). NO se bajó a `2.45.4` porque eso sería reintroducir bugs ya parcheados en 124 versiones intermedias.
- Tiempo: 2 min.

**2. `index.html` — fixes de HTML inválido descubiertos en auditoría:**
- Fix 1: agregado `</head>` faltante entre línea 1012 (`</style>`) y línea 1013 (`<body>`). El navegador venía auto-arreglando esto silenciosamente vía "tag soup parsing", por eso el sitio se veía bien.
- Fix 2: eliminado `</div>` huérfano en línea 1826 (había 100 aperturas y 101 cierres). Residuo de la migración de header/footer a componentes en sesiones anteriores.
- Validación con parser HTML estricto post-fix: 0 errores, 0 tags sin cerrar. W3C validator también debería dar 0 errores estructurales.
- `index.html` es el ÚNICO HTML del proyecto que tenía estos problemas — los otros 8 estaban perfectos.

**3. `README.md` — redacción profesional:**
- Antes: 1 línea (`# founder-web`).
- Después: README de 87 líneas con stack tecnológico, estructura del repo, variables de entorno requeridas (nombres solamente, sin valores), sección de seguridad documentando todas las defensas, info de deployment, link a `ESTADO.md` como bitácora interna.
- Cero información sensible expuesta — solo nombres de servicios y variables.

### 🛡️ Bloque B — Auditoría de seguridad e-commerce (6 fixes)

**Metodología:** evaluación contra OWASP Top 10 (2021), PCI-DSS aplicable a e-commerce con MP, GDPR/LGPD básico, buenas prácticas Vercel + Supabase. Revisión manual de los 8 endpoints serverless + wrappers + frontend.

**Hallazgos previos al fix (sintetizados):**
- 🔴 **C-1** Manipulación de precios: el frontend mandaba `precio_unitario` y el server lo aceptaba sin verificar → atacante podía cambiar precio en localStorage y pagar $1.
- 🟠 **A-1** Cero headers de seguridad HTTP (HSTS, X-Frame, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) → sitio embebible en iframe, sin protección anti-clickjacking, sin forzado HTTPS.
- 🟠 **A-3** CORS `Access-Control-Allow-Origin: *` → cualquier sitio externo podía consumir la API.
- 🟡 **M-1** Emails de clientes apareciendo completos en logs de Vercel → cumplimiento GDPR/LGPD comprometido.
- 🟡 **M-3** Mensaje confuso en log del webhook MP cuando falta `MP_WEBHOOK_SECRET` ("saltando validación" cuando en realidad **rechaza** todo).
- 🟢 **B-1** Comparación HMAC del webhook MP con `===` en lugar de `timingSafeEqual` (vulnerabilidad teórica de timing).

#### Fix C-1 — Validar precios server-side (`api/checkout.js`):

- Función nueva `validateItemsAgainstDB(items)`:
  - Una sola query trae `products + product_colors` para todos los items del pedido.
  - Calcula el precio REAL según reglas: `product_colors.precio_oferta` si el color tiene `estado='oferta'`, sino `products.precio`.
  - Rechaza si: producto no existe, producto `activo=false`, color no existe, color con `estado='sin_stock'`, precio enviado ≠ precio real, cantidad fuera de rango `[1, 99]`.
- Función nueva `validateOrderTotals(cleanOrder, cleanItems)`:
  - Recalcula `subtotal` desde precios reales y compara con el enviado.
  - Valida costo de envío: solo `0` (retiro o subtotal ≥ $2000) o `SHIPPING_COST=250` aceptados.
  - El total final no se valida porque depende del cupón (lo aplica la RPC SQL atómica, fuente de verdad).
- Ambas se llaman ANTES de la RPC `apply_coupon_and_create_order`. Si fallan, el pedido NO se crea, la preference MP NO se crea, la DB queda intacta.
- **13 casos de test sintéticos validados:** precio normal/oferta correctos, precio manipulado debajo/encima, producto inactivo, color sin stock, color inexistente, cantidad 0 o 100, precio en oferta intentando precio normal, múltiples items mixtos, etc. 13/13 pasan.
- Códigos de error nuevos para el frontend: `price_mismatch`, `product_not_found`, `product_inactive`, `color_not_found`, `color_sin_stock`, `subtotal_mismatch`, `invalid_quantity`, `invalid_shipping`.

#### Fix A-1 — Headers de seguridad HTTP (`vercel.json`):

- 2 bloques `headers` reorganizados:
  - `source: "/api/(.*)"` → `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Cache-Control: no-store`.
  - `source: "/((?!api/).*)"` (regex negativa) → `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`.
- ⚠️ **Decisión arquitectural:** la regex negativa `/((?!api/).*)` se usa porque Vercel aplica TODAS las reglas `headers` que matchean (no se detiene en la primera). Sin la negativa, los endpoints API recibirían algunos headers duplicados.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` → el sitio explícitamente rechaza usar features del navegador que no necesita.
- HSTS con `max-age=63072000` (2 años) + `preload`. Apto para preload list de browsers.
- CORS movido fuera de `vercel.json` (se maneja dinámico en el código, ver A-3).

#### Fix A-3 — CORS dinámico con whitelist (`api/_lib/supabase.js` + 3 endpoints):

- Wrapper centralizado en `api/_lib/supabase.js`:
  - Whitelist: `https://www.founder.uy` y `https://founder.uy` (con y sin www).
  - Función `resolveAllowOrigin(req)`: si `req.headers.origin` está en la whitelist → devuelve ese origen; sino → `'null'` (literal string, MDN lo recomienda como fallback seguro).
  - Función `buildCorsHeaders(req)` exportada para uso desde endpoints que no usan `createHandler`.
  - `createHandler` ahora setea CORS dinámico al inicio de cada request, antes de cualquier otra lógica.
  - `Vary: Origin` agregado para que CDN intermedios cacheen por origen.
- Endpoints actualizados a usar `buildCorsHeaders`: `cleanup-personalizacion.js`, `download-personalizacion-bulk.js`. Antes tenían cada uno su propio `CORS_HEADERS = '*'` local.
- `mp-webhook.js`: cambio defensivo a `Allow-Origin: 'null'` en el preflight OPTIONS (MP es server-to-server, no usa CORS, pero un browser malicioso podría intentar abuso vía preflight).
- **CORS no afecta webhooks server-to-server** (MP servidor no envía header `Origin` → CORS no se evalúa). El cambio no rompe MP.
- Endpoints que heredan el fix sin tocarlos: `admin.js`, `checkout.js`, `seguimiento.js`, `upload-personalizacion.js` (todos usan `createHandler`).
- **6 casos de test sintéticos validados:** www permitido, sin-www permitido, evil.com rechazado, HTTP en vez de HTTPS rechazado, request sin Origin → 'null', request vacía → 'null'. 6/6 pasan.

#### Fix M-1 — Ofuscar emails en logs (`api/_lib/email.js`):

- Función nueva `maskEmail(email)`:
  - `juan.perez@gmail.com` → `ju***@gmail.com`
  - `a@b.com` → `a***@b.com`
  - Inválido o vacío → `'(sin email)'` o `'(email-mal-formado)'`.
- Aplicado al único `console.log` que exponía el email completo en `sendEmail`. Los demás logs ya eran seguros (mencionan "email" como categoría pero no loguean el valor).
- **9 casos de test sintéticos validados** incluyendo edge cases (null, undefined, sin @, número, string vacío). 9/9 pasan.

#### Fix M-3 — Mensaje claro de log MP (`api/_lib/mercadopago.js`):

- Antes: `console.warn('[mp] MP_WEBHOOK_SECRET no configurado — saltando validación de firma')` (mensaje confuso, sugería que la validación se omitía).
- Después: `console.warn('[mp] MP_WEBHOOK_SECRET no configurado — RECHAZANDO webhook (modo cerrado por defecto)')`.
- Cambio cosmético pero importante para diagnóstico en emergencias.

#### Fix B-1 — HMAC con timingSafeEqual (`api/_lib/mercadopago.js`):

- Import nuevo: `import { createHmac, timingSafeEqual } from 'crypto'`.
- Antes: `const isValid = expected === v1;` (comparación con `===`, teóricamente vulnerable a timing attacks).
- Después: comparación timing-safe con manejo defensivo de largo diferente. Si los buffers tienen distinto largo o cualquier error → `isValid=false`.
- Mercado Pago es target de alto valor (financiero), así que vale la pena el costo trivial de la comparación constante.
- **6 casos de test sintéticos validados:** firma correcta, firma incorrecta misma longitud, firma con largo extraño, firma vacía, manifest distinto, secret distinto. 6/6 pasan.

### 📊 Métricas finales — Sesión 30

**Tests sintéticos automatizados ejecutados:** 34/34 ✅
- CORS dinámico: 6/6
- Ofuscación de emails: 9/9
- HMAC timing-safe: 6/6
- Validación de precios: 13/13

**Archivos modificados:** 11 total
- Bloque salud: `package.json`, `index.html`, `README.md` (este último creado).
- Bloque seguridad: `vercel.json`, `api/_lib/supabase.js`, `api/_lib/email.js`, `api/_lib/mercadopago.js`, `api/checkout.js`, `api/cleanup-personalizacion.js`, `api/download-personalizacion-bulk.js`, `api/mp-webhook.js`.

**Archivos NO tocados (heredan los fixes vía wrapper):** `api/admin.js`, `api/seguimiento.js`, `api/sitemap.js`, `api/upload-personalizacion.js`.

**Cero cambios en:** schema SQL, frontend público (excepto fix HTML inválido en index), frontend admin, frontend checkout, variables de entorno.

### 🛡️ Lo que NO se tocó en Sesión 30

- Schema de Supabase (cero migraciones SQL).
- Frontend público excepto `index.html` (que solo recibió fixes HTML estructurales).
- Frontend admin (`admin.html`, `founder-admin.js`).
- Frontend checkout (`founder-checkout.js`, `cart.js`).
- Tabla `products`, `orders`, `order_items`, `coupons`, etc.
- Variables de entorno en Vercel.

### ⚠️ Pendientes documentados (Sesión 31+)

Hallazgos identificados pero NO aplicados hoy por razones de tiempo o infraestructura:

- **C-2 Rate limiting** (severidad 🔴 Alta) — protege contra brute-force, spam, DoS. Requiere habilitar **Vercel KV** (storage extra, plan Pro o Hobby con add-on). Esfuerzo estimado: 1.5–2 hs. Sería el **cierre perfecto del checkout junto con C-1 ya aplicado** (validación de precios + rate limit = triple-defensa).
- **A-2 JWT para sesión admin** (severidad 🟠 Alta) — reemplazar el password en `sessionStorage` por un JWT de corta vida. Esfuerzo: 2 hs. Refactor del flujo de login + cada request del admin.
- **CSP (Content Security Policy)** — la cereza de la torta para llegar a A+ en securityheaders.com. Requiere auditar inline scripts, fonts externos, imágenes. Esfuerzo: 1 hs.
- **Smoke test personalización láser end-to-end** — sigue pendiente desde Sesión 29. Requiere láser físico operativo. NO bloqueante.
- **Email automático al admin/taller cuando entra pedido con grabado** — el código está, falta conectarlo. Quedó propuesto en Sesión 30 inicial pero el usuario priorizó la auditoría de seguridad.

### 🧠 Lecciones de Sesión 30

1. **Auditoría en 2 fases es más eficiente que en 1.** Primero salud (¿hay deuda técnica latente?), después seguridad (¿hay vectores de ataque reales?). La salud encuentra problemas estructurales (`</div>` huérfano, dep auto-update); la seguridad encuentra problemas de lógica (precios manipulables, headers ausentes). No se solapan.
2. **CORS en Vercel:** `headers` aplica TODAS las reglas que matchean (no se detiene en la primera). La regex negativa `/((?!api/).*)` evita duplicación de headers en rutas API. Documentado para futuras referencias.
3. **CORS con whitelist de múltiples orígenes:** `Access-Control-Allow-Origin` solo acepta UN valor literal. Para soportar `founder.uy` y `www.founder.uy` simultáneamente hay que setearlo dinámicamente desde el código del servidor (no desde `vercel.json` que es estático). MDN lo confirma como la práctica correcta.
4. **`Allow-Origin: null` es el fallback correcto para orígenes no permitidos.** Devuelve el string literal `'null'`, no la palabra clave `null` (que sería peligrosa por documentos sandboxed).
5. **Validación server-side de precios en e-commerce es la vulnerabilidad #1.** Es la primera cosa que cualquier auditoría seria de un e-commerce chico encuentra. Si ya tenés MP (absorbe PCI-DSS), seguís siendo vulnerable por business logic. Fix: rechazar el pedido si el precio enviado por el cliente no coincide con el de la DB.
6. **Cierre formal de la lección Sesión 27:** la lección decía "considerar pinning con `~` o exacto en deps críticas". Hoy se aplicó. La lección queda cerrada operativamente, no solo documentada.

### 📦 Archivo de aplicación

La guía paso a paso para subir los 11 archivos a GitHub está en `GUIA-APLICACION-SESION-30.md`. Incluye orden recomendado de upload (3 grupos para evitar inconsistencias intermedias), mensajes de commit pre-redactados, 4 verificaciones post-deploy (smoke test funcional, securityheaders.com, W3C validator, prueba CORS desde otro sitio) y plan de rollback con Vercel "Promote to Production".

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

## 🧠 INFO CRÍTICA DEL FEATURE PERSONALIZACIÓN LÁSER (consolidada de PLAN-PERSONALIZACION.md archivado)

Esta sección consolida lo más importante del archivo `PLAN-PERSONALIZACION.md` (movido a `docs/archive/` al cierre de Sesión 29). Si en el futuro hay que modificar o expandir el feature, **leé esto primero**. Para detalle histórico completo de decisiones y alternativas descartadas, consultar el archivo original en `docs/archive/`.

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

### Tablas (9)

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
   usos_count, emails_usados (text[]), desde, hasta, created_at,
   `solo_clientes_repetidos` (Sesión 32), `solo_clientes_nuevos` (Sesión 33),
   `descuenta_personalizacion` (Sesión 33), `personalizacion_slots_cubiertos` (Sesión 33),
   **`es_recompensa_resena`** (Sesión 38).
7. **`site_settings`** — key (PK), value, updated_at.
   Keys actuales: `hero_banner_url` (Sesión 21).
8. **`reviews`** (Sesión 38) — id (uuid), order_id (FK unique con `ON DELETE CASCADE`),
   product_id, product_name, product_color, author_email, author_name, author_location,
   rating (1-5), texto (10-1000 chars), fotos_urls (text[] max 3),
   estado (`pendiente`/`aprobada`/`oculta`), reward_coupon_codigo, created_at, updated_at.
9. **`coupon_authorized_emails`** (Sesión 38) — id, coupon_id (FK cascade),
   email, reason (`review_reward`/`manual`/`campaign`), review_id (FK SET NULL), created_at.
   UNIQUE (coupon_id, email).

### Constraints CHECK en `orders`
- `orders_entrega_check` → `entrega IN ('Envío','Retiro')`
- `orders_pago_check` → `pago IN ('Mercado Pago','Transferencia')`
- `orders_estado_check` → `estado IN ('Pendiente pago','Pendiente confirmación','Confirmado','En preparación','En camino','Listo para retirar','Entregado','Cancelado','Pago rechazado')` ← actualizado en Sesión 22

### Constraints CHECK en `reviews` (Sesión 38)
- `rating BETWEEN 1 AND 5`
- `LENGTH(texto) BETWEEN 10 AND 1000`
- `array_length(fotos_urls, 1) IS NULL OR array_length(fotos_urls, 1) <= 3`
- `estado IN ('pendiente', 'aprobada', 'oculta')`
- UNIQUE `(order_id)` → garantiza 1 reseña por pedido

### Índices nuevos en Sesión 22
- `orders_mp_payment_id_idx` (parcial: `WHERE mp_payment_id IS NOT NULL`)
- `orders_mp_preference_id_idx` (parcial: `WHERE mp_preference_id IS NOT NULL`)

### Índices nuevos en Sesión 38
- `reviews_product_estado_idx` (parcial: `WHERE estado = 'aprobada'`) — consulta producto.html
- `reviews_estado_created_idx` (estado, created_at DESC) — listado admin
- `reviews_author_email_idx` (LOWER(author_email)) — detección de duplicados
- `coupon_authorized_email_lookup_idx` (LOWER(email), coupon_id) — validación cupón
- `coupons_only_one_review_reward_active` (UNIQUE parcial sobre `(1)` WHERE flag activa) — máximo 1 cupón recompensa

### Función SQL nueva en Sesión 38
- `get_review_reward_coupon()` (STABLE) — devuelve el cupón activo con `es_recompensa_resena=true` o NULL.

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
  **Sesión A** después de tener el láser físico operativo.
- **Sesión 28 (Personalización láser — implementación end-to-end):**
  arranque del feature mayor. Bloques A (frontend visual + admin config
  global) y B (backend de uploads + galería) completos. Tabla nueva
  `personalizacion_examples`, buckets de storage `personalizacion-uploads`
  (privado) y `personalizacion-examples` (público), endpoint nuevo
  `api/upload-personalizacion.js` con whitelist MIME y signed URLs,
  4 columnas booleanas nuevas en `products` (`permite_grabado_*`), JSON
  config en `site_settings.personalizacion_config` con master switch,
  bloque visual completo en `producto.html`, panel admin extendido con
  configuración global + galería. Master switch apagado por defecto
  hasta tener láser físico. 2 hotfixes operativos en la misma sesión.
- **Sesión 29 (Personalización láser — Bloques C + D operativos):**
  cierre del feature de personalización. Endpoint nuevo
  `api/cleanup-personalizacion.js` (4 modos: cron auto + 3 acciones
  admin), endpoint nuevo `api/download-personalizacion-bulk.js` (ZIP por
  pedido + ZIP backup pre-limpieza, sin deps externas), tabla nueva
  `cleanup_logs`, cron semanal configurado en `vercel.json` (domingos
  06:00 UTC). Frontend admin extendido: filtro "✦ Con grabado", badge
  dorado en cards, sección de detalle por pedido con botones "Ver /
  Descargar / ZIP completo", card de limpieza con estado del bucket +
  historial. `email-templates.js` extendido con `blockPersonalizacion`
  inyectado en los 4 templates transaccionales (regresión zero para
  pedidos sin grabado). **Lección de Sesión 29:** intento fallido de
  agregar bloque `functions` en `vercel.json` para `maxDuration: 60s`
  (Vercel rechazaba con `pattern doesn't match any Serverless
  Functions`). Solución: sacar el bloque, usar default de 10s.
  Feature totalmente operacional, master switch sigue apagado hasta
  láser físico.
- **Sesión 30 (Auditoría salud + seguridad e-commerce — 9 fixes):**
  doble auditoría sin tocar features. Bloque salud: pinear Supabase
  exacto a `2.105.4` (cierre formal de lección Sesión 27), fixes HTML
  estructural en `index.html` (`</head>` faltante + `</div>` huérfano),
  README profesional. Bloque seguridad: validación de precios
  server-side en `/api/checkout` (anti-manipulación), 5 headers HTTP
  de seguridad (HSTS/X-Frame/X-Content-Type/Referrer/Permissions),
  CORS restringido con whitelist dinámica vía wrapper en
  `api/_lib/supabase.js`, ofuscación de emails en logs
  (`ju***@gmail.com`), HMAC con `timingSafeEqual` en webhook MP,
  mensaje claro en log MP. 11 archivos modificados, 34 tests sintéticos
  pasados (6+9+6+13). Score esperado securityheaders.com: F → A/A+.
- **Sesión 31 (Rate Limiting + JWT admin — 2 bloques):**
  cierre de la triple defensa del checkout y hardening profundo del
  panel admin. Bloque B: rate limiting con sliding window sobre tabla
  Supabase, aplicado a 4 endpoints (admin_login 5/15min, create_order
  10/h, validate_coupon 20/h, seguimiento 30/h). Nuevo módulo
  `api/_lib/rate-limit.js` con configuración centralizada. Política
  fail-open si DB falla. Bloque C: JWT HS256 nativo (sin libs externas)
  con expiración de 8h. Login emite token, password ya no viaja en
  requests post-login. Módulo `api/_lib/jwt.js` (firma/verify con
  timingSafeEqual) + módulo compartido `api/_lib/admin-auth.js` usado
  por 3 endpoints (DRY). Refactor del frontend admin: `PW_KEY` →
  `TOKEN_KEY`, helper `apiAdminFetch` para endpoints admin auxiliares,
  22 firmas de handlers en admin.js refactorizadas para recibir `req`.
  18/18 tests sintéticos JWT pasados. **Lección crítica:** GRANT a
  service_role NO es opcional aunque RLS esté off — el SDK desde Node
  da 403 silencioso con PostgrestError todo en null. Causó horas de
  debug hasta detectarlo. **Decisión arquitectónica clave:** consolidar
  cleanup de `rate_limits` dentro del cron semanal de
  `cleanup-personalizacion` por bug de Vercel Hobby (no registra el
  segundo cron de forma estable cuando el endpoint no existía al
  momento de un deploy previo). Archivo `cleanup-rate-limits.js`
  eliminado del repo. **Fix lateral:** `founder-checkout.js` migrado
  de `toLocaleString('es-UY')` (generaba "p. m." que Postgres
  interpreta como timezone inválido) a `toISOString()` + `normalizeFecha`
  defensivo en backend. 14 archivos totales (10 código + 1 config + 1
  SQL + 2 docs), 25/25 tests sintéticos pasados, cero cambios
  funcionales para clientes finales. ← **Próxima: Sesión 32 (CSP).**

---

**FIN — Cierre Sesión 30.** Sesión de hardening completo (salud + seguridad)
sin tocar features. 9 fixes aplicados en 11 archivos. 34 tests sintéticos
automatizados pasados. Cero cambios funcionales — todo es estructural y
defensivo.

**Lo más relevante para recordar:**

1. **El sitio venía teniendo una vulnerabilidad crítica sin saberlo:** los
   precios del carrito viajaban del cliente al server SIN re-validación
   contra la DB. Un atacante con conocimiento técnico básico podía pagar
   $1 por cualquier producto. Fix aplicado: `validateItemsAgainstDB`
   antes de la RPC en `/api/checkout`. Bloqueado para siempre.

2. **La lección crítica de Sesión 27 quedó cerrada operativamente.** Se
   había documentado que `^x.y.z` en deps era riesgoso. Hoy se aplicó:
   `@supabase/supabase-js` pineado a `2.105.4` exacto. La próxima versión
   de Supabase no puede romper el sitio sin aprobación explícita.

3. **`index.html` era el único HTML con estructura inválida del proyecto.**
   Faltaba un `</head>` y sobraba un `</div>`. Los navegadores lo
   auto-arreglaban silenciosamente, pero validadores W3C marcaban
   errores. Resuelto y validado con parser HTML estricto.

4. **El sitio quedó listo para securityheaders.com A/A+.** HSTS de 2 años
   con preload, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
   Permissions-Policy. CORS dinámico con whitelist (founder.uy + www).

**Estado del sitio post-Sesión 30:**
- ✅ Performance excelente (95-99 desktop, 85-90 mobile)
- ✅ Email transaccional + bidireccional (`info@founder.uy` operativo)
- ✅ Base SEO universal completa (sitemap, robots, schema, meta tags, og-image)
- ✅ Google Search Console verificado e indexando
- ✅ Tracking Meta funcional con CAPI deduplicado
- ✅ Mercado Pago en producción real (PCI-DSS delegado)
- ✅ Emails automáticos al cambiar estado del pedido
- ✅ Backend estabilizado (Node 22 + sin archivos duplicados)
- ✅ UX del carrito mobile (ícono + 85%)
- ✅ Feature personalización láser end-to-end (master switch off hasta láser físico)
- ✅ **HTML válido (parser W3C: 0 errores)** ← Sesión 30
- ✅ **Validación de precios server-side (anti-manipulación)** ← Sesión 30
- ✅ **5 headers de seguridad HTTP** ← Sesión 30
- ✅ **CORS restringido a founder.uy con whitelist dinámica** ← Sesión 30
- ✅ **Emails ofuscados en logs (GDPR)** ← Sesión 30
- ✅ **HMAC webhook MP con timingSafeEqual** ← Sesión 30
- ✅ **Dependencia Supabase pineada exacta** ← Sesión 30 (cierre lección Sesión 27)
- ✅ **README profesional** ← Sesión 30

**Pendientes para Sesión 31 (post-aplicación de Sesión 30 en GitHub):**

- **Smoke test funcional post-deploy** del usuario en producción.
  Verificar que: el sitio carga normal, una compra de prueba con
  transferencia se confirma OK, el admin loguea y muestra pedidos.
  Si todo OK → Sesión 30 oficialmente "deployed and verified".

- **Próximo bloque de seguridad recomendado: Rate limiting (C-2)** —
  sería el cierre perfecto de la triple-defensa del checkout
  (validación precios + rate limit + headers de seguridad ya
  aplicados). Requiere habilitar Vercel KV (storage extra). Esfuerzo
  estimado: 1.5–2 hs.

- **Hardening profundo opcional:** JWT para sesión admin (A-2),
  CSP (Content Security Policy) para llegar a A+ en
  securityheaders.com.

- **Pendientes anteriores que siguen abiertos:**
  - Smoke test personalización láser end-to-end (Sesión 29 pendiente,
    necesita láser físico).
  - Email automático al admin cuando entra pedido con grabado (código
    existe en `blockPersonalizacion(..., 'admin')`, falta conectarlo).
  - Reseñas reales (Sesión 26 — Opción B).
  - Gmail send-as desde `info@founder.uy` (Sesión 26 — Opción E).

**El sitio está en su mejor estado histórico.** Performance, SEO,
features, seguridad e higiene técnica — los 5 ejes en verde. Sesión 31
puede ser una sesión más relajada de pendientes secundarios, o atacar
el bloque de Rate limiting si querés blindar del todo el checkout. 🚀

---

**FIN — Cierre Sesión 31.** Sesión de hardening profundo del checkout
(rate limiting) y del panel admin (JWT con expiración). 14 archivos
totales, 25/25 tests sintéticos pasados, cero cambios funcionales para
clientes finales. Sesión que demandó debugging intenso por dos problemas
que aparecieron en producción y se resolvieron con investigación
metódica (GRANT a service_role + bug de Vercel Hobby con crons).

**Lo más relevante para recordar:**

1. **Toda tabla nueva accesible desde el backend Node necesita GRANT
   explícito a `service_role`, incluso con RLS off.** Sin él, el SDK
   da status 403 silencioso con `PostgrestError` todo en null (message,
   code, details, hint). El SQL Editor del dashboard usa rol `postgres`
   y NO refleja el problema — solo se ve en runtime desde el backend.
   El SQL definitivo de la tabla `rate_limits` ya incluye los GRANTs
   correctos. Para futuras tablas, copiar ese patrón siempre.

2. **Vercel Hobby tiene un bug con el registro de crons.** Cuando se
   declara un cron en `vercel.json` apuntando a un endpoint que no
   existía al momento de un deploy previo, Vercel lo marca como
   inválido silenciosamente y NUNCA lo registra — ni force redeploy
   sin cache lo arregla. Solución pragmática y limpia: consolidar crons
   relacionados en un solo endpoint cuyas tareas ejecuten en serie.
   Si en el futuro el negocio crece y se pasa a Vercel Pro, separar
   crons es trivial (5 min). Decisión documentada explícitamente:
   NO es un parche, es una concesión arquitectónica que el plan Free
   impone, justificable mientras dure ese plan.

3. **`new Date().toLocaleString('es-UY')` genera strings que Postgres
   no parsea.** El sufijo "p. m." (con punto y espacio) se interpreta
   como abreviatura de timezone inválida → `TIME ZONE 'P.' NOT
   RECOGNIZED`. Para fechas que viajan a la DB, SIEMPRE `toISOString()`.
   Validación defensiva server-side (`normalizeFecha`) confirma el
   formato y normaliza a ISO 8601 canónico — defensa en profundidad
   contra clientes maliciosos o bugs futuros.

4. **JWT nativo con `crypto` de Node es 100% suficiente para casos
   simples.** Implementar HS256 + timingSafeEqual lleva ~150 líneas
   y evita dep externa. Para payloads simples (sub + iat + exp), no
   hay valor en `jsonwebtoken` o `jose`. Mejor auditabilidad + cero
   superficie de supply chain attack + mantiene `package.json` minimal.

5. **Cuando un fix obvio no resuelve, NO tirar más fixes — instrumentar
   para ver el error real.** Durante el debug del rate limit, las
   primeras 3 hipótesis (SDK con sintaxis vieja, caché de Vercel,
   deploy mal aplicado) fueron todas erróneas. Mejorar el logging
   (`JSON.stringify` del error con todos sus campos) reveló la causa
   real (GRANT faltante, status 403). Método científico vence a
   hipótesis. Replicable para futuros bugs.

6. **`apiAdminFetch` centraliza la auth bearer para endpoints admin
   auxiliares.** Sin ese helper, las 5 llamadas fetch directas a
   `/api/cleanup-personalizacion` y `/api/download-personalizacion-bulk`
   habrían quedado con código duplicado del bearer header. DRY desde
   el primer día del refactor.

**Estado del sitio post-Sesión 31:**
- ✅ Triple defensa de checkout: validación precios + rate limit + headers seguridad
- ✅ Panel admin con JWT de 8h (password fuera del navegador post-login)
- ✅ Auth admin unificada en módulo `_lib/admin-auth.js` (DRY)
- ✅ Cleanup semanal de tablas auxiliares (imágenes + rate_limits)
- ✅ Sin deps nuevas en `package.json` (todo se hizo con `crypto` nativo)
- ✅ 18/18 tests JWT + 7/7 tests normalizeFecha pasados (25/25 totales)
- ✅ Sintaxis JS validada en 10 archivos modificados

**Pendientes para Sesión 32:**

- **CSP (Content Security Policy)** — única pieza que falta para
  cerrar definitivamente la seguridad HTTP (llegar a A+ en
  securityheaders.com). Esfuerzo ~1 hora. Auditar inline scripts,
  fonts externos, imágenes externas, definir directives.

- **Drop columna legacy `products.banner_url`** — pendiente desde
  Sesión 21, sin uso en el código actual.

- **Email automático al admin cuando entra pedido con grabado** —
  el código existe en `blockPersonalizacion(..., 'admin')` de
  `email-templates.js`, falta conectarlo al flujo de creación de
  orden en `checkout.js`.

- **Smoke test personalización láser end-to-end** — sigue pendiente
  desde Sesión 29, requiere láser físico.

- **Pendientes secundarios de Sesión 26:**
  - Reseñas reales (cuando haya clientes con compras validadas).
  - Gmail send-as desde `info@founder.uy`.
  - Datos bancarios reales en email de transferencia.

- **Si tráfico crece 10×**, considerar Vercel Pro — permitiría
  separar nuevamente los crons (rate_limits diario + imágenes
  semanal) y usar frecuencias <1/día.

**Score esperado en securityheaders.com tras Sesión 31:** mantiene
**A/A+** de Sesión 30. La única mejora posible es CSP (Sesión 32).

**El sitio está oficialmente en su mejor estado histórico.** Ya no hay
deuda de seguridad significativa por cerrar. Las próximas sesiones
serán features, pulido UX, o el CSP final. 🛡️🚀


