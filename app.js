// ====== CONFIG ======
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOg9WDMxfVCjtqsJxnOBVVvW4Xg4v26osTAIMHtcfMgBBzL0aELzeUISDTAMxUiNbJ/exec"; // https://script.google.com/macros/s/XXX/exec
// ====================
const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function getSlug() {
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

function fmtOrderText(biz, cartLines, name, phone, addr, note, total, orderNumber) {
  const lines = [];
  lines.push(`*Nuevo pedido* — ${biz.name}`);
  if (orderNumber) lines.push(`*Pedido #${orderNumber}*`);
  lines.push("");

  cartLines.forEach((c) => {
    lines.push(`• ${c.qty} x ${c.name}${c.optionText || ""} — ${money(c.qty * c.price)}`);
  });

  lines.push("");
  lines.push(`*Total:* ${money(total)}`);
  if (name) lines.push(`Nombre: ${name}`);
  if (phone) lines.push(`Teléfono: ${phone}`);
  if (addr) lines.push(`Dirección: ${addr}`);
  if (note) lines.push(`Nota: ${note}`);
  lines.push("");
  lines.push("Enviado desde Pedidos Directos Pro");
  return lines.join("\n");
}

(function () {
  const slug = getSlug();

  const bizNameEl = document.getElementById("bizName");
  const bizSubtitleEl = document.getElementById("bizSubtitle");

  const menuEl = document.getElementById("menu");
  const cartEl = document.getElementById("cart");
  const totalEl = document.getElementById("total");

  const topBtn = document.getElementById("whatsBtnTop");
  const bottomBtn = document.getElementById("whatsBtn");

  const inputName = document.getElementById("custName");
  const inputPhone = document.getElementById("custPhone");
  const inputAddr = document.getElementById("custAddr");
  const inputNote = document.getElementById("custNote");

  const state = {
    biz: null,
    items: [],
    cart: {}, // { "itemId|option": { itemId, name, price, option, qty } }
    lastOrderNumber: null
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

  function sanitizePhone(p) {
    // Solo dígitos
    return String(p || "").replace(/\D/g, "");
  }

  function getCustomerData() {
    const name = (inputName?.value || "").trim();
    const phone = sanitizePhone(inputPhone?.value || "");
    const addr = (inputAddr?.value || "").trim();
    const note = (inputNote?.value || "").trim();
    return { name, phone, addr, note };
  }

  function buildOrderTextForSheets(cartLines) {
    return cartLines.map((c) => `${c.qty} x ${c.name}${c.optionText || ""}`).join(", ");
  }

  function updatePreviewLinks() {
    const cartLines = getCartLines();
    const total = getTotal();
    totalEl.textContent = money(total);

    const { name, phone, addr, note } = getCustomerData();

    const text = fmtOrderText(
      state.biz,
      cartLines,
      name,
      phone,
      addr,
      note,
      total,
      state.lastOrderNumber
    );

    const link = buildWhatsLink(state.biz.whatsapp_e164, text);

    if (topBtn) topBtn.href = link;
    if (bottomBtn) bottomBtn.href = link;

    const disabled = cartLines.length === 0;
    [topBtn, bottomBtn].filter(Boolean).forEach((b) => {
      b.style.opacity = disabled ? "0.5" : "1";
      b.style.pointerEvents = disabled ? "none" : "auto";
    });
  }

  async function saveOrderToSheets() {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PEGA_AQUI")) {
      return { ok: false, reason: "NO_SCRIPT_URL" };
    }

    const cartLines = getCartLines();
    if (cartLines.length === 0) return { ok: false, reason: "EMPTY_CART" };

    const total = getTotal();
    const { name, phone, addr, note } = getCustomerData();

    const payload = {
      business: state.biz.name,
      business_slug: slug,
      customer: name,
      phone: phone, // ✅ TELEFONO
      address: addr,
      note: note,
      order: buildOrderTextForSheets(cartLines),
      total: total
    };

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const resultText = await response.text();
      let result = {};
      try { result = JSON.parse(resultText); } catch (_) {}

      return { ok: true, result };
    } catch (e) {
      console.log("No se pudo guardar en Sheets:", e);
      return { ok: false, reason: "NETWORK_ERROR" };
    }
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

    menuEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      const item = state.items[idx];

      if (act === "inc") addToCart(item);
      if (act === "dec") removeFromCart(item);

      state.lastOrderNumber = null;

      const key = variantKey(item);
      const qty = state.cart[key]?.qty || 0;
      const qtyEl = document.getElementById(`qty-${idx}`);
      if (qtyEl) qtyEl.textContent = qty;

      renderCart();
    });

    menuEl.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-opt='select']");
      if (!sel) return;

      const idx = Number(sel.dataset.idx);
      state.items[idx].selectedOption = sel.value;

      state.lastOrderNumber = null;

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
      updatePreviewLinks();
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

    updatePreviewLinks();
  }

  async function handleSend(e) {
    e.preventDefault();
    const cartLines = getCartLines();
    if (cartLines.length === 0) return;

    const saved = await saveOrderToSheets();
    const orderNumber =
      saved.ok && saved.result && saved.result.orderNumber
        ? saved.result.orderNumber
        : null;

    state.lastOrderNumber = orderNumber;

    const total = getTotal();
    const { name, phone, addr, note } = getCustomerData();

    const finalText = fmtOrderText(
      state.biz,
      cartLines,
      name,
      phone,
      addr,
      note,
      total,
      orderNumber
    );

    const waLink = buildWhatsLink(state.biz.whatsapp_e164, finalText);

    if (orderNumber) {
      alert(`Pedido #${orderNumber} guardado. Se abrirá WhatsApp para enviarlo.`);
    }

    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  function attachHandlers() {
    [topBtn, bottomBtn].filter(Boolean).forEach((b) => b.addEventListener("click", handleSend));

    [inputName, inputPhone, inputAddr, inputNote].filter(Boolean).forEach((el) => {
      el.addEventListener("input", () => {
        state.lastOrderNumber = null;
        updatePreviewLinks();
      });
    });
  }

  // Init
  loadBusiness(slug)
    .then((biz) => {
      state.biz = biz;
      bizNameEl.textContent = biz.name;
      bizSubtitleEl.textContent = biz.subtitle || "";

      state.items = (biz.items || []).map((it, idx) => ({
        id: it.id || `item_${idx}`,
        ...it,
        selectedOption: it.options?.type === "select" ? (it.options.choices?.[0] || "") : ""
      }));

      attachHandlers();
      renderMenu();
      renderCart();
    })
    .catch((err) => {
      document.body.innerHTML = `<div style="padding:16px;font-family:system-ui">
        <h2>Error cargando negocio</h2>
        <p>${String(err.message || err)}</p>
        <p>Tip: asegúrate de tener <code>data/${getSlug()}.json</code>.</p>
        <p>Ejemplo: <code>?biz=demo</code></p>
      </div>`;
    });
})();

