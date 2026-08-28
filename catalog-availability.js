/* RELÓGIO E CIA — disponibilidade no catálogo */
(function(){
  'use strict';
  let details={};
  function info(p){
    if(!p)return{type:'pronta_entrega',days:0};
    const d=details[String(p.id)]||{};
    const raw=String(d.disponibilidade||'pronta_entrega').toLowerCase();
    const type=['sob_encomenda','mediante_confirmacao'].includes(raw)?raw:'pronta_entrega';
    return{type,days:type==='sob_encomenda'?Math.max(15,Number(d.prazo_preparacao_dias_uteis)||15):0};
  }
  function product(id){
    try{return typeof PRODUTOS!=='undefined'?PRODUTOS.find(p=>Number(p.id)===Number(id)):null}catch{return null}
  }
  function ensureStyle(){
    if(document.getElementById('catalog-availability-style'))return;
    const s=document.createElement('style');s.id='catalog-availability-style';s.textContent=`
      .catalog-availability{margin:0 0 12px;padding:8px 9px;border-left:2px solid var(--red);background:var(--paper);font-size:.72rem;line-height:1.4;color:var(--ink-soft)}
      .catalog-availability strong{display:block;font-family:var(--font-mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:2px}
      .catalog-availability.confirmation{border:1px solid var(--line);border-left:2px solid var(--red)}
      .product-card [data-add-carrinho]:disabled{opacity:.45;cursor:not-allowed}`;document.head.appendChild(s);
  }
  function decorate(){
    ensureStyle();
    document.querySelectorAll('[data-add-carrinho]').forEach(btn=>{
      const p=product(btn.dataset.addCarrinho);if(!p)return;
      const card=btn.closest('.product-card');if(!card)return;
      const a=info(p);let note=card.querySelector('.catalog-availability');
      if(!note){note=document.createElement('div');note.className='catalog-availability';const actions=card.querySelector('.card-actions');if(actions)card.insertBefore(note,actions);else card.appendChild(note)}
      btn.removeAttribute('data-confirm-availability');
      if(a.type==='sob_encomenda'){
        note.style.display='block';note.className='catalog-availability preorder';note.innerHTML=`<strong>Sob encomenda</strong>Preparação de ${a.days} dias úteis antes do transporte.`;
        btn.disabled=false;btn.textContent='Encomendar';
      }else if(a.type==='mediante_confirmacao'){
        note.style.display='block';note.className='catalog-availability confirmation';note.innerHTML='<strong>Pedido mediante confirmação</strong>Consulte a loja antes do pagamento.';
        btn.disabled=false;btn.textContent='Confirmar disponibilidade';btn.dataset.confirmAvailability='1';
      }else if(Number(p.estoque||0)<=0){
        note.style.display='block';note.className='catalog-availability';note.innerHTML='<strong>Indisponível</strong>Sem unidade disponível para compra agora.';
        btn.disabled=true;btn.textContent='Indisponível';
      }else{
        note.style.display='none';note.textContent='';btn.disabled=false;
        if(!/adicionado/i.test(btn.textContent||''))btn.textContent='Adicionar';
      }
    });
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest('[data-add-carrinho][data-confirm-availability="1"]');
    if(!btn)return;
    event.preventDefault();event.stopImmediatePropagation();
    const p=product(btn.dataset.addCarrinho);if(!p)return;
    const url=`https://wa.me/555196311864?text=${encodeURIComponent('Olá! Quero confirmar a disponibilidade do '+p.nome+' (Ref. '+p.sku+').')}`;
    window.open(url,'_blank','noopener');
  },true);
  async function init(){
    try{const r=await fetch('/api/product-details',{cache:'no-store'});if(r.ok)details=await r.json()}catch{}
    decorate();
    const grid=document.getElementById('product-grid')||document.querySelector('.product-grid');
    if(grid)new MutationObserver(()=>setTimeout(decorate,0)).observe(grid,{childList:true,subtree:true});
    setTimeout(decorate,500);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
