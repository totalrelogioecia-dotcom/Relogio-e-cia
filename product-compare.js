(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const params = new URLSearchParams(location.search);
  const currentId = Number(params.get('id'));
  if (!currentId || location.pathname.split('/').pop() !== 'produto.html') return;

  let catalog = [], details = {}, selected = [];
  async function ensureEngine(){
    if(window.RelogioCatalogIntelligence)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='catalog-intelligence.js?v=1';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
  }
  async function loadData(){
    await ensureEngine();
    const [p,d]=await Promise.all([fetch('/api/products',{cache:'no-store'}).then(r=>r.json()),fetch('/api/product-details',{cache:'no-store'}).then(r=>r.ok?r.json():{})]);
    catalog=Array.isArray(p)?p.filter(x=>x?.ativo!==false):[];details=d&&typeof d==='object'?d:{};selected=[currentId];
  }
  function injectStyles(){
    if($('#product-compare-style'))return;const style=document.createElement('style');style.id='product-compare-style';style.textContent=`
      .compare-product-button{display:inline-flex;align-items:center;justify-content:center;gap:7px}.compare-backdrop{position:fixed;inset:0;z-index:520;background:rgba(0,0,0,.64);display:none;align-items:center;justify-content:center;padding:18px}.compare-backdrop.open{display:flex}.compare-dialog{width:min(1100px,100%);max-height:92vh;overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:1px solid var(--ink,#111);padding:24px;position:relative}.compare-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}.compare-head h2{font-family:var(--font-display);margin:0 0 5px}.compare-head p{margin:0;color:var(--ink-soft);max-width:700px}.compare-close{border:1px solid currentColor;background:transparent;color:inherit;width:40px;height:40px;font-size:24px;cursor:pointer}.compare-picker{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:18px}.compare-picker input{padding:11px;border:1px solid var(--line-strong);font:inherit}.compare-suggestions{grid-column:1/-1;border:1px solid var(--line);display:none}.compare-suggestions.open{display:block}.compare-suggestion{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--line);background:#fff;color:inherit;cursor:pointer;font:inherit}.compare-suggestion:last-child{border-bottom:0}.compare-selected{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.compare-chip{border:1px solid var(--line-strong);padding:7px 9px;background:var(--paper);font-size:.78rem}.compare-chip button{border:0;background:transparent;color:var(--red);font-weight:700;cursor:pointer}.compare-table-wrap{overflow:auto;border:1px solid var(--line)}.compare-table{border-collapse:collapse;width:100%;min-width:760px}.compare-table th,.compare-table td{padding:12px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);vertical-align:top;text-align:left}.compare-table th:first-child{width:180px;font-family:var(--font-mono);font-size:.72rem;text-transform:uppercase}.compare-table td strong{display:block;margin-bottom:4px}.compare-photo{height:130px;display:grid;place-items:center;background:#fff;margin-bottom:9px}.compare-photo img{max-width:100%;max-height:100%;object-fit:contain}.compare-empty{padding:18px;color:var(--ink-soft)}html.reloja-dark .compare-dialog,html.reloja-dark .compare-suggestion,html.reloja-dark .compare-photo{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}html.reloja-high-contrast .compare-dialog,html.reloja-high-contrast .compare-table-wrap{background:#fff!important;color:#000!important;border:2px solid #000!important}@media(max-width:650px){.compare-dialog{padding:18px}.compare-picker{grid-template-columns:1fr}.compare-head{flex-direction:column}.compare-close{position:absolute;right:12px;top:12px}}
    `;document.head.appendChild(style);
  }
  function product(id){return catalog.find(x=>Number(x.id)===Number(id));}
  function detail(id,key){const value=details[String(id)]?.[key];return value==null||String(value).trim()===''?'—':esc(value);}
  const fields=[['Preço',null],['Marca','brand'],['Referência','sku'],['Movimento','movimento'],['Material da caixa','caixa_material'],['Material da pulseira','pulseira_material'],['Dimensões da caixa','diametro'],['Resistência à água','resistencia_agua'],['Vidro','vidro'],['Garantia','garantia'],['Estoque','stock']];
  function valueFor(p,key){if(key===null)return money(p.preco);if(key==='brand')return esc(p.marca||'—');if(key==='sku')return esc(p.sku||'—');if(key==='stock')return `${Number(p.estoque||0)} unidade${Number(p.estoque||0)===1?'':'s'}`;return detail(p.id,key);}
  function renderComparison(){
    const table=$('#compare-table-host'),chips=$('#compare-selected');if(!table||!chips)return;
    const items=selected.map(product).filter(Boolean);
    chips.innerHTML=items.map((p,i)=>`<span class="compare-chip">${esc(p.nome)}${i?` <button type="button" data-compare-remove="${p.id}" aria-label="Remover ${esc(p.nome)} da comparação">×</button>`:''}</span>`).join('');
    chips.querySelectorAll('[data-compare-remove]').forEach(b=>b.onclick=()=>{selected=selected.filter(id=>id!==Number(b.dataset.compareRemove));renderComparison();});
    if(items.length<2){table.innerHTML='<div class="compare-empty">Adicione pelo menos mais um relógio para comparar lado a lado.</div>';return;}
    table.innerHTML=`<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Critério</th>${items.map(p=>`<th><div class="compare-photo">${(p.fotos||[])[0]?`<img src="${esc((p.fotos||[])[0])}" alt="">`:'Foto em breve'}</div><strong>${esc(p.nome)}</strong><small>${esc(p.marca||'')} · ${esc(p.sku||'')}</small></th>`).join('')}</tr></thead><tbody>${fields.map(([label,key])=>`<tr><th>${esc(label)}</th>${items.map(p=>`<td>${valueFor(p,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function searchSuggestions(query){
    const host=$('#compare-suggestions');if(!host)return;const q=query.trim();if(!q){host.classList.remove('open');host.innerHTML='';return;}
    const engine=window.RelogioCatalogIntelligence;const found=catalog.filter(p=>!selected.includes(Number(p.id))).map(p=>({p,...engine.scoreProduct(p,details[String(p.id)]||{},q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
    host.innerHTML=found.map(x=>`<button class="compare-suggestion" type="button" data-compare-add="${x.p.id}"><span><strong>${esc(x.p.nome)}</strong><br><small>${esc(x.p.marca)} · Ref. ${esc(x.p.sku||'—')}</small></span><b>${money(x.p.preco)}</b></button>`).join('')||'<div class="compare-empty">Nenhum relógio encontrado.</div>';host.classList.add('open');
    host.querySelectorAll('[data-compare-add]').forEach(b=>b.onclick=()=>{if(selected.length>=3)return alert('Compare até 3 relógios por vez.');selected.push(Number(b.dataset.compareAdd));$('#compare-search').value='';host.classList.remove('open');renderComparison();});
  }
  async function install(){
    injectStyles();await loadData();
    const actions=await new Promise(resolve=>{const e=$('.product-actions-main');if(e)return resolve(e);const o=new MutationObserver(()=>{const x=$('.product-actions-main');if(x){o.disconnect();resolve(x);}});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{o.disconnect();resolve($('.product-actions-main'));},8000);});if(!actions||$('#compare-product-button'))return;
    const button=document.createElement('button');button.type='button';button.id='compare-product-button';button.className='btn btn-outline compare-product-button';button.textContent='Comparar';actions.appendChild(button);
    const backdrop=document.createElement('div');backdrop.className='compare-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.innerHTML=`<section class="compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title"><div class="compare-head"><div><p class="eyebrow">Comparador técnico</p><h2 id="compare-title">Compare relógios</h2><p>Compare até 3 modelos usando somente informações cadastradas no catálogo.</p></div><button class="compare-close" type="button" aria-label="Fechar comparador">×</button></div><div class="compare-picker"><input id="compare-search" type="search" autocomplete="off" placeholder="Buscar outro relógio por nome, marca, referência ou característica"><span></span><div id="compare-suggestions" class="compare-suggestions"></div></div><div id="compare-selected" class="compare-selected"></div><div id="compare-table-host"></div></section>`;document.body.appendChild(backdrop);
    const close=()=>{backdrop.classList.remove('open');backdrop.setAttribute('aria-hidden','true');button.focus();};button.onclick=()=>{backdrop.classList.add('open');backdrop.setAttribute('aria-hidden','false');renderComparison();setTimeout(()=>$('#compare-search')?.focus(),30);};backdrop.querySelector('.compare-close').onclick=close;backdrop.onclick=e=>{if(e.target===backdrop)close();};$('#compare-search').addEventListener('input',e=>searchSuggestions(e.target.value));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backdrop.classList.contains('open'))close();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install().catch(console.error),{once:true});else install().catch(console.error);
})();
