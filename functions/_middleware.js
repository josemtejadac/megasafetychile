// "Coming soon" gate for the public site. Off by default (COMING_SOON env var
// unset/not "true") — the real site is always visible until explicitly enabled.
// When enabled, every visitor sees the coming-soon page UNLESS they carry the
// preview cookie, which is set by visiting /preview?key=<PREVIEW_KEY>.

const PREVIEW_COOKIE = "msc_preview";

const COMING_SOON_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mega Safety Chile</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(120% 140% at 100% 0%, #16305a 0%, #0b1f3a 55%, #071426 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    color: #fff;
    text-align: center;
    padding: 24px;
  }
  .wrap { max-width: 560px; }
  .brand { font-weight: 800; font-size: 1.8rem; letter-spacing: 0.02em; margin-bottom: 28px; }
  .brand .accent { color: #f5b400; }
  .badge {
    width: 90px; height: 90px; border-radius: 50%;
    background: rgba(245,180,0,0.15); color: #f5b400;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 24px;
  }
  h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); margin: 0 0 14px; }
  p { color: #c7d1e3; font-size: 1.05rem; line-height: 1.6; margin: 0 0 32px; }
  a.btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: #25d366; color: #fff; text-decoration: none;
    padding: 12px 24px; border-radius: 999px; font-weight: 700; font-size: 0.95rem;
  }
  .footer-credit { margin-top: 48px; font-size: 0.78rem; color: #6f80a0; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">MEGA <span class="accent">SAFETY</span> CHILE</div>
    <div class="badge">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 6v6c0 5 3.8 9 9 10 5.2-1 9-5 9-10V6l-9-4Z"/><path d="m9 12 2 2 4-4"/></svg>
    </div>
    <h1>Estamos preparando todo</h1>
    <p>Nuestro sitio de seguridad industrial, herramientas y equipos estará disponible muy pronto. Mientras tanto, escríbenos por WhatsApp.</p>
    <a class="btn" href="https://wa.me/56983061338" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.35-.5.05-1.03.24-3.46-.72-2.92-1.15-4.79-4.13-4.94-4.32-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.08.17-.2.71-.83.9-1.11.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.29.15.48.22.55.34.07.13.07.72-.17 1.4Z"/></svg>
      WhatsApp
    </a>
    <p class="footer-credit">Página realizada por Spotgo Tecnología SpA</p>
  </div>
</body>
</html>`;

export async function onRequest(context) {
  const { request, next, env } = context;

  if (env.COMING_SOON !== "true") {
    return next();
  }

  const url = new URL(request.url);

  // Never gate API routes — quote submissions, staff login, image uploads,
  // Flow webhooks, etc. must keep working regardless of the coming-soon page.
  if (url.pathname.startsWith("/api/")) {
    return next();
  }

  // Never gate static assets — images, CSS, JS, fonts. These are hotlinked
  // from outside the site too (e.g. the logo in transactional emails), so
  // they must load with no preview cookie present.
  if (url.pathname.startsWith("/assets/") || /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|pdf)$/i.test(url.pathname)) {
    return next();
  }

  // Visiting /preview?key=... with the right key sets a cookie and redirects home.
  if (url.pathname === "/preview") {
    const key = url.searchParams.get("key");
    if (env.PREVIEW_KEY && key === env.PREVIEW_KEY) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": `${PREVIEW_COOKIE}=${env.PREVIEW_KEY}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`,
        },
      });
    }
    return new Response("Clave inválida", { status: 403 });
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const hasPreview = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .includes(`${PREVIEW_COOKIE}=${env.PREVIEW_KEY}`);

  if (hasPreview) {
    return next();
  }

  return new Response(COMING_SOON_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
