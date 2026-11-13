(function initFeaturedProducts() {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

  // Same cart the B2B catalog (compra-empresa.js) reads — "Cotizar" here adds
  // to that real cart and sends the shopper to finish the quote request
  // there, instead of opening WhatsApp. That's what actually reaches the
  // company's email and shows up in the admin/staff quotes panel.
  const CART_KEY = "msc_b2b_cart";
  function addToCart(product) {
    let cart = [];
    try {
      cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      cart = [];
    }
    const existing = cart.find((i) => i.lineId === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: product.id,
        lineId: product.id,
        category_id: product.category_id,
        product_name: product.name,
        brand: product.brand,
        variant: null,
        quantity: 1,
      });
    }
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* localStorage unavailable — nothing to persist, just continue */
    }
  }

  const track = document.getElementById("featured-track");
  if (!track) return;

  const baseUrl = `${SUPABASE_URL}/rest/v1/megasafety_products?select=id,sku,name,brand,image_url,price,discount_percent,category_id&active=eq.true&image_url=not.is.null`;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  // Admin-curated picks (is_featured) first, then the products customers
  // actually request most in quotes ("Lo más pedido"), then any other
  // product with a photo — so the carousel always has enough cards to
  // scroll (with only the 5 curated ones the arrows had nothing to move).
  const LIMIT = 12;
  const getJson = (url, opts) => fetch(url, opts).then((res) => (res.ok ? res.json() : [])).catch(() => []);

  async function loadCarouselProducts() {
    const [featured, top] = await Promise.all([
      getJson(`${baseUrl}&is_featured=eq.true&order=sort_order.asc&limit=${LIMIT}`, { headers }),
      getJson(`${SUPABASE_URL}/rest/v1/rpc/megasafety_top_requested_products`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_limit: LIMIT }),
      }),
    ]);
    const list = [...featured];
    const seen = new Set(list.map((p) => p.id));
    const topIds = (Array.isArray(top) ? top : []).map((r) => r.product_id).filter((pid) => pid && !seen.has(pid));
    if (topIds.length && list.length < LIMIT) {
      const rows = await getJson(`${baseUrl}&id=in.(${topIds.join(",")})`, { headers });
      topIds.forEach((pid) => {
        const p = rows.find((r) => r.id === pid);
        if (p && list.length < LIMIT) { list.push(p); seen.add(pid); }
      });
    }
    if (list.length < LIMIT) {
      const filler = await getJson(`${baseUrl}&order=sort_order.asc&limit=${LIMIT * 2}`, { headers });
      filler.forEach((p) => {
        if (!seen.has(p.id) && list.length < LIMIT) { list.push(p); seen.add(p.id); }
      });
    }
    return list;
  }

  loadCarouselProducts()
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
        const hasDiscount = p.price != null && p.discount_percent > 0;
        const discounted = hasDiscount ? Math.round(p.price * (1 - p.discount_percent / 100)) : null;
        const priceHtml = hasDiscount
          ? `<div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
               <span style="font-size:0.78rem; color:var(--ink-soft); text-decoration:line-through;">$${Number(p.price).toLocaleString("es-CL")}</span>
               <span style="font-size:1.05rem; color:var(--red); font-weight:800; font-family:var(--font-head);">$${discounted.toLocaleString("es-CL")}</span>
             </div>`
          : p.price != null
            ? `<p style="font-size:1.05rem; color:var(--navy); font-weight:800; font-family:var(--font-head); margin:0;">$${Number(p.price).toLocaleString("es-CL")}</p>`
            : `<p style="font-size:0.84rem; color:var(--ink-soft); font-weight:600; margin:0;">Precio a cotizar</p>`;
        return `
        <div class="featured-card" style="scroll-snap-align:start; flex:0 0 232px; width:232px; height:372px; background:#fff; border:1px solid #e3e7ee; border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:7px; box-shadow:0 6px 18px -8px rgba(11,31,58,0.18); position:relative;">
          ${hasDiscount ? `<span style="position:absolute; top:10px; left:10px; z-index:1; background:var(--red); color:#fff; font-size:0.72rem; font-weight:800; padding:3px 8px; border-radius:999px;">-${p.discount_percent}%</span>` : ""}
          <a href="compra-empresa.html?product=${p.id}" aria-label="${p.name}" style="display:block; width:100%; height:160px; background:#fff; border-radius:10px; overflow:hidden; flex-shrink:0;">
            <img src="${p.image_url}" alt="${p.name}" loading="lazy" style="width:100%; height:100%; object-fit:contain; display:block;">
          </a>
          ${p.brand ? `<p style="font-size:0.72rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#c9a11d; margin:8px 0 0;">${p.brand}</p>` : ""}
          <p style="font-size:0.94rem; font-weight:700; color:var(--navy); margin:0; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${p.name}</p>
          ${priceHtml}
          <button type="button" class="btn btn--primary featured-quote-btn" data-id="${p.id}" data-name="${p.name.replace(/"/g, "&quot;")}" data-brand="${(p.brand || "").replace(/"/g, "&quot;")}" data-cat="${p.category_id}" style="text-align:center; justify-content:center; margin-top:auto; padding:10px 14px; font-size:0.86rem; border-radius:999px; cursor:pointer; border:none;">Cotizar</button>
        </div>`;
      })
      .join("");

    track.querySelectorAll(".featured-quote-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        addToCart({
          id: btn.dataset.id,
          name: btn.dataset.name,
          brand: btn.dataset.brand || null,
          category_id: btn.dataset.cat,
        });
        window.location.href = "compra-empresa.html?added=1";
      });
    });

    const container = document.getElementById("featured-scroll");
    const prevBtn = document.getElementById("featured-prev");
    const nextBtn = document.getElementById("featured-next");

    // Distance between two cards' left edges (card width + the real gap).
    function cardStep() {
      const cards = track.querySelectorAll(".featured-card");
      if (cards.length > 1) return cards[1].offsetLeft - cards[0].offsetLeft;
      return cards[0] ? cards[0].offsetWidth + 18 : 250;
    }
    const canScroll = () => container.scrollWidth > container.clientWidth + 4;

    function scrollNext() {
      if (!canScroll()) return;
      const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 4;
      container.scrollTo({ left: atEnd ? 0 : container.scrollLeft + cardStep(), behavior: "smooth" });
    }
    function scrollPrev() {
      if (!canScroll()) return;
      const atStart = container.scrollLeft <= 4;
      container.scrollTo({ left: atStart ? container.scrollWidth : container.scrollLeft - cardStep(), behavior: "smooth" });
    }

    // Arrows only when there is actually something to scroll to.
    function updateArrows() {
      const show = canScroll();
      prevBtn.style.display = nextBtn.style.display = show ? "" : "none";
    }
    updateArrows();
    window.addEventListener("resize", updateArrows);

    let timer = setInterval(scrollNext, 3500);
    const restart = () => {
      clearInterval(timer);
      timer = setInterval(scrollNext, 3500);
    };
    nextBtn.addEventListener("click", () => { scrollNext(); restart(); });
    prevBtn.addEventListener("click", () => { scrollPrev(); restart(); });
    container.addEventListener("mouseenter", () => clearInterval(timer));
    container.addEventListener("mouseleave", restart);
  }
})();
