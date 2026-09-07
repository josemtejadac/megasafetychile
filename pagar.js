// Standalone "aceptar/pagar cotización" page — works with no login, driven
// entirely by ?id=<quote_id> in the URL (the same no-auth model already
// used by /api/quote/pay and the PDF download link). Reached from the
// "Aceptar y pagar en línea" button in the priced-quote email.
const STATUS_LABELS = {
  pendiente: "Sin tomar",
  en_proceso: "En proceso",
  cotizada: "Lista para pagar",
  pagada: "Pagada",
  rechazada: "Rechazada",
  vendida: "Vendida",
  perdida: "Perdida",
};

const quoteId = new URLSearchParams(window.location.search).get("id");
const loadingEl = document.getElementById("pagar-loading");
const errorEl = document.getElementById("pagar-error");
const viewEl = document.getElementById("pagar-view");

function money(n) {
  return `$${Number(n || 0).toLocaleString("es-CL")}`;
}

async function loadQuote() {
  if (!quoteId) {
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = "Falta el identificador de la cotización en el link.";
    return;
  }

  const res = await fetch(`/api/quote/public?id=${encodeURIComponent(quoteId)}`);
  const data = await res.json();
  loadingEl.hidden = true;
  if (!data.ok) {
    errorEl.hidden = false;
    errorEl.textContent = data.error || "No se pudo cargar la cotización.";
    return;
  }

  renderQuote(data.quote, data.items);
}

function renderQuote(q, items) {
  viewEl.hidden = false;
  document.getElementById("pagar-code").textContent = q.correlative_code;
  const badge = document.getElementById("pagar-status");
  badge.textContent = STATUS_LABELS[q.status] || q.status;
  badge.className = `quote-badge st-${q.status}`;
  document.getElementById("pagar-empresa").textContent = `${q.razon_social} — ${q.nombre_contacto}`;

  const priced = q.status === "cotizada" || q.status === "pagada";
  document.getElementById("pagar-items").innerHTML = items
    .map((i) => {
      const name = `${i.quantity} x ${i.product_name}${i.brand ? ` (${i.brand})` : ""}${i.variant ? ` [${i.variant}]` : ""}`;
      if (priced) {
        const subtotal = (i.quantity || 0) * (i.unit_price || 0);
        return `<li>${name} — ${money(subtotal)}</li>`;
      }
      return `<li>${name}</li>`;
    })
    .join("");

  document.getElementById("pagar-total").textContent = priced ? `Total: ${money(q.total)}` : "";

  const actions = document.getElementById("pagar-actions");
  const payBtn = document.getElementById("pagar-pay-btn");
  const rejectBtn = document.getElementById("pagar-reject-btn");
  const note = document.getElementById("pagar-note");

  if (q.status !== "cotizada") {
    actions.hidden = true;
    if (q.status === "pagada") note.textContent = "Esta cotización ya fue pagada. ¡Gracias por tu compra!";
    else if (q.status === "rechazada") note.textContent = "Rechazaste esta cotización.";
    else note.textContent = "Esta cotización todavía no tiene precio — te avisaremos por correo apenas esté lista.";
    note.className = "form-note";
  } else {
    payBtn.addEventListener("click", async () => {
      payBtn.disabled = true;
      payBtn.textContent = "Redirigiendo a Flow...";
      const res = await fetch("/api/quote/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: q.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        note.textContent = data.error || "No se pudo iniciar el pago.";
        note.className = "form-note is-error";
        payBtn.disabled = false;
        payBtn.textContent = "Aceptar y pagar con Flow";
        return;
      }
      window.location.href = `${data.url}?token=${data.token}`;
    });

    rejectBtn.addEventListener("click", async () => {
      if (!confirm("¿Seguro que quieres rechazar esta cotización?")) return;
      const reason = prompt("¿Motivo del rechazo? (opcional, déjalo en blanco si prefieres no decir)") || "";
      rejectBtn.disabled = true;
      const res = await fetch("/api/quote/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: q.id, reason }),
      });
      const data = await res.json();
      if (!data.ok) {
        note.textContent = data.error || "No se pudo rechazar la cotización.";
        note.className = "form-note is-error";
        rejectBtn.disabled = false;
        return;
      }
      loadQuote();
    });
  }

  // Prefill "Crear mi cuenta" — opens the shared Mi Cuenta panel (injected by
  // account.js) on its signup tab with this quote's email ready to go.
  document.getElementById("pagar-signup-btn").addEventListener("click", () => {
    document.getElementById("account-btn")?.click();
    setTimeout(() => {
      document.querySelector('.account-tab[data-tab="signup"]')?.click();
      const emailInput = document.querySelector('#account-signup-form [name="email"]');
      if (emailInput) emailInput.value = q.correo;
    }, 50);
  });
}

loadQuote();
