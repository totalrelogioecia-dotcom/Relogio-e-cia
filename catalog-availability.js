/* RELÓGIO E CIA — disponibilidade no catálogo */
(function(){
  'use strict';
  let details={};
  const TOKEN_KEY='reloja_auth_token';
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
  function whatsapp(p){return`https://wa.me/555196311864?text=${encodeURIComponent('Olá! Quero confirmar a disponibilidade do '+p.nome+' (Ref. '+p.sku+').')}`}
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
        btn.removeAttribute('data-confirm-request-sent');
        note.style.display='block';note.className='catalog-availability preorder';note.innerHTML=`<strong>Sob encomenda</strong>Preparação de ${a.days} dias úteis antes do transporte.`;
        btn.disabled=false;btn.textContent='Encomendar';
      }else if(a.type==='mediante_confirmacao'){
        note.style.display='block';note.className='catalog-availability confirmation';note.innerHTML='<strong>Pedido mediante confirmação</strong>Envie a solicitação para a loja antes do pagamento.';
        btn.disabled=false;btn.dataset.confirmAvailability='1';
        btn.textContent=btn.dataset.confirmRequestSent==='1'?'Enviado ✓ · WhatsApp':'Solicitar confirmação';
      }else if(Number(p.estoque||0)<=0){
        btn.removeAttribute('data-confirm-request-sent');
        note.style.display='block';note.className='catalog-availability';note.innerHTML='<strong>Indisponível</strong>Sem unidade disponível para compra agora.';
        btn.disabled=true;btn.textContent='Indisponível';
      }else{
        btn.removeAttribute('data-confirm-request-sent');
        note.style.display='none';note.textContent='';btn.disabled=false;
        if(!/adicionado/i.test(btn.textContent||''))btn.textContent='Adicionar';
      }
    });
  }
  async function requestConfirmation(p,btn){
    if(btn.dataset.confirmRequestSent==='1'){
      window.open(whatsapp(p),'_blank','noopener');
      return;
    }
    const original=btn.textContent;
    btn.disabled=true;btn.textContent='Enviando...';
    try{
      const token=localStorage.getItem(TOKEN_KEY)||'';
      const response=await fetch('/api/availability-requests',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify({product_id:p.id,source:'catalog'})
      });
      const data=await response.json().catch(()=>({}));
      if(response.status===401){
        alert('Entre na sua conta para enviar a solicitação de disponibilidade. Depois, volte ao produto e solicite novamente.');
        location.href='conta.html';
        return;
      }
      if(!response.ok)throw new Error(data.error||'Não foi possível registrar a solicitação.');
      btn.dataset.confirmRequestSent='1';
      btn.disabled=false;
      btn.textContent='Enviado ✓ · WhatsApp';
      alert(data.duplicate?'Sua solicitação já estava registrada no painel da loja.':'Solicitação enviada para a loja. Ela já aparece no painel administrativo. Se quiser, clique novamente para também falar pelo WhatsApp.');
    }catch(error){
      btn.disabled=false;btn.textContent=original;
      alert(error.message||'Não foi possível registrar a solicitação.');
    }
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest('[data-add-carrinho][data-confirm-availability="1"]');
    if(!btn)return;
    event.preventDefault();event.stopImmediatePropagation();
    const p=product(btn.dataset.addCarrinho);if(!p)return;
    requestConfirmation(p,btn);
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
