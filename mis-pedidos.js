const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
// Same storage key as account.js / compra-empresa.js (customer pages) so the
// customer's login persists across them, separate from the staff panel.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "msc_customer_auth" },
});

// Forces a session refresh if the cached token is at or past expiry, so a
// long-idle tab doesn't send a stale token to the PDF/pay endpoints.
async function getFreshAccessToken() {
  let { data: { session: s } } = await sbClient.auth.getSession();
  const expiresInMs = s ? s.expires_at * 1000 - Date.now() : -1;
  if (!s || expiresInMs < 60000) {
    const { data } = await sbClient.auth.refreshSession();
    s = data.session;
  }
  return s?.access_token || null;
}

const CATEGORY_LABELS = {
  "cat-seguridad-industrial": "Seguridad industrial",
  "cat-herramientas": "Herramientas y equipos",
  "cat-abrasivos": "Abrasivos y discos",
  "cat-soldadura": "Soldadura",
  "cat-vial": "Seguridad vial y señalización",
  "cat-loto": "Bloqueo L.O.T.O.",
  "cat-iluminacion": "Iluminación industrial",
  "cat-ropa": "Ropa de trabajo y corporativa",
  "cat-izaje": "Izaje de carga",
};

async function loadOrders() {
  const { data: { session } } = await sbClient.auth.getSession();
  const loggedOutView = document.getElementById("logged-out-view");
  const ordersView = document.getElementById("orders-view");

  if (!session) {
    loggedOutView.hidden = false;
    ordersView.hidden = true;
    return;
  }
  loggedOutView.hidden = true;
  ordersView.hidden = false;

  const { data: quotes, error } = await sbClient
    .from("megasafety_b2b_quotes")
    .select("*, megasafety_b2b_quote_items(*)")
    .order("created_at", { ascending: false });

  const list = document.getElementById("orders-list");
  const empty = document.getElementById("orders-empty");
  list.innerHTML = "";

  if (error || !quotes || quotes.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const STATUS_LABELS = {
    pendiente: "Recibida, en revisión",
    en_proceso: "En revisión",
    cotizada: "Cotización lista — falta tu aceptación",
    pagada: "Pagada — pedido en preparación",
    vendida: "Vendida",
    perdida: "Cerrada",
  };

  quotes.forEach((q) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.style.marginBottom = "16px";
    card.style.gap = "10px";
    const date = new Date(q.created_at).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const items = q.megasafety_b2b_quote_items || [];
    const priced = q.status === "cotizada" || q.status === "pagada";
    const itemsHtml = items
      .map((it) => {
        const name = `${it.quantity} x ${it.product_name}${it.brand ? ` (${it.brand})` : ""}`;
        if (priced) {
          const subtotal = (it.quantity || 0) * (it.unit_price || 0);
          return `<li>${name} — $${subtotal.toLocaleString("es-CL")}</li>`;
        }
        return `<li>${name}</li>`;
      })
      .join("");

    const totalsHtml = priced
      ? `<p style="margin:8px 0 0; font-weight:800; color:var(--navy);">Total: $${Number(q.total || 0).toLocaleString("es-CL")}</p>`
      : "";

    const waText = encodeURIComponent(`Hola, tengo una consulta sobre mi cotización ${q.correlative_code}.`);
    const waLink = `https://wa.me/56983061338?text=${waText}`;

    const actionsHtml = `
      <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
        ${q.status === "cotizada" ? `<button class="btn btn--primary btn-pay" data-id="${q.id}" type="button">Aceptar y pagar con Flow</button>` : ""}
        <button class="btn btn--outline btn-pdf" data-id="${q.id}" type="button">Descargar PDF</button>
        <a class="btn btn--outline" href="${waLink}" target="_blank" rel="noopener" style="color:#25d366; border-color:#25d366;">💬 Consultar por WhatsApp</a>
      </div>`;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <strong style="font-family:var(--font-head); font-size:1.2rem; color:var(--navy);">${q.correlative_code}</strong>
        <span style="font-size:0.85rem; color:var(--ink-soft);">${date}</span>
      </div>
      <p style="margin:4px 0; color:var(--ink-soft); font-size:0.9rem;">Estado: <strong style="color:var(--navy);">${STATUS_LABELS[q.status] || q.status}</strong></p>
      <ul style="margin:8px 0 0; padding-left:18px; font-size:0.88rem; color:var(--ink);">${itemsHtml}</ul>
      ${totalsHtml}
      ${actionsHtml}
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".btn-pay").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Redirigiendo a Flow...";
      const res = await fetch("/api/quote/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: btn.dataset.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudo iniciar el pago.");
        btn.disabled = false;
        btn.textContent = "Aceptar y pagar con Flow";
        return;
      }
      window.location.href = `${data.url}?token=${data.token}`;
    });
  });

  list.querySelectorAll(".btn-pdf").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const token = await getFreshAccessToken();
      window.open(`/api/quote/pdf?id=${btn.dataset.id}&token=${token}`, "_blank");
    });
  });
}

loadOrders();
setTimeout(loadOrders, 400); // segundo intento por si el login del header terminó justo después del primero
document.getElementById("refresh-orders-btn")?.addEventListener("click", () => loadOrders());

// Live updates: a status change or new price from staff shows up automatically.
let ordersRealtimeChannel = null;
async function subscribeToOwnQuoteUpdates() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session || ordersRealtimeChannel) return;
  ordersRealtimeChannel = sbClient
    .channel("customer-quotes-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "megasafety_b2b_quotes", filter: `customer_user_id=eq.${session.user.id}` },
      () => loadOrders()
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_b2b_quote_items" }, () => loadOrders())
    .subscribe();
}
subscribeToOwnQuoteUpdates();
