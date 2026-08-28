/* RELÓGIO E CIA — disponibilidade dos itens no carrinho */
(function(){
  'use strict';
  const CART_KEY='reloja_carrinho';
  let details={};
  let products=[];
  let hasConfirmation=false;
  function cart(){try{const v=JSON.parse(localStorage.getItem(CART_KEY))||[];return Array.isArray(v)?v:[]}catch{return[]}}
  function product(id,item){return products.find(p=>Number(p.id)===Number(id))||item||null}
  function info(p){
    if(!p)return{type:'pronta_entrega',days:0};
    const d=details[String(p.id)]||{};const raw=String(d.disponibilidade||'pronta_entrega').toLowerCase();
    const type=['sob_encomenda','mediante_confirmacao'].includes(raw)?raw:'pronta_entrega';
    return{type,days:type==='sob_encomenda'?Math.max(15,Number(d.prazo_preparacao_dias_uteis)||15):0};
  }
  function ensureStyle(){
    if(document.getElementById('cart-availability-style'))return;
    const s=document.createElement('style');s.id='cart-availability-style';s.textContent=`
      .cart-item-availability{margin:7px 0 0;font-size:.72rem;line-height:1.4;color:var(--ink-soft)}
      .cart-item-availability strong{font-family:var(--font-mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.07em;color:var(--ink)}
      .cart-availability-summary{margin:0 0 16px;padding:12px 13px;border:1px solid var(--line);border-left:3px solid var(--red);background:var(--paper);font-size:.76rem;line-height:1.5}
      .cart-availability-summary strong{display:block;font-family:var(--font-mono);font-size:.64rem;letter-spacing:.09em;text-transform:uppercase;margin-bottom:3px}`;document.head.appendChild(s);
  }
  function showCheckoutMessage(text){
    const message=document.getElementById('cart-msg');if(!message)return;
    message.className='form-error';message.textContent=text;message.style.display='block';
  }
  function render(){
    ensureStyle();
    const items=cart();const rows=[...document.querySelectorAll('#cart-list .cart-item')];
    let preorderDays=[];hasConfirmation=false;
    rows.forEach((row,index)=>{
      row.querySelectorAll('.cart-item-availability').forEach(x=>x.remove());
      const item=items[index];if(!item)return;
      const p=product(item.id,item);const a=info(p);if(a.type==='pronta_entrega')return;
      const note=document.createElement('p');note.className='cart-item-availability';
      if(a.type==='sob_encomenda'){
        preorderDays.push(a.days);note.innerHTML=`<strong>Sob encomenda</strong> · preparação de ${a.days} dias úteis antes do transporte.`;
      }else{
        hasConfirmation=true;note.innerHTML='<strong>Pedido mediante confirmação</strong> · confirme a disponibilidade com a loja antes do pagamento.';
      }
      const infoBox=row.querySelector('.cart-item-info');if(infoBox)infoBox.appendChild(note);else row.appendChild(note);
    });
    const summary=document.getElementById('cart-summary-box');if(!summary)return;
    let box=document.getElementById('cart-availability-summary');
    if(!box){box=document.createElement('div');box.id='cart-availability-summary';box.className='cart-availability-summary';const priceWarning=document.getElementById('cart-price-warning');summary.insertBefore(box,priceWarning||summary.children[1]||null)}
    if(hasConfirmation){
      box.style.display='block';box.innerHTML='<strong>Confirmação necessária</strong>Seu carrinho contém um produto que precisa de confirmação de disponibilidade. Fale com a loja antes de tentar finalizar o pagamento.';
    }else if(preorderDays.length){
      const max=Math.max(...preorderDays);box.style.display='block';box.innerHTML=`<strong>Pedido com item sob encomenda</strong>Considere até ${max} dias úteis de preparação. O prazo de transporte exibido no frete começa depois dessa preparação.`;
    }else{box.style.display='none';box.textContent=''}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('#btn-finalizar');if(!button||!hasConfirmation)return;
    event.preventDefault();event.stopImmediatePropagation();
    showCheckoutMessage('Este pedido contém um produto mediante confirmação. Fale com a loja para confirmarmos a disponibilidade antes do pagamento.');
  },true);
  async function init(){
    try{const [d,p]=await Promise.all([fetch('/api/product-details',{cache:'no-store'}),fetch('/api/products',{cache:'no-store'})]);if(d.ok)details=await d.json();if(p.ok)products=await p.json()}catch{}
    render();
    const list=document.getElementById('cart-list');if(list)new MutationObserver(()=>setTimeout(render,0)).observe(list,{childList:true,subtree:true,characterData:true});
    window.addEventListener('storage',render);window.addEventListener('reloja:precos-sincronizados',()=>setTimeout(render,0));
  }
  document.addEventListener('DOMContentLoaded',init);
})();
