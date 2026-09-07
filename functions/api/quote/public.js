// Public, no-login read of a single quote by id — the link in the "tu
// cotización está lista" email needs to work for customers who don't (yet)
// have an account, same as /api/quote/pay already does with no auth check.
// The quote's own UUID is the de-facto bearer token (122 bits, unguessable),
// matching the security model already used by the payment endpoint.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: "Falta id" }), { status: 400 });
  }

  const sbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

  const quoteRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quotes?id=eq.${id}&select=*`, { headers: sbHeaders });
  const [quote] = await quoteRes.json();
  if (!quote) {
    return new Response(JSON.stringify({ ok: false, error: "Cotización no encontrada" }), { status: 404 });
  }

  const itemsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_b2b_quote_items?quote_id=eq.${id}&select=product_name,brand,variant,quantity,unit_price`,
    { headers: sbHeaders }
  );
  const items = await itemsRes.json();

  return new Response(JSON.stringify({ ok: true, quote, items }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
