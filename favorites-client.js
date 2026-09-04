(() => {
  'use strict';
  if(window.__relogioFavoritesClientLoaded)return;
  window.__relogioFavoritesClientLoaded=true;

  const TOKEN_KEY='reloja_auth_token';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let favoriteIds=new Set(),loggedIn=false,stateLoaded=false,statePromise=null;

  function headers(body=false){
    const h={Accept:'application/json'};
    try{const token=localStorage.getItem(TOKEN_KEY);if(token)h.Authorization=`Bearer ${token}`}catch{}
    if(body)h['Content-Type']='application/json';
    return h;
  }

  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{...headers(Boolean(options.body)),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const e=new Error(data.error||'Não foi possível concluir.');e.status=response.status;throw e}
    return data;
  }

  function injectStyles(){
    if($('#favorite-client-style'))return;
    const s=document.createElement('style');s.id='favorite-client-style';s.textContent=`
      .favorite-product-button{display:inline-flex;align-items:center;justify-content:center;gap:8px}.favorite-product-button .heart{font-size:1.12em}.favorite-product-button.is-favorite{border-color:var(--red)!important;color:var(--red)!important}.favorite-product-button.is-favorite .heart{font-weight:700}
      .product-card .card-photo{position:relative!important}.catalog-favorite-button{position:absolute!important;z-index:80!important;top:10px!important;right:10px!important;width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;margin:0!important;padding:0!important;display:grid!important;place-items:center!important;border:1px solid rgba(17,17,17,.34)!important;border-radius:0!important;background:rgba(255,255,255,.96)!important;color:#111!important;font-family:Arial,sans-serif!important;font-size:1.45rem!important;line-height:1!important;cursor:pointer!important;box-shadow:0 3px 12px rgba(0,0,0,.10)!important;pointer-events:auto!important;transition:background .16s,color .16s,border-color .16s!important}.catalog-favorite-button:hover{background:#111!important;color:#fff!important}.catalog-favorite-button.is-favorite{background:var(--red,#e31e24)!important;border-color:var(--red,#e31e24)!important;color:#fff!important}.catalog-favorite-button:focus-visible{outline:3px solid var(--red,#e31e24)!important;outline-offset:3px!important}.catalog-favorite-button[disabled]{opacity:.64!important;cursor:wait!important}
      .account-favorites-section{margin-top:28px;padding:24px;border:1px solid var(--line);background:#fff}.account-favorites-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.account-favorites-head h2{font-family:var(--font-display);margin:0 0 5px}.account-favorites-head p{margin:0;color:var(--ink-soft)}.account-favorites-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.account-favorite-card{border:1px solid var(--line);background:var(--paper);display:grid;grid-template-rows:150px auto}.account-favorite-photo{display:grid;place-items:center;background:#fff;overflow:hidden}.account-favorite-photo img{width:100%;height:100%;object-fit:contain}.account-favorite-copy{padding:14px;display:grid;gap:7px}.account-favorite-copy span{font-size:.72rem;color:var(--ink-soft);font-family:var(--font-mono)}.account-favorite-copy strong{line-height:1.25}.account-favorite-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px}.account-favorite-actions a,.account-favorite-actions button{font:inherit;font-size:.76rem;padding:7px 9px;border:1px solid var(--line-strong);background:#fff;color:inherit;text-decoration:none;cursor:pointer}.account-favorites-empty{padding:22px;border:1px dashed var(--line-strong);color:var(--ink-soft)}
      html.reloja-dark .catalog-favorite-button{background:#17191c!important;color:#fff!important;border-color:#eee!important}html.reloja-dark .catalog-favorite-button.is-favorite{background:var(--red)!important}html.reloja-high-contrast .catalog-favorite-button{background:#fff!important;color:#000!important;border:2px solid #000!important}html.reloja-high-contrast .catalog-favorite-button.is-favorite{background:#000!important;color:#fff!important}
      @media(max-width:600px){.catalog-favorite-button{top:8px!important;right:8px!important;width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important}.account-favorites-section{padding:18px}.account-favorites-head{flex-direction:column}.account-favorites-grid{grid-template-columns:1fr 1fr}}@media(max-width:420px){.account-favorites-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s)
  }

  async function loadFavoriteState(force=false){
    if(statePromise&&!force)return statePromise;
    statePromise=(async()=>{
      try{
        const data=await api('/api/favorites');
        favoriteIds=new Set((data.ids||[]).map(Number));
        loggedIn=true;
      }catch(e){
        loggedIn=false;
        if(e.status!==401)console.warn('Favoritos:',e.message);
      }finally{
        stateLoaded=true;
        renderAllHearts();
      }
    })();
    return statePromise;
  }

  function loginRedirect(){
    const back=location.pathname+location.search;
    if(confirm('Entre na sua conta para salvar relógios nos favoritos. Ir para a conta agora?'))location.href=`conta.html?voltar=${encodeURIComponent(back)}`;
  }

  async function toggle(id,button){
    if(!stateLoaded)await loadFavoriteState();
    if(!loggedIn){loginRedirect();return}
    button.disabled=true;
    try{
      if(favoriteIds.has(id)){await api(`/api/favorites/${id}`,{method:'DELETE'});favoriteIds.delete(id)}
      else{await api(`/api/favorites/${id}`,{method:'POST',body:'{}'});favoriteIds.add(id)}
      renderAllHearts();
      if(location.pathname.split('/').pop()==='conta.html')renderAccountFavorites();
    }catch(e){
      if(e.status===401){loggedIn=false;loginRedirect()}else alert(e.message)
    }finally{button.disabled=false}
  }

  function syncHeart(button,id){
    const active=favoriteIds.has(id);
    button.classList.toggle('is-favorite',active);
    button.setAttribute('aria-pressed',active?'true':'false');
    button.textContent=active?'♥':'♡';
    button.setAttribute('aria-label',active?'Remover este relógio dos favoritos':'Adicionar este relógio aos favoritos');
    button.title=active?'Remover dos favoritos':'Favoritar';
  }

  function renderAllHearts(){
    document.querySelectorAll('[data-catalog-favorite]').forEach(b=>syncHeart(b,Number(b.dataset.catalogFavorite)));
    const p=$('#favorite-product-button');
    if(p){const id=Number(p.dataset.favoriteId),active=favoriteIds.has(id);p.classList.toggle('is-favorite',active);p.setAttribute('aria-pressed',active?'true':'false');p.querySelector('.heart').textContent=active?'♥':'♡';p.querySelector('span:last-child').textContent=active?'Favoritado':'Favoritar'}
  }

  function productIdFromCard(card){
    const direct=Number(card.dataset.productId||card.querySelector('[data-produto]')?.dataset.produto||card.querySelector('[data-add-carrinho]')?.dataset.addCarrinho);
    if(Number.isFinite(direct)&&direct>0)return direct;
    const link=card.querySelector('a[href*="produto.html?id="]');
    if(link){try{const u=new URL(link.href,location.href);const id=Number(u.searchParams.get('id'));if(Number.isFinite(id)&&id>0)return id}catch{}}
    return 0;
  }

  function enhanceCards(scope=document){
    scope.querySelectorAll?.('.product-card').forEach(card=>{
      if(card.querySelector('[data-catalog-favorite]'))return;
      const id=productIdFromCard(card),photo=card.querySelector('.card-photo');
      if(!id||!photo)return;
      const b=document.createElement('button');
      b.type='button';b.className='catalog-favorite-button';b.dataset.catalogFavorite=String(id);
      syncHeart(b,id);
      b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggle(id,b)});
      photo.appendChild(b);
    });
  }

  function watchCards(){
    enhanceCards(document);
    let timer;
    const observer=new MutationObserver(records=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhanceCards(node.matches?.('.product-card')?node.parentElement||document:node)}));
        enhanceCards(document);
      },20);
    });
    observer.observe(document.body,{childList:true,subtree:true});
    let attempts=0;
    const retry=setInterval(()=>{enhanceCards(document);attempts+=1;if(attempts>=20)clearInterval(retry)},250);
  }

  async function installProductButton(){
    const id=Number(new URLSearchParams(location.search).get('id'));
    if(!id||location.pathname.split('/').pop()!=='produto.html')return;
    const actions=await new Promise(resolve=>{const e=$('.product-actions-main');if(e)return resolve(e);const o=new MutationObserver(()=>{const x=$('.product-actions-main');if(x){o.disconnect();resolve(x)}});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{o.disconnect();resolve($('.product-actions-main'))},5000)});
    if(!actions||$('#favorite-product-button'))return;
    actions.classList.add('product-actions-enhanced');
    const b=document.createElement('button');b.type='button';b.id='favorite-product-button';b.dataset.favoriteId=String(id);b.className='btn btn-outline favorite-product-button';b.innerHTML='<span class="heart" aria-hidden="true">♡</span><span>Favoritar</span>';actions.appendChild(b);renderAllHearts();b.addEventListener('click',()=>toggle(id,b));
  }

  async function renderAccountFavorites(){
    if(location.pathname.split('/').pop()!=='conta.html')return;
    let host=$('#account-favorites-section');
    try{
      const data=await api('/api/favorites');favoriteIds=new Set((data.ids||[]).map(Number));loggedIn=true;stateLoaded=true;
      if(!host){host=document.createElement('section');host.id='account-favorites-section';host.className='account-favorites-section';$('#account-box')?.insertAdjacentElement('afterend',host)}
      if(!host)return;
      host.innerHTML=`<div class="account-favorites-head"><div><p class="eyebrow">Sua seleção</p><h2>Favoritos</h2><p>Relógios salvos na sua conta para consultar depois.</p></div><span>${data.products.length} salvo${data.products.length===1?'':'s'}</span></div>${data.products.length?`<div class="account-favorites-grid">${data.products.map(p=>`<article class="account-favorite-card" data-favorite-id="${p.id}"><a class="account-favorite-photo" href="produto.html?id=${p.id}">${p.foto?`<img src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy">`:'<span>Foto em breve</span>'}</a><div class="account-favorite-copy"><span>${esc(p.marca)} · Ref. ${esc(p.sku||'—')}</span><strong>${esc(p.nome)}</strong><b>${money(p.preco)}</b><div class="account-favorite-actions"><a href="produto.html?id=${p.id}">Ver produto</a><button type="button" data-remove-favorite="${p.id}">Remover</button></div></div></article>`).join('')}</div>`:'<div class="account-favorites-empty">Você ainda não salvou nenhum relógio. Use o coração nos produtos para montar sua seleção.</div>'}`;
      host.querySelectorAll('[data-remove-favorite]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await api(`/api/favorites/${b.dataset.removeFavorite}`,{method:'DELETE'});favoriteIds.delete(Number(b.dataset.removeFavorite));await renderAccountFavorites()}catch(e){b.disabled=false;alert(e.message)}}));
    }catch(e){if(e.status===401){if(host)host.remove();return}if(host)host.innerHTML=`<div class="form-error">${esc(e.message)}</div>`}
  }

  function watchAccount(){
    if(location.pathname.split('/').pop()!=='conta.html')return;
    const box=$('#account-box');if(!box)return;
    let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(renderAccountFavorites,80)}).observe(box,{childList:true,subtree:true});renderAccountFavorites();
  }

  function install(){
    injectStyles();
    watchCards();
    loadFavoriteState();
    installProductButton();
    watchAccount();
  }

  window.RelogioFavorites={refresh:()=>{enhanceCards(document);return loadFavoriteState(true)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
