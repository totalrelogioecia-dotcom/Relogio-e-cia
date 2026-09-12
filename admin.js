const tokenKey='reloja_admin_token';
const $=s=>document.querySelector(s);
const token=()=>localStorage.getItem(tokenKey);
const MAX_PHOTOS=8;
const MAX_TOTAL_PHOTO_BYTES=7*1024*1024;
let currentPhotos=[];
let currentInvoiceOrder=null;

async function api(url,opts={}){opts.headers={...(opts.headers||{}),Authorization:`Bearer ${token()}`,'Content-Type':'application/json'};const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erro');return d;}
function msg(text,ok=false){const e=$('#admin-msg');e.className=ok?'form-success':'form-error';e.textContent=text;e.style.display='block';setTimeout(()=>e.style.display='none',3500);}
function showDash(){ $('#login-screen').style.display='none';$('#dashboard').style.display='block';loadProducts(); }
async function login(){try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#admin-email').value,senha:$('#admin-senha').value})});const d=await r.json();if(!r.ok)throw Error(d.error);localStorage.setItem(tokenKey,d.token);showDash();}catch(e){const m=$('#login-msg');m.textContent=e.message;m.style.display='block';}}

function resetPhotos(){currentPhotos=[];renderPhotoPreview();}
function setPhotos(list){currentPhotos=Array.isArray(list)?list.filter(Boolean).slice(0,MAX_PHOTOS):[];renderPhotoPreview();}
function totalPhotoBytes(){return currentPhotos.reduce((sum,x)=>{if(!x.startsWith('data:'))return sum;const b64=x.split(',')[1]||'';return sum+Math.floor(b64.length*0.75)},0)}
function renderPhotoPreview(){
  const box=$('#photo-preview');
  if(!box)return;
  box.innerHTML=currentPhotos.map((src,i)=>`<div class="photo-card"><img src="${escAttr(src)}" alt="Foto ${i+1}"><span class="photo-label">Foto ${i+1}</span><button type="button" data-photo-remove="${i}" title="Remover foto" aria-label="Remover foto">×</button></div>`).join('');
  box.querySelectorAll('[data-photo-remove]').forEach(b=>b.onclick=()=>{currentPhotos.splice(Number(b.dataset.photoRemove),1);renderPhotoPreview();});
}
function escAttr(v){return String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function readImage(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith('image/'))return reject(Error(`${file.name} não é uma imagem válida.`));
    const reader=new FileReader();
    reader.onerror=()=>reject(Error(`Não foi possível ler ${file.name}.`));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(Error(`Não foi possível processar ${file.name}.`));
      img.onload=()=>{
        const max=1400;
        const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
        const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
        let quality=.82;
        let data=canvas.toDataURL('image/webp',quality);
        if(data.length<30 || !data.startsWith('data:image/'))data=canvas.toDataURL('image/jpeg',quality);
        resolve(data);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function addPhotoFiles(files){
  const incoming=Array.from(files||[]);
  if(!incoming.length)return;
  if(currentPhotos.length+incoming.length>MAX_PHOTOS){msg(`Você pode ter no máximo ${MAX_PHOTOS} fotos por produto.`);return;}
  const old=currentPhotos.length;
  try{
    for(const file of incoming){
      const data=await readImage(file);
      currentPhotos.push(data);
      if(totalPhotoBytes()>MAX_TOTAL_PHOTO_BYTES){currentPhotos.pop();throw Error('O conjunto de fotos ficou muito grande. Remova uma foto ou use imagens menores.');}
    }
    renderPhotoPreview();
  }catch(e){
    currentPhotos=currentPhotos.slice(0,old);
    renderPhotoPreview();
    msg(e.message);
  }
}
function setupPhotoDropzone(){
  const zone=$('#photo-dropzone'), input=$('#p-fotos-files');
  if(!zone||!input)return;
  zone.onclick=()=>input.click();
  zone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
  input.onchange=()=>{addPhotoFiles(input.files);input.value='';};
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();zone.classList.add('is-dragover');}));
  ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('is-dragover');}));
  zone.addEventListener('drop',e=>addPhotoFiles(e.dataTransfer.files));
}

function fill(p){
  $('#p-id').value=p?.id||'';$('#p-nome').value=p?.nome||'';$('#p-marca').value=p?.marca||'';$('#p-categoria').value=p?.categoria||'Relógios';$('#p-sku').value=p?.sku||'';$('#p-preco').value=p?.preco??'';$('#p-estoque').value=p?.estoque??0;$('#p-desc').value=p?.desc||'';$('#p-fotos').value=(p?.fotos||[]).filter(x=>!String(x).startsWith('data:image/')).join('\n');setPhotos((p?.fotos||[]));$('#p-ativo').checked=p?.ativo!==false;$('#editor-title').textContent=p?'Editar produto':'Novo produto';$('#product-editor').style.display='block';window.scrollTo({top:0,behavior:'smooth'});
}
async function loadProducts(){try{const ps=await api('/api/admin/products');$('#products-list').innerHTML=`<table class="admin-table"><thead><tr><th>Produto</th><th>SKU</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th></tr></thead><tbody>${ps.map(p=>`<tr><td><strong>${esc(p.nome)}</strong><br><small>${esc(p.marca)}</small></td><td>${esc(p.sku)}</td><td>${brl(p.preco)}</td><td>${p.estoque}</td><td>${p.ativo!==false?'Ativo':'Oculto'}</td><td><div class="admin-actions"><button data-edit="${p.id}">Editar</button>${p.ativo!==false?`<button data-del="${p.id}">Ocultar</button>`:''}<button data-delete-permanent="${p.id}" data-product-name="${escAttr(p.nome)}">Excluir</button></div></td></tr>`).join('')}</tbody></table>`;ps.forEach(p=>{const b=document.querySelector(`[data-edit="${p.id}"]`);if(b)b.onclick=()=>fill(p);const d=document.querySelector(`[data-del="${p.id}"]`);if(d)d.onclick=()=>delProduct(p.id);const x=document.querySelector(`[data-delete-permanent="${p.id}"]`);if(x)x.onclick=()=>deleteProductPermanently(p.id,p.nome);});}catch(e){msg(e.message);}}
async function saveProduct(){
  const id=$('#p-id').value;
  const urlPhotos=$('#p-fotos').value.split('\n').map(x=>x.trim()).filter(Boolean);
  const body={nome:$('#p-nome').value,marca:$('#p-marca').value,categoria:$('#p-categoria').value,sku:$('#p-sku').value,preco:Number($('#p-preco').value),estoque:Number($('#p-estoque').value),desc:$('#p-desc').value,fotos:[...currentPhotos,...urlPhotos].slice(0,MAX_PHOTOS),ativo:$('#p-ativo').checked};
  try{await api(id?`/api/admin/products/${id}`:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(body)});$('#product-editor').style.display='none';msg('Produto salvo com sucesso.',true);loadProducts();}catch(e){msg(e.message);}
}
async function delProduct(id){if(!confirm('Ocultar este produto da loja?'))return;try{await api('/api/admin/products/'+id,{method:'DELETE'});msg('Produto ocultado.',true);loadProducts();}catch(e){msg(e.message);}}
let productDeleteResolver=null;
function ensureProductDeleteModal(){
  if($('#product-delete-modal'))return;
  const wrap=document.createElement('div');
  wrap.id='product-delete-modal';
  wrap.className='admin-modal-backdrop';
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML=`<div class="admin-modal product-delete-modal" role="dialog" aria-modal="true" aria-labelledby="product-delete-title">
    <button type="button" class="admin-modal-close" id="product-delete-close" aria-label="Fechar">×</button>
    <p class="eyebrow">Exclusão permanente</p>
    <h2 id="product-delete-title">Excluir produto?</h2>
    <p class="admin-muted">Você está prestes a excluir <strong id="product-delete-name"></strong> do estoque.</p>
    <p style="border-left:3px solid #e51c2a;padding:12px 14px;background:#faf9f6;line-height:1.5">Esta ação não pode ser desfeita. Os pedidos antigos não serão alterados.</p>
    <div class="editor-actions">
      <button type="button" id="product-delete-confirm" class="btn btn-primary">Excluir permanentemente</button>
      <button type="button" id="product-delete-cancel" class="btn btn-outline">Cancelar</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  const finish=value=>{
    wrap.classList.remove('open');
    wrap.setAttribute('aria-hidden','true');
    document.body.classList.remove('admin-modal-open');
    const resolve=productDeleteResolver;
    productDeleteResolver=null;
    if(resolve)resolve(value);
  };
  $('#product-delete-confirm').onclick=()=>finish(true);
  $('#product-delete-cancel').onclick=()=>finish(false);
  $('#product-delete-close').onclick=()=>finish(false);
  wrap.addEventListener('click',event=>{if(event.target===wrap)finish(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&wrap.classList.contains('open'))finish(false);});
}
function confirmProductDeletion(nome){
  ensureProductDeleteModal();
  if(productDeleteResolver)productDeleteResolver(false);
  $('#product-delete-name').textContent=String(nome||'este produto');
  const wrap=$('#product-delete-modal');
  wrap.classList.add('open');
  wrap.setAttribute('aria-hidden','false');
  document.body.classList.add('admin-modal-open');
  window.setTimeout(()=>$('#product-delete-cancel')?.focus(),50);
  return new Promise(resolve=>{productDeleteResolver=resolve;});
}
async function deleteProductPermanently(id,nome){const label=String(nome||'este produto');if(!await confirmProductDeletion(label))return;try{await api('/api/admin/products/'+id+'/permanent',{method:'DELETE'});if(String($('#p-id')?.value||'')===String(id))$('#product-editor').style.display='none';msg('Produto excluído permanentemente.',true);loadProducts();}catch(e){msg(e.message);}}

function paidOrder(o){return String(o?.status||'').toLowerCase()==='paid'||String(o?.payment_status||'').toLowerCase()==='approved';}
function invoiceStatus(o){return String(o?.invoice?.status||'pending').toLowerCase();}
function invoiceLabel(status){return ({pending:'Pendente',emitted:'Emitida',cancelled:'Cancelada'})[status]||'Pendente';}
function invoiceCell(o){
  if(o?.stock_conflict)return '<span class="invoice-status waiting">Revisar estoque</span>';
  if(!paidOrder(o))return '<span class="invoice-status waiting">Aguardando pagamento</span>';
  const st=invoiceStatus(o),inv=o.invoice||{};
  const number=inv.number?`<small>NF ${esc(inv.number)}</small>`:'';
  const key=inv.access_key?`<small title="${escAttr(inv.access_key)}">Chave …${esc(inv.access_key.slice(-8))}</small>`:'';
  return `<div class="invoice-cell"><span class="invoice-status ${st}">${invoiceLabel(st)}</span>${number}${key}</div>`;
}
function ensureInvoiceModal(){
  if($('#invoice-modal'))return;
  const wrap=document.createElement('div');
  wrap.id='invoice-modal';
  wrap.className='admin-modal-backdrop';
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML=`<div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
    <button type="button" class="admin-modal-close" id="invoice-close" aria-label="Fechar">×</button>
    <p class="eyebrow">Nota fiscal</p>
    <h2 id="invoice-modal-title">Registrar NF-e</h2>
    <p class="admin-muted" id="invoice-order-label"></p>
    <div id="invoice-form-error" class="form-error" style="display:none"></div>
    <div class="form-field"><label>Status</label><select id="invoice-status"><option value="pending">Pendente</option><option value="emitted">Emitida</option><option value="cancelled">Cancelada</option></select></div>
    <div class="form-field"><label>Número da NF-e</label><input id="invoice-number" maxlength="40" placeholder="Ex.: 12345"></div>
    <div class="form-field"><label>Chave de acesso</label><input id="invoice-key" inputmode="numeric" maxlength="44" placeholder="44 dígitos"></div>
    <p class="invoice-help">Para marcar como emitida, informe o número e a chave de acesso de 44 dígitos. O site apenas registra os dados da nota; a emissão continua sendo feita no sistema fiscal da empresa.</p>
    <div class="editor-actions"><button type="button" id="invoice-save" class="btn btn-primary">Salvar NF-e</button><button type="button" id="invoice-cancel" class="btn btn-outline">Fechar</button></div>
  </div>`;
  document.body.appendChild(wrap);
  $('#invoice-close').onclick=closeInvoiceModal;
  $('#invoice-cancel').onclick=closeInvoiceModal;
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeInvoiceModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&wrap.classList.contains('open'))closeInvoiceModal();});
  $('#invoice-status').onchange=syncInvoiceFields;
  $('#invoice-key').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,44);};
  $('#invoice-save').onclick=saveInvoice;
}
function syncInvoiceFields(){
  const st=$('#invoice-status')?.value;
  const pending=st==='pending';
  $('#invoice-number').disabled=pending;
  $('#invoice-key').disabled=pending;
  if(pending){$('#invoice-number').value='';$('#invoice-key').value='';}
}
function openInvoiceModal(order){
  ensureInvoiceModal();
  currentInvoiceOrder=order;
  const inv=order.invoice||{};
  $('#invoice-order-label').textContent=`Pedido ${order.id} · ${order.payer?.nome||'Cliente'} · ${brl(order.total)}`;
  $('#invoice-status').value=inv.status||'pending';
  $('#invoice-number').value=inv.number||'';
  $('#invoice-key').value=inv.access_key||'';
  $('#invoice-form-error').style.display='none';
  syncInvoiceFields();
  const modal=$('#invoice-modal');
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('admin-modal-open');
}
function closeInvoiceModal(){const modal=$('#invoice-modal');if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('admin-modal-open');currentInvoiceOrder=null;}
async function saveInvoice(){
  if(!currentInvoiceOrder)return;
  const errorBox=$('#invoice-form-error');
  const status=$('#invoice-status').value;
  const number=$('#invoice-number').value.trim();
  const access_key=$('#invoice-key').value.replace(/\D/g,'');
  if(status==='emitted'&&!number){errorBox.textContent='Informe o número da NF-e.';errorBox.style.display='block';return;}
  if(status==='emitted'&&access_key.length!==44){errorBox.textContent='A chave de acesso deve ter exatamente 44 dígitos.';errorBox.style.display='block';return;}
  const btn=$('#invoice-save');btn.disabled=true;btn.textContent='Salvando...';
  try{
    await api(`/api/admin/orders/${encodeURIComponent(currentInvoiceOrder.id)}/invoice`,{method:'PATCH',body:JSON.stringify({status,number,access_key})});
    closeInvoiceModal();msg('Dados da nota fiscal salvos com sucesso.',true);await loadOrders();
  }catch(e){errorBox.textContent=e.message;errorBox.style.display='block';}
  finally{btn.disabled=false;btn.textContent='Salvar NF-e';}
}
async function loadOrders(){
  try{
    const os=await api('/api/admin/orders');
    $('#orders-list').innerHTML=`<table class="admin-table orders-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th>Nota fiscal</th><th>Data</th><th>Ações</th></tr></thead><tbody>${os.map(o=>`<tr><td><strong>${esc(o.id)}</strong></td><td>${esc(o.payer?.nome||'')}<br><small>${esc(o.payer?.email||'')}</small></td><td>${brl(o.total)}</td><td><span class="status ${escAttr(o.status)}">${esc(o.payment_status||o.status)}</span>${o.stock_conflict?'<br><small class="form-error">Estoque insuficiente — revisar antes de faturar</small>':''}</td><td>${invoiceCell(o)}</td><td>${new Date(o.created_at).toLocaleString('pt-BR')}</td><td><div class="admin-actions">${paidOrder(o)&&!o.stock_conflict?`<button data-invoice="${escAttr(o.id)}">${invoiceStatus(o)==='pending'?'Registrar NF-e':'Editar NF-e'}</button>`:`<button disabled title="${o.stock_conflict?'Revise o estoque ou cancele e estorne o pedido':'Aguarde a confirmação do pagamento'}">Registrar NF-e</button>`}</div></td></tr>`).join('')||'<tr><td colspan="7">Nenhum pedido ainda.</td></tr>'}</tbody></table>`;
    os.forEach(o=>{const b=document.querySelector(`[data-invoice="${CSS.escape(String(o.id))}"]`);if(b)b.onclick=()=>openInvoiceModal(o);});
  }catch(e){msg(e.message);}
}
function brl(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

$('#login-btn').onclick=login;$('#admin-senha').onkeydown=e=>{if(e.key==='Enter')login()};$('#logout-btn').onclick=()=>{localStorage.removeItem(tokenKey);location.reload()};$('#novo-produto').onclick=()=>{resetPhotos();fill()};$('#salvar-produto').onclick=saveProduct;$('#cancelar-produto').onclick=()=>$('#product-editor').style.display='none';$('#refresh-orders').onclick=loadOrders;
document.querySelectorAll('.admin-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const p=b.dataset.tab==='produtos';$('#tab-produtos').style.display=p?'block':'none';$('#tab-pedidos').style.display=p?'none':'block';if(!p)loadOrders();});
setupPhotoDropzone();
ensureInvoiceModal();
ensureProductDeleteModal();
if(token())showDash();
