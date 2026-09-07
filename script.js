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
