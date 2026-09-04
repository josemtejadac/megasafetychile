const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    loginView.hidden = false;
    panelView.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  const { data: adminRow, error } = await supabase
    .from("megasafety_admins")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !adminRow) {
    loginNote.textContent = "Esta cuenta no tiene permisos de administrador.";
    loginNote.className = "form-note is-error";
    await supabase.auth.signOut();
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
  const { error } = await supabase.auth.signInWithPassword({
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
  await supabase.auth.signOut();
  showAppropriateView();
});

// ---------- Product list ----------
const tbody = document.getElementById("products-tbody");
const emptyState = document.getElementById("admin-empty");

async function loadProducts() {
  const { data, error } = await supabase
    .from("megasafety_products")
    .select("*")
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true });

  tbody.innerHTML = "";
  if (error) {
    emptyState.hidden = false;
    emptyState.textContent = "Error cargando productos: " + error.message;
    return;
  }
  emptyState.hidden = data.length > 0;

  data.forEach((p) => {
    const tr = document.createElement("tr");
    if (!p.active) tr.className = "admin-row-inactive";
    tr.innerHTML = `
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

document.getElementById("new-product-btn").addEventListener("click", () => {
  productForm.reset();
  productForm.elements.id.value = "";
  productForm.elements.active.checked = true;
  productPanelTitle.textContent = "Nuevo producto";
  deleteBtn.hidden = true;
  productNote.textContent = "";
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
    ? supabase.from("megasafety_products").update(payload).eq("id", id)
    : supabase.from("megasafety_products").insert(payload);

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
  const { error } = await supabase.from("megasafety_products").delete().eq("id", id);
  if (error) {
    productNote.textContent = "Error: " + error.message;
    productNote.className = "form-note is-error";
    return;
  }
  closeProductPanel();
  loadProducts();
});

showAppropriateView();
