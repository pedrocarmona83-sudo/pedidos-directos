const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxLVKRB43ZPlOo1KTqr_Op_xjJkXjy5_fc9D_ppAeoh8003zMJq1CYrrDvi0zava2z_/exec";
const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function getSlug() {
  // URL esperada: /?biz=demo
  const url = new URL(location.href);
  return (url.searchParams.get("biz") || "demo").toLowerCase();
}

async function loadBusiness(slug) {
  const res = await fetch(`data/${slug}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`No existe data/${slug}.json`);
  return await res.json();
}

function buildWhatsLink(phoneE164, text) {
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${phoneE164}?text=${encoded}`;
}

function fmtOrderText(biz, cartLines, name, addr, note, total) {
  const lines = [];
  lines.push(`*Nuevo pedido* — ${biz.name}`);
  lines.push("");

  cartLines.forEach((c) => {
    lines.push(`• ${c.qty} x ${c.name}${c.optionText || ""} — ${money(c.qty * c.price)}`);
  });

  lines.push("");
  lines.push(`*Total:* ${money(total)}`);
  if (name) lines.push(`Nombre: ${name}`);
  if (addr) lines.push(`Dirección: ${addr}`);
  if (note) lines.push(`Nota: ${note}`);
  lines.push("");
  lines.push("Enviado desde Pedidos Directos Pro");
  return lines.join("\n");
}

(async function main() {
  const slug = getSlug();
  const biz = await loadBusiness(slug);

  // Header
  document.getElementById("bizName").textContent = biz.name;
  document.getElementById("bizSubtitle").textContent = biz.subtitle || "";

  const menuEl = document.getElementById("menu");
  const cartEl = document.getElementById("cart");
  const totalEl = document.getElementById("total");

  // Estado:
  // - items: menú
  // - cart: mapa por variante "itemId|option"
  const state = {
    items: (biz.items || []).map((it, idx) => ({
      id: it.id || `item_${idx}`, // id estable para variantes
      ...it,
      selectedOption:
        it.options?.type === "select" ? (it.options.choices?.[0] || "") : ""
    })),
    cart: {} // { "itemId|option": { itemId, name, price, option, qty } }
  };

  function variantKey(item) {
    const opt = item.options?.type === "select" ? (item.selectedOption || "") : "";
    return `${item.id}|${opt}`;
  }

  function addToCart(item) {
    const key = variantKey(item);
    const opt = item.options?.type === "select" ? (item.selectedOption || "") : "";

    const line = state.cart[key] || {
      itemId: item.id,
      name: item.name,
      price: item.price,
      option: opt,
      qty: 0
    };

    line.qty += 1;
    state.cart[key] = line;
  }

  function removeFromCart(item) {
    const key = variantKey(item);
    if (!state.cart[key]) return;

    state.cart[key].qty = Math.max(0, state.cart[key].qty - 1);
    if (state.cart[key].qty === 0) delete state.cart[key];
  }

  function getCartLines() {
    return Object.values(state.cart).map((l) => ({
      ...l,
      optionText: l.option ? ` (${l.option})` : ""
    }));
  }

  function getTotal() {
    return getCartLines().reduce((s, l) => s + l.qty * l.price, 0);
  }

  function updateWhatsLinks() {
    const cartLines = getCartLines();
    const total = getTotal();
    totalEl.textContent = money(total);

    const name = document.getElementById("custName").value.trim();
    const addr = document.getElementById("custAddr").value.trim();
    const note = document.getElementById("custNote").value.trim();

    const text = fmtOrderText(biz, cartLines, name, addr, note, total);
    const link = buildWhatsLink(biz.whatsapp_e164, text);

    const topBtn = document.getElementById("whatsBtnTop");
    const btn = document.getElementById("whatsBtn");
    topBtn.href = link;
    btn.href = link;

    // Bloqueo suave si carrito vacío
    const disabled = cartLines.length === 0;
    [topBtn, btn].forEach((b) => {
      b.style.opacity = disabled ? "0.5" : "1";
      b.style.pointerEvents = disabled ? "none" : "auto";
    });

    const sendBtn = document.getElementById("whatsBtn");

sendBtn.onclick = async () => {
  const cartLines = getCartLines();
  if (cartLines.length === 0) return;

  const name = document.getElementById("custName").value.trim();
  const addr = document.getElementById("custAddr").value.trim();
  const note = document.getElementById("custNote").value.trim();
  const total = getTotal();

  const orderText = cartLines
    .map(c => `${c.qty} x ${c.name}${c.optionText}`)
    .join(", ");

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
  method: "POST",
  body: JSON.stringify({
    business: biz.name,
    customer: name,
    address: addr,
    note: note,
    order: orderText,
    total: total
  })
});

const result = await response.json();

if (result.orderNumber) {
  alert("Pedido #" + result.orderNumber + " enviado correctamente");
}
};

    
  }

  function renderMenu() {
    menuEl.innerHTML = "";

    state.items.forEach((it, idx) => {
      const key = variantKey(it);
      const shownQty = state.cart[key]?.qty || 0;

      const row = document.createElement("div");
      row.className = "item";

      const optionsHtml =
        it.options?.type === "select"
          ? `<div style="margin-top:8px">
               <label class="muted small">${it.options.label || "Opciones"}</label>
               <select data-opt="select" data-idx="${idx}"
                 style="width:100%;margin-top:6px;padding:10px;border-radius:12px;border:1px solid #1b2230;background:#0b0c10;color:#e9eef6">
                 ${(it.options.choices || [])
                   .map((c) => `<option value="${c}" ${c === it.selectedOption ? "selected" : ""}>${c}</option>`)
                   .join("")}
               </select>
             </div>`
          : "";

      row.innerHTML = `
        <div style="min-width:0">
          <strong>${it.name}</strong>
          ${it.desc ? `<div class="muted small">${it.desc}</div>` : ""}
          <div class="price">${money(it.price)}</div>
          ${optionsHtml}
        </div>
        <div class="controls">
          <button class="btn btn-sm btn-ghost" data-act="dec" data-idx="${idx}">-</button>
          <div class="qty" id="qty-${idx}">${shownQty}</div>
          <button class="btn btn-sm btn-ghost" data-act="inc" data-idx="${idx}">+</button>
        </div>
      `;

      menuEl.appendChild(row);
    });

    // Clicks +/-
    menuEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      const item = state.items[idx];

      if (act === "inc") addToCart(item);
      if (act === "dec") removeFromCart(item);

      // Actualiza el numerito de la variante actual
      const key = variantKey(item);
      const qty = state.cart[key]?.qty || 0;
      const qtyEl = document.getElementById(`qty-${idx}`);
      if (qtyEl) qtyEl.textContent = qty;

      renderCart();
    });

    // Cambios en selects de opciones
    menuEl.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-opt='select']");
      if (!sel) return;

      const idx = Number(sel.dataset.idx);
      state.items[idx].selectedOption = sel.value;

      // Al cambiar la opción, refresca el numerito de ESA variante
      const item = state.items[idx];
      const key = variantKey(item);
      const qty = state.cart[key]?.qty || 0;
      const qtyEl = document.getElementById(`qty-${idx}`);
      if (qtyEl) qtyEl.textContent = qty;

      renderCart();
    });
  }

  function renderCart() {
    const cartLines = getCartLines();
    cartEl.innerHTML = "";

    if (cartLines.length === 0) {
      cartEl.innerHTML = `<p class="muted">Aún no agregas productos.</p>`;
      updateWhatsLinks();
      return;
    }

    cartLines.forEach((c) => {
      const r = document.createElement("div");
      r.className = "cartRow";
      r.innerHTML = `
        <div style="min-width:0">
          <strong>${c.qty} x ${c.name}${c.optionText || ""}</strong>
          <div class="muted small">${money(c.price)} c/u</div>
        </div>
        <div><strong>${money(c.qty * c.price)}</strong></div>
      `;
      cartEl.appendChild(r);
    });

    updateWhatsLinks();
  }

  // Re-render WhatsApp al cambiar inputs
  ["custName", "custAddr", "custNote"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => updateWhatsLinks());
  });

  renderMenu();
  renderCart();
})().catch((err) => {
  document.body.innerHTML = `<div style="padding:16px;font-family:system-ui">
    <h2>Error cargando negocio</h2>
    <p>${String(err.message || err)}</p>
    <p>Tip: asegúrate de tener <code>data/${getSlug()}.json</code>.</p>
    <p>Ejemplo: <code>?biz=demo</code></p>
  </div>`;
});


