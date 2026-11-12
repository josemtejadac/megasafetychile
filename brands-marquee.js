(function initBrandsMarquee() {
  const track = document.getElementById("brands-track");
  if (!track) return;
  const marquee = track.parentElement;

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
      return `<span class="brand-logo" style="background:#fff; border-radius:10px; padding:8px 14px; display:flex; align-items:center; flex-shrink:0;">${img}</span>`;
    }
    return `<span class="brand-logo" style="display:flex; align-items:center; flex-shrink:0;">${img}</span>`;
  }

  const logosHtml = LOGOS.map(renderLogo).join("");
  // Duplicated once so the loop is seamless.
  track.innerHTML = logosHtml + logosHtml;

  // Moved by scrolling the container instead of a CSS transform animation:
  // the track is ~3600px wide, and iPhone Safari can fail to paint an
  // animated layer that large (the strip showed up empty on iOS). Scrolling
  // also lets people swipe through the logos themselves.
  track.style.animation = "none";
  marquee.classList.add("is-scrolling");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const SPEED = 0.04; // px per ms
  let pos = 0;
  let last = null;
  let paused = false;
  function step(ts) {
    if (last !== null && !paused) {
      const half = track.scrollWidth / 2;
      pos += (ts - last) * SPEED;
      if (half > 0 && pos >= half) pos -= half;
      marquee.scrollLeft = pos;
    }
    last = ts;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  const pause = () => { paused = true; };
  const resume = () => {
    const half = track.scrollWidth / 2;
    pos = half > 0 ? marquee.scrollLeft % half : marquee.scrollLeft;
    paused = false;
  };
  marquee.addEventListener("pointerdown", pause);
  marquee.addEventListener("touchstart", pause, { passive: true });
  ["pointerup", "pointercancel", "touchend", "mouseleave"].forEach((evt) => marquee.addEventListener(evt, resume, { passive: true }));
})();
