(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  async function load(){
    const overview=document.querySelector('#tab-overview .admin-overview')||document.querySelector('#tab-overview');if(!overview||document.getElementById('admin-favorites-section'))return;
    const section=document.createElement('section');section.id='admin-favorites-section';section.className='dashboard-section';section.innerHTML='<div class="dashboard-loading">Carregando favoritos...</div>';overview.appendChild(section);
    try{
      const response=await fetch('/api/admin/favorites/summary',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Não foi possível carregar favoritos.');
      section.innerHTML=`<div class="dashboard-section-head"><div><h3>Mais favoritados</h3><p>Interesse dos clientes medido pelos produtos salvos em suas contas.</p></div><div><strong>${Number(data.total_saves||0)}</strong><br><small>${Number(data.customers_with_favorites||0)} cliente(s) com favoritos</small></div></div>${data.top?.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produto</th><th>Marca / referência</th><th>Preço</th><th>Favoritos</th></tr></thead><tbody>${data.top.map(item=>`<tr><td><strong>${esc(item.nome)}</strong></td><td>${esc(item.marca)}<br><small>${esc(item.sku||'—')}</small></td><td>${money(item.preco)}</td><td><strong>${Number(item.favorites||0)}</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="dashboard-empty">Ainda não há produtos favoritados.</div>'}`;
    }catch(error){section.innerHTML=`<div class="dashboard-error">${esc(error.message)}</div>`;}
  }
  const run=()=>{load();const dashboard=document.getElementById('dashboard');if(dashboard)new MutationObserver(()=>{if(getComputedStyle(dashboard).display!=='none')load();}).observe(dashboard,{attributes:true,attributeFilter:['style']});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
