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

// ---------- Shared profile helpers (also used by mis-pedidos.js, compra-empresa.js, pagar.js) ----------
const ACCT_REGIONS = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso",
  "Región Metropolitana", "O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía",
  "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
];

function acctEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function acctCleanRut(value) {
  return String(value || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function acctRutIsValid(value) {
  const clean = acctCleanRut(value);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return expected === dv;
}

// Stored without dots ("12345678-9"), the same shape staff RUTs and most
// quotes already use, so lookups by RUT match across sources.
function acctNormalizeRut(value) {
  const clean = acctCleanRut(value);
  return clean ? `${clean.slice(0, -1)}-${clean.slice(-1)}` : "";
}

function acctFullName(profile) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

function acctProfileIsComplete(profile) {
  return Boolean(profile && profile.first_name && profile.last_name && profile.phone && profile.privacy_accepted_at);
}

const ACCT_PRIVACY_NOTE = `
  <div class="acct-privacy">
    <strong>Protección de tus datos</strong>
    <p>Usamos estos datos solo para gestionar tus cotizaciones, compras y despachos, conforme a la normativa chilena de protección de datos personales (Ley N° 19.628 y Ley N° 21.719). No los vendemos ni los compartimos con terceros, salvo lo necesario para procesar tu pago (Flow) o tu despacho. Puedes revisarlos y corregirlos cuando quieras desde Mi cuenta, o pedir que los eliminemos escribiendo a <a href="mailto:contacto@megasafetychile.cl">contacto@megasafetychile.cl</a>.</p>
  </div>`;

// One set of fields for both signup and "Mis datos", each with a short note
// on why it's asked — the data-minimization explanation the law expects.
function acctProfileFieldsHtml(p = {}, { signup = false } = {}) {
  const v = (key) => acctEscape(p[key] || "");
  const regionOptions = [`<option value="">Selecciona...</option>`]
    .concat(ACCT_REGIONS.map((r) => `<option value="${acctEscape(r)}" ${p.region === r ? "selected" : ""}>${acctEscape(r)}</option>`))
    .concat(p.region && !ACCT_REGIONS.includes(p.region) ? [`<option value="${v("region")}" selected>${v("region")}</option>`] : [])
    .join("");
  return `
    <div class="acct-row">
      <label>Nombre *<input type="text" name="first_name" required maxlength="80" autocomplete="given-name" value="${v("first_name")}"></label>
      <label>Apellido *<input type="text" name="last_name" required maxlength="80" autocomplete="family-name" value="${v("last_name")}"></label>
    </div>
    <p class="acct-why">Para saludarte por tu nombre y saber con quién hablar sobre tus cotizaciones.</p>
    ${
      signup
        ? `<label>Correo *<input type="email" name="email" required autocomplete="email"></label>
           <p class="acct-why">Es tu usuario para ingresar y donde te enviamos cotizaciones y avisos de tus pedidos.</p>
           <label>Contraseña *<span class="acct-password"><input type="password" name="password" required minlength="6" autocomplete="new-password"><button type="button" class="acct-pass-toggle" aria-label="Mostrar contraseña">Mostrar</button></span></label>
           <p class="acct-why">Mínimo 6 caracteres.</p>`
        : ""
    }
    <label>Teléfono / WhatsApp<input type="tel" name="phone" maxlength="30" autocomplete="tel" placeholder="+56 9 1234 5678" value="${v("phone")}"></label>
    <p class="acct-why">Opcional. Para coordinar despachos o resolver dudas de tus pedidos.</p>
    <label>RUT personal<input type="text" name="rut" maxlength="15" placeholder="12.345.678-9" value="${v("rut")}"></label>
    <p class="acct-why">Opcional. Solo si necesitas boleta a tu nombre.</p>
    <fieldset class="acct-fieldset">
      <legend>Si compras para una empresa</legend>
      <label>Razón social<input type="text" name="company_name" maxlength="150" autocomplete="organization" value="${v("company_name")}"></label>
      <label>RUT empresa<input type="text" name="company_rut" maxlength="15" placeholder="76.123.456-7" value="${v("company_rut")}"></label>
      <p class="acct-why">Opcional. Para emitir tu factura y completar tus cotizaciones automáticamente.</p>
    </fieldset>
    <fieldset class="acct-fieldset">
      <legend>Dirección de despacho</legend>
      <label>Dirección (calle y número)<input type="text" name="address" maxlength="200" autocomplete="street-address" value="${v("address")}"></label>
      <div class="acct-row">
        <label>Comuna<input type="text" name="comuna" maxlength="80" value="${v("comuna")}"></label>
        <label>Región<select name="region">${regionOptions}</select></label>
      </div>
      <p class="acct-why">Opcional. Para calcular y coordinar el despacho de tus pedidos.</p>
    </fieldset>
    ${ACCT_PRIVACY_NOTE}
    ${
      p.privacy_accepted_at
        ? `<p class="acct-why">Aceptaste el uso de tus datos el ${new Date(p.privacy_accepted_at).toLocaleDateString("es-CL")}.</p>`
        : `<label class="checkbox-row acct-check"><input type="checkbox" name="privacy" required> Acepto el uso de mis datos para estos fines *</label>`
    }
    <label class="checkbox-row acct-check"><input type="checkbox" name="marketing_opt_in" ${p.marketing_opt_in ? "checked" : ""}> Quiero recibir ofertas y novedades por correo (opcional, puedes darte de baja cuando quieras)</label>
  `;
}

// Reads + validates the profile fields of a form. Returns { data } or { error }.
function acctReadProfileForm(form) {
  const fd = new FormData(form);
  const text = (key, max) => {
    const value = String(fd.get(key) ?? "").trim().replace(/\s+/g, " ");
    return value ? value.slice(0, max) : null;
  };
  const data = {
    first_name: text("first_name", 80),
    last_name: text("last_name", 80),
    phone: text("phone", 30),
    rut: text("rut", 15),
    company_name: text("company_name", 150),
    company_rut: text("company_rut", 15),
    address: text("address", 200),
    comuna: text("comuna", 80),
    region: text("region", 80),
    marketing_opt_in: fd.get("marketing_opt_in") === "on",
  };
  if (!data.first_name || !data.last_name) return { error: "Ingresa tu nombre y apellido." };
  for (const [key, label] of [["rut", "RUT personal"], ["company_rut", "RUT de la empresa"]]) {
    if (data[key]) {
      if (!acctRutIsValid(data[key])) return { error: `El ${label} no es válido. Revisa el número y el dígito verificador.` };
      data[key] = acctNormalizeRut(data[key]);
    }
  }
  if (data.phone && !/^[+\d][\d\s()-]{6,}$/.test(data.phone)) return { error: "El teléfono no parece válido." };
  if (fd.get("privacy") === "on") data.privacy_accepted_at = new Date().toISOString();
  return { data };
}

function acctWirePasswordToggles(root) {
  root.querySelectorAll(".acct-pass-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Ocultar" : "Mostrar";
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });
}

// Loads (and lazily creates) the logged-in customer's profile. Accounts made
// before profiles existed get a row from their signup name, then are asked to
// complete it. Concurrent callers share one in-flight request.
let acctProfileCache = { userId: null, profile: null };
let acctProfilePromise = null;
async function acctGetProfile(force = false) {
  let session = null;
  try {
    ({ data: { session } } = await accountClient.auth.getSession());
  } catch {
    return null;
  }
  if (!session) {
    acctProfileCache = { userId: null, profile: null };
    return null;
  }
  if (!force && acctProfileCache.userId === session.user.id && acctProfileCache.profile) return acctProfileCache.profile;
  if (acctProfilePromise) return acctProfilePromise;

  acctProfilePromise = (async () => {
    const userId = session.user.id;
    let { data: profile, error } = await accountClient.from("megasafety_customers").select("*").eq("user_id", userId).maybeSingle();
    if (error) return null;
    if (!profile) {
      const meta = session.user.user_metadata || {};
      let first = meta.first_name;
      let last = meta.last_name;
      if (!first) {
        const parts = String(meta.full_name || "").trim().split(/\s+/).filter(Boolean);
        first = parts.shift() || (session.user.email || "Cliente").split("@")[0];
        last = parts.join(" ");
      }
      await accountClient
        .from("megasafety_customers")
        .upsert({ user_id: userId, first_name: first.slice(0, 80), last_name: (last || "").slice(0, 80) }, { onConflict: "user_id", ignoreDuplicates: true });
      ({ data: profile } = await accountClient.from("megasafety_customers").select("*").eq("user_id", userId).maybeSingle());
    }
    acctProfileCache = { userId, profile: profile || null };
    return profile || null;
  })();
  try {
    return await acctProfilePromise;
  } finally {
    acctProfilePromise = null;
  }
}

async function acctSaveProfile(data) {
  const { data: { session } } = await accountClient.auth.getSession();
  if (!session) return { error: { message: "Tu sesión expiró. Vuelve a ingresar." } };
  const { data: saved, error } = await accountClient
    .from("megasafety_customers")
    .upsert({ user_id: session.user.id, ...data }, { onConflict: "user_id" })
    .select()
    .single();
  if (!error) {
    acctProfileCache = { userId: session.user.id, profile: saved };
    accountClient.auth.updateUser({ data: { first_name: saved.first_name, last_name: saved.last_name, full_name: acctFullName(saved) } }).catch(() => {});
  }
  return { profile: saved, error };
}

function acctNotifyChange() {
  window.dispatchEvent(new CustomEvent("msc:account-changed"));
}

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
        <label>Correo<input type="email" name="email" required autocomplete="email"></label>
        <label>Contraseña<span class="acct-password"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="acct-pass-toggle" aria-label="Mostrar contraseña">Mostrar</button></span></label>
        <label class="checkbox-row"><input type="checkbox" name="remember"> Mantener sesión iniciada en este navegador</label>
        <p class="form-note" id="account-login-note"></p>
        <button type="submit" class="btn btn--primary">Iniciar sesión</button>
        <a class="acct-link-btn" href="https://wa.me/56983061338?text=${encodeURIComponent("Hola, olvidé la contraseña de mi cuenta en megasafetychile.cl")}" target="_blank" rel="noopener">¿Olvidaste tu contraseña? Escríbenos por WhatsApp</a>
      </form>
      <form id="account-signup-form" class="quote-form" hidden novalidate>
        <p class="acct-intro">Con tu cuenta ves el estado de tus cotizaciones, tus compras y tus cotizaciones se completan solas con tus datos.</p>
        ${acctProfileFieldsHtml({}, { signup: true })}
        <p class="form-note" id="account-signup-note"></p>
        <button type="submit" class="btn btn--primary">Crear cuenta</button>
      </form>
    </div>
    <div id="account-logged-in" hidden>
      <div class="acct-hello">
        <span class="acct-avatar" id="account-avatar" aria-hidden="true"></span>
        <div>
          <p class="acct-hello-name">Hola, <strong id="account-first-name"></strong></p>
          <p class="acct-hello-email" id="account-email"></p>
        </div>
      </div>
      <p class="acct-banner" id="account-complete-banner" hidden>Completa tus datos para que tus cotizaciones se llenen solas. <a href="mis-pedidos.html#datos" class="acct-nav-link">Completar ahora</a></p>
      <nav class="acct-nav">
        <a href="mis-pedidos.html#cotizaciones" class="acct-nav-link acct-nav-item"><strong>Mis cotizaciones</strong><span>Estado, PDF y pago de cada solicitud</span></a>
        <a href="mis-pedidos.html#compras" class="acct-nav-link acct-nav-item"><strong>Mis compras</strong><span>Pedidos pagados o confirmados</span></a>
        <a href="mis-pedidos.html#datos" class="acct-nav-link acct-nav-item"><strong>Mis datos</strong><span>Edita tu información y tu contraseña</span></a>
      </nav>
      <button class="btn btn--outline account-logout-btn" id="account-logout-btn">Cerrar sesión</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  acctWirePasswordToggles(panel);

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
  // On mis-pedidos.html these links only change the hash, so close the modal
  // to reveal the tab underneath.
  panel.querySelectorAll(".acct-nav-link").forEach((a) => a.addEventListener("click", close));

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
      email: String(fd.get("email")).trim(),
      password: fd.get("password"),
    });
    if (error) {
      note.textContent = "Correo o contraseña incorrectos.";
      note.className = "form-note is-error";
      return;
    }
    note.textContent = "";
    e.target.reset();
    await claimPastQuotes();
    await refreshAccountState(true);
    acctNotifyChange();
  });

  const signupForm = document.getElementById("account-signup-form");
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("account-signup-note");
    const fd = new FormData(signupForm);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const fail = (msg) => {
      note.textContent = msg;
      note.className = "form-note is-error";
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Ingresa un correo válido.");
    if (password.length < 6) return fail("La contraseña debe tener al menos 6 caracteres.");
    const { data: profileData, error: formError } = acctReadProfileForm(signupForm);
    if (formError) return fail(formError);
    if (!profileData.privacy_accepted_at) return fail("Para crear tu cuenta debes aceptar el uso de tus datos.");

    note.textContent = "Creando cuenta...";
    note.className = "form-note is-loading";
    const { data, error } = await accountClient.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: profileData.first_name, last_name: profileData.last_name, full_name: `${profileData.first_name} ${profileData.last_name}` },
      },
    });
    if (error) {
      return fail(/registered|already/i.test(error.message) ? "Ya existe una cuenta con ese correo. Usa \"Iniciar sesión\"." : error.message || "No se pudo crear la cuenta.");
    }
    if (!data.session) {
      note.textContent = "Te enviamos un correo para confirmar tu cuenta. Después de confirmarla, ingresa y completa tus datos en Mi cuenta.";
      note.className = "form-note";
      return;
    }
    const { error: saveError } = await acctSaveProfile(profileData);
    signupForm.reset();
    await claimPastQuotes();
    await refreshAccountState(true);
    acctNotifyChange();
    if (saveError) {
      const banner = document.getElementById("account-complete-banner");
      banner.hidden = false;
    }
  });

  document.getElementById("account-logout-btn").addEventListener("click", async () => {
    await accountClient.auth.signOut();
    localStorage.removeItem(CUSTOMER_REMEMBER_KEY);
    acctProfileCache = { userId: null, profile: null };
    await refreshAccountState();
    acctNotifyChange();
    close();
  });

  window.addEventListener("msc:open-account", open);

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

async function refreshAccountState(forceProfile = false) {
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
  if (!session) {
    loggedOut.hidden = false;
    loggedIn.hidden = true;
    label.textContent = "Ingresar";
    document.getElementById("account-panel-title").textContent = "Mi cuenta";
    return;
  }
  loggedOut.hidden = true;
  loggedIn.hidden = false;
  const profile = await acctGetProfile(forceProfile);
  const meta = session.user.user_metadata || {};
  const firstName = profile?.first_name || meta.first_name || String(meta.full_name || "").split(" ")[0] || "";
  document.getElementById("account-first-name").textContent = firstName || session.user.email;
  document.getElementById("account-email").textContent = session.user.email;
  document.getElementById("account-avatar").textContent = (firstName || session.user.email || "?").charAt(0).toUpperCase();
  document.getElementById("account-complete-banner").hidden = acctProfileIsComplete(profile);
  label.textContent = firstName ? `Hola, ${firstName}` : "Mi cuenta";
}

injectAccountUI();
