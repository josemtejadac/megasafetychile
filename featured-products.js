(function initFeaturedProducts() {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
  const WA_NUMBER = "56983061338";

  const track = document.getElementById("featured-track");
  if (!track) return;

  const baseUrl = `${SUPABASE_URL}/rest/v1/megasafety_products?select=id,sku,name,brand,image_url,price,category_id&active=eq.true&image_url=not.is.null`;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  // Prefer admin-curated picks (is_featured=true); only fall back to an
  // arbitrary sort_order sample if nothing has been curated yet.
  fetch(`${baseUrl}&is_featured=eq.true&order=sort_order.asc&limit=10`, { headers })
    .then((res) => (res.ok ? res.json() : []))
    .then((featured) => {
      if (featured.length) return featured;
      return fetch(`${baseUrl}&order=sort_order.asc&limit=10`, { headers }).then((res) => (res.ok ? res.json() : []));
    })
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
            ? `<p style="font-size:1.05rem; color:var(--navy); font-weight:800; font-family:var(--font-head); margin:0;">$${Number(p.price).toLocaleString("es-CL")}</p>`
            : `<p style="font-size:0.78rem; color:var(--ink-soft); font-weight:600; margin:0;">Precio a cotizar</p>`;
        const waText = encodeURIComponent(`Hola, quiero cotizar: ${p.name}${p.sku ? ` (SKU ${p.sku})` : ""}.`);
        return `
        <div class="featured-card" style="scroll-snap-align:start; flex:0 0 200px; width:200px; height:330px; background:#fff; border:1px solid #e3e7ee; border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:6px; box-shadow:0 6px 18px -8px rgba(11,31,58,0.18);">
          <a href="compra-empresa.html?cat=${p.category_id}" aria-label="${p.name}" style="display:block; width:100%; height:130px; background:#f4f6fa; border-radius:10px; overflow:hidden; flex-shrink:0;">
            <img src="${p.image_url}" alt="${p.name}" loading="lazy" style="width:100%; height:100%; object-fit:contain; display:block;">
          </a>
          ${p.brand ? `<p style="font-size:0.68rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#c9a11d; margin:8px 0 0;">${p.brand}</p>` : ""}
          <p style="font-size:0.85rem; font-weight:700; color:var(--navy); margin:0; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${p.name}</p>
          ${priceHtml}
          <a class="btn btn--primary" href="https://wa.me/${WA_NUMBER}?text=${waText}" target="_blank" rel="noopener" style="text-align:center; justify-content:center; margin-top:auto; padding:8px 12px; font-size:0.8rem; border-radius:999px;">Cotizar</a>
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
