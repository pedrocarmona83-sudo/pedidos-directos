// ====== CONFIG ======
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOg9WDMxfVCjtqsJxnOBVVvW4Xg4v26osTAIMHtcfMgBBzL0aELzeUISDTAMxUiNbJ/exec"; // https://script.google.com/macros/s/XXX/exec
// ====================

const money = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(n);

function getSlug() {
  const path = location.pathname.replace(/^\/+/,"");
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

function mapsLinkFromCoords(lat,lng){
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function fmtOrderText(
  biz,
  cartLines,
  name,
  phone,
  addr,
  note,
  total,
  orderNumber
){
  const lines=[];

  lines.push(`*Nuevo pedido* — ${biz.name}`);

  if(orderNumber)
    lines.push(`*Pedido #${orderNumber}*`);

  lines.push("");

  cartLines.forEach(c=>{
    lines.push(
      `• ${c.qty} x ${c.name}${c.optionText||""} — ${money(c.qty*c.price)}`
    );
  });

  lines.push("");
  lines.push(`*Total:* ${money(total)}`);

  if(name)
    lines.push(`Nombre: ${name}`);

  if(phone)
    lines.push(`Teléfono: ${phone}`);

  if(addr)
    lines.push(`Dirección: ${addr}`);

  if(note)
    lines.push(`Nota: ${note}`);

  lines.push("");
  lines.push("Pedidos Directos Pro");

  return lines.join("\n");
}


(function(){

const slug=getSlug();

const hero=document.getElementById("hero");
const bizNameEl=document.getElementById("bizName");
const bizSubtitleEl=document.getElementById("bizSubtitle");

const menuEl=document.getElementById("menu");
const cartEl=document.getElementById("cart");
const totalEl=document.getElementById("total");

const btnTop=document.getElementById("whatsBtnTop");
const btnBottom=document.getElementById("whatsBtn");

const inputName=document.getElementById("custName");
const inputPhone=document.getElementById("custPhone");
const inputAddr=document.getElementById("custAddr");
const inputNote=document.getElementById("custNote");

const state={
  biz:null,
  items:[],
  cart:{},
  lastOrderNumber:null
};


function variantKey(item){

  const opt=
    item.options?.type==="select"
    ?(item.selectedOption||"")
    :"";

  return `${item.id}|${opt}`;
}


function addToCart(item){

  const key=variantKey(item);

  const opt=
    item.options?.type==="select"
    ?(item.selectedOption||"")
    :"";

  const line=
    state.cart[key]||{
      itemId:item.id,
      name:item.name,
      price:item.price,
      option:opt,
      qty:0
    };

  line.qty++;

  state.cart[key]=line;

}


function removeFromCart(item){

  const key=variantKey(item);

  if(!state.cart[key])return;

  state.cart[key].qty--;

  if(state.cart[key].qty<=0)
    delete state.cart[key];

}


function getCartLines(){

  return Object.values(state.cart).map(l=>({

    ...l,

    optionText:
      l.option?` (${l.option})`:""

  }));

}


function getTotal(){

  return getCartLines()
    .reduce((s,l)=>s+l.qty*l.price,0);

}


function sanitizePhone(p){

  return String(p||"")
    .replace(/\D/g,"");

}


function getCustomerData(){

  return{

    name:(inputName?.value||"").trim(),

    phone:sanitizePhone(
      inputPhone?.value||""
    ),

    addr:(inputAddr?.value||"").trim(),

    note:(inputNote?.value||"").trim()

  };

}


function buildOrderTextForSheets(lines){

  return lines
    .map(c=>`${c.qty} x ${c.name}${c.optionText||""}`)
    .join(", ");

}


function updatePreviewLinks(){

  const cartLines=getCartLines();

  const total=getTotal();

  totalEl.textContent=money(total);

  const{
    name,
    phone,
    addr,
    note
  }=getCustomerData();


  const text=
    fmtOrderText(
      state.biz,
      cartLines,
      name,
      phone,
      addr,
      note,
      total,
      state.lastOrderNumber
    );

  const link=
    buildWhatsLink(
      state.biz.whatsapp_e164,
      text
    );

  if(btnTop)
    btnTop.href=link;

  if(btnBottom)
    btnBottom.href=link;

}


async function saveOrder(){

  const cartLines=getCartLines();

  if(!cartLines.length)
    return{ok:false};

  const total=getTotal();

  const{
    name,
    phone,
    addr,
    note
  }=getCustomerData();


  const payload={

    business:state.biz.name,

    business_slug:slug,

    customer:name,

    phone:phone,

    address:addr,

    note:note,

    order:
      buildOrderTextForSheets(
        cartLines
      ),

    total:total

  };


  try{

    const res=
      await fetch(
        GOOGLE_SCRIPT_URL,
        {
          method:"POST",
          body:JSON.stringify(payload)
        }
      );

    const txt=
      await res.text();

    let result={};

    try{
      result=JSON.parse(txt);
    }
    catch{}

    return{
      ok:true,
      result
    };

  }
  catch(e){

    console.log(e);

    return{
      ok:false
    };

  }

}


function renderMenu(){

  menuEl.innerHTML="";


  state.items.forEach((it,idx)=>{

    const key=
      variantKey(it);

    const qty=
      state.cart[key]?.qty||0;


    const row=
      document.createElement("div");

    row.className="item";


    const optionsHtml=

      it.options?.type==="select"

      ?

      `<select data-opt="${idx}">
      ${
        it.options.choices
        .map(c=>`
        <option value="${c}">
        ${c}
        </option>
        `).join("")
      }
      </select>`

      :

      "";


    row.innerHTML=

    `
    <div>
      <strong>
      ${it.name}
      </strong>

      <div class="price">
      ${money(it.price)}
      </div>

      ${optionsHtml}
    </div>

    <div>

      <button data-dec="${idx}">
      −
      </button>

      ${qty}

      <button data-inc="${idx}">
      +
      </button>

    </div>
    `;


    menuEl.appendChild(row);

  });

}


function renderCart(){

  const lines=
    getCartLines();

  cartEl.innerHTML="";

  lines.forEach(l=>{

    const div=
      document.createElement("div");

    div.innerHTML=
    `
    ${l.qty} x ${l.name}${l.optionText}
    — ${money(l.qty*l.price)}
    `;

    cartEl.appendChild(div);

  });

  updatePreviewLinks();

}


function attachEvents(){

menuEl.onclick=(e)=>{

  const inc=e.target.dataset.inc;

  const dec=e.target.dataset.dec;

  if(inc){

    addToCart(
      state.items[inc]
    );

  }

  if(dec){

    removeFromCart(
      state.items[dec]
    );

  }

  renderMenu();

  renderCart();

};


[btnTop,btnBottom]
.filter(Boolean)
.forEach(btn=>{

btn.onclick=
async(e)=>{

e.preventDefault();

const saved=
await saveOrder();

const orderNumber=
saved?.result?.orderNumber;

state.lastOrderNumber=
orderNumber;

const lines=
getCartLines();

const total=
getTotal();

const{
name,
phone,
addr,
note
}=getCustomerData();


const text=
fmtOrderText(
state.biz,
lines,
name,
phone,
addr,
note,
total,
orderNumber
);


window.open(
buildWhatsLink(
state.biz.whatsapp_e164,
text
),
"_blank"
);

};

});


}



loadBusiness(slug)

.then(biz=>{

state.biz=biz;


bizNameEl.textContent=
biz.name;

bizSubtitleEl.textContent=
biz.subtitle||"";


/* ===== HERO IMAGE ===== */

if(hero && biz.hero_image){

hero.style.backgroundImage=
`url("${biz.hero_image}")`;

hero.style.backgroundSize=
"cover";

hero.style.backgroundPosition=
"center";

hero.style.backgroundRepeat=
"no-repeat";

}

/* ====================== */


state.items=
(biz.items||[])
.map((it,i)=>({

id:
it.id||
`item_${i}`,

...it,

selectedOption:
it.options?.type==="select"
?
it.options.choices[0]
:
""

}));


attachEvents();

renderMenu();

renderCart();

})

.catch(err=>{

document.body.innerHTML=

`
Error:
${err.message}
`;

});


})();
