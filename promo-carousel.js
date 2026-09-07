(function initPromoCarousel() {
  const WA_NUMBER = "56983061338";
  const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

  const SLIDES = [
    { img: "assets/img/promo/promo-12.jpg", alt: "Todo para tu operación, en un solo lugar", href: "compra-empresa.html" },
    { img: "assets/img/promo/promo-13.jpg", alt: "Abastecimiento para empresas y faenas", href: "compra-empresa.html" },
    { img: "assets/img/promo/promo-14.jpg", alt: "Despachos a toda la RM y regiones", href: "compra-empresa.html" },
    { img: "assets/img/promo/promo-15.jpg", alt: "La prevención también es productividad", href: "compra-empresa.html?cat=cat-seguridad-industrial" },
  ];

  const track = document.getElementById("promo-track");
  const dotsWrap = document.getElementById("promo-dots");
  const prevBtn = document.getElementById("promo-prev");
  const nextBtn = document.getElementById("promo-next");
  const section = document.getElementById("promo-carousel");

  track.innerHTML = SLIDES.map(
    (s) => `
      <a class="promo-slide" href="${s.href}" target="${s.href.startsWith("http") ? "_blank" : "_self"}" rel="noopener">
        <img src="${s.img}" alt="${s.alt}" loading="lazy">
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

  let timer = setInterval(() => goTo(current + 1), 3000);
  section.addEventListener("mouseenter", () => clearInterval(timer));
  section.addEventListener("mouseleave", () => {
    timer = setInterval(() => goTo(current + 1), 3000);
  });

  goTo(0);
})();
