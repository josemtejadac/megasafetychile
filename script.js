// This file is shared across pages that don't all have a footer/main-nav
// (e.g. compra-empresa.html) — guard each lookup so a missing element on
// one page doesn't throw and abort the rest of the script.
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");

if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const catMenuBtn = document.getElementById("cat-menu-btn");
const catMenuPanel = document.getElementById("cat-menu-panel");
const catMenuOverlay = document.getElementById("cat-menu-overlay");
const catMenuClose = document.getElementById("cat-menu-close");

function openCatMenu() {
  catMenuPanel.classList.add("is-open");
  catMenuOverlay.classList.add("is-open");
  catMenuPanel.setAttribute("aria-hidden", "false");
  catMenuBtn.setAttribute("aria-expanded", "true");
  // Lock background scroll so a touch-drag on mobile scrolls the panel's
  // own content instead of the page underneath it.
  document.body.style.overflow = "hidden";
}

function closeCatMenu() {
  catMenuPanel.classList.remove("is-open");
  catMenuOverlay.classList.remove("is-open");
  catMenuPanel.setAttribute("aria-hidden", "true");
  catMenuBtn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

catMenuBtn.addEventListener("click", openCatMenu);
catMenuClose.addEventListener("click", closeCatMenu);
catMenuOverlay.addEventListener("click", closeCatMenu);

// Wires link-closes-menu and toggle-expands-submenu behavior within
// `scope` — called once for the static menu at load, and again (scoped to
// just the newly-injected items) whenever a category the admin created
// gets appended live, so it doesn't need double-binding the original ones.
function wireCatMenuScope(scope) {
  scope.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeCatMenu);
  });
  scope.querySelectorAll(".cat-menu-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".cat-menu-item");
      const wasOpen = item.classList.contains("is-open");
      catMenuPanel.querySelectorAll(".cat-menu-item").forEach((i) => i.classList.remove("is-open"));
      if (!wasOpen) item.classList.add("is-open");
    });
  });
}
wireCatMenuScope(catMenuPanel);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCatMenu();
});

// ---------- Home page upload dropzone (¿Ya tienes tu listado armado?) ----------
// Lets a visitor drag/drop or click-select a file right from the home page;
// the file is handed off via sessionStorage to compra-empresa.html, which
// already knows how to parse/attach it (same code path as its own upload
// input) — this just adds a second entry point into that same flow.
(function () {
  const dropzone = document.getElementById("home-dropzone");
  if (!dropzone) return;

  const input = document.getElementById("home-upload-input");
  const status = document.getElementById("home-upload-status");

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = "El archivo supera 5MB. Elige uno más liviano.";
      return;
    }
    status.textContent = "Subiendo...";
    const base64 = await fileToBase64(file);
    sessionStorage.setItem(
      "msc_pending_upload",
      JSON.stringify({ filename: file.name, mime: file.type || "application/octet-stream", base64 })
    );
    window.location.href = "compra-empresa.html?upload=1";
  }

  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => handleFile(input.files[0]));

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });
})();

// ---------- Header live product search ----------
(function () {
  const btn = document.getElementById("header-search-btn");
  const panel = document.getElementById("header-search-panel");
  if (!btn || !panel) return;

  const input = document.getElementById("header-search-input");
  const results = document.getElementById("header-search-results");
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

  let debounceTimer = null;

  function open() {
    panel.hidden = false;
    btn.classList.add("is-active");
    btn.setAttribute("aria-expanded", "true");
    input.focus();
  }
  function close() {
    panel.hidden = true;
    btn.classList.remove("is-active");
    btn.setAttribute("aria-expanded", "false");
  }
  btn.addEventListener("click", () => (panel.hidden ? open() : close()));
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !e.target.closest(".header-search")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  function renderHint(text) {
    results.innerHTML = `<p class="header-search-hint">${text}</p>`;
  }

  async function runSearch(term) {
    const q = term.trim();
    if (q.length < 2) {
      renderHint("Escribe al menos 2 letras.");
      return;
    }
    renderHint("Buscando...");
    const pattern = encodeURIComponent(`*${q}*`);
    const url =
      `${SUPABASE_URL}/rest/v1/megasafety_products` +
      `?active=eq.true&or=(name.ilike.${pattern},brand.ilike.${pattern},sku.ilike.${pattern})` +
      `&select=id,name,brand,image_url&limit=6`;
    try {
      const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
      const products = await res.json();
      if (!Array.isArray(products) || !products.length) {
        renderHint("Sin resultados. Prueba con otra palabra.");
        return;
      }
      const seeAllUrl = `compra-empresa.html?q=${encodeURIComponent(q)}`;
      results.innerHTML =
        products
          .map(
            (p) => `
            <a class="header-search-item" href="compra-empresa.html?q=${encodeURIComponent(p.name)}">
              ${p.image_url ? `<img src="${p.image_url}" alt="">` : `<div style="width:40px;height:40px;border-radius:6px;background:var(--bg-alt);flex-shrink:0;"></div>`}
              <span>
                <span class="header-search-item-name" style="display:block;">${p.name}</span>
                ${p.brand ? `<span class="header-search-item-brand">${p.brand}</span>` : ""}
              </span>
            </a>`
          )
          .join("") + `<a class="header-search-seeall" href="${seeAllUrl}">Ver todos los resultados para "${q}"</a>`;
    } catch {
      renderHint("No se pudo buscar. Intenta de nuevo.");
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const term = input.value;
    debounceTimer = setTimeout(() => runSearch(term), 300);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      window.location.href = `compra-empresa.html?q=${encodeURIComponent(input.value.trim())}`;
    }
  });

  renderHint("Escribe al menos 2 letras.");
})();

// ---------- Extra categories the admin created (mega-menu) ----------
// The 9 curated categories above stay static (they're baked into the
// portada's own hero image too, unrelated to this menu) — this only
// appends categories that don't already have a static <li> here, so a
// brand-new category the admin adds from /admin.html shows up in the
// header menu without needing a code change, and live (no reload) if
// someone already has the menu open when it's created.
(function () {
  const list = document.getElementById("cat-menu-list");
  if (!list) return;

  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  async function refreshExtraCategories() {
    const knownIds = new Set(
      Array.from(list.querySelectorAll(".cat-menu-item:not(.cat-menu-item--dynamic) .cat-submenu a"))
        .map((a) => new URL(a.href).searchParams.get("cat"))
    );

    const [catsRes, subsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/megasafety_categories?select=id,label,show_in_menu&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/megasafety_subcategories?select=category_id,label&order=sort_order.asc`, { headers }),
    ]);
    if (!catsRes.ok || !subsRes.ok) return;
    const categories = await catsRes.json();
    const subcategories = await subsRes.json();

    // Only categories the owner explicitly opted in to (show_in_menu) show
    // up here — a brand-new category otherwise only appears in the
    // catalog's own filter chips, never automatically in this header menu.
    const extra = categories.filter((c) => !knownIds.has(c.id) && c.show_in_menu);

    list.querySelectorAll(".cat-menu-item--dynamic").forEach((el) => el.remove());
    if (!extra.length) return;

    const frag = document.createDocumentFragment();
    extra.forEach((cat) => {
      const subs = Array.from(
        new Set(subcategories.filter((s) => s.category_id === cat.id).map((s) => s.label))
      ).sort((a, b) => a.localeCompare(b, "es"));

      const li = document.createElement("li");
      li.className = "cat-menu-item cat-menu-item--dynamic";
      li.innerHTML = `
        <button class="cat-menu-toggle" type="button">${escapeHtml(cat.label)} <span>›</span></button>
        <ul class="cat-submenu">
          <li><a href="compra-empresa.html?cat=${encodeURIComponent(cat.id)}">Ver todo</a></li>
          ${subs
            .map((s) => `<li><a href="compra-empresa.html?cat=${encodeURIComponent(cat.id)}&sub=${encodeURIComponent(s)}">${escapeHtml(s)}</a></li>`)
            .join("")}
        </ul>`;
      frag.appendChild(li);
    });
    list.appendChild(frag);
    list.querySelectorAll(".cat-menu-item--dynamic").forEach((li) => wireCatMenuScope(li));
  }

  refreshExtraCategories();

  const rtClient = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);
  rtClient
    ?.channel("menu-categories-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_categories" }, refreshExtraCategories)
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_subcategories" }, refreshExtraCategories)
    .subscribe();
})();
