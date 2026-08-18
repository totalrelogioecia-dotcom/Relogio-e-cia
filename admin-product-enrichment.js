(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  let lastResult=null;

  function ensureBox(){
    const sku=$('#p-sku');
    if(!sku||$('#product-enrichment-box'))return;
    const field=sku.closest('.form-field');
    const box=document.createElement('div');
    box.id='product-enrichment-box';
    box.className='product-enrichment-box';
    box.innerHTML=`
      <div class="enrichment-copy">
        <strong>Preenchimento inteligente</strong>
        <span>Digite a referência exata. Se a marca estiver preenchida, ela será priorizada; caso contrário, tentaremos Casio e Orient automaticamente.</span>
      </div>
      <button type="button" id="buscar-referencia" class="btn btn-outline">Buscar dados pela referência</button>
      <div id="enrichment-status" class="enrichment-status" aria-live="polite"></div>`;
    field.parentElement.insertBefore(box,field.nextSibling);
    $('#buscar-referencia').onclick=buscar;
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escAttr(v){return esc(v).replace(/`/g,'&#96;');}
  function brandValue(){return ($('#p-marca')?.value||'').trim().toLowerCase();}
  function previewPhotoUrl(u){
    const value=String(u||'');
    if(value.startsWith('/api/'))return value;
    return `/api/image-proxy?url=${encodeURIComponent(value)}`;
  }

  function searchEndpoints(){
    const brand=brandValue();
    if(brand==='orient')return ['/api/orient-enrichment','/api/product-enrichment'];
    if(brand==='casio'||brand==='g-shock'||brand==='gshock')return ['/api/product-enrichment','/api/orient-enrichment'];
    return ['/api/product-enrichment','/api/orient-enrichment'];
  }

  async function fetchEnrichment(endpoint,sku){
    const r=await fetch(`${endpoint}?sku=${encodeURIComponent(sku)}`,{cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const err=new Error(data.error||'Não foi possível localizar a referência.');
      err.status=r.status;
      throw err;
    }
    return data;
  }

  async function buscar(){
    const sku=$('#p-sku')?.value?.trim();
    const status=$('#enrichment-status');
    const btn=$('#buscar-referencia');
    if(!sku){status.innerHTML='<span class="bad">Informe primeiro a referência/SKU.</span>';return;}
    btn.disabled=true;btn.textContent='Buscando...';status.textContent='Consultando as fontes oficiais...';
    try{
      let data=null;
      let lastError=null;
      const endpoints=searchEndpoints();
      for(let i=0;i<endpoints.length;i++){
        try{
          status.textContent=i===0?'Consultando a fonte principal...':'Não achei na primeira fonte. Tentando outra marca...';
          data=await fetchEnrichment(endpoints[i],sku);
          if(data)break;
        }catch(e){
          lastError=e;
          // 404 significa "não achei" e permite tentar a próxima fonte.
          // Falhas temporárias 5xx também não devem impedir o fallback.
        }
      }
      if(!data)throw lastError||new Error('Não foi possível localizar essa referência na Casio nem na Orient.');
      lastResult=data;
      mostrarPreview(data);
      status.innerHTML=`<span class="ok">Dados encontrados em ${esc(data.origem||data.marca||'fonte oficial')}. Revise antes de aplicar.</span>`;
    }catch(e){
      lastResult=null;
      status.innerHTML=`<span class="bad">${esc(e.message||'Não foi possível buscar essa referência.')}</span>`;
    }finally{
      btn.disabled=false;
      btn.textContent='Buscar dados pela referência';
    }
  }

  function specRows(d){
    const labels={movimento:'Movimento',caixa_material:'Material da caixa',pulseira_material:'Material da pulseira',cor:'Cor',diametro:'Dimensões da caixa',resistencia_agua:'Resistência à água',vidro:'Vidro',garantia:'Garantia',conteudo_embalagem:'Conteúdo da embalagem'};
    return Object.entries(labels).filter(([k])=>String(d?.[k]||'').trim()).map(([k,l])=>`<div><span>${esc(l)}</span><strong>${esc(d[k])}</strong></div>`).join('');
  }

  function mostrarPreview(data){
    let modal=$('#enrichment-modal');
    if(!modal){
      modal=document.createElement('div');modal.id='enrichment-modal';modal.className='admin-modal-backdrop enrichment-modal';document.body.appendChild(modal);
    }
    const photos=(data.fotos||[]).slice(0,5);
    modal.innerHTML=`<div class="admin-modal enrichment-dialog" role="dialog" aria-modal="true">
      <button type="button" class="admin-modal-close" id="enrichment-close">×</button>
      <p class="eyebrow">Dados oficiais</p><h2>${esc(data.nome||data.sku)}</h2>
      <p class="admin-muted">Referência ${esc(data.sku)} · ${esc(data.origem||'Fabricante')}</p>
      ${photos.length?`<div class="enrichment-photos">${photos.map((u,i)=>`<img src="${escAttr(previewPhotoUrl(u))}" alt="Foto ${i+1}" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>`:''}
      ${data.desc?`<div class="enrichment-description"><strong>Descrição encontrada</strong><p>${esc(data.desc)}</p></div>`:''}
      ${data.aviso?`<p class="admin-muted">${esc(data.aviso)}</p>`:''}
      <div class="enrichment-specs">${specRows(data.detalhes||{})||'<p class="admin-muted">Nenhuma especificação estruturada foi encontrada automaticamente.</p>'}</div>
      <label class="enrichment-replace"><input id="enrichment-replace" type="checkbox"> Substituir também campos que já estão preenchidos</label>
      <p class="enrichment-note">Preço, estoque, status e frete nunca são alterados automaticamente.</p>
      <div class="editor-actions"><button id="enrichment-apply" type="button" class="btn btn-primary">Aplicar ao produto</button><button id="enrichment-cancel" type="button" class="btn btn-outline">Cancelar</button></div>
      ${data.fonte?`<a class="enrichment-source" href="${escAttr(data.fonte)}" target="_blank" rel="noopener">Abrir página oficial ↗</a>`:''}
    </div>`;
    const close=()=>{modal.classList.remove('open');document.body.classList.remove('admin-modal-open');};
    $('#enrichment-close').onclick=close;$('#enrichment-cancel').onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
    $('#enrichment-apply').onclick=()=>{aplicar(data,$('#enrichment-replace').checked);close();};
    modal.classList.add('open');document.body.classList.add('admin-modal-open');
  }

  function setIf(id,value,replace){
    const el=$(id);if(!el||!String(value||'').trim())return;
    if(replace||!el.value.trim())el.value=String(value).trim();
  }

  function aplicar(data,replace){
    setIf('#p-sku',data.sku,replace);
    setIf('#p-nome',data.nome,replace);
    setIf('#p-marca',data.marca,replace);
    setIf('#p-categoria',data.categoria||'Relógios',replace);
    setIf('#p-desc',data.desc,replace);
    const details=data.detalhes||{};
    Object.entries(details).forEach(([k,v])=>setIf(`#pd-${k}`,v,replace));

    const photos=(data.fotos||[]).filter(Boolean).slice(0,8);
    if(photos.length){
      const existing=$('#p-fotos')?.value?.split('\n').map(x=>x.trim()).filter(Boolean)||[];
      if(replace||existing.length===0){
        const area=$('#p-fotos');if(area)area.value=photos.join('\n');
        try{if(typeof setPhotos==='function')setPhotos(photos);}catch{}
      }
    }
    const status=$('#enrichment-status');if(status)status.innerHTML='<span class="ok">Dados aplicados. Revise os campos e clique em “Salvar produto”.</span>';
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureBox();
    const obs=new MutationObserver(ensureBox);obs.observe(document.body,{childList:true,subtree:true});
  });
})();
