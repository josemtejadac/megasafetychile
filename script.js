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
catMenuPanel.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeCatMenu);
});

catMenuPanel.querySelectorAll(".cat-menu-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".cat-menu-item");
    const wasOpen = item.classList.contains("is-open");
    catMenuPanel.querySelectorAll(".cat-menu-item").forEach((i) => i.classList.remove("is-open"));
    if (!wasOpen) item.classList.add("is-open");
  });
});
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
