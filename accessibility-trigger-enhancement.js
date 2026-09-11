(() => {
  'use strict';
  if(window.__relogioAccessibilityTriggerEnhanced)return;
  window.__relogioAccessibilityTriggerEnhanced=true;

  const SCALE_KEY='reloja_text_scale';
  const SCALE_VALUES=Object.freeze([100,110,120,130,140]);
  const LEGACY_SCALE_MAP=new Map([[112.5,110],[125,120]]);

  function readScale(){
    try{return localStorage.getItem(SCALE_KEY)}catch{return null}
  }

  function writeScale(value){
    try{localStorage.setItem(SCALE_KEY,String(value))}catch{}
  }

  function normalizedScale(value){
    const numeric=Number(value);
    if(LEGACY_SCALE_MAP.has(numeric))return LEGACY_SCALE_MAP.get(numeric);
    if(SCALE_VALUES.includes(numeric))return numeric;
    if(!Number.isFinite(numeric))return 100;
    return SCALE_VALUES.reduce((best,current)=>Math.abs(current-numeric)<Math.abs(best-numeric)?current:best,100);
  }

  function loadAnalyticsClient(){
    if(document.querySelector('script[data-relogio-analytics]'))return;
    const script=document.createElement('script');
    script.src='analytics-client.js?v=1';
    script.defer=true;
    script.setAttribute('data-relogio-analytics','1');
    document.head.appendChild(script);
  }

  function injectStyles(){
    if(document.getElementById('reloja-accessibility-trigger-enhancement-style'))return;
    const style=document.createElement('style');
    style.id='reloja-accessibility-trigger-enhancement-style';
    style.textContent=`
      .nav-actions-cluster{display:flex;align-items:stretch;gap:8px;flex:0 0 auto}.nav-actions-cluster .nav-cta{display:inline-flex;align-items:center;justify-content:center}.nav-actions-cluster .reloja-a11y-trigger{margin:0!important;width:44px!important;height:auto!important;min-height:44px!important;min-width:44px!important;flex:0 0 44px!important}.reloja-a11y-trigger .reloja-a11y-symbol{width:23px;height:23px;display:block;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.reloja-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

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

      /* Em ampliações altas, prioriza reflow do cabeçalho e impede palavras quebradas. */
      html[data-reloja-text-scale="130"] .site-header .nav,html[data-reloja-text-scale="140"] .site-header .nav{gap:8px;padding-left:20px;padding-right:20px;flex-wrap:wrap}html[data-reloja-text-scale="130"] .site-header .nav-links a,html[data-reloja-text-scale="140"] .site-header .nav-links a{padding-left:12px;padding-right:12px;white-space:nowrap}html[data-reloja-text-scale="130"] .site-header .nav-utility,html[data-reloja-text-scale="140"] .site-header .nav-utility{margin-right:4px}html[data-reloja-text-scale="130"] .site-header .brand-mark .word,html[data-reloja-text-scale="140"] .site-header .brand-mark .word,html[data-reloja-text-scale="130"] .site-search-button,html[data-reloja-text-scale="140"] .site-search-button,html[data-reloja-text-scale="130"] .nav-icon-link,html[data-reloja-text-scale="140"] .nav-icon-link,html[data-reloja-text-scale="130"] .nav-cta,html[data-reloja-text-scale="140"] .nav-cta{white-space:nowrap}.reloja-a11y-panel{overflow-wrap:anywhere}html[data-reloja-text-scale="130"] .reloja-a11y-panel,html[data-reloja-text-scale="140"] .reloja-a11y-panel{width:min(500px,100%)}

      @media(max-width:640px){
        .nav-actions-cluster{margin-left:auto}.nav-actions-cluster .nav-cta{display:none!important}.nav-actions-cluster .reloja-a11y-trigger{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}
        html[data-reloja-text-scale="110"] .hero h1{font-size:clamp(2.05rem,11.55vw,2.65rem)!important}html[data-reloja-text-scale="120"] .hero h1{font-size:clamp(2.05rem,12.6vw,2.65rem)!important}html[data-reloja-text-scale="130"] .hero h1{font-size:clamp(2.05rem,13.65vw,2.65rem)!important}html[data-reloja-text-scale="140"] .hero h1{font-size:clamp(2.05rem,14.7vw,2.65rem)!important}
        html[data-reloja-text-scale="110"] .section-head h2{font-size:clamp(1.75rem,8.8vw,2.05rem)!important}html[data-reloja-text-scale="120"] .section-head h2{font-size:clamp(1.75rem,9.6vw,2.05rem)!important}html[data-reloja-text-scale="130"] .section-head h2{font-size:clamp(1.75rem,10.4vw,2.05rem)!important}html[data-reloja-text-scale="140"] .section-head h2{font-size:clamp(1.75rem,11.2vw,2.05rem)!important}
        html[data-reloja-text-scale="110"] .product-buy h1{font-size:clamp(1.85rem,9.9vw,2.55rem)!important}html[data-reloja-text-scale="120"] .product-buy h1{font-size:clamp(1.85rem,10.8vw,2.55rem)!important}html[data-reloja-text-scale="130"] .product-buy h1{font-size:clamp(1.85rem,11.7vw,2.55rem)!important}html[data-reloja-text-scale="140"] .product-buy h1{font-size:clamp(1.85rem,12.6vw,2.55rem)!important}
        html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="text"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="email"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="password"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="search"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="tel"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="number"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="url"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) input[type="datetime-local"],html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) select,html[data-reloja-text-scale]:not([data-reloja-text-scale="100"]) textarea{font-size:1rem!important}
      }
    `;
    document.head.appendChild(style);
  }

  function syncScaleAttribute(){
    const root=document.documentElement;
    const inline=Number.parseFloat(root.style.fontSize||'');
    const stored=readScale();
    const scale=normalizedScale(Number.isFinite(inline)?inline:stored);
    root.dataset.relojaTextScale=String(scale);
    return scale;
  }

  function enhanceScaleControl(){
    const select=document.querySelector('#reloja-a11y-panel select[name="scale"]');
    if(!select)return false;

    let scale=normalizedScale(readScale()??select.value??100);
    if(select.dataset.relojaScaleSteps!=='1'){
      select.innerHTML=SCALE_VALUES.map(value=>`<option value="${value}">${value}%</option>`).join('');
      select.dataset.relojaScaleSteps='1';
      select.addEventListener('change',()=>{
        const next=normalizedScale(select.value);
        writeScale(next);
        document.documentElement.style.fontSize=`${next}%`;
        document.documentElement.dataset.relojaTextScale=String(next);
        select.value=String(next);
      });
    }

    if(String(readScale()??'')!==String(scale))writeScale(scale);
    document.documentElement.style.fontSize=`${scale}%`;
    document.documentElement.dataset.relojaTextScale=String(scale);
    select.value=String(scale);

    if(document.documentElement.dataset.relojaScaleObserver!=='1'){
      document.documentElement.dataset.relojaScaleObserver='1';
      new MutationObserver(()=>{
        const current=syncScaleAttribute();
        const live=document.querySelector('#reloja-a11y-panel select[name="scale"]');
        if(live&&live.value!==String(current))live.value=String(current);
      }).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
    }
    return true;
  }

  function enhance(){
    const nav=document.querySelector('.site-header .nav');
    const trigger=nav?.querySelector('.reloja-a11y-trigger');
    if(!nav||!trigger)return false;

    trigger.innerHTML=`<svg class="reloja-a11y-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="4" r="2.1"></circle><path d="M5 8.5h14"></path><path d="M12 6.5v7"></path><path d="M12 13.5 7.5 21"></path><path d="M12 13.5 16.5 21"></path></svg><span class="reloja-visually-hidden">Acessibilidade</span>`;
    trigger.setAttribute('aria-label','Abrir painel de acessibilidade');
    trigger.title='Acessibilidade (Alt+A)';

    const catalog=nav.querySelector('.nav-cta');
    if(catalog&&!catalog.closest('.nav-actions-cluster')){
      const cluster=document.createElement('div');
      cluster.className='nav-actions-cluster';
      catalog.parentNode.insertBefore(cluster,catalog);
      cluster.appendChild(catalog);
      cluster.appendChild(trigger);
    }else if(catalog?.closest('.nav-actions-cluster')&&!trigger.closest('.nav-actions-cluster')){
      catalog.closest('.nav-actions-cluster').appendChild(trigger);
    }
    return true;
  }

  function install(){
    loadAnalyticsClient();
    injectStyles();
    const ready=enhance()&&enhanceScaleControl();
    if(ready)return;
    const observer=new MutationObserver(()=>{
      const enhanced=enhance();
      const scaled=enhanceScaleControl();
      if(enhanced&&scaled)observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>{enhance();enhanceScaleControl();observer.disconnect()},6000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
