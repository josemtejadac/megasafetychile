const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

// CUSTOMER_REMEMBER_KEY, customerAuthStorage and the acct* profile helpers
// are declared by account.js, which this page loads first — reusing them
// (not redeclaring) avoids a page-wide "Identifier has already been
// declared" SyntaxError, since classic <script> tags share one global scope.

// Same storage key as account.js / compra-empresa.js (customer pages) so the
// customer's login persists across them, separate from the staff panel.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "msc_customer_auth", storage: customerAuthStorage },
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

const QUOTE_STATUS = {
  pendiente: { label: "Recibida, en revisión", cls: "" },
  en_proceso: { label: "En revisión", cls: "" },
  cotizada: { label: "Cotización lista — falta tu aceptación", cls: "is-action" },
  pagada: { label: "Pagada — pedido en preparación", cls: "is-done" },
  vendida: { label: "Compra confirmada", cls: "is-done" },
  rechazada: { label: "Rechazada por ti", cls: "is-closed" },
  perdida: { label: "Cerrada", cls: "is-closed" },
};
const PURCHASE_STATUSES = ["pagada", "vendida"];
const OPEN_STATUSES = ["pendiente", "en_proceso", "cotizada"];
const TABS = ["cotizaciones", "compras", "datos"];
const clp = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");
const shortDate = (d) => new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

let accountProfile = null;
let profileFormUserId = null;

function tabFromHash() {
  const h = location.hash.replace("#", "");
  return TABS.includes(h) ? h : "cotizaciones";
}

function showTab(tab) {
  TABS.forEach((t) => {
    document.getElementById(`acct-tab-${t}`).hidden = t !== tab;
  });
  document.querySelectorAll("#acct-tabs .admin-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
}

document.querySelectorAll("#acct-tabs .admin-tab").forEach((b) => {
  b.addEventListener("click", () => {
    if (location.hash === `#${b.dataset.tab}`) showTab(b.dataset.tab);
    else location.hash = b.dataset.tab;
  });
});
window.addEventListener("hashchange", () => showTab(tabFromHash()));

function quoteCardHtml(q) {
  const status = QUOTE_STATUS[q.status] || { label: q.status, cls: "" };
  const isPurchase = PURCHASE_STATUSES.includes(q.status);
  const showPrices = q.status === "cotizada" || isPurchase;
  const items = q.megasafety_b2b_quote_items || [];
  const itemsHtml = items
    .map((it) => {
      const name = `${it.quantity} x ${acctEscape(it.product_name)}${it.brand ? ` (${acctEscape(it.brand)})` : ""}${it.variant ? ` [${acctEscape(it.variant)}]` : ""}`;
      return showPrices && it.unit_price != null ? `<li>${name} — ${clp((it.quantity || 0) * it.unit_price)}</li>` : `<li>${name}</li>`;
    })
    .join("");

  let totalHtml = "";
  if (isPurchase) {
    const when = q.paid_at || q.sold_at;
    totalHtml = `<p style="margin:8px 0 0; font-weight:800; color:var(--navy);">Total: ${clp(q.sale_amount ?? q.total)}${when ? ` <span style="font-weight:500; color:var(--ink-soft); font-size:0.85rem;">· confirmada el ${shortDate(when)}</span>` : ""}</p>`;
  } else if (q.status === "cotizada") {
    totalHtml = `<p style="margin:8px 0 0; font-weight:800; color:var(--navy);">Total: ${clp(q.total)} <span style="font-weight:500; color:var(--ink-soft); font-size:0.85rem;">(IVA incluido)</span></p>`;
  }

  const waLink = `https://wa.me/56983061338?text=${encodeURIComponent(`Hola, tengo una consulta sobre mi cotización ${q.correlative_code}.`)}`;
  const rejectedHtml =
    q.status === "rechazada" && q.rejected_reason
      ? `<p style="margin:8px 0 0; color:var(--ink-soft); font-size:0.88rem;"><strong>Motivo:</strong> ${acctEscape(q.rejected_reason)}</p>`
      : "";

  return `
    <div class="stat-card acct-quote-card">
      <div class="acct-quote-head">
        <strong class="acct-quote-code">${acctEscape(q.correlative_code)}</strong>
        <span style="font-size:0.85rem; color:var(--ink-soft);">Solicitada el ${shortDate(q.created_at)}</span>
      </div>
      <div><span class="acct-status ${status.cls}">${status.label}</span></div>
      <p style="margin:2px 0 0; font-size:0.85rem; color:var(--ink-soft);">${acctEscape(q.razon_social)}${q.requiere_despacho ? ` · Despacho a ${acctEscape(q.comuna || q.direccion || "")}` : ""}</p>
      ${itemsHtml ? `<ul class="acct-items">${itemsHtml}</ul>` : ""}
      ${totalHtml}
      <div class="acct-actions">
        ${q.status === "cotizada" ? `<button class="btn btn--primary btn-pay" data-id="${q.id}" type="button">Aceptar y pagar con Flow</button>` : ""}
        ${q.status === "cotizada" ? `<button class="btn btn--outline btn-reject" data-id="${q.id}" type="button" style="color:#b91c1c; border-color:#b91c1c;">Rechazar cotización</button>` : ""}
        <button class="btn btn--outline btn-pdf" data-id="${q.id}" type="button">Descargar PDF</button>
        <a class="btn btn--outline" href="${waLink}" target="_blank" rel="noopener" style="color:#25d366; border-color:#25d366;">💬 Consultar por WhatsApp</a>
      </div>
      ${rejectedHtml}
    </div>`;
}

function renderProfileForm(profile) {
  const form = document.getElementById("profile-form");
  form.innerHTML = `${acctProfileFieldsHtml(profile || {})}
    <p class="form-note" id="profile-note"></p>
    <button type="submit" class="btn btn--primary">Guardar mis datos</button>`;
}

async function loadAccount() {
  const { data: { session } } = await sbClient.auth.getSession();
  const loggedOutView = document.getElementById("logged-out-view");
  const accountView = document.getElementById("account-view");
  if (!session) {
    loggedOutView.hidden = false;
    accountView.hidden = true;
    profileFormUserId = null;
    return;
  }
  loggedOutView.hidden = true;
  accountView.hidden = false;

  const [profile, quotesRes] = await Promise.all([
    acctGetProfile(),
    sbClient.from("megasafety_b2b_quotes").select("*, megasafety_b2b_quote_items(*)").order("created_at", { ascending: false }),
  ]);
  accountProfile = profile;
  const quotes = quotesRes.data || [];

  document.getElementById("acct-page-title").textContent = profile?.first_name ? `Hola, ${profile.first_name}` : "Mi cuenta";
  document.getElementById("acct-page-banner").hidden = acctProfileIsComplete(profile);
  document.getElementById("acct-login-email").textContent = session.user.email;

  const purchases = quotes.filter((q) => PURCHASE_STATUSES.includes(q.status));
  const others = quotes.filter((q) => !PURCHASE_STATUSES.includes(q.status));
  document.getElementById("acct-stat-quotes").textContent = quotes.length;
  document.getElementById("acct-stat-open").textContent = quotes.filter((q) => OPEN_STATUSES.includes(q.status)).length;
  document.getElementById("acct-stat-purchases").textContent = purchases.length;
  document.getElementById("acct-stat-spent").textContent = clp(purchases.reduce((s, q) => s + Number(q.sale_amount ?? q.total ?? 0), 0));

  document.getElementById("orders-list").innerHTML = others.map(quoteCardHtml).join("");
  document.getElementById("orders-empty").hidden = others.length > 0;
  document.getElementById("purchases-list").innerHTML = purchases.map(quoteCardHtml).join("");
  document.getElementById("purchases-empty").hidden = purchases.length > 0;

  // Re-render the form only for a new login — live quote updates must not
  // wipe out edits the customer is in the middle of typing.
  if (profileFormUserId !== session.user.id) {
    renderProfileForm(profile);
    profileFormUserId = session.user.id;
  }
  showTab(tabFromHash());
}

// One delegated handler for both lists (they're re-rendered on every refresh).
["orders-list", "purchases-list"].forEach((listId) => {
  document.getElementById(listId).addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("btn-pay")) {
      btn.disabled = true;
      btn.textContent = "Redirigiendo a Flow...";
      const res = await fetch("/api/quote/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudo iniciar el pago.");
        btn.disabled = false;
        btn.textContent = "Aceptar y pagar con Flow";
        return;
      }
      window.location.href = `${data.url}?token=${data.token}`;
    } else if (btn.classList.contains("btn-reject")) {
      if (!confirm("¿Seguro que quieres rechazar esta cotización?")) return;
      const reason = prompt("¿Motivo del rechazo? (opcional, déjalo en blanco si prefieres no decir)") || "";
      btn.disabled = true;
      const token = await getFreshAccessToken();
      const res = await fetch("/api/quote/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quote_id: id, reason }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudo rechazar la cotización.");
        btn.disabled = false;
        return;
      }
      loadAccount();
    } else if (btn.classList.contains("btn-pdf")) {
      const token = await getFreshAccessToken();
      window.open(`/api/quote/pdf?id=${id}&token=${token}`, "_blank");
    }
  });
});

document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const note = document.getElementById("profile-note");
  const { data, error } = acctReadProfileForm(form);
  if (error) {
    note.textContent = error;
    note.className = "form-note is-error";
    return;
  }
  if (!accountProfile?.privacy_accepted_at && !data.privacy_accepted_at) {
    note.textContent = "Para guardar tus datos debes aceptar su uso (casilla de arriba).";
    note.className = "form-note is-error";
    return;
  }
  note.textContent = "Guardando...";
  note.className = "form-note is-loading";
  const { profile, error: saveError } = await acctSaveProfile(data);
  if (saveError) {
    note.textContent = "No se pudieron guardar tus datos. Intenta nuevamente.";
    note.className = "form-note is-error";
    return;
  }
  accountProfile = profile;
  renderProfileForm(profile);
  const newNote = document.getElementById("profile-note");
  newNote.textContent = "Datos guardados.";
  newNote.className = "form-note";
  document.getElementById("acct-page-title").textContent = `Hola, ${profile.first_name}`;
  document.getElementById("acct-page-banner").hidden = acctProfileIsComplete(profile);
  refreshAccountState();
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const note = document.getElementById("password-note");
  const fd = new FormData(form);
  const password = String(fd.get("password") || "");
  if (password.length < 6) {
    note.textContent = "La contraseña debe tener al menos 6 caracteres.";
    note.className = "form-note is-error";
    return;
  }
  if (password !== fd.get("password2")) {
    note.textContent = "Las contraseñas no coinciden.";
    note.className = "form-note is-error";
    return;
  }
  note.textContent = "Guardando...";
  note.className = "form-note is-loading";
  const { error } = await sbClient.auth.updateUser({ password });
  if (error) {
    note.textContent = /different|same/i.test(error.message) ? "La nueva contraseña debe ser distinta de la actual." : "No se pudo cambiar la contraseña. Intenta nuevamente.";
    note.className = "form-note is-error";
    return;
  }
  form.reset();
  note.textContent = "Contraseña actualizada.";
  note.className = "form-note";
});

acctWirePasswordToggles(document.getElementById("password-form"));
document.getElementById("page-login-btn").addEventListener("click", () => window.dispatchEvent(new CustomEvent("msc:open-account")));
document.getElementById("refresh-orders-btn").addEventListener("click", () => loadAccount());
window.addEventListener("msc:account-changed", () => {
  profileFormUserId = null;
  loadAccount();
  subscribeToOwnQuoteUpdates();
});

loadAccount();

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
      () => loadAccount()
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_b2b_quote_items" }, () => loadAccount())
    .subscribe();
}
subscribeToOwnQuoteUpdates();
