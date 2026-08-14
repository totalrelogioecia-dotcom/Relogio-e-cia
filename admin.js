const tokenKey='reloja_admin_token';
const $=s=>document.querySelector(s);
const token=()=>localStorage.getItem(tokenKey);
const MAX_PHOTOS=8;
const MAX_TOTAL_PHOTO_BYTES=7*1024*1024;
let currentPhotos=[];

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
async function loadProducts(){try{const ps=await api('/api/admin/products');$('#products-list').innerHTML=`<table class="admin-table"><thead><tr><th>Produto</th><th>SKU</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th></tr></thead><tbody>${ps.map(p=>`<tr><td><strong>${esc(p.nome)}</strong><br><small>${esc(p.marca)}</small></td><td>${esc(p.sku)}</td><td>${brl(p.preco)}</td><td>${p.estoque}</td><td>${p.ativo!==false?'Ativo':'Oculto'}</td><td><div class="admin-actions"><button data-edit="${p.id}">Editar</button>${p.ativo!==false?`<button data-del="${p.id}">Ocultar</button>`:''}</div></td></tr>`).join('')}</tbody></table>`;ps.forEach(p=>{const b=document.querySelector(`[data-edit="${p.id}"]`);if(b)b.onclick=()=>fill(p);const d=document.querySelector(`[data-del="${p.id}"]`);if(d)d.onclick=()=>delProduct(p.id);});}catch(e){msg(e.message);}}
async function saveProduct(){
  const id=$('#p-id').value;
  const urlPhotos=$('#p-fotos').value.split('\n').map(x=>x.trim()).filter(Boolean);
  const body={nome:$('#p-nome').value,marca:$('#p-marca').value,categoria:$('#p-categoria').value,sku:$('#p-sku').value,preco:Number($('#p-preco').value),estoque:Number($('#p-estoque').value),desc:$('#p-desc').value,fotos:[...currentPhotos,...urlPhotos].slice(0,MAX_PHOTOS),ativo:$('#p-ativo').checked};
  try{await api(id?`/api/admin/products/${id}`:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(body)});$('#product-editor').style.display='none';msg('Produto salvo com sucesso.',true);loadProducts();}catch(e){msg(e.message);}
}
async function delProduct(id){if(!confirm('Ocultar este produto da loja?'))return;try{await api('/api/admin/products/'+id,{method:'DELETE'});msg('Produto ocultado.',true);loadProducts();}catch(e){msg(e.message);}}
async function loadOrders(){try{const os=await api('/api/admin/orders');$('#orders-list').innerHTML=`<table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th>Data</th></tr></thead><tbody>${os.map(o=>`<tr><td><strong>${esc(o.id)}</strong></td><td>${esc(o.payer?.nome||'')}<br><small>${esc(o.payer?.email||'')}</small></td><td>${brl(o.total)}</td><td><span class="status ${o.status}">${esc(o.payment_status||o.status)}</span></td><td>${new Date(o.created_at).toLocaleString('pt-BR')}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum pedido ainda.</td></tr>'}</tbody></table>`;}catch(e){msg(e.message);}}
function brl(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

$('#login-btn').onclick=login;$('#admin-senha').onkeydown=e=>{if(e.key==='Enter')login()};$('#logout-btn').onclick=()=>{localStorage.removeItem(tokenKey);location.reload()};$('#novo-produto').onclick=()=>{resetPhotos();fill()};$('#salvar-produto').onclick=saveProduct;$('#cancelar-produto').onclick=()=>$('#product-editor').style.display='none';$('#refresh-orders').onclick=loadOrders;
document.querySelectorAll('.admin-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const p=b.dataset.tab==='produtos';$('#tab-produtos').style.display=p?'block':'none';$('#tab-pedidos').style.display=p?'none':'block';if(!p)loadOrders();});
setupPhotoDropzone();
if(token())showDash();
