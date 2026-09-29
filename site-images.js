// Swaps in any site-wide image(s) the admin has customized from the
// "Fotos del sitio" panel (hero, banners) — progressive enhancement, same
// pattern as category-photos.js. Pages that don't have a matching element
// (id="site-img-<key>") are simply skipped, so this one file is safe to
// load on every page. If the admin uploaded several photos for a slot and
// turned on "Rotar como carrusel", this just swaps the <img>'s src on an
// interval — the element itself never moves, so any hotspot buttons
// overlaid on top of it stay put regardless of which photo is showing.
(function () {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const ROTATE_MS = 5000;
  const activeTimers = {};

  async function applySiteImages() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/megasafety_site_images?select=key,urls,carousel_enabled`, { headers });
      if (!res.ok) return;
      const rows = await res.json();
      rows.forEach((row) => {
        const img = document.getElementById(`site-img-${row.key}`);
        if (!img) return;

        clearInterval(activeTimers[row.key]);
        delete activeTimers[row.key];

        const urls = row.urls || [];
        if (!urls.length) return; // no override — keep the static default already in the HTML

        img.src = urls[0];
        if (row.carousel_enabled && urls.length > 1) {
          let idx = 0;
          activeTimers[row.key] = setInterval(() => {
            idx = (idx + 1) % urls.length;
            img.src = urls[idx];
          }, ROTATE_MS);
        }
      });
    } catch {
      // Offline or Supabase unreachable — the static default images already in
      // the HTML keep working, nothing to fall back to here.
    }
  }

  applySiteImages();

  const rtClient = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);
  rtClient
    ?.channel("site-images-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "megasafety_site_images" }, applySiteImages)
    .subscribe();
})();
