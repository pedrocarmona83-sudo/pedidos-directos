// ====== CONFIG ======
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxxhFFmQAmz-SMHZqyZtN2J33V2_cnx5Lv3ZmZj_bAng5XUC7xth_Bo3bx4FZMCujp/exec"; // https://script.google.com/macros/s/XXX/exec
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

function isMobileView() {
  return window.innerWidth <= 700;
}

function isSelectConfig(value) {
  return (
    value &&
    typeof value === "object" &&
    value.type === "select" &&
    Array.isArray(value.choices)
  );
}

function getSelectableFields(item) {
  return Object.entries(item)
    .filter(([key, value]) => {
      if (["id", "name", "price", "desc", "category", "category_image", "image"].includes(key)) {
        return false;
      }
      return isSelectConfig(value);
    })
    .map(([key, value]) => ({
      key,
      label: value.label || key,
      choices: value.choices || []
    }));
}

function buildDefaultSelections(item) {
  const selections = {};
  const selectableFields = getSelectableFields(item);

  selectableFields.forEach((field) => {
    selections[field.key] = field.choices?.[0] || "";
  });

  return selections;
}

function buildSelectionsText(selections, item) {
  const selectableFields = getSelectableFields(item);
  if (!selectableFields.length) return "";

  const parts = selectableFields
    .map((field) => {
      const value = selections?.[field.key] || "";
      if (!value) return "";
      return `${field.label}: ${value}`;
    })
    .filter(Boolean);

  return parts.length ? ` (${parts.join(", ")})` : "";
}

function buildSelectionsKey(selections) {
  const keys = Object.keys(selections || {}).sort();
  return keys.map((k) => `${k}:${selections[k] || ""}`).join("|");
}

function fmtOrderText(
  biz,
  cartLines,
  name,
  phone,
  deliveryType,
  eta,
  addr,
  note,
  payment,
  bank,
  clabe,
  accountHolder,
  total,
  orderNumber
) {
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
  if (deliveryType) lines.push(`Entrega: ${deliveryType}`);
  if (eta) lines.push(`Hora estimada: ${eta}`);
  if (deliveryType === "Domicilio" && addr) lines.push(`Dirección: ${addr}`);
  if (payment) lines.push(`Pago: ${payment}`);

  if (payment === "Transferencia") {
    if (bank) lines.push(`Banco: ${bank}`);
    if (clabe) lines.push(`CLABE: ${clabe}`);
    if (accountHolder) lines.push(`Titular: ${accountHolder}`);
  }

  if (note) lines.push(`Nota: ${note}`);

  lines.push("");
  lines.push("👉 Por favor envía este mensaje para confirmar tu pedido.");
  lines.push("⚠️ El pedido se registra inicialmente como pendiente.");
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
  const inputDeliveryType = document.getElementById("custDeliveryType");
  const inputEta = document.getElementById("custEta");
  const inputAddr = document.getElementById("custAddr");
  const inputAddrWrapper = document.getElementById("custAddrWrapper");
  const inputNote = document.getElementById("custNote");
  const inputPayment = document.getElementById("custPayment");

  const paymentTransferFields = document.getElementById("paymentTransferFields");
  const displayBank = document.getElementById("displayBank");
  const displayClabe = document.getElementById("displayClabe");
  const displayAccountHolder = document.getElementById("displayAccountHolder");

  const state = {
    biz: null,
    items: [],
    cart: {},
    lastOrderNumber: null,
    collapsedCategories: {}
  };

  function getBusinessPaymentDetails() {
    const details = state.biz?.payment_details || {};
    return {
      bank: String(details.bank || "").trim(),
      clabe: String(details.clabe || "").trim(),
      accountHolder: String(details.account_holder || "").trim()
    };
  }

  function variantKey(item) {
    return `${item.id}|${buildSelectionsKey(item.selectedSelections || {})}`;
  }

  function addToCart(item) {
    const key = variantKey(item);

    const line = state.cart[key] || {
      itemId: item.id,
      name: item.name,
      price: item.price,
      selections: { ...(item.selectedSelections || {}) },
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

  function findItemById(itemId) {
    return state.items.find((it) => it.id === itemId);
  }

  function getCartLines() {
    return Object.values(state.cart).map((line) => {
      const item = findItemById(line.itemId);
      return {
        ...line,
        optionText: item ? buildSelectionsText(line.selections, item) : ""
      };
    });
  }

  function getTotal() {
    return getCartLines().reduce((sum, line) => sum + line.qty * line.price, 0);
  }

  function sanitizePhone(p) {
    return String(p || "").replace(/\D/g, "");
  }

  function updateDeliveryFieldsVisibility() {
    if (!inputDeliveryType || !inputAddrWrapper || !inputAddr) return;

    const isPickup = inputDeliveryType.value === "Recoger";
    inputAddrWrapper.style.display = isPickup ? "none" : "flex";

    if (isPickup) {
      inputAddr.value = "";
    }
  }

  function getCustomerData() {
    const payment = (inputPayment?.value || "Efectivo").trim();
    const paymentDetails = getBusinessPaymentDetails();
    const deliveryType = (inputDeliveryType?.value || "Domicilio").trim();
    const isPickup = deliveryType === "Recoger";

    return {
      name: (inputName?.value || "").trim(),
      phone: sanitizePhone(inputPhone?.value || ""),
      deliveryType,
      eta: (inputEta?.value || "").trim(),
      addr: isPickup ? "" : (inputAddr?.value || "").trim(),
      note: (inputNote?.value || "").trim(),
      payment,
      bank: payment === "Transferencia" ? paymentDetails.bank : "",
      clabe: payment === "Transferencia" ? paymentDetails.clabe : "",
      accountHolder: payment === "Transferencia" ? paymentDetails.accountHolder : ""
    };
  }

  function buildOrderTextForSheets(lines) {
    return lines
      .map((c) => `${c.qty} x ${c.name}${c.optionText || ""}`)
      .join(", ");
  }

  function initializeCollapsedCategories() {
    const categories = [
      ...new Set(state.items.map((it) => (it.category || "General").trim()))
    ];

    state.collapsedCategories = {};

    categories.forEach((categoryName, index) => {
      if (isMobileView()) {
        state.collapsedCategories[categoryName] = index !== 0;
      } else {
        state.collapsedCategories[categoryName] = false;
      }
    });
  }

  function updatePaymentFieldsVisibility() {
    if (!paymentTransferFields || !inputPayment) return;

    const isTransfer = inputPayment.value === "Transferencia";
    paymentTransferFields.style.display = isTransfer ? "block" : "none";

    const details = getBusinessPaymentDetails();

    if (displayBank) displayBank.textContent = details.bank || "-";
    if (displayClabe) displayClabe.textContent = details.clabe || "-";
    if (displayAccountHolder) displayAccountHolder.textContent = details.accountHolder || "-";
  }

  function updatePreviewLinks() {
    const cartLines = getCartLines();
    const total = getTotal();

    totalEl.textContent = money(total);

    const {
      name,
      phone,
      deliveryType,
      eta,
      addr,
      note,
      payment,
      bank,
      clabe,
      accountHolder
    } = getCustomerData();

    const text = fmtOrderText(
      state.biz,
      cartLines,
      name,
      phone,
      deliveryType,
      eta,
      addr,
      note,
      payment,
      bank,
      clabe,
      accountHolder,
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

    const {
      name,
      phone,
      deliveryType,
      eta,
      addr,
      note,
      payment,
      bank,
      clabe,
      accountHolder
    } = getCustomerData();

    const payload = {
      business: state.biz.name,
      business_slug: slug,
      customer: name,
      phone: phone,
      delivery_type: deliveryType,
      eta: eta,
      address: addr,
      note: note,
      payment: payment,
      bank: bank,
      clabe: clabe,
      account_holder: accountHolder,
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
        grouped[category] = {
          image: it.category_image || "",
          items: []
        };
      }

      if (!grouped[category].image && it.category_image) {
        grouped[category].image = it.category_image;
      }

      grouped[category].items.push({ item: it, idx });
    });

    Object.keys(grouped).forEach((categoryName) => {
      const isCollapsed = !!state.collapsedCategories[categoryName];
      const categoryImage = grouped[categoryName].image || "";

      const section = document.createElement("div");
      section.className = "menuSection";

      const header = document.createElement("div");
      header.className = "menuSectionHeader";

      if (categoryImage) {
        const imageWrap = document.createElement("button");
        imageWrap.type = "button";
        imageWrap.className = "menuCategoryImageWrap";
        imageWrap.dataset.categoryToggle = categoryName;
        imageWrap.innerHTML = `
          <img src="${categoryImage}" alt="${categoryName}" class="menuCategoryImage" />
          <div class="menuCategoryImageOverlay"></div>
          <div class="menuCategoryImageTitle">
            <span class="menuCategoryImageTitleText">${categoryName}</span>
            <span class="menuCategoryImageChevron">${isCollapsed ? "▸" : "▾"}</span>
          </div>
        `;
        header.appendChild(imageWrap);
      } else {
        const titleBtn = document.createElement("button");
        titleBtn.type = "button";
        titleBtn.className = "menuSectionTitleBtn";
        titleBtn.dataset.categoryToggle = categoryName;
        titleBtn.innerHTML = `
          <span class="menuSectionTitleText">${categoryName}</span>
          <span class="menuSectionChevron">${isCollapsed ? "▸" : "▾"}</span>
        `;
        header.appendChild(titleBtn);
      }

      const sectionItems = document.createElement("div");
      sectionItems.className = "menuSectionItems";
      sectionItems.style.display = isCollapsed ? "none" : "flex";

      grouped[categoryName].items.forEach(({ item: it, idx }) => {
        const key = variantKey(it);
        const qty = state.cart[key]?.qty || 0;

        const row = document.createElement("div");
        row.className = "item";

        const selectableFields = getSelectableFields(it);

        const selectsHtml = selectableFields
          .map((field) => {
            const selectedValue = it.selectedSelections?.[field.key] || "";
            return `
              <div style="margin-top:8px">
                <label class="muted small">${field.label}</label>
                <select
                  data-opt-item="${idx}"
                  data-opt-key="${field.key}"
                  style="width:100%;margin-top:6px;padding:10px;border-radius:12px;border:1px solid #1b2230;background:#0b0c10;color:#e9eef6"
                >
                  ${field.choices
                    .map(
                      (choice) =>
                        `<option value="${choice}" ${choice === selectedValue ? "selected" : ""}>${choice}</option>`
                    )
                    .join("")}
                </select>
              </div>
            `;
          })
          .join("");

        row.innerHTML = `
          <div style="min-width:0">
            <strong>${it.name}</strong>
            ${it.desc ? `<div class="muted small">${it.desc}</div>` : ""}
            <div class="price">${money(it.price)}</div>
            ${selectsHtml}
          </div>

          <div class="controls">
            <button class="btn btn-sm btn-ghost" type="button" data-dec="${idx}">−</button>
            <div class="qty">${qty}</div>
            <button class="btn btn-sm btn-ghost" type="button" data-inc="${idx}">+</button>
          </div>
        `;

        sectionItems.appendChild(row);
      });

      section.appendChild(header);
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
      const toggleBtn = e.target.closest("[data-category-toggle]");
      if (toggleBtn) {
        const categoryName = toggleBtn.dataset.categoryToggle;
        state.collapsedCategories[categoryName] = !state.collapsedCategories[categoryName];
        renderMenu();
        return;
      }

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
      const itemIdx = e.target.dataset.optItem;
      const optionKey = e.target.dataset.optKey;

      if (itemIdx === undefined || optionKey === undefined) return;

      const item = state.items[Number(itemIdx)];
      item.selectedSelections = {
        ...(item.selectedSelections || {}),
        [optionKey]: e.target.value
      };

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

          const {
            name,
            phone,
            deliveryType,
            eta,
            addr,
            note,
            payment,
            bank,
            clabe,
            accountHolder
          } = getCustomerData();

          const text = fmtOrderText(
            state.biz,
            cartLines,
            name,
            phone,
            deliveryType,
            eta,
            addr,
            note,
            payment,
            bank,
            clabe,
            accountHolder,
            total,
            orderNumber
          );

          const waLink = buildWhatsLink(state.biz.whatsapp_e164, text);

          if (orderNumber) {
            alert(`Pedido #${orderNumber} registrado como pendiente. Se abrirá WhatsApp para confirmarlo.`);
          }

          window.open(waLink, "_blank", "noopener,noreferrer");
        };
      });

    [inputName, inputPhone, inputDeliveryType, inputEta, inputAddr, inputNote, inputPayment]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener("input", () => {
          state.lastOrderNumber = null;
          updateDeliveryFieldsVisibility();
          updatePaymentFieldsVisibility();
          updatePreviewLinks();
        });

        input.addEventListener("change", () => {
          state.lastOrderNumber = null;
          updateDeliveryFieldsVisibility();
          updatePaymentFieldsVisibility();
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
        selectedSelections: buildDefaultSelections(it)
      }));

      initializeCollapsedCategories();
      attachEvents();
      updateDeliveryFieldsVisibility();
      updatePaymentFieldsVisibility();
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
