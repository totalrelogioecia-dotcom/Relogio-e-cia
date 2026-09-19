(() => {
  'use strict';

  const GROUPS = [
    { label: '', items: [['overview','Visão geral','overview']] },
    { label: 'Operação', items: [['pedidos','Pedidos','orders'],['confirmacoes','Confirmações','confirm'],['trocas','Pós-venda','returns'],['cancelamentos-loja','Cancelamentos','cancel']] },
    { label: 'Loja', items: [['produtos','Produtos','products'],['reviews','Avaliações','reviews'],['cupons','Cupons','coupons'],['home-carousel','Carrossel da Home','carousel']] },
    { label: 'Administração', items: [['usuarios-admin','Usuários do Admin','users'],['audit','Auditoria','audit']] }
  ];

  const ICONS = {
    overview:'<path d="M4 19V10M10 19V5M16 19v-7M22 19H2"/>',
    orders:'<circle cx="9" cy="19" r="1"/><circle cx="18" cy="19" r="1"/><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/>',
    confirm:'<path d="m5 12 4 4L19 6"/>',
    returns:'<path d="M4 7h12a4 4 0 0 1 4 4v1M8 3 4 7l4 4M20 17H8a4 4 0 0 1-4-4v-1"/>',
    cancel:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    products:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v9"/>',
    reviews:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    coupons:'<path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 0 0-4V3H3v5Z"/><path d="M12 6v2m0 4v2"/>',
    carousel:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m6 15 4-4 3 3 2-2 3 3"/>',
    users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    audit:'<path d="M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4"/>',
    manual:'<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23V5.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23V5.5Z"/>'
  };

  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.overview}</svg>`;
  const sourceButton = tab => document.querySelector(`.admin-tabs button[data-tab="${CSS.escape(tab)}"]`);

  function ensureShell() {
    if (document.getElementById('admin-side-nav')) return;
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    const aside = document.createElement('aside');
    aside.id = 'admin-side-nav';
    aside.className = 'admin-side-nav';
    aside.setAttribute('aria-label','Menu administrativo');
    aside.innerHTML = `
      <div class="admin-side-brand"><span class="admin-side-brand-mark">R</span><span><strong>Relógio e Cia</strong><small>Administração</small></span></div>
      <nav class="admin-side-groups"></nav>
      <div class="admin-side-footer"><button type="button" class="admin-side-manual"><span class="admin-side-icon">${icon('manual')}</span><span>Manual do Admin</span></button><a href="index.html" target="_blank" rel="noopener">Ver loja <span aria-hidden="true">↗</span></a></div>`;

    const nav = aside.querySelector('.admin-side-groups');
    GROUPS.forEach(group => {
      const section = document.createElement('section');
      section.className = 'admin-side-group';
      if (group.label) section.innerHTML = `<h2>${group.label}</h2>`;
      group.items.forEach(([tab,label,ico]) => {
        const button = document.createElement('button');
        button.type='button'; button.dataset.sideTab=tab;
        button.innerHTML=`<span class="admin-side-icon">${icon(ico)}</span><span>${label}</span>`;
        button.addEventListener('click', () => {
          if(tab === 'manual'){
            window.relogioAdminManual?.open?.();
          }else{
            const source=sourceButton(tab);
            if (source && getComputedStyle(source).display !== 'none' && !source.hidden) source.click();
          }
          closeMobile();
        });
        section.appendChild(button);
      });
      nav.appendChild(section);
    });

    aside.querySelector('.admin-side-manual')?.addEventListener('click',()=>{window.relogioAdminManual?.open?.();closeMobile();});

    dashboard.before(aside);
    const toggle=document.createElement('button');
    toggle.type='button'; toggle.className='admin-side-toggle'; toggle.setAttribute('aria-label','Abrir menu administrativo'); toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<span></span><span></span><span></span>';
    toggle.addEventListener('click',()=>{const open=document.body.classList.toggle('admin-side-open');toggle.setAttribute('aria-expanded',String(open));});
    document.querySelector('.site-header .nav')?.prepend(toggle);

    const backdrop=document.createElement('button');
    backdrop.type='button'; backdrop.className='admin-side-backdrop'; backdrop.setAttribute('aria-label','Fechar menu administrativo'); backdrop.addEventListener('click',closeMobile);
    document.body.appendChild(backdrop);
    sync();
  }

  function closeMobile(){document.body.classList.remove('admin-side-open');document.querySelector('.admin-side-toggle')?.setAttribute('aria-expanded','false');}

  function sync() {
    const aside=document.getElementById('admin-side-nav'); if(!aside) return;
    const dashboard=document.getElementById('dashboard');
    const active=!!dashboard && getComputedStyle(dashboard).display !== 'none';
    const currentTab=document.querySelector('.admin-tabs button.active')?.dataset?.tab || '';
    document.body.classList.toggle('admin-overview-active',active && currentTab === 'overview');
    aside.hidden=!active;
    document.body.classList.toggle('admin-sidebar-ready',active);
    aside.querySelectorAll('[data-side-tab]').forEach(button=>{
      const source=sourceButton(button.dataset.sideTab);
      const available=button.dataset.sideTab === 'manual' ? true : (!!source && getComputedStyle(source).display !== 'none' && !source.hidden);
      button.hidden=!available;
      button.classList.toggle('active',!!source?.classList.contains('active'));
      if(source?.classList.contains('active')) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    aside.querySelectorAll('.admin-side-group').forEach(group=>{
      const buttons=[...group.querySelectorAll('[data-side-tab]')];
      group.hidden=buttons.length>0 && buttons.every(button=>button.hidden);
    });
  }

  function observe(){
    const target=document.getElementById('dashboard'); if(!target)return;
    new MutationObserver(()=>requestAnimationFrame(sync)).observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
    const tabs=document.querySelector('.admin-tabs');
    if(tabs)new MutationObserver(()=>requestAnimationFrame(sync)).observe(tabs,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
  }

  window.addEventListener('reloja:admin-session',()=>requestAnimationFrame(()=>{ensureShell();sync();}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobile();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureShell();observe();sync();},{once:true});
  else {ensureShell();observe();sync();}
})();