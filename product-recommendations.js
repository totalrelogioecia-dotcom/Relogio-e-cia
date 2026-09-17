(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const currentId=Number(new URLSearchParams(location.search).get('id'));
  if(!currentId||location.pathname.split('/').pop()!=='produto.html')return;
  let loaded=false;

  function availabilityFor(product,detailsMap={}){
    const details=detailsMap[String(product?.id)]||product?.detalhes||{};
    const raw=String(details.disponibilidade||'pronta_entrega').trim().toLowerCase();
    if(raw==='sob_encomenda'){
      const days=Math.max(15,Number(details.prazo_preparacao_dias_uteis)||15);
      return{state:'preorder',label:'Sob encomenda',detail:`${days} dias úteis`,rank:1};
    }
    if(raw==='mediante_confirmacao')return{state:'confirmation',label:'Pedido mediante confirmação',detail:'Consulte a loja',rank:2};
    if(Number(product?.estoque||0)>0)return{state:'ready',label:'Pronta-entrega',detail:'Disponível agora',rank:0};
    return{state:'unavailable',label:'Indisponível',detail:'Sem unidade disponível',rank:3};
  }

  function availabilityRank(product,detailsMap){return availabilityFor(product,detailsMap).rank}

  async function ensureEngine(){
    if(window.RelogioCatalogIntelligence)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='catalog-intelligence.js?v=1';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  }

  async function load(){
    if(loaded)return;loaded=true;
    try{
      await ensureEngine();
      const[products,details]=await Promise.all([
        fetch('/api/products',{cache:'no-store'}).then(r=>r.ok?r.json():[]),
        fetch('/api/product-details',{cache:'no-store'}).then(r=>r.ok?r.json():{})
      ]);
      const list=Array.isArray(products)?products.filter(p=>p?.ativo!==false):[];
      const current=list.find(p=>Number(p.id)===currentId)||window.__relogioCurrentProduct;
      if(!current)return;
      const recommendations=window.RelogioCatalogIntelligence
        .recommend(current,list,details||{},list.length)
        .sort((a,b)=>availabilityRank(a.product,details)-availabilityRank(b.product,details)||b.score-a.score||Number(a.product.id)-Number(b.product.id))
        .slice(0,4);
      const section=document.querySelector('.related-section');if(!section)return;
      const head=section.querySelector('.related-head'),grid=section.querySelector('.related-grid');if(!grid)return;
      if(head){const title=head.querySelector('h2'),eyebrow=head.querySelector('.eyebrow'),link=head.querySelector('a');if(title)title.textContent='Modelos que fazem sentido comparar';if(eyebrow)eyebrow.textContent='Pronta-entrega em destaque';if(link){link.href='produtos.html';link.textContent='Ver catálogo →'}}
      if(!recommendations.length)return;
      grid.innerHTML=recommendations.map(({product,reasons})=>{
        const photo=(Array.isArray(product.fotos)&&product.fotos.find(Boolean))||product.foto||'';
        const availability=availabilityFor(product,details);
        return `<a class="related-card related-card--${availability.state}" href="produto.html?id=${Number(product.id)}"><div class="related-photo">${photo?`<img src="${esc(photo)}" alt="${esc(product.nome)}" loading="lazy" decoding="async">`:'<span class="product-photo-empty">Foto em breve</span>'}</div><span class="brand-chip">${esc(product.marca||'')}</span><h3>${esc(product.nome||'Produto')}</h3><span class="price">${money(product.preco)}</span><span class="related-availability related-availability--${availability.state}"><strong>${esc(availability.label)}</strong><small>${esc(availability.detail)}</small></span>${reasons?.length?`<small class="recommendation-reasons">${reasons.map(esc).join(' · ')}</small>`:''}</a>`;
      }).join('');
      if(!document.getElementById('product-recommendation-style')){
        const style=document.createElement('style');style.id='product-recommendation-style';style.textContent=`
          .recommendation-reasons{display:block;margin-top:7px;color:var(--ink-soft);font-size:.72rem;line-height:1.35;font-family:var(--font-mono)}
          .related-availability{display:grid;gap:2px;margin-top:10px;padding:8px 9px;border:1px solid var(--line-strong);border-left:3px solid var(--red);font-family:var(--font-mono);line-height:1.25}
          .related-availability strong{font-size:.65rem;letter-spacing:.045em;text-transform:uppercase}
          .related-availability small{font-size:.62rem;color:var(--ink-soft)}
          .related-availability--ready{border-left-color:#137b43}
          .related-availability--ready strong{color:#137b43}
          .related-card--unavailable .related-photo{opacity:.72}
        `;document.head.appendChild(style)
      }
    }catch(error){loaded=false;console.warn('Recomendações técnicas:',error.message)}
  }

  function observeSection(){
    const section=document.querySelector('.related-section');
    if(!section)return false;
    if(!('IntersectionObserver'in window)){setTimeout(load,500);return true}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load()}},{rootMargin:'700px 0px'});
    observer.observe(section);return true;
  }

  function wait(){
    if(observeSection())return;
    const observer=new MutationObserver(()=>{if(observeSection())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),6000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wait,{once:true});else wait();
})();
