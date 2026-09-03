// Integración con Flow (flow.cl) — pasarela de pago chilena.
// Requiere las env vars FLOW_API_KEY y FLOW_SECRET_KEY (Settings > Environment
// variables en Cloudflare Pages). FLOW_ENV = "sandbox" | "production" (default sandbox).

function baseUrl(env) {
  return env.FLOW_ENV === "production" ? "https://www.flow.cl/api" : "https://sandbox.flow.cl/api";
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Flow firma: ordena los params alfabéticamente por key, concatena key+value
// sin separadores, y firma ese string con HMAC-SHA256 usando el secretKey.
export async function signParams(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  return hmacSha256Hex(secretKey, toSign);
}

export function isFlowConfigured(env) {
  return Boolean(env.FLOW_API_KEY && env.FLOW_SECRET_KEY);
}

async function flowRequest(env, path, params, method = "POST") {
  const signed = { ...params, s: await signParams(params, env.FLOW_SECRET_KEY) };
  const body = new URLSearchParams(signed);

  const url = method === "GET" ? `${baseUrl(env)}${path}?${body.toString()}` : `${baseUrl(env)}${path}`;
  const res = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? body.toString() : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Flow API error: ${data.message || res.status}`);
  }
  return data;
}

// Crea una orden de pago. `order` = { commerceOrder, subject, amount, email, urlConfirmation, urlReturn }
export async function createPaymentOrder(env, order) {
  const params = {
    apiKey: env.FLOW_API_KEY,
    commerceOrder: order.commerceOrder,
    subject: order.subject,
    currency: "CLP",
    amount: order.amount,
    email: order.email,
    urlConfirmation: order.urlConfirmation,
    urlReturn: order.urlReturn,
  };
  return flowRequest(env, "/payment/create", params, "POST");
}

// Consulta el estado de un pago por token (usado en la confirmación).
export async function getPaymentStatus(env, token) {
  const params = { apiKey: env.FLOW_API_KEY, token };
  return flowRequest(env, "/payment/getStatus", params, "GET");
}
