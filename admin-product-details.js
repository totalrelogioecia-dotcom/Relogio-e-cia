(function(){
  const TOKEN_KEY='reloja_admin_token';
  let map={};
  const token=()=>localStorage.getItem(TOKEN_KEY)||'';
  const $=s=>document.querySelector(s);
  const fields=[
    ['movimento','Movimento'],['caixa_material','Material da caixa'],['pulseira_material','Material da pulseira'],['cor','Cor'],
    ['diametro','Diâmetro da caixa'],['resistencia_agua','Resistência à água'],['vidro','Vidro'],['garantia','Garantia'],['conteudo_embalagem','Conteúdo da embalagem']
  ];
  function ensure(){
    const editor=$('#product-editor');if(!editor||$('#product-details-fields'))return;
    const shipping=$('#shipping-product-fields');
    const host=document.createElement('section');host.id='product-details-fields';host.className='product-details-fields';
    host.innerHTML=`<h4>Ficha técnica da página do produto</h4><p>Preencha somente o que fizer sentido. Campos vazios não aparecem para o cliente.</p><div class="admin-grid">${fields.map(([id,label])=>`<div class="form-field"><label>${label}</label><input id="pd-${id}" placeholder="${label}"></div>`).join('')}</div>`;
    if(shipping)editor.insertBefore(host,shipping);else{const photo=editor.querySelector('.photo-manager');if(photo)editor.insertBefore(host,photo);else editor.appendChild(host)}
  }
  async function loadMap(){if(!token())return;try{const r=await fetch('/api/admin/product-details',{headers:{Authorization:`Bearer ${token()}`},cache:'no-store'});if(r.ok)map=await r.json()}catch{}}
  function fill(id){ensure();const d=map[String(id)]||{};fields.forEach(([key])=>{const el=$(`#pd-${key}`);if(el)el.value=d[key]||''})}
  function clear(){ensure();fields.forEach(([key])=>{const el=$(`#pd-${key}`);if(el)el.value=''})}
  function payload(){const out={};fields.forEach(([key])=>out[key]=$(`#pd-${key}`)?.value?.trim()||'');return out}
  async function save(id){if(!id)return;const r=await fetch(`/api/admin/product-details/${encodeURIComponent(id)}`,{method:'PUT',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(payload())});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Não foi possível salvar a ficha técnica.')}map[String(id)]=await r.json()}
  function intercept(){const original=window.fetch.bind(window);window.fetch=async function(input,init={}){const url=String(input?.url||input||''),method=String(init.method||'GET').toUpperCase();const productSave=url.includes('/api/admin/products')&&!url.includes('/product-details')&&(method==='POST'||method==='PUT');if(!productSave)return original(input,init);const response=await original(input,init);if(!response.ok)return response;try{let id='';if(method==='PUT')id=url.split('/').filter(Boolean).pop();else{id=(await response.clone().json())?.id}if(id)await save(id)}catch(e){console.warn('Produto salvo, mas a ficha técnica não pôde ser salva:',e.message)}return response}}
  document.addEventListener('DOMContentLoaded',async()=>{
    ensure();intercept();await loadMap();
    document.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit]');if(edit)setTimeout(async()=>{await loadMap();fill(edit.dataset.edit)},0);
      if(e.target.closest('#novo-produto'))setTimeout(clear,0);
      if(e.target.closest('#login-btn'))setTimeout(loadMap,700);
    });
  });
})();
