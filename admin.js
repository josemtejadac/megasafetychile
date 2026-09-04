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

const loginView = document.getElementById("login-view");
const panelView = document.getElementById("panel-view");
const logoutBtn = document.getElementById("logout-btn");
const loginForm = document.getElementById("login-form");
const loginNote = document.getElementById("login-note");

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
    .select("user_id")
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

  loginView.hidden = true;
  panelView.hidden = false;
  logoutBtn.hidden = false;
  loadProducts();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  loginNote.textContent = "Ingresando...";
  loginNote.className = "form-note is-loading";
  const { error } = await sbClient.auth.signInWithPassword({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (error) {
    loginNote.textContent = "Correo o contraseña incorrectos.";
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
      <td>${CATEGORY_LABELS[p.category_id] || p.category_id}</td>
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
  openProductPanel();
});

function openProductForm(p) {
  productForm.reset();
  productForm.elements.id.value = p.id;
  productForm.elements.sku.value = p.sku || "";
  productForm.elements.name.value = p.name || "";
  productForm.elements.brand.value = p.brand || "";
  productForm.elements.category_id.value = p.category_id;
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

showAppropriateView();
