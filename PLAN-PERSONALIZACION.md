# 📋 PLAN — Personalización con Grabado Láser

**Estado:** ✅ **IMPLEMENTADO Y FUNCIONAL** — Bloque A + Bloque B completos, desplegados en producción, feature apagado por master switch hasta tener láser físico
**Última actualización:** Sesión 28 (08/05/2026) — implementación end-to-end + 2 hotfixes operativos. Pendientes: Sesión C (operación: cron, descarga ZIP, UI admin pedidos) + Sesión D (pulido: emails, smoke test). Ambas opcionales y NO bloqueantes.
**Próxima acción recomendada:** activar feature cuando llegue el láser físico, hacer 5-10 pedidos reales, recién después encarar Sesión C/D con datos de uso real.
**Prioridad histórica:** ALTA — diferencial competitivo principal vs Baleine y MBH.

> **Nota de lectura:** este documento se mantiene como plan original (Sesiones A→D) por valor de auditoría/referencia. La sección "📜 Historial de cambios" al final refleja qué se ejecutó realmente y cuándo. Para el detalle operativo de qué quedó funcionando, ver sección "🎬 Próximos pasos" actualizada al final del doc, y `ESTADO.md` Sesión 28.

---

## 🎯 Resumen ejecutivo

Founder.uy va a ofrecer **grabado láser personalizado** sobre las billeteras como add-on opcional. El cliente podrá elegir grabar:

- **Imagen adelante** (logo, foto, ilustración) — +$290
- **Imagen interior** — +$290
- **Imagen atrás** (logo, foto, ilustración) — +$290
- **Texto o frase** (nombre, palabra, fecha) — +$290

Las opciones son **acumulables** (puede elegir las 4 → +$1.160).

El feature agrega **24 hs hábiles** al tiempo de preparación. Los productos personalizados **no admiten devolución** (sí mantienen garantía de fabricación de 60 días).

### Por qué importa

- **Diferencial competitivo:** MBH lo ofrece, Baleine no. Este feature te empareja con MBH y te diferencia de Baleine.
- **Aumento de ticket promedio:** si 1 de cada 5 clientes lo elige (estimado conservador), el ticket sube +2.5%. Si la mitad lo elige, +6%.
- **Mejor margen unitario:** el costo del láser por unidad es mucho menor que los $290 cobrados.
- **Cliente más comprometido:** los productos personalizados tienen casi 0% de devoluciones (regalo, valor emocional).

---

## 🏗️ Arquitectura conceptual del feature

El feature tiene **3 capas** que se complementan:

```
┌─────────────────────────────────────────────────┐
│  CAPA 1 — CONFIGURACIÓN GLOBAL (Admin)          │
│  Vive en site_settings.personalizacion_config   │
│  Editable desde Admin > Herramientas            │
│                                                 │
│  • Precio por elemento                          │
│  • Tiempo extra de preparación                  │
│  • Límites de archivo (peso, dimensiones)       │
│  • Caracteres máximos en texto                  │
│  • Tipos de archivo permitidos                  │
│  • Textos legales (copyright, no-devolución)    │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  CAPA 2 — CONFIG POR PRODUCTO (Admin > Productos)│
│  Vive en columnas de products                    │
│  Editable desde Admin > edición de producto      │
│                                                  │
│  • permite_grabado_adelante (bool)              │
│  • permite_grabado_interior (bool)              │
│  • permite_grabado_atras (bool)                 │
│  • permite_grabado_texto (bool)                 │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  CAPA 3 — GALERÍA DE EJEMPLOS (Admin > Herram.) │
│  Vive en tabla nueva personalizacion_examples   │
│  Editable desde Admin > Herramientas            │
│                                                 │
│  • Foto + tipo (adelante/interior/atrás/texto)  │
│  • Etiquetas de color (negro/camel/etc.)        │
│  • Orden + descripción                          │
└─────────────────────────────────────────────────┘
                      ↓
              📱 Frontend de producto.html
              consume las 3 capas en vivo
```

---

## 🔍 Análisis del competidor

El competidor analizado ofrece **3 modalidades excluyentes** (checkboxes que actúan como radios):

1. **Grabado solo iniciales** ($320) — máx 3 caracteres, ubicación exterior/interior. Es grabado **por calor**, no láser.
2. **Grabado láser** ($320 c/u) — imagen adelante / imagen atrás / texto, acumulable.
3. **No quiero grabado.**

### Lo que hace bien
- Acumulación de elementos láser (3 botones que suman precio).
- Confirmación visible del precio agregado.
- Inputs separados de "indicaciones" para que el cliente aclare detalles.

### Lo que hace mal (y vamos a mejorar)
- ❌ Usa **checkboxes** para opciones excluyentes → UX rota.
- ❌ El cartel rosado fluo de "Se agregaron $320" rompe la estética.
- ❌ El botón "Elegir Imagen" rosado se ve flojo, no premium.
- ❌ No hay **preview** del grabado.
- ❌ No valida la **calidad de la imagen** subida.
- ❌ No advierte sobre **devoluciones** ni **tiempo extra de entrega**.
- ❌ No muestra **ejemplos visuales** del tipo de grabado.

### Decisión clave para Founder

**Solo ofrecemos grabado láser** (eliminamos el de iniciales por calor que tiene el competidor). Razón: no tenemos máquina de calor, solo láser.

---

## 💡 Mejoras vs el competidor

| Mejora | Beneficio |
|---|---|
| **Toggle único** "¿Querés personalizar?" en vez de 3 checkboxes | UX más clara, menos decisiones |
| **Botones tipo "card"** seleccionables en vez de checkboxes | Más premium, más fácil de tocar en mobile |
| **Resumen de precio integrado** en el sticky CTA en vivo | El cliente ve siempre el precio final actualizado |
| **Galería de ejemplos** con botón "Ver ejemplo" junto a cada opción | Genera confianza, reduce dudas y reclamos |
| **Filtrado de ejemplos por color elegido** | Muy premium — el cliente ve cómo queda EN SU COLOR |
| **Validación de imagen** (peso, dimensiones) en vivo | Evita problemas en producción |
| **Aviso destacado** sobre +24 hs y no-devolución | Transparencia, reduce reclamos |
| **Configuración global desde admin** (precios, plazos, etc.) | Vos controlás sin tocar código |
| **Configuración por producto** (qué grabados permite cada uno) | Honestidad técnica + flexibilidad |
| **Limpieza automática + manual de imágenes** | Cuida el storage del plan Free |
| **Drag & drop** de imágenes en desktop | Más cómodo |
| **Solo láser** (sin iniciales por calor) | Menos confusión, mejor foco |

---

## 🎨 Diseño UX propuesto — Frontend de producto.html

### Ubicación del bloque de personalización

En `producto.html`, el bloque va **después de elegir el color** y **antes del CTA "Agregar al carrito"**. Específicamente:

```
1. Galería de fotos
2. Nombre del producto + descripción
3. Precio
4. Selector de color
5. ⭐ NUEVO: Bloque "Personalización láser"
6. Botón "Agregar al carrito"
7. Política de garantía
8. Tabs (especificaciones, etc.)
```

### Estado 1 — Toggle cerrado (default)

```
┌─────────────────────────────────────────────────────┐
│  ✏️  Personalizá tu Founder con grabado láser   [○] │
│  Hacé tu billetera única. +24 hs de preparación.    │
└─────────────────────────────────────────────────────┘
```

### Estado 2 — Toggle abierto

```
┌─────────────────────────────────────────────────────┐
│  ✏️  Personalizá tu Founder con grabado láser   [●] │
│                                                     │
│  Elegí qué querés grabar (podés combinar):          │
│                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │ 🖼️ ADELANTE  │ │ 🖼️ INTERIOR  │ │ 🖼️ ATRÁS     ││
│  │   +$290      │ │   +$290      │ │   +$290      ││
│  │ ⓘ ver ejemp. │ │ ⓘ ver ejemp. │ │ ⓘ ver ejemp. ││
│  └──────────────┘ └──────────────┘ └──────────────┘│
│  ┌──────────────┐                                   │
│  │ ✍️ TEXTO     │                                   │
│  │   +$290      │                                   │
│  │ ⓘ ver ejemp. │                                   │
│  └──────────────┘                                   │
│                                                     │
│  [zona dinámica: aparece según lo elegido]          │
│                                                     │
│  ⚠️ Los productos personalizados no admiten         │
│     devolución (sí mantienen garantía de            │
│     fabricación). +24 hs de preparación.            │
└─────────────────────────────────────────────────────┘
```

> **Nota:** Si un producto tiene desactivada alguna modalidad desde Admin, ese botón **no aparece**. El layout se reorganiza solo.
>
> **Nota 2:** Si un producto tiene TODAS las modalidades desactivadas, el bloque entero **no se muestra**. En su lugar aparece una leyenda chica: *"Este modelo no admite personalización láser."*

### Estado 3 — Modal "Ver ejemplo" (al tocar el ⓘ)

```
┌─────────────────────────────────┐
│ ✕                               │
│                                 │
│   [foto: billetera negra        │
│    con logo grabado adelante]   │
│                                 │
│   • • ○                         │  ← carrusel
│                                 │
│   GRABADO ADELANTE              │
│   En cuero negro                │
│                                 │
│   Ideal para imágenes detalladas│
│   o logos. Visible al exterior. │
└─────────────────────────────────┘
```

**Lógica de selección de fotos:**
1. Si el cliente ya eligió un color, mostrar **prioritariamente** fotos etiquetadas con ese color.
2. Si no hay fotos con ese color exacto, mostrar otras como fallback.
3. Si no hay ninguna foto del tipo elegido, no mostrar el botón "Ver ejemplo".

### Estado 4 — "Adelante/Interior/Atrás" seleccionada (zona de upload)

```
┌─────────────────────────────────────────┐
│  Imagen para grabar adelante     [✕]   │
│  ┌─────────────────────────────────────┐│
│  │     [+] Subir imagen                ││
│  │     PNG, JPG, SVG (máx 5 MB)        ││
│  │     Mín. recomendado: 800×800 px    ││
│  └─────────────────────────────────────┘│
│                                         │
│  Indicaciones (opcional)                │
│  ┌─────────────────────────────────────┐│
│  │ Ej: centrar y achicar 20%           ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

Cuando se sube imagen exitosamente:
```
✓ logo-empresa.png · 1.2 MB · Calidad correcta
```

Si la imagen es 500-799 px:
```
⚠️ Resolución baja (650×650 px). El grabado puede no quedar nítido.
   [Cambiar imagen]   [Continuar igual]
```

Si la imagen es <500 px → bloqueo total.

### Estado 5 — "Texto" seleccionada

```
┌─────────────────────────────────────────┐
│  Texto a grabar                         │
│  ┌─────────────────────────────────────┐│
│  │ Founder                       [7/40]││
│  └─────────────────────────────────────┘│
│                                         │
│  Indicaciones (opcional)                │
│  ┌─────────────────────────────────────┐│
│  │ Ej: tipografía cursiva, dorado      ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### Estado 6 — Sticky CTA actualizado en vivo

```
Antes (sin personalización):
$2.490 UYU
[Agregar al carrito]

Después (2 personalizaciones):
$2.490 + $580 personalización = $3.070 UYU
[Agregar al carrito]
```

---

## 🛠️ ADMIN — Tres lugares donde se configura el feature

### 1️⃣ Admin > Herramientas — Configuración global

Sección nueva en el menú lateral del admin:

```
🎨 PERSONALIZACIÓN LÁSER — Config global

Precio por elemento (UYU):           [ $290        ]
Tiempo extra de preparación (hs):    [ 24          ]

── Validación de archivos ──
Peso máximo del archivo (MB):        [ 5           ]
Resolución mínima recomendada (px):  [ 800 ] x [ 800 ]
Resolución mínima absoluta (px):     [ 500 ] x [ 500 ]
Caracteres máximos en texto:         [ 40          ]
Tipos de archivo permitidos:
  ☑ PNG  ☑ JPG  ☑ JPEG  ☑ SVG  ☐ PDF

── Textos legales ──
Texto legal copyright:
┌─────────────────────────────────────────────────────────┐
│ Al subir una imagen declarás tener derechos de uso...   │
└─────────────────────────────────────────────────────────┘

Texto aviso "no devolución":
┌─────────────────────────────────────────────────────────┐
│ Los productos personalizados no admiten devolución...   │
└─────────────────────────────────────────────────────────┘

                                            [ GUARDAR ]
```

**Almacenamiento:** todo va a `site_settings.personalizacion_config` como un único objeto JSON (no agrega tablas).

### 2️⃣ Admin > Galería de ejemplos

Sub-sección dentro de Herramientas:

```
🖼️ GALERÍA DE EJEMPLOS DE GRABADO

Tipo: [ Adelante ▾ ] [ Interior ▾ ] [ Atrás ▾ ] [ Texto ▾ ]

[ + Subir foto ]

┌────────────┐ ┌────────────┐ ┌────────────┐
│ [foto]     │ │ [foto]     │ │ [foto]     │
│ Adelante   │ │ Adelante   │ │ Interior   │
│ Negro      │ │ Camel      │ │ Negro,Camel│
│ ↑↓ orden:1 │ │ ↑↓ orden:2 │ │ ↑↓ orden:1 │
│ ✏️ 🗑️       │ │ ✏️ 🗑️       │ │ ✏️ 🗑️       │
└────────────┘ └────────────┘ └────────────┘
```

Al hacer clic en `+ Subir foto`:
1. Selector de archivo.
2. Pregunta: ¿Qué tipo de grabado muestra? (adelante / interior / atrás / texto)
3. Pregunta: ¿Para qué colores aplica? (multi-select)
4. Descripción corta opcional.
5. Sube → aparece en la galería.

**Almacenamiento:**
- Tabla nueva `personalizacion_examples`.
- Imágenes en bucket `personalizacion-ejemplos` (separado del de clientes).

### 3️⃣ Admin > Productos > [editar producto] — Config por producto

Dentro del editor de cada producto:

```
🎨 PERSONALIZACIÓN LÁSER (producto)

¿Qué grabados permite este modelo?

  ☑ Permite grabado ADELANTE
  ☑ Permite grabado INTERIOR
  ☐ Permite grabado ATRÁS
  ☑ Permite grabado de TEXTO

⚠️ Si todos están desactivados, el bloque de personalización
   no se mostrará en este producto y aparecerá la leyenda:
   "Este modelo no admite personalización láser."
```

**Almacenamiento:** 4 columnas booleanas en la tabla `products`.

---

## 🧹 SISTEMA DE LIMPIEZA AUTOMÁTICA DE IMÁGENES

### Política de retención

| Tipo de imagen | Cuándo se borra |
|---|---|
| 🟡 **Huérfanas** (uploads sin orden asociada) | A los **10 días** de creadas |
| 🟢 **De órdenes activas** (no entregadas) | **Nunca** |
| 🔵 **De órdenes entregadas** | A los **60 días** post-entrega |

> 📌 **Backup manual del dueño:** las imágenes se descargan al ordenador antes de cada limpieza grande (1 vez al año aprox.). Acumular localmente sin problema. **No hay backup en cloud secundario.**

### Implementación dual: cron + manual

**A) Cron automático semanal** (`api/cleanup-personalizacion.js`):
- Se ejecuta **1 vez por semana** (configurable en `vercel.json`).
- Aplica las reglas de retención sin intervención.
- Loguea qué borró para auditoría.
- Vercel Hobby Plan permite hasta 2 crons gratis por mes — alcanza.

**B) Botón manual en Admin > Herramientas**:

```
🧹 LIMPIEZA DE IMÁGENES

Estado actual del bucket:
  • Total imágenes: 234
  • Espacio usado: 412 MB / 1 GB (41%)

Eliminables ahora:
  • 🟡 Huérfanas (>10 días):           12 imágenes
  • 🔵 De órdenes entregadas (>60 d):   5 imágenes
  • Total: 17 imágenes (~34 MB)

Última limpieza automática: hace 4 días
(en esa pasada se borraron 12 imágenes)

   [ DESCARGAR TODAS LAS IMÁGENES ELIMINABLES (.zip) ]
   [        EJECUTAR LIMPIEZA MANUAL AHORA          ]
```

> 💡 **Detalle UX clave:** el botón de descarga ZIP **arriba** del botón de limpieza es central al flujo. Permite al dueño bajarse las fotos a su PC antes de borrar.

### Flujo del botón manual

1. Admin entra a Herramientas → Limpieza.
2. Ve estado actual del bucket.
3. (Opcional) Toca "Descargar todas las eliminables" → genera ZIP.
4. Toca "Ejecutar limpieza manual ahora".
5. Modal de confirmación: "¿Borrar 17 imágenes? Esta acción no se puede deshacer."
6. Confirma → se ejecuta → muestra resultado.

### Métricas visibles para auditoría

```
📊 Historial de limpiezas

08/05/2026 03:00  •  AUTO   •  borradas: 12  •  liberados: 23 MB
01/05/2026 03:00  •  AUTO   •  borradas: 8   •  liberados: 16 MB
24/04/2026 14:32  •  MANUAL •  borradas: 15  •  liberados: 31 MB
```

---

## 🛒 Cómo se ve en el carrito

```
┌─────────────────────────────────────────┐
│ [foto] Founder Simple                   │
│        Negro                            │
│        ✏️ Personalizado:                │
│           • Imagen adelante: logo.png   │
│           • Texto atrás: "Founder"      │
│        [-] 1 [+]              $3.070    │
└─────────────────────────────────────────┘
```

---

## 📧 Cómo se ve en el email transaccional

### Email al cliente (confirmación de compra)

Bloque nuevo cuando hay personalización:

```
🎨 Personalización láser

Imagen adelante: logo-empresa.png ✓ recibida
Texto atrás: "Founder"
Total personalización: +$580

Tiempo extra estimado: 24 hs hábiles para preparación.
```

### Email al admin (notificación de pedido)

```
⚠️ ESTE PEDIDO TIENE PERSONALIZACIÓN LÁSER

Detalles para producción:
- Imagen adelante: [link descargar imagen original]
  Indicaciones del cliente: "centrar y achicar 20%"
- Texto atrás: "Founder"
  Indicaciones del cliente: "tipografía cursiva, dorado"

⚠️ Recordá: este pedido necesita 24 hs hábiles extra
   antes de marcarlo "En preparación".
```

---

## 🔧 Arquitectura técnica detallada

### Cambios en Supabase

#### Tabla `products` — agregar 4 columnas

```sql
ALTER TABLE products
ADD COLUMN permite_grabado_adelante BOOLEAN DEFAULT TRUE,
ADD COLUMN permite_grabado_interior BOOLEAN DEFAULT FALSE,
ADD COLUMN permite_grabado_atras BOOLEAN DEFAULT TRUE,
ADD COLUMN permite_grabado_texto BOOLEAN DEFAULT TRUE;
```

#### Tabla `order_items` — agregar columna

```sql
ALTER TABLE order_items
ADD COLUMN personalizacion JSONB;
```

Estructura del JSON:

```json
{
  "items": [
    {
      "tipo": "imagen_adelante",
      "url": "https://[supabase]/storage/v1/object/public/personalizaciones/orden-F123-img1.png",
      "filename_original": "logo-empresa.png",
      "indicaciones": "centrar y achicar 20%"
    },
    {
      "tipo": "texto",
      "contenido": "Founder",
      "indicaciones": "tipografía cursiva, dorado"
    }
  ],
  "precio_total": 580
}
```

#### Tabla `orders` — agregar columnas

```sql
ALTER TABLE orders
ADD COLUMN tiene_personalizacion BOOLEAN DEFAULT FALSE,
ADD COLUMN fecha_entrega TIMESTAMP NULL;

CREATE INDEX orders_personalizacion_idx
ON orders(tiene_personalizacion)
WHERE tiene_personalizacion = TRUE;
```

> 📌 `fecha_entrega` se rellena cuando el admin marca "Entregado". Sirve para calcular los 60 días de retención.

#### Tabla nueva `personalizacion_examples`

```sql
CREATE TABLE personalizacion_examples (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL CHECK (tipo IN ('adelante', 'interior', 'atras', 'texto')),
  url         TEXT NOT NULL,
  colores     TEXT[] DEFAULT '{}',
  descripcion TEXT,
  orden       INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE personalizacion_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "examples_public_read"
  ON personalizacion_examples FOR SELECT
  USING (true);
```

#### Tabla nueva `cleanup_logs`

```sql
CREATE TABLE cleanup_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_at  TIMESTAMP DEFAULT NOW(),
  trigger       TEXT NOT NULL CHECK (trigger IN ('auto', 'manual')),
  borradas      INT DEFAULT 0,
  liberados_mb  NUMERIC(10,2) DEFAULT 0,
  detalle       JSONB
);
```

#### `site_settings` — fila nueva

```sql
INSERT INTO site_settings (key, value) VALUES (
  'personalizacion_config',
  '{
    "precio": 290,
    "tiempo_extra_hs": 24,
    "peso_max_mb": 5,
    "resolucion_min_recomendada_px": 800,
    "resolucion_min_absoluta_px": 500,
    "texto_max_caracteres": 40,
    "tipos_archivo_permitidos": ["png", "jpg", "jpeg", "svg"],
    "texto_legal_copyright": "Al subir una imagen declarás tener derechos de uso sobre la misma.",
    "texto_aviso_no_devolucion": "Los productos personalizados no admiten devolución, pero sí mantienen garantía de fabricación de 60 días."
  }'::jsonb
);
```

#### Buckets nuevos en Supabase Storage

**Bucket 1: `personalizaciones`** (imágenes subidas por clientes)
- Visibilidad: público (lectura).
- RLS: solo `service_role` puede escribir y borrar.
- Convención: `orden-{numero}-{tipo}-{timestamp}.{ext}`.

**Bucket 2: `personalizacion-ejemplos`** (galería editorial)
- Visibilidad: público (lectura).
- RLS: solo `service_role` puede escribir y borrar.
- Convención: `ejemplo-{tipo}-{timestamp}.{ext}`.

### Cambios en frontend

#### `producto.html`
- Agregar bloque HTML de personalización.
- Agregar CSS (~200 líneas).
- Agregar JS:
  - Toggle abrir/cerrar.
  - Leer config global desde Supabase.
  - Leer config del producto.
  - Renderizar solo botones permitidos.
  - Modal "Ver ejemplo" con galería filtrada por color.
  - Subida de imagen a Supabase Storage.
  - Validación en vivo.
  - Cálculo de precio en vivo + sticky CTA.
  - Validación pre-checkout.

#### `cart.js`
- Agregar campo `personalizacion` al objeto de cada item.
- Renderizar resumen en el drawer.
- Persistir en `localStorage`.
- Items con personalización **distinta** son items **separados**.

#### `checkout.html` y `checkout.js`
- Mostrar resumen de personalización en el resumen del pedido.
- Checkbox obligatorio: "Entiendo que los productos personalizados no admiten devolución".
- Pasar `personalizacion` al backend.

#### `admin.html` + `founder-admin.js`
- Sección "Herramientas" expandida con 3 sub-paneles:
  - **Configuración personalización** (parámetros globales).
  - **Galería de ejemplos** (CRUD de fotos).
  - **Limpieza de imágenes** (panel de estado + botones).
- En la lista de pedidos: ícono ✏️ junto al número si tiene personalización.
- Filtro nuevo: "Solo con personalización".
- Detalle del pedido: bloque destacado.
- Editor de productos: 4 toggles de grabado.

### Cambios en backend

#### `api/checkout.js`
- Recibir y validar `personalizacion`.
- Calcular subtotal incluyendo personalización.
- Guardar en `order_items.personalizacion`.
- Setear `orders.tiene_personalizacion = true`.

#### Endpoint nuevo `api/upload-personalizacion.js`
- POST con FormData (archivo + tipo).
- Valida MIME, peso, dimensiones según config global.
- Sube a `personalizaciones/`.
- Devuelve `{ url, filename_original, dimensiones }`.

#### Endpoint nuevo `api/cleanup-personalizacion.js`
- Triggered por cron Vercel y por botón manual.
- Lista archivos del bucket `personalizaciones/`.
- Cruza con `order_items.personalizacion` para identificar huérfanas.
- Cruza con `orders.fecha_entrega` para identificar viejas.
- Borra según política.
- Loguea en `cleanup_logs`.

#### Endpoint nuevo `api/download-personalizacion-bulk.js`
- Lista todas las imágenes elegibles para borrado.
- Genera ZIP en memoria.
- Devuelve como descarga.
- ⚠️ Si hay >100 imágenes → puede exceder límite de respuesta de Vercel. Limitar tamaño o paginar.

#### `api/admin.js` — actions nuevas
- `get_personalizacion_config` / `set_personalizacion_config`
- `list_examples` / `create_example` / `update_example` / `delete_example`
- `get_cleanup_state` / `run_cleanup_manual` / `download_eligible_zip`
- `get_orders_with_customizations` (filtro)
- Modificar `get_order_details` para incluir personalización.

#### `vercel.json` — agregar cron

```json
{
  "crons": [{
    "path": "/api/cleanup-personalizacion?trigger=auto",
    "schedule": "0 6 * * 0"
  }]
}
```
(Domingos 06:00 UTC = 03:00 hora UY.)

#### `email-templates.js`
- Templates condicionales con bloque de personalización.
- Template nuevo de notificación al admin con personalización destacada.

#### `mp-webhook.js`
- Sin cambios estructurales.

---

## ✅ Checklist de validaciones críticas

### Frontend (producto.html)
- [ ] Si toggle ON pero no hay items → no permite agregar al carrito.
- [ ] Si "Adelante/Interior/Atrás" elegida pero no hay archivo → no permite agregar.
- [ ] Si "Texto" elegida pero input vacío → no permite agregar.
- [ ] Si imagen pesa más del límite → toast error.
- [ ] Si imagen <500 px → bloqueo.
- [ ] Si imagen 500-799 px → warning (no bloquea).
- [ ] Si tipo de archivo no está permitido → toast error.
- [ ] Sticky CTA actualiza precio en vivo.
- [ ] Si producto no permite alguna modalidad → ese botón no aparece.
- [ ] Si producto no permite ninguna modalidad → bloque entero oculto + leyenda.
- [ ] Modal "Ver ejemplo" muestra fotos del color elegido prioritariamente.
- [ ] Si no hay fotos para un tipo → no aparece botón "Ver ejemplo".

### Frontend (carrito)
- [ ] Items con personalización distinta NO se agrupan.
- [ ] Cambio de cantidad funciona en items personalizados.
- [ ] Eliminar item personalizado borra correctamente.

### Frontend (checkout)
- [ ] Checkbox "no devolución" obligatorio si hay items personalizados.
- [ ] No se puede pagar sin marcarlo.
- [ ] Resumen muestra desglose: subtotal + personalización + envío = total.

### Backend
- [ ] Endpoint upload valida MIME real, no solo extensión.
- [ ] Endpoint upload limita peso según config global.
- [ ] URLs de imágenes son únicas (timestamp + random).
- [ ] Webhook MP no rompe con orden personalizada.

### Email
- [ ] Email al cliente muestra personalización (con links).
- [ ] Email al admin tiene links de descarga funcionales.
- [ ] Sin personalización → emails idénticos a los actuales (sin regresión).

### Admin — Configuración
- [ ] Cambios en config global se reflejan instantáneamente en producto.html.
- [ ] Cambios en toggles por producto se reflejan instantáneamente.
- [ ] Galería: subir / editar / borrar / reordenar fotos funciona.
- [ ] Multi-select de colores en cada foto funciona.

### Admin — Limpieza
- [ ] Panel muestra correctamente cantidad y peso de eliminables.
- [ ] Botón "Descargar ZIP" genera ZIP válido.
- [ ] Botón "Limpieza manual" pide confirmación.
- [ ] Tras limpieza, panel se actualiza sin recargar página.
- [ ] Cron automático loguea ejecución.
- [ ] Historial muestra últimas 5 ejecuciones.

### Admin — Pedidos con personalización
- [ ] Pedidos con personalización tienen ícono distintivo.
- [ ] Filtro "con personalización" funciona.
- [ ] Imágenes se pueden descargar individualmente.

---

## 📅 Plan por bloques (4 sesiones estimadas)

### 🟢 Sesión A — Frontend visual + Admin config global
**Tiempo:** 2-2.5 hs.

- Diseño y CSS del bloque de personalización en `producto.html`.
- Toggle abrir/cerrar.
- Botones de selección de items (4 opciones).
- Cálculo de precio en vivo + update del sticky CTA.
- Sub-panel "Config personalización" en Admin > Herramientas.
- Frontend lee config global desde Supabase.
- Validaciones de UX (sin upload real, placeholder).
- Toggles por producto en editor de productos.

**Resultado:** el bloque se ve y funciona visualmente, los toggles del admin funcionan, los datos aún no se persisten en pedidos.

### 🟡 Sesión B — Backend + persistencia + galería ejemplos
**Tiempo:** 2-2.5 hs.

- SQL: agregar columnas en `products`, `order_items`, `orders`.
- SQL: crear tablas `personalizacion_examples` y `cleanup_logs`.
- Crear 2 buckets en Supabase Storage + RLS.
- Endpoint `api/upload-personalizacion.js`.
- Modificar `api/checkout.js` para guardar personalización.
- Cart.js: persistencia en localStorage.
- Checkout.html: checkbox "no devolución".
- Admin: galería de ejemplos (subir/editar/borrar).
- Modal "Ver ejemplo" en frontend leyendo de la tabla.
- Filtrado por color elegido.

**Resultado:** se puede comprar con personalización end-to-end. La galería editorial está operativa.

### 🔵 Sesión C — Limpieza automática + admin polish
**Tiempo:** 1.5-2 hs.

- Endpoint `api/cleanup-personalizacion.js` (cron + manual).
- Endpoint `api/download-personalizacion-bulk.js`.
- Cron config en `vercel.json`.
- Sub-panel "Limpieza" en Admin > Herramientas.
- Historial de limpiezas.
- Filtro "con personalización" en lista de pedidos del admin.
- Ícono distintivo en pedidos personalizados.
- Detalle de pedido con descarga individual de imágenes.

**Resultado:** sistema de mantenimiento operativo. Admin con visibilidad total.

### 🟣 Sesión D — Emails + smoke test + polish final
**Tiempo:** 1-1.5 hs.

- Modificar templates de email (cliente + admin).
- Smoke test end-to-end completo:
  - Compra normal sin personalización (no rompió nada).
  - Compra con 1 personalización.
  - Compra con 4 personalizaciones (combinación máxima).
  - Compra de 2 unidades del mismo producto con personalizaciones distintas.
  - Limpieza manual + cron simulado.
- Documentar en `ESTADO.md` el cierre.
- Marcar este `PLAN-PERSONALIZACION.md` como ✅ implementado.

**Resultado:** feature en producción real, validado.

---

## 🤔 Preguntas de negocio — estado actual

### ✅ Confirmadas (no requieren acción)
1. **Precio por elemento:** $290.
2. **Opciones disponibles:** solo láser (sin grabado por calor).
3. **Tiempo extra de preparación:** +24 hs hábiles.
4. **Múltiples unidades con personalizaciones distintas:** items separados del carrito.
5. **Devoluciones:** los productos personalizados **no admiten devolución**. Mantienen garantía de fabricación de 60 días.
6. **Configuración por producto:** 4 toggles independientes (adelante / interior / atrás / texto).
7. **Configuración global desde admin:** sí, en Admin > Herramientas.
8. **Galería de ejemplos visual:** sí, con admin para subir.
9. **Filtrado de ejemplos por color:** sí.
10. **Tipos de archivo:** PNG, JPG, JPEG, SVG. Peso máx 5 MB. Mínimo 500×500 (bloqueo) / recomendado 800×800 (warning).
11. **Caracteres máximos en texto:** 40.
12. **Posicionamiento del grabado:** vía campo de "Indicaciones", sin editor visual.
13. **Copyright:** disclaimer al subir + derecho a cancelar.
14. **Limpieza automática:** cron semanal + botón manual con descarga ZIP previa.
15. **Plazos de retención:** 10 días huérfanas / 60 días post-entrega.
16. **Backup de imágenes:** descarga manual al ordenador del dueño (1 vez al año aprox).
17. **Aprobación previa por WhatsApp:** SÍ, paso opcional. Detalles a definir en Sesión D.
18. **Garantía en productos personalizados:** misma garantía estándar de 60 días para defectos de fabricación.

### 🟡 Pendientes — requieren prueba física con láser
1. **Tipografías disponibles** para grabado de texto. Probar 5-6 tipografías en cuero descartable, quedarse con 2-3. Hardcodeado una vez decidido.
2. **Threshold real de calidad de imagen.** Las cifras actuales (500/800 px) son tentativas. Calibrar con muestras físicas → ajustar desde Admin > Configuración.
3. **Foto stock para los modales "Ver ejemplo".** Las primeras 3-4 fotos se sacan con el láser ya operativo. Mientras tanto: usar fotos del competidor o stock como placeholder con disclaimer.
4. **Tiempo real de preparación.** Default 24 hs pero podría ser 48 hs según volumen. Ajustable desde Admin > Configuración.

### 🔵 Pendientes para Sesión D
1. **Detalles del flujo de aprobación WhatsApp:** ¿el admin cambia estado manualmente cuando aprueba? ¿es transparente para el cliente o ve el estado "Aprobando diseño"? Definir en Sesión D.

---

## ⚠️ Riesgos y mitigaciones

### Riesgo 1 — Uploads abusivos / huérfanos
**Mitigación:** sistema de limpieza automática (10 días). Adicional: rate-limit en backend (máximo 5 uploads por sesión IP).

### Riesgo 2 — Imagen con contenido inapropiado/copyright
**Mitigación:** disclaimer al subir + aprobación previa manual por el admin antes de proceder al láser. Reservarte el derecho de cancelar y reembolsar.

### Riesgo 3 — Cliente sube imagen baja calidad → grabado feo → reclamo
**Mitigación:** validación de calidad en vivo + warning visible. Aprobación previa por WhatsApp con mockup si genera duda. Términos: "calidad del grabado depende de la calidad de la imagen subida".

### Riesgo 4 — Cliente cambia de opinión post-pago
**Mitigación:** aclarar en email "para cambios escribinos por WhatsApp en las primeras 12 hs". Admin puede editar manualmente desde Supabase.

### Riesgo 5 — Regresión rompe pedidos sin personalización
**Mitigación:** campo `personalizacion` siempre nullable. Smoke test exhaustivo en Sesión D. Plan de rollback.

### Riesgo 6 — Storage del plan Free se llena
**Mitigación:** sistema de limpieza automática + descarga manual al ordenador. Si supera 800 MB de uso → upgrade a Pro ($25/mes).

### Riesgo 7 — Cron de Vercel falla silenciosamente
**Mitigación:** loguear cada ejecución en `cleanup_logs`. Admin ve en panel cuándo fue la última. Si pasa más de 14 días sin log → warning visible.

### Riesgo 8 — Imágenes de ejemplo (galería) muy pesadas
**Mitigación:** Cloudinary procesa todas las imágenes del sitio (Sesión 24). Aplica al bucket nuevo automáticamente.

---

## 🔄 Plan de rollback

| Bloque | Cómo revertir |
|---|---|
| Bloque visual en producto.html | Revertir el commit. Las columnas de DB pueden quedar (no afectan). |
| Endpoint upload-personalizacion | Borrar archivo. Vercel re-deploya. |
| Endpoint cleanup-personalizacion | Borrar archivo + sacar bloque "crons" de `vercel.json`. |
| Cambios en checkout.js | Revertir desde Git. Asegurar `personalizacion` nullable. |
| Buckets Supabase Storage | Vaciar y borrar. |
| Tablas nuevas | `DROP TABLE` si querés limpiar; no es necesario para rollback. |
| Cambios en admin | Revertir desde Git. |
| Templates de email | Revertir desde Git. **Probar primero** que el bloque condicional no rompa emails existentes. |
| Columnas SQL agregadas | `ALTER TABLE … DROP COLUMN …` solo si querés limpiar. |

---

## 📂 Archivos que se van a tocar

### Frontend
- `producto.html` (CSS + HTML + JS de la lógica)
- `cart.js`
- `checkout.html`
- `checkout.js`
- `admin.html` (3 sub-paneles nuevos en Herramientas + editor de productos)
- `founder-admin.js` (lógica de admin)

### Backend
- `api/checkout.js`
- `api/upload-personalizacion.js` (NUEVO)
- `api/cleanup-personalizacion.js` (NUEVO)
- `api/download-personalizacion-bulk.js` (NUEVO)
- `api/admin.js` (~10 actions nuevas)
- `email-templates.js`
- `email.js` (mínimos)

### Documentación
- `ESTADO.md` (agregar sesión correspondiente al final)
- `PLAN-PERSONALIZACION.md` (este archivo) → marcar como ✅ implementado

### Configuración
- `vercel.json` (agregar bloque `crons`)

### Supabase
- 4 ALTER TABLE en `products`.
- 2 ALTER TABLE en `orders`.
- 1 ALTER TABLE en `order_items`.
- 2 CREATE TABLE (`personalizacion_examples`, `cleanup_logs`).
- 1 INSERT INTO `site_settings`.
- 2 CREATE BUCKET + RLS.

### Total estimado
**~14 archivos** modificados/creados + cambios SQL. Cambio mediano-grande pero **bien aislado** (no toca el flujo de productos sin personalización).

---

## 🎬 Próximos pasos (estado actualizado post Sesión 28)

### ✅ Completado (Sesiones 28A + 28B)

1. **Bloque A — Frontend visual + admin config global:** entregado, validado por usuario.
2. **Bloque B — Backend + persistencia + galería:** entregado, validado por usuario.
3. **Hotfixes operativos:** dos rondas de fix por bug de grants en Supabase. Feature 100% funcional.
4. **Estado en producción:** desplegado, master switch apagado por default, listo para activarse.

### ⏳ Pendiente (Sesión C + D, opcionales)

**Sesión C — Operación diaria (cuando llegue el láser):**
- `api/cleanup-personalizacion.js` + Vercel Crons (semanal): retención 10 días para huérfanas, 60 días post-entrega para usadas.
- Botón "Descargar ZIP" en cada pedido del admin: agrupa todas las imágenes para enviar al taller del láser.
- UI en admin de pedidos para visualizar las personalizaciones de cada item (hoy se persisten en JSONB pero no hay vista bonita).

**Sesión D — Pulido final:**
- Templates de email actualizados con info de personalización (extra de grabado en el desglose, tags por item).
- Smoke test end-to-end real con un pedido completo en producción (compra → checkout → MP → email → admin).
- Documentación operativa: guía de uso del admin para gestionar personalizaciones en pedidos.

### 🎯 Recomendación de orden

1. **Conseguir el láser físicamente** (paso pendiente externo).
2. **Activar el feature en admin** y subir 4-6 fotos de ejemplo a la galería (2 por tipo de grabado).
3. **Hacer 5-10 pedidos reales con personalización** durante las primeras semanas.
4. **Recién entonces encarar Sesión C+D** con información concreta de uso (qué problemas operativos aparecen, qué necesita ver el admin, qué falta en los emails). Iterar con datos > diseñar a priori.

---

## 📝 Notas finales

Este documento se complementa con `ESTADO.md`. Cuando se retome el feature para Sesión C/D, el mensaje al inicio de la sesión sería:

> *"Retomamos el feature de personalización láser para Sesión C (operación). Leé `PLAN-PERSONALIZACION.md` y `ESTADO.md` Sesión 28. Vamos a implementar el cron de limpieza, descarga ZIP, y UI de admin para ver personalizaciones de pedidos."*

Cualquier cambio en las decisiones tomadas acá debe **actualizarse en este documento antes de codear**, así no perdemos coherencia entre sesiones.

---

## 📜 Historial de cambios de este documento

| Versión | Fecha | Cambios |
|---|---|---|
| v1 | Sesión 27 (08/05) | Plan inicial — feature básico con 3 modalidades. |
| v2 | Sesión 27 (08/05) | Agregado: configuración global desde Admin > Herramientas, galería de ejemplos visual con filtrado por color, sistema de limpieza automática (cron + manual + descarga ZIP), 4 modalidades de grabado (sumamos interior), config por producto con 4 toggles. Plan extendido a 4 sesiones. |
| **v3** | **Sesión 28 (08/05)** | **IMPLEMENTACIÓN COMPLETA Bloques A + B. Cambios incrementales sobre el plan v2:** (1) Galería de ejemplos extendida con asociación a **modelos** además de colores (filtrado en cascada modelo → color → fallback). (2) Toggles `permite_grabado_*` también en editor individual de productos (no solo en panel global). (3) Items con misma personalización se combinan en qty, items con personalizaciones distintas quedan separados (helper `personalizacionFingerprint`). (4) Hotfixes operativos por bug de grants de service_role en Supabase — documentado en `ESTADO.md` Sesión 28 como lección crítica para futuras tablas. (5) **Pendientes movidos a Sesión C+D opcionales y NO bloqueantes** — el feature ya funciona end-to-end sin esos refinamientos. |

---

**Plan v3 — Personalización con grabado láser. Bloques A+B implementados, C+D opcionales pendientes.**
