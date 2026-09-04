const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = [
  { id: "cat-seguridad-industrial", label: "Seguridad industrial" },
  { id: "cat-herramientas", label: "Herramientas y equipos" },
  { id: "cat-abrasivos", label: "Abrasivos y discos" },
  { id: "cat-soldadura", label: "Soldadura" },
  { id: "cat-vial", label: "Seguridad vial y señalización" },
  { id: "cat-loto", label: "Bloqueo L.O.T.O." },
  { id: "cat-iluminacion", label: "Iluminación industrial" },
  { id: "cat-ropa", label: "Ropa de trabajo y corporativa" },
  { id: "cat-izaje", label: "Izaje de carga" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const CART_KEY = "msc_b2b_cart";

let products = [];
let activeCategory = "all";
let searchTerm = "";
let attachment = null; // { filename, mime, base64 }

const grid = document.getElementById("product-grid");
const emptyState = document.getElementById("empty-state");
const chipsEl = document.getElementById("cat-filter-chips");
const searchInput = document.getElementById("search-input");

// ---------- Cart persistence ----------
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}
function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* localStorage unavailable, cart stays in-memory for this session */
  }
}
let cart = loadCart();

// ---------- Catalog ----------
async function loadProducts() {
  const { data, error } = await sbClient
    .from("megasafety_products")
    .select("*")
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error cargando catálogo", error);
    // Respaldo: catálogo de ejemplo si Supabase no responde.
    const res = await fetch("assets/data/productos-b2b.json");
    products = await res.json();
  } else {
    products = data.map((p) => ({
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      brand: p.brand,
      description: p.description,
      certifications: p.certifications || [],
      price: p.price,
      image_url: p.image_url,
    }));
  }
  renderChips();
  renderGrid();
}

function renderChips() {
  const frag = document.createDocumentFragment();
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.cat = cat.id;
    btn.textContent = cat.label;
    frag.appendChild(btn);
  });
  chipsEl.appendChild(frag);

  chipsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    chipsEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === btn));
    renderGrid();
  });

  const params = new URLSearchParams(window.location.search);
  const catParam = params.get("cat");
  if (catParam && CAT_LABEL[catParam]) {
    activeCategory = catParam;
    const allChip = chipsEl.querySelector('[data-cat="all"]');
    const targetChip = chipsEl.querySelector(`[data-cat="${catParam}"]`);
    if (allChip) allChip.classList.remove("is-active");
    if (targetChip) targetChip.classList.add("is-active");
    setTimeout(() => {
      document.getElementById("catalogo").scrollIntoView({ behavior: "smooth" });
    }, 150);
  }
}

function renderGrid() {
  const term = searchTerm.trim().toLowerCase();
  const filtered = products.filter((p) => {
    const matchesCat = activeCategory === "all" || p.category_id === activeCategory;
    const matchesTerm =
      !term || p.name.toLowerCase().includes(term) || (p.brand || "").toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });

  grid.innerHTML = "";
  emptyState.hidden = filtered.length > 0;

  filtered.forEach((p) => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-thumb" aria-hidden="true">
        ${
          p.image_url
            ? `<img src="${p.image_url}" alt="" loading="lazy">`
            : `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>`
        }
      </div>
      <p class="product-brand">${p.brand || ""}</p>
      <h3 class="product-name">${p.name}</h3>
      <p class="product-desc">${p.description || ""}</p>
      ${
        p.certifications && p.certifications.length
          ? `<div class="product-certs">${p.certifications.map((c) => `<span class="cert-badge">${c}</span>`).join("")}</div>`
          : ""
      }
      <p class="product-price-note ${p.price != null ? "has-price" : ""}">${
        p.price != null ? "$" + Number(p.price).toLocaleString("es-CL") : "Precio empresa según volumen"
      }</p>
      <div class="product-actions">
        <input type="number" class="qty-input" min="1" value="1" aria-label="Cantidad">
        <button class="add-btn" type="button">Agregar a cotización</button>
      </div>
    `;
    const qtyInput = card.querySelector(".qty-input");
    const addBtn = card.querySelector(".add-btn");
    addBtn.addEventListener("click", () => {
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      addToCart(p, qty);
      addBtn.textContent = "Agregado ✓";
      addBtn.classList.add("is-added");
      setTimeout(() => {
        addBtn.textContent = "Agregar a cotización";
        addBtn.classList.remove("is-added");
      }, 1200);
    });
    grid.appendChild(card);
  });
}

searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderGrid();
});

document.querySelectorAll("[data-scroll]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(btn.dataset.scroll).scrollIntoView({ behavior: "smooth" });
  });
});

// ---------- Cart logic ----------
function addToCart(product, qty) {
  const existing = cart.find((i) => i.id === product.id);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({
      id: product.id,
      category_id: product.category_id,
      product_name: product.name,
      brand: product.brand,
      quantity: qty,
    });
  }
  saveCart(cart);
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart(cart);
  renderCart();
}

function changeQty(id, qty) {
  const item = cart.find((i) => i.id === id);
  if (item) item.quantity = Math.max(1, qty);
  saveCart(cart);
  renderCart();
}

function renderCart() {
  const cartItemsEl = document.getElementById("cart-items");
  const cartEmptyEl = document.getElementById("cart-empty");
  const cartCountEl = document.getElementById("cart-count");
  const requestBtn = document.getElementById("cart-request-btn");

  const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);
  cartCountEl.textContent = totalQty;
  requestBtn.disabled = cart.length === 0;
  cartEmptyEl.hidden = cart.length > 0;

  cartItemsEl.innerHTML = "";
  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item-info">
        <p class="cart-item-name">${item.product_name}</p>
        <p class="cart-item-brand">${item.brand || ""} · ${CAT_LABEL[item.category_id] || ""}</p>
      </div>
      <input type="number" class="cart-item-qty" min="1" value="${item.quantity}">
      <button class="cart-item-remove" aria-label="Eliminar">&times;</button>
    `;
    row.querySelector(".cart-item-qty").addEventListener("change", (e) => {
      changeQty(item.id, parseInt(e.target.value, 10) || 1);
    });
    row.querySelector(".cart-item-remove").addEventListener("click", () => removeFromCart(item.id));
    cartItemsEl.appendChild(row);
  });
}

// ---------- Panels (cart / form / confirm) ----------
function setupPanel(panelId, overlayId, openBtnIds, closeBtnId) {
  const panel = document.getElementById(panelId);
  const overlay = document.getElementById(overlayId);
  const close = () => {
    panel.classList.remove("is-open");
    overlay.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  };
  const open = () => {
    panel.classList.add("is-open");
    overlay.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
  };
  openBtnIds.forEach((id) => document.getElementById(id)?.addEventListener("click", open));
  document.getElementById(closeBtnId).addEventListener("click", close);
  overlay.addEventListener("click", close);
  return { open, close };
}

const cartPanelCtl = setupPanel("cart-panel", "cart-overlay", ["cart-open-btn"], "cart-close-btn");
const formPanelCtl = setupPanel("form-panel", "form-overlay", [], "form-close-btn");
const confirmPanelCtl = setupPanel("confirm-panel", "confirm-overlay", [], "confirm-close-btn");

document.getElementById("cart-continue-btn").addEventListener("click", () => cartPanelCtl.close());
document.getElementById("cart-request-btn").addEventListener("click", () => {
  cartPanelCtl.close();
  formPanelCtl.open();
});

// ---------- Upload listado ----------
const uploadPanel = document.getElementById("upload-panel");
document.getElementById("upload-option-btn").addEventListener("click", () => {
  uploadPanel.hidden = !uploadPanel.hidden;
});
document.getElementById("upload-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const hint = document.getElementById("upload-hint");
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    hint.textContent = "El archivo supera 5MB. Elige uno más liviano.";
    attachment = null;
    return;
  }
  const base64 = await fileToBase64(file);
  attachment = { filename: file.name, mime: file.type || "application/octet-stream", base64 };
  hint.textContent = `Adjunto listo: ${file.name}. Completa el formulario de empresa para enviarlo con tu solicitud.`;
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Form submit ----------
const form = document.getElementById("quote-form");
const formNote = document.getElementById("form-note");
const submitBtn = document.getElementById("form-submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (cart.length === 0) {
    formNote.textContent = "Agrega al menos un producto antes de enviar.";
    formNote.className = "form-note is-error";
    return;
  }

  const fd = new FormData(form);
  const empresa = {
    razon_social: fd.get("razon_social"),
    rut: fd.get("rut"),
    nombre_contacto: fd.get("nombre_contacto"),
    telefono: fd.get("telefono"),
    correo: fd.get("correo"),
    comuna: fd.get("comuna"),
    region: fd.get("region"),
    requiere_despacho: fd.get("requiere_despacho") === "on",
    observaciones: fd.get("observaciones"),
  };

  submitBtn.disabled = true;
  formNote.textContent = "Enviando solicitud...";
  formNote.className = "form-note is-loading";

  try {
    const res = await fetch("/api/quote/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa, items: cart, attachment }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error al enviar la solicitud");

    document.getElementById("confirm-code").textContent = `Solicitud ${data.correlative_code}`;
    formPanelCtl.close();
    confirmPanelCtl.open();
    form.reset();
    attachment = null;
    uploadPanel.hidden = true;
    cart = [];
    saveCart(cart);
    renderCart();
    formNote.textContent = "";
  } catch (err) {
    formNote.textContent = err.message || "No se pudo enviar la solicitud. Intenta nuevamente.";
    formNote.className = "form-note is-error";
  } finally {
    submitBtn.disabled = false;
  }
});

loadProducts();
renderCart();
