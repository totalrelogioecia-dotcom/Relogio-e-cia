(() => {
  'use strict';
  const TOKEN_KEY = 'reloja_auth_token';
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  function headers(body = false) {
    const h = { Accept:'application/json' };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) h.Authorization = `Bearer ${token}`;
    if (body) h['Content-Type'] = 'application/json';
    return h;
  }
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...options, headers:{...headers(Boolean(options.body)),...(options.headers||{})} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'Não foi possível concluir.'); error.status = response.status; throw error; }
    return data;
  }
  function injectStyles() {
    if ($('#favorite-client-style')) return;
    const style = document.createElement('style'); style.id='favorite-client-style'; style.textContent=`
      .favorite-product-button{display:inline-flex;align-items:center;justify-content:center;gap:8px}.favorite-product-button .heart{font-size:1.1em}.favorite-product-button.is-favorite{border-color:var(--red)!important;color:var(--red)!important}.favorite-product-button.is-favorite .heart{font-weight:700}
      .account-favorites-section{margin-top:28px;padding:24px;border:1px solid var(--line);background:#fff}.account-favorites-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.account-favorites-head h2{font-family:var(--font-display);margin:0 0 5px}.account-favorites-head p{margin:0;color:var(--ink-soft)}.account-favorites-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.account-favorite-card{border:1px solid var(--line);background:var(--paper);display:grid;grid-template-rows:150px auto}.account-favorite-photo{display:grid;place-items:center;background:#fff;overflow:hidden}.account-favorite-photo img{width:100%;height:100%;object-fit:contain}.account-favorite-copy{padding:14px;display:grid;gap:7px}.account-favorite-copy span{font-size:.72rem;color:var(--ink-soft);font-family:var(--font-mono)}.account-favorite-copy strong{line-height:1.25}.account-favorite-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px}.account-favorite-actions a,.account-favorite-actions button{font:inherit;font-size:.76rem;padding:7px 9px;border:1px solid var(--line-strong);background:#fff;color:inherit;text-decoration:none;cursor:pointer}.account-favorites-empty{padding:22px;border:1px dashed var(--line-strong);color:var(--ink-soft)}
      html.reloja-dark .account-favorites-section,html.reloja-dark .account-favorite-card,html.reloja-dark .account-favorite-photo,html.reloja-dark .account-favorite-actions a,html.reloja-dark .account-favorite-actions button{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}html.reloja-high-contrast .account-favorites-section,html.reloja-high-contrast .account-favorite-card{background:#fff!important;color:#000!important;border:2px solid #000!important}
      @media(max-width:600px){.account-favorites-section{padding:18px}.account-favorites-head{flex-direction:column}.account-favorites-grid{grid-template-columns:1fr 1fr}}@media(max-width:420px){.account-favorites-grid{grid-template-columns:1fr}}
    `; document.head.appendChild(style);
  }

  async function installProductButton() {
    const params = new URLSearchParams(location.search); const productId = Number(params.get('id'));
    if (!productId || location.pathname.split('/').pop() !== 'produto.html') return;
    const waitForActions = () => new Promise(resolve => {
      const existing = $('.product-actions-main'); if (existing) return resolve(existing);
      const observer = new MutationObserver(() => { const el=$('.product-actions-main'); if(el){observer.disconnect();resolve(el);} }); observer.observe(document.documentElement,{childList:true,subtree:true}); setTimeout(()=>{observer.disconnect();resolve($('.product-actions-main'));},8000);
    });
    const actions = await waitForActions(); if (!actions || $('#favorite-product-button')) return;
    const button = document.createElement('button'); button.type='button'; button.id='favorite-product-button'; button.className='btn btn-outline favorite-product-button'; button.innerHTML='<span class="heart" aria-hidden="true">♡</span><span>Favoritar</span>'; actions.appendChild(button);
    let favorite = false;
    const render = () => { button.classList.toggle('is-favorite',favorite); button.setAttribute('aria-pressed',favorite?'true':'false'); button.querySelector('.heart').textContent=favorite?'♥':'♡'; button.querySelector('span:last-child').textContent=favorite?'Favoritado':'Favoritar'; };
    try { const data=await api('/api/favorites'); favorite=(data.ids||[]).includes(productId); render(); } catch(error) { if(error.status!==401) console.warn('Favoritos:',error.message); }
    button.addEventListener('click', async () => {
      button.disabled=true;
      try {
        if (favorite) { await api(`/api/favorites/${productId}`,{method:'DELETE'}); favorite=false; }
        else { await api(`/api/favorites/${productId}`,{method:'POST',body:'{}'}); favorite=true; }
        render();
      } catch(error) {
        if (error.status===401) { if (confirm('Entre na sua conta para salvar este relógio nos favoritos. Ir para a conta agora?')) location.href=`conta.html?voltar=${encodeURIComponent(location.pathname+location.search)}`; }
        else alert(error.message);
      } finally { button.disabled=false; }
    });
  }

  async function renderAccountFavorites() {
    if (location.pathname.split('/').pop() !== 'conta.html') return;
    let host = $('#account-favorites-section');
    try {
      const data = await api('/api/favorites');
      if (!host) { host=document.createElement('section'); host.id='account-favorites-section'; host.className='account-favorites-section'; $('#account-box')?.insertAdjacentElement('afterend',host); }
      if (!host) return;
      host.innerHTML=`<div class="account-favorites-head"><div><p class="eyebrow">Sua seleção</p><h2>Favoritos</h2><p>Relógios salvos na sua conta para consultar depois.</p></div><span>${data.products.length} salvo${data.products.length===1?'':'s'}</span></div>${data.products.length?`<div class="account-favorites-grid">${data.products.map(product=>`<article class="account-favorite-card" data-favorite-id="${product.id}"><a class="account-favorite-photo" href="produto.html?id=${product.id}">${product.foto?`<img src="${esc(product.foto)}" alt="${esc(product.nome)}" loading="lazy">`:'<span>Foto em breve</span>'}</a><div class="account-favorite-copy"><span>${esc(product.marca)} · Ref. ${esc(product.sku||'—')}</span><strong>${esc(product.nome)}</strong><b>${money(product.preco)}</b><div class="account-favorite-actions"><a href="produto.html?id=${product.id}">Ver produto</a><button type="button" data-remove-favorite="${product.id}">Remover</button></div></div></article>`).join('')}</div>`:'<div class="account-favorites-empty">Você ainda não salvou nenhum relógio. Use o botão <strong>Favoritar</strong> nas páginas dos produtos.</div>'}`;
      host.querySelectorAll('[data-remove-favorite]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api(`/api/favorites/${button.dataset.removeFavorite}`,{method:'DELETE'});await renderAccountFavorites();}catch(error){button.disabled=false;alert(error.message);}}));
    } catch(error) {
      if (error.status===401) { if(host) host.remove(); return; }
      if (host) host.innerHTML=`<div class="form-error">${esc(error.message)}</div>`;
    }
  }

  function watchAccount() {
    if (location.pathname.split('/').pop() !== 'conta.html') return;
    const box=$('#account-box'); if(!box)return;
    let timer; const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(renderAccountFavorites,80);}); observer.observe(box,{childList:true,subtree:true}); renderAccountFavorites();
  }

  function install(){injectStyles();installProductButton();watchAccount();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
