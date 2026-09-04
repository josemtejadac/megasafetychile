(async function enhanceCategoryCardsWithPhotos() {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/megasafety_products?select=category_id,image_url,sort_order&image_url=not.is.null&active=eq.true&order=category_id.asc,sort_order.asc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return;
    const rows = await res.json();

    const firstPhotoByCategory = {};
    rows.forEach((r) => {
      if (!firstPhotoByCategory[r.category_id]) firstPhotoByCategory[r.category_id] = r.image_url;
    });

    Object.entries(firstPhotoByCategory).forEach(([catId, url]) => {
      const card = document.querySelector(`.cat-card[data-cat="${catId}"]`);
      if (!card) return;
      card.classList.add("has-photo");
      card.style.backgroundImage = `url(${url})`;
    });
  } catch {
    // Sin conexión o error de red: las tarjetas se quedan con el ícono, sin romper nada.
  }
})();
