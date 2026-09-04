# Mega Safety Chile

Sitio web de Mega Safety Chile — seguridad industrial, herramientas, soldadura,
abrasivos, señalización vial, bloqueo LOTO, iluminación y ropa de trabajo.

Frontend estático (HTML/CSS/JS, sin build) + Cloudflare Pages Functions para
el portal B2B, desplegado en Cloudflare Pages.

## Estructura

- `index.html`, `styles.css`, `script.js` — landing pública.
- `compra-empresa.html`, `compra-empresa.css`, `compra-empresa.js` — portal
  B2B "Compra Empresa" (RFQ: catálogo → cotización → formulario → confirmación).
  El catálogo se lee en vivo desde Supabase (tabla `megasafety_products`);
  `assets/data/productos-b2b.json` solo se usa como respaldo si Supabase no responde.
- `admin.html`, `admin.css`, `admin.js` — panel de administración (`/admin.html`,
  no está enlazado desde el sitio público). Login con Supabase Auth, CRUD completo
  de `megasafety_products` (precio vacío = "Solicitar cotización"). Acceso
  restringido a los `user_id` listados en `megasafety_admins`.
- `functions/api/quote/submit.js` — recibe la solicitud de cotización B2B,
  la guarda en Supabase, genera el correlativo `MS-XXXXXX` y envía el email.
- `functions/api/flow/create-payment.js` / `confirm.js` — integración con
  Flow (pagos), lista pero inactiva hasta configurar las credenciales.
- `functions/_lib/` — helpers de Supabase, email (Resend) y Flow.

## Desarrollo local

`index.html` y `compra-empresa.html` se pueden abrir directo en el navegador
para revisar diseño, pero las funciones de `/functions` (envío de
cotizaciones, Flow) solo corren desplegadas en Cloudflare Pages o con
`wrangler pages dev`.

## Variables de entorno (Cloudflare Pages → Settings → Environment variables)

| Variable | Requerida para | Valor |
|---|---|---|
| `SUPABASE_URL` | Guardar cotizaciones B2B | `https://wiuuzsiiaagqldtxfouj.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Guardar cotizaciones B2B | Service role key del proyecto Supabase "Proyectos varios" (Settings → API) — **secreta** |
| `RESEND_API_KEY` | Enviar email de notificación | API key de [resend.com](https://resend.com) — **secreta** |
| `RFQ_NOTIFY_EMAIL` | Enviar email de notificación | `contacto@megasafetychile.cl` |
| `RFQ_FROM_EMAIL` | Enviar email de notificación | Remitente verificado en Resend (opcional, tiene default) |
| `FLOW_API_KEY` | Pagos con Flow (fase 2) | De tu cuenta Flow — **secreta** |
| `FLOW_SECRET_KEY` | Pagos con Flow (fase 2) | De tu cuenta Flow — **secreta** |
| `FLOW_ENV` | Pagos con Flow (fase 2) | `sandbox` mientras se prueba, `production` al lanzar |

Sin `SUPABASE_*` configuradas, el envío de cotizaciones falla. Sin
`RESEND_API_KEY`, la cotización igual se guarda en Supabase pero no se
envía el email (se marca `email_sent: false`). Sin `FLOW_*`, los endpoints
de pago responden 501 (aún no configurado) — no rompen nada del resto del sitio.

## Base de datos (Supabase)

Proyecto: **Proyectos varios** (`wiuuzsiiaagqldtxfouj`), tablas con prefijo
`megasafety_` para no chocar con otros proyectos que comparten esa base:

- `megasafety_b2b_quotes` — una fila por solicitud de cotización.
- `megasafety_b2b_quote_items` — productos y cantidades de cada solicitud.
- `megasafety_products` — catálogo (precio `null` = "Solicitar cotización").
  Editable desde `/admin.html` o directo en Supabase.
- `megasafety_admins` — `user_id` (de `auth.users`) con acceso al panel admin.

## Deploy

- **Producción:** rama `main`, deploy automático vía Cloudflare Pages.
- **Build command:** ninguno.
- **Build output directory:** `/` (raíz del repo).
