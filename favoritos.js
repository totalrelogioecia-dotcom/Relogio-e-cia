(function(){
  const root=document.getElementById('favorites-grid');
  const count=document.getElementById('favorites-count');
  if(!root)return;

  function firstPhoto(p){return (Array.isArray(p?.fotos)&&p.fotos[0])||p?.foto||''}
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function render(){
    const ids=new Set((typeof obterFavoritos==='function'?obterFavoritos():[]).map(Number));
    const list=(Array.isArray(PRODUTOS)?PRODUTOS:[]).filter(p=>ids.has(Number(p.id))&&p.ativo!==false);
    if(count)count.textContent=list.length===1?'1 produto favoritado':list.length+' produtos favoritados';

    if(!list.length){
      root.innerHTML='<div class="empty-state"><strong>Você ainda não favoritou nenhum produto.</strong><br><span>Use o coração no catálogo para guardar relógios e acessórios aqui.</span><br><br><a class="btn btn-primary" href="produtos.html">Explorar produtos</a></div>';
      return;
    }

    root.innerHTML=list.map(p=>{
      const foto=firstPhoto(p);
      return `<article class="product-card">
        <div class="card-photo">
          <button class="favorite-toggle is-favorite" type="button" data-remove-favorite="${p.id}" aria-label="Remover dos favoritos" aria-pressed="true">♥</button>
          ${foto?`<a href="produto.html?id=${p.id}" style="display:block;width:100%;height:100%;"><img src="${escapeHtml(foto)}" alt="${escapeHtml(p.nome)}" loading="lazy" onerror="tratarErroFoto(this)"></a>`:'<span class="card-photo-placeholder">Foto em breve</span>'}
        </div>
        <div class="card-top"><span class="brand-chip">${escapeHtml(p.marca)}</span><span class="cat-chip">${escapeHtml(p.categoria)}</span></div>
        <h4><a href="produto.html?id=${p.id}" style="color:inherit;text-decoration:none;">${escapeHtml(p.nome)}</a></h4>
        <p class="sku">Ref. ${escapeHtml(p.sku)}</p>
        <p class="price">${money(p.preco)}<small>à vista no PIX</small></p>
        <div class="card-actions">
          <a class="btn btn-outline" href="produto.html?id=${p.id}">Ver detalhes</a>
          <button class="btn btn-primary" type="button" data-add-cart="${p.id}">Adicionar</button>
        </div>
      </article>`;
    }).join('');

    root.querySelectorAll('[data-remove-favorite]').forEach(btn=>btn.addEventListener('click',()=>{
      if(typeof alternarFavorito==='function')alternarFavorito(Number(btn.dataset.removeFavorite));
    }));
    root.querySelectorAll('[data-add-cart]').forEach(btn=>btn.addEventListener('click',()=>{
      adicionarAoCarrinho(Number(btn.dataset.addCart));
      const original=btn.textContent;btn.textContent='Adicionado ✓';setTimeout(()=>btn.textContent=original,1200);
    }));
  }

  window.addEventListener('reloja:favoritos-atualizados',render);
  document.addEventListener('DOMContentLoaded',()=>quandoCatalogoPronto(render));
})();