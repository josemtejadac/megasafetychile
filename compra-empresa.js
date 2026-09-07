const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

// CUSTOMER_REMEMBER_KEY and customerAuthStorage are already declared by
// account.js, which this page loads first — reusing them (not redeclaring)
// avoids a page-wide "Identifier has already been declared" SyntaxError,
// since non-module <script> tags share one global scope for const/let.
// That exact crash previously killed this entire file silently.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "msc_customer_auth", storage: customerAuthStorage },
});

const CATEGORIES = [
  { id: "cat-seguridad-industrial", label: "Seguridad personal" },
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
let activeSubcategory = null;
let searchTerm = "";
let sortMode = "relevancia";
let attachment = null; // { filename, mime, base64 }

const grid = document.getElementById("product-grid");
const emptyState = document.getElementById("empty-state");
const chipsEl = document.getElementById("cat-filter-chips");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const catalogCount = document.getElementById("catalog-count");

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
      sku: p.sku,
      category_id: p.category_id,
      name: p.name,
      brand: p.brand,
      description: p.description,
      certifications: p.certifications || [],
      price: p.price,
      image_url: p.image_url,
      colors: p.colors || [],
      sizes: p.sizes || [],
      subcategory: p.subcategory,
      ficha_tecnica_url: p.ficha_tecnica_url,
      registro_isp_url: p.registro_isp_url,
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
    activeSubcategory = null;
    chipsEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === btn));
    renderSubcategoryBanner();
    renderGrid();
  });

  const params = new URLSearchParams(window.location.search);
  const catParam = params.get("cat");
  const subParam = params.get("sub");
  if (catParam && CAT_LABEL[catParam]) {
    activeCategory = catParam;
    activeSubcategory = subParam || null;
    const allChip = chipsEl.querySelector('[data-cat="all"]');
    const targetChip = chipsEl.querySelector(`[data-cat="${catParam}"]`);
    if (allChip) allChip.classList.remove("is-active");
    if (targetChip) targetChip.classList.add("is-active");
    renderSubcategoryBanner();
    setTimeout(() => {
      document.getElementById("catalogo").scrollIntoView({ behavior: "smooth" });
    }, 150);
  }
}

function renderSubcategoryBanner() {
  let banner = document.getElementById("subcategory-banner");
  if (!activeSubcategory) {
    if (banner) banner.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "subcategory-banner";
    banner.className = "subcategory-banner";
    chipsEl.insertAdjacentElement("afterend", banner);
  }
  banner.innerHTML = `Mostrando: <strong>${activeSubcategory}</strong> <button type="button" id="clear-sub-btn">Ver toda la categoría ✕</button>`;
  document.getElementById("clear-sub-btn").addEventListener("click", () => {
    activeSubcategory = null;
    renderSubcategoryBanner();
    renderGrid();
  });
}

function renderGrid() {
  const term = searchTerm.trim().toLowerCase();
  const filtered = products.filter((p) => {
    const matchesCat = activeCategory === "all" || p.category_id === activeCategory;
    const matchesSub = !activeSubcategory || p.subcategory === activeSubcategory;
    const matchesTerm =
      !term || p.name.toLowerCase().includes(term) || (p.brand || "").toLowerCase().includes(term);
    return matchesCat && matchesSub && matchesTerm;
  });

  if (sortMode === "nombre-az") filtered.sort((a, b) => a.name.localeCompare(b.name, "es"));
  else if (sortMode === "nombre-za") filtered.sort((a, b) => b.name.localeCompare(a.name, "es"));
  else if (sortMode === "precio-asc")
    filtered.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  else if (sortMode === "precio-desc")
    filtered.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));

  catalogCount.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;

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
    card.querySelector(".product-thumb").addEventListener("click", () => openProductDetail(p));
    card.querySelector(".product-name").addEventListener("click", () => openProductDetail(p));
    grid.appendChild(card);
  });
}

// ---------- Product detail ----------
const detailPanel = document.getElementById("detail-panel");
const detailOverlay = document.getElementById("detail-overlay");
const detailBody = document.getElementById("detail-body");

const COLOR_HEX = {
  rojo: "#d62828", roja: "#d62828", azul: "#1d4ed8", amarillo: "#f5b400", amarilla: "#f5b400",
  naranjo: "#f97316", naranja: "#f97316", verde: "#16a34a", negro: "#111111", negra: "#111111",
  blanco: "#ffffff", blanca: "#ffffff", gris: "#9ca3af", "café": "#7c4a2d", beige: "#e5d3b3",
  "ámbar": "#f59e0b", celeste: "#7dd3fc", morado: "#7c3aed", rosado: "#f9a8d4", plomo: "#6b7280",
};

async function openProductDetail(p) {
  const hasColors = p.colors && p.colors.length;
  const hasSizes = p.sizes && p.sizes.length;
  let variants = [];
  if (hasColors || hasSizes) {
    const { data } = await sbClient.from("megasafety_product_variants").select("*").eq("product_id", p.id);
    variants = data || [];
  }

  // Stock lookup: exact color+size match when both dimensions exist,
  // otherwise whichever single dimension is in play.
  function stockFor(color, size) {
    const match = variants.find((v) => (v.color || null) === (color || null) && (v.size || null) === (size || null));
    return match ? match.stock : null; // null = no variant row (no stock rule defined)
  }
  // A color is selectable if it has stock in at least one size (or alone, if no sizes).
  function colorHasStock(color) {
    if (!hasSizes) return stockFor(color, null) !== 0;
    return p.sizes.some((s) => stockFor(color, s) !== 0);
  }
  function sizeHasStock(size, color) {
    if (!hasColors) return stockFor(null, size) !== 0;
    return stockFor(color || null, size) !== 0;
  }

  let selectedColor = hasColors ? p.colors.find((c) => colorHasStock(c)) || p.colors[0] : null;
  let selectedSize = hasSizes ? p.sizes.find((s) => sizeHasStock(s, selectedColor)) || p.sizes[0] : null;

  function currentStock() {
    if (!hasColors && !hasSizes) return null; // no variant system on this product
    return stockFor(selectedColor, selectedSize);
  }

  function render() {
  const variantsHtml = `
    ${
      hasColors
        ? `<div class="detail-variant-group">
             <span class="detail-variant-label">Color</span>
             <div class="detail-swatches" id="color-swatches">
               ${p.colors
                 .map((c) => {
                   const disabled = !colorHasStock(c);
                   return `<button type="button" class="swatch${c === selectedColor ? " is-selected" : ""}" data-color="${c}" ${disabled ? "disabled" : ""} style="background:${COLOR_HEX[c] || "#ccc"}; ${
                     COLOR_HEX[c] === "#ffffff" ? "border:1px solid var(--border);" : ""
                   } ${disabled ? "opacity:0.3; cursor:not-allowed;" : "cursor:pointer;"}" title="${c}${disabled ? " (agotado)" : ""}"></button>`;
                 })
                 .join("")}
             </div>
           </div>`
        : ""
    }
    ${
      hasSizes
        ? `<div class="detail-variant-group">
             <span class="detail-variant-label">Talla</span>
             <div class="detail-size-chips" id="size-chips">
               ${p.sizes
                 .map((s) => {
                   const disabled = !sizeHasStock(s, selectedColor);
                   return `<button type="button" class="size-chip${s === selectedSize ? " is-selected" : ""}" data-size="${s}" ${disabled ? "disabled" : ""} style="${disabled ? "opacity:0.35; cursor:not-allowed; text-decoration:line-through;" : "cursor:pointer;"}">${s}</button>`;
                 })
                 .join("")}
             </div>
           </div>`
        : ""
    }
    ${(hasColors || hasSizes) ? `<p class="form-note" id="variant-stock-note" style="margin:4px 0 0;"></p>` : ""}
  `;

  detailBody.innerHTML = `
    <div class="detail-photo">
      ${
        p.image_url
          ? `<img src="${p.image_url}" alt="">`
          : `<svg viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>`
      }
    </div>
    <p class="detail-brand">${p.brand || CAT_LABEL[p.category_id] || ""}</p>
    <h2 class="detail-name">${p.name}</h2>
    ${p.sku ? `<p class="detail-sku">SKU: ${p.sku}</p>` : ""}
    <p class="detail-desc">${p.description || "Sin descripción disponible."}</p>
    ${
      p.certifications && p.certifications.length
        ? `<div class="detail-certs">${p.certifications.map((c) => `<span class="cert-badge">${c}</span>`).join("")}</div>`
        : ""
    }
    ${
      p.ficha_tecnica_url || p.registro_isp_url
        ? `<div class="detail-doc-buttons">
             ${p.ficha_tecnica_url ? `<a class="btn btn--primary" href="${p.ficha_tecnica_url}" target="_blank" rel="noopener">Ver Ficha Técnica</a>` : ""}
             ${p.registro_isp_url ? `<a class="btn btn--outline" href="${p.registro_isp_url}" target="_blank" rel="noopener">Ver Registro ISP</a>` : ""}
           </div>`
        : ""
    }
    ${variantsHtml}
    <p class="detail-price ${p.price != null ? "has-price" : ""}">${
      p.price != null ? "$" + Number(p.price).toLocaleString("es-CL") : "Precio empresa según volumen"
    }</p>
    <div class="detail-actions">
      <input type="number" class="qty-input" min="1" value="1" aria-label="Cantidad">
      <button class="add-btn" type="button">Agregar a cotización</button>
    </div>
  `;

  const stock = currentStock();
  const outOfStock = stock === 0;
  const qtyInput = detailBody.querySelector(".qty-input");
  const addBtn = detailBody.querySelector(".add-btn");
  const stockNote = document.getElementById("variant-stock-note");
  if (stockNote) {
    if (outOfStock) {
      stockNote.textContent = "Sin stock para la combinación seleccionada.";
      stockNote.className = "form-note is-error";
    } else {
      stockNote.textContent = "";
    }
  }
  if (outOfStock) {
    addBtn.disabled = true;
    addBtn.textContent = "Agotado";
  }

  detailBody.querySelectorAll("#color-swatches .swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColor = btn.dataset.color;
      if (hasSizes && !sizeHasStock(selectedSize, selectedColor)) {
        selectedSize = p.sizes.find((s) => sizeHasStock(s, selectedColor)) || selectedSize;
      }
      render();
    });
  });
  detailBody.querySelectorAll("#size-chips .size-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSize = btn.dataset.size;
      render();
    });
  });

  addBtn.addEventListener("click", () => {
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    const variantText = [selectedColor, selectedSize].filter(Boolean).join(" / ") || null;
    addToCart(p, qty, variantText);
    addBtn.textContent = "Agregado ✓";
    addBtn.classList.add("is-added");
    setTimeout(() => {
      addBtn.textContent = "Agregar a cotización";
      addBtn.classList.remove("is-added");
    }, 1200);
  });
  }

  render();

  detailPanel.classList.add("is-open");
  detailOverlay.classList.add("is-open");
  detailPanel.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeProductDetail() {
  detailPanel.classList.remove("is-open");
  detailOverlay.classList.remove("is-open");
  detailPanel.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.getElementById("detail-close-btn").addEventListener("click", closeProductDetail);
detailOverlay.addEventListener("click", closeProductDetail);

searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderGrid();
});

sortSelect.addEventListener("change", (e) => {
  sortMode = e.target.value;
  renderGrid();
});

document.querySelectorAll("[data-scroll]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(btn.dataset.scroll).scrollIntoView({ behavior: "smooth" });
  });
});

// ---------- Cart logic ----------
function addToCart(product, qty, variant) {
  // Same product with a different color/talla is a separate line item.
  const lineId = variant ? `${product.id}::${variant}` : product.id;
  const existing = cart.find((i) => i.lineId === lineId);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({
      id: product.id,
      lineId,
      category_id: product.category_id,
      product_name: product.name,
      brand: product.brand,
      variant: variant || null,
      quantity: qty,
    });
  }
  saveCart(cart);
  renderCart();
}

function removeFromCart(lineId) {
  cart = cart.filter((i) => i.lineId !== lineId);
  saveCart(cart);
  renderCart();
}

function changeQty(lineId, qty) {
  const item = cart.find((i) => i.lineId === lineId);
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
        <p class="cart-item-name">${item.product_name}${item.variant ? ` <span style="color:var(--ink-soft); font-weight:600;">(${item.variant})</span>` : ""}</p>
        <p class="cart-item-brand">${item.brand || ""} · ${CAT_LABEL[item.category_id] || ""}</p>
      </div>
      <input type="number" class="cart-item-qty" min="1" value="${item.quantity}">
      <button class="cart-item-remove" aria-label="Eliminar">&times;</button>
    `;
    row.querySelector(".cart-item-qty").addEventListener("change", (e) => {
      changeQty(item.lineId, parseInt(e.target.value, 10) || 1);
    });
    row.querySelector(".cart-item-remove").addEventListener("click", () => removeFromCart(item.lineId));
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
    document.body.style.overflow = "";
  };
  const open = () => {
    panel.classList.add("is-open");
    overlay.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    // Lock background scroll so a touch-drag scrolls the panel, not the page.
    document.body.style.overflow = "hidden";
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
    direccion: fd.get("direccion"),
    comuna: fd.get("comuna"),
    region: fd.get("region"),
    requiere_despacho: fd.get("requiere_despacho") === "on",
    observaciones: fd.get("observaciones"),
  };

  submitBtn.disabled = true;
  formNote.textContent = "Enviando solicitud...";
  formNote.className = "form-note is-loading";

  try {
    const headers = { "Content-Type": "application/json" };
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch("/api/quote/submit", {
      method: "POST",
      headers,
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

// Arriving from a "Cotizar" button elsewhere on the site (e.g. the
// featured-products carousel) that just added an item to this same cart —
// open the cart panel so the customer sees it landed and can continue.
if (new URLSearchParams(window.location.search).get("added") === "1") {
  cartPanelCtl.open();
}
