const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

// By default the session lives in sessionStorage (gone once the browser/tab
// closes) so opening the site never silently reuses a previous login — a
// real problem when admin and vendedor share the same login page/device.
// Checking "Mantener sesión iniciada" at login switches it to localStorage
// so it survives a restart. The REMEMBER_KEY flag itself is always in
// localStorage so it's readable before any session exists.
const STAFF_REMEMBER_KEY = "msc_staff_remember";
// Defensive: some browsers/extensions throw a SecurityError just for
// touching localStorage/sessionStorage, and this runs inside supabase-js's
// internal session check on every request — an uncaught throw here would
// silently break the whole admin panel.
const staffAuthStorage = {
  getItem: (key) => {
    try {
      const remember = localStorage.getItem(STAFF_REMEMBER_KEY) === "1";
      return (remember ? localStorage : sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      const remember = localStorage.getItem(STAFF_REMEMBER_KEY) === "1";
      (remember ? localStorage : sessionStorage).setItem(key, value);
    } catch {
      /* storage unavailable — session just won't persist */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// Separate storage key from the customer-facing pages (account.js etc.) so a
// staff login in one tab doesn't sign out a customer session open in another.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "msc_staff_auth", storage: staffAuthStorage },
});

// Returns a valid (non-expired) access token, forcing a refresh first if the
// cached session is at or past expiry — a plain getSession() can otherwise
// hand back a stale token on a long-idle tab and every admin action then
// fails with "No autorizado".
async function getFreshAccessToken() {
  let { data: { session: s } } = await sbClient.auth.getSession();
  const expiresInMs = s ? s.expires_at * 1000 - Date.now() : -1;
  if (!s || expiresInMs < 60000) {
    const { data, error } = await sbClient.auth.refreshSession();
    if (!error && data.session) {
      s = data.session;
    } else {
      // Our manual refresh can lose a race with supabase-js's own
      // background auto-refresh (Supabase rotates the refresh token on
      // every use, so whichever call runs second fails with "already
      // used") — re-check getSession() once more in case the background
      // refresh already installed a fresh session, instead of sending a
      // guaranteed-invalid "Bearer null" request and failing every action
      // on the page until a manual reload.
      const retry = await sbClient.auth.getSession();
      s = retry.data.session;
    }
  }
  return s?.access_token || null;
}

// Loaded from megasafety_categories (admin-manageable) — this hardcoded
// object is only the fallback used before that fetch resolves.
let CATEGORY_LABELS = {
  "cat-seguridad-industrial": "Seguridad personal",
  "cat-herramientas": "Herramientas y equipos",
  "cat-abrasivos": "Abrasivos y discos",
  "cat-soldadura": "Soldadura",
  "cat-vial": "Seguridad vial y señalización",
  "cat-loto": "Bloqueo L.O.T.O.",
  "cat-iluminacion": "Iluminación industrial",
  "cat-ropa": "Ropa de trabajo y corporativa",
  "cat-izaje": "Izaje de carga",
};
let allCategories = Object.entries(CATEGORY_LABELS).map(([id, label], i) => ({ id, label, show_in_menu: true, sort_order: i + 1 }));
let allSubcategories = []; // { id, category_id, label, sort_order }

function renderCategoryOptions() {
  const selects = [document.getElementById("category-select"), document.getElementById("admin-cat-filter")];
  selects.forEach((sel) => {
    if (!sel) return;
    const keepAll = sel.id === "admin-cat-filter";
    const current = sel.value;
    sel.innerHTML =
      (keepAll ? `<option value="all">Todas las categorías</option>` : "") +
      allCategories.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  });
}

async function loadCategories() {
  const [catsRes, subsRes] = await Promise.all([
    sbClient.from("megasafety_categories").select("id, label, show_in_menu").order("sort_order", { ascending: true }),
    sbClient.from("megasafety_subcategories").select("id, category_id, label").order("sort_order", { ascending: true }),
  ]);
  if (!catsRes.error && catsRes.data && catsRes.data.length) {
    allCategories = catsRes.data;
    CATEGORY_LABELS = Object.fromEntries(catsRes.data.map((c) => [c.id, c.label]));
  }
  if (!subsRes.error && subsRes.data) {
    allSubcategories = subsRes.data;
  }
  renderCategoryOptions();
  renderManageCategoriesList();
}

function slugify(label) {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- Manage categories & subcategories modal ----------
const manageCategoriesPanel = document.getElementById("manage-categories-panel");
const manageCategoriesOverlay = document.getElementById("manage-categories-overlay");

function openManageCategories() {
  renderManageCategoriesList();
  manageCategoriesPanel.classList.add("is-open");
  manageCategoriesOverlay.classList.add("is-open");
  manageCategoriesPanel.setAttribute("aria-hidden", "false");
}
function closeManageCategories() {
  manageCategoriesPanel.classList.remove("is-open");
  manageCategoriesOverlay.classList.remove("is-open");
  manageCategoriesPanel.setAttribute("aria-hidden", "true");
}
document.getElementById("new-category-btn")?.addEventListener("click", openManageCategories);
document.getElementById("manage-categories-btn")?.addEventListener("click", openManageCategories);
document.getElementById("manage-categories-close-btn")?.addEventListener("click", closeManageCategories);
manageCategoriesOverlay?.addEventListener("click", closeManageCategories);

function renderManageCategoriesList() {
  const list = document.getElementById("categories-manage-list");
  if (!list) return;
  list.innerHTML = allCategories
    .map((cat) => {
      const subs = allSubcategories.filter((s) => s.category_id === cat.id);
      return `
      <div class="category-manage-card" data-cat="${cat.id}" style="border:1px solid var(--border); border-radius:10px; padding:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <p style="margin:0; font-weight:700;">${cat.label}</p>
          <label class="checkbox-row" style="margin:0; font-size:0.8rem; white-space:nowrap;">
            <input type="checkbox" class="cat-menu-toggle-input" data-cat="${cat.id}" ${cat.show_in_menu ? "checked" : ""}>
            Mostrar en menú
          </label>
        </div>
        <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">
          ${subs
            .map(
              (s) => `
            <span class="chip" style="display:inline-flex; align-items:center; gap:6px;">
              ${s.label}
              <button type="button" class="sub-remove-btn" data-id="${s.id}" aria-label="Quitar" style="background:none; border:none; cursor:pointer; color:var(--ink-soft); font-size:0.9rem; line-height:1; padding:0;">&times;</button>
            </span>`
            )
            .join("")}
        </div>
        <form class="add-subcategory-form" data-cat="${cat.id}" style="display:flex; gap:6px; margin-top:10px;">
          <input type="text" class="add-subcategory-input" placeholder="Nueva subcategoría..." style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:0.85rem;">
          <button type="submit" class="btn btn--outline" style="padding:6px 10px; font-size:0.8rem;">+ Agregar</button>
        </form>
      </div>`;
    })
    .join("");
}

document.getElementById("new-category-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-category-label");
  const label = input.value.trim();
  if (!label) return;
  const showInMenu = document.getElementById("new-category-show-in-menu").checked;
  const slug = slugify(label);
  const id = `cat-${slug}`;
  if (allCategories.some((c) => c.id === id)) {
    alert("Ya existe una categoría con ese nombre.");
    return;
  }
  const { error } = await sbClient
    .from("megasafety_categories")
    .insert({ id, label, sort_order: allCategories.length + 1, show_in_menu: showInMenu });
  if (error) {
    alert("No se pudo crear la categoría: " + error.message);
    return;
  }
  input.value = "";
  document.getElementById("new-category-show-in-menu").checked = false;
  await loadCategories();
  const sel = document.getElementById("category-select");
  if (sel) sel.value = id;
});

document.getElementById("categories-manage-list")?.addEventListener("change", async (e) => {
  const toggle = e.target.closest(".cat-menu-toggle-input");
  if (!toggle) return;
  const { error } = await sbClient
    .from("megasafety_categories")
    .update({ show_in_menu: toggle.checked })
    .eq("id", toggle.dataset.cat);
  if (error) {
    alert("No se pudo actualizar: " + error.message);
    toggle.checked = !toggle.checked;
    return;
  }
  await loadCategories();
});

document.getElementById("categories-manage-list")?.addEventListener("submit", async (e) => {
  const form = e.target.closest(".add-subcategory-form");
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector(".add-subcategory-input");
  const label = input.value.trim();
  if (!label) return;
  const { error } = await sbClient
    .from("megasafety_subcategories")
    .insert({ category_id: form.dataset.cat, label, sort_order: allSubcategories.length + 1 });
  if (error) {
    alert("No se pudo agregar la subcategoría: " + error.message);
    return;
  }
  await loadCategories();
});

document.getElementById("categories-manage-list")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".sub-remove-btn");
  if (!btn) return;
  const { error } = await sbClient.from("megasafety_subcategories").delete().eq("id", btn.dataset.id);
  if (error) {
    alert("No se pudo quitar la subcategoría: " + error.message);
    return;
  }
  await loadCategories();
});

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
  document.getElementById("tab-fotos").hidden = adminRow.role !== "admin";
  document.getElementById("tab-ventas").hidden = adminRow.role !== "admin";

  setupTabs();
  // A vendedor logging in right after an admin on the same page must not be
  // left looking at an admin-only section.
  if (document.querySelector(".admin-tab.is-active")?.hidden) {
    document.querySelector('.admin-tab[data-section="cotizaciones"]').click();
  }
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

// A new/renamed category shows up immediately in every open tab (this
// panel and the public catalog) without anyone having to reload.
sbClient
  .channel("admin-categories-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_categories" }, () => loadCategories())
  .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_subcategories" }, () => loadCategories())
  .subscribe();

let tabsReady = false;
function setupTabs() {
  // showAppropriateView runs again on every login — wiring the tabs twice
  // would fire every load twice per click.
  if (tabsReady) return;
  tabsReady = true;
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
      if (tab.dataset.section === "equipo") { loadStaff(); loadCommissionPeriods(); }
      if (tab.dataset.section === "cotizaciones") loadQuotes();
      if (tab.dataset.section === "fotos") loadSiteImages();
      if (tab.dataset.section === "clientes") { renderClientes(); loadRegisteredCustomers(); }
      if (tab.dataset.section === "ventas") renderVentas();
    });
  });
}

document.querySelectorAll(".password-toggle").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Ocultar" : "Mostrar";
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  });
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  loginNote.textContent = "Ingresando...";
  loginNote.className = "form-note is-loading";

  // Must be set before setSession() below, since our storage adapter reads
  // this flag at the moment it writes the session to decide where it goes.
  localStorage.setItem(STAFF_REMEMBER_KEY, fd.get("remember") === "on" ? "1" : "0");

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
  localStorage.removeItem(STAFF_REMEMBER_KEY);
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

// The subcategory field is now a free-text input (admin can type a brand
// new one) with a datalist offering the curated defaults above plus any
// subcategory already in use on other products of the same category —
// so the storefront's filter chips (which derive subcategories from real
// product data) and this input stay in sync without a fixed list.
const subcategoryInput = document.getElementById("subcategory-input");
const subcategoryDatalist = document.getElementById("subcategory-datalist");
function populateSubcategoryOptions(categoryId, selected) {
  const curated = SUBCATS_BY_CATEGORY[categoryId] || [];
  const canonical = allSubcategories.filter((s) => s.category_id === categoryId).map((s) => s.label);
  const inUse = allProducts.filter((p) => p.category_id === categoryId && p.subcategory).map((p) => p.subcategory);
  const subs = Array.from(new Set([...curated, ...canonical, ...inUse])).sort((a, b) => a.localeCompare(b, "es"));
  subcategoryDatalist.innerHTML = subs.map((s) => `<option value="${s}">`).join("");
  subcategoryInput.value = selected || "";
}
const productForm = document.getElementById("product-form");
productForm.elements.category_id?.addEventListener("change", (e) => populateSubcategoryOptions(e.target.value, ""));
const productNote = document.getElementById("product-note");
const productPanelTitle = document.getElementById("product-panel-title");
const deleteBtn = document.getElementById("delete-product-btn");

// ---------- Discount / "oferta del mes" live preview ----------
function updateDiscountPreview() {
  const preview = document.getElementById("discount-preview");
  const price = Number(productForm.elements.price.value);
  const pct = Number(productForm.elements.discount_percent.value) || 0;
  if (!price || pct <= 0) {
    preview.textContent = "";
    return;
  }
  const discounted = Math.round(price * (1 - pct / 100));
  preview.textContent = `Precio real: $${price.toLocaleString("es-CL")} → Con ${pct}% de descuento: $${discounted.toLocaleString("es-CL")}`;
}
productForm.elements.price?.addEventListener("input", updateDiscountPreview);
productForm.elements.discount_percent?.addEventListener("input", updateDiscountPreview);

function openProductPanel() {
  productPanel.classList.add("is-open");
  productOverlay.classList.add("is-open");
  productPanel.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeProductPanel() {
  productPanel.classList.remove("is-open");
  productOverlay.classList.remove("is-open");
  productPanel.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.getElementById("product-close-btn").addEventListener("click", closeProductPanel);
productOverlay.addEventListener("click", closeProductPanel);

// Resizes/re-encodes a photo client-side before it ever leaves the browser,
// so storage isn't spent on multi-megabyte phone photos no product page
// needs at full size. Falls back to the original file on any failure (odd
// format, browser without canvas/createImageBitmap support, or compression
// that somehow came out bigger than the original).
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, quality));
    if (!blob || blob.size >= file.size) return file;
    const ext = outType === "image/png" ? "png" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], name, { type: outType });
  } catch {
    return file;
  }
}

// ---------- Photo gallery (up to 5 per product) ----------
const MAX_PRODUCT_IMAGES = 5;
const photoGallery = document.getElementById("photo-gallery");
const photoInput = document.getElementById("photo-input");
const photoHint = document.getElementById("photo-hint");
let currentGalleryImages = [];
let currentGalleryProductId = null;

// Multi-file pickers don't reliably hand files back in click order (some
// OS dialogs return them alphabetically instead) — so upload order alone
// can't be trusted to control what shows first. These arrows let the
// admin fix the order (and pick the cover photo) explicitly after the
// fact, regardless of what order they uploaded in.
function renderPhotoGallery() {
  if (!currentGalleryImages.length) {
    photoGallery.innerHTML = `<p style="margin:0; font-size:0.82rem; color:var(--ink-soft);">Sin fotos todavía.</p>`;
  } else {
    const last = currentGalleryImages.length - 1;
    photoGallery.innerHTML = currentGalleryImages
      .map(
        (url, idx) => `
        <div class="gallery-item${idx === 0 ? " is-cover" : ""}">
          <div class="gallery-photo">
            <img src="${escapeHtml(url)}" alt="Foto ${idx + 1}">
            <span class="gallery-num">${idx + 1}</span>
            <button type="button" class="gallery-remove-btn" data-url="${escapeHtml(url)}" aria-label="Quitar foto ${idx + 1}" title="Quitar esta foto">✕</button>
          </div>
          ${
            idx === 0
              ? `<span class="gallery-cover-label">★ Se ve primero</span>`
              : `<button type="button" class="gallery-cover-btn" data-idx="${idx}" title="Mostrar esta foto primero en la tienda">★ Poner primera</button>`
          }
          <div class="gallery-move-row">
            <button type="button" class="gallery-move-btn" data-idx="${idx}" data-dir="-1" aria-label="Mover foto ${idx + 1} a la izquierda" title="Mover a la izquierda" ${idx === 0 ? "disabled" : ""}>◀</button>
            <button type="button" class="gallery-move-btn" data-idx="${idx}" data-dir="1" aria-label="Mover foto ${idx + 1} a la derecha" title="Mover a la derecha" ${idx === last ? "disabled" : ""}>▶</button>
          </div>
        </div>`
      )
      .join("");
    photoGallery.querySelectorAll(".gallery-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeGalleryImage(btn.dataset.url));
    });
    photoGallery.querySelectorAll(".gallery-move-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const dir = Number(btn.dataset.dir);
        const target = idx + dir;
        if (target < 0 || target >= currentGalleryImages.length) return;
        const reordered = [...currentGalleryImages];
        [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
        saveGalleryOrder(reordered);
      });
    });
    photoGallery.querySelectorAll(".gallery-cover-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const reordered = [...currentGalleryImages];
        const [picked] = reordered.splice(idx, 1);
        reordered.unshift(picked);
        saveGalleryOrder(reordered);
      });
    });
  }
  setPhotoFieldState(currentGalleryProductId);
}

// Reordering is pure metadata (no files move in storage) — a direct update
// on the product row, same as any other admin edit, so it's instant and
// needs no upload endpoint.
async function saveGalleryOrder(newOrder) {
  const { error } = await sbClient
    .from("megasafety_products")
    .update({ image_urls: newOrder, image_url: newOrder[0] })
    .eq("id", currentGalleryProductId);
  if (error) {
    photoHint.textContent = "No se pudo reordenar: " + error.message;
    return;
  }
  currentGalleryImages = newOrder;
  renderPhotoGallery();
  photoHint.textContent = "Orden guardado. La foto marcada \"Se ve primero\" es la que aparece en la tienda.";
  loadProducts();
}

async function removeGalleryImage(url) {
  photoHint.textContent = "Quitando...";
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    const res = await fetch("/api/admin/delete-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ product_id: currentGalleryProductId, image_url: url }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "No se pudo quitar la foto");
    currentGalleryImages = data.image_urls || [];
    renderPhotoGallery();
    photoHint.textContent = "Foto quitada.";
    loadProducts();
  } catch (err) {
    photoHint.textContent = err.message || "No se pudo quitar la foto.";
  }
}

function setPhotoGallery(productId, images) {
  currentGalleryProductId = productId;
  currentGalleryImages = images || [];
  renderPhotoGallery();
}

function setPhotoFieldState(productId) {
  if (!productId) {
    photoInput.disabled = true;
    photoHint.textContent = "Guarda el producto primero para poder subir sus fotos.";
  } else if (currentGalleryImages.length >= MAX_PRODUCT_IMAGES) {
    photoInput.disabled = true;
    photoHint.textContent = `Ya tienes el máximo de ${MAX_PRODUCT_IMAGES} fotos. Quita una para subir otra.`;
  } else {
    photoInput.disabled = false;
    photoHint.textContent = "JPG o PNG, se sube directo al elegir el archivo.";
  }
}

photoInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  const productId = productForm.elements.id.value;
  if (!files.length || !productId) return;

  const room = MAX_PRODUCT_IMAGES - currentGalleryImages.length;
  const toUpload = files.slice(0, room);
  if (files.length > room) {
    photoHint.textContent = `Solo se subirán ${room} de las ${files.length} fotos elegidas (máximo ${MAX_PRODUCT_IMAGES} por producto).`;
  }

  try {
    const { data: { session } } = await sbClient.auth.getSession();
    for (let i = 0; i < toUpload.length; i++) {
      photoHint.textContent = `Comprimiendo foto ${i + 1} de ${toUpload.length}...`;
      const compressed = await compressImage(toUpload[i]);
      photoHint.textContent = `Subiendo foto ${i + 1} de ${toUpload.length}...`;
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("product_id", productId);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error al subir la foto");
      currentGalleryImages = data.image_urls || [];
      renderPhotoGallery();
    }
    photoHint.textContent = toUpload.length > 1 ? `${toUpload.length} fotos agregadas.` : "Foto agregada.";
    photoInput.value = "";
    loadProducts();
  } catch (err) {
    photoHint.textContent = err.message || "No se pudo subir la foto.";
  }
});

// ---------- Document uploads (ficha técnica / registro ISP) ----------
const fichaInput = document.getElementById("ficha-input");
const ispInput = document.getElementById("isp-input");
const fichaLink = document.getElementById("ficha-link");
const ispLink = document.getElementById("isp-link");
const fichaRemoveBtn = document.getElementById("ficha-remove-btn");
const ispRemoveBtn = document.getElementById("isp-remove-btn");
const docHint = document.getElementById("doc-hint");

function setDocLink(link, removeBtn, url) {
  if (url) {
    link.href = url;
    link.hidden = false;
    removeBtn.hidden = false;
  } else {
    link.hidden = true;
    removeBtn.hidden = true;
  }
}

async function removeDocument(docType, link, removeBtn) {
  const productId = productForm.elements.id.value;
  if (!productId) return;
  if (!confirm("¿Quitar este documento del producto?")) return;
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    const res = await fetch("/api/admin/delete-document", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ product_id: productId, doc_type: docType }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "No se pudo quitar el documento");
    setDocLink(link, removeBtn, null);
    docHint.textContent = "Documento quitado.";
    loadProducts();
  } catch (err) {
    docHint.textContent = err.message || "No se pudo quitar el documento.";
  }
}

fichaRemoveBtn.addEventListener("click", () => removeDocument("ficha_tecnica", fichaLink, fichaRemoveBtn));
ispRemoveBtn.addEventListener("click", () => removeDocument("registro_isp", ispLink, ispRemoveBtn));

async function uploadDocument(file, docType) {
  const productId = productForm.elements.id.value;
  if (!file || !productId) {
    docHint.textContent = "Guarda el producto primero para poder subir documentos.";
    return;
  }
  docHint.textContent = "Subiendo...";
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("product_id", productId);
    fd.append("doc_type", docType);
    const res = await fetch("/api/admin/upload-document", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: fd,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error al subir el documento");
    if (docType === "ficha_tecnica") setDocLink(fichaLink, fichaRemoveBtn, data.url);
    else setDocLink(ispLink, ispRemoveBtn, data.url);
    docHint.textContent = "Documento actualizado.";
    loadProducts();
  } catch (err) {
    docHint.textContent = err.message || "No se pudo subir el documento.";
  }
}

fichaInput.addEventListener("change", (e) => uploadDocument(e.target.files[0], "ficha_tecnica"));
ispInput.addEventListener("change", (e) => uploadDocument(e.target.files[0], "registro_isp"));

// ---------- Variants (color/talla) + per-variant stock ----------
const variantsListEl = document.getElementById("variants-list");

async function loadVariants(productId) {
  const { data, error } = await sbClient
    .from("megasafety_product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("color", { ascending: true })
    .order("size", { ascending: true });
  if (error) {
    variantsListEl.innerHTML = `<p class="form-note is-error">Error cargando variantes: ${error.message}</p>`;
    return;
  }
  renderVariants(productId, data || []);
}

function renderVariants(productId, variants) {
  if (!variants.length) {
    variantsListEl.innerHTML = `<p style="color:var(--ink-soft); font-size:0.85rem;">Sin variantes todavía. Completa colores/tallas arriba y usa "Generar variantes".</p>`;
    return;
  }
  variantsListEl.innerHTML = variants
    .map(
      (v) => `
      <div class="price-row" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;" data-variant-id="${v.id}">
        <span style="flex:1; font-size:0.88rem;">${[v.color, v.size].filter(Boolean).join(" / ") || "(sin color/talla)"}</span>
        <input type="number" min="0" class="variant-stock-input" data-variant-id="${v.id}" value="${v.stock}" style="width:90px;" title="Stock (0 = agotado, no seleccionable)">
        <button type="button" class="variant-remove-btn" data-variant-id="${v.id}" style="background:none; border:none; color:#b91c1c; font-size:1.1rem; cursor:pointer; padding:0 4px;">✕</button>
      </div>`
    )
    .join("");

  variantsListEl.querySelectorAll(".variant-stock-input").forEach((input) => {
    input.addEventListener("change", async () => {
      await sbClient
        .from("megasafety_product_variants")
        .update({ stock: Number(input.value) || 0 })
        .eq("id", input.dataset.variantId);
    });
  });
  variantsListEl.querySelectorAll(".variant-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await sbClient.from("megasafety_product_variants").delete().eq("id", btn.dataset.variantId);
      loadVariants(productId);
    });
  });
}

// ---------- Color picker (replaces free-typed colors — avoids typos like
// "azul" vs "Azul" vs a color a photo shows but nobody actually added) ----
// Same names/hex as the storefront's own COLOR_HEX (compra-empresa.js) so a
// color picked here always renders as a real swatch for the customer.
const COLOR_HEX = {
  rojo: "#d62828", azul: "#1d4ed8", amarillo: "#f5b400", naranjo: "#f97316",
  verde: "#16a34a", negro: "#111111", blanco: "#ffffff", gris: "#9ca3af",
  "café": "#7c4a2d", beige: "#e5d3b3", "ámbar": "#f59e0b", celeste: "#7dd3fc",
  morado: "#7c3aed", rosado: "#f9a8d4", plomo: "#6b7280",
  "azul marino": "#1e3a5f", "azul piedra": "#5b7a9d", "azul rey": "#2563eb", "verde botella": "#0f4c3a",
};
const COLOR_PALETTE = Object.keys(COLOR_HEX);
let selectedColors = [];
function colorHex(name) {
  return COLOR_HEX[(name || "").toLowerCase()] || COLOR_HEX[name] || "#ccc";
}

function syncColorsInput() {
  document.getElementById("colors-input").value = selectedColors.join(", ");
}

function renderColorPicker() {
  const picker = document.getElementById("color-picker");
  // Palette colors first (in a stable order), then any already-selected
  // color that isn't in the palette (typed via "+ Agregar" or saved before
  // this picker existed) so nothing the product already has just vanishes.
  const extra = selectedColors.filter((c) => !COLOR_PALETTE.includes(c));
  const all = [...COLOR_PALETTE, ...extra];
  picker.innerHTML = all
    .map((c) => {
      const isSelected = selectedColors.includes(c);
      const hex = colorHex(c);
      return `<button type="button" class="color-swatch-btn" data-color="${c}" title="${c}" style="display:flex; align-items:center; gap:6px; padding:5px 10px 5px 5px; border-radius:999px; border:2px solid ${isSelected ? "var(--navy)" : "var(--border)"}; background:${isSelected ? "var(--bg-alt)" : "#fff"}; cursor:pointer; font-size:0.8rem;">
        <span style="width:18px; height:18px; border-radius:50%; background:${hex}; ${hex === "#ffffff" ? "border:1px solid var(--border);" : ""} flex-shrink:0;"></span>
        ${c}
      </button>`;
    })
    .join("");
  picker.querySelectorAll(".color-swatch-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = btn.dataset.color;
      selectedColors = selectedColors.includes(c) ? selectedColors.filter((x) => x !== c) : [...selectedColors, c];
      syncColorsInput();
      renderColorPicker();
    });
  });
}

function setSelectedColors(colors) {
  selectedColors = (colors || []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  syncColorsInput();
  renderColorPicker();
}

document.getElementById("add-custom-color-btn").addEventListener("click", () => {
  const input = document.getElementById("custom-color-input");
  const c = input.value.trim().toLowerCase();
  if (!c || selectedColors.includes(c)) return;
  selectedColors = [...selectedColors, c];
  input.value = "";
  syncColorsInput();
  renderColorPicker();
});

renderColorPicker();

document.getElementById("generate-variants-btn").addEventListener("click", async () => {
  const productId = productForm.elements.id.value;
  if (!productId) return;
  const colors = productForm.elements.colors.value.split(",").map((c) => c.trim()).filter(Boolean);
  const sizes = productForm.elements.sizes.value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!colors.length && !sizes.length) {
    productNote.textContent = "Completa al menos colores o tallas antes de generar variantes.";
    productNote.className = "form-note is-error";
    return;
  }
  const combos = [];
  if (colors.length && sizes.length) {
    colors.forEach((c) => sizes.forEach((s) => combos.push({ color: c, size: s })));
  } else if (colors.length) {
    colors.forEach((c) => combos.push({ color: c, size: null }));
  } else {
    sizes.forEach((s) => combos.push({ color: null, size: s }));
  }
  const rows = combos.map((c) => ({ product_id: productId, color: c.color, size: c.size, stock: 100 }));
  const { error } = await sbClient
    .from("megasafety_product_variants")
    .upsert(rows, { onConflict: "product_id,color,size", ignoreDuplicates: true });
  if (error) {
    productNote.textContent = "Error generando variantes: " + error.message;
    productNote.className = "form-note is-error";
    return;
  }
  loadVariants(productId);
});

document.getElementById("new-product-btn").addEventListener("click", () => {
  productForm.reset();
  productForm.elements.id.value = "";
  productForm.elements.active.checked = true;
  setSelectedColors([]);
  productPanelTitle.textContent = "Nuevo producto";
  deleteBtn.hidden = true;
  productNote.textContent = "";
  setPhotoGallery(null, []);
  setDocLink(fichaLink, fichaRemoveBtn, null);
  setDocLink(ispLink, ispRemoveBtn, null);
  docHint.textContent = "";
  document.getElementById("variants-section").hidden = true;
  populateSubcategoryOptions(productForm.elements.category_id.value, "");
  updateDiscountPreview();
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
  productForm.elements.is_featured.checked = !!p.is_featured;
  productForm.elements.discount_percent.value = p.discount_percent || 0;
  updateDiscountPreview();
  productPanelTitle.textContent = "Editar producto";
  deleteBtn.hidden = false;
  setPhotoGallery(p.id, p.image_urls && p.image_urls.length ? p.image_urls : (p.image_url ? [p.image_url] : []));
  setDocLink(fichaLink, fichaRemoveBtn, p.ficha_tecnica_url);
  setDocLink(ispLink, ispRemoveBtn, p.registro_isp_url);
  docHint.textContent = "";
  setSelectedColors(p.colors || []);
  productForm.elements.sizes.value = (p.sizes || []).join(", ");
  document.getElementById("variants-section").hidden = false;
  loadVariants(p.id);
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
    is_featured: fd.get("is_featured") === "on",
    discount_percent: Number(fd.get("discount_percent")) || 0,
    colors: (fd.get("colors") || "").split(",").map((c) => c.trim()).filter(Boolean),
    sizes: (fd.get("sizes") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };

  productNote.textContent = "Guardando...";
  productNote.className = "form-note is-loading";

  const query = id
    ? sbClient.from("megasafety_products").update(payload).eq("id", id).select().single()
    : sbClient.from("megasafety_products").insert(payload).select().single();

  const { data: saved, error } = await query;
  if (error) {
    productNote.textContent = "Error: " + error.message;
    productNote.className = "form-note is-error";
    return;
  }
  // Keep the canonical subcategory list (used by the admin manager and the
  // storefront menu) in sync when staff types a brand-new subcategory here
  // instead of picking an existing one from the datalist.
  if (payload.subcategory && !allSubcategories.some((s) => s.category_id === payload.category_id && s.label === payload.subcategory)) {
    sbClient
      .from("megasafety_subcategories")
      .insert({ category_id: payload.category_id, label: payload.subcategory, sort_order: allSubcategories.length + 1 })
      .then(() => loadCategories());
  }
  if (!id) {
    // Brand-new product: reopen it (now with an id) so colors/tallas can be
    // used to generate variants right away instead of needing a second save.
    await loadProducts();
    openProductForm(saved);
    productNote.textContent = "Producto creado. Ya puedes subir foto, documentos y generar variantes.";
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

let staffNameById = {};

function populateWorkerFilter(staff) {
  const current = quotesMineFilter.value;
  const others = staff.filter((s) => s.user_id !== currentStaff?.user_id);
  quotesMineFilter.innerHTML =
    `<option value="all">Todas</option><option value="mine">Solo las mías</option><option value="unclaimed">Sin asignar</option>` +
    others.map((s) => `<option value="${s.user_id}">De: ${s.name || s.rut || "Sin nombre"}</option>`).join("");
  quotesMineFilter.value = [...quotesMineFilter.options].some((o) => o.value === current) ? current : "all";
}

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
  currentPeriodStart = (await getLastPeriodEnd()) || "2000-01-01T00:00:00.000Z";
  const { data: staff } = await sbClient.rpc("megasafety_staff_directory");
  staffNameById = Object.fromEntries((staff || []).map((s) => [s.user_id, s.name || s.rut || "Sin nombre"]));
  populateWorkerFilter(staff || []);
  renderQuoteStats();
  renderQuotesList();
  if (!document.getElementById("section-clientes")?.hidden) renderClientes();
  if (!document.getElementById("section-ventas")?.hidden) renderVentas();
}

function renderQuoteStats() {
  document.getElementById("qstat-total").textContent = allQuotes.length;
  document.getElementById("qstat-pendientes").textContent = allQuotes.filter((q) => q.status === "pendiente").length;
  document.getElementById("qstat-proceso").textContent = allQuotes.filter((q) => q.status === "en_proceso").length;

  // A vendedor sees only their own sold count here (otherwise it reads as
  // "you sold 3" when it's really the whole team's total, which confused
  // at least one worker) — an admin still gets the team-wide figure since
  // they're the one who needs to see overall performance.
  const isAdmin = currentStaff?.role === "admin";
  const vendidas = isAdmin
    ? allQuotes.filter((q) => q.status === "vendida")
    : allQuotes.filter((q) => q.status === "vendida" && q.claimed_by === currentStaff?.user_id);
  document.getElementById("qstat-vendidas").textContent = vendidas.length;
  document.getElementById("qstat-vendidas-label").textContent = isAdmin ? "Vendidas" : "Mis vendidas";

  const myCommission = allQuotes
    .filter((q) => q.status === "vendida" && q.claimed_by === currentStaff?.user_id && (!currentPeriodStart || q.sold_at > currentPeriodStart))
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
    const matchesMine =
      mineFilter === "all" ||
      (mineFilter === "mine" && q.claimed_by === currentStaff?.user_id) ||
      (mineFilter === "unclaimed" && !q.claimed_by) ||
      q.claimed_by === mineFilter;
    return matchesStatus && matchesMine;
  });

  quotesList.innerHTML = "";
  quotesEmpty.hidden = filtered.length > 0;

  filtered.forEach((q) => {
    const card = document.createElement("div");
    card.className = "quote-card";
    const date = new Date(q.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + new Date(q.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const itemCount = (q.megasafety_b2b_quote_items || []).reduce((s, i) => s + i.quantity, 0);
    card.innerHTML = `
      <div class="quote-card-top">
        <span class="quote-code">${escapeHtml(q.correlative_code)}</span>
        <span class="quote-badge st-${q.status}">${STATUS_LABELS[q.status]}</span>
      </div>
      <p class="quote-card-company">${escapeHtml(q.razon_social)}</p>
      <p class="quote-card-meta">${date} · ${itemCount} unidad(es) · ${escapeHtml(q.nombre_contacto)}</p>
      ${
        q.claimed_by
          ? `<p class="quote-card-claimed">Tomada por: ${
              q.claimed_by === currentStaff?.user_id
                ? "ti"
                : escapeHtml(staffNameById[q.claimed_by] || "un trabajador (ya no está en el equipo)")
            }</p>`
          : ""
      }
    `;
    card.addEventListener("click", () => openQuoteDetail(q));
    quotesList.appendChild(card);
  });
}

quotesStatusFilter.addEventListener("change", renderQuotesList);
quotesMineFilter.addEventListener("change", renderQuotesList);

// ---------- Clientes (built from quote history — no separate table needed) ----------
// Every staff member (admin or vendedor) can already read every quote
// (RLS: "staff read all quotes"), so this just groups the same allQuotes
// data already loaded for the Cotizaciones tab by RUT — no extra query.
function buildClientList() {
  const byRut = new Map();
  for (const q of allQuotes) {
    if (!q.rut) continue;
    if (!byRut.has(q.rut)) {
      byRut.set(q.rut, {
        rut: q.rut,
        razon_social: q.razon_social,
        nombre_contacto: q.nombre_contacto,
        telefono: q.telefono,
        correo: q.correo,
        quotes: [],
      });
    }
    const c = byRut.get(q.rut);
    // Keep the most recent quote's contact details as the client's
    // "current" info, in case it changed between quotes.
    if (new Date(q.created_at) > new Date(c._lastCreatedAt || 0)) {
      c.razon_social = q.razon_social;
      c.nombre_contacto = q.nombre_contacto;
      c.telefono = q.telefono;
      c.correo = q.correo;
      c._lastCreatedAt = q.created_at;
    }
    c.quotes.push(q);
  }
  return Array.from(byRut.values()).sort((a, b) => new Date(b._lastCreatedAt) - new Date(a._lastCreatedAt));
}

// Customer accounts created on the public site (megasafety_customers, staff
// read-only via RLS). Loaded once when the Clientes tab opens — one small query.
let registeredCustomers = [];
let clientesView = "rut";

async function loadRegisteredCustomers() {
  const { data, error } = await sbClient.from("megasafety_customers").select("*").order("created_at", { ascending: false });
  if (!error) registeredCustomers = data || [];
  renderClientes();
}

function quotesOfCustomer(c) {
  const email = (c.email || "").toLowerCase();
  return allQuotes.filter((q) => q.customer_user_id === c.user_id || (email && (q.correo || "").toLowerCase() === email));
}

function renderClientes() {
  const tbody = document.getElementById("clientes-tbody");
  const emptyEl = document.getElementById("clientes-empty");
  const searchInput = document.getElementById("clientes-search");
  if (!tbody) return;

  const term = (searchInput.value || "").trim().toLowerCase();
  const allClients = buildClientList();
  const registeredIds = new Set(registeredCustomers.map((c) => c.user_id));

  document.getElementById("clstat-total").textContent = allClients.length;
  document.getElementById("clstat-cotizaciones").textContent = allQuotes.length;
  const totalVendido = allQuotes
    .filter((q) => q.status === "vendida" || q.status === "pagada")
    .reduce((sum, q) => sum + (q.sale_amount || 0), 0);
  document.getElementById("clstat-vendido").textContent = "$" + totalVendido.toLocaleString("es-CL");
  document.getElementById("clstat-cuentas").textContent = registeredCustomers.length;

  document.querySelectorAll(".clientes-view-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === clientesView));
  document.getElementById("clientes-rut-wrap").hidden = clientesView !== "rut";
  document.getElementById("clientes-cuentas-wrap").hidden = clientesView !== "cuentas";

  if (clientesView === "cuentas") {
    const cuentas = registeredCustomers.filter((c) => {
      if (!term) return true;
      return [acctLikeFullName(c), c.email, c.phone, c.rut, c.company_name, c.company_rut, c.comuna]
        .some((v) => (v || "").toLowerCase().includes(term));
    });
    emptyEl.textContent = registeredCustomers.length ? "No se encontraron cuentas." : "Todavía no hay clientes con cuenta registrada en el sitio.";
    emptyEl.hidden = cuentas.length > 0;
    const cuentasTbody = document.getElementById("cuentas-tbody");
    cuentasTbody.innerHTML = cuentas
      .map((c) => {
        const place = [c.comuna, c.region].filter(Boolean).join(", ");
        return `
        <tr class="cuenta-row" data-id="${c.user_id}" style="cursor:pointer;">
          <td><strong>${escapeHtml(acctLikeFullName(c) || "-")}</strong>${c.privacy_accepted_at ? "" : `<br><span style="color:var(--ink-soft); font-size:0.78rem;">Perfil incompleto</span>`}</td>
          <td>${escapeHtml(c.email || "-")}${c.phone ? `<br><span style="color:var(--ink-soft); font-size:0.8rem;">${escapeHtml(c.phone)}</span>` : ""}</td>
          <td>${escapeHtml(c.rut || "-")}</td>
          <td>${escapeHtml(c.company_name || "-")}${c.company_rut ? `<br><span style="color:var(--ink-soft); font-size:0.8rem;">${escapeHtml(c.company_rut)}</span>` : ""}</td>
          <td>${escapeHtml(place || "-")}</td>
          <td>${quotesOfCustomer(c).length}</td>
          <td>${new Date(c.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td>${c.marketing_opt_in ? "Sí" : "No"}</td>
        </tr>`;
      })
      .join("");
    cuentasTbody.querySelectorAll(".cuenta-row").forEach((tr) => {
      tr.addEventListener("click", () => {
        const c = registeredCustomers.find((x) => x.user_id === tr.dataset.id);
        if (c) showCuentaDetail(c);
      });
    });
    return;
  }

  const clients = allClients.filter((c) => {
    if (!term) return true;
    return (
      (c.razon_social || "").toLowerCase().includes(term) ||
      (c.rut || "").toLowerCase().includes(term) ||
      (c.nombre_contacto || "").toLowerCase().includes(term) ||
      (c.correo || "").toLowerCase().includes(term)
    );
  });
  emptyEl.textContent = "No se encontraron clientes.";
  emptyEl.hidden = clients.length > 0;
  tbody.innerHTML = clients
    .map((c, idx) => {
      const vendido = c.quotes
        .filter((q) => q.status === "vendida" || q.status === "pagada")
        .reduce((sum, q) => sum + (q.sale_amount || 0), 0);
      const lastDate = new Date(c._lastCreatedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
      const hasAccount = c.quotes.some((q) => q.customer_user_id && registeredIds.has(q.customer_user_id));
      return `
      <tr class="cliente-row" data-idx="${idx}" style="cursor:pointer;">
        <td>${escapeHtml(c.razon_social || "-")}${hasAccount ? `<span class="cliente-badge">Con cuenta</span>` : ""}</td>
        <td>${escapeHtml(c.rut)}</td>
        <td>${escapeHtml(c.nombre_contacto || "-")}</td>
        <td>${escapeHtml(c.telefono || "-")}${c.correo ? `<br><span style="color:var(--ink-soft); font-size:0.8rem;">${escapeHtml(c.correo)}</span>` : ""}</td>
        <td>${c.quotes.length}</td>
        <td>$${vendido.toLocaleString("es-CL")}</td>
        <td>${lastDate}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".cliente-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const client = clients[Number(tr.dataset.idx)];
      if (client) showClienteDetail(client);
    });
  });
}

function acctLikeFullName(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

function showCuentaDetail(c) {
  const info = [
    ["Correo", c.email],
    ["Teléfono", c.phone],
    ["RUT personal", c.rut],
    ["Empresa", [c.company_name, c.company_rut].filter(Boolean).join(" · ")],
    ["Dirección", [c.address, c.comuna, c.region].filter(Boolean).join(", ")],
    ["Registro", new Date(c.created_at).toLocaleDateString("es-CL")],
    ["Aceptó uso de datos", c.privacy_accepted_at ? new Date(c.privacy_accepted_at).toLocaleDateString("es-CL") : "Aún no (perfil incompleto)"],
    ["Acepta ofertas por correo", c.marketing_opt_in ? "Sí" : "No"],
  ];
  const infoHtml = `<div class="cliente-info-grid">${info
    .map(([label, value]) => `<div><span>${label}</span>${escapeHtml(value || "-")}</div>`)
    .join("")}</div>`;
  showClienteDetail(
    { razon_social: acctLikeFullName(c) || c.email, rut: c.email, quotes: quotesOfCustomer(c) },
    infoHtml
  );
}

function showClienteDetail(client, infoHtml = "") {
  const wrap = document.getElementById("cliente-detail-wrap");
  const title = document.getElementById("cliente-detail-title");
  const list = document.getElementById("cliente-detail-list");
  title.textContent = `Historial de ${client.razon_social} (${client.rut})`;
  document.getElementById("cliente-detail-info").innerHTML = infoHtml;
  const sorted = [...client.quotes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  list.innerHTML = sorted.length
    ? sorted
        .map((q) => {
          const date = new Date(q.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
          const montoHtml =
            q.status === "vendida" || q.status === "pagada"
              ? `<strong>$${Number(q.sale_amount ?? q.total ?? 0).toLocaleString("es-CL")}</strong>`
              : q.total
                ? `$${Number(q.total).toLocaleString("es-CL")}`
                : "-";
          return `
      <div class="quote-card" style="cursor:pointer;" data-id="${q.id}">
        <div class="quote-card-top">
          <span class="quote-code">${escapeHtml(q.correlative_code)}</span>
          <span class="quote-badge st-${q.status}">${STATUS_LABELS[q.status]}</span>
        </div>
        <p class="quote-card-meta">${date} · ${montoHtml}</p>
      </div>`;
        })
        .join("")
    : `<p style="color:var(--ink-soft);">Todavía no tiene cotizaciones.</p>`;
  list.querySelectorAll(".quote-card").forEach((card) => {
    card.addEventListener("click", () => {
      const q = allQuotes.find((x) => x.id === card.dataset.id);
      if (q) openQuoteDetail(q);
    });
  });
  wrap.hidden = false;
  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("clientes-search")?.addEventListener("input", () => {
  document.getElementById("cliente-detail-wrap").hidden = true;
  renderClientes();
});

document.querySelectorAll(".clientes-view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    clientesView = btn.dataset.view;
    document.getElementById("cliente-detail-wrap").hidden = true;
    renderClientes();
  });
});

// ---------- Ventas (solo admin; agregado en el navegador sobre allQuotes) ----------
const SOLD_STATUSES = ["vendida", "pagada"];
let ventasMonth = null;
let ventasPeriodSales = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const clp = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
function clpShort(n) {
  if (n >= 1e6) return "$" + (n / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3).toLocaleString("es-CL") + "k";
  return clp(n);
}
const saleDate = (q) => q.sold_at || q.paid_at || q.created_at;
const saleAmount = (q) => q.sale_amount ?? q.total ?? 0;
function monthKeyOf(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthName(key, opts = { month: "long", year: "numeric" }) {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-CL", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prevMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  return monthKeyOf(new Date(y, m - 2, 1));
}
const sellerName = (userId) => (userId ? staffNameById[userId] || "Ex trabajador" : "Sin asignar");

// Every month from the first sale through the current month, newest first,
// so months with zero sales still show up (as a $0 bar / selectable month).
function ventasMonths(sales) {
  const now = new Date();
  const keys = [];
  const first = sales.length ? new Date(Math.min(...sales.map((q) => new Date(saleDate(q)).getTime()))) : now;
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    keys.push(monthKeyOf(d));
  }
  return keys.reverse();
}

function groupSum(list, keyFn, init, add) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, init(item));
    add(map.get(k), item);
  }
  return [...map.values()];
}

function renderVentas() {
  const select = document.getElementById("ventas-month");
  if (!select) return;
  const sales = allQuotes.filter((q) => SOLD_STATUSES.includes(q.status));
  const months = ventasMonths(sales);
  if (!ventasMonth || (ventasMonth !== "all" && !months.includes(ventasMonth))) ventasMonth = months[0];
  select.innerHTML =
    months.map((k) => `<option value="${k}">${monthName(k)}${k === months[0] ? " (mes en curso)" : ""}</option>`).join("") +
    `<option value="all">Todo el historial</option>`;
  select.value = ventasMonth;

  const period = ventasMonth === "all" ? sales : sales.filter((q) => monthKeyOf(saleDate(q)) === ventasMonth);
  period.sort((a, b) => new Date(saleDate(b)) - new Date(saleDate(a)));
  ventasPeriodSales = period;

  const total = period.reduce((s, q) => s + saleAmount(q), 0);
  const commission = period.reduce((s, q) => s + (q.commission_amount || 0), 0);
  document.getElementById("vstat-total").textContent = clp(total);
  document.getElementById("vstat-neto").textContent = clp(total / 1.19);
  document.getElementById("vstat-count").textContent = period.length;
  document.getElementById("vstat-ticket").textContent = clp(period.length ? total / period.length : 0);
  document.getElementById("vstat-comision").textContent = clp(commission);

  const compare = document.getElementById("ventas-compare");
  if (ventasMonth === "all") {
    compare.hidden = true;
  } else {
    const prevKey = prevMonthKey(ventasMonth);
    const prevTotal = sales.filter((q) => monthKeyOf(saleDate(q)) === prevKey).reduce((s, q) => s + saleAmount(q), 0);
    let text = `Mes anterior (${monthName(prevKey)}): ${clp(prevTotal)}`;
    if (prevTotal > 0) {
      const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
      text += ` — ${pct >= 0 ? "▲ +" : "▼ "}${pct}% este mes`;
    }
    if (ventasMonth === months[0]) text += ". Este mes todavía está en curso.";
    compare.textContent = text;
    compare.hidden = false;
  }

  renderVentasChart(sales, months);

  const sellers = groupSum(
    period,
    (q) => q.claimed_by || "none",
    (q) => ({ name: sellerName(q.claimed_by), count: 0, total: 0, commission: 0 }),
    (acc, q) => { acc.count += 1; acc.total += saleAmount(q); acc.commission += q.commission_amount || 0; }
  ).sort((a, b) => b.total - a.total);
  document.getElementById("ventas-sellers-tbody").innerHTML = sellers.length
    ? sellers.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${s.count}</td><td>${clp(s.total)}</td><td>${clp(s.commission)}</td></tr>`).join("")
    : `<tr><td colspan="4" style="color:var(--ink-soft);">Sin ventas</td></tr>`;

  const clients = groupSum(
    period,
    (q) => (q.rut || q.razon_social || "").trim().toLowerCase(),
    (q) => ({ name: q.razon_social, rut: q.rut, count: 0, total: 0 }),
    (acc, q) => { acc.count += 1; acc.total += saleAmount(q); }
  ).sort((a, b) => b.total - a.total).slice(0, 10);
  document.getElementById("ventas-clients-tbody").innerHTML = clients.length
    ? clients.map((c) => `<tr><td>${escapeHtml(c.name)}<br><span style="color:var(--ink-soft); font-size:0.8rem;">${escapeHtml(c.rut)}</span></td><td>${c.count}</td><td>${clp(c.total)}</td></tr>`).join("")
    : `<tr><td colspan="3" style="color:var(--ink-soft);">Sin ventas</td></tr>`;

  const items = period.flatMap((q) => (q.megasafety_b2b_quote_items || []).map((i) => ({ ...i, _quoteId: q.id })));
  const products = groupSum(
    items,
    (i) => `${(i.product_name || "").trim().toLowerCase()}|${(i.brand || "").trim().toLowerCase()}`,
    (i) => ({ name: i.product_name, brand: i.brand, units: 0, amount: 0, priced: false, quotes: new Set() }),
    (acc, i) => {
      acc.units += i.quantity || 0;
      if (i.unit_price != null) { acc.amount += (i.unit_price || 0) * (i.quantity || 0); acc.priced = true; }
      acc.quotes.add(i._quoteId);
    }
  ).sort((a, b) => b.units - a.units || b.amount - a.amount);
  document.getElementById("ventas-products-tbody").innerHTML = products.length
    ? products
        .map((p) => `<tr><td>${escapeHtml(p.name)}${p.brand ? ` <span style="color:var(--ink-soft);">(${escapeHtml(p.brand)})</span>` : ""}</td><td>${p.units.toLocaleString("es-CL")}</td><td>${p.priced ? clp(p.amount) : "—"}</td><td>${p.quotes.size}</td></tr>`)
        .join("")
    : `<tr><td colspan="4" style="color:var(--ink-soft);">Sin productos en este periodo</td></tr>`;

  const detailTbody = document.getElementById("ventas-detail-tbody");
  detailTbody.innerHTML = period
    .map(
      (q) => `
      <tr class="ventas-detail-row" data-id="${q.id}">
        <td><strong>${escapeHtml(q.correlative_code)}</strong></td>
        <td>${new Date(saleDate(q)).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</td>
        <td>${escapeHtml(q.razon_social)}</td>
        <td>${escapeHtml(sellerName(q.claimed_by))}</td>
        <td>${clp(saleAmount(q))}</td>
        <td>${clp(q.commission_amount)}</td>
      </tr>`
    )
    .join("");
  detailTbody.querySelectorAll(".ventas-detail-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const q = allQuotes.find((x) => x.id === tr.dataset.id);
      if (q) openQuoteDetail(q);
    });
  });
  document.getElementById("ventas-empty").hidden = period.length > 0;
}

function renderVentasChart(sales, months) {
  const chart = document.getElementById("ventas-chart");
  const tooltip = document.getElementById("ventas-tooltip");
  const card = chart.parentElement;
  const chrono = [...months].reverse().slice(-12);
  const bars = chrono.map((k) => {
    const monthSales = sales.filter((q) => monthKeyOf(saleDate(q)) === k);
    return { k, total: monthSales.reduce((s, q) => s + saleAmount(q), 0), count: monthSales.length };
  });
  const max = Math.max(...bars.map((b) => b.total), 1);
  chart.innerHTML = bars
    .map((b, idx) => {
      const [y, m] = b.k.split("-");
      const label = monthName(b.k, { month: "short" }).replace(".", "") + (idx === 0 || m === "01" ? ` ${y.slice(2)}` : "");
      const selected = b.k === ventasMonth;
      return `
      <button type="button" class="vbar-col${selected ? " is-selected" : ""}" data-month="${b.k}" data-total="${b.total}" data-count="${b.count}"
        aria-label="${monthName(b.k)}: ${clp(b.total)}, ${b.count} venta(s)">
        <span class="vbar-value">${selected ? clpShort(b.total) : ""}</span>
        <span class="vbar-track"><span class="vbar" style="height:${b.total ? Math.max(1.5, (b.total / max) * 100) : 0}%"></span></span>
        <span class="vbar-label">${label}</span>
      </button>`;
    })
    .join("");

  chart.querySelectorAll(".vbar-col").forEach((col) => {
    const show = () => {
      tooltip.innerHTML = `<strong>${monthName(col.dataset.month)}</strong><br>${clp(Number(col.dataset.total))} · ${col.dataset.count} venta(s)`;
      tooltip.hidden = false;
      const cardRect = card.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const tipWidth = tooltip.offsetWidth;
      const center = colRect.left - cardRect.left + colRect.width / 2;
      tooltip.style.left = Math.min(Math.max(4, center - tipWidth / 2), cardRect.width - tipWidth - 4) + "px";
    };
    const hide = () => (tooltip.hidden = true);
    col.addEventListener("mouseenter", show);
    col.addEventListener("focus", show);
    col.addEventListener("mouseleave", hide);
    col.addEventListener("blur", hide);
    col.addEventListener("click", () => {
      ventasMonth = col.dataset.month;
      tooltip.hidden = true;
      renderVentas();
    });
  });
}

document.getElementById("ventas-month")?.addEventListener("change", (e) => {
  ventasMonth = e.target.value;
  renderVentas();
});

document.getElementById("ventas-csv-btn")?.addEventListener("click", () => {
  // Text starting with = + - @ would run as a formula in Excel (customer-typed
  // names are untrusted), so prefix it with an apostrophe. Numbers stay raw.
  const cell = (v) => {
    if (typeof v === "number") return String(v);
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Código", "Fecha", "Cliente", "RUT", "Vendedor", "Vendido con IVA", "Neto sin IVA", "Comisión"];
  const rows = ventasPeriodSales.map((q) => [
    q.correlative_code,
    new Date(saleDate(q)).toLocaleDateString("es-CL"),
    q.razon_social,
    q.rut,
    sellerName(q.claimed_by),
    Math.round(saleAmount(q)),
    Math.round(saleAmount(q) / 1.19),
    q.commission_amount || 0,
  ]);
  // Semicolons + BOM so Excel in Spanish opens it with proper columns and accents.
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas-${ventasMonth === "all" ? "historial" : ventasMonth}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ---------- Quote detail drawer ----------
const quotePanel = document.getElementById("quote-panel");
const quoteOverlay = document.getElementById("quote-overlay");
const quotePanelBody = document.getElementById("quote-panel-body");

function openQuotePanel() {
  quotePanel.classList.add("is-open");
  quoteOverlay.classList.add("is-open");
  quotePanel.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeQuotePanel() {
  quotePanel.classList.remove("is-open");
  quoteOverlay.classList.remove("is-open");
  quotePanel.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
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

// Counts weekdays (Mon-Fri) strictly between the quote's creation date and
// today — used to gate the follow-up WhatsApp button until 5 business days
// have passed, per the owner's rule.
function businessDaysSince(dateStr) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(start);
  while (d < today) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function normalizeChileanPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("56")) return digits;
  if (digits.startsWith("9") && digits.length === 9) return "56" + digits;
  return digits;
}

function buildFollowupMessage(customerName) {
  return `Hola ${customerName || ""} 👋 Somos Mega Safety Chile.

Queríamos saber si pudiste revisar tu cotización. Si necesitas asesoría, realizar algún cambio o ver una muestra de algún producto antes de decidir, podemos coordinarlo contigo (sujeto a disponibilidad).

Tu cotización sigue activa y estamos disponibles para ayudarte. 😊

Mega Safety Chile
Seguridad y abastecimiento industrial`;
}

async function openQuoteDetail(q) {
  document.getElementById("quote-panel-title").textContent = q.correlative_code;
  const items = q.megasafety_b2b_quote_items || [];
  const canClaim = !q.claimed_by;
  const isMine = q.claimed_by === currentStaff?.user_id;
  const isAdmin = currentStaff?.role === "admin";
  const canPrice = q.status !== "pagada";

  // Any staff member can pick who actually made the sale (the owner allows
  // anyone to quote). The list comes from an RPC that exposes only names —
  // RLS hides other staff rows (and their commission %) from vendedores, and
  // the commission itself is computed server-side from the seller's rate.
  const { data: staffDir } = await sbClient.rpc("megasafety_staff_directory");
  const staffList = (staffDir || []).sort((a, b) => (a.name || a.rut || "").localeCompare(b.name || b.rut || ""));
  const staffLabel = (s) => s.name || s.rut || "Sin nombre";
  const sellerOptionsHtml = staffList
    .map((s) => `<option value="${s.user_id}" ${s.user_id === q.claimed_by ? "selected" : ""}>${staffLabel(s)}</option>`)
    .join("");
  const defaultSellerId = q.claimed_by || currentStaff?.user_id;
  const soldSellerOptionsHtml = staffList
    .map((s) => `<option value="${s.user_id}" ${s.user_id === defaultSellerId ? "selected" : ""}>${staffLabel(s)}${s.user_id === currentStaff?.user_id ? " (yo)" : ""}</option>`)
    .join("");

  const priceRowsHtml = items
    .map(
      (i) => `
      <div class="price-row" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        <span style="flex:1; font-size:0.88rem;">${i.quantity} x ${escapeHtml(i.product_name)}${i.brand ? ` (${escapeHtml(i.brand)})` : ""}${i.variant ? ` <strong>[${escapeHtml(i.variant)}]</strong>` : ""}</span>
        <input type="number" min="0" class="item-price-input" data-item-id="${i.id}" data-qty="${i.quantity}" value="${i.unit_price || ""}" placeholder="Precio unit." style="width:120px;" ${!canPrice ? "disabled" : ""}>
        ${canPrice ? `<button type="button" class="remove-item-btn" data-item-id="${i.id}" title="Quitar producto" style="background:none; border:none; color:#b91c1c; font-size:1.1rem; cursor:pointer; padding:0 4px;">✕</button>` : ""}
      </div>`
    )
    .join("");

  const attachmentHtml = q.attachment_url
    ? `<p class="quote-detail-row"><a href="${escapeHtml(q.attachment_url)}" target="_blank" rel="noopener" style="color:var(--navy); font-weight:700;">📎 Ver archivo adjunto del cliente</a></p>`
    : "";

  const addItemHtml = canPrice
    ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
         <input type="text" id="new-item-name" placeholder="Nombre del producto" style="flex:2; min-width:140px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
         <input type="text" id="new-item-brand" placeholder="Marca (opcional)" style="flex:1; min-width:100px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
         <input type="number" id="new-item-qty" placeholder="Cant." min="1" value="1" style="width:70px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
         <button type="button" class="btn btn--outline" id="add-item-btn">+ Agregar producto</button>
       </div>`
    : "";

  const paidInfoHtml =
    q.status === "pagada"
      ? `<p class="quote-detail-row" style="margin-top:6px; color:#15803d;"><strong>Pagado</strong>${q.payment_method ? ` vía ${q.payment_method}` : ""}${q.paid_at ? ` — ${new Date(q.paid_at).toLocaleString("es-CL")}` : ""}</p>`
      : "";

  const pricedHtml =
    q.status === "cotizada" || q.status === "pagada" || q.status === "rechazada"
      ? `<p class="quote-detail-row" style="margin-top:10px;"><strong>Total cotizado: $${Number(q.total || 0).toLocaleString("es-CL")}</strong> (subtotal $${Number(q.subtotal || 0).toLocaleString("es-CL")} + IVA $${Number(q.iva || 0).toLocaleString("es-CL")})</p>${paidInfoHtml}`
      : "";

  const rejectedHtml =
    q.status === "rechazada"
      ? `<p class="quote-detail-row" style="margin-top:6px; color:#b91c1c;"><strong>Rechazada por el cliente${q.rejected_reason ? `:</strong> ${escapeHtml(q.rejected_reason)}` : "</strong> (sin motivo indicado)"}</p>`
      : "";

  quotePanelBody.innerHTML = `
    <div class="quote-detail-section">
      <h4>Empresa</h4>
      <p class="quote-detail-row"><strong>${escapeHtml(q.razon_social)}</strong> — ${escapeHtml(q.rut)}</p>
      <p class="quote-detail-row">${escapeHtml(q.nombre_contacto)} · ${escapeHtml(q.telefono)} · ${escapeHtml(q.correo)}</p>
      <p class="quote-detail-row" style="color:var(--ink-soft); font-size:0.82rem;">Recibida: ${new Date(q.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })} a las ${new Date(q.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</p>
      <p class="quote-detail-row">${escapeHtml(q.direccion || "-")}, ${escapeHtml(q.comuna || "-")}, ${escapeHtml(q.region || "-")} — Despacho: ${q.requiere_despacho ? "Sí" : "No"}</p>
      ${q.observaciones ? `<p class="quote-detail-row">Obs: ${escapeHtml(q.observaciones)}</p>` : ""}
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
        <button data-action="en_proceso" class="${q.status === "en_proceso" ? "is-active" : ""}">En proceso</button>
        <button data-action="perdida" class="${q.status === "perdida" ? "is-active" : ""}">Marcar perdida</button>
      </div>
      ${
        q.status !== "vendida" && q.status !== "pagada"
          ? `<div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
               <input type="number" id="sale-amount-input" placeholder="Monto vendido (CLP)" min="0" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--border); border-radius:8px;">
               <label style="display:block; font-size:0.82rem; font-weight:600; color:var(--navy);">¿Quién hizo la venta? (se lleva la comisión)
                 <select id="sold-seller-select" style="display:block; width:100%; box-sizing:border-box; margin-top:6px; padding:10px 12px; border:1px solid var(--border); border-radius:8px;">
                   ${soldSellerOptionsHtml}
                 </select>
               </label>
               <button class="btn btn--primary" id="mark-sold-btn" type="button" style="width:100%; white-space:normal;">Marcar vendida (venta manual)</button>
             </div>`
          : ""
      }
      ${
        q.status === "vendida"
          ? `<p class="quote-detail-row" style="margin-top:10px;"><strong>Venta: $${Number(q.sale_amount || 0).toLocaleString("es-CL")}</strong> · Comisión: $${Number(q.commission_amount || 0).toLocaleString("es-CL")} (${q.commission_rate_snapshot || 0}%)</p>`
          : ""
      }
      ${
        q.claimed_by || q.status === "vendida" || q.status === "pagada"
          ? `<div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
               <label style="display:block; font-size:0.82rem; font-weight:600; color:var(--navy); margin-bottom:6px;">Vendedor asignado (quién se lleva la comisión)</label>
               <p class="admin-help" style="margin:0 0 8px;">Útil si alguien tomó la cotización pero otra persona cerró la venta — al cambiarlo, si ya está vendida se recalcula la comisión con la tasa de la persona nueva.</p>
               <div style="display:flex; gap:8px; flex-wrap:wrap;">
                 <select id="reassign-seller-select" style="flex:1; min-width:160px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
                   <option value="">Sin asignar</option>
                   ${sellerOptionsHtml}
                 </select>
                 <button type="button" class="btn btn--outline" id="reassign-seller-btn">Reasignar</button>
               </div>
             </div>`
          : ""
      }
    </div>
    <div class="quote-detail-section" style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn--outline" id="download-pdf-btn" type="button">Descargar PDF</button>
      ${isAdmin ? `<button class="btn btn--outline" id="delete-quote-btn" type="button" style="color:#b91c1c; border-color:#b91c1c;">Eliminar cotización</button>` : ""}
      ${(() => {
        const daysPassed = businessDaysSince(q.created_at);
        const phone = normalizeChileanPhone(q.telefono);
        if (daysPassed >= 5 && phone) {
          const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(buildFollowupMessage(q.nombre_contacto))}`;
          return `<a class="btn btn--primary" href="${waLink}" target="_blank" rel="noopener" style="background:#25d366; border-color:#25d366;">💬 Seguimiento por WhatsApp</a>`;
        }
        const remaining = Math.max(0, 5 - daysPassed);
        return `<span style="font-size:0.8rem; color:var(--ink-soft); align-self:center;">Seguimiento disponible en ${remaining} día(s) hábil(es)</span>`;
      })()}
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
    const patch = { status: "en_proceso" };
    if (!q.claimed_by) { patch.claimed_by = currentStaff.user_id; patch.claimed_at = new Date().toISOString(); }
    await sbClient.from("megasafety_b2b_quotes").update(patch).eq("id", q.id);
    await logQuoteEvent(q.id, "status_changed", { status: "en_proceso" });
    closeQuotePanel();
    loadQuotes();
  });

  quotePanelBody.querySelector('[data-action="perdida"]')?.addEventListener("click", async () => {
    const patch = { status: "perdida" };
    if (!q.claimed_by) { patch.claimed_by = currentStaff.user_id; patch.claimed_at = new Date().toISOString(); }
    await sbClient.from("megasafety_b2b_quotes").update(patch).eq("id", q.id);
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
    const sellerId = document.getElementById("sold-seller-select")?.value || currentStaff.user_id;
    // Commission (net of IVA × the chosen seller's rate) is computed in the
    // RPC so the seller's rate never has to be readable by whoever clicks.
    const { error } = await sbClient.rpc("megasafety_mark_quote_sold", {
      p_quote_id: q.id,
      p_seller_id: sellerId,
      p_sale_amount: Math.round(amount),
    });
    if (error) { note.textContent = "Error: " + error.message; note.className = "form-note is-error"; return; }
    await logQuoteEvent(q.id, "sold", { sale_amount: Math.round(amount), seller: sellerId });
    closeQuotePanel();
    loadQuotes();
  });

  document.getElementById("reassign-seller-btn")?.addEventListener("click", async () => {
    const select = document.getElementById("reassign-seller-select");
    const newUserId = select.value || null;
    if (newUserId === (q.claimed_by || null)) {
      note.textContent = "No hubo cambios — ya estaba asignada a esa persona.";
      return;
    }
    const { error } = await sbClient.rpc("megasafety_reassign_quote_seller", { p_quote_id: q.id, p_seller_id: newUserId });
    if (error) { note.textContent = "Error: " + error.message; note.className = "form-note is-error"; return; }
    await logQuoteEvent(q.id, "reassigned", { from: q.claimed_by || null, to: newUserId });
    closeQuotePanel();
    loadQuotes();
  });

  openQuotePanel();
}

// ---------- Cotización manual (pedidos por teléfono / WhatsApp) ----------
const manualQuotePanel = document.getElementById("manual-quote-panel");
const manualQuoteOverlay = document.getElementById("manual-quote-overlay");
const manualQuoteForm = document.getElementById("manual-quote-form");
const manualQuoteNote = document.getElementById("manual-quote-note");
const manualQuoteItemsEl = document.getElementById("manual-quote-items");
let manualQuoteItems = [];

function openManualQuotePanel() {
  manualQuoteItems = [];
  renderManualQuoteItems();
  manualQuoteForm.reset();
  manualQuoteNote.textContent = "";
  if (allProducts.length === 0) loadProducts();
  const suggestions = document.getElementById("manual-item-suggestions");
  suggestions.innerHTML = allProducts.map((p) => `<option value="${p.name}">`).join("");
  manualQuotePanel.classList.add("is-open");
  manualQuoteOverlay.classList.add("is-open");
  manualQuotePanel.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeManualQuotePanel() {
  manualQuotePanel.classList.remove("is-open");
  manualQuoteOverlay.classList.remove("is-open");
  manualQuotePanel.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.getElementById("new-manual-quote-btn").addEventListener("click", openManualQuotePanel);
document.getElementById("manual-quote-close-btn").addEventListener("click", closeManualQuotePanel);
manualQuoteOverlay.addEventListener("click", closeManualQuotePanel);

// ---------- Customer lookup (auto-fill from a previous quote by RUT/razón social) ----------
// Each triggering field (razón social, RUT) has its own dropdown directly
// below it — previously there was only one dropdown anchored under razón
// social, so typing in RUT showed suggestions in the wrong spot.
let customerLookupTimer = null;

function fillCustomerFields(c) {
  manualQuoteForm.querySelector('[name="razon_social"]').value = c.razon_social || "";
  manualQuoteForm.querySelector('[name="rut"]').value = c.rut || "";
  manualQuoteForm.querySelector('[name="nombre_contacto"]').value = c.nombre_contacto || "";
  manualQuoteForm.querySelector('[name="telefono"]').value = c.telefono || "";
  manualQuoteForm.querySelector('[name="correo"]').value = c.correo || "";
  manualQuoteForm.querySelector('[name="direccion"]').value = c.direccion || "";
  manualQuoteForm.querySelector('[name="comuna"]').value = c.comuna || "";
  manualQuoteForm.querySelector('[name="region"]').value = c.region || "";
  document.querySelectorAll(".customer-lookup-dropdown").forEach((el) => (el.hidden = true));
}

async function runCustomerLookup(term, dropdown) {
  if (term.trim().length < 2) {
    dropdown.hidden = true;
    return;
  }
  const token = await getFreshAccessToken();
  const res = await fetch(`/api/admin/search-customers?q=${encodeURIComponent(term)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok || !data.customers.length) {
    dropdown.hidden = true;
    return;
  }
  dropdown.innerHTML = data.customers
    .map(
      (c, idx) => `
      <button type="button" class="customer-lookup-item" data-idx="${idx}" style="display:block; width:100%; text-align:left; padding:8px 10px; border:none; background:none; border-bottom:1px solid var(--border); cursor:pointer; font-size:0.82rem;">
        <strong style="color:var(--navy);">${escapeHtml(c.razon_social)}</strong>${c.source === "cuenta" ? `<span class="cliente-badge">Cuenta del sitio</span>` : ""}<br>
        <span style="color:var(--ink-soft);">${escapeHtml(c.rut)} · ${escapeHtml(c.nombre_contacto || "")}</span>
      </button>`
    )
    .join("");
  dropdown.querySelectorAll(".customer-lookup-item").forEach((btn) => {
    btn.addEventListener("click", () => fillCustomerFields(data.customers[Number(btn.dataset.idx)]));
  });
  dropdown.hidden = false;
}

["razon_social", "rut"].forEach((field) => {
  const input = manualQuoteForm.querySelector(`[name="${field}"]`);
  const dropdown = document.getElementById(`customer-lookup-dropdown-${field}`);
  input.addEventListener("input", (e) => {
    clearTimeout(customerLookupTimer);
    const term = e.target.value;
    customerLookupTimer = setTimeout(() => runCustomerLookup(term, dropdown), 300);
  });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest('label[style*="position:relative"]')) {
    document.querySelectorAll(".customer-lookup-dropdown").forEach((el) => (el.hidden = true));
  }
});

const manualQuoteTotalEl = document.getElementById("manual-quote-total");

function renderManualQuoteItems() {
  if (!manualQuoteItems.length) {
    manualQuoteItemsEl.innerHTML = `<p style="color:var(--ink-soft); font-size:0.85rem; margin:0;">Sin productos agregados todavía.</p>`;
    manualQuoteTotalEl.textContent = "";
    return;
  }
  manualQuoteItemsEl.innerHTML = manualQuoteItems
    .map(
      (it, idx) => `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        <span style="flex:1; font-size:0.88rem;">${it.quantity} x ${it.product_name}${it.brand ? ` (${it.brand})` : ""}</span>
        <input type="number" min="0" class="manual-item-price-input" data-idx="${idx}" value="${it.unit_price ?? ""}" placeholder="Precio unit." style="width:110px; padding:6px 8px; border:1px solid var(--border); border-radius:6px;">
        <button type="button" class="manual-item-remove" data-idx="${idx}" style="background:none; border:none; color:#b91c1c; font-size:1.1rem; cursor:pointer; padding:0 4px;">✕</button>
      </div>`
    )
    .join("");
  manualQuoteItemsEl.querySelectorAll(".manual-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      manualQuoteItems.splice(Number(btn.dataset.idx), 1);
      renderManualQuoteItems();
    });
  });
  manualQuoteItemsEl.querySelectorAll(".manual-item-price-input").forEach((input) => {
    input.addEventListener("input", () => {
      const val = input.value === "" ? null : Number(input.value);
      manualQuoteItems[Number(input.dataset.idx)].unit_price = val;
      updateManualQuoteTotal();
    });
  });
  updateManualQuoteTotal();
}

function updateManualQuoteTotal() {
  const allPriced = manualQuoteItems.length > 0 && manualQuoteItems.every((it) => it.unit_price > 0);
  if (!allPriced) {
    const anyPriced = manualQuoteItems.some((it) => it.unit_price > 0);
    manualQuoteTotalEl.textContent = anyPriced
      ? "Ponle precio a todos los productos para dejar la cotización lista y enviada de una vez."
      : "";
    manualQuoteTotalEl.style.color = "var(--ink-soft)";
    manualQuoteTotalEl.style.fontWeight = "500";
    return;
  }
  const subtotal = manualQuoteItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;
  manualQuoteTotalEl.textContent = `Total: $${total.toLocaleString("es-CL")} (subtotal $${subtotal.toLocaleString("es-CL")} + IVA $${iva.toLocaleString("es-CL")})`;
  manualQuoteTotalEl.style.color = "var(--navy)";
  manualQuoteTotalEl.style.fontWeight = "700";
}

document.getElementById("manual-item-add-btn").addEventListener("click", () => {
  const nameInput = document.getElementById("manual-item-name");
  const brandInput = document.getElementById("manual-item-brand");
  const qtyInput = document.getElementById("manual-item-qty");
  const priceInput = document.getElementById("manual-item-price");
  const name = nameInput.value.trim();
  const brand = brandInput.value.trim();
  const qty = Number(qtyInput.value) || 1;
  const price = priceInput.value === "" ? null : Number(priceInput.value);
  if (!name) {
    manualQuoteNote.textContent = "Ingresa el nombre del producto a agregar.";
    manualQuoteNote.className = "form-note is-error";
    return;
  }
  const match = allProducts.find((p) => p.name.toLowerCase() === name.toLowerCase());
  manualQuoteItems.push({
    product_name: name,
    brand: brand || match?.brand || null,
    quantity: qty,
    category_id: match?.category_id || null,
    unit_price: price,
  });
  nameInput.value = "";
  brandInput.value = "";
  qtyInput.value = "1";
  priceInput.value = "";
  manualQuoteNote.textContent = "";
  renderManualQuoteItems();
  nameInput.focus();
});

// ---------- Product picker (browse the store catalog from the manual quote form) ----------
const productPickerPanel = document.getElementById("product-picker-panel");
const productPickerOverlay = document.getElementById("product-picker-overlay");
const productPickerList = document.getElementById("product-picker-list");
const productPickerSearch = document.getElementById("product-picker-search");

function openProductPicker() {
  if (allProducts.length === 0) loadProducts();
  productPickerSearch.value = "";
  renderProductPickerList("");
  productPickerPanel.classList.add("is-open");
  productPickerOverlay.classList.add("is-open");
  productPickerPanel.setAttribute("aria-hidden", "false");
  productPickerSearch.focus();
}
function closeProductPicker() {
  productPickerPanel.classList.remove("is-open");
  productPickerOverlay.classList.remove("is-open");
  productPickerPanel.setAttribute("aria-hidden", "true");
}
document.getElementById("open-product-picker-btn").addEventListener("click", openProductPicker);
document.getElementById("product-picker-close-btn").addEventListener("click", closeProductPicker);
productPickerOverlay.addEventListener("click", closeProductPicker);

function renderProductPickerList(term) {
  const q = term.trim().toLowerCase();
  const matches = allProducts.filter((p) => {
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
  });

  if (!allProducts.length) {
    productPickerList.innerHTML = `<p style="color:var(--ink-soft); font-size:0.85rem;">Cargando catálogo...</p>`;
    return;
  }
  if (!matches.length) {
    productPickerList.innerHTML = `<p style="color:var(--ink-soft); font-size:0.85rem;">Sin resultados.</p>`;
    return;
  }

  productPickerList.innerHTML = matches
    .slice(0, 80)
    .map(
      (p) => `
      <div style="display:flex; align-items:center; gap:10px; padding:8px; border:1px solid var(--border); border-radius:10px;">
        <div style="flex:1; min-width:0;">
          <p style="margin:0; font-weight:700; font-size:0.9rem; color:var(--navy);">${p.name}</p>
          <p style="margin:0; font-size:0.78rem; color:var(--ink-soft);">${p.brand || "-"}${p.sku ? ` · SKU ${p.sku}` : ""}</p>
        </div>
        <input type="number" min="1" value="1" class="picker-qty" data-id="${p.id}" style="width:60px; padding:6px; border:1px solid var(--border); border-radius:6px;">
        <button type="button" class="btn btn--outline picker-add-btn" data-id="${p.id}" style="white-space:nowrap;">+ Agregar</button>
      </div>`
    )
    .join("");

  productPickerList.querySelectorAll(".picker-add-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = allProducts.find((p) => String(p.id) === btn.dataset.id);
      if (!product) return;
      const qtyInput = productPickerList.querySelector(`.picker-qty[data-id="${btn.dataset.id}"]`);
      const qty = Number(qtyInput.value) || 1;
      manualQuoteItems.push({
        product_name: product.name,
        brand: product.brand || null,
        quantity: qty,
        category_id: product.category_id || null,
      });
      renderManualQuoteItems();
      btn.textContent = "✓ Agregado";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = "+ Agregar";
        btn.disabled = false;
      }, 1200);
    });
  });
}

productPickerSearch.addEventListener("input", () => renderProductPickerList(productPickerSearch.value));

manualQuoteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!manualQuoteItems.length) {
    manualQuoteNote.textContent = "Agrega al menos un producto.";
    manualQuoteNote.className = "form-note is-error";
    return;
  }
  const fd = new FormData(manualQuoteForm);
  const empresa = {
    razon_social: fd.get("razon_social"),
    rut: fd.get("rut"),
    nombre_contacto: fd.get("nombre_contacto"),
    telefono: fd.get("telefono"),
    correo: fd.get("correo"),
    direccion: fd.get("direccion"),
    comuna: fd.get("comuna"),
    region: fd.get("region"),
    requiere_despacho: fd.get("requiere_despacho") === "on",
    observaciones: fd.get("observaciones"),
  };

  const submitBtn = manualQuoteForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  manualQuoteNote.textContent = "Creando cotización...";
  manualQuoteNote.className = "form-note is-loading";

  try {
    const token = await getFreshAccessToken();
    if (!token) {
      throw new Error("Tu sesión expiró. Nada de lo que escribiste se perdió: abre el panel en otra pestaña, inicia sesión de nuevo ahí, y en esta vuelve a apretar \"Crear cotización\".");
    }
    const res = await fetch("/api/quote/create-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ empresa, items: manualQuoteItems }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (res.status === 403) {
        throw new Error("Tu sesión expiró. Nada de lo que escribiste se perdió: abre el panel en otra pestaña, inicia sesión de nuevo ahí, y en esta vuelve a apretar \"Crear cotización\".");
      }
      throw new Error(data.error || "No se pudo crear la cotización.");
    }

    if (!data.email?.sent) {
      alert(`Cotización ${data.correlative_code} creada, pero no se pudo enviar el correo al cliente: ${data.email?.reason || "error desconocido"}`);
    } else if (data.priced) {
      alert(`Cotización ${data.correlative_code} creada y enviada al cliente con precio y link de pago.`);
    }
    closeManualQuotePanel();
    loadQuotes();
  } catch (err) {
    manualQuoteNote.textContent = err.message || "No se pudo crear la cotización.";
    manualQuoteNote.className = "form-note is-error";
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Equipo (solo admin) ----------
const staffTbody = document.getElementById("staff-tbody");
const staffForm = document.getElementById("staff-form");
const staffNote = document.getElementById("staff-note");

// Commissions are tracked by period instead of a single lifetime running
// total: "cerrar mes" snapshots everyone's sold/commission totals since the
// last close into megasafety_commission_periods (+ ..._period_items), then
// the "current period" simply starts counting from that close's timestamp.
// Nothing is ever deleted or reset in place — every closed period stays in
// the history dropdown below, and the underlying quotes are untouched.
let currentPeriodStart = null;

async function getLastPeriodEnd() {
  const { data } = await sbClient
    .from("megasafety_commission_periods")
    .select("period_end")
    .order("period_end", { ascending: false })
    .limit(1);
  return data && data.length ? data[0].period_end : null;
}

async function loadStaff() {
  const { data, error } = await sbClient
    .from("megasafety_admins")
    .select("*")
    .order("role", { ascending: false });
  if (error) return;

  const lastClose = await getLastPeriodEnd();
  currentPeriodStart = lastClose || "2000-01-01T00:00:00.000Z";
  const periodLabel = document.getElementById("commission-period-label");
  if (periodLabel) {
    const startStr = new Date(currentPeriodStart).toLocaleDateString("es-CL");
    periodLabel.textContent = lastClose
      ? `Periodo actual: desde el ${startStr} (último cierre)`
      : "Periodo actual: desde el inicio (aún no se ha cerrado ningún mes)";
  }

  let soldQuery = sbClient
    .from("megasafety_b2b_quotes")
    .select("claimed_by, sale_amount, commission_amount")
    .eq("status", "vendida")
    .gt("sold_at", currentPeriodStart);
  const { data: sold } = await soldQuery;

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
        <button class="row-edit-btn edit-name-btn" type="button">Editar nombre</button>
        <button class="row-edit-btn reset-pass-btn" type="button">Restablecer clave</button>
        ${s.user_id === currentStaff?.user_id ? "" : `<button class="row-edit-btn delete-staff-btn" type="button">Eliminar</button>`}
      </td>
    `;
    tr.querySelector(".edit-name-btn").addEventListener("click", async () => {
      const newName = prompt(`Nuevo nombre para ${s.name || s.rut}:`, s.name || "");
      if (newName === null) return;
      const trimmed = newName.trim();
      if (!trimmed) { alert("El nombre no puede quedar vacío."); return; }
      const { error: nameErr } = await sbClient.from("megasafety_admins").update({ name: trimmed }).eq("user_id", s.user_id);
      if (nameErr) { alert("No se pudo cambiar el nombre: " + nameErr.message); return; }
      if (s.user_id === currentStaff?.user_id) {
        currentStaff.name = trimmed;
        document.getElementById("admin-welcome").textContent =
          `Hola, ${trimmed} (${currentStaff.role === "admin" ? "Administrador" : "Vendedor"})`;
      }
      loadStaff();
      loadQuotes();
    });
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
    tr.querySelector(".delete-staff-btn")?.addEventListener("click", async () => {
      if (!confirm(`¿Quitar a ${s.name || s.rut} del equipo? Perderá acceso al panel.`)) return;
      await sbClient.from("megasafety_admins").delete().eq("user_id", s.user_id);
      loadStaff();
    });
    staffTbody.appendChild(tr);
  });
}

document.getElementById("close-month-btn")?.addEventListener("click", async () => {
  const periodStart = currentPeriodStart;
  const periodEnd = new Date().toISOString();

  const [{ data: staffList }, { data: sold, error: soldErr }] = await Promise.all([
    sbClient.from("megasafety_admins").select("user_id, name, rut"),
    sbClient
      .from("megasafety_b2b_quotes")
      .select("claimed_by, sale_amount, commission_amount")
      .eq("status", "vendida")
      .gt("sold_at", periodStart),
  ]);
  if (soldErr) { alert("No se pudo calcular el periodo: " + soldErr.message); return; }

  const totalsByUser = {};
  (sold || []).forEach((q) => {
    if (!q.claimed_by) return;
    if (!totalsByUser[q.claimed_by]) totalsByUser[q.claimed_by] = { sold: 0, commission: 0, count: 0 };
    totalsByUser[q.claimed_by].sold += q.sale_amount || 0;
    totalsByUser[q.claimed_by].commission += q.commission_amount || 0;
    totalsByUser[q.claimed_by].count += 1;
  });

  const totalSold = Object.values(totalsByUser).reduce((sum, t) => sum + t.sold, 0);
  const totalCommission = Object.values(totalsByUser).reduce((sum, t) => sum + t.commission, 0);
  const startStr = new Date(periodStart).toLocaleDateString("es-CL");
  const endStr = new Date(periodEnd).toLocaleDateString("es-CL");
  if (
    !confirm(
      `¿Cerrar el periodo del ${startStr} al ${endStr}?\n\nTotal vendido: $${totalSold.toLocaleString("es-CL")}\nTotal comisiones: $${totalCommission.toLocaleString("es-CL")}\n\nQueda guardado en el historial y el conteo de cada vendedor vuelve a partir de $0 para el siguiente periodo.`
    )
  ) {
    return;
  }

  const label = `${startStr} — ${endStr}`;
  const { data: periodRow, error: periodErr } = await sbClient
    .from("megasafety_commission_periods")
    .insert({ label, period_start: periodStart, period_end: periodEnd, closed_by: currentStaff?.user_id })
    .select()
    .single();
  if (periodErr) { alert("No se pudo cerrar el periodo: " + periodErr.message); return; }

  const items = (staffList || []).map((s) => {
    const t = totalsByUser[s.user_id] || { sold: 0, commission: 0, count: 0 };
    return {
      period_id: periodRow.id,
      user_id: s.user_id,
      worker_name: s.name || s.rut || "-",
      sold_amount: t.sold,
      commission_amount: t.commission,
      quote_count: t.count,
    };
  });
  if (items.length) {
    const { error: itemsErr } = await sbClient.from("megasafety_commission_period_items").insert(items);
    if (itemsErr) { alert("El periodo se creó pero hubo un error guardando el detalle: " + itemsErr.message); }
  }

  alert("Mes cerrado y guardado en el historial.");
  loadStaff();
  loadCommissionPeriods();
});

async function loadCommissionPeriods() {
  const select = document.getElementById("commission-period-select");
  if (!select) return;
  const { data } = await sbClient
    .from("megasafety_commission_periods")
    .select("id, label")
    .order("closed_at", { ascending: false });
  select.innerHTML = (data || []).length
    ? `<option value="">Selecciona un periodo...</option>` + data.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")
    : `<option value="">Aún no has cerrado ningún mes</option>`;
}

document.getElementById("commission-period-select")?.addEventListener("change", async (e) => {
  const periodId = e.target.value;
  const wrap = document.getElementById("commission-history-wrap");
  const tbody = document.getElementById("commission-history-tbody");
  if (!periodId) { wrap.hidden = true; return; }
  const { data, error } = await sbClient
    .from("megasafety_commission_period_items")
    .select("*")
    .eq("period_id", periodId)
    .order("commission_amount", { ascending: false });
  if (error) { alert("No se pudo cargar el periodo: " + error.message); return; }
  tbody.innerHTML = (data || [])
    .map(
      (i) => `
      <tr>
        <td>${i.worker_name || "-"}</td>
        <td>$${(i.sold_amount || 0).toLocaleString("es-CL")}</td>
        <td>$${(i.commission_amount || 0).toLocaleString("es-CL")}</td>
        <td>${i.quote_count || 0}</td>
      </tr>`
    )
    .join("");
  wrap.hidden = false;
});

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
    staffForm.querySelector('[name="password"]').type = "password";
    staffForm.querySelector(".password-toggle").textContent = "Mostrar";
    loadStaff();
  } catch (err) {
    staffNote.textContent = err.message;
    staffNote.className = "form-note is-error";
  }
});

// ---------- Fotos del sitio (solo admin) ----------
// Site-wide marketing images (hero, banners) — distinct from product
// photos. Some of these have invisible clickable zones positioned by fixed
// percentages over the image (the home hero, the Compra Empresa hero), so
// swapping in a differently-composed photo can misalign those buttons —
// warn for those specific ones instead of just letting the admin guess.
const HOTSPOT_KEYS = new Set(["hero-mobile", "hero-desktop", "compra-hero"]);
// Pixel size of the image each slot ships with — shown as a guide so the
// admin uploads something with roughly the same proportions instead of
// guessing (a very different aspect ratio looks stretched/cropped).
const SITE_IMAGE_SIZES = {
  "hero-mobile": "738 x 1000 px (vertical)",
  "hero-desktop": "1600 x 832 px (horizontal)",
  "upload-banner": "1600 x 424 px (banner ancho)",
  "seguridad-mobile": "600 x 900 px (vertical)",
  "seguridad-desktop": "1600 x 899 px (horizontal)",
  "compra-hero": "1536 x 798 px (horizontal)",
};
const MAX_SITE_PHOTOS = 6;
const siteImagesList = document.getElementById("site-images-list");

async function loadSiteImages() {
  if (!siteImagesList) return;
  const { data, error } = await sbClient.from("megasafety_site_images").select("*").order("key");
  if (error) {
    siteImagesList.innerHTML = `<p class="form-note is-error">No se pudieron cargar: ${error.message}</p>`;
    return;
  }
  renderSiteImages(data);
}

function renderSiteImages(rows) {
  siteImagesList.innerHTML = rows
    .map((row) => {
      const urls = row.urls || [];
      const isCustom = urls.length > 0;
      const gallery = isCustom ? urls : [row.default_url];
      const sizeHint = SITE_IMAGE_SIZES[row.key];
      const photoLimit = HOTSPOT_KEYS.has(row.key) ? 1 : MAX_SITE_PHOTOS;
      return `
      <div class="category-manage-card" data-key="${row.key}" style="border:1px solid var(--border); border-radius:10px; padding:14px;">
        <p style="margin:0 0 4px; font-weight:700;">${row.label}</p>
        <p class="admin-help" style="margin:0 0 4px;">${isCustom ? `Imagen${urls.length > 1 ? "es" : ""} personalizada${urls.length > 1 ? "s" : ""} (${urls.length})` : "Usando la imagen original del sitio"}</p>
        ${sizeHint ? `<p class="admin-help" style="margin:0 0 8px;">Tamaño recomendado: ${sizeHint}</p>` : ""}
        ${
          HOTSPOT_KEYS.has(row.key)
            ? `<p class="admin-help" style="margin:0 0 8px; color:#b45309;">⚠️ Esta imagen tiene botones invisibles en posiciones fijas (categorías/menú), así que aquí no se puede activar el carrusel — solo se muestra la primera foto. Si subes una nueva, que sea una versión actualizada del mismo diseño para no desalinear los botones.</p>`
            : ""
        }
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          ${gallery
            .map(
              (url, idx) => `
            <div style="position:relative; width:140px; height:90px;">
              <img src="${url}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:var(--bg-alt);">
              ${
                isCustom
                  ? `<button type="button" class="site-image-remove-btn" data-key="${row.key}" data-url="${url}" style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:#b91c1c; color:#fff; border:none; font-size:0.7rem; cursor:pointer; line-height:1;">✕</button>`
                  : ""
              }
            </div>`
            )
            .join("")}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
          ${
            urls.length < photoLimit
              ? `<label class="btn btn--outline" style="cursor:pointer; padding:8px 12px; font-size:0.82rem;">
                   ${urls.length ? "Agregar otra foto" : "Subir foto"}
                   <input type="file" accept="image/*" class="site-image-input" data-key="${row.key}" hidden>
                 </label>`
              : `<span class="admin-help">Máximo ${photoLimit} foto${photoLimit > 1 ? "s" : ""} — quita la actual para subir otra.</span>`
          }
          ${isCustom ? `<button type="button" class="btn btn--outline site-image-reset-btn" data-key="${row.key}" style="padding:8px 12px; font-size:0.82rem;">Restablecer original</button>` : ""}
          ${
            HOTSPOT_KEYS.has(row.key)
              ? ""
              : `<label class="checkbox-row" style="margin:0; font-size:0.82rem; ${urls.length > 1 ? "" : "opacity:0.4; pointer-events:none;"}">
                   <input type="checkbox" class="site-image-carousel-toggle" data-key="${row.key}" ${row.carousel_enabled ? "checked" : ""} ${urls.length > 1 ? "" : "disabled"}>
                   Rotar como carrusel
                 </label>`
          }
        </div>
        <p class="form-note" data-status-for="${row.key}"></p>
      </div>`;
    })
    .join("");

  siteImagesList.querySelectorAll(".site-image-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      const key = input.dataset.key;
      if (!file) return;
      const statusEl = siteImagesList.querySelector(`[data-status-for="${key}"]`);
      statusEl.textContent = "Comprimiendo y subiendo...";
      statusEl.className = "form-note is-loading";
      try {
        const compressed = await compressImage(file, 1920, 0.85);
        const fd = new FormData();
        fd.append("file", compressed);
        fd.append("key", key);
        const token = await getFreshAccessToken();
        const res = await fetch("/api/admin/upload-site-image", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error al subir la imagen");
        loadSiteImages();
      } catch (err) {
        statusEl.textContent = err.message || "No se pudo subir la imagen.";
        statusEl.className = "form-note is-error";
      }
    });
  });

  siteImagesList.querySelectorAll(".site-image-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key;
      const url = btn.dataset.url;
      const statusEl = siteImagesList.querySelector(`[data-status-for="${key}"]`);
      statusEl.textContent = "Quitando...";
      statusEl.className = "form-note is-loading";
      try {
        const token = await getFreshAccessToken();
        const res = await fetch("/api/admin/remove-site-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ key, url }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error al quitar la foto");
        loadSiteImages();
      } catch (err) {
        statusEl.textContent = err.message || "No se pudo quitar la foto.";
        statusEl.className = "form-note is-error";
      }
    });
  });

  siteImagesList.querySelectorAll(".site-image-reset-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key;
      if (!confirm("¿Volver a la imagen original de esta sección? Se quitan todas las fotos que hayas subido.")) return;
      const statusEl = siteImagesList.querySelector(`[data-status-for="${key}"]`);
      statusEl.textContent = "Restableciendo...";
      statusEl.className = "form-note is-loading";
      try {
        const token = await getFreshAccessToken();
        const res = await fetch("/api/admin/reset-site-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ key }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error al restablecer");
        loadSiteImages();
      } catch (err) {
        statusEl.textContent = err.message || "No se pudo restablecer.";
        statusEl.className = "form-note is-error";
      }
    });
  });

  siteImagesList.querySelectorAll(".site-image-carousel-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const key = toggle.dataset.key;
      const { error } = await sbClient
        .from("megasafety_site_images")
        .update({ carousel_enabled: toggle.checked })
        .eq("key", key);
      if (error) {
        toggle.checked = !toggle.checked;
        alert("No se pudo actualizar: " + error.message);
      }
    });
  });
}

sbClient
  .channel("admin-site-images-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_site_images" }, () => {
    if (document.getElementById("tab-fotos") && !document.getElementById("section-fotos").hidden) loadSiteImages();
  })
  .subscribe();

showAppropriateView();
loadCategories();
