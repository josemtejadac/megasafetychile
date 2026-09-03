const REST_URL = (env, path) => `${env.SUPABASE_URL}/rest/v1/${path}`;

function headers(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function insertQuote(env, quote) {
  const res = await fetch(REST_URL(env, "megasafety_b2b_quotes"), {
    method: "POST",
    headers: headers(env, { Prefer: "return=representation" }),
    body: JSON.stringify([quote]),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert quote failed: ${res.status} ${await res.text()}`);
  }
  const [row] = await res.json();
  return row;
}

export async function insertQuoteItems(env, items) {
  if (!items.length) return;
  const res = await fetch(REST_URL(env, "megasafety_b2b_quote_items"), {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify(items),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert items failed: ${res.status} ${await res.text()}`);
  }
}

export async function markEmailSent(env, quoteId) {
  await fetch(REST_URL(env, `megasafety_b2b_quotes?id=eq.${quoteId}`), {
    method: "PATCH",
    headers: headers(env),
    body: JSON.stringify({ email_sent: true }),
  });
}
