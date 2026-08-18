(function(){
  'use strict';
  const $=s=>document.querySelector(s);

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));}
  function escAttr(v){return esc(v).replace(/`/g,'&#96;');}
  function brandValue(){return String($('#p-marca')?.value||'').trim().toLowerCase();}

  function ensureBox(){
    const sku=$('#p-sku');
    if(!sku||$('#product-enrichment-box'))return;
    const field=sku.closest('.form-field');
    const box=document.createElement('div');
    box.id='product-enrichment-box';
    box.className='product-enrichment-box';
    box.innerHTML=`
      <div class="enrichment-copy">
        <strong>Busca inteligente — Casio, G-Shock e Orient</strong>
        <span>Digite a referência exata. O sistema escolhe a fonte oficial pela marca; se a marca estiver vazia, tenta identificar automaticamente.</span>
      </div>
      <button type="button" id="buscar-referencia" class="btn btn-outline">Buscar dados pela referência</button>
      <div id="enrichment-status" class="enrichment-status" aria-live="polite"></div>`;
    field.parentElement.insertBefore(box,field.nextSibling);
    $('#buscar-referencia').onclick=buscar;
  }

  async function consultar(route,sku,signal){
    const r=await fetch(`${route}?sku=${encodeURIComponent(sku)}`,{cache:'no-store',signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Não foi possível localizar essa referência.');
    return data;
  }

  async function buscar(){
    const sku=$('#p-sku')?.value?.trim();
    const status=$('#enrichment-status');
    const btn=$('#buscar-referencia');
    if(!sku){status.innerHTML='<span class="bad">Informe primeiro a referência/SKU.</span>';return;}
    btn.disabled=true;btn.textContent='Buscando...';
    const marca=brandValue();
    status.textContent=marca.includes('orient')?'Consultando Orient e Painel de Fotos...':'Consultando catálogos oficiais...';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    try{
      let data;
      if(marca.includes('orient')){
        data=await consultar('/api/orient-enrichment',sku,controller.signal);
      }else if(marca.includes('casio')||marca.includes('g-shock')||marca.includes('gshock')){
        data=await consultar('/api/casio-enrichment',sku,controller.signal);
      }else{
        try{data=await consultar('/api/casio-enrichment',sku,controller.signal);}
        catch(first){
          try{data=await consultar('/api/orient-enrichment',sku,controller.signal);}
          catch(second){throw new Error(`${first.message} Também não encontrei a referência na Orient.`);}
        }
      }
      mostrarPreview(data);
      status.innerHTML=`<span class="ok">Encontrado em ${esc(data.origem||'fonte oficial')}. Revise antes de aplicar.</span>`;
    }catch(e){
      const m=e?.name==='AbortError'?'A consulta demorou demais. Tente novamente em alguns segundos.':(e.message||'Não foi possível buscar essa referência.');
      status.innerHTML=`<span class="bad">${esc(m)}</span>`;
    }finally{
      clearTimeout(timer);btn.disabled=false;btn.textContent='Buscar dados pela referência';
    }
  }

  function specRows(d){
    const labels={movimento:'Movimento / precisão',caixa_material:'Material da caixa',pulseira_material:'Material da pulseira',cor:'Cor',diametro:'Dimensões da caixa',resistencia_agua:'Resistência à água',vidro:'Vidro',garantia:'Garantia',conteudo_embalagem:'Conteúdo da embalagem'};
    return Object.entries(labels).filter(([k])=>String(d?.[k]||'').trim()).map(([k,label])=>`<div><span>${esc(label)}</span><strong>${esc(d[k])}</strong></div>`).join('');
  }
  function previewPhoto(u){
    const s=String(u||'');
    if(/^https:\/\/www\.casio\.com\/content\/dam\/casio\//i.test(s))return `/api/casio-v2-image?url=${encodeURIComponent(s)}`;
    return s;
  }

  function mostrarPreview(data){
    let modal=$('#enrichment-modal');
    if(!modal){modal=document.createElement('div');modal.id='enrichment-modal';modal.className='admin-modal-backdrop enrichment-modal';document.body.appendChild(modal);}
    const photos=(data.fotos||[]).filter(Boolean).slice(0,6);
    const specs=specRows(data.detalhes||{});
    modal.innerHTML=`<div class="admin-modal enrichment-dialog" role="dialog" aria-modal="true" aria-labelledby="enrichment-title">
      <button type="button" class="admin-modal-close" id="enrichment-close" aria-label="Fechar">×</button>
      <p class="eyebrow">${esc(data.marca||'Dados oficiais')}</p>
      <h2 id="enrichment-title">${esc(data.nome||data.sku)}</h2>
      <p class="admin-muted">Referência ${esc(data.sku)} · ${esc(data.origem||'Fonte oficial')}</p>
      ${photos.length?`<div class="enrichment-photos">${photos.slice(0,5).map((u,i)=>`<img src="${escAttr(previewPhoto(u))}" alt="Foto oficial ${i+1}" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>`:''}
      ${data.desc?`<div class="enrichment-description"><strong>Descrição encontrada</strong><p>${esc(data.desc)}</p></div>`:''}
      <div class="enrichment-specs">${specs||'<p class="admin-muted">A referência foi encontrada, mas a ficha técnica não pôde ser estruturada automaticamente.</p>'}</div>
      ${data.aviso?`<p class="admin-muted">${esc(data.aviso)}</p>`:''}
      <label class="enrichment-replace"><input id="enrichment-replace" type="checkbox"> Substituir campos que já estão preenchidos</label>
      <p class="enrichment-note">Preço, estoque, frete e status do produto nunca são alterados pela busca.</p>
      <div class="editor-actions"><button id="enrichment-apply" type="button" class="btn btn-primary">Aplicar ao produto</button><button id="enrichment-cancel" type="button" class="btn btn-outline">Cancelar</button></div>
      ${data.fonte?`<a class="enrichment-source" href="${escAttr(data.fonte)}" target="_blank" rel="noopener">Abrir fonte oficial ↗</a>`:''}
    </div>`;
    const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('admin-modal-open');};
    $('#enrichment-close').onclick=close;$('#enrichment-cancel').onclick=close;modal.onclick=e=>{if(e.target===modal)close();};
    $('#enrichment-apply').onclick=()=>{aplicar(data,$('#enrichment-replace').checked);close();};
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('admin-modal-open');
  }

  function setIf(selector,value,replace){const el=$(selector);if(!el||!String(value||'').trim())return;if(replace||!String(el.value||'').trim())el.value=String(value).trim();}
  function aplicar(data,replace){
    setIf('#p-sku',data.sku,replace);setIf('#p-nome',data.nome,replace);setIf('#p-marca',data.marca,replace);setIf('#p-categoria',data.categoria||'Relógios',replace);setIf('#p-desc',data.desc,replace);
    Object.entries(data.detalhes||{}).forEach(([k,v])=>setIf(`#pd-${k}`,v,replace));
    const photos=(data.fotos||[]).filter(Boolean).slice(0,8);const hasExisting=!!$('#photo-preview img')||!!String($('#p-fotos')?.value||'').trim();
    if(photos.length&&(replace||!hasExisting)){try{if(typeof setPhotos==='function'){setPhotos(photos);const area=$('#p-fotos');if(area)area.value='';}}catch{}}
    const status=$('#enrichment-status');if(status)status.innerHTML='<span class="ok">Dados aplicados. Revise o cadastro e clique em “Salvar produto”.</span>';
  }

  document.addEventListener('DOMContentLoaded',()=>{ensureBox();const observer=new MutationObserver(ensureBox);observer.observe(document.body,{childList:true,subtree:true});});
})();
