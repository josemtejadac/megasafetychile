const ACCOUNT_SUPABASE_URL = "https://wiuuzsiiaagqldtxfouj.supabase.co";
const ACCOUNT_SUPABASE_ANON_KEY = "sb_publishable_BtphNzcv_YrDNwRul86J0g_DiCGznE1";

// By default the session lives in sessionStorage (gone once the browser/tab
// closes) so opening the site never silently reuses a previous login.
// Checking "Mantener sesión iniciada" switches it to localStorage so it
// survives a restart. See admin.js for the matching staff-side version.
const CUSTOMER_REMEMBER_KEY = "msc_customer_remember";
// Defensive: some browsers/extensions throw a SecurityError just for
// touching localStorage/sessionStorage, and this runs inside supabase-js's
// internal session check on every request (even anonymous reads) — an
// uncaught throw here would silently break the whole page.
const customerAuthStorage = {
  getItem: (key) => {
    try {
      const remember = localStorage.getItem(CUSTOMER_REMEMBER_KEY) === "1";
      return (remember ? localStorage : sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      const remember = localStorage.getItem(CUSTOMER_REMEMBER_KEY) === "1";
      (remember ? localStorage : sessionStorage).setItem(key, value);
    } catch {
      /* storage unavailable — session just won't persist */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// Same storage key as compra-empresa.js / mis-pedidos.js (customer pages) so
// the customer's login persists across them, separate from the staff panel.
const accountClient = window.supabase.createClient(ACCOUNT_SUPABASE_URL, ACCOUNT_SUPABASE_ANON_KEY, {
  auth: { storageKey: "msc_customer_auth", storage: customerAuthStorage },
});

function injectAccountUI() {
  const btn = document.createElement("button");
  btn.className = "account-btn";
  btn.id = "account-btn";
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg><span id="account-btn-label">Mi cuenta</span>`;

  const actionsBar = document.querySelector(".header-actions");
  if (actionsBar) actionsBar.insertBefore(btn, actionsBar.firstChild);

  const overlay = document.createElement("div");
  overlay.className = "cat-menu-overlay";
  overlay.id = "account-overlay";

  const panel = document.createElement("aside");
  panel.className = "modal-panel form-panel";
  panel.id = "account-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="cat-menu-head">
      <h3 id="account-panel-title">Mi cuenta</h3>
      <button class="cat-menu-close" id="account-close-btn" aria-label="Cerrar">&times;</button>
    </div>
    <div id="account-logged-out">
      <div class="account-tabs">
        <button class="account-tab is-active" data-tab="login" type="button">Iniciar sesión</button>
        <button class="account-tab" data-tab="signup" type="button">Crear cuenta</button>
      </div>
      <form id="account-login-form" class="quote-form">
        <label>Correo<input type="email" name="email" required></label>
        <label>Contraseña<input type="password" name="password" required></label>
        <label class="checkbox-row"><input type="checkbox" name="remember"> Mantener sesión iniciada en este navegador</label>
        <p class="form-note" id="account-login-note"></p>
        <button type="submit" class="btn btn--primary">Iniciar sesión</button>
      </form>
      <form id="account-signup-form" class="quote-form" hidden>
        <label>Nombre<input type="text" name="name" required></label>
        <label>Correo<input type="email" name="email" required></label>
        <label>Contraseña (mín. 6 caracteres)<input type="password" name="password" required minlength="6"></label>
        <p class="form-note" id="account-signup-note"></p>
        <button type="submit" class="btn btn--primary">Crear cuenta</button>
      </form>
    </div>
    <div id="account-logged-in" hidden>
      <p class="account-welcome">Hola, <strong id="account-email"></strong></p>
      <a href="mis-pedidos.html" class="btn btn--outline account-orders-link">Ver mis cotizaciones</a>
      <button class="btn btn--outline account-logout-btn" id="account-logout-btn">Cerrar sesión</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  const open = () => {
    refreshAccountState();
    panel.classList.add("is-open");
    overlay.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    panel.classList.remove("is-open");
    overlay.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };
  btn.addEventListener("click", open);
  overlay.addEventListener("click", close);
  document.getElementById("account-close-btn").addEventListener("click", close);

  panel.querySelectorAll(".account-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      panel.querySelectorAll(".account-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const isLogin = tab.dataset.tab === "login";
      document.getElementById("account-login-form").hidden = !isLogin;
      document.getElementById("account-signup-form").hidden = isLogin;
    });
  });

  document.getElementById("account-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const note = document.getElementById("account-login-note");
    note.textContent = "Ingresando...";
    note.className = "form-note is-loading";
    localStorage.setItem(CUSTOMER_REMEMBER_KEY, fd.get("remember") === "on" ? "1" : "0");
    const { error } = await accountClient.auth.signInWithPassword({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (error) {
      note.textContent = "Correo o contraseña incorrectos.";
      note.className = "form-note is-error";
      return;
    }
    note.textContent = "";
    await refreshAccountState();
    await claimPastQuotes();
  });

  document.getElementById("account-signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const note = document.getElementById("account-signup-note");
    note.textContent = "Creando cuenta...";
    note.className = "form-note is-loading";
    const { error } = await accountClient.auth.signUp({
      email: fd.get("email"),
      password: fd.get("password"),
      options: { data: { full_name: fd.get("name") } },
    });
    if (error) {
      note.textContent = error.message || "No se pudo crear la cuenta.";
      note.className = "form-note is-error";
      return;
    }
    note.textContent = "Cuenta creada. Ya puedes ver tus cotizaciones.";
    note.className = "form-note";
    await refreshAccountState();
    await claimPastQuotes();
  });

  document.getElementById("account-logout-btn").addEventListener("click", async () => {
    await accountClient.auth.signOut();
    localStorage.removeItem(CUSTOMER_REMEMBER_KEY);
    await refreshAccountState();
    close();
  });

  refreshAccountState();
  claimPastQuotes();
}

// Links any quotes submitted with this email before the customer had (or
// used) an account, so their history shows up right after they log in.
async function claimPastQuotes() {
  try {
    const { data: { session } } = await accountClient.auth.getSession();
    if (!session) return;
    await fetch("/api/account/claim-quotes", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // Best-effort — the customer can still see quotes filed after they
    // logged in even if this particular linking call fails.
  }
}

async function refreshAccountState() {
  const loggedOut = document.getElementById("account-logged-out");
  const loggedIn = document.getElementById("account-logged-in");
  const label = document.getElementById("account-btn-label");
  if (!loggedOut || !loggedIn || !label) return;
  // Always resolve to exactly one visible state, even if getSession()
  // rejects — a previous version of this left both views visible when a
  // stale/expired session caused an error partway through.
  let session = null;
  try {
    ({ data: { session } } = await accountClient.auth.getSession());
  } catch {
    session = null;
  }
  if (session) {
    loggedOut.hidden = true;
    loggedIn.hidden = false;
    document.getElementById("account-email").textContent = session.user.email;
    label.textContent = "Mi cuenta";
  } else {
    loggedOut.hidden = false;
    loggedIn.hidden = true;
    label.textContent = "Ingresar";
  }
}

injectAccountUI();
