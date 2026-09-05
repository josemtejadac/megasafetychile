// Flow redirects the customer's browser back via a POST to this path with
// `token` in the form body. Static HTML can't read a POST body, so this
// function catches it and redirects to the same page as a GET with the
// token in the query string, where pago-resultado.html's JS can read it.
export async function onRequestPost({ request }) {
  const form = await request.formData().catch(() => null);
  const token = form ? form.get("token") : null;
  const url = new URL("/pago-resultado.html", request.url);
  if (token) url.searchParams.set("token", token);
  return Response.redirect(url.toString(), 302);
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const dest = new URL("/pago-resultado.html", request.url);
  const token = url.searchParams.get("token");
  if (token) dest.searchParams.set("token", token);
  return Response.redirect(dest.toString(), 302);
}
