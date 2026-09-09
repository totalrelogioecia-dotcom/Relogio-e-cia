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
  function dialog(options){return window.relojaDialog?.open(options)||Promise.resolve('dismiss')}
  function ensureStyle(){
    if(document.getElementById('catalog-availability-style'))return;
    const s=document.createElement('style');s.id='catalog-availability-style';s.textContent=`
      .catalog-availability{width:max-content;max-width:100%;margin:0 0 12px;padding:5px 8px;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line-strong);border-left:2px solid var(--red);background:var(--bg-soft);color:var(--ink);font-family:var(--font-mono);font-size:.62rem;line-height:1.3;letter-spacing:.06em;text-transform:uppercase}
      .catalog-availability strong{font:inherit;letter-spacing:inherit;color:inherit;margin:0}
      .catalog-availability span{padding-left:7px;border-left:1px solid var(--line);color:var(--muted);font-size:.62rem;letter-spacing:.02em;text-transform:none}
      .product-card--ready .card-actions .btn-outline,
      .product-card--preorder .card-actions .btn-outline,
      .product-card--confirmation .card-actions .btn-outline{display:none}
      .product-card--unavailable .card-actions [data-add-carrinho]{display:none}
      .product-card [data-add-carrinho]:disabled{opacity:.55;cursor:not-allowed}`;document.head.appendChild(s);
  }
  function compactStatus(note,card,state,label,detail,meta){
    const markup=`<strong>${label}</strong>${meta?`<span>${meta}</span>`:''}`;
    card.classList.remove('product-card--ready','product-card--preorder','product-card--confirmation','product-card--unavailable');
    card.classList.add(`product-card--${state}`);
    if(note.dataset.availabilityState!==state||note.innerHTML!==markup){
      note.className=`catalog-availability ${state}`;
      note.dataset.availabilityState=state;
      note.innerHTML=markup;
    }
    note.title=detail;
    note.setAttribute('aria-label',`${label}. ${detail}`);
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
        compactStatus(note,card,'preorder','Sob encomenda',`Preparação de ${a.days} dias úteis antes do transporte.`,`${a.days} dias úteis`);
        btn.disabled=false;btn.textContent='Encomendar';
      }else if(a.type==='mediante_confirmacao'){
        compactStatus(note,card,'confirmation','Pedido mediante confirmação','Envie a solicitação para a loja antes do pagamento.');
        btn.disabled=false;btn.dataset.confirmAvailability='1';
        btn.textContent=btn.dataset.confirmRequestSent==='1'?'Enviado ✓ · WhatsApp':'Consultar disponibilidade';
      }else if(Number(p.estoque||0)<=0){
        btn.removeAttribute('data-confirm-request-sent');
        compactStatus(note,card,'unavailable','Indisponível','Sem unidade disponível para compra agora.');
        btn.disabled=true;btn.textContent='Indisponível';
      }else{
        btn.removeAttribute('data-confirm-request-sent');
        compactStatus(note,card,'ready','Pronta-entrega','Disponível para compra e envio.');
        btn.disabled=false;
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
        const action=await dialog({
          kicker:'Confirmação de disponibilidade',
          title:'Entre na sua conta',
          message:'Para registrar a solicitação, precisamos vincular este produto à sua conta.',
          detail:'Depois do acesso, volte ao produto e solicite a confirmação novamente.',
          primaryLabel:'Entrar na conta',
          secondaryLabel:'Continuar no catálogo'
        });
        if(action==='primary')location.href='conta.html';
        return;
      }
      if(!response.ok)throw new Error(data.error||'Não foi possível registrar a solicitação.');
      btn.dataset.confirmRequestSent='1';
      btn.disabled=false;
      btn.textContent='Enviado ✓ · WhatsApp';
      const action=await dialog({
        tone:'success',
        kicker:data.duplicate?'Solicitação localizada':'Solicitação registrada',
        title:data.duplicate?'Solicitação já registrada':'Solicitação enviada',
        message:data.duplicate?'Este pedido de confirmação já está no painel da Relógio e Cia.':'A Relógio e Cia recebeu seu pedido de confirmação e ele já aparece no painel da loja.',
        detail:'Se quiser agilizar o atendimento, você também pode falar conosco pelo WhatsApp.',
        primaryLabel:'Abrir WhatsApp',
        secondaryLabel:'Continuar no catálogo'
      });
      if(action==='primary')window.open(whatsapp(p),'_blank','noopener');
    }catch(error){
      btn.disabled=false;btn.textContent=original;
      await dialog({
        kicker:'Não foi possível enviar',
        title:'Tente novamente',
        message:error.message||'Não foi possível registrar a solicitação.',
        detail:'Se o problema continuar, fale com a loja pelo WhatsApp.',
        primaryLabel:'Entendi'
      });
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
