(function initBrandsMarquee() {
  const track = document.getElementById("brands-track");
  if (!track) return;

  // Logos already on a navy background (from the owner's brand strip) sit
  // directly on the section — no card. Logos supplied on white/black
  // backgrounds get a small white rounded card so they read cleanly against
  // navy instead of showing a mismatched box.
  const LOGOS = [
    { file: "newseg.png", card: false },
    { file: "kbeen.png", card: false },
    { file: "daumer1.png", card: false },
    { file: "force1.png", card: false },
    { file: "bufalo.png", card: false },
    { file: "orbit.png", card: false },
    { file: "grilltech.png", card: false },
    { file: "blackweld.png", card: true },
    { file: "krafter.png", card: true },
    { file: "inoxer.png", card: true },
    { file: "rock-guantes.png", card: true },
    { file: "action.png", card: true },
    { file: "rock-ropa.png", card: true },
  ];

  function renderLogo(logo) {
    const img = `<img src="assets/img/brands/${logo.file}" alt="" style="height:${logo.card ? "34px" : "44px"}; width:auto; display:block;">`;
    if (logo.card) {
      return `<span style="background:#fff; border-radius:10px; padding:8px 14px; display:flex; align-items:center; flex-shrink:0;">${img}</span>`;
    }
    return `<span style="display:flex; align-items:center; flex-shrink:0;">${img}</span>`;
  }

  const logosHtml = LOGOS.map(renderLogo).join("");
  // Duplicated once so the CSS animation (translateX -50%) loops seamlessly.
  track.innerHTML = logosHtml + logosHtml;
})();
