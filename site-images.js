// Swaps in any site-wide image the admin has customized from the
// "Fotos del sitio" panel (hero, banners) — progressive enhancement, same
// pattern as category-photos.js. Pages that don't have a matching element
// (id="site-img-<key>") are simply skipped, so this one file is safe to
// load on every page.
(function () {
  const SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  async function applySiteImages() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/megasafety_site_images?select=key,url`, { headers });
      if (!res.ok) return;
      const rows = await res.json();
      rows.forEach((row) => {
        if (!row.url) return; // no override — keep the static default already in the HTML
        const img = document.getElementById(`site-img-${row.key}`);
        if (img) img.src = row.url;
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
