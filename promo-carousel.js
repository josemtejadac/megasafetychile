(function initPromoCarousel() {
  const SLIDES = [
    {
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 3 6v6c0 5 3.8 9 9 10 5.2-1 9-5 9-10V6l-9-4Z"/><path d="m9 12 2 2 4-4"/></svg>',
      eyebrow: "Izaje de carga",
      title: "Cadenas y ganchos grado 80 certificados",
      text: "Todo lo que necesitas para maniobras de izaje seguras: cadenas, grilletes, tensores, eslingas y tecles.",
      href: "compra-empresa.html?cat=cat-izaje",
    },
    {
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      eyebrow: "Bloqueo L.O.T.O.",
      title: "Bloqueo y etiquetado, sin errores",
      text: "Candados, dispositivos de bloqueo y kits completos para energía cero en tu faena.",
      href: "compra-empresa.html?cat=cat-loto",
    },
    {
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="9" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
      eyebrow: "Ropa de trabajo",
      title: "Protección térmica para el terreno",
      text: "Parkas, trajes impermeables y ropa térmica para faenas en cualquier condición climática.",
      href: "compra-empresa.html?cat=cat-ropa&sub=" + encodeURIComponent("Ropa térmica e impermeable"),
    },
    {
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 22V12l8-8 8 8v10"/><path d="M9 22v-6h6v6"/></svg>',
      eyebrow: "Seguridad industrial",
      title: "Pisa seguro en cualquier terreno",
      text: "Botas y botines de seguridad con puntera de acero, para construcción, minería e industria.",
      href: "compra-empresa.html?cat=cat-seguridad-industrial&sub=" + encodeURIComponent("Calzado de seguridad"),
    },
    {
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
      eyebrow: "Abrasivos y discos",
      title: "Discos para cada tipo de corte",
      text: "Discos de corte, desbaste y acabado para acero, inox y hormigón.",
      href: "compra-empresa.html?cat=cat-abrasivos",
    },
  ];

  const track = document.getElementById("promo-track");
  const dotsWrap = document.getElementById("promo-dots");
  const prevBtn = document.getElementById("promo-prev");
  const nextBtn = document.getElementById("promo-next");
  const section = document.getElementById("promo-carousel");

  track.innerHTML = SLIDES.map(
    (s, i) => `
      <a class="promo-slide promo-slide--${i % 3}" href="${s.href}">
        <div class="promo-slide-icon">${s.icon}</div>
        <div class="promo-slide-content">
          <p class="promo-eyebrow">${s.eyebrow}</p>
          <h2>${s.title}</h2>
          <p class="promo-text">${s.text}</p>
          <span class="btn btn--primary">Ver productos</span>
        </div>
      </a>`
  ).join("");

  dotsWrap.innerHTML = SLIDES.map((_, i) => `<button class="promo-dot" data-i="${i}"></button>`).join("");

  let current = 0;
  const dots = dotsWrap.querySelectorAll(".promo-dot");

  function goTo(i) {
    current = (i + SLIDES.length) % SLIDES.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, idx) => d.classList.toggle("is-active", idx === current));
  }

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
  dots.forEach((d) => d.addEventListener("click", () => goTo(Number(d.dataset.i))));

  let timer = setInterval(() => goTo(current + 1), 5000);
  section.addEventListener("mouseenter", () => clearInterval(timer));
  section.addEventListener("mouseleave", () => {
    timer = setInterval(() => goTo(current + 1), 5000);
  });

  goTo(0);
})();
