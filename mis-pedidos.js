const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const itemsHtml = (q.megasafety_b2b_quote_items || [])
      .map((it) => `<li>${it.quantity} x ${it.product_name}${it.brand ? ` (${it.brand})` : ""}</li>`)
      .join("");
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <strong style="font-family:var(--font-head); font-size:1.2rem; color:var(--navy);">${q.correlative_code}</strong>
        <span style="font-size:0.85rem; color:var(--ink-soft);">${date}</span>
      </div>
      <p style="margin:4px 0; color:var(--ink-soft); font-size:0.9rem;">Estado: <strong style="color:var(--navy);">${q.status}</strong></p>
      <ul style="margin:8px 0 0; padding-left:18px; font-size:0.88rem; color:var(--ink);">${itemsHtml}</ul>
    `;
    list.appendChild(card);
  });
}

loadOrders();
setTimeout(loadOrders, 400); // segundo intento por si el login del header terminó justo después del primero
