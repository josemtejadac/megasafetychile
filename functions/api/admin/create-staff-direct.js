// TEMPORARY one-off: same logic as create-staff.js but gated by the shared
// preview secret instead of an admin session token, so it can be invoked
// directly (e.g. via curl) when no browser session is available. Delete
// after use — the real ongoing path is the admin panel's "Equipo" tab.
function normalizeRut(rut) {
  return rut.replace(/[.\s]/g, "").toUpperCase();
}

export async function onRequestPost({ request, env }) {
  const key = request.headers.get("X-Test-Key") || "";
  if (!env.PREVIEW_KEY || key !== env.PREVIEW_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 403 });
  }

  const { rut, password, name, role, commission_rate } = await request.json();
  if (!rut || !password || !role) {
    return new Response(JSON.stringify({ ok: false, error: "Falta RUT, contraseña o rol" }), { status: 400 });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ ok: false, error: "La contraseña debe tener al menos 6 caracteres" }), { status: 400 });
  }

  const normalizedRut = normalizeRut(rut);
  const internalEmail = `${normalizedRut.toLowerCase()}@staff.megasafetychile.internal`;

  const existingRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/megasafety_admins?rut=eq.${encodeURIComponent(normalizedRut)}&select=user_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const existingRows = await existingRes.json();
  if (Array.isArray(existingRows) && existingRows.length) {
    return new Response(JSON.stringify({ ok: false, error: "Ya existe un trabajador con ese RUT" }), { status: 409 });
  }

  const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: internalEmail, password, email_confirm: true }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: createData.msg || createData.error_description || "Error creando la cuenta" }), { status: 500 });
  }

  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/megasafety_admins`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        user_id: createData.id,
        rut: normalizedRut,
        email: internalEmail,
        name: name || null,
        role: role === "admin" ? "admin" : "vendedor",
        commission_rate: commission_rate || 0,
        active: true,
      },
    ]),
  });
  if (!insertRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: await insertRes.text() }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, rut: normalizedRut }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
