(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const currentId=Number(new URLSearchParams(location.search).get('id'));
  if(!currentId||location.pathname.split('/').pop()!=='produto.html')return;

  let catalog=[],details={},selected=[currentId],dataPromise=null;
  const photo=p=>((Array.isArray(p?.fotos)&&p.fotos.find(Boolean))||p?.foto||p?.imagem||'');

  async function ensureEngine(){
    if(window.RelogioCatalogIntelligence)return window.RelogioCatalogIntelligence;
    await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='catalog-intelligence.js?v=1';s.onload=ok;s.onerror=fail;document.head.appendChild(s)});
    return window.RelogioCatalogIntelligence;
  }

  async function loadData(){
    if(dataPromise)return dataPromise;
    dataPromise=(async()=>{
      await ensureEngine();
      const[p,d]=await Promise.all([
        fetch('/api/products',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Não foi possível carregar o catálogo.');return r.json()}),
        fetch('/api/product-details',{cache:'no-store'}).then(r=>r.ok?r.json():{})
      ]);
      catalog=Array.isArray(p)?p.filter(x=>x?.ativo!==false):[];
      details=d&&typeof d==='object'?d:{};
      if(!catalog.some(p=>Number(p.id)===currentId)&&window.__relogioCurrentProduct)catalog.unshift(window.__relogioCurrentProduct);
      selected=[currentId];
      return true;
    })().catch(error=>{dataPromise=null;throw error});
    return dataPromise;
  }

  function injectStyles(){
    if($('#product-compare-style'))return;
    const s=document.createElement('style');s.id='product-compare-style';s.textContent=`
      .compare-product-button{display:inline-flex;align-items:center;justify-content:center}.compare-backdrop{position:fixed;inset:0;z-index:520;background:rgba(0,0,0,.64);display:none;align-items:center;justify-content:center;padding:20px}.compare-backdrop.open{display:flex}.compare-dialog{width:min(1160px,100%);max-height:92vh;overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:1px solid var(--ink,#111);padding:26px;position:relative}.compare-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:18px;border-bottom:1px solid var(--line);margin-bottom:18px}.compare-head h2{font-family:var(--font-display);font-size:1.55rem;margin:2px 0 6px}.compare-head p{margin:0;color:var(--ink-soft);max-width:720px}.compare-close{border:1px solid currentColor;background:transparent;color:inherit;width:42px;height:42px;font-size:22px;cursor:pointer;flex:0 0 42px}.compare-picker{position:relative;margin-bottom:16px}.compare-picker input{width:100%;min-height:52px;padding:12px 15px;border:1px solid var(--ink);font:inherit;background:var(--bg);color:inherit}.compare-suggestions{border:1px solid var(--line-strong);border-top:0;display:none;max-height:360px;overflow:auto;background:var(--bg);position:relative;z-index:2}.compare-suggestions.open{display:block}.compare-suggestion{width:100%;display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:13px;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--line);background:var(--bg);color:inherit;cursor:pointer;font:inherit}.compare-suggestion:last-child{border-bottom:0}.compare-suggestion:hover,.compare-suggestion:focus-visible{background:var(--paper)}.compare-suggestion-photo{width:64px;height:64px;padding:5px;border:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}.compare-suggestion-photo img{display:block!important;max-width:100%!important;max-height:100%!important;width:auto!important;height:auto!important;object-fit:contain!important}.compare-suggestion-copy{min-width:0}.compare-suggestion-copy strong{display:block;line-height:1.25;margin-bottom:4px}.compare-suggestion-copy small{color:var(--ink-soft);font-size:.74rem}.compare-suggestion-price{white-space:nowrap;font-family:var(--font-mono);font-size:.82rem}.compare-selected{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 18px}.compare-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line-strong);padding:6px 9px;background:var(--paper);font-size:.75rem;max-width:340px}.compare-chip img{width:32px!important;height:32px!important;object-fit:contain!important;background:#fff}.compare-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compare-chip button{border:0;background:transparent;color:var(--red);font-weight:700;cursor:pointer;font-size:1rem}.compare-table-wrap{overflow:auto;border:1px solid var(--line)}.compare-table{border-collapse:collapse;width:100%;table-layout:fixed;min-width:820px}.compare-table th,.compare-table td{padding:13px 14px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);vertical-align:middle;text-align:left;overflow-wrap:anywhere}.compare-table th:last-child,.compare-table td:last-child{border-right:0}.compare-table .compare-criterion{width:180px;font-family:var(--font-mono);font-size:.68rem;letter-spacing:.04em;text-transform:uppercase;background:var(--paper);vertical-align:top}.compare-product-head{padding:15px!important;vertical-align:top!important;background:var(--bg)}.compare-product-card{display:grid;grid-template-rows:190px auto;gap:12px;min-width:0}.compare-photo{height:190px;padding:12px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}.compare-photo img{display:block!important;max-width:100%!important;max-height:100%!important;width:auto!important;height:auto!important;object-fit:contain!important}.compare-product-name{font-family:var(--font-display);font-size:.93rem;line-height:1.28;margin:0}.compare-product-meta{display:block;color:var(--ink-soft);font-size:.7rem;margin-top:5px}.compare-empty,.compare-loading{padding:18px;color:var(--ink-soft)}
      html.reloja-dark .compare-dialog,html.reloja-dark .compare-suggestion,html.reloja-dark .compare-picker input,html.reloja-dark .compare-product-head{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}html.reloja-dark .compare-suggestion-photo,html.reloja-dark .compare-photo,html.reloja-dark .compare-chip img{background:#fff!important}html.reloja-high-contrast .compare-dialog,html.reloja-high-contrast .compare-table-wrap{background:#fff!important;color:#000!important;border:2px solid #000!important}
      @media(max-width:700px){.compare-backdrop{padding:0}.compare-dialog{width:100%;max-height:100vh;padding:18px;border-left:0;border-right:0}.compare-head{padding-right:48px}.compare-close{position:absolute;right:12px;top:12px}.compare-suggestion{grid-template-columns:54px minmax(0,1fr)}.compare-suggestion-price{grid-column:2}.compare-suggestion-photo{width:54px;height:54px}.compare-table{min-width:690px}.compare-table .compare-criterion{width:140px}.compare-product-card{grid-template-rows:150px auto}.compare-photo{height:150px;padding:9px}}
    `;document.head.appendChild(s)
  }

  function product(id){return catalog.find(x=>Number(x.id)===Number(id))}
  function detail(id,key){const v=details[String(id)]?.[key];return v==null||String(v).trim()===''?'—':esc(v)}
  const fields=[['Preço',null],['Marca','brand'],['Referência','sku'],['Movimento','movimento'],['Material da caixa','caixa_material'],['Material da pulseira','pulseira_material'],['Dimensões da caixa','diametro'],['Resistência à água','resistencia_agua'],['Vidro','vidro'],['Garantia','garantia'],['Estoque','stock']];
  function valueFor(p,key){if(key===null)return money(p.preco);if(key==='brand')return esc(p.marca||'—');if(key==='sku')return esc(p.sku||'—');if(key==='stock')return `${Number(p.estoque||0)} unidade${Number(p.estoque||0)===1?'':'s'}`;return detail(p.id,key)}

  function renderComparison(){
    const host=$('#compare-table-host'),chips=$('#compare-selected');if(!host||!chips)return;
    const items=selected.map(product).filter(Boolean);
    chips.innerHTML=items.map((p,i)=>`<span class="compare-chip">${photo(p)?`<img src="${esc(photo(p))}" alt="">`:''}<span>${esc(p.nome)}</span>${i?`<button type="button" data-compare-remove="${p.id}" aria-label="Remover ${esc(p.nome)}">×</button>`:''}</span>`).join('');
    chips.querySelectorAll('[data-compare-remove]').forEach(b=>b.onclick=()=>{selected=selected.filter(id=>id!==Number(b.dataset.compareRemove));renderComparison()});
    if(items.length<2){host.innerHTML='<div class="compare-empty">Adicione pelo menos mais um relógio para comparar lado a lado.</div>';return}
    host.innerHTML=`<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th class="compare-criterion">Critério</th>${items.map(p=>`<th class="compare-product-head"><div class="compare-product-card"><div class="compare-photo">${photo(p)?`<img src="${esc(photo(p))}" alt="${esc(p.nome)}" loading="lazy" decoding="async">`:'<span>Foto em breve</span>'}</div><div><p class="compare-product-name">${esc(p.nome)}</p><small class="compare-product-meta">${esc(p.marca||'')} · Ref. ${esc(p.sku||'—')}</small></div></div></th>`).join('')}</tr></thead><tbody>${fields.map(([label,key])=>`<tr><th class="compare-criterion">${esc(label)}</th>${items.map(p=>`<td>${valueFor(p,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  }

  function suggestions(query){
    const host=$('#compare-suggestions');if(!host)return;const q=query.trim();if(!q){host.classList.remove('open');host.innerHTML='';return}
    const eng=window.RelogioCatalogIntelligence;
    const found=catalog.filter(p=>!selected.includes(Number(p.id))).map(p=>({p,...eng.scoreProduct(p,details[String(p.id)]||{},q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,7);
    host.innerHTML=found.map(({p})=>`<button class="compare-suggestion" type="button" data-compare-add="${p.id}"><span class="compare-suggestion-photo">${photo(p)?`<img src="${esc(photo(p))}" alt="" loading="lazy" decoding="async">`:'—'}</span><span class="compare-suggestion-copy"><strong>${esc(p.nome)}</strong><small>${esc(p.marca)} · Ref. ${esc(p.sku||'—')}</small></span><b class="compare-suggestion-price">${money(p.preco)}</b></button>`).join('')||'<div class="compare-empty">Nenhum relógio encontrado.</div>';
    host.classList.add('open');
    host.querySelectorAll('[data-compare-add]').forEach(b=>b.onclick=()=>{if(selected.length>=3)return alert('Compare até 3 relógios por vez.');selected.push(Number(b.dataset.compareAdd));$('#compare-search').value='';host.classList.remove('open');renderComparison()})
  }

  async function waitActions(){return new Promise(resolve=>{const e=$('.product-actions-main');if(e)return resolve(e);const o=new MutationObserver(()=>{const x=$('.product-actions-main');if(x){o.disconnect();resolve(x)}});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{o.disconnect();resolve($('.product-actions-main'))},5000)})}

  async function install(){
    injectStyles();
    const actions=await waitActions();if(!actions||$('#compare-product-button'))return;
    actions.classList.add('product-actions-enhanced');
    const button=document.createElement('button');button.type='button';button.id='compare-product-button';button.className='btn btn-outline compare-product-button';button.textContent='Comparar';actions.appendChild(button);
    const backdrop=document.createElement('div');backdrop.className='compare-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.innerHTML=`<section class="compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title"><div class="compare-head"><div><p class="eyebrow">Comparador técnico</p><h2 id="compare-title">Compare relógios</h2><p>Escolha até 3 modelos. As miniaturas, nomes e referências ajudam a confirmar exatamente quais relógios estão lado a lado.</p></div><button class="compare-close" type="button" aria-label="Fechar comparador">×</button></div><div class="compare-picker"><input id="compare-search" type="search" autocomplete="off" placeholder="Buscar por nome, marca, referência ou característica" disabled><div id="compare-suggestions" class="compare-suggestions"></div></div><div id="compare-selected" class="compare-selected"></div><div id="compare-table-host"><div class="compare-empty">Abra o comparador para carregar os modelos.</div></div></section>`;document.body.appendChild(backdrop);
    const close=()=>{backdrop.classList.remove('open');backdrop.setAttribute('aria-hidden','true');button.focus()};
    button.onclick=async()=>{
      backdrop.classList.add('open');backdrop.setAttribute('aria-hidden','false');
      const input=$('#compare-search'),host=$('#compare-table-host');
      if(!catalog.length){host.innerHTML='<div class="compare-loading">Carregando relógios para comparação...</div>';input.disabled=true;try{await loadData()}catch(error){host.innerHTML=`<div class="compare-empty">${esc(error.message)}</div>`;return}}
      input.disabled=false;renderComparison();setTimeout(()=>input.focus(),30)
    };
    backdrop.querySelector('.compare-close').onclick=close;backdrop.onclick=e=>{if(e.target===backdrop)close()};$('#compare-search').addEventListener('input',e=>suggestions(e.target.value));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backdrop.classList.contains('open'))close()})
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install().catch(console.error),{once:true});else install().catch(console.error);
})();
