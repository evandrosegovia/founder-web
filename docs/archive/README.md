# Founder.uy

> E-commerce de billeteras y tarjeteros premium con protección RFID — Uruguay.
> [www.founder.uy](https://www.founder.uy) · [@founder.uy](https://instagram.com/founder.uy)

---

## Stack

- **Frontend:** HTML/CSS/JS vanilla — sin framework, sin build step
- **Hosting:** [Vercel](https://vercel.com) (estático + serverless functions)
- **Base de datos:** [Supabase](https://supabase.com) (Postgres + Storage + RLS)
- **Pagos:** [Mercado Pago](https://www.mercadopago.com.uy) Checkout Pro (Uruguay)
- **Emails transaccionales:** [Resend](https://resend.com)
- **CDN de imágenes:** [Cloudinary](https://cloudinary.com) (fetch mode)
- **Tracking:** Meta Pixel + CAPI deduplicado

---

## Estructura del repositorio

```
.
├── *.html                  Páginas públicas (index, producto, checkout, etc.)
├── admin.html              Panel administrativo (protegido por contraseña)
├── components/             JS compartido entre páginas (header, footer, cart, etc.)
├── api/                    Endpoints serverless (Vercel)
│   ├── _lib/               Wrappers compartidos (supabase, mercadopago, email, etc.)
│   ├── checkout.js         POST: validate_coupon, create_order
│   ├── seguimiento.js      POST: buscar pedido por numero + email
│   ├── admin.js            POST: 23 acciones del panel admin (auth requerida)
│   ├── mp-webhook.js       Webhook de Mercado Pago (validación HMAC)
│   └── ...                 Otros endpoints (cleanup, uploads, sitemap, etc.)
├── vercel.json             Config de cron, headers de seguridad, rewrites
└── package.json            Una sola dependencia: @supabase/supabase-js
```

---

## Variables de entorno requeridas

Las siguientes variables están configuradas en el dashboard de Vercel.
**No se versionan ni se exponen en el frontend.**

| Variable | Propósito |
|----------|-----------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service-role (solo backend) |
| `ADMIN_PASSWORD` | Contraseña del panel admin |
| `MP_ACCESS_TOKEN` | Token de Mercado Pago (producción) |
| `MP_WEBHOOK_SECRET` | Secret para validar firmas HMAC del webhook |
| `RESEND_API_KEY` | API key de Resend para emails |
| `META_PIXEL_ID` | ID del Meta Pixel |
| `META_CAPI_TOKEN` | Token de Meta Conversions API |
| `META_TEST_EVENT_CODE` | (Opcional) Para debug de eventos en Test Events |

---

## Seguridad

- **CORS** restringido a `https://www.founder.uy` y `https://founder.uy` (whitelist dinámica).
- **HSTS** (`max-age=2 años, preload`), **X-Frame-Options**, **X-Content-Type-Options**, **Referrer-Policy** y **Permissions-Policy** aplicados globalmente.
- **Webhook MP**: validación HMAC-SHA256 con comparación en tiempo constante (`timingSafeEqual`).
- **Panel admin**: contraseña validada server-side con `timingSafeEqual`, sin almacenamiento en frontend más allá de `sessionStorage`.
- **Validación de precios server-side** en `/api/checkout` para evitar manipulación desde el cliente.
- **Mercado Pago** absorbe el cumplimiento PCI-DSS: el sitio nunca procesa ni almacena datos de tarjeta.
- **PII en logs**: emails ofuscados (`ju***@gmail.com`) para cumplimiento GDPR/LGPD.

---

## Despliegue

El despliegue es automático: cualquier push a `main` dispara un build en Vercel.

- **Producción:** [www.founder.uy](https://www.founder.uy)
- **Logs y monitoreo:** dashboard de Vercel
- **Cron jobs:** definidos en `vercel.json` (limpieza semanal de uploads de personalización)

---

## Estado del proyecto

Documentación interna y bitácora de sesiones en `ESTADO.md` (auditoría histórica de decisiones técnicas).

---

**© Founder.uy** — Todos los derechos reservados.
