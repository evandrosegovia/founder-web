# 📊 ESTADO DEL PROYECTO — FOUNDER.UY

**Última actualización:** Sesión 52 — **Pack de mejoras chicas + limpieza estructural + auditoría completa.** Maratón del 16/05/2026: cierre completo del ciclo de banners rotatorios (vista previa + drag-and-drop + limpieza legacy), agregado de cleanup manual de fotos de reseñas, indicador de cambios sin guardar para el modal de banners y editor de cupones, fix del bug intermitente de productos vacíos al volver con back/forward (bfcache), 5 mejoras chicas (duplicar banner, copiar resumen pedido, badge del carrito global, empty states contextuales, dirty tracker genérico), eliminación de modal vestigial detectado en auditoría. **Cambios:** 6 archivos modificados a lo largo del día (`admin.html`, `founder-admin.js`, `supabase-client.js`, `index.html`, `producto.html`, `cart.js`). Sin cambios de schema en DB — todo a nivel frontend. (16/05/2026)

**Sesiones del día 16/05/2026 (todas exitosas, sin rollbacks):**

- **Sesión 49** — Cierre del ciclo de banners rotatorios: (b) modal de vista previa que renderiza el slide en vivo desde el formulario de edición, (c) drag-and-drop nativo HTML5 para reordenar slides (con línea dorada como drop indicator, cursor grab/grabbing, fallback a botones ↑↓ en mobile), (d) eliminación completa del código legacy `hero_banner_url` (función `fetchBannerUrl`, fallback en `fetchHeroSlides`, migración automática en `loadBanner` del admin). Cero deps nuevas, código más liviano (−1 KB en supabase-client.js).

- **Sesión 50** — (e) UI manual para cleanup de fotos huérfanas de reseñas: card nuevo en el **panel de Reseñas** invocando `run_reviews_orphans_manual` (endpoint backend ya existente desde Sesión 42). Refactor de `loadCleanupLogs` → `renderCleanupLogs(listElId, filterTipo)` parametrizable, con dos wrappers (`loadCleanupLogs` para imágenes de personalización + `loadReviewsCleanupLogs` para reseñas). Cada panel muestra solo su historial relevante, sin mezclar tipos. (n) Indicador de cambios sin guardar en el modal de edición de banners: snapshot del form al abrir, comparación reactiva en cada input/change, puntito dorado pulsante en el título y confirm de descarte al cerrar. **Resuelto:** deploy fallaba por archivo `admin.html` subido incorrectamente a `/api/` (conflicto de path con `/api/admin.js`).

- **Sesión 51** — Fix de bug intermitente "grilla de productos vacía al volver con back/forward". Causa raíz: bfcache del navegador restaura la página sin reejecutar el script de inicialización. Solución triple: (1) listener `pageshow` con detección de `event.persisted` que re-ejecuta `init()` si la página vino del bfcache sin datos cargados, (2) timeout de 15s con `AbortController` en `supaGet()` del cliente Supabase para evitar fetches colgados indefinidamente, (3) error states clickables con botón "↻ Reintentar" en lugar del genérico "Recargá la página" — diferenciando tipo de error (timeout vs fetch error vs not_found). Aplica a `index.html` y `producto.html`. Cero deps nuevas, cero cambios de backend.

- **Sesión 52** — Pack de 5 mejoras chicas + limpieza estructural:
  - **Limpieza (audit):** eliminado el modal vestigial `reviewDetailModal` (código muerto desde Sesión 38, su `closeReviewDetail()` ni siquiera existía).
  - **(2) Duplicar banner:** botón 📋 en cada card del admin, crea copia pausada al final del orden y abre el editor.
  - **(4) Copiar resumen pedido:** botón 📋 en el header del detalle, usa Clipboard API con fallback execCommand para máxima compatibilidad. Formato pensado para WhatsApp/email/transcripción al transportista.
  - **(5) Badge del carrito global:** helper `refreshCartCountBadge()` en `cart.js`, ejecutado tras `render()` del componente. Refactor: index/producto delegan a esa función en vez de tener código inline duplicado. Cap visual "9+" para 10+ items. Funciona en TODAS las páginas con header (contacto, sobre-nosotros, envíos, RFID).
  - **(3) Empty state pedidos:** 9 mensajes contextuales por filtro, tono celebratorio (verde + ✨) cuando vacío = buena señal ("Sin pagos rechazados — buena señal"), tono informativo (ícono temático + muted) cuando solo es "todavía no pasó nada".
  - **(1) Indicador "sin guardar" genérico:** helper reutilizable `createDirtyTracker` con event delegation idempotente, snapshot JSON comparado byte-a-byte (detecta deshacer cambios manualmente). Aplicado en editor de cupones (puntito dorado + confirm al cancelar). **Pendiente para futura sesión:** Productos y Personalización Láser quedan por complejidad de form (filas dinámicas con fotos, toggles asociados a productos).

---

**Próxima sesión:** 53 — opciones disponibles, en orden sugerido de prioridad:

### 🎯 EN CURSO — Panel "Carrito" en admin (Sesión 53)

**Plan completo de 3 fases acordado con el usuario:**

- **Fase 1 — Panel admin "Carrito" + Controlador del contador.** Crear nuevo panel en admin con sub-secciones para gestionar todas las opciones del carrito desde un solo lugar. Primer feature: toggle activar/desactivar el contador de urgencia (hoy hardcodeado en `cart.js`), duración configurable, texto editable. Backend: nueva key `site_settings.cart_config` (JSON serializado, mismo patrón que `hero_slides` y `personalizacion_config`). Frontend público: leer `cart_config` y aplicar.

- **Fase 2 — Refactor del cross-sell de 3 productos.** Pasar de hardcoded a configurable desde admin: qué productos mostrar (selector de catálogo), título del bloque editable, % de descuento configurable. **Decisión de diseño:** los productos en el cross-sell NO permiten personalización láser desde el carrito — el cliente que quiera grabarlos tiene que ir al producto (opción A elegida). Mejoras visuales: color del título en dorado (no rojo), limpiar info redundante en los items ("No quiero grabado", "Tamaño funda 15/15.6"), formato de precios sin `,00` cuando son enteros, mejor jerarquía visual entre item principal y cross-sell.

- **Fase 3 — Nueva mecánica "Llevá otra".** Segunda unidad del mismo producto con descuento configurable. Texto del tipo "Llevá otra para regalar o regalarte a un X% menos". Convive con el cross-sell de 3 productos (el admin elige cuál mostrar). Decisión de diseño pendiente: ¿permitir cambiar el color de la segunda unidad o asumir el mismo del producto principal?

**Decisión arquitectónica:** todo se controla desde un nuevo panel `🛒 Carrito` en el sidebar del admin, con sub-secciones por feature. Schema sugerido para `cart_config`:

```json
{
  "contador": {
    "enabled": true,
    "duracion_min": 7,
    "texto": "Carrito reservado por {tiempo}"
  },
  "cross_sell": {
    "enabled": true,
    "titulo": "✦ Comprá juntos y ahorrá",
    "product_ids": ["uuid1", "uuid2", "uuid3"],
    "descuento_pct": 25
  },
  "lleva_otra": {
    "enabled": false,
    "texto": "Llevá otra para regalar",
    "descuento_pct": 25,
    "permite_cambio_color": true
  }
}
```

### 🟢 Pendientes pre-sesión 49 (siguen abiertos)

- (a) **Smoke test funcional post-deploy de Sesiones 47-48c.** Ya validado por el usuario visualmente durante el día — confirmado funcionamiento end-to-end. **Cerrado.**

- (b) **Modal "Vista previa" de slide en el admin.** ✅ Hecho en Sesión 49.

- (c) **Drag-and-drop para reordenar slides.** ✅ Hecho en Sesión 49.

- (d) **Limpiar la API legacy `hero_banner_url`.** ✅ Hecho en Sesión 49. La fila `hero_banner_url` también fue borrada manualmente del dashboard de Supabase por el usuario.

- (e) **UI en admin para cleanup de huérfanas de reseñas.** ✅ Hecho en Sesión 50 (inicial en Personalización Láser, refactorizado a Reseñas en la misma sesión por feedback del usuario).

- (f) **Métricas de conversión de la feature de recompra** — dashboard chico con "% de cupones FOUNDER15 usados sobre emails enviados" + ingresos generados por recompras. Esfuerzo: 1.5 h. Útil después de algunas semanas con datos reales.

- (g) **Subir DMARC a `p=reject`** dentro de 4-8 semanas (~mediados-finales de junio 2026), si los reportes con `p=quarantine` confirman que no hay falsos positivos. **No urgente** — `quarantine` ya da el 90% del beneficio antiphishing.

- (h) **Subir el email de recompra a Recibidos principal de Gmail** — hoy cae en Promociones. Mejora con reputación del dominio a lo largo del tiempo, no es acción única. **No urgente.**

- (i) **Endurecer el CSP retirando `'unsafe-inline'`** — el CSP actual de Sesión 45 permite `'unsafe-inline'`. Refactor a `addEventListener` + clases CSS + JSON-LD externo permitiría sacar `'unsafe-inline'`. Esfuerzo: 3-4 h. **Sin urgencia.**

- (j) **Datos bancarios reales en email de transferencia.** El template actual dice "Te enviamos los datos por WhatsApp". Cuando definas banco/cuenta/CBU/titular, agregar bloque con datos directos. Esfuerzo: 30-45 min.

- (k) **Pendientes Meta Business** (3 clics en Chrome): renombrar dataset "NO" con prefijo `ZZ-`, renombrar/ignorar Ad Account vieja, agregar email de contacto al Instagram. Esfuerzo: 15 min.

- (l) **Primera campaña paga de Meta Ads.** Todo listo desde Sesión 17-18. Definir presupuesto, producto, audiencia, creatividad.

### 🆕 Pendientes nuevos (originados en Sesiones 49-52)

- (m) **Indicador "sin guardar" para editor de Productos.** El editor de productos tiene filas dinámicas de colores con fotos cargables — el `createDirtyTracker` actual no captura cambios en filas que se agregan/eliminan. Requiere extensión del helper o tracker custom. Esfuerzo: 1.5-2 h. **No urgente.**

- (n) **Indicador "sin guardar" para editor de Personalización Láser.** Similar a (m): el form tiene toggles de productos asociados (`_lpDirty` por producto) que el tracker actual no captura. Requiere unificar la lógica con el flag existente. Esfuerzo: 1.5 h. **No urgente.**

- (o) **Refactor de estilos inline repetidos en admin.html** (detectado en auditoría Sesión 52): `style="margin-top:14px"` (14 veces), `style="margin-bottom:14px"` (7 veces), bloque de status box repetido 3 veces. Crear clases utilitarias (`.mt-14`, `.status-box`). Esfuerzo: 30 min. **No urgente, cosmético.**

- (p) **Dejar de usar Vercel Hobby si tráfico crece 10×.** Permitiría separar nuevamente los crons (rate_limits diario + imágenes semanal) y usar frecuencias <1/día. Decisión cuando llegue.

---

**Nota:** El archivo `PLAN-PERSONALIZACION.md` fue archivado en `docs/archive/` tras Sesión 29 (info crítica también consolidada en este `ESTADO.md`, ver Sesión 29 abajo). Se conserva por valor de auditoría histórica de decisiones de diseño y arquitectura del feature.

---
