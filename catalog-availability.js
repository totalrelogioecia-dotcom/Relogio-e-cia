/* RELÓGIO E CIA — disponibilidade no catálogo */
(function(){
  'use strict';
  let details={};
  let released=new Map();
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
  function releaseFor(id){const item=released.get(Number(id));return item?.purchase?.active?item:null}
  function shortDate(value){const d=new Date(value||0);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
  function ensureStyle(){
    if(document.getElementById('catalog-availability-style'))return;
    const s=document.createElement('style');s.id='catalog-availability-style';s.textContent=`
      .product-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      .product-card{min-width:0}
      .catalog-availability{width:100%;max-width:100%;min-width:0;min-height:44px;margin:0 0 12px;padding:7px 9px;display:grid;grid-template-columns:minmax(0,1fr);align-content:center;gap:2px;border:1px solid var(--line-strong);border-left:2px solid var(--red);background:var(--bg-soft);color:var(--ink);font-family:var(--font-mono);font-size:.61rem;line-height:1.25;letter-spacing:.055em;text-transform:uppercase;overflow:hidden}
      .catalog-availability strong{display:block;font:inherit;letter-spacing:inherit;color:inherit;margin:0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .catalog-availability span{display:block;min-width:0;padding:0;border:0;color:var(--muted);font-size:.57rem;line-height:1.25;letter-spacing:.015em;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .catalog-availability.confirmation-released{min-height:44px}
      .catalog-availability.confirmation-released strong{font-weight:600}
      .product-card--ready .card-actions .btn-outline,
      .product-card--preorder .card-actions .btn-outline,
      .product-card--confirmation .card-actions .btn-outline,
      .product-card--confirmation-released .card-actions .btn-outline{display:none}
      .product-card--confirmation .card-actions .btn-outline{display:none}
      .product-card--unavailable .card-actions [data-add-carrinho]{display:none}
      .product-card [data-add-carrinho]:disabled{opacity:.55;cursor:not-allowed}
      @media(max-width:900px){.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.product-grid{grid-template-columns:minmax(0,1fr)}.catalog-availability{min-height:42px}}
    `;document.head.appendChild(s);
  }
  function compactStatus(note,card,state,label,detail,meta){
    const markup=`<strong>${label}</strong>${meta?`<span>${meta}</span>`:''}`;
    card.classList.remove('product-card--ready','product-card--preorder','product-card--confirmation','product-card--confirmation-released','product-card--unavailable');
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
        const release=releaseFor(p.id);
        if(release){
          btn.removeAttribute('data-confirm-request-sent');
          const until=shortDate(release.purchase?.expires_at);
          compactStatus(note,card,'confirmation-released','Disponibilidade confirmada','A compra foi liberada somente para a sua conta.',until?`Válida até ${until}`:'Compra liberada');
          btn.disabled=false;
          if(!/adicionado/i.test(btn.textContent||''))btn.textContent='Adicionar liberado';
        }else{
          compactStatus(note,card,'confirmation','Pedido mediante confirmação','Envie a solicitação para a loja antes do pagamento.');
          btn.disabled=false;btn.dataset.confirmAvailability='1';
          btn.textContent=btn.dataset.confirmRequestSent==='1'?'Enviado ✓ · WhatsApp':'Consultar disponibilidade';
        }
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
  async function loadReleases(){
    try{
      const response=await fetch('/api/availability-requests/mine',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)return;
      const data=await response.json().catch(()=>({}));
      released=new Map((Array.isArray(data.items)?data.items:[]).filter(item=>item?.purchase?.active).map(item=>[Number(item.product_id),item]));
    }catch{}
  }
  async function requestConfirmation(p,btn){
    if(btn.dataset.confirmRequestSent==='1'){
      window.open(whatsapp(p),'_blank','noopener');
      return;
    }
    const original=btn.textContent;
    btn.disabled=true;btn.textContent='Enviando...';
    try{
      const response=await fetch('/api/availability-requests',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
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
      if(data.request?.purchase?.active){
        await loadReleases();decorate();
        await dialog({tone:'success',kicker:'Disponibilidade confirmada',title:'Sua compra já está liberada',message:'Este produto já foi confirmado para a sua conta.',detail:'Você já pode adicioná-lo ao carrinho e finalizar a compra.',primaryLabel:'Entendi'});
        return;
      }
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
    try{
      const [d]=await Promise.all([fetch('/api/product-details',{cache:'no-store'}),loadReleases()]);
      if(d.ok)details=await d.json();
    }catch{}
    decorate();
    const grid=document.getElementById('product-grid')||document.querySelector('.product-grid');
    if(grid)new MutationObserver(()=>setTimeout(decorate,0)).observe(grid,{childList:true,subtree:true});
    setTimeout(decorate,500);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
