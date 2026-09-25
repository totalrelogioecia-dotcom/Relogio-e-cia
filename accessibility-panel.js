(() => {
  'use strict';
  if (window.__relogioAccessibilityPanelLoaded) return;
  window.__relogioAccessibilityPanelLoaded = true;

  const KEYS = {
    contrast:'reloja_high_contrast', dark:'reloja_dark_mode', scale:'reloja_text_scale',
    readable:'reloja_access_readable_font', spacing:'reloja_access_spacing', links:'reloja_access_underlined_links',
    motion:'reloja_access_reduce_motion', focus:'reloja_access_focus', targets:'reloja_access_targets', guide:'reloja_access_reading_guide'
  };
  const LEGACY_LARGE_TEXT_KEY='reloja_large_text';
  const SCALE_VALUES=Object.freeze([100,110,120,130,140]);
  const LEGACY_SCALE_MAP=new Map([[112.5,110],[125,120]]);
  const normalizedScale=value=>{
    const numeric=Number(value);
    if(LEGACY_SCALE_MAP.has(numeric))return LEGACY_SCALE_MAP.get(numeric);
    if(SCALE_VALUES.includes(numeric))return numeric;
    if(!Number.isFinite(numeric))return 100;
    return SCALE_VALUES.reduce((best,current)=>Math.abs(current-numeric)<Math.abs(best-numeric)?current:best,100);
  };
  const root=document.documentElement;
  const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,String(v))}catch{}};
  const remove=k=>{try{localStorage.removeItem(k)}catch{}};
  const bool=k=>read(k)==='1';
  let panel,status,lastFocus,trigger;

  function migrate(){
    const legacyLarge=read(LEGACY_LARGE_TEXT_KEY)==='1';
    const stored=read(KEYS.scale);
    const next=normalizedScale(stored==null&&legacyLarge?110:stored??100);
    write(KEYS.scale,next);
    remove(LEGACY_LARGE_TEXT_KEY);
    root.classList.remove('reloja-large-text');
  }
  function scale(){return normalizedScale(read(KEYS.scale)||100)}
  function sync(){if(!panel)return; const map={contrast:KEYS.contrast,dark:KEYS.dark,readable:KEYS.readable,spacing:KEYS.spacing,links:KEYS.links,motion:KEYS.motion,focus:KEYS.focus,targets:KEYS.targets,guide:KEYS.guide}; Object.entries(map).forEach(([n,k])=>{const i=panel.querySelector(`[name="${n}"]`);if(i)i.checked=bool(k)}); const s=panel.querySelector('[name="scale"]');if(s)s.value=String(scale())}
  function apply(){const contrast=bool(KEYS.contrast),dark=bool(KEYS.dark)&&!contrast,currentScale=scale(); root.classList.toggle('reloja-high-contrast',contrast);root.classList.toggle('reloja-dark',dark);root.classList.toggle('reloja-readable-font',bool(KEYS.readable));root.classList.toggle('reloja-spacious-text',bool(KEYS.spacing));root.classList.toggle('reloja-underlined-links',bool(KEYS.links));root.classList.toggle('reloja-reduce-motion',bool(KEYS.motion));root.classList.toggle('reloja-strong-focus',bool(KEYS.focus));root.classList.toggle('reloja-large-targets',bool(KEYS.targets));root.classList.toggle('reloja-reading-guide-on',bool(KEYS.guide));root.classList.remove('reloja-large-text');root.style.fontSize=`${currentScale}%`;root.dataset.relojaTextScale=String(currentScale);sync()}
  function announce(m){if(!status)return;status.textContent='';requestAnimationFrame(()=>status.textContent=m)}
  function setBool(k,v){write(k,v?'1':'0');apply();announce('Preferência atualizada.')}
  function setContrast(v){write(KEYS.contrast,v?'1':'0');if(v)write(KEYS.dark,'0');apply();announce(v?'Alto contraste ativado.':'Alto contraste desativado.')}
  function setDark(v){write(KEYS.dark,v?'1':'0');if(v)write(KEYS.contrast,'0');apply();announce(v?'Modo escuro ativado.':'Modo escuro desativado.')}
  function open(){if(!panel)return;lastFocus=document.activeElement;panel.parentElement.classList.add('open');panel.parentElement.setAttribute('aria-hidden','false');trigger?.setAttribute('aria-expanded','true');setTimeout(()=>panel.querySelector('.reloja-a11y-close')?.focus(),20)}
  function close(){if(!panel)return;panel.parentElement.classList.remove('open');panel.parentElement.setAttribute('aria-hidden','true');trigger?.setAttribute('aria-expanded','false');lastFocus?.focus?.()}
  function reset(){Object.values(KEYS).forEach(remove);remove(LEGACY_LARGE_TEXT_KEY);root.style.fontSize='';['reloja-readable-font','reloja-spacious-text','reloja-underlined-links','reloja-reduce-motion','reloja-strong-focus','reloja-large-targets','reloja-reading-guide-on','reloja-high-contrast','reloja-dark','reloja-large-text'].forEach(c=>root.classList.remove(c));apply();announce('Preferências de acessibilidade restauradas.')}
  function removeLegacy(){document.querySelectorAll('.reloja-accessibility-global-rail,.reloja-accessibility-header,.reloja-accessibility-rail,.reloja-contrast-toggle').forEach(n=>n.remove())}

  function ensureMainLandmark(){
    let main=document.querySelector('main,[role=main]');
    if(!main){
      const header=document.querySelector('body > header');
      const footer=document.querySelector('body > footer');
      const content=[];
      let node=header?header.nextElementSibling:document.body.firstElementChild;
      while(node&&node!==footer){
        const next=node.nextElementSibling;
        const auxiliary=node.matches('.reloja-skip-link,.site-search-overlay,.modal-backdrop,.compare-backdrop,.reloja-reading-guide,.reloja-a11y-backdrop,[hidden]');
        if(!['SCRIPT','STYLE','LINK'].includes(node.tagName)&&!auxiliary)content.push(node);
        node=next;
      }
      if(content.length){
        main=document.createElement('main');
        main.id='main-content';
        content[0].parentNode.insertBefore(main,content[0]);
        content.forEach(item=>main.appendChild(item));
      }
    }
    if(!main)return null;
    if(!main.id)main.id='main-content';
    if(!main.hasAttribute('tabindex'))main.setAttribute('tabindex','-1');
    return main;
  }

  function normalizeHeadingOrder(){
    document.querySelectorAll('footer .footer-grid h5').forEach(h=>h.setAttribute('aria-level','2'));
    document.querySelectorAll('.store-grid .store-cell h4').forEach(h=>h.setAttribute('aria-level','3'));
    document.querySelectorAll('.cart-summary h3,.products-layout .filters h3').forEach(h=>h.setAttribute('aria-level','2'));

    let previous=0;
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]').forEach(heading=>{
      if(heading.closest('[hidden],[aria-hidden="true"]')||heading.getClientRects().length===0)return;
      const native=/^H([1-6])$/.exec(heading.tagName);
      const declared=Number(heading.getAttribute('aria-level'))||Number(native?.[1]||0);
      if(!declared)return;
      const level=previous&&declared>previous+1?previous+1:declared;
      if(level!==declared)heading.setAttribute('aria-level',String(level));
      previous=level;
    });
  }

  function styles(){
    if(document.getElementById('reloja-accessibility-panel-style'))return;
    const s=document.createElement('style');s.id='reloja-accessibility-panel-style';s.textContent=`
      .reloja-accessibility-global-rail,.reloja-accessibility-header,.reloja-accessibility-rail,.reloja-contrast-toggle{display:none!important}
      .reloja-floating-utilities{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:var(--reloja-floating-bottom,max(18px,env(safe-area-inset-bottom)));z-index:360;display:flex;flex-direction:column-reverse;align-items:flex-end;gap:10px;pointer-events:none}
      .reloja-floating-utilities>*{pointer-events:auto}
      .reloja-a11y-trigger{position:static!important;flex:0 0 48px;width:48px;height:48px;min-width:48px;min-height:48px;margin:0;padding:0;border:2px solid var(--ink,#111);border-radius:0;background:var(--bg,#fff);color:var(--ink,#111);box-shadow:0 8px 24px rgba(0,0,0,.16);display:inline-grid;place-items:center;font:700 .82rem/1 var(--font-mono,monospace);cursor:pointer;transition:background .16s,color .16s,transform .16s}
      .reloja-a11y-trigger:hover,.reloja-a11y-trigger[aria-expanded=true]{background:var(--ink,#111);color:var(--bg,#fff);transform:translateY(-1px)}.reloja-a11y-trigger:focus-visible{outline:3px solid var(--red,#b00020);outline-offset:3px}
      .reloja-a11y-backdrop{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.58);display:none;align-items:flex-start;justify-content:flex-end;padding:86px max(16px,env(safe-area-inset-right)) 16px 16px}.reloja-a11y-backdrop.open{display:flex}
      .reloja-a11y-panel{width:min(430px,100%);max-height:calc(100vh - 102px);overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:2px solid var(--ink,#111);border-radius:0;box-shadow:0 24px 80px rgba(0,0,0,.3);padding:22px}
      .reloja-a11y-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid var(--line,#ddd);padding-bottom:14px;margin-bottom:14px}.reloja-a11y-head h2{margin:0 0 4px;font:700 1.35rem/1.15 var(--font-display,Arial,sans-serif)}.reloja-a11y-head p{margin:0;color:var(--ink-soft,#555);font-size:.82rem;line-height:1.45}.reloja-a11y-close{border:1px solid currentColor;border-radius:0;background:transparent;color:inherit;width:38px;height:38px;font-size:22px;cursor:pointer}
      .reloja-a11y-group{border:0;padding:0;margin:18px 0}.reloja-a11y-group legend{font-family:var(--font-mono,monospace);font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-bottom:9px}.reloja-a11y-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line,#ddd)}.reloja-a11y-row:last-child{border-bottom:0}.reloja-a11y-row span{font-size:.88rem;line-height:1.4}.reloja-a11y-row small{display:block;color:var(--ink-soft,#666);font-size:.72rem;margin-top:2px}.reloja-a11y-row input[type=checkbox]{width:22px;height:22px;flex:0 0 auto}.reloja-a11y-row select{min-width:120px;padding:8px;border:1px solid currentColor;border-radius:0;background:var(--bg,#fff);color:inherit;font:inherit}.reloja-a11y-reset{width:100%;min-height:44px;border:1px solid currentColor;border-radius:0;background:transparent;color:inherit;font-family:var(--font-mono,monospace);font-weight:700;cursor:pointer}.reloja-a11y-status{position:absolute;left:-9999px}.reloja-skip-link{position:fixed;left:12px;top:12px;z-index:700;transform:translateY(-150%);background:#000;color:#fff;padding:12px 16px;font-weight:700;text-decoration:none}.reloja-skip-link:focus{transform:none}
      html.reloja-readable-font body,html.reloja-readable-font button,html.reloja-readable-font input,html.reloja-readable-font select,html.reloja-readable-font textarea{font-family:Arial,Verdana,Helvetica,sans-serif!important}html.reloja-spacious-text body{line-height:1.72!important;letter-spacing:.025em!important;word-spacing:.07em!important}html.reloja-spacious-text p,html.reloja-spacious-text li,html.reloja-spacious-text dd{line-height:1.8!important}html.reloja-underlined-links a:not(.btn):not([class*=button]){text-decoration:underline!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important}html.reloja-reduce-motion *,html.reloja-reduce-motion *::before,html.reloja-reduce-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}html.reloja-strong-focus :focus-visible{outline:4px solid #b00020!important;outline-offset:4px!important;box-shadow:0 0 0 2px #fff!important}html.reloja-large-targets button,html.reloja-large-targets .btn,html.reloja-large-targets input,html.reloja-large-targets select,html.reloja-large-targets textarea{min-height:44px!important}.reloja-reading-guide{position:fixed;left:0;right:0;height:34px;z-index:340;pointer-events:none;display:none;border-top:2px solid rgba(176,0,32,.7);border-bottom:2px solid rgba(176,0,32,.7);background:rgba(255,235,59,.10)}html.reloja-reading-guide-on .reloja-reading-guide{display:block}
      html.reloja-dark .reloja-a11y-panel,html.reloja-dark .reloja-a11y-trigger{background:#17191c!important;color:#f5f5f2!important;border-color:#f5f5f2!important}html.reloja-dark .reloja-a11y-trigger:hover,html.reloja-dark .reloja-a11y-trigger[aria-expanded=true]{background:#f5f5f2!important;color:#111!important}html.reloja-high-contrast .reloja-a11y-panel,html.reloja-high-contrast .reloja-a11y-trigger{background:#fff!important;color:#000!important;border:2px solid #000!important}html.reloja-high-contrast .reloja-a11y-trigger:hover,html.reloja-high-contrast .reloja-a11y-trigger[aria-expanded=true]{background:#000!important;color:#fff!important}
      @media(max-width:640px){.site-header .nav>.nav-cta{display:none}.reloja-floating-utilities{right:max(12px,env(safe-area-inset-right));bottom:var(--reloja-floating-bottom,max(12px,env(safe-area-inset-bottom)))}.reloja-a11y-trigger{width:48px;height:48px;min-width:48px;min-height:48px}.reloja-a11y-backdrop{padding:72px 0 0}.reloja-a11y-panel{width:100%;max-height:calc(100vh - 72px);border-left:0;border-right:0;border-bottom:0;padding:18px}}


      /* Tema e compatibilidade consolidados do antigo accessibility-controls.js */

      .reloja-contrast-toggle{display:none!important}
      .reloja-accessibility-controls{display:flex;align-items:stretch;gap:0;z-index:240;border:1px solid var(--line-strong);background:var(--bg);box-shadow:0 8px 24px rgba(0,0,0,.12);isolation:isolate}
      .reloja-accessibility-button{appearance:none;width:34px;height:34px;min-width:34px;min-height:34px;padding:0;border:0;background:transparent;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;font:700 .69rem/1 var(--font-mono);letter-spacing:-.02em;cursor:pointer;transition:background .16s,color .16s}
      .reloja-accessibility-button+.reloja-accessibility-button{border-left:1px solid var(--line)}
      .reloja-accessibility-button:hover{background:var(--bg-soft);color:var(--red)}
      .reloja-accessibility-button[aria-pressed="true"]{background:var(--red);color:#fff}
      .reloja-accessibility-button:focus-visible{position:relative;z-index:2;outline:3px solid var(--red);outline-offset:2px}
      .reloja-accessibility-global-rail{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));top:auto;transform:none;flex-direction:column;border-color:var(--line);background:var(--bg)}
      .reloja-accessibility-global-rail .reloja-accessibility-button+.reloja-accessibility-button{border-left:0;border-top:1px solid var(--line)}
      .reloja-accessibility-header{display:none!important}
      html.reloja-large-text{font-size:112.5%}

      html.reloja-dark{color-scheme:dark;--bg:#111214;--bg-soft:#1A1C20;--bg-black:#050506;--bg-black-2:#0B0C0E;--ink:#F5F5F2;--ink-soft:#D7D9DE;--muted:#A7AAB1;--paper:#202226;--red:#FF4D53;--red-dark:#FF6A6F;--line:rgba(255,255,255,.14);--line-strong:rgba(255,255,255,.32);--line-inverse:rgba(255,255,255,.25)}
      html.reloja-dark body,html.reloja-dark .site-header,html.reloja-dark main,html.reloja-dark .hero,html.reloja-dark .section,html.reloja-dark .policy-main{background:var(--bg);color:var(--ink)}
      html.reloja-dark h1,html.reloja-dark h2,html.reloja-dark h3,html.reloja-dark h4,html.reloja-dark h5,html.reloja-dark h6,html.reloja-dark strong,html.reloja-dark label{color:var(--ink)}
      html.reloja-dark input,html.reloja-dark select,html.reloja-dark textarea{background:var(--bg)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark input::placeholder,html.reloja-dark textarea::placeholder{color:var(--muted);opacity:1}
      html.reloja-dark .policy-card,html.reloja-dark .cart-panel,html.reloja-dark .account-card,html.reloja-dark .account-box,html.reloja-dark .product-card,html.reloja-dark .cart-summary,html.reloja-dark .modal,html.reloja-dark .shipping-option,html.reloja-dark .shipping-option-detail,html.reloja-dark .coupon-box,html.reloja-dark .return-form-card{background:var(--bg-soft)!important;color:var(--ink);border-color:var(--line-strong)!important}
      html.reloja-dark .policy-hero{background:#17191c!important;color:var(--ink);border-color:var(--line)!important}
      html.reloja-dark .policy-hero h1,html.reloja-dark .policy-hero .policy-breadcrumb,html.reloja-dark .policy-hero .policy-kicker{color:var(--ink)!important}
      html.reloja-dark .policy-hero .intro,html.reloja-dark .policy-card p,html.reloja-dark .policy-card li,html.reloja-dark .policy-card .policy-small,html.reloja-dark .policy-card .policy-kicker{color:var(--ink-soft)!important}
      html.reloja-dark .policy-card:not(.policy-contact) a{color:var(--ink)!important}
      html.reloja-dark .policy-note{background:#24272c!important;color:var(--ink-soft)!important;border-left-color:var(--red)!important}
      html.reloja-dark .policy-checklist li:before{border-color:var(--ink)!important;color:var(--ink)!important}
      html.reloja-dark .policy-contact{background:#050506!important;color:#f5f5f2!important}
      html.reloja-dark .policy-contact h2,html.reloja-dark .policy-contact h3,html.reloja-dark .policy-contact p,html.reloja-dark .policy-contact li,html.reloja-dark .policy-contact strong,html.reloja-dark .policy-contact a{color:#f5f5f2!important}
      html.reloja-dark .policy-contact .btn-light{background:#f5f5f2!important;color:#111!important;border-color:#f5f5f2!important}
      html.reloja-dark .section-black,html.reloja-dark footer{background:#050506!important;color:#f5f5f2}
      html.reloja-dark .section-black h1,html.reloja-dark .section-black h2,html.reloja-dark .section-black h3,html.reloja-dark .section-black h4,html.reloja-dark .section-black strong,html.reloja-dark footer h5{color:#f5f5f2!important}
      html.reloja-dark .section-black p,html.reloja-dark footer p,html.reloja-dark footer .footer-bottom{color:#c6c9cf!important}
      html.reloja-dark footer a{color:#e4e5e8!important}
      html.reloja-dark footer a:hover{color:#ff5358!important}
      html.reloja-dark .site-search-toggle,html.reloja-dark .site-search-close,html.reloja-dark .forgot-password-button,html.reloja-dark [data-forgot-password]{color:var(--ink)!important;border-color:var(--line-strong)!important;background:transparent!important}
      html.reloja-dark .site-header .nav-links a,html.reloja-dark .site-header .nav-icon-link,html.reloja-dark .site-header .brand-mark{color:var(--ink)!important}
      html.reloja-dark .site-header .nav-links a:hover,html.reloja-dark .site-header .nav-links a[aria-current="page"]{background:var(--ink)!important;color:var(--bg)!important}
      html.reloja-dark .nav-cta{background:#B9131A!important;color:#fff!important}
      html.reloja-dark .nav-cta:hover{background:#971016!important}
      html.reloja-dark .btn-outline,html.reloja-dark .admin-actions button{background:transparent!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .shipping-message.info,html.reloja-dark .cart-legal-summary{background:#202328!important;color:var(--ink-soft)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .shipping-address-picker{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .shipping-address-picker .shipping-address-current{color:var(--ink-soft)!important}
      html.reloja-dark .shipping-address-picker .shipping-address-manage{color:var(--red)!important}
      html.reloja-dark .check-row input:checked{background:var(--red)!important;border-color:var(--red)!important}
      html.reloja-dark .check-row input:checked::after,html.reloja-high-contrast .check-row input:checked::after{content:'✓';position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:700 11px/1 Arial,sans-serif}
      html.reloja-dark .shipping-message.error,html.reloja-dark .form-error{background:#2a1719!important;color:#ffb5b8!important;border-color:#a93a3f!important}
      html.reloja-dark .form-success{background:#13271b!important;color:#a8e5bc!important;border-color:#34794d!important}
      html.reloja-dark .admin-card,html.reloja-dark .admin-table-wrap,html.reloja-dark .admin-modal,html.reloja-dark .photo-card,html.reloja-dark .photo-dropzone{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .return-admin-dialog,html.reloja-dark .store-cancel-card{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .return-admin-grid div,html.reloja-dark .return-admin-message,html.reloja-dark .return-admin-images a{background:var(--paper)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .return-admin-close{color:var(--ink)!important}
      html.reloja-dark .store-cancel-warning{background:#2b2118!important;color:var(--ink-soft)!important;border-left-color:#ffad66!important}
      html.reloja-dark .store-cancel-fiscal{background:#2b2818!important;color:var(--ink-soft)!important;border-color:#8f7a25!important}
      html.reloja-dark .store-cancel-error{background:#2a1719!important;color:#ffb5b8!important;border-color:#a93a3f!important}
      html.reloja-dark .store-cancel-note.ok{color:#8fe0ae!important}
      html.reloja-dark .store-cancel-note.fail{color:#ffb5b8!important}
      html.reloja-dark .store-cancel-note.pending{color:#ffd27a!important}
      html.reloja-dark .admin-table th,html.reloja-dark .admin-table td,html.reloja-dark .admin-tabs{border-color:var(--line)!important}
      html.reloja-dark .admin-tabs button{color:var(--ink)!important}
      html.reloja-dark .admin-tabs button.active{background:var(--ink)!important;color:var(--bg)!important}
      html.reloja-dark .admin-page [class*="help"],html.reloja-dark .admin-page [class*="muted"],html.reloja-dark .admin-page small{color:var(--ink-soft)!important}
      html.reloja-dark .return-field small{color:var(--ink-soft)!important}
      html.reloja-dark img{filter:none}
      html.reloja-dark .reloja-accessibility-controls{background:#17191c;border-color:rgba(255,255,255,.18);box-shadow:none}
      html.reloja-dark .reloja-accessibility-button{color:#e7e8ea}
      html.reloja-dark .reloja-accessibility-button[aria-pressed="true"]{background:#B9131A;color:#fff}
      html.reloja-dark .reloja-accessibility-button:hover{background:#22252a;color:var(--red)}
      html.reloja-dark .reloja-accessibility-button+.reloja-accessibility-button{border-color:rgba(255,255,255,.13)}

      html.reloja-high-contrast{color-scheme:light;--bg:#fff;--bg-soft:#fff;--bg-black:#000;--bg-black-2:#000;--ink:#000;--ink-soft:#000;--muted:#000;--paper:#fff;--red:#b00020;--line:#000;--line-strong:#000;--line-inverse:#fff}
      html.reloja-high-contrast body,html.reloja-high-contrast main,html.reloja-high-contrast .site-header,html.reloja-high-contrast .hero,html.reloja-high-contrast .section,html.reloja-high-contrast .policy-hero,html.reloja-high-contrast .policy-main{background:#fff!important;color:#000!important}
      html.reloja-high-contrast h1,html.reloja-high-contrast h2,html.reloja-high-contrast h3,html.reloja-high-contrast h4,html.reloja-high-contrast h5,html.reloja-high-contrast h6,html.reloja-high-contrast p,html.reloja-high-contrast li,html.reloja-high-contrast strong,html.reloja-high-contrast label,html.reloja-high-contrast small{color:#000!important}
      html.reloja-high-contrast input,html.reloja-high-contrast select,html.reloja-high-contrast textarea{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .policy-card,html.reloja-high-contrast .account-box,html.reloja-high-contrast .account-card,html.reloja-high-contrast .cart-summary,html.reloja-high-contrast .product-card,html.reloja-high-contrast .modal,html.reloja-high-contrast .admin-card,html.reloja-high-contrast .admin-table-wrap,html.reloja-high-contrast .admin-modal,html.reloja-high-contrast .shipping-option,html.reloja-high-contrast .coupon-box{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .shipping-address-picker{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .shipping-address-picker .shipping-address-current,html.reloja-high-contrast .shipping-address-picker .shipping-address-manage{color:#000!important}
      html.reloja-high-contrast .check-row input:checked{background:#000!important;border-color:#000!important}
      html.reloja-high-contrast .section-black,html.reloja-high-contrast footer,html.reloja-high-contrast .policy-contact{background:#000!important;color:#fff!important}
      html.reloja-high-contrast .section-black h1,html.reloja-high-contrast .section-black h2,html.reloja-high-contrast .section-black h3,html.reloja-high-contrast .section-black h4,html.reloja-high-contrast .section-black p,html.reloja-high-contrast .section-black strong,html.reloja-high-contrast footer h5,html.reloja-high-contrast footer p,html.reloja-high-contrast footer a,html.reloja-high-contrast footer span,html.reloja-high-contrast .policy-contact h2,html.reloja-high-contrast .policy-contact h3,html.reloja-high-contrast .policy-contact p,html.reloja-high-contrast .policy-contact li,html.reloja-high-contrast .policy-contact strong,html.reloja-high-contrast .policy-contact a{color:#fff!important}
      html.reloja-high-contrast a:not(.btn):not(.btn-light):not(.btn-dark-outline){text-decoration:underline!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important}
      html.reloja-high-contrast :focus-visible{outline:3px solid #b00020!important;outline-offset:3px!important}
      html.reloja-high-contrast .reloja-accessibility-controls{border-color:#000;background:#fff}
      html.reloja-high-contrast .reloja-accessibility-button{color:#000}
      html.reloja-high-contrast .reloja-accessibility-button[aria-pressed="true"]{background:#000;color:#fff}
      html.reloja-high-contrast .reloja-accessibility-button+.reloja-accessibility-button{border-color:#000}
      html.reloja-large-text .policy-hero h1{font-size:clamp(2.25rem,5vw,4rem)}
      @media(max-width:640px){.reloja-accessibility-global-rail{left:max(8px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom))}.reloja-accessibility-button{width:32px;height:32px;min-width:32px;min-height:32px;font-size:.65rem}}
      @media(prefers-reduced-motion:reduce){.reloja-accessibility-button{transition:none}}
    

      /* Layout, escala tipográfica e ícone consolidados do antigo accessibility-trigger-enhancement.js */

      .nav-actions-cluster{display:flex;align-items:stretch;gap:8px;flex:0 0 auto}.nav-actions-cluster .nav-cta{display:inline-flex;align-items:center;justify-content:center}.reloja-a11y-trigger .reloja-a11y-symbol{width:34px;height:34px;display:block;color:currentColor;overflow:visible}.reloja-a11y-symbol .reloja-a11y-node{fill:var(--red,#e31e24);stroke:currentColor}.reloja-high-contrast .reloja-a11y-symbol .reloja-a11y-node{fill:currentColor}.reloja-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

      /* Escala tipográfica: converte textos fixos em px para rem sem alterar o tamanho de 100%. */
      .product-breadcrumb,.product-brand,.product-ref{font-size:.75rem!important}.product-installments{font-size:.875rem!important}.product-payment-note{font-size:.75rem!important}.product-stock{font-size:.6875rem!important}.product-availability-box strong{font-size:.75rem!important}.product-availability-box span{font-size:.75rem!important}.stock-alert-box label{font-size:.875rem!important}.stock-alert-fields input{font-size:.8125rem!important}.stock-alert-privacy{font-size:.6875rem!important}.stock-alert-message{font-size:.75rem!important}.product-trust strong{font-size:.8125rem!important}.product-trust span{font-size:.75rem!important}.product-shipping h3{font-size:1rem!important}.product-shipping p,.product-shipping-form input{font-size:.8125rem!important}.shipping-option-detail strong{font-size:.8125rem!important}.shipping-option-detail span{font-size:.75rem!important}.product-section-label h2{font-size:1.625rem!important}.product-description{font-size:1.0625rem!important}.spec-item dt{font-size:.625rem!important}.spec-item dd{font-size:.875rem!important}.originality-strip strong{font-size:.875rem!important}.originality-strip span{font-size:.75rem!important}.related-head h2{font-size:1.75rem!important}.related-card h3,.related-card .price{font-size:.9375rem!important}
      .policy-kicker{font-size:.75rem!important}.policy-breadcrumb{font-size:.8125rem!important}.policy-hero .intro{font-size:1.125rem!important}.policy-card h2{font-size:1.625rem!important}.policy-card h3{font-size:1.125rem!important}.policy-card p,.policy-card li{font-size:.9375rem!important}.policy-note{font-size:.875rem!important}.policy-small{font-size:.75rem!important}.policy-hero h1{font-size:clamp(2.375rem,6vw,4.5rem)!important}.footer-company-identity,.footer-contact-buttons a{font-size:.75rem!important}

      /* O componente fluido usa vw; estes ajustes fazem a parcela vw acompanhar 110/120/130/140%. */
      html[data-reloja-text-scale="110"] .hero h1{font-size:clamp(2.3rem,4.62vw,3.6rem)!important}html[data-reloja-text-scale="120"] .hero h1{font-size:clamp(2.3rem,5.04vw,3.6rem)!important}html[data-reloja-text-scale="130"] .hero h1{font-size:clamp(2.3rem,5.46vw,3.6rem)!important}html[data-reloja-text-scale="140"] .hero h1{font-size:clamp(2.3rem,5.88vw,3.6rem)!important}
      html[data-reloja-text-scale="110"] .section-head h2{font-size:clamp(1.7rem,3.08vw,2.3rem)!important}html[data-reloja-text-scale="120"] .section-head h2{font-size:clamp(1.7rem,3.36vw,2.3rem)!important}html[data-reloja-text-scale="130"] .section-head h2{font-size:clamp(1.7rem,3.64vw,2.3rem)!important}html[data-reloja-text-scale="140"] .section-head h2{font-size:clamp(1.7rem,3.92vw,2.3rem)!important}
      html[data-reloja-text-scale="110"] .brand-row .name{font-size:clamp(1.3rem,2.86vw,1.9rem)!important}html[data-reloja-text-scale="120"] .brand-row .name{font-size:clamp(1.3rem,3.12vw,1.9rem)!important}html[data-reloja-text-scale="130"] .brand-row .name{font-size:clamp(1.3rem,3.38vw,1.9rem)!important}html[data-reloja-text-scale="140"] .brand-row .name{font-size:clamp(1.3rem,3.64vw,1.9rem)!important}
      html[data-reloja-text-scale="110"] .product-buy h1{font-size:clamp(2rem,3.52vw,3.7rem)!important}html[data-reloja-text-scale="120"] .product-buy h1{font-size:clamp(2rem,3.84vw,3.7rem)!important}html[data-reloja-text-scale="130"] .product-buy h1{font-size:clamp(2rem,4.16vw,3.7rem)!important}html[data-reloja-text-scale="140"] .product-buy h1{font-size:clamp(2rem,4.48vw,3.7rem)!important}
      html[data-reloja-text-scale="110"] body:has(#product-grid) .section-content>h1{font-size:clamp(1.9rem,3.74vw,2.7rem)!important}html[data-reloja-text-scale="120"] body:has(#product-grid) .section-content>h1{font-size:clamp(1.9rem,4.08vw,2.7rem)!important}html[data-reloja-text-scale="130"] body:has(#product-grid) .section-content>h1{font-size:clamp(1.9rem,4.42vw,2.7rem)!important}html[data-reloja-text-scale="140"] body:has(#product-grid) .section-content>h1{font-size:clamp(1.9rem,4.76vw,2.7rem)!important}
      html[data-reloja-text-scale="110"] .site-search-head h2{font-size:clamp(1.45rem,3.3vw,2rem)!important}html[data-reloja-text-scale="120"] .site-search-head h2{font-size:clamp(1.45rem,3.6vw,2rem)!important}html[data-reloja-text-scale="130"] .site-search-head h2{font-size:clamp(1.45rem,3.9vw,2rem)!important}html[data-reloja-text-scale="140"] .site-search-head h2{font-size:clamp(1.45rem,4.2vw,2rem)!important}
      html[data-reloja-text-scale="110"] .policy-hero h1{font-size:clamp(2.375rem,6.6vw,4.5rem)!important}html[data-reloja-text-scale="120"] .policy-hero h1{font-size:clamp(2.375rem,7.2vw,4.5rem)!important}html[data-reloja-text-scale="130"] .policy-hero h1{font-size:clamp(2.375rem,7.8vw,4.5rem)!important}html[data-reloja-text-scale="140"] .policy-hero h1{font-size:clamp(2.375rem,8.4vw,4.5rem)!important}
      html[data-reloja-text-scale="110"] .addresses-top h1{font-size:clamp(2rem,5.5vw,3rem)!important}html[data-reloja-text-scale="120"] .addresses-top h1{font-size:clamp(2rem,6vw,3rem)!important}html[data-reloja-text-scale="130"] .addresses-top h1{font-size:clamp(2rem,6.5vw,3rem)!important}html[data-reloja-text-scale="140"] .addresses-top h1{font-size:clamp(2rem,7vw,3rem)!important}

      /* Em ampliações altas, o cabeçalho vira menu para não cortar ações. */
      html[data-reloja-text-scale="130"] .site-header .nav:has(.nav-links),html[data-reloja-text-scale="140"] .site-header .nav:has(.nav-links){position:relative;gap:8px;padding-left:20px;padding-right:20px;flex-wrap:nowrap}
      html[data-reloja-text-scale="130"] .site-header .nav-links,html[data-reloja-text-scale="140"] .site-header .nav-links{position:absolute;top:100%;left:0;right:0;z-index:60;width:100%;margin:0;padding:0;display:none;flex-direction:column;background:var(--bg);border-bottom:2px solid var(--ink)}
      html[data-reloja-text-scale="130"] .site-header .nav-links.open,html[data-reloja-text-scale="140"] .site-header .nav-links.open{display:flex}
      html[data-reloja-text-scale="130"] .site-header .nav-links li,html[data-reloja-text-scale="140"] .site-header .nav-links li,html[data-reloja-text-scale="130"] .site-header .nav-links a,html[data-reloja-text-scale="140"] .site-header .nav-links a{width:100%;white-space:nowrap}
      html[data-reloja-text-scale="130"] .site-header .nav-utility,html[data-reloja-text-scale="140"] .site-header .nav-utility{display:none}
      html[data-reloja-text-scale="130"] .site-header .nav-toggle,html[data-reloja-text-scale="140"] .site-header .nav-toggle{display:block}
      html[data-reloja-text-scale="130"] .site-header .nav-mobile-only,html[data-reloja-text-scale="140"] .site-header .nav-mobile-only{display:block}
      html[data-reloja-text-scale="130"] .site-header .nav-actions-cluster,html[data-reloja-text-scale="140"] .site-header .nav-actions-cluster{margin-left:auto}
      html[data-reloja-text-scale="130"] .site-header .nav-actions-cluster .nav-cta,html[data-reloja-text-scale="140"] .site-header .nav-actions-cluster .nav-cta{display:none!important}
      html[data-reloja-text-scale="130"] .site-header .nav-actions-cluster .reloja-a11y-trigger,html[data-reloja-text-scale="140"] .site-header .nav-actions-cluster .reloja-a11y-trigger{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}
      .reloja-a11y-panel{overflow-wrap:anywhere}
      html[data-reloja-text-scale="130"] .reloja-a11y-panel,html[data-reloja-text-scale="140"] .reloja-a11y-panel{width:min(500px,100%)}

      @media(max-width:640px){
        .nav-actions-cluster{margin-left:auto}.nav-actions-cluster .nav-cta{display:none!important}.nav-actions-cluster .reloja-a11y-trigger{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}
        html[data-reloja-text-scale="110"] .hero h1{font-size:clamp(2.05rem,11.55vw,2.65rem)!important}html[data-reloja-text-scale="120"] .hero h1{font-size:clamp(2.05rem,12.6vw,2.65rem)!important}html[data-reloja-text-scale="130"] .hero h1{font-size:clamp(2.05rem,13.65vw,2.65rem)!important}html[data-reloja-text-scale="140"] .hero h1{font-size:clamp(2.05rem,14.7vw,2.65rem)!important}
        html[data-reloja-text-scale="110"] .section-head h2{font-size:clamp(1.75rem,8.8vw,2.05rem)!important}html[data-reloja-text-scale="120"] .section-head h2{font-size:clamp(1.75rem,9.6vw,2.05rem)!important}html[data-reloja-text-scale="130"] .section-head h2{font-size:clamp(1.75rem,10.4vw,2.05rem)!important}html[data-reloja-text-scale="140"] .section-head h2{font-size:clamp(1.75rem,11.2vw,2.05rem)!important}
        html[data-reloja-text-scale="110"] .product-buy h1{font-size:clamp(1.85rem,9.9vw,2.55rem)!important}html[data-reloja-text-scale="120"] .product-buy h1{font-size:clamp(1.85rem,10.8vw,2.55rem)!important}html[data-reloja-text-scale="130"] .product-buy h1{font-size:clamp(1.85rem,11.7vw,2.55rem)!important}html[data-reloja-text-scale="140"] .product-buy h1{font-size:clamp(1.85rem,12.6vw,2.55rem)!important}
        html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="text"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="email"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="password"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="search"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="tel"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="number"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="url"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="datetime-local"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) select,html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) textarea{font-size:1rem!important}
      }
    
    `;document.head.appendChild(s)
  }

  function loadAnalyticsClient(){
    if(document.querySelector('script[data-relogio-analytics]'))return;
    const script=document.createElement('script');
    script.src='analytics-client.js?v=2';
    script.defer=true;
    script.setAttribute('data-relogio-analytics','1');
    document.head.appendChild(script);
  }

  const COOKIE_FLOATING_SELECTORS='#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#CookiebotWidget,.cky-consent-container,.cc-window,.cookie-banner,#cookie-banner,.cookie-consent,#cookie-consent,.cookies-banner,#cookies-banner,[data-cookie-banner]';

  function syncFloatingOffset(dock){
    if(!dock)return;
    let bottom=window.matchMedia('(max-width:640px)').matches?12:18;
    document.querySelectorAll(COOKIE_FLOATING_SELECTORS).forEach(node=>{
      if(node.closest('.reloja-floating-utilities'))return;
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return;
      const rect=node.getBoundingClientRect();
      if(rect.width<1||rect.height<1||rect.bottom<window.innerHeight-8||rect.top>=window.innerHeight)return;
      bottom=Math.max(bottom,Math.ceil(window.innerHeight-rect.top+12));
    });
    dock.style.setProperty('--reloja-floating-bottom',`${bottom}px`);
  }

  function installTrigger(){
    document.querySelectorAll('.reloja-a11y-trigger').forEach(node=>node.remove());
    let dock=document.querySelector('.reloja-floating-utilities');
    if(!dock){
      dock=document.createElement('div');
      dock.className='reloja-floating-utilities';
      dock.setAttribute('aria-label','Atalhos de acessibilidade e privacidade');
      document.body.appendChild(dock);
    }
    const b=document.createElement('button');
    b.type='button';
    b.className='reloja-a11y-trigger';
    b.setAttribute('aria-label','Abrir painel de acessibilidade');
    b.setAttribute('aria-haspopup','dialog');
    b.setAttribute('aria-controls','reloja-a11y-panel');
    b.setAttribute('aria-expanded','false');
    b.title='Acessibilidade (Alt+A)';
    b.innerHTML='<svg class="reloja-a11y-symbol" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 15.5A17.5 17.5 0 0 1 35.5 15.5"></path><path d="M9.5 23A17.5 17.5 0 0 0 14.3 35.6"></path><path d="M38.5 23A17.5 17.5 0 0 1 33.7 35.6"></path><path d="M17.2 39.4A17.5 17.5 0 0 0 30.8 39.4"></path><path d="M11.5 21.2Q24 28.2 36.5 21.2"></path><path d="M24 26.2 16 39"></path><path d="M24 26.2 32 39"></path></g><circle class="reloja-a11y-node" cx="24" cy="11.5" r="5.3" stroke-width="3"></circle><circle class="reloja-a11y-node" cx="10" cy="21.2" r="3.6" stroke-width="3"></circle><circle class="reloja-a11y-node" cx="38" cy="21.2" r="3.6" stroke-width="3"></circle><circle class="reloja-a11y-node" cx="15.7" cy="39.2" r="3.6" stroke-width="3"></circle><circle class="reloja-a11y-node" cx="32.3" cy="39.2" r="3.6" stroke-width="3"></circle></svg><span class="reloja-visually-hidden">Acessibilidade</span>';
    dock.appendChild(b);
    syncFloatingOffset(dock);
    return b;
  }

  function install(){
    migrate();loadAnalyticsClient();styles();removeLegacy();
    const main=ensureMainLandmark();
    normalizeHeadingOrder();
    let skip=document.querySelector('.reloja-skip-link, a[href="#conteudo-principal"]');
    if(!skip){skip=document.createElement('a');skip.className='reloja-skip-link';skip.textContent='Ir para o conteúdo principal';document.body.prepend(skip)}
    skip.href=main?`#${main.id}`:'#main-content';
    let guide=document.querySelector('.reloja-reading-guide');if(!guide){guide=document.createElement('div');guide.className='reloja-reading-guide';guide.setAttribute('aria-hidden','true');document.body.appendChild(guide)}const moveGuide=y=>{if(bool(KEYS.guide))guide.style.top=`${Math.max(0,y-17)}px`};document.addEventListener('pointermove',e=>moveGuide(e.clientY),{passive:true});document.addEventListener('focusin',e=>{if(!bool(KEYS.guide))return;const r=e.target?.getBoundingClientRect?.();if(r)moveGuide(r.top+Math.min(r.height/2,24))});
    trigger=installTrigger();
    const floatingDock=trigger?.closest('.reloja-floating-utilities');
    const syncDock=()=>requestAnimationFrame(()=>syncFloatingOffset(floatingDock));
    window.addEventListener('resize',syncDock,{passive:true});
    const backdrop=document.createElement('div');backdrop.className='reloja-a11y-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.innerHTML=`<section id="reloja-a11y-panel" class="reloja-a11y-panel" role="dialog" aria-modal="true" aria-labelledby="reloja-a11y-title"><div class="reloja-a11y-head"><div><h2 id="reloja-a11y-title">Acessibilidade</h2><p>Todos os ajustes ficam reunidos aqui e salvos neste navegador.</p></div><button class="reloja-a11y-close" type="button" aria-label="Fechar painel">×</button></div><fieldset class="reloja-a11y-group"><legend>Visualização</legend><label class="reloja-a11y-row"><span>Alto contraste<small>Preto e branco com contornos reforçados.</small></span><input name="contrast" type="checkbox"></label><label class="reloja-a11y-row"><span>Modo escuro<small>Reduz a luminosidade da interface.</small></span><input name="dark" type="checkbox"></label><label class="reloja-a11y-row"><span>Tamanho do texto<small>Amplia o texto sem usar o zoom do navegador.</small></span><select name="scale"><option value="100">100%</option><option value="110">110%</option><option value="120">120%</option><option value="130">130%</option><option value="140">140%</option></select></label><label class="reloja-a11y-row"><span>Fonte de alta legibilidade<small>Usa uma família sem serifa mais simples.</small></span><input name="readable" type="checkbox"></label><label class="reloja-a11y-row"><span>Mais espaçamento<small>Aumenta linhas, letras e palavras.</small></span><input name="spacing" type="checkbox"></label><label class="reloja-a11y-row"><span>Sublinhar links<small>Facilita identificar elementos clicáveis.</small></span><input name="links" type="checkbox"></label></fieldset><fieldset class="reloja-a11y-group"><legend>Navegação e movimento</legend><label class="reloja-a11y-row"><span>Reduzir animações<small>Minimiza movimentos e transições.</small></span><input name="motion" type="checkbox"></label><label class="reloja-a11y-row"><span>Foco reforçado<small>Destaca o elemento selecionado pelo teclado.</small></span><input name="focus" type="checkbox"></label><label class="reloja-a11y-row"><span>Botões e campos maiores<small>Aumenta alvos de clique e toque.</small></span><input name="targets" type="checkbox"></label><label class="reloja-a11y-row"><span>Guia de leitura<small>Exibe uma faixa horizontal acompanhando ponteiro ou foco.</small></span><input name="guide" type="checkbox"></label></fieldset><button class="reloja-a11y-reset" type="button">Restaurar padrão</button><div class="reloja-a11y-status" aria-live="polite"></div></section>`;document.body.appendChild(backdrop);panel=backdrop.querySelector('.reloja-a11y-panel');status=panel.querySelector('.reloja-a11y-status');
    trigger?.addEventListener('click',open);panel.querySelector('.reloja-a11y-close').addEventListener('click',close);backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});panel.querySelector('.reloja-a11y-reset').addEventListener('click',reset);panel.querySelector('[name=contrast]').addEventListener('change',e=>setContrast(e.target.checked));panel.querySelector('[name=dark]').addEventListener('change',e=>setDark(e.target.checked));['readable','spacing','links','motion','focus','targets','guide'].forEach(n=>panel.querySelector(`[name=${n}]`).addEventListener('change',e=>setBool(KEYS[n],e.target.checked)));panel.querySelector('[name=scale]').addEventListener('change',e=>{write(KEYS.scale,e.target.value);apply();announce(`Tamanho do texto: ${e.target.value}%.`)});document.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='a'){e.preventDefault();backdrop.classList.contains('open')?close():open()}if(e.key==='Escape'&&backdrop.classList.contains('open'))close()});new MutationObserver(()=>{removeLegacy();normalizeHeadingOrder();syncDock()}).observe(document.body,{childList:true,subtree:true});apply();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
