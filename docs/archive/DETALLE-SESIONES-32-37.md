# 📚 DETALLE TÉCNICO — Sesiones 32 a 37

> Este documento es el **anexo extendido** del bloque Sesiones 32-37 de `ESTADO.md`. Cubre el contexto completo del arco de 6 sesiones que refactorizó toda la lógica de cupones y descuentos del e-commerce.
>
> **Cuándo consultar este doc:**
> - Para entender el "por qué" detrás de cada decisión arquitectónica.
> - Para revisar el detalle de los bugs encontrados y sus fixes.
> - Para referencia técnica antes de tocar el sistema de cupones, personalización láser o descuentos.
>
> **Fecha:** 13/05/2026
> **Sesiones cubiertas:** 32, 33, 34, 35, 36, 37
> **Autor:** Claude (Anthropic) trabajando con Evandro Segovia (founder.uy)

---

## 🎯 Contexto histórico — Cómo llegamos al arco 32-37

El chat empezó con un objetivo aparentemente simple: *"Quiero un cupón tipo `FOUNDER20` que solo funcione para clientes con compra previa, para enviarlo en una tarjetita dentro del paquete y fidelizar."*

Lo que terminó siendo: un refactor de **6 sesiones consecutivas** que:
1. Agregó 3 tipos nuevos de cupón con un modelo combinable (sesiones 32-33).
2. Encontró y arregló 5 bugs latentes (3 críticos, 2 cosméticos) algunos heredados desde Sesión 14 (sesiones 32, 34, 36).
3. Cambió la regla de negocio del descuento por transferencia (sesión 36).
4. Rediseñó la UX de descuentos en los 3 momentos del flujo de compra (sesiones 36-37).
5. Adaptó el admin para uso desde celular (sesión 35).

---

## 🏗️ Arquitectura final del sistema de cupones (post-Sesión 37)

### Schema de la tabla `coupons`

```sql
CREATE TABLE coupons (
  id                              UUID PRIMARY KEY,
  codigo                          TEXT UNIQUE NOT NULL,
  tipo                            TEXT CHECK (tipo IN ('porcentaje', 'fijo')),
  valor                           INTEGER,
  uso                             TEXT CHECK (uso IN ('multiuso', 'unico', 'por-email')),
  min_compra                      INTEGER DEFAULT 0,
  activo                          BOOLEAN DEFAULT TRUE,
  usos_count                      INTEGER DEFAULT 0,
  emails_usados                   TEXT[] DEFAULT ARRAY[]::TEXT[],
  desde                           DATE,
  hasta                           DATE,
  solo_clientes_repetidos         BOOLEAN DEFAULT FALSE,  -- Sesión 32
  solo_clientes_nuevos            BOOLEAN DEFAULT FALSE,  -- Sesión 33
  descuenta_personalizacion       BOOLEAN DEFAULT FALSE,  -- Sesión 33
  personalizacion_slots_cubiertos INTEGER DEFAULT 0,      -- Sesión 33
  CONSTRAINT coupons_consistency_check CHECK (
    NOT (solo_clientes_nuevos AND solo_clientes_repetidos)
    AND (
      (descuenta_personalizacion = TRUE AND personalizacion_slots_cubiertos BETWEEN 1 AND 4)
      OR
      (descuenta_personalizacion = FALSE AND personalizacion_slots_cubiertos = 0)
    )
  )
);
```

### Combinaciones válidas (ejemplos)

| Caso de uso | `tipo` | `uso` | `solo_repetidos` | `solo_nuevos` | `descuenta_personalizacion` | `slots_cubiertos` |
|---|---|---|---|---|---|---|
| FOUNDER20 (fidelización) | porcentaje | por-email | TRUE | FALSE | FALSE | 0 |
| BIENVENIDA10 (welcome) | porcentaje | por-email | FALSE | TRUE | FALSE | 0 |
| PERSONAL (grabado free) | porcentaje | multiuso | FALSE | FALSE | TRUE | 3 |
| GRABADOBIENVENIDA (combo) | porcentaje | por-email | FALSE | TRUE | TRUE | 1 |
| GRABADOVIP (combo) | porcentaje | por-email | TRUE | FALSE | TRUE | 4 |
| Cupón fijo $500 | fijo | multiuso | FALSE | FALSE | FALSE | 0 |

### Combinaciones INVÁLIDAS (bloqueadas por el constraint)

- `solo_clientes_nuevos = TRUE` Y `solo_clientes_repetidos = TRUE` → un email no puede ser nuevo Y recurrente.
- `descuenta_personalizacion = TRUE` Y `slots_cubiertos = 0` → si descuenta personalización, debe especificar slots (1-4).
- `descuenta_personalizacion = FALSE` Y `slots_cubiertos > 0` → si no descuenta personalización, slots debe ser 0.

---

## 💰 Fórmula final de descuentos (Sesión 36)

### Regla de negocio confirmada por el dueño

1. **Transferencia 10% siempre se aplica** cuando el cliente elige "Transferencia" como método de pago.
2. **Es acumulable con cualquier cupón** (regla NUEVA — antes era "el mayor entre cupón y transferencia").
3. **Se aplica al final**, sobre el monto después de descontar el cupón.
4. **NO toca el envío.** El envío se calcula sobre el `(subtotal + personalización - cupón)` original. Si supera $2.000 → gratis.
5. **Razón estratégica:** transferencia ahorra ~6% de comisión de Mercado Pago. El dueño prefiere ceder 10% al cliente que pagar comisión a MP.

### Fórmula

```
subtotal              = Σ (precio × cantidad)               // de items
personalización_extra = Σ (item.personalizacion.extra × cantidad)
cupón_subtotal        = (si cupón clásico) cálculo según tipo y valor
cupón_personalización = (si cupón pers) MIN(slots × items_grabados × $290, personalización_extra)
base_descuento_envío  = (subtotal - cupón_subtotal) + (personalización_extra - cupón_personalización)
envío                 = (entrega == 'retiro')        ? 0
                       : (base_descuento_envío >= $2.000) ? 0
                       : $250
transferencia         = (pago == 'transferencia') ? Math.round(base_descuento_envío × 0.10) : 0
TOTAL                 = base_descuento_envío - transferencia + envío
```

### Ejemplos numéricos validados con el dueño

**Caso 1 — Solo transferencia, sin cupón, sin grabado:**
- Subtotal $2.490 + Envío gratis - Transferencia $249 = **$2.241**

**Caso 2 — Cupón FOUNDER20 (20%) + Transferencia + 4 grabados:**
- Subtotal $2.490 + Personalización $1.160 - Cupón $498 - Transferencia $315 + Envío gratis = **$2.837**

**Caso 3 — Cupón PERSONAL (3 slots) + Transferencia + 4 grabados:**
- Subtotal $2.490 + Personalización $1.160 - Cupón $870 - Transferencia $278 + Envío gratis = **$2.502**

**Caso real del dueño (de la captura final):**
- 2 Founders + 4 grabados + 2 grabados + Cupón PERSONAL + Transferencia
- Subtotal $4.980 + Personalización $1.740 - Cupón $1.740 - Transferencia $498 + Envío gratis = **$4.482** ✓

---

## 🔄 Flujo end-to-end del cupón en el sistema

```
1. ADMIN CREA CUPÓN
   admin.html (form) → founder-admin.js (saveCupon) → api/admin.js (handleCreateCoupon)
   → INSERT INTO coupons con CHECK constraint validando combinación

2. CLIENTE APLICA CUPÓN EN CHECKOUT
   founder-checkout.js (applyCoupon) envía:
     - codigo, email, subtotal, hasPersonalizacion (Sesión 34)
   → api/checkout.js (handleValidateCoupon):
     - busca cupón en DB
     - valida fechas, activo, min_compra
     - valida solo_clientes_repetidos (Sesión 32) / solo_clientes_nuevos (Sesión 33)
     - valida descuenta_personalizacion (Sesión 33/34)
     - devuelve metadata al frontend incluyendo flags y slots
   → state.coupon guarda flags + slots para que calculateOrderTotals() sepa cómo calcular

3. CLIENTE CONFIRMA PEDIDO
   founder-checkout.js → api/checkout.js (handleCreateOrder):
     - sanitiza payload, INCLUYE cupon_codigo en cleanOrder (fix Sesión 36)
     - llama RPC apply_coupon_and_create_order(order, items, cupon)
       que es atómico:
         1. Valida cupón nuevamente (verdad SQL inviolable)
         2. Calcula descuento real (modo clásico o personalización)
         3. Inserta orden con cupon_codigo poblado
         4. Inserta items con personalizacion JSONB
         5. Marca cupón usado (incrementa usos_count, agrega email a emails_usados)
   → envía email con sendOrderConfirmationTransfer(cleanOrder, items) o el de MP

4. EMAIL CON ATRIBUCIÓN DEL DESCUENTO
   email-templates.js (Sesión 36/37):
     - blockItems() suma extra de personalización por item
     - renderDiscountLines() detecta atribución (cupón/transferencia/ambos)
     - Si ambos → despeja matemáticamente el split exacto (Sesión 37)
     - Renderiza tarjetas verdes con border-left (compatible con todos los clientes)

5. SEGUIMIENTO DEL PEDIDO
   seguimiento.html / founder-seguimiento.js:
     - api/seguimiento.js trae order completa con cupon_codigo + personalizacion (Sesión 36)
     - Renderiza tarjetas verdes igual que en checkout (atribución)
```

---

## 🐛 Bugs encontrados y arreglados durante el arco

### Bug #1 — Constraints `coupons_uso_check` y `coupons_tipo_check` desincronizados (Sesión 32)

- **Antigüedad:** 18 sesiones (desde Sesión 14).
- **Síntoma:** error 500 al crear el primer cupón con la flag nueva.
- **Causa raíz:** los CHECK constraints tenían valores viejos (`'unico'/'multiple'`, `'porcentaje'/'monto'`) que ya no coincidían con los strings que el código mandaba (`'multiuso'/'unico'/'por-email'`, `'porcentaje'/'fijo'`). Como la tabla estaba VACÍA, nadie intentó crear un cupón desde el admin después del cambio de strings, así que el bug quedó latente.
- **Fix:** DROP + CREATE de ambos constraints con valores actualizados.
- **Lección:** auditoría periódica de constraints CHECK comparando contra strings del código.

### Bug #2 — Cupón `GRABADOFREE` siempre rechazaba (Sesión 34)

- **Antigüedad:** 1 sesión (introducido en Sesión 33).
- **Síntoma:** aplicar cupón de personalización en carrito CON personalización daba *"Este código requiere productos personalizados en el pedido."*
- **Causa raíz:** mismatch entre frontend y backend. Backend chequeaba `body.hasPersonalizacion === true`, frontend nunca enviaba ese campo. `undefined === true` → `false` → entraba al rechazo SIEMPRE.
- **Fix:** frontend ahora envía `hasPersonalizacion: state.cart.some(i => i && i.personalizacion)`. Backend cambió a `if (body.hasPersonalizacion === false)` (solo rechaza explícito).
- **Lección:** testear integración frontend↔backend, no solo lógica aislada.

### Bug #3 — Descuento de personalización aplicado al subtotal del producto (Sesión 34)

- **Antigüedad:** 1 sesión (Sesión 33).
- **Síntoma:** cliente con cupón PERSONAL 3 slots en pedido $2.490 + $1.160 personalización veía descuento -$2.490 (el producto entero gratis) en vez de descontar solo personalización.
- **Causa raíz:** el formulario del admin obligaba a poner "Valor" (ej. 100) aunque marcaras la flag de personalización. El frontend `calculateOrderTotals()` usaba `tipo='porcentaje'` y `valor=100` sin chequear la flag, calculando `subtotal × 100/100 = subtotal entero`.
- **Fix:**
  - `state.coupon` ahora guarda `descuentaPersonalizacion` y `personalizacionSlotsCubiertos`.
  - `calculateOrderTotals()` bifurca por tipo de cupón.
  - Admin fuerza `valor=0`, `tipo='porcentaje'`, `min_compra=0` cuando es cupón de personalización (ignora lo que el usuario haya escrito).
  - Visual: campos clásicos se opacan con mensaje claro cuando se marca la flag 🎨.
- **Lección:** los formularios con campos obligatorios "que se ignoran en ciertos modos" son trampa. Mejor ocultar/deshabilitar visualmente Y validar en el backend.

### Bug #4 — `cupon_codigo` no se leía en 3 endpoints (Sesión 36)

- **Antigüedad:** varias sesiones (el campo existía pero nadie lo usaba).
- **Síntoma:** emails y seguimiento mostraban "Descuento -$X" anónimo sin atribución.
- **Causa raíz:** la RPC SQL poblaba `cupon_codigo` correctamente en `orders`, pero los 3 endpoints que leían el pedido (`api/checkout.js` post-creación, `api/mp-webhook.js`, `api/seguimiento.js`) no incluían ese campo en sus selects.
- **Fix:** los 3 selects ampliados. `api/checkout.js` inyecta `cupon_codigo: cupon` en `cleanOrder` para que llegue al email post-creación.
- **Lección:** cuando se agrega una columna a la DB, hacer grep global de los selects existentes para detectar dónde NO se lee.

### Bug #5 — Items del email no mostraban personalización (Sesión 36)

- **Antigüedad:** ~8 sesiones (desde Sesión 28 cuando se agregó personalización).
- **Síntoma:** email mostraba "Founder Confort × 1: $2.490" pero arriba decía "+$1.160 por grabado". La suma de líneas no cuadraba con el total.
- **Causa raíz:** `blockItems()` y `blockItemsWithPhotos()` calculaban subtotal como `precio × cantidad`, sin sumar el extra de personalización.
- **Fix:** ahora suma `(precio + extra) × cantidad` y muestra subtítulo "· con grabado láser (+$X)" cuando aplica.
- **Lección:** cuando se agrega una nueva dimensión al modelo (personalización tiene `extra`), revisar TODAS las funciones de cálculo en TODOS los canales (frontend, backend, emails).

---

## 🎨 Sistema visual de descuentos (Opción D)

### Diseño aprobado por el dueño

**Tarjeta verde con borde izquierdo:**
- Background: `rgba(74, 222, 128, 0.05)` (frontend) / `rgba(76, 175, 130, 0.08)` (email — clientes de mail no soportan rgba bien en todos los casos, pero el fallback es transparente)
- Border-left: `3px solid #4ade80` (frontend) / `3px solid #4caf82` (email — verde más sobrio que se ve consistente entre clientes)
- Padding: `10px 12px`
- Estructura: título uppercase + subtítulo descriptivo + monto a la derecha

### Implementación según plataforma

| Lugar | Tecnología | Detalles |
|---|---|---|
| `checkout.html` + `founder-checkout.js` | Flexbox + CSS variables | Soporta hover, transiciones, layout responsive |
| `seguimiento.html` + `founder-seguimiento.js` | Flexbox + CSS variables | Mismo patrón que checkout |
| `api/email-templates.js` | Tabla anidada HTML inline | Compatible con Outlook, Gmail, Apple Mail. No usa CSS moderno. |

### Atribución por caso

| Caso | Tarjeta 1 | Tarjeta 2 |
|---|---|---|
| Solo cupón clásico (FOUNDER20) | "✓ Cupón FOUNDER20 aplicado" / "20% de descuento del producto" | — |
| Solo cupón personalización | "✓ Cupón PERSONAL aplicado" / "Personalización gratis" | — |
| Solo transferencia | "✓ Pago por transferencia" / "10% sobre productos + grabados" | — |
| Cupón + transferencia | "✓ Cupón X aplicado" / [subtitulo según tipo] / -$Y | "✓ Pago por transferencia" / "10% sobre productos + grabados" / -$Z |

### Split exacto del descuento en email (Sesión 37)

Cuando el cliente recibe el email **después** de la compra, la DB guarda solo el `descuento` total (no desglosa cupón vs transferencia). Para mostrar montos individuales correctos, Sesión 37 implementó este despeje matemático:

```
Sabido (de la DB):
  subtotal, personalización, envío, total, descuento_total

Despeje:
  total = (subtotal + personalización - cupón) × 0.90 + envío
  → cupón = subtotal + personalización - ((total - envío) / 0.90)
  → transferencia = descuento_total - cupón
```

Esto da resultados **exactos** sin queries extra. Sanity check: si el split da negativo o no suma exacto, fallback a una tarjeta combinada que dice "✓ Cupón X + Transferencia / Descuentos aplicados al pedido / -$total".

---

## 📱 Admin mobile (Sesión 35 — priority B)

### Decisión: empezar por lo esencial

El dueño confirmó la opción B: "ver pedidos + cambiar estados + cupones" (el 80% del uso real del admin desde celular). Productos y panel de personalización láser quedaron como pendiente para próxima sesión.

### Componentes adaptados

| Componente | Cambio |
|---|---|
| Topbar | Botón hamburguesa antes del logo. Logo más chico (16px), badge "ADMIN" oculto en mobile. |
| Sidebar | `position:fixed` drawer que entra desde izquierda con `transform:translateX`. Backdrop oscuro semitransparente. |
| Auto-cierre del drawer | Al navegar (`nav()`) en mobile (`window.innerWidth <= 768`). |
| Stats del dashboard | Grid 4 cols → 2 cols (tablet) → 1 col (small mobile). |
| Filtros de pedidos | Scroll horizontal con `-webkit-overflow-scrolling:touch` (iOS smooth scroll). |
| Cards de pedidos | Stack vertical con botones full-width y `padding:10px 12px` para tap fácil. |
| Modal "Ver detalle" | Ocupa casi todo el viewport. Grids internos `1fr 1fr` → `1fr`. |
| Form de cupones | `cupones-layout` ya estaba en 1 col en mobile, se reforzó. |
| Tabla de cupones | Scroll horizontal interno. |
| Toasts | `left:12px; right:12px` (full width). |
| Inputs y botones | `font-size:13px` (mejor tap target), `padding` más generoso. |

### Breakpoints

- `≤ 900px` — Tablet (stats 2 cols, orders-grid 1 col).
- `≤ 768px` — Mobile (drawer, cards stack, todos los componentes adaptados).
- `≤ 480px` — Small mobile (stats 1 col, esconde "Ver sitio" en topbar).

---

## 🔧 Decisiones de diseño tomadas durante el arco

### "Aplicar ≠ Consumir" del cupón (Sesión 32)

Cuando el cliente hace click en "Aplicar" en el checkout, el cupón NO se marca como usado todavía. Solo se valida y se previsualiza el descuento. El cupón solo se consume cuando el pedido se confirma (RPC SQL atómica). Razón: si el cliente abandona, no se gasta el uso. Patrón estándar de Amazon, Mercado Libre, etc.

### Atributo > tipo nuevo en `coupons.uso` (Sesión 32-33)

En lugar de agregar valores nuevos al CHECK constraint de `uso` (que rompería compatibilidad), se agregaron columnas BOOLEAN combinables. Ventaja: combinaciones triviales (ej. "VIP recurrente con grabado gratis"), constraint estable, futuras extensiones triviales.

### Defensa en triple capa (Sesión 32-33)

Todas las validaciones críticas (cliente repetido, cliente nuevo, slots inválidos, combinaciones excluyentes) están implementadas en 3 lugares:
1. **Frontend del admin** (UX inmediato: toast antes de enviar).
2. **Backend API** (defensa contra clientes maliciosos que pegan al endpoint directo).
3. **DB constraint o RPC SQL** (verdad inviolable).

### Cupón de personalización con tope al 100% real (Sesión 33)

Si el cupón cubre 4 slots pero el cliente solo personalizó 2, el descuento se topea al monto real personalizado. Razón: el cupón "regala hasta X grabados" — si el cliente usa menos, no se le regala plata extra.

### Transferencia siempre acumulable (Sesión 36)

Cambio de regla histórica. Antes: "se aplica el mayor entre cupón y transferencia". Ahora: "siempre se acumulan". Razón estratégica del dueño: la transferencia ahorra ~6% de comisión de MP. Mejor ceder 10% al cliente que pagar comisión.

### Transferencia no toca el envío (Sesión 36)

El 10% se calcula sobre `(subtotal + personalización - cupón)`. El envío se cobra/no cobra según ese mismo monto base, NO según el monto después de transferencia. Razón: el cliente "se ganó" el envío gratis con los productos+grabados, la transferencia es bonus separado.

### Auto-marca consent unidireccional (Sesión 35)

Marcar "Política de Privacidad" marca automáticamente "No devolución (personalización)" si está visible. Pero NO al revés: desmarcar Privacidad no desmarca el otro. Razón: el consent legal de no-devolución debe poder mantenerse aunque el cliente cambie de opinión sobre privacidad.

---

## 📊 Métricas globales del arco 32-37

| Métrica | Valor |
|---|---|
| Sesiones totales | 6 |
| Días | 1 (todas el 13/05/2026) |
| Archivos modificados (únicos) | 13 |
| Bugs latentes descubiertos | 5 |
| Tests sintéticos pasados | 22/22 |
| SQL migrations | 2 (Sesión 32 + Sesión 33) |
| Columnas nuevas en DB | 4 (todas en `coupons`) |
| CHECK constraints nuevos | 1 (`coupons_consistency_check`) |
| CHECK constraints arreglados | 2 (`coupons_uso_check`, `coupons_tipo_check`) |

---

## 🚧 Pendientes después del arco 32-37

### Alta prioridad

1. **Columnas `descuento_cupon` y `descuento_transferencia` en `orders`** — para evitar el despeje matemático del email y simplificar reportes financieros.
2. **Auditoría general de constraints CHECK** — Sesión 32 reveló que coupons tenía constraints desincronizados desde hacía 18 sesiones. Hay que revisar `orders`, `products`, `product_colors`, etc.

### Media prioridad

3. **Edición de cupones post-creación** — hoy solo Pausar/Activar/Eliminar. Faltaría poder editar valor, min_compra, fechas, flags.
4. **Email automático con FOUNDER20 a los 10 días post-entrega** — idea del dueño en Sesión 32. Requiere cron + flag de dedup.
5. **Email automático al admin cuando entra pedido con grabado** — código ya existe (`blockPersonalizacion('admin')`), falta conectarlo.

### Baja prioridad

6. **Admin mobile parte 2** — editor de productos y panel de personalización láser optimizados (priority A de Sesión 35).
7. **CSP (Content Security Policy)** — última pieza para A+ en securityheaders.com.
8. **Drop columna legacy `products.banner_url`** — pendiente desde Sesión 21.

---

## 🎓 Lecciones del arco

### 1. Probar integración fin a fin, no solo unidades

Los bugs #2 y #3 (Sesión 33→34) se escaparon porque testeé la lógica del cupón en SQL y el helper de admin separadamente, pero no probé el flujo completo "frontend valida → backend valida → cálculo → render". La próxima vez que se agregue un tipo nuevo de algo, recorrer TODOS los lugares que interactúan con ese tipo.

### 2. Validar reglas de negocio con números antes de codificar

En Sesión 36, antes de tocar código, calculamos manualmente 3 casos numéricos (FOUNDER20 + transferencia, PERSONAL + transferencia, sin descuentos). Esos 3 cálculos manuales se convirtieron en los primeros 3 tests sintéticos del código nuevo, y pasaron al primer intento. Validar contra ejemplos numéricos elimina ambigüedad antes de escribir una sola línea.

### 3. Auditar constraints CHECK periódicamente

El bug #1 sobrevivió 18 sesiones porque la tabla estaba vacía. Es un patrón insidioso: features que no se usan acumulan inconsistencia silenciosamente. Recomendación: auditoría trimestral de constraints comparando contra strings del código.

### 4. Cuando un fix obvio no resuelve, instrumentar antes de hipotetizar

En Sesión 32, al ver "Error al guardar el cupón", se barajaron 3 hipótesis (caché navegador, caché Vercel, GRANT). Las 3 erróneas. Abrir F12 → Network → Response real reveló la causa en 10 segundos. Método científico > intuición. Mejor instrumentar que adivinar.

### 5. Formularios con campos "que se ignoran en ciertos modos" son trampa

El bug #3 vino de un formulario que pedía "Valor" obligatorio aunque la flag de personalización dijera que ese campo se ignoraba. Mejor ocultar/deshabilitar visualmente Y validar consistentemente en frontend + backend. La UX de "este campo aplica solo a veces" confunde a usuarios y crea bugs invisibles.

### 6. Pedir el código real antes de tocar una función SQL existente

En Sesión 32, mi primer intento reconstruyó la RPC por inferencia (mirando cómo se usaba). Habría sobrescrito detalles sutiles (FOR UPDATE para lockear, retorno con shape específico, INTEGER en vez de NUMERIC). Pedir el código actual ahorra una sesión de debugging.

### 7. Defensa en profundidad sin redundancia inútil

La triple capa (frontend admin → backend API → DB constraint) parece redundante pero cada capa tiene un rol distinto:
- Frontend: UX inmediato sin round-trip.
- Backend: protección contra clientes maliciosos.
- DB: verdad inviolable, último recurso.

No es redundancia, es resiliencia.
