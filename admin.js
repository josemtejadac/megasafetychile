const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
// Separate storage key from the customer-facing pages (account.js etc.) so a
// staff login in one tab doesn't sign out a customer session open in another.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "msc_staff_auth" },
});

// Returns a valid (non-expired) access token, forcing a refresh first if the
// cached session is at or past expiry — a plain getSession() can otherwise
// hand back a stale token on a long-idle tab and every admin action then
// fails with "No autorizado".
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

const loginView = document.getElementById("login-view");
const panelView = document.getElementById("panel-view");
const logoutBtn = document.getElementById("logout-btn");
const loginForm = document.getElementById("login-form");
const loginNote = document.getElementById("login-note");

let currentStaff = null; // { user_id, name, role, commission_rate }

async function showAppropriateView() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) {
    loginView.hidden = false;
    panelView.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  const { data: adminRow, error } = await sbClient
    .from("megasafety_admins")
    .select("user_id, name, role, commission_rate")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !adminRow) {
    loginNote.textContent = "Esta cuenta no tiene permisos de administrador.";
    loginNote.className = "form-note is-error";
    await sbClient.auth.signOut();
    loginView.hidden = false;
    panelView.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  currentStaff = adminRow;
  loginView.hidden = true;
  panelView.hidden = false;
  logoutBtn.hidden = false;

  document.getElementById("admin-welcome").textContent =
    `Hola, ${adminRow.name || session.user.email} (${adminRow.role === "admin" ? "Administrador" : "Vendedor"})`;
  document.getElementById("tab-equipo").hidden = adminRow.role !== "admin";

  setupTabs();
  loadQuotes();
  subscribeToQuoteUpdates();
}

// Live updates: any insert/update on quotes or their items (a new RFQ coming
// in, a colleague pricing/claiming one, a payment landing) refreshes the
// list automatically, in addition to the manual "Actualizar" button.
let quotesRealtimeChannel = null;
function subscribeToQuoteUpdates() {
  if (quotesRealtimeChannel) return;
  quotesRealtimeChannel = sbClient
    .channel("admin-quotes-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_b2b_quotes" }, () => loadQuotes())
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_b2b_quote_items" }, () => loadQuotes())
    .subscribe();
}

document.getElementById("refresh-quotes-btn")?.addEventListener("click", () => loadQuotes());

function setupTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.hidden) return;
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelectorAll(".admin-section").forEach((s) => (s.hidden = true));
      const target = document.getElementById(`section-${tab.dataset.section}`);
      target.hidden = false;
      if (tab.dataset.section === "productos" && allProducts.length === 0) loadProducts();
      if (tab.dataset.section === "equipo") loadStaff();
      if (tab.dataset.section === "cotizaciones") loadQuotes();
    });
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  loginNote.textContent = "Ingresando...";
  loginNote.className = "form-note is-loading";

  const res = await fetch("/api/staff/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: fd.get("identifier"), password: fd.get("password") }),
  });
  const data = await res.json();
  if (!data.ok) {
    loginNote.textContent = data.error || "Correo/RUT o contraseña incorrectos.";
    loginNote.className = "form-note is-error";
    return;
  }

  const { error } = await sbClient.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) {
    loginNote.textContent = "No se pudo iniciar sesión.";
    loginNote.className = "form-note is-error";
    return;
  }
  loginNote.textContent = "";
  await showAppropriateView();
});

logoutBtn.addEventListener("click", async () => {
  await sbClient.auth.signOut();
  showAppropriateView();
});

// ---------- Product list ----------
const tbody = document.getElementById("products-tbody");
const emptyState = document.getElementById("admin-empty");
const searchInput = document.getElementById("admin-search");
const catFilter = document.getElementById("admin-cat-filter");
const priceFilter = document.getElementById("admin-price-filter");

let allProducts = [];

async function loadProducts() {
  const { data, error } = await sbClient
    .from("megasafety_products")
    .select("*")
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    tbody.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = "Error cargando productos: " + error.message;
    return;
  }
  allProducts = data;
  renderStats();
  renderTable();
}

function renderStats() {
  document.getElementById("stat-total").textContent = allProducts.length;
  document.getElementById("stat-active").textContent = allProducts.filter((p) => p.active).length;
  document.getElementById("stat-priced").textContent = allProducts.filter((p) => p.price != null).length;
  document.getElementById("stat-quote").textContent = allProducts.filter((p) => p.price == null).length;
  document.getElementById("stat-photos").textContent = allProducts.filter((p) => p.image_url).length;
}

function renderTable() {
  const term = searchInput.value.trim().toLowerCase();
  const cat = catFilter.value;
  const priceMode = priceFilter.value;

  const filtered = allProducts.filter((p) => {
    const matchesTerm =
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.sku || "").toLowerCase().includes(term) ||
      (p.brand || "").toLowerCase().includes(term);
    const matchesCat = cat === "all" || p.category_id === cat;
    const matchesPrice =
      priceMode === "all" || (priceMode === "priced" ? p.price != null : p.price == null);
    return matchesTerm && matchesCat && matchesPrice;
  });

  tbody.innerHTML = "";
  emptyState.hidden = filtered.length > 0;

  filtered.forEach((p) => {
    const tr = document.createElement("tr");
    if (!p.active) tr.className = "admin-row-inactive";
    tr.innerHTML = `
      <td class="thumb-cell">${
        p.image_url
          ? `<img src="${p.image_url}" alt="">`
          : `<div class="thumb-cell-placeholder"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/></svg></div>`
      }</td>
      <td><span class="status-dot ${p.active ? "" : "is-off"}"></span></td>
      <td>${p.sku || "-"}</td>
      <td>${p.name}</td>
      <td>${p.brand || "-"}</td>
      <td>${CATEGORY_LABELS[p.category_id] || p.category_id}${p.subcategory ? `<br><span style="color:var(--ink-soft); font-size:0.8rem;">${p.subcategory}</span>` : ""}</td>
      <td class="price-cell ${p.price == null ? "is-quote" : ""}">${
        p.price == null ? "Solicitar cotización" : "$" + Number(p.price).toLocaleString("es-CL")
      }</td>
      <td><button class="row-edit-btn" type="button">Editar</button></td>
    `;
    tr.querySelector(".row-edit-btn").addEventListener("click", () => openProductForm(p));
    tbody.appendChild(tr);
  });
}

searchInput.addEventListener("input", renderTable);
catFilter.addEventListener("change", renderTable);
priceFilter.addEventListener("change", renderTable);

// ---------- Product form ----------
const productPanel = document.getElementById("product-panel");
const productOverlay = document.getElementById("product-overlay");
// Mirrors the subcategory links in the site's main nav (index.html) so the
// admin picks from the exact same list the storefront filters against —
// typing a mismatched subcategory string silently breaks that filter.
const SUBCATS_BY_CATEGORY = {
  "cat-seguridad-industrial": [
    "Protección visual y facial",
    "Protección de cabeza y auditiva",
    "Protección respiratoria",
    "Protección de manos",
    "Calzado de seguridad",
    "Protección dérmica e higiene",
    "Arneses y trabajo en altura",
    "Emergencia y seguridad",
  ],
  "cat-herramientas": [
    "Herramientas manuales",
    "Herramientas eléctricas",
    "Herramientas inalámbricas",
    "Medición",
    "Accesorios y consumibles",
  ],
  "cat-abrasivos": [
    "Discos de corte",
    "Discos de desbaste",
    "Discos traslapados y de acabado",
    "Lijas y abrasivos",
    "Accesorios",
  ],
  "cat-soldadura": [
    "Máquinas MIG",
    "Máquinas MMA / Inverter",
    "Alambres y electrodos",
    "Antorchas, repuestos y consumibles",
    "Accesorios para soldadura",
  ],
  "cat-vial": ["Conos y delimitación", "Señalética", "Cintas y elementos reflectantes", "Balizas y señalización luminosa"],
  "cat-loto": [
    "Candados de seguridad",
    "Dispositivos de bloqueo",
    "Kits y estaciones LOTO",
    "Accesorios y señalización LOTO",
  ],
  "cat-iluminacion": [
    "Focos y proyectores LED",
    "Luminarias industriales",
    "Iluminación de emergencia",
    "Iluminación portátil y para faena",
    "Accesorios",
  ],
  "cat-ropa": ["Ropa de trabajo", "Chalecos geólogo", "Ropa térmica e impermeable", "Poleras y polerones", "Micropolares y parkas"],
  "cat-izaje": [
    "Cadenas y ganchos",
    "Grilletes y eslabones",
    "Tensores y accesorios",
    "Eslingas planas y tubulares",
    "Estrobos y cables de acero",
    "Equipos de elevación",
  ],
};

const subcategorySelect = document.getElementById("subcategory-select");
function populateSubcategoryOptions(categoryId, selected) {
  const subs = SUBCATS_BY_CATEGORY[categoryId] || [];
  subcategorySelect.innerHTML =
    `<option value="">Sin subcategoría</option>` + subs.map((s) => `<option value="${s}">${s}</option>`).join("");
  subcategorySelect.value = subs.includes(selected) ? selected : "";
}
productForm.elements.category_id?.addEventListener("change", (e) => populateSubcategoryOptions(e.target.value, ""));

const productForm = document.getElementById("product-form");
const productNote = document.getElementById("product-note");
const productPanelTitle = document.getElementById("product-panel-title");
const deleteBtn = document.getElementById("delete-product-btn");

function openProductPanel() {
  productPanel.classList.add("is-open");
  productOverlay.classList.add("is-open");
  productPanel.setAttribute("aria-hidden", "false");
}
function closeProductPanel() {
  productPanel.classList.remove("is-open");
  productOverlay.classList.remove("is-open");
  productPanel.setAttribute("aria-hidden", "true");
}
document.getElementById("product-close-btn").addEventListener("click", closeProductPanel);
productOverlay.addEventListener("click", closeProductPanel);

// ---------- Photo upload ----------
const photoPreview = document.getElementById("photo-preview");
const photoInput = document.getElementById("photo-input");
const photoHint = document.getElementById("photo-hint");
const PLACEHOLDER_THUMB_SVG =
  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';

function setPhotoPreview(url) {
  photoPreview.innerHTML = url ? `<img src="${url}" alt="">` : PLACEHOLDER_THUMB_SVG;
}

function setPhotoFieldState(productId) {
  if (productId) {
    photoInput.disabled = false;
    photoHint.textContent = "JPG o PNG, se sube directo al guardar el archivo.";
  } else {
    photoInput.disabled = true;
    photoHint.textContent = "Guarda el producto primero para poder subir su foto.";
  }
}

photoInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const productId = productForm.elements.id.value;
  if (!file || !productId) return;

  photoHint.textContent = "Subiendo...";
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("product_id", productId);
    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: fd,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error al subir la foto");
    setPhotoPreview(data.image_url);
    photoHint.textContent = "Foto actualizada.";
    loadProducts();
  } catch (err) {
    photoHint.textContent = err.message || "No se pudo subir la foto.";
  }
});

document.getElementById("new-product-btn").addEventListener("click", () => {
  productForm.reset();
  productForm.elements.id.value = "";
  productForm.elements.active.checked = true;
  productPanelTitle.textContent = "Nuevo producto";
  deleteBtn.hidden = true;
  productNote.textContent = "";
  setPhotoPreview(null);
  setPhotoFieldState(null);
  populateSubcategoryOptions(productForm.elements.category_id.value, "");
  openProductPanel();
});

function openProductForm(p) {
  productForm.reset();
  productForm.elements.id.value = p.id;
  productForm.elements.sku.value = p.sku || "";
  productForm.elements.name.value = p.name || "";
  productForm.elements.brand.value = p.brand || "";
  productForm.elements.category_id.value = p.category_id;
  populateSubcategoryOptions(p.category_id, p.subcategory || "");
  productForm.elements.description.value = p.description || "";
  productForm.elements.certifications.value = (p.certifications || []).join(", ");
  productForm.elements.price.value = p.price == null ? "" : p.price;
  productForm.elements.sort_order.value = p.sort_order || 0;
  productForm.elements.active.checked = p.active;
  productPanelTitle.textContent = "Editar producto";
  deleteBtn.hidden = false;
  setPhotoPreview(p.image_url);
  setPhotoFieldState(p.id);
  productNote.textContent = "";
  openProductPanel();
}

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(productForm);
  const id = fd.get("id");
  const priceRaw = fd.get("price");
  const certsRaw = fd.get("certifications") || "";

  const payload = {
    sku: fd.get("sku") || null,
    name: fd.get("name"),
    brand: fd.get("brand") || null,
    category_id: fd.get("category_id"),
    subcategory: fd.get("subcategory") || null,
    description: fd.get("description") || null,
    certifications: certsRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    price: priceRaw === "" ? null : Number(priceRaw),
    sort_order: Number(fd.get("sort_order")) || 0,
    active: fd.get("active") === "on",
  };

  productNote.textContent = "Guardando...";
  productNote.className = "form-note is-loading";

  const query = id
    ? sbClient.from("megasafety_products").update(payload).eq("id", id)
    : sbClient.from("megasafety_products").insert(payload);

  const { error } = await query;
  if (error) {
    productNote.textContent = "Error: " + error.message;
    productNote.className = "form-note is-error";
    return;
  }
  closeProductPanel();
  loadProducts();
});

deleteBtn.addEventListener("click", async () => {
  const id = productForm.elements.id.value;
  if (!id || !confirm("¿Eliminar este producto? Esta acción no se puede deshacer.")) return;
  const { error } = await sbClient.from("megasafety_products").delete().eq("id", id);
  if (error) {
    productNote.textContent = "Error: " + error.message;
    productNote.className = "form-note is-error";
    return;
  }
  closeProductPanel();
  loadProducts();
});

// ---------- Cotizaciones ----------
let allQuotes = [];
const quotesList = document.getElementById("quotes-list");
const quotesEmpty = document.getElementById("quotes-empty");
const quotesStatusFilter = document.getElementById("quotes-status-filter");
const quotesMineFilter = document.getElementById("quotes-mine-filter");

async function loadQuotes() {
  const { data, error } = await sbClient
    .from("megasafety_b2b_quotes")
    .select("*, megasafety_b2b_quote_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    quotesList.innerHTML = "";
    quotesEmpty.hidden = false;
    quotesEmpty.textContent = "Error cargando cotizaciones: " + error.message;
    return;
  }
  allQuotes = data;
  renderQuoteStats();
  renderQuotesList();
}

function renderQuoteStats() {
  document.getElementById("qstat-total").textContent = allQuotes.length;
  document.getElementById("qstat-pendientes").textContent = allQuotes.filter((q) => q.status === "pendiente").length;
  document.getElementById("qstat-proceso").textContent = allQuotes.filter((q) => q.status === "en_proceso").length;
  document.getElementById("qstat-vendidas").textContent = allQuotes.filter((q) => q.status === "vendida").length;
  const myCommission = allQuotes
    .filter((q) => q.status === "vendida" && q.claimed_by === currentStaff?.user_id)
    .reduce((sum, q) => sum + (q.commission_amount || 0), 0);
  document.getElementById("qstat-comision").textContent = "$" + myCommission.toLocaleString("es-CL");
}

const STATUS_LABELS = {
  pendiente: "Sin tomar",
  en_proceso: "En proceso",
  cotizada: "Cotización enviada",
  pagada: "Pagada",
  rechazada: "Rechazada por cliente",
  vendida: "Vendida",
  perdida: "Perdida",
};

function renderQuotesList() {
  const statusFilter = quotesStatusFilter.value;
  const mineFilter = quotesMineFilter.value;
  const filtered = allQuotes.filter((q) => {
    const matchesStatus = statusFilter === "all" || q.status === statusFilter;
    const matchesMine = mineFilter === "all" || q.claimed_by === currentStaff?.user_id;
    return matchesStatus && matchesMine;
  });

  quotesList.innerHTML = "";
  quotesEmpty.hidden = filtered.length > 0;

  filtered.forEach((q) => {
    const card = document.createElement("div");
    card.className = "quote-card";
    const date = new Date(q.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
    const itemCount = (q.megasafety_b2b_quote_items || []).reduce((s, i) => s + i.quantity, 0);
    card.innerHTML = `
      <div class="quote-card-top">
        <span class="quote-code">${q.correlative_code}</span>
        <span class="quote-badge st-${q.status}">${STATUS_LABELS[q.status]}</span>
      </div>
      <p class="quote-card-company">${q.razon_social}</p>
      <p class="quote-card-meta">${date} · ${itemCount} unidad(es) · ${q.nombre_contacto}</p>
      ${q.claimed_by ? `<p class="quote-card-claimed">Tomada por: ${q.claimed_by === currentStaff?.user_id ? "ti" : "otro vendedor"}</p>` : ""}
    `;
    card.addEventListener("click", () => openQuoteDetail(q));
    quotesList.appendChild(card);
  });
}

quotesStatusFilter.addEventListener("change", renderQuotesList);
quotesMineFilter.addEventListener("change", renderQuotesList);

// ---------- Quote detail drawer ----------
const quotePanel = document.getElementById("quote-panel");
const quoteOverlay = document.getElementById("quote-overlay");
const quotePanelBody = document.getElementById("quote-panel-body");

function openQuotePanel() {
  quotePanel.classList.add("is-open");
  quoteOverlay.classList.add("is-open");
  quotePanel.setAttribute("aria-hidden", "false");
}
function closeQuotePanel() {
  quotePanel.classList.remove("is-open");
  quoteOverlay.classList.remove("is-open");
  quotePanel.setAttribute("aria-hidden", "true");
}
document.getElementById("quote-close-btn").addEventListener("click", closeQuotePanel);
quoteOverlay.addEventListener("click", closeQuotePanel);

async function logQuoteEvent(quoteId, eventType, detail) {
  await sbClient.from("megasafety_quote_events").insert({
    quote_id: quoteId,
    user_id: currentStaff?.user_id,
    event_type: eventType,
    detail: detail || null,
  });
}

function openQuoteDetail(q) {
  document.getElementById("quote-panel-title").textContent = q.correlative_code;
  const items = q.megasafety_b2b_quote_items || [];
  const canClaim = !q.claimed_by;
  const isMine = q.claimed_by === currentStaff?.user_id;
  const isAdmin = currentStaff?.role === "admin";
  const canPrice = q.status !== "pagada";

  const priceRowsHtml = items
    .map(
      (i) => `
      <div class="price-row" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        <span style="flex:1; font-size:0.88rem;">${i.quantity} x ${i.product_name}${i.brand ? ` (${i.brand})` : ""}</span>
        <input type="number" min="0" class="item-price-input" data-item-id="${i.id}" data-qty="${i.quantity}" value="${i.unit_price || ""}" placeholder="Precio unit." style="width:120px;" ${!canPrice ? "disabled" : ""}>
        ${canPrice ? `<button type="button" class="remove-item-btn" data-item-id="${i.id}" title="Quitar producto" style="background:none; border:none; color:#b91c1c; font-size:1.1rem; cursor:pointer; padding:0 4px;">✕</button>` : ""}
      </div>`
    )
    .join("");

  const attachmentHtml = q.attachment_url
    ? `<p class="quote-detail-row"><a href="${q.attachment_url}" target="_blank" rel="noopener" style="color:var(--navy); font-weight:700;">📎 Ver archivo adjunto del cliente</a></p>`
    : "";

  const addItemHtml = canPrice
    ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
         <input type="text" id="new-item-name" placeholder="Nombre del producto" style="flex:2; min-width:140px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
         <input type="text" id="new-item-brand" placeholder="Marca (opcional)" style="flex:1; min-width:100px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
         <input type="number" id="new-item-qty" placeholder="Cant." min="1" value="1" style="width:70px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
         <button type="button" class="btn btn--outline" id="add-item-btn">+ Agregar producto</button>
       </div>`
    : "";

  const pricedHtml =
    q.status === "cotizada" || q.status === "pagada" || q.status === "rechazada"
      ? `<p class="quote-detail-row" style="margin-top:10px;"><strong>Total cotizado: $${Number(q.total || 0).toLocaleString("es-CL")}</strong> (subtotal $${Number(q.subtotal || 0).toLocaleString("es-CL")} + IVA $${Number(q.iva || 0).toLocaleString("es-CL")})</p>`
      : "";

  const rejectedHtml =
    q.status === "rechazada"
      ? `<p class="quote-detail-row" style="margin-top:6px; color:#b91c1c;"><strong>Rechazada por el cliente${q.rejected_reason ? `:</strong> ${q.rejected_reason}` : "</strong> (sin motivo indicado)"}</p>`
      : "";

  quotePanelBody.innerHTML = `
    <div class="quote-detail-section">
      <h4>Empresa</h4>
      <p class="quote-detail-row"><strong>${q.razon_social}</strong> — ${q.rut}</p>
      <p class="quote-detail-row">${q.nombre_contacto} · ${q.telefono} · ${q.correo}</p>
      <p class="quote-detail-row">${q.direccion || "-"}, ${q.comuna || "-"}, ${q.region || "-"} — Despacho: ${q.requiere_despacho ? "Sí" : "No"}</p>
      ${q.observaciones ? `<p class="quote-detail-row">Obs: ${q.observaciones}</p>` : ""}
      ${attachmentHtml}
    </div>
    <div class="quote-detail-section">
      <h4>Productos y precios</h4>
      ${priceRowsHtml || `<p class="quote-detail-row" style="color:var(--ink-soft);">Sin productos todavía — agrégalos abajo (útil cuando el cliente solo mandó un PDF/foto).</p>`}
      ${addItemHtml}
      ${canPrice ? `<p class="quote-detail-row" id="live-total-preview" style="margin:10px 0 10px; font-weight:700;"></p>` : ""}
      ${canPrice ? `<button class="btn btn--primary" id="send-priced-quote-btn" type="button" style="margin-top:8px;">Guardar precios y enviar cotización al cliente</button>` : ""}
      ${pricedHtml}
    </div>
    <div class="quote-detail-section">
      <h4>Estado</h4>
      <div class="quote-status-actions">
        ${canClaim ? `<button data-action="claim">Tomar cotización</button>` : ""}
        ${isMine ? `<button data-action="en_proceso" class="${q.status === "en_proceso" ? "is-active" : ""}">En proceso</button>` : ""}
        ${isMine ? `<button data-action="perdida" class="${q.status === "perdida" ? "is-active" : ""}">Marcar perdida</button>` : ""}
      </div>
      ${
        isMine && q.status !== "vendida" && q.status !== "pagada"
          ? `<div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
               <input type="number" id="sale-amount-input" placeholder="Monto vendido (CLP)" min="0" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--border); border-radius:8px;">
               <button class="btn btn--primary" id="mark-sold-btn" type="button" style="width:100%; white-space:normal;">Marcar vendida (venta manual)</button>
             </div>`
          : ""
      }
      ${
        q.status === "vendida"
          ? `<p class="quote-detail-row" style="margin-top:10px;"><strong>Venta: $${Number(q.sale_amount || 0).toLocaleString("es-CL")}</strong> · Comisión: $${Number(q.commission_amount || 0).toLocaleString("es-CL")} (${q.commission_rate_snapshot || 0}%)</p>`
          : ""
      }
    </div>
    <div class="quote-detail-section" style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn--outline" id="download-pdf-btn" type="button">Descargar PDF</button>
      ${isAdmin ? `<button class="btn btn--outline" id="delete-quote-btn" type="button" style="color:#b91c1c; border-color:#b91c1c;">Eliminar cotización</button>` : ""}
    </div>
    <p class="form-note" id="quote-action-note"></p>
  `;

  function updateLiveTotalPreview() {
    const preview = document.getElementById("live-total-preview");
    if (!preview) return;
    let subtotal = 0;
    quotePanelBody.querySelectorAll(".item-price-input").forEach((input) => {
      const price = Number(input.value) || 0;
      const qty = Number(input.dataset.qty) || 0;
      subtotal += price * qty;
    });
    const iva = Math.round(subtotal * 0.19);
    const total = subtotal + iva;
    preview.textContent = `Total estimado: $${total.toLocaleString("es-CL")} (subtotal $${subtotal.toLocaleString("es-CL")} + IVA $${iva.toLocaleString("es-CL")})`;
  }
  quotePanelBody.querySelectorAll(".item-price-input").forEach((input) => {
    input.addEventListener("input", updateLiveTotalPreview);
  });
  updateLiveTotalPreview();

  async function reopenQuoteDetail() {
    const { data: fresh } = await sbClient
      .from("megasafety_b2b_quotes")
      .select("*, megasafety_b2b_quote_items(*)")
      .eq("id", q.id)
      .maybeSingle();
    if (fresh) openQuoteDetail(fresh);
    loadQuotes();
  }

  quotePanelBody.querySelectorAll(".remove-item-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const token = await getFreshAccessToken();
      await fetch("/api/quote/remove-item", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: btn.dataset.itemId }),
      });
      reopenQuoteDetail();
    });
  });

  document.getElementById("add-item-btn")?.addEventListener("click", async () => {
    const name = document.getElementById("new-item-name").value.trim();
    const brand = document.getElementById("new-item-brand").value.trim();
    const qty = Number(document.getElementById("new-item-qty").value) || 1;
    if (!name) {
      note.textContent = "Ingresa el nombre del producto a agregar.";
      note.className = "form-note is-error";
      return;
    }
    const token = await getFreshAccessToken();
    const res = await fetch("/api/quote/add-item", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quote_id: q.id, product_name: name, brand: brand || null, quantity: qty, category_id: q.megasafety_b2b_quote_items?.[0]?.category_id || null }),
    });
    const data = await res.json();
    if (!data.ok) {
      note.textContent = data.error || "No se pudo agregar el producto.";
      note.className = "form-note is-error";
      return;
    }
    reopenQuoteDetail();
  });

  document.getElementById("download-pdf-btn").addEventListener("click", async () => {
    const token = await getFreshAccessToken();
    window.open(`/api/quote/pdf?id=${q.id}&token=${token}`, "_blank");
  });

  document.getElementById("delete-quote-btn")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar definitivamente la cotización ${q.correlative_code}? Esta acción no se puede deshacer.`)) return;
    const token = await getFreshAccessToken();
    const res = await fetch("/api/admin/delete-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quote_id: q.id }),
    });
    const data = await res.json();
    if (!data.ok) {
      note.textContent = data.error || "No se pudo eliminar.";
      note.className = "form-note is-error";
      return;
    }
    closeQuotePanel();
    loadQuotes();
  });

  document.getElementById("send-priced-quote-btn")?.addEventListener("click", async () => {
    const inputs = quotePanelBody.querySelectorAll(".item-price-input");
    const priced = [];
    for (const input of inputs) {
      const val = Number(input.value);
      if (!val || val <= 0) {
        note.textContent = "Ingresa un precio válido para todos los productos.";
        note.className = "form-note is-error";
        return;
      }
      priced.push({ id: input.dataset.itemId, unit_price: val });
    }
    note.textContent = "Enviando cotización...";
    note.className = "form-note is-loading";
    const token = await getFreshAccessToken();
    const res = await fetch("/api/quote/price-and-send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quote_id: q.id, items: priced }),
    });
    const data = await res.json();
    if (!data.ok) {
      note.textContent = data.error || "Error enviando la cotización.";
      note.className = "form-note is-error";
      return;
    }
    note.textContent = data.email?.sent ? "Cotización enviada al cliente por correo." : `Precios guardados, pero el correo no se envió: ${data.email?.reason || ""}`;
    note.className = "form-note";
    loadQuotes();
  });

  const note = document.getElementById("quote-action-note");

  quotePanelBody.querySelector('[data-action="claim"]')?.addEventListener("click", async () => {
    const { error } = await sbClient
      .from("megasafety_b2b_quotes")
      .update({ claimed_by: currentStaff.user_id, claimed_at: new Date().toISOString(), status: "en_proceso" })
      .eq("id", q.id);
    if (error) { note.textContent = "Error: " + error.message; return; }
    await logQuoteEvent(q.id, "claimed");
    closeQuotePanel();
    loadQuotes();
  });

  quotePanelBody.querySelector('[data-action="en_proceso"]')?.addEventListener("click", async () => {
    await sbClient.from("megasafety_b2b_quotes").update({ status: "en_proceso" }).eq("id", q.id);
    await logQuoteEvent(q.id, "status_changed", { status: "en_proceso" });
    closeQuotePanel();
    loadQuotes();
  });

  quotePanelBody.querySelector('[data-action="perdida"]')?.addEventListener("click", async () => {
    await sbClient.from("megasafety_b2b_quotes").update({ status: "perdida" }).eq("id", q.id);
    await logQuoteEvent(q.id, "status_changed", { status: "perdida" });
    closeQuotePanel();
    loadQuotes();
  });

  document.getElementById("mark-sold-btn")?.addEventListener("click", async () => {
    const amountInput = document.getElementById("sale-amount-input");
    const amount = Number(amountInput.value);
    if (!amount || amount <= 0) {
      note.textContent = "Ingresa un monto válido.";
      note.className = "form-note is-error";
      return;
    }
    const rate = currentStaff?.commission_rate || 0;
    const commission = Math.round((amount * rate) / 100);
    const { error } = await sbClient
      .from("megasafety_b2b_quotes")
      .update({
        status: "vendida",
        sale_amount: amount,
        commission_rate_snapshot: rate,
        commission_amount: commission,
        sold_at: new Date().toISOString(),
      })
      .eq("id", q.id);
    if (error) { note.textContent = "Error: " + error.message; return; }
    await logQuoteEvent(q.id, "sold", { sale_amount: amount, commission_amount: commission });
    closeQuotePanel();
    loadQuotes();
  });

  openQuotePanel();
}

// ---------- Equipo (solo admin) ----------
const staffTbody = document.getElementById("staff-tbody");
const staffForm = document.getElementById("staff-form");
const staffNote = document.getElementById("staff-note");

async function loadStaff() {
  const { data, error } = await sbClient
    .from("megasafety_admins")
    .select("*")
    .order("role", { ascending: false });
  if (error) return;

  const { data: sold } = await sbClient
    .from("megasafety_b2b_quotes")
    .select("claimed_by, sale_amount, commission_amount")
    .eq("status", "vendida");

  const totalsByUser = {};
  (sold || []).forEach((q) => {
    if (!q.claimed_by) return;
    if (!totalsByUser[q.claimed_by]) totalsByUser[q.claimed_by] = { sold: 0, commission: 0 };
    totalsByUser[q.claimed_by].sold += q.sale_amount || 0;
    totalsByUser[q.claimed_by].commission += q.commission_amount || 0;
  });

  staffTbody.innerHTML = "";
  data.forEach((s) => {
    const totals = totalsByUser[s.user_id] || { sold: 0, commission: 0 };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.name || "-"}</td>
      <td>${s.rut || "-"}</td>
      <td>${s.role === "admin" ? "Admin" : "Vendedor"}</td>
      <td><input type="number" min="0" max="100" step="0.1" value="${s.commission_rate}" class="staff-rate-input" style="width:70px; padding:6px; border:1px solid var(--border); border-radius:6px;"></td>
      <td>$${totals.sold.toLocaleString("es-CL")}</td>
      <td>$${totals.commission.toLocaleString("es-CL")}</td>
      <td><span class="status-dot ${s.active ? "" : "is-off"}"></span></td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="row-edit-btn save-rate-btn" type="button">Guardar</button>
        <button class="row-edit-btn reset-pass-btn" type="button">Restablecer clave</button>
        <button class="row-edit-btn delete-staff-btn" type="button">Eliminar</button>
      </td>
    `;
    tr.querySelector(".save-rate-btn").addEventListener("click", async () => {
      const newRate = Number(tr.querySelector(".staff-rate-input").value) || 0;
      await sbClient.from("megasafety_admins").update({ commission_rate: newRate }).eq("user_id", s.user_id);
      loadStaff();
    });
    tr.querySelector(".reset-pass-btn").addEventListener("click", async () => {
      const newPass = prompt(`Nueva contraseña para ${s.name || s.rut} (mín. 6 caracteres):`);
      if (!newPass) return;
      if (newPass.length < 6) { alert("Debe tener al menos 6 caracteres."); return; }
      const token = await getFreshAccessToken();
      const res = await fetch("/api/admin/reset-staff-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: s.user_id, new_password: newPass }),
      });
      const data = await res.json();
      alert(data.ok ? "Contraseña actualizada." : "Error: " + data.error);
    });
    tr.querySelector(".delete-staff-btn").addEventListener("click", async () => {
      if (!confirm(`¿Quitar a ${s.name || s.rut} del equipo? Perderá acceso al panel.`)) return;
      await sbClient.from("megasafety_admins").delete().eq("user_id", s.user_id);
      loadStaff();
    });
    staffTbody.appendChild(tr);
  });
}

staffForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(staffForm);
  staffNote.textContent = "Creando...";
  staffNote.className = "form-note is-loading";
  const token = await getFreshAccessToken();
  try {
    const res = await fetch("/api/admin/create-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        rut: fd.get("rut"),
        password: fd.get("password"),
        name: fd.get("name"),
        role: fd.get("role"),
        commission_rate: Number(fd.get("commission_rate")) || 0,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error al crear el trabajador");
    staffNote.textContent = "Trabajador creado correctamente.";
    staffNote.className = "form-note";
    staffForm.reset();
    loadStaff();
  } catch (err) {
    staffNote.textContent = err.message;
    staffNote.className = "form-note is-error";
  }
});

showAppropriateView();
