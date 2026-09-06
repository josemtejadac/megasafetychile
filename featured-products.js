(function initFeaturedProducts() {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
  const WA_NUMBER = "56983061338";

  const track = document.getElementById("featured-track");
  if (!track) return;

  fetch(
    `${SUPABASE_URL}/rest/v1/megasafety_products?select=id,sku,name,brand,image_url,price,category_id&active=eq.true&image_url=not.is.null&order=sort_order.asc&limit=16`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  )
    .then((res) => (res.ok ? res.json() : []))
    .then((products) => {
      if (!products.length) {
        document.getElementById("featured-carousel")?.setAttribute("hidden", "");
        return;
      }
      renderCards(products);
    })
    .catch(() => document.getElementById("featured-carousel")?.setAttribute("hidden", ""));

  function renderCards(products) {
    track.innerHTML = products
      .map((p) => {
        const priceHtml =
          p.price != null
            ? `<p class="featured-price has-price">$${Number(p.price).toLocaleString("es-CL")}</p>`
            : `<p class="featured-price">Cotizar</p>`;
        const waText = encodeURIComponent(`Hola, quiero cotizar: ${p.name}${p.sku ? ` (SKU ${p.sku})` : ""}.`);
        return `
        <div class="featured-card">
          <a class="featured-thumb" href="compra-empresa.html?cat=${p.category_id}" aria-label="${p.name}">
            <img src="${p.image_url}" alt="${p.name}" loading="lazy">
          </a>
          ${p.brand ? `<p class="featured-brand">${p.brand}</p>` : ""}
          <p class="featured-name">${p.name}</p>
          ${priceHtml}
          <a class="btn btn--primary featured-cta" href="https://wa.me/${WA_NUMBER}?text=${waText}" target="_blank" rel="noopener">Cotizar</a>
        </div>`;
      })
      .join("");

    const container = document.getElementById("featured-scroll");
    const prevBtn = document.getElementById("featured-prev");
    const nextBtn = document.getElementById("featured-next");

    function cardStep() {
      const card = track.querySelector(".featured-card");
      return card ? card.getBoundingClientRect().width + 20 : 260;
    }

    function scrollNext() {
      const step = cardStep();
      const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - step / 2;
      container.scrollTo({ left: atEnd ? 0 : container.scrollLeft + step, behavior: "smooth" });
    }
    function scrollPrev() {
      container.scrollBy({ left: -cardStep(), behavior: "smooth" });
    }

    let timer = setInterval(scrollNext, 3000);
    const restart = () => {
      clearInterval(timer);
      timer = setInterval(scrollNext, 3000);
    };
    nextBtn.addEventListener("click", () => { scrollNext(); restart(); });
    prevBtn.addEventListener("click", () => { scrollPrev(); restart(); });
    container.addEventListener("mouseenter", () => clearInterval(timer));
    container.addEventListener("mouseleave", restart);
  }
})();
