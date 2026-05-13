# 🛠️ Sesión 30 — Guía de aplicación

**Fecha:** Sesión 30  
**Objetivo:** Aplicar 9 fixes totales para dejar el sitio en estado óptimo de salud y seguridad.  
**Tiempo estimado:** 15-20 minutos haciendo todo desde GitHub web.

---

## 📋 Qué se está cambiando — resumen ejecutivo

### Bloque A — Auditoría de seguridad (6 fixes)

| # | Severidad | Fix | Archivos |
|---|-----------|-----|----------|
| C-1 | 🔴 Crítico | Validar precios server-side (anti-manipulación) | `api/checkout.js` |
| A-1 | 🟠 Alto | Headers de seguridad HTTP (HSTS, X-Frame, etc.) | `vercel.json` |
| A-3 | 🟠 Alto | CORS restringido a founder.uy (anti-abuso externo) | `api/_lib/supabase.js`, `api/cleanup-personalizacion.js`, `api/download-personalizacion-bulk.js`, `api/mp-webhook.js` |
| M-1 | 🟡 Medio | Ofuscar emails en logs (GDPR/LGPD) | `api/_lib/email.js` |
| M-3 | 🟡 Medio | Mensaje claro de log en webhook | `api/_lib/mercadopago.js` |
| B-1 | 🟢 Bajo | HMAC con `timingSafeEqual` (hardening) | `api/_lib/mercadopago.js` |

### Bloque B — Auditoría de salud (3 fixes)

| # | Severidad | Fix | Archivos |
|---|-----------|-----|----------|
| H-1 | 🔴 Alto | Pinear Supabase a versión exacta (anti-regresión Sesión 27) | `package.json` |
| H-2 | 🟠 Medio | Arreglar HTML inválido en index.html (falta `</head>` + `</div>` huérfano) | `index.html` |
| H-3 | 🟡 Bajo | README profesional (estaba vacío) | `README.md` |

**Total: 11 archivos a subir.**

---

## 📦 Mapeo completo de archivos

```
outputs/
├── README.md                                    → raíz del repo
├── package.json                                 → raíz del repo
├── vercel.json                                  → raíz del repo
├── index.html                                   → raíz del repo
└── api/
    ├── checkout.js                              → api/checkout.js
    ├── cleanup-personalizacion.js               → api/cleanup-personalizacion.js
    ├── download-personalizacion-bulk.js         → api/download-personalizacion-bulk.js
    ├── mp-webhook.js                            → api/mp-webhook.js
    └── _lib/
        ├── supabase.js                          → api/_lib/supabase.js
        ├── email.js                             → api/_lib/email.js
        └── mercadopago.js                       → api/_lib/mercadopago.js
```

---

## 🚀 Paso a paso (desde el navegador, sin terminal)

### Paso 1 — Abrir tu repositorio en GitHub
1. Andá a `github.com/<tu-usuario>/founder-web`
2. Asegurate de estar en la rama `main`

### Paso 2 — Procedimiento estándar para cada archivo

Para cada archivo de la lista de abajo, repetí estos pasos:

1. En GitHub, navegá hasta el archivo en su ruta exacta
2. Click en el **lápiz** ✏️ (Edit this file) arriba a la derecha
3. **Borrá todo el contenido** del editor (Ctrl/Cmd+A → Delete)
4. **Copiá** el contenido del archivo correspondiente que te entrego
5. **Pegá** en el editor de GitHub
6. Al pie de la página → caja **"Commit changes"**:
   - **Mensaje de commit:** el que aparece más abajo en cada caso
   - Asegurate que esté en la rama `main`
   - Click **"Commit changes"**

> **Tip importante:** los archivos `README.md` (NUEVO, hay que crearlo) y `index.html` (existe) usan flujos ligeramente diferentes — los explico abajo.

### Paso 3 — Orden recomendado de subida

Subir en este orden minimiza el riesgo de que un deploy intermedio quede con código mezclado. Si seguís este orden, **cada deploy es internamente consistente**.

#### 🔵 Grupo 1 — Sin dependencias entre archivos (los podés subir en cualquier orden):

| # | Archivo | Mensaje de commit sugerido |
|---|---------|---------------------------|
| 1 | `README.md` *(crear desde cero)* | `docs: agregar README profesional con stack y seguridad` |
| 2 | `package.json` | `deps: pinear @supabase/supabase-js a versión exacta 2.105.4 (lección Sesión 27)` |
| 3 | `index.html` | `fix(html): agregar </head> faltante y eliminar </div> huérfano` |
| 4 | `vercel.json` | `security: agregar headers HTTP de seguridad (HSTS, X-Frame, CSP-base)` |

#### 🟠 Grupo 2 — Wrappers compartidos (subir antes que los handlers):

| # | Archivo | Mensaje de commit sugerido |
|---|---------|---------------------------|
| 5 | `api/_lib/supabase.js` | `security(supabase.js): CORS dinámico con whitelist de orígenes` |
| 6 | `api/_lib/email.js` | `security(email.js): ofuscar emails en logs (GDPR)` |
| 7 | `api/_lib/mercadopago.js` | `security(mercadopago.js): timingSafeEqual en HMAC + log claro` |

#### 🟢 Grupo 3 — Handlers (usan los wrappers de arriba):

| # | Archivo | Mensaje de commit sugerido |
|---|---------|---------------------------|
| 8 | `api/checkout.js` | `security(checkout.js): validar precios y stock server-side (anti-manipulación)` |
| 9 | `api/cleanup-personalizacion.js` | `security(cleanup): CORS dinámico unificado` |
| 10 | `api/download-personalizacion-bulk.js` | `security(download-bulk): CORS dinámico unificado` |
| 11 | `api/mp-webhook.js` | `security(mp-webhook): CORS preflight restringido a null` |

### Paso 4 — Cómo crear el README.md (es nuevo, no existe)

1. En la raíz del repo, click en **"Add file"** → **"Create new file"**
2. En el campo de nombre, escribí: `README.md`
3. Pegá el contenido del `README.md` que te entrego
4. Commit con el mensaje sugerido arriba

> **Si ya existe un `README.md`** (con la línea `# founder-web` solamente), entonces seguí el flujo estándar de editar.

### Paso 5 — Esperar el deploy automático
1. Cada commit dispara un deploy en Vercel
2. Andá a tu dashboard de Vercel (`vercel.com`)
3. Esperá que el deploy del último commit pase a ✅ verde
4. Tiempo estimado: 1-2 minutos por deploy

> **Tip:** podés hacer los 11 commits de corrido sin esperar entre cada uno. Vercel solo deployea el último (los anteriores se descartan como "Stale", igual que te pasó en Sesión 29).

---

## ✅ Verificación post-deploy

Después de que Vercel marca el último deploy como verde:

### 5.1 — Smoke test funcional (el sitio anda igual)
- ✅ Abrí `https://www.founder.uy` → debería cargar normal
- ✅ Abrí un producto → seleccioná color → "Agregar al carrito" → debería funcionar
- ✅ Andá a checkout → completá un pedido de prueba con transferencia → debería confirmarse normal
- ✅ Probá el admin (`founder.uy/admin.html`) → login + ver pedidos → debería andar igual

### 5.2 — Verificación de headers de seguridad (opcional)
1. Andá a [securityheaders.com](https://securityheaders.com)
2. Pegá `https://www.founder.uy`
3. **Antes:** score F  
   **Después esperado:** **A** o **A+** (mejor score visible al instante)

### 5.3 — Verificación de HTML válido
1. Andá a [validator.w3.org/nu](https://validator.w3.org/nu/?doc=https%3A%2F%2Fwww.founder.uy%2F)
2. **Antes:** 2 errores (sin `</head>` + `</div>` huérfano)
3. **Después esperado:** **0 errores estructurales**

### 5.4 — Verificación de CORS
Para confirmar que el CORS está cerrado:
1. Abrí Chrome DevTools (F12) en cualquier OTRO sitio (ej: google.com)
2. Andá a la pestaña Console
3. Pegá:
```js
fetch('https://www.founder.uy/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'validate_coupon', codigo: 'TEST' })
}).then(r => r.text()).then(t => console.log('respuesta:', t)).catch(e => console.log('CORS error:', e.message));
```
4. **Esperado:** La consola muestra `CORS error: Failed to fetch` (el navegador bloquea por CORS).

---

## 🛡️ Qué quedó protegido tras estos cambios

### Antes vs Después — Seguridad

| Vulnerabilidad | Antes | Después |
|----------------|-------|---------|
| Cliente manipula precio en localStorage → paga $1 | 🔴 Vulnerable | ✅ Server rechaza con `price_mismatch` |
| Cliente compra producto inactivo | 🔴 Vulnerable | ✅ Server rechaza con `product_inactive` |
| Cliente compra color `sin_stock` | 🔴 Vulnerable | ✅ Server rechaza con `color_sin_stock` |
| Cliente pide 9999 unidades | 🔴 Vulnerable | ✅ Server rechaza con `invalid_quantity` |
| Sitio embebible en iframe (clickjacking) | 🔴 Vulnerable | ✅ X-Frame-Options: SAMEORIGIN |
| Primera visita en HTTP no se promueve a HTTPS | 🔴 Vulnerable | ✅ HSTS 2 años con preload |
| MIME-sniffing en respuestas API | 🔴 Vulnerable | ✅ X-Content-Type-Options: nosniff |
| Sitio externo abusa de tu API vía CORS | 🔴 Vulnerable | ✅ CORS limitado a founder.uy |
| Email completo del cliente en logs Vercel (GDPR) | 🟡 PII expuesta | ✅ Ofuscado a `ju***@gmail.com` |
| Timing attack sobre HMAC del webhook MP | 🟢 Teórico | ✅ timingSafeEqual |

### Antes vs Después — Salud del proyecto

| Hallazgo | Antes | Después |
|----------|-------|---------|
| Dependencia Supabase con `^` (auto-update riesgoso) | 🔴 Vulnerable a regresión Sesión 27 | ✅ Pineada a `2.105.4` exacto |
| HTML inválido en index.html (falta `</head>`) | 🟠 Navegador auto-arregla | ✅ Estructura correcta |
| HTML inválido en index.html (`</div>` huérfano) | 🟠 Navegador auto-arregla | ✅ Balance perfecto |
| README vacío | 🟡 Repo no-profesional | ✅ README completo |

---

## 🚨 Si algo sale mal — Plan de rollback

Si tras subir los cambios **algo del sitio deja de funcionar**:

### Opción A — Rollback inmediato (1 minuto, recomendado)
1. Andá a tu dashboard de Vercel
2. Click en "Deployments"
3. Buscá el deploy ANTERIOR (verde, antes de los cambios)
4. Click los `…` a la derecha → **Promote to Production**
5. Sitio vuelve al estado previo al instante

### Opción B — Revertir commits desde GitHub
1. Andá al repo → Commits
2. Encontrá el primer commit de Sesión 30
3. Click en el commit → tres puntitos → **Revert**

### Cómo me lo reportás
Si hay un error, mandame **exactamente**:
- Captura del error que ves
- Qué intentaste hacer (compra, login admin, etc.)
- Si tenés acceso a Vercel logs, copiame el último error visible

---

## 📌 Lo que NO se modificó en esta sesión

- ✅ Schema de Supabase (cero cambios SQL)
- ✅ Frontend público distinto a `index.html` (`producto.html`, `checkout.html`, etc.)
- ✅ Frontend admin (`admin.html`, `founder-admin.js`)
- ✅ Frontend checkout (`founder-checkout.js`, `cart.js`)
- ✅ Tabla `products`, `orders`, `order_items`, `coupons`, etc.
- ✅ Variables de entorno en Vercel
- ✅ Endpoints `admin.js`, `seguimiento.js`, `sitemap.js`, `upload-personalizacion.js` (no requirieron tocarse, heredan CORS dinámico del wrapper)

---

## ⏭️ Pendientes para futuras sesiones

Quedan pendientes documentados (NO aplicados hoy porque requieren más tiempo o infraestructura externa):

| Pendiente | Por qué no se hizo hoy | Esfuerzo cuando se haga |
|-----------|-------------------------|------------------------|
| **C-2 Rate limiting** | Requiere habilitar Vercel KV (storage extra) | 1.5–2 hs |
| **A-2 JWT para admin** | Refactor de sesión completo en frontend admin | 2 hs |
| **CSP (Content Security Policy)** | Requiere auditar inline scripts, fonts, imágenes externas | 1 hs |
| **Smoke test personalización láser end-to-end** | Requiere láser físico operativo (sesión 30 original) | Cuando llegue el láser |

**Próxima sesión sugerida:** rate limiting (C-2) — la pieza que faltaría para blindar del todo el checkout combinado con la validación de precios que aplicamos hoy.

---

**Generado en Sesión 30 — Auditoría completa (salud + seguridad) e-commerce post-Sesión 29.**
