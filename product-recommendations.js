(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const currentId=Number(new URLSearchParams(location.search).get('id'));
  if(!currentId||location.pathname.split('/').pop()!=='produto.html')return;
  let loaded=false;

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
      const recommendations=window.RelogioCatalogIntelligence.recommend(current,list,details||{},4);
      const section=document.querySelector('.related-section');if(!section)return;
      const head=section.querySelector('.related-head'),grid=section.querySelector('.related-grid');if(!grid)return;
      if(head){const title=head.querySelector('h2'),eyebrow=head.querySelector('.eyebrow'),link=head.querySelector('a');if(title)title.textContent='Modelos que fazem sentido comparar';if(eyebrow)eyebrow.textContent='Recomendação técnica';if(link){link.href='produtos.html';link.textContent='Ver catálogo →'}}
      if(!recommendations.length)return;
      grid.innerHTML=recommendations.map(({product,reasons})=>{const photo=(Array.isArray(product.fotos)&&product.fotos.find(Boolean))||product.foto||'';return `<a class="related-card" href="produto.html?id=${Number(product.id)}"><div class="related-photo">${photo?`<img src="${esc(photo)}" alt="${esc(product.nome)}" loading="lazy" decoding="async">`:'<span class="product-photo-empty">Foto em breve</span>'}</div><span class="brand-chip">${esc(product.marca||'')}</span><h3>${esc(product.nome||'Produto')}</h3><span class="price">${money(product.preco)}</span>${reasons?.length?`<small class="recommendation-reasons">${reasons.map(esc).join(' · ')}</small>`:''}</a>`}).join('');
      if(!document.getElementById('product-recommendation-style')){const style=document.createElement('style');style.id='product-recommendation-style';style.textContent='.recommendation-reasons{display:block;margin-top:7px;color:var(--ink-soft);font-size:.72rem;line-height:1.35;font-family:var(--font-mono)}';document.head.appendChild(style)}
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
