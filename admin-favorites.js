(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const TOKEN_KEY='reloja_admin_token';
  const root=document.documentElement;
  let stabilitySequence=0;

  function hasSessionMarker(){try{return Boolean(localStorage.getItem(TOKEN_KEY))}catch{return false}}
  function dashboardVisible(){const dashboard=document.getElementById('dashboard');return Boolean(dashboard&&getComputedStyle(dashboard).display!=='none')}
  function finalAccessibilityReady(){return Boolean(document.querySelector('.nav-actions-cluster .reloja-a11y-trigger .reloja-a11y-symbol'))}

  function installStabilityStyles(){
    if(document.getElementById('admin-layout-stability-style'))return;
    const style=document.createElement('style');
    style.id='admin-layout-stability-style';
    style.textContent=`
      html.admin-header-stabilizing .site-header .nav>:not(.brand-mark){visibility:hidden!important}
      html.admin-ui-stabilizing #dashboard{visibility:hidden!important;pointer-events:none!important}
      html.admin-ui-stabilizing #login-screen{visibility:hidden!important}
    `;
    document.head.appendChild(style);
  }

  function waitForFinalHeader(){
    root.classList.add('admin-header-stabilizing');
    const started=performance.now();
    const check=()=>{
      if(finalAccessibilityReady()||performance.now()-started>2500){
        root.classList.remove('admin-header-stabilizing');
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  async function stabilizeDashboard(){
    if(!dashboardVisible())return;
    const sequence=++stabilitySequence;
    root.classList.add('admin-ui-stabilizing');
    const started=performance.now();
    let session=null;
    try{
      const response=await fetch('/api/admin/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      session=await response.json().catch(()=>null);
    }catch{}
    if(sequence!==stabilitySequence)return;
    if(session&&!session.authenticated){
      root.classList.remove('admin-ui-stabilizing');
      return;
    }

    const accessLevel=session?.admin?.access_level||'';
    let stableFrames=0;
    const check=()=>{
      if(sequence!==stabilitySequence)return;
      const hubCards=document.querySelectorAll('#admin-hub .admin-hub-card').length;
      const badge=document.getElementById('admin-user-badge');
      const badgeReady=Boolean(badge&&String(badge.textContent||'').trim());
      const ownerCardReady=accessLevel!=='owner'||Boolean(document.querySelector('#admin-hub [data-hub-tab="usuarios-admin"]'));
      const ready=dashboardVisible()&&hubCards>0&&badgeReady&&ownerCardReady&&finalAccessibilityReady();
      stableFrames=ready?stableFrames+1:0;
      if(stableFrames>=3||performance.now()-started>2800){
        root.classList.remove('admin-ui-stabilizing');
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  function installStabilityGuard(){
    installStabilityStyles();
    waitForFinalHeader();
    const dashboard=document.getElementById('dashboard');
    if(!dashboard)return;
    if(hasSessionMarker()&&dashboardVisible())stabilizeDashboard();
    new MutationObserver(()=>{
      if(dashboardVisible())stabilizeDashboard();
      else root.classList.remove('admin-ui-stabilizing');
    }).observe(dashboard,{attributes:true,attributeFilter:['style']});
  }

  installStabilityGuard();

  const HUB_ITEMS=[
    {tab:'pedidos',icon:'🛒',title:'Pedidos',text:'Pagamentos, NF-e, envio e acompanhamento de pedidos.'},
    {tab:'produtos',icon:'⌚',title:'Produtos',text:'Catálogo, fotos, preços, estoque e fichas dos relógios.'},
    {tab:'reviews',icon:'★',title:'Avaliações',text:'Modere avaliações de compradores verificados.'},
    {tab:'trocas',icon:'↩',title:'Pós-venda',text:'Trocas, devoluções, garantias e protocolos abertos.'},
    {tab:'cupons',icon:'%',title:'Cupons',text:'Crie e acompanhe cupons promocionais e de frete.'},
    {tab:'confirmacoes',icon:'✓',title:'Confirmações',text:'Pedidos e solicitações que precisam de confirmação.'},
    {tab:'cancelamentos-loja',icon:'×',title:'Cancelamentos',text:'Cancelamentos feitos pela loja e seus registros.'},
    {tab:'audit',icon:'≡',title:'Auditoria',text:'Histórico das principais ações administrativas.'},
    {tab:'usuarios-admin',icon:'👥',title:'Usuários do Admin',text:'Crie logins, defina permissões e bloqueie ou reative acessos.',requiresTab:true}
  ];

  function loadAccessibilityEnhancement(){
    if(document.querySelector('script[data-a11y-trigger-enhancement]'))return;
    const script=document.createElement('script');
    script.src='accessibility-trigger-enhancement.js?v=1';
    script.dataset.a11yTriggerEnhancement='1';
    script.defer=true;
    document.head.appendChild(script);
  }

  function injectHubStyles(){if(document.getElementById('admin-hub-style'))return;const s=document.createElement('style');s.id='admin-hub-style';s.textContent=`
    #dashboard .admin-tabs{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}
    .admin-hub{margin:0 0 30px}.admin-hub-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:15px}.admin-hub-head h2{margin:2px 0 4px;font-family:var(--font-display);font-size:1.6rem}.admin-hub-head p{margin:0;color:var(--ink-soft)}.admin-hub-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.admin-hub-card{min-height:148px;border:2px solid var(--line-strong);border-top:5px solid var(--ink);border-radius:0;background:var(--paper);color:var(--ink);padding:17px;text-align:left;display:flex;flex-direction:column;justify-content:space-between;gap:16px;cursor:pointer;box-shadow:0 5px 14px rgba(0,0,0,.05);transition:background .16s,color .16s,border-color .16s,box-shadow .16s}.admin-hub-card:hover,.admin-hub-card:focus-visible{background:var(--ink);color:var(--bg);border-color:var(--ink);box-shadow:0 7px 18px rgba(0,0,0,.12)}.admin-hub-card:focus-visible{outline:3px solid var(--red);outline-offset:2px}.admin-hub-icon{font-size:1.2rem}.admin-hub-card strong{display:block;font-family:var(--font-display);font-size:1rem;margin-bottom:5px}.admin-hub-card small{display:block;line-height:1.4;color:var(--ink-soft)}.admin-hub-card:hover small,.admin-hub-card:focus-visible small{color:inherit}.admin-hub-open{font-family:var(--font-mono);font-size:.67rem;letter-spacing:.07em;text-transform:uppercase;border-top:1px solid var(--line-strong);padding-top:11px}.admin-hub-card:hover .admin-hub-open,.admin-hub-card:focus-visible .admin-hub-open{border-top-color:rgba(255,255,255,.35)}
    .admin-module-breadcrumb{display:none;align-items:center;justify-content:space-between;gap:14px;margin:0 0 20px;padding:10px 0 14px;border-bottom:1px solid var(--line)}.admin-module-breadcrumb.visible{display:flex}.admin-back-hub{border:1px solid var(--ink);border-radius:0;background:var(--bg);color:var(--ink);padding:10px 13px;font-family:var(--font-mono);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.admin-back-hub:hover{background:var(--ink);color:var(--bg)}.admin-current-module{font-family:var(--font-mono);font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
    html.reloja-dark .admin-hub-card{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important;border-top-color:var(--red)!important;box-shadow:0 5px 16px rgba(0,0,0,.22)!important}html.reloja-dark .admin-back-hub{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}html.reloja-high-contrast .admin-hub-card,html.reloja-high-contrast .admin-back-hub{background:#fff!important;color:#000!important;border:2px solid #000!important}html.reloja-high-contrast .admin-hub-card{border-top-width:5px!important}
    @media(max-width:1000px){.admin-hub-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.admin-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-hub-card{min-height:132px}}@media(max-width:460px){.admin-hub-grid{grid-template-columns:1fr}.admin-hub-card{min-height:112px}.admin-hub-head{align-items:flex-start;flex-direction:column}}
  `;document.head.appendChild(s)}

  function clickTab(tab){const b=document.querySelector(`.admin-tabs button[data-tab="${CSS.escape(tab)}"]`);if(b){b.click();return true}return false}
  function visibleHubItems(){return HUB_ITEMS.filter(item=>{const button=document.querySelector(`.admin-tabs button[data-tab="${CSS.escape(item.tab)}"]`);return button&&!button.hidden&&getComputedStyle(button).display!=='none'})}
  function renderHubCards(hub){const grid=hub?.querySelector('.admin-hub-grid');if(!grid)return;const items=visibleHubItems();const signature=items.map(item=>item.tab).join('|');if(grid.dataset.signature===signature)return;grid.dataset.signature=signature;grid.innerHTML=items.map(i=>`<button type="button" class="admin-hub-card" data-hub-tab="${esc(i.tab)}"><span class="admin-hub-icon" aria-hidden="true">${i.icon}</span><span><strong>${esc(i.title)}</strong><small>${esc(i.text)}</small></span><span class="admin-hub-open">Abrir área →</span></button>`).join('');grid.querySelectorAll('[data-hub-tab]').forEach(b=>b.addEventListener('click',()=>{if(!clickTab(b.dataset.hubTab))alert('Esta área ainda está carregando. Tente novamente em um instante.')}))}
  function ensureBreadcrumb(){if(document.getElementById('admin-module-breadcrumb'))return;const dash=document.getElementById('dashboard');if(!dash)return;const crumb=document.createElement('div');crumb.id='admin-module-breadcrumb';crumb.className='admin-module-breadcrumb';crumb.innerHTML='<button type="button" class="admin-back-hub">← Central administrativa</button><span class="admin-current-module"></span>';const tabs=document.querySelector('.admin-tabs');tabs?.insertAdjacentElement('afterend',crumb);crumb.querySelector('.admin-back-hub').addEventListener('click',()=>clickTab('overview'));const sync=()=>{const active=document.querySelector('.admin-tabs button.active');const tab=active?.dataset.tab||'overview';const visible=tab!=='overview';crumb.classList.toggle('visible',visible);crumb.querySelector('.admin-current-module').textContent=visible?(active.textContent||'').replace(/^[^\wÀ-ÿ]+/,'').trim():''};document.querySelector('.admin-tabs')?.addEventListener('click',()=>setTimeout(sync,0));const tabHost=document.querySelector('.admin-tabs');if(tabHost)new MutationObserver(sync).observe(tabHost,{attributes:true,subtree:true,attributeFilter:['class']});sync()}
  function installHub(){const overview=document.getElementById('tab-overview');if(!overview)return;let hub=document.getElementById('admin-hub');if(!hub){hub=document.createElement('section');hub.id='admin-hub';hub.className='admin-hub';hub.innerHTML='<div class="admin-hub-head"><div><p class="eyebrow">Central administrativa</p><h2>Escolha uma área para administrar</h2><p>O painel abre somente o módulo que você precisa, sem deixar todas as opções disputando espaço.</p></div></div><div class="admin-hub-grid"></div>';overview.prepend(hub)}renderHubCards(hub);ensureBreadcrumb()}

  async function loadFavorites(){const overview=document.querySelector('#tab-overview .admin-overview')||document.querySelector('#tab-overview');if(!overview||document.getElementById('admin-favorites-section'))return;const section=document.createElement('section');section.id='admin-favorites-section';section.className='dashboard-section';section.innerHTML='<div class="dashboard-loading">Carregando favoritos...</div>';overview.appendChild(section);try{const r=await fetch('/api/admin/favorites/summary',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Não foi possível carregar favoritos.');section.innerHTML=`<div class="dashboard-section-head"><div><h3>Mais favoritados</h3><p>Interesse dos clientes medido pelos produtos salvos em suas contas.</p></div><div><strong>${Number(data.total_saves||0)}</strong><br><small>${Number(data.customers_with_favorites||0)} cliente(s) com favoritos</small></div></div>${data.top?.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produto</th><th>Marca / referência</th><th>Preço</th><th>Favoritos</th></tr></thead><tbody>${data.top.map(i=>`<tr><td><strong>${esc(i.nome)}</strong></td><td>${esc(i.marca)}<br><small>${esc(i.sku||'—')}</small></td><td>${money(i.preco)}</td><td><strong>${Number(i.favorites||0)}</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="dashboard-empty">Ainda não há produtos favoritados.</div>'}`}catch(e){section.innerHTML=`<div class="dashboard-error">${esc(e.message)}</div>`}}

  function run(){loadAccessibilityEnhancement();injectHubStyles();installHub();loadFavorites();const dashboard=document.getElementById('dashboard');if(dashboard)new MutationObserver(()=>{if(getComputedStyle(dashboard).display!=='none'){installHub();loadFavorites()}}).observe(dashboard,{attributes:true,attributeFilter:['style']});const tabs=document.querySelector('.admin-tabs');if(tabs)new MutationObserver(()=>installHub()).observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden']})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();