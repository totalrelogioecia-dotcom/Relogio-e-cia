(function(){
  'use strict';
  const $=s=>document.querySelector(s);

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escAttr(v){return esc(v).replace(/`/g,'&#96;');}

  function ensureBox(){
    const sku=$('#p-sku');
    if(!sku||$('#product-enrichment-box'))return;
    const field=sku.closest('.form-field');
    const box=document.createElement('div');
    box.id='product-enrichment-box';
    box.className='product-enrichment-box';
    box.innerHTML=`
      <div class="enrichment-copy">
        <strong>Busca inteligente — Casio e G-Shock</strong>
        <span>Digite a referência exata do relógio. A busca consulta somente os catálogos oficiais Casio e G-Shock.</span>
      </div>
      <button type="button" id="buscar-referencia" class="btn btn-outline">Buscar na Casio / G-Shock</button>
      <div id="enrichment-status" class="enrichment-status" aria-live="polite"></div>`;
    field.parentElement.insertBefore(box,field.nextSibling);
    $('#buscar-referencia').onclick=buscar;
  }

  async function buscar(){
    const sku=$('#p-sku')?.value?.trim();
    const status=$('#enrichment-status');
    const btn=$('#buscar-referencia');
    if(!sku){status.innerHTML='<span class="bad">Informe primeiro a referência/SKU.</span>';return;}
    btn.disabled=true;
    btn.textContent='Buscando...';
    status.textContent='Consultando o catálogo oficial Casio/G-Shock...';
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),30000);
      let r;
      try{r=await fetch(`/api/casio-enrichment?sku=${encodeURIComponent(sku)}`,{cache:'no-store',signal:controller.signal});}
      finally{clearTimeout(timer);}
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||'Não foi possível localizar essa referência.');
      mostrarPreview(data);
      status.innerHTML=`<span class="ok">Encontrado em ${esc(data.origem||'Casio/G-Shock')}. Revise os dados antes de aplicar.</span>`;
    }catch(e){
      const msg=e?.name==='AbortError'?'A consulta demorou demais. Tente novamente em alguns segundos.':(e.message||'Não foi possível buscar essa referência.');
      status.innerHTML=`<span class="bad">${esc(msg)}</span>`;
    }finally{
      btn.disabled=false;
      btn.textContent='Buscar na Casio / G-Shock';
    }
  }

  function specRows(d){
    const labels={movimento:'Movimento / precisão',caixa_material:'Material da caixa',pulseira_material:'Material da pulseira',cor:'Cor',diametro:'Dimensões da caixa',resistencia_agua:'Resistência à água',vidro:'Vidro'};
    return Object.entries(labels)
      .filter(([k])=>String(d?.[k]||'').trim())
      .map(([k,label])=>`<div><span>${esc(label)}</span><strong>${esc(d[k])}</strong></div>`)
      .join('');
  }

  function mostrarPreview(data){
    let modal=$('#enrichment-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='enrichment-modal';
      modal.className='admin-modal-backdrop enrichment-modal';
      document.body.appendChild(modal);
    }
    const photos=(data.fotos||[]).filter(Boolean).slice(0,6);
    const specs=specRows(data.detalhes||{});
    modal.innerHTML=`<div class="admin-modal enrichment-dialog" role="dialog" aria-modal="true" aria-labelledby="enrichment-title">
      <button type="button" class="admin-modal-close" id="enrichment-close" aria-label="Fechar">×</button>
      <p class="eyebrow">Casio / G-Shock</p>
      <h2 id="enrichment-title">${esc(data.nome||data.sku)}</h2>
      <p class="admin-muted">Referência ${esc(data.sku)} · ${esc(data.origem||'Catálogo oficial')}</p>
      ${photos.length?`<div class="enrichment-photos">${photos.slice(0,5).map((u,i)=>`<img src="${escAttr(u)}" alt="Foto oficial ${i+1}" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>`:''}
      ${data.desc?`<div class="enrichment-description"><strong>Descrição encontrada</strong><p>${esc(data.desc)}</p></div>`:''}
      <div class="enrichment-specs">${specs||'<p class="admin-muted">A referência foi encontrada, mas a ficha técnica não pôde ser estruturada automaticamente.</p>'}</div>
      ${data.aviso?`<p class="admin-muted">${esc(data.aviso)}</p>`:''}
      <label class="enrichment-replace"><input id="enrichment-replace" type="checkbox"> Substituir campos que já estão preenchidos</label>
      <p class="enrichment-note">Preço, estoque, frete e status do produto não são alterados pela busca.</p>
      <div class="editor-actions">
        <button id="enrichment-apply" type="button" class="btn btn-primary">Aplicar ao produto</button>
        <button id="enrichment-cancel" type="button" class="btn btn-outline">Cancelar</button>
      </div>
      ${data.fonte?`<a class="enrichment-source" href="${escAttr(data.fonte)}" target="_blank" rel="noopener">Abrir página oficial ↗</a>`:''}
    </div>`;

    const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('admin-modal-open');};
    $('#enrichment-close').onclick=close;
    $('#enrichment-cancel').onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
    $('#enrichment-apply').onclick=()=>{aplicar(data,$('#enrichment-replace').checked);close();};
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('admin-modal-open');
  }

  function setIf(selector,value,replace){
    const el=$(selector);
    if(!el||!String(value||'').trim())return;
    if(replace||!String(el.value||'').trim())el.value=String(value).trim();
  }

  function aplicar(data,replace){
    setIf('#p-sku',data.sku,replace);
    setIf('#p-nome',data.nome,replace);
    setIf('#p-marca',data.marca,replace);
    setIf('#p-categoria',data.categoria||'Relógios',replace);
    setIf('#p-desc',data.desc,replace);
    Object.entries(data.detalhes||{}).forEach(([k,v])=>setIf(`#pd-${k}`,v,replace));

    const photos=(data.fotos||[]).filter(Boolean).slice(0,8);
    const hasExisting=!!$('#photo-preview img')||!!String($('#p-fotos')?.value||'').trim();
    if(photos.length&&(replace||!hasExisting)){
      try{
        if(typeof setPhotos==='function'){
          setPhotos(photos);
          const area=$('#p-fotos');if(area)area.value='';
        }
      }catch{}
    }

    const status=$('#enrichment-status');
    if(status)status.innerHTML='<span class="ok">Dados aplicados. Revise o cadastro e clique em “Salvar produto”.</span>';
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureBox();
    const observer=new MutationObserver(ensureBox);
    observer.observe(document.body,{childList:true,subtree:true});
  });
})();
