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
    const availability=document.createElement('section');
    availability.id='product-availability-fields';availability.className='product-details-fields';
    availability.innerHTML=`
      <h4>Disponibilidade para venda</h4>
      <p>Escolha como este produto será oferecido no site.</p>
      <div class="admin-grid">
        <div class="form-field">
          <label for="pd-disponibilidade">Disponibilidade</label>
          <select id="pd-disponibilidade">
            <option value="pronta_entrega">Pronta entrega</option>
            <option value="sob_encomenda">Sob encomenda</option>
            <option value="mediante_confirmacao">Pedido mediante confirmação</option>
          </select>
        </div>
        <div class="form-field" id="pd-prazo-wrap">
          <label for="pd-prazo-preparacao">Prazo de preparação (dias úteis)</label>
          <input id="pd-prazo-preparacao" type="number" min="15" max="90" step="1" value="15">
        </div>
      </div>
      <p id="pd-disponibilidade-help" style="margin-top:8px"></p>`;
    const host=document.createElement('section');host.id='product-details-fields';host.className='product-details-fields';
    host.innerHTML=`<h4>Ficha técnica da página do produto</h4><p>Preencha somente o que fizer sentido. Campos vazios não aparecem para o cliente.</p><div class="admin-grid">${fields.map(([id,label])=>`<div class="form-field"><label>${label}</label><input id="pd-${id}" placeholder="${label}"></div>`).join('')}</div>`;
    if(shipping){editor.insertBefore(availability,shipping);editor.insertBefore(host,shipping)}else{const photo=editor.querySelector('.photo-manager');if(photo){editor.insertBefore(availability,photo);editor.insertBefore(host,photo)}else{editor.appendChild(availability);editor.appendChild(host)}}
    $('#pd-disponibilidade')?.addEventListener('change',updateAvailabilityUi);
    updateAvailabilityUi();
  }
  function updateAvailabilityUi(){
    const select=$('#pd-disponibilidade'),days=$('#pd-prazo-preparacao'),wrap=$('#pd-prazo-wrap'),help=$('#pd-disponibilidade-help');
    if(!select)return;
    const status=select.value;
    if(days)days.disabled=status!=='sob_encomenda';
    if(wrap)wrap.style.opacity=status==='sob_encomenda'?'1':'.55';
    if(!help)return;
    if(status==='sob_encomenda'){help.textContent='O cliente pode comprar mesmo sem estoque físico. O prazo mínimo de preparação é 15 dias úteis; o transporte é contado depois desse período.';return}
    if(status==='mediante_confirmacao'){help.textContent='O cliente verá que a disponibilidade precisa ser confirmada e não poderá pagar este produto antes do contato com a loja.';return}
    help.textContent='Pronta entrega usa o estoque físico cadastrado normalmente.';
  }
  async function loadMap(){if(!token())return;try{const r=await fetch('/api/admin/product-details',{headers:{Authorization:`Bearer ${token()}`},cache:'no-store'});if(r.ok)map=await r.json()}catch{}}
  function fill(id){
    ensure();const d=map[String(id)]||{};
    fields.forEach(([key])=>{const el=$(`#pd-${key}`);if(el)el.value=d[key]||''});
    const select=$('#pd-disponibilidade');if(select)select.value=d.disponibilidade||'pronta_entrega';
    const days=$('#pd-prazo-preparacao');if(days)days.value=Math.max(15,Number(d.prazo_preparacao_dias_uteis)||15);
    updateAvailabilityUi();
  }
  function clear(){
    ensure();fields.forEach(([key])=>{const el=$(`#pd-${key}`);if(el)el.value=''});
    const select=$('#pd-disponibilidade');if(select)select.value='pronta_entrega';
    const days=$('#pd-prazo-preparacao');if(days)days.value='15';
    updateAvailabilityUi();
  }
  function payload(){
    const out={};fields.forEach(([key])=>out[key]=$(`#pd-${key}`)?.value?.trim()||'');
    out.disponibilidade=$('#pd-disponibilidade')?.value||'pronta_entrega';
    out.prazo_preparacao_dias_uteis=Math.max(15,Math.min(90,Number($('#pd-prazo-preparacao')?.value)||15));
    return out
  }
  async function save(id){if(!id)return;const r=await fetch(`/api/admin/product-details/${encodeURIComponent(id)}`,{method:'PUT',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(payload())});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Não foi possível salvar a ficha técnica.')}map[String(id)]=await r.json()}
  function intercept(){const original=window.fetch.bind(window);window.fetch=async function(input,init={}){const url=String(input?.url||input||''),method=String(init.method||'GET').toUpperCase();const productSave=url.includes('/api/admin/products')&&!url.includes('/product-details')&&(method==='POST'||method==='PUT');if(!productSave)return original(input,init);const response=await original(input,init);if(!response.ok)return response;try{let id='';if(method==='PUT')id=url.split('/').filter(Boolean).pop();else{id=(await response.clone().json())?.id}if(id)await save(id)}catch(e){console.warn('Produto salvo, mas a ficha técnica/disponibilidade não pôde ser salva:',e.message)}return response}}
  document.addEventListener('DOMContentLoaded',async()=>{
    ensure();intercept();await loadMap();
    document.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit]');if(edit)setTimeout(async()=>{await loadMap();fill(edit.dataset.edit)},0);
      if(e.target.closest('#novo-produto'))setTimeout(clear,0);
      if(e.target.closest('#login-btn'))setTimeout(loadMap,700);
    });
  });
})();
