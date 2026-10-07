const $=(q,s=document)=>s.querySelector(q); const $$=(q,s=document)=>[...s.querySelectorAll(q)];
let products=[], cart=JSON.parse(localStorage.getItem("jenet_cart")||"[]"), ownerKey=sessionStorage.getItem("jenet_owner")||"";
let activeCategory="All";

function money(v){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0))}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2500)}
async function api(url,opts={}){const r=await fetch(url,opts);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed");return data}

function saveCart(){localStorage.setItem("jenet_cart",JSON.stringify(cart));renderCart()}
function addCart(id){const found=cart.find(x=>x.id===id);if(found)found.qty++;else cart.push({id,qty:1});saveCart();toast("Added to cart")}
function renderCart(){
  const count=cart.reduce((s,x)=>s+x.qty,0);$("#cartCount").textContent=count;
  const rows=cart.map(i=>{const p=products.find(x=>Number(x.id)===Number(i.id));if(!p)return"";return `<div class="cart-row"><img src="${p.image_url}" alt=""><div><strong>${p.name}</strong><div class="muted">${money(p.price)}</div><div class="qty"><button data-q="-1" data-id="${p.id}">−</button><span>${i.qty}</span><button data-q="1" data-id="${p.id}">+</button></div></div><button class="close" data-remove="${p.id}">×</button></div>`}).join("");
  $("#cartItems").innerHTML=rows||'<p class="muted">Your cart is empty.</p>';
  const total=cart.reduce((s,i)=>{const p=products.find(x=>Number(x.id)===Number(i.id));return s+(p?Number(p.price)*i.qty:0)},0);$("#cartTotal").textContent=money(total);
  $$("[data-q]").forEach(b=>b.onclick=()=>{const i=cart.find(x=>Number(x.id)===Number(b.dataset.id));i.qty=Math.max(1,i.qty+Number(b.dataset.q));saveCart()});
  $$("[data-remove]").forEach(b=>b.onclick=()=>{cart=cart.filter(x=>Number(x.id)!==Number(b.dataset.remove));saveCart()});
}
function card(p){return `<article class="product-card"><div class="product-media"><img loading="lazy" src="${p.image_url||"https://placehold.co/900x1100?text=JENET"}" alt="${p.name}"></div>${p.badge?`<span class="badge">${p.badge}</span>`:""}<div class="product-info"><div class="product-top"><h3>${p.name}</h3><div class="price">${money(p.price)}${p.compare_price?`<span class="compare">${money(p.compare_price)}</span>`:""}</div></div><div class="rating">★ ${p.rating||"New"} <span class="muted">(${p.review_count||0})</span></div><div class="muted">${p.category} · ${p.stock} in stock</div><div class="card-actions"><button class="btn ghost" data-view="${p.id}">View</button><button class="btn primary" data-add="${p.id}">Add</button></div></div></article>`}
function renderProducts(){
  const cats=["All",...new Set(products.map(p=>p.category).filter(Boolean))];
  $("#filters").innerHTML=cats.map(c=>`<button class="${c===activeCategory?"active":""}" data-cat="${c}">${c}</button>`).join("");
  const visible=activeCategory==="All"?products:products.filter(p=>p.category===activeCategory);
  $("#productGrid").innerHTML=visible.map(card).join("")||'<p class="muted">No products yet.</p>';
  $$("[data-cat]").forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;renderProducts()});
  $$("[data-add]").forEach(b=>b.onclick=()=>addCart(Number(b.dataset.add)));
  $$("[data-view]").forEach(b=>b.onclick=()=>openProduct(Number(b.dataset.view)));
}
async function loadProducts(){
  try{const d=await api("/api/store?resource=products");products=d.products||[]}catch(e){console.error(e);toast("Store data unavailable")}
  renderProducts();renderCart(); if(ownerKey)renderOwnerProducts();
}
async function openProduct(id){
  const p=products.find(x=>Number(x.id)===id);if(!p)return;
  let reviews=[];try{reviews=(await api(`/api/store?resource=reviews&productId=${id}`)).reviews||[]}catch{}
  const d=$("#productDialog");d.innerHTML=`<button class="close dialog-close" onclick="this.closest('dialog').close()">×</button><div class="product-modal-grid"><img src="${p.image_url}" alt="${p.name}"><div class="product-modal-copy"><span class="eyebrow">${p.category}</span><h2>${p.name}</h2><div class="price">${money(p.price)}</div><p class="muted">${p.description}</p><button class="btn primary" id="modalAdd">Add to cart</button><div class="review-list"><h3>Reviews</h3>${reviews.map(r=>`<div class="review-item"><b>${"★".repeat(r.rating)}</b> ${r.customer_name}<p>${r.comment}</p></div>`).join("")||'<p class="muted">Be the first to review.</p>'}<form id="reviewForm"><label>Your name<input name="name" required></label><label>Rating<select name="rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label><label>Review<textarea name="comment" required></textarea></label><button class="btn ghost">Post review</button></form></div></div></div>`;d.showModal();
  $("#modalAdd").onclick=()=>addCart(id);$("#reviewForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await api("/api/store?resource=review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId:id,name:f.get("name"),rating:f.get("rating"),comment:f.get("comment")})});toast("Review posted");d.close();openProduct(id)}
}
$("#cartBtn").onclick=()=>$("#cartDrawer").classList.add("open"); $$("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).classList.remove("open"));
$$("[data-dialog]").forEach(b=>b.onclick=()=>$("#"+b.dataset.dialog).close());
$("#checkoutBtn").onclick=()=>{if(!cart.length)return toast("Cart is empty");$("#cartDrawer").classList.remove("open");$("#checkoutDialog").showModal()};
$("#checkoutForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const payload=Object.fromEntries(f.entries());payload.items=cart;const btn=e.target.querySelector("button");btn.disabled=true;btn.textContent="Creating order…";try{const d=await api("/api/store?resource=order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});createInvoice(d.order);cart=[];saveCart();$("#checkoutDialog").close();toast(d.payment?.message||"Order placed")}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent="Place order"}};
function createInvoice(o){
  const {jsPDF}=window.jspdf||{};if(!jsPDF)return;
  const doc=new jsPDF();doc.setFontSize(22);doc.text("JENET",20,22);doc.setFontSize(11);doc.text("Invoice "+o.invoice_no,20,34);doc.text(new Date(o.created_at||Date.now()).toLocaleString(),20,41);doc.text("Bill to: "+o.customerName,20,54);doc.text(o.email,20,61);doc.text(o.phone||"",20,68);doc.text(String(o.address).slice(0,90),20,75);let y=92;
  o.items.forEach(i=>{doc.text(`${i.name}  x${i.qty}`,20,y);doc.text(money(Number(i.price)*i.qty),150,y);y+=9});
  doc.line(20,y,190,y);y+=10;doc.setFontSize(14);doc.text("Total: "+money(o.total),130,y);doc.setFontSize(10);doc.text("Payment: "+o.paymentMethod,20,y);const name=o.invoice_no+".pdf";doc.save(name);
  if(navigator.share&&navigator.canShare){const blob=doc.output("blob");const file=new File([blob],name,{type:"application/pdf"});if(navigator.canShare({files:[file]}))navigator.share({title:"JENET invoice",files:[file]}).catch(()=>{})}
}
$("#ownerBtn").onclick=()=>$("#ownerDialog").showModal();
$("#ownerLoginForm").onsubmit=async e=>{e.preventDefault();ownerKey=new FormData(e.target).get("key");sessionStorage.setItem("jenet_owner",ownerKey);try{await loadOrders();$("#ownerLogin").hidden=true;$("#ownerPanel").hidden=false;renderOwnerProducts();toast("Owner access granted")}catch{ownerKey="";sessionStorage.removeItem("jenet_owner");toast("Invalid owner key")}};
function renderOwnerProducts(){if(!ownerKey)return;$("#ownerProducts").innerHTML=products.map(p=>`<div class="owner-product"><img src="${p.image_url}"><div><strong>${p.name}</strong><div class="muted">${money(p.price)} · Stock ${p.stock}</div></div><div class="owner-actions"><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Remove</button></div></div>`).join("");$$("[data-edit]").forEach(b=>b.onclick=()=>editProduct(Number(b.dataset.edit)));$$("[data-delete]").forEach(b=>b.onclick=()=>removeProduct(Number(b.dataset.delete)))}
async function loadOrders(){const d=await api("/api/store?resource=orders",{headers:{"x-owner-key":ownerKey}});$("#ownerOrders").innerHTML=(d.orders||[]).map(o=>`<div class="owner-order"><div><strong>${o.invoice_no}</strong><div class="muted">${o.customer_name} · ${o.email}<br>${o.payment_method} / ${o.order_status}</div></div><strong>${money(o.total)}</strong></div>`).join("")||'<p class="muted">No orders yet.</p>'}
$$("[data-tab]").forEach(b=>b.onclick=async()=>{$$("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");const isP=b.dataset.tab==="products";$("#ownerProducts").hidden=!isP;$("#ownerOrders").hidden=isP;if(!isP)await loadOrders()});
$("#newProductBtn").onclick=()=>editProduct();
function editProduct(id){const p=products.find(x=>Number(x.id)===id)||{};const f=$("#productForm");f.reset();["id","name","category","price","comparePrice","stock","badge","imageUrl","description"].forEach(k=>{const map={comparePrice:"compare_price",imageUrl:"image_url"};if(f.elements[k])f.elements[k].value=p[map[k]||k]??""});$("#editorTitle").textContent=id?"Edit product":"New product";$("#productEditor").showModal()}
$("#productForm").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.action="upsert";await api("/api/store?resource=owner-product",{method:"POST",headers:{"content-type":"application/json","x-owner-key":ownerKey},body:JSON.stringify(body)});$("#productEditor").close();toast("Product saved");await loadProducts()};
async function removeProduct(id){if(!confirm("Remove this product from customer view?"))return;await api("/api/store?resource=owner-product",{method:"POST",headers:{"content-type":"application/json","x-owner-key":ownerKey},body:JSON.stringify({action:"delete",id})});toast("Product removed");await loadProducts()}
if(ownerKey){$("#ownerLogin").hidden=true;$("#ownerPanel").hidden=false}

async function init3D(){
  try{
    const THREE=await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    const c=$("#scene"),r=new THREE.WebGLRenderer({canvas:c,antialias:true,alpha:true});r.setPixelRatio(Math.min(devicePixelRatio,2));
    const s=new THREE.Scene(),cam=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,100);cam.position.z=7;
    const geo=new THREE.IcosahedronGeometry(2.3,2),mat=new THREE.MeshPhysicalMaterial({color:0x8a7b55,metalness:.65,roughness:.22,wireframe:false,transparent:true,opacity:.28});
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(2.8,.2,0);s.add(mesh);const wire=new THREE.Mesh(new THREE.IcosahedronGeometry(2.45,1),new THREE.MeshBasicMaterial({color:0xe8d8a8,wireframe:true,transparent:true,opacity:.08}));wire.position.copy(mesh.position);s.add(wire);
    s.add(new THREE.AmbientLight(0xffffff,1.5));const light=new THREE.PointLight(0xe8d8a8,35,20);light.position.set(4,2,4);s.add(light);
    let mx=0,my=0;addEventListener("pointermove",e=>{mx=(e.clientX/innerWidth-.5);my=(e.clientY/innerHeight-.5)});function resize(){r.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}addEventListener("resize",resize);resize();
    let playing=true;$("#view3dBtn").onclick=()=>{playing=!playing;$("#view3dBtn").textContent=playing?"Pause 3D":"Play 3D"};
    (function loop(){requestAnimationFrame(loop);if(playing){mesh.rotation.x+=.002;mesh.rotation.y+=.004;wire.rotation.y-=.002;mesh.rotation.y+=mx*.002;mesh.rotation.x+=my*.001}r.render(s,cam)})()
  }catch(e){console.warn("3D unavailable",e)}
}
loadProducts();init3D();
