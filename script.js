document.getElementById("year").textContent = new Date().getFullYear();

const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");

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

const catMenuBtn = document.getElementById("cat-menu-btn");
const catMenuPanel = document.getElementById("cat-menu-panel");
const catMenuOverlay = document.getElementById("cat-menu-overlay");
const catMenuClose = document.getElementById("cat-menu-close");

function openCatMenu() {
  catMenuPanel.classList.add("is-open");
  catMenuOverlay.classList.add("is-open");
  catMenuPanel.setAttribute("aria-hidden", "false");
  catMenuBtn.setAttribute("aria-expanded", "true");
}

function closeCatMenu() {
  catMenuPanel.classList.remove("is-open");
  catMenuOverlay.classList.remove("is-open");
  catMenuPanel.setAttribute("aria-hidden", "true");
  catMenuBtn.setAttribute("aria-expanded", "false");
}

catMenuBtn.addEventListener("click", openCatMenu);
catMenuClose.addEventListener("click", closeCatMenu);
catMenuOverlay.addEventListener("click", closeCatMenu);
catMenuPanel.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeCatMenu);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCatMenu();
});
