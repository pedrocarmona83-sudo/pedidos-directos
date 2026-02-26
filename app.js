const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function getSlug() {
  // URL esperada: /?biz=demo  (simple y sin rutas)
  const url = new URL(location.href);
  return (url.searchParams.get("biz") || "demo").toLowerCase();
}

async function loadBusiness(slug) {
  const res = await fetch(`data/${slug}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`No existe data/${slug}.json`);
  return await res.json();
}

function buildWhatsLink(phoneE164, text) {
  // phoneE164 ejemplo: 5215512345678 (sin +)
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${phoneE164}?text=${encoded}`;
}

function fmtOrderText(biz, cart, name, addr, note, total) {
  const lines = [];
  lines.push(`*Nuevo pedido* — ${biz.name}`);
  lines.push("");
  cart.forEach((c) => lines.push(`• ${c.qty} x ${c.name} — ${money(c.qty * c.price)}`));
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

  const state = {
    items: biz.items.map((it) => ({ ...it, qty: 0 }))
  };

  function getCart() {
    return state.items.filter((i) => i.qty > 0);
  }

  function getTotal() {
    return getCart().reduce((s, i) => s + i.qty * i.price, 0);
  }

  function renderMenu() {
    menuEl.innerHTML = "";
    state.items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <strong>${it.name}</strong>
          ${it.desc ? `<div class="muted small">${it.desc}</div>` : ""}
          <div class="price">${money(it.price)}</div>
        </div>
        <div class="controls">
          <button class="btn btn-sm btn-ghost" data-act="dec" data-idx="${idx}">-</button>
          <div class="qty" id="qty-${idx}">${it.qty}</div>
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
      if (act === "inc") state.items[idx].qty += 1;
      if (act === "dec") state.items[idx].qty = Math.max(0, state.items[idx].qty - 1);
      document.getElementById(`qty-${idx}`).textContent = state.items[idx].qty;
      renderCart();
    }, { once: true });
  }

  function renderCart() {
    const cart = getCart();
    cartEl.innerHTML = "";

    if (cart.length === 0) {
      cartEl.innerHTML = `<p class="muted">Aún no agregas productos.</p>`;
    } else {
      cart.forEach((c) => {
        const r = document.createElement("div");
        r.className = "cartRow";
        r.innerHTML = `
          <div>
            <strong>${c.qty} x ${c.name}</strong>
            <div class="muted small">${money(c.price)} c/u</div>
          </div>
          <div><strong>${money(c.qty * c.price)}</strong></div>
        `;
        cartEl.appendChild(r);
      });
    }

    const total = getTotal();
    totalEl.textContent = money(total);

    const name = document.getElementById("custName").value.trim();
    const addr = document.getElementById("custAddr").value.trim();
    const note = document.getElementById("custNote").value.trim();

    const text = fmtOrderText(biz, cart, name, addr, note, total);
    const link = buildWhatsLink(biz.whatsapp_e164, text);

    document.getElementById("whatsBtn").href = link;
    document.getElementById("whatsBtnTop").href = link;

    // Bloqueo suave si carrito vacío
    const disabled = cart.length === 0;
    document.getElementById("whatsBtn").style.opacity = disabled ? "0.5" : "1";
    document.getElementById("whatsBtnTop").style.opacity = disabled ? "0.5" : "1";
    document.getElementById("whatsBtn").style.pointerEvents = disabled ? "none" : "auto";
    document.getElementById("whatsBtnTop").style.pointerEvents = disabled ? "none" : "auto";
  }

  // Re-render cuando cambien inputs
  ["custName","custAddr","custNote"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => renderCart());
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