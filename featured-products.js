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
            ? `<p style="font-size:1.1rem; color:var(--navy); font-weight:800; font-family:var(--font-head); margin:0;">$${Number(p.price).toLocaleString("es-CL")}</p>`
            : `<p style="font-size:0.85rem; color:var(--red); font-weight:600; margin:0;">Cotizar</p>`;
        const waText = encodeURIComponent(`Hola, quiero cotizar: ${p.name}${p.sku ? ` (SKU ${p.sku})` : ""}.`);
        return `
        <div class="featured-card" style="scroll-snap-align:start; flex:0 0 220px; background:#fff; border:1px solid var(--border); border-radius:var(--radius); padding:16px; display:flex; flex-direction:column; gap:8px;">
          <a class="featured-thumb" href="compra-empresa.html?cat=${p.category_id}" aria-label="${p.name}" style="display:block; aspect-ratio:4/3; background:var(--bg-alt); border-radius:10px; overflow:hidden;">
            <img src="${p.image_url}" alt="${p.name}" loading="lazy" style="width:100%; height:100%; object-fit:contain;">
          </a>
          ${p.brand ? `<p style="font-size:0.72rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:var(--gold-dark); margin:0;">${p.brand}</p>` : ""}
          <p style="font-size:0.92rem; font-weight:700; color:var(--navy); margin:0; line-height:1.3;">${p.name}</p>
          ${priceHtml}
          <a class="btn btn--primary" href="https://wa.me/${WA_NUMBER}?text=${waText}" target="_blank" rel="noopener" style="text-align:center; justify-content:center; margin-top:auto; padding:9px 14px; font-size:0.85rem;">Cotizar</a>
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
