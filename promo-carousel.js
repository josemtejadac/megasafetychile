(async function initPromoCarousel() {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

  const SLIDES = [
    {
      category_id: "cat-izaje",
      eyebrow: "Izaje de carga",
      title: "Cadenas y ganchos grado 80 certificados",
      text: "Todo lo que necesitas para maniobras de izaje seguras: cadenas, grilletes, tensores, eslingas y tecles.",
      href: "compra-empresa.html?cat=cat-izaje",
    },
    {
      category_id: "cat-loto",
      eyebrow: "Bloqueo L.O.T.O.",
      title: "Bloqueo y etiquetado, sin errores",
      text: "Candados, dispositivos de bloqueo y kits completos para energía cero en tu faena.",
      href: "compra-empresa.html?cat=cat-loto",
    },
    {
      category_id: "cat-ropa",
      subcategory: "Ropa térmica e impermeable",
      eyebrow: "Ropa de trabajo",
      title: "Protección térmica para el terreno",
      text: "Parkas, trajes impermeables y ropa térmica para faenas en cualquier condición climática.",
      href: "compra-empresa.html?cat=cat-ropa&sub=" + encodeURIComponent("Ropa térmica e impermeable"),
    },
    {
      category_id: "cat-seguridad-industrial",
      subcategory: "Calzado de seguridad",
      eyebrow: "Seguridad industrial",
      title: "Pisa seguro en cualquier terreno",
      text: "Botas y botines de seguridad con puntera de acero, para construcción, minería e industria.",
      href: "compra-empresa.html?cat=cat-seguridad-industrial&sub=" + encodeURIComponent("Calzado de seguridad"),
    },
    {
      category_id: "cat-abrasivos",
      eyebrow: "Abrasivos y discos",
      title: "Discos para cada tipo de corte",
      text: "Discos de corte, desbaste y acabado para acero, inox y hormigón.",
      href: "compra-empresa.html?cat=cat-abrasivos",
    },
  ];

  const section = document.getElementById("promo-carousel");
  const track = document.getElementById("promo-track");
  const dotsWrap = document.getElementById("promo-dots");
  const prevBtn = document.getElementById("promo-prev");
  const nextBtn = document.getElementById("promo-next");

  let slidesData = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/megasafety_products?select=category_id,subcategory,image_url,sort_order&image_url=not.is.null&active=eq.true&order=sort_order.asc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = res.ok ? await res.json() : [];

    slidesData = SLIDES.map((s) => {
      const match = rows.find(
        (r) => r.category_id === s.category_id && (!s.subcategory || r.subcategory === s.subcategory)
      );
      return match ? { ...s, image_url: match.image_url } : null;
    }).filter(Boolean);
  } catch {
    slidesData = [];
  }

  if (slidesData.length < 2) {
    section.hidden = true;
    return;
  }

  track.innerHTML = slidesData
    .map(
      (s) => `
      <a class="promo-slide" href="${s.href}" style="background-image:url(${s.image_url})">
        <div class="promo-slide-overlay"></div>
        <div class="promo-slide-content">
          <p class="promo-eyebrow">${s.eyebrow}</p>
          <h2>${s.title}</h2>
          <p class="promo-text">${s.text}</p>
          <span class="btn btn--primary">Ver productos</span>
        </div>
      </a>`
    )
    .join("");

  dotsWrap.innerHTML = slidesData.map((_, i) => `<button class="promo-dot" data-i="${i}"></button>`).join("");

  let current = 0;
  const dots = dotsWrap.querySelectorAll(".promo-dot");

  function goTo(i) {
    current = (i + slidesData.length) % slidesData.length;
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
