(() => {
  'use strict';
  if(window.__relogioAccessibilityTriggerEnhanced)return;
  window.__relogioAccessibilityTriggerEnhanced=true;

  function injectStyles(){
    if(document.getElementById('reloja-accessibility-trigger-enhancement-style'))return;
    const style=document.createElement('style');
    style.id='reloja-accessibility-trigger-enhancement-style';
    style.textContent=`
      .nav-actions-cluster{display:flex;align-items:stretch;gap:8px;flex:0 0 auto}.nav-actions-cluster .nav-cta{display:inline-flex;align-items:center;justify-content:center}.nav-actions-cluster .reloja-a11y-trigger{margin:0!important;width:44px!important;height:auto!important;min-height:44px!important;min-width:44px!important;flex:0 0 44px!important}.reloja-a11y-trigger .reloja-a11y-symbol{width:23px;height:23px;display:block;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.reloja-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      @media(max-width:640px){.nav-actions-cluster{margin-left:auto}.nav-actions-cluster .nav-cta{display:none!important}.nav-actions-cluster .reloja-a11y-trigger{width:40px!important;min-width:40px!important;min-height:40px!important}}
    `;
    document.head.appendChild(style);
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
    injectStyles();
    if(enhance())return;
    const observer=new MutationObserver(()=>{if(enhance())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),6000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
