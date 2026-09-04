(function initPromoCarousel() {
  const WA_NUMBER = "56983061338";
  const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

  const SLIDES = [
    { img: "assets/img/promo/promo-1.jpg", alt: "Pack Básico $45.990", href: waLink("Hola, quiero cotizar el Pack Básico ($45.990 neto): pantalón cargo poplin + overol poplin + zapatos de seguridad Kbeen LI518.") },
    { img: "assets/img/promo/promo-2.jpg", alt: "Pack Intermedio $53.990", href: waLink("Hola, quiero cotizar el Pack Intermedio ($53.990 neto): pantalón cargo gabardina + overol gabardina + polera piqué + zapatos Kbeen LI-518.") },
    { img: "assets/img/promo/promo-3.jpg", alt: "Certificaciones de lentes de seguridad", href: "compra-empresa.html?cat=cat-seguridad-industrial&sub=" + encodeURIComponent("Protección visual y facial") },
    { img: "assets/img/promo/promo-4.jpg", alt: "Guante Cabritilla Combinado $1.070", href: waLink("Hola, quiero cotizar el Guante Cabritilla Combinado ($1.070 neto, compra desde 100 unidades).") },
    { img: "assets/img/promo/promo-5.jpg", alt: "Botín Impermeable Kbeen $16.990", href: waLink("Hola, quiero cotizar el Botín Impermeable Kbeen ($16.990 neto, compra mínima 10 pares).") },
    { img: "assets/img/promo/promo-6.jpg", alt: "Parrilla Rodeo $67.990", href: waLink("Hola, quiero cotizar la Parrilla Rodeo 1/2 tambor con tapa ($67.990).") },
    { img: "assets/img/promo/promo-7.jpg", alt: "Ropa de trabajo Poplín", href: waLink("Hola, quiero cotizar overoles/chalecos línea Poplín para mi equipo de trabajo.") },
    { img: "assets/img/promo/promo-8.jpg", alt: "Pack Full $69.990", href: waLink("Hola, quiero cotizar el Pack Full ($69.990 neto): pantalón + overol + zapatos + 2 poleras/polerón.") },
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
