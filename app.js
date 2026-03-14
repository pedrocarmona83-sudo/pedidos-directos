// ====== CONFIG ======
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOg9WDMxfVCjtqsJxnOBVVvW4Xg4v26osTAIMHtcfMgBBzL0aELzeUISDTAMxUiNbJ/exec"; // https://script.google.com/macros/s/XXX/exec
// ====================

const money = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(n);

function getSlug() {
  const path = location.pathname.replace(/^\/+/, "").trim();
  if (path) return path.toLowerCase();

  const url = new URL(location.href);
  return (url.searchParams.get("biz") || "demo").toLowerCase();
}

async function loadBusiness(slug) {
  const res = await fetch(`data/${slug}.json?v=${Date.now()}`);
  if (!res.ok) throw new Error(`No existe data/${slug}.json`);
  return await res.json();
}

function buildWhatsLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function fmtOrderText(biz, cartLines, name, phone, addr, note, total, orderNumber) {
  const lines = [];

  lines.push(`*Nuevo pedido* — ${biz.name}`);

  if (orderNumber) {
    lines.push(`*Pedido #${orderNumber}*`);
  }

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
  lines.push("Pedidos Directos Pro");

  return lines.join("\n");
}

(function () {
  const slug = getSlug();

  const hero = document.getElementById("hero");
  const bizLogoEl = document.getElementById("bizLogo");
  const bizNameEl = document.getElementById("bizName");
  const bizSubtitleEl = document.getElementById("bizSubtitle");

  const menuEl = document.getElementById("menu");
  const cartEl = document.getElementById("cart");
  const totalEl = document.getElementById("total");

  const btnTop = document.getElementById("whatsBtnTop");
  const btnBottom = document.getElementById("whatsBtn");

  const inputName = document.getElementById("custName");
  const inputPhone = document.getElementById("custPhone");
  const inputAddr = document.getElementById("custAddr");
  const inputNote = document.getElementById("custNote");

  const state = {
    biz: null,
    items: [],
    cart: {},
    lastOrderNumber: null
  };

  function variantKey(item) {
    const opt =
      item.options?.type === "select"
        ? (item.selectedOption || "")
        : "";

    return `${item.id}|${opt}`;
  }

  function addToCart(item) {
    const key = variantKey(item);

    const opt =
      item.options?.type === "select"
        ? (item.selectedOption || "")
        : "";

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

    state.cart[key].qty -= 1;

    if (state.cart[key].qty <= 0) {
      delete state.cart[key];
    }
  }

  function getCartLines() {
    return Object.values(state.cart).map((l) => ({
      ...l,
      optionText: l.option ? ` (${l.option})` : ""
    }));
  }

  function getTotal() {
    return getCartLines().reduce((sum, line) => sum + line.qty * line.price, 0);
  }

  function sanitizePhone(p) {
    return String(p || "").replace(/\D/g, "");
  }

  function getCustomerData() {
    return {
      name: (inputName?.value || "").trim(),
      phone: sanitizePhone(inputPhone?.value || ""),
      addr: (inputAddr?.value || "").trim(),
      note: (inputNote?.value || "").trim()
    };
  }

  function buildOrderTextForSheets(lines) {
    return lines
      .map((c) => `${c.qty} x ${c.name}${c.optionText || ""}`)
      .join(", ");
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

    if (btnTop) btnTop.href = link;
    if (btnBottom) btnBottom.href = link;

    const disabled = cartLines.length === 0;

    [btnTop, btnBottom]
      .filter(Boolean)
      .forEach((btn) => {
        btn.style.opacity = disabled ? "0.5" : "1";
        btn.style.pointerEvents = disabled ? "none" : "auto";
      });
  }

  async function saveOrder() {
    const cartLines = getCartLines();

    if (!cartLines.length) {
      return { ok: false };
    }

    const total = getTotal();
    const { name, phone, addr, note } = getCustomerData();

    const payload = {
      business: state.biz.name,
      business_slug: slug,
      customer: name,
      phone: phone,
      address: addr,
      note: note,
      order: buildOrderTextForSheets(cartLines),
      total: total
    };

    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const txt = await res.text();

      let result = {};
      try {
        result = JSON.parse(txt);
      } catch (_) {}

      return {
        ok: true,
        result
      };
    } catch (e) {
      console.log("Error guardando pedido:", e);
      return { ok: false };
    }
  }

  function renderMenu() {
  menuEl.innerHTML = "";

  const grouped = {};

  state.items.forEach((it, idx) => {
    const category = (it.category || "General").trim();

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push({ item: it, idx });
  });

  Object.keys(grouped).forEach((categoryName) => {
    const section = document.createElement("div");
    section.className = "menuSection";

    const title = document.createElement("h3");
    title.className = "menuSectionTitle";
    title.textContent = categoryName;

    const sectionItems = document.createElement("div");
    sectionItems.className = "menuSectionItems";

    grouped[categoryName].forEach(({ item: it, idx }) => {
      const key = variantKey(it);
      const qty = state.cart[key]?.qty || 0;

      const row = document.createElement("div");
      row.className = "item";

      const optionsHtml =
        it.options?.type === "select"
          ? `
            <div style="margin-top:8px">
              <label class="muted small">${it.options.label || "Opciones"}</label>
              <select
                data-opt="${idx}"
                style="width:100%;margin-top:6px;padding:10px;border-radius:12px;border:1px solid #1b2230;background:#0b0c10;color:#e9eef6"
              >
                ${(it.options.choices || [])
                  .map(
                    (c) =>
                      `<option value="${c}" ${c === it.selectedOption ? "selected" : ""}>${c}</option>`
                  )
                  .join("")}
              </select>
            </div>
          `
          : "";

      row.innerHTML = `
        <div style="min-width:0">
          <strong>${it.name}</strong>
          ${it.desc ? `<div class="muted small">${it.desc}</div>` : ""}
          <div class="price">${money(it.price)}</div>
          ${optionsHtml}
        </div>

        <div class="controls">
          <button class="btn btn-sm btn-ghost" type="button" data-dec="${idx}">−</button>
          <div class="qty">${qty}</div>
          <button class="btn btn-sm btn-ghost" type="button" data-inc="${idx}">+</button>
        </div>
      `;

      sectionItems.appendChild(row);
    });

    section.appendChild(title);
    section.appendChild(sectionItems);
    menuEl.appendChild(section);
  });
}

  function renderCart() {
    const lines = getCartLines();
    cartEl.innerHTML = "";

    if (!lines.length) {
      cartEl.innerHTML = `<p class="muted">Aún no agregas productos.</p>`;
      updatePreviewLinks();
      return;
    }

    lines.forEach((l) => {
      const div = document.createElement("div");
      div.className = "cartRow";
      div.innerHTML = `
        <div style="min-width:0">
          <strong>${l.qty} x ${l.name}${l.optionText}</strong>
          <div class="muted small">${money(l.price)} c/u</div>
        </div>
        <div><strong>${money(l.qty * l.price)}</strong></div>
      `;
      cartEl.appendChild(div);
    });

    updatePreviewLinks();
  }

  function attachEvents() {
    menuEl.onclick = (e) => {
      if (e.target.closest("select")) {
        return;
      }

      const inc = e.target.dataset.inc;
      const dec = e.target.dataset.dec;

      if (inc !== undefined) {
        addToCart(state.items[Number(inc)]);
        state.lastOrderNumber = null;
        renderMenu();
        renderCart();
        return;
      }

      if (dec !== undefined) {
        removeFromCart(state.items[Number(dec)]);
        state.lastOrderNumber = null;
        renderMenu();
        renderCart();
        return;
      }
    };

    menuEl.onchange = (e) => {
      const idx = e.target.dataset.opt;

      if (idx === undefined) return;

      const item = state.items[Number(idx)];
      item.selectedOption = e.target.value;

      state.lastOrderNumber = null;
      renderMenu();
      renderCart();
    };

    [btnTop, btnBottom]
      .filter(Boolean)
      .forEach((btn) => {
        btn.onclick = async (e) => {
          e.preventDefault();

          const cartLines = getCartLines();
          if (!cartLines.length) return;

          const saved = await saveOrder();
          const orderNumber = saved?.result?.orderNumber || null;

          state.lastOrderNumber = orderNumber;

          const total = getTotal();
          const { name, phone, addr, note } = getCustomerData();

          const text = fmtOrderText(
            state.biz,
            cartLines,
            name,
            phone,
            addr,
            note,
            total,
            orderNumber
          );

          const waLink = buildWhatsLink(state.biz.whatsapp_e164, text);

          if (orderNumber) {
            alert(`Pedido #${orderNumber} guardado. Se abrirá WhatsApp para enviarlo.`);
          }

          window.open(waLink, "_blank", "noopener,noreferrer");
        };
      });

    [inputName, inputPhone, inputAddr, inputNote]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener("input", () => {
          state.lastOrderNumber = null;
          updatePreviewLinks();
        });
      });
  }

  loadBusiness(slug)
    .then((biz) => {
      state.biz = biz;

      bizNameEl.textContent = biz.name;
      bizSubtitleEl.textContent = biz.subtitle || "";

     if (hero && biz.hero_image) {
  hero.style.backgroundImage = `url("${biz.hero_image}")`;
  hero.style.backgroundSize = "cover";
  hero.style.backgroundPosition = "center";
  hero.style.backgroundRepeat = "no-repeat";
}

if (bizLogoEl && biz.logo) {
  bizLogoEl.src = biz.logo;
  bizLogoEl.style.display = "block";
} else if (bizLogoEl) {
  bizLogoEl.style.display = "none";
}

      state.items = (biz.items || []).map((it, i) => ({
        id: it.id || `item_${i}`,
        ...it,
        selectedOption:
          it.options?.type === "select"
            ? (it.options.choices?.[0] || "")
            : ""
      }));

      attachEvents();
      renderMenu();
      renderCart();
    })
    .catch((err) => {
      document.body.innerHTML = `
        <div style="padding:16px;font-family:system-ui">
          <h2>Error cargando negocio</h2>
          <p>${err.message}</p>
        </div>
      `;
    });
})();
