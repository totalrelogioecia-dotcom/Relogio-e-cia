(function(){
  const root=document.getElementById('product-page');
  if(!root)return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escAttr=v=>esc(v).replace(/`/g,'&#96;');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const params=new URLSearchParams(location.search);
  const id=Number(params.get('id'));

  function fotosDoProduto(p){
    const list=Array.isArray(p?.fotos)?p.fotos.filter(Boolean):[];
    if(list.length)return list;
    return p?.foto?[p.foto]:[];
  }

  function specList(p){
    const d=p?.detalhes||{};
    const specs=[
      ['Marca',p.marca],['Referência',p.sku],['Categoria',p.categoria],
      ['Movimento',d.movimento],['Material da caixa',d.caixa_material],['Material da pulseira',d.pulseira_material],
      ['Cor',d.cor],['Diâmetro da caixa',d.diametro],['Resistência à água',d.resistencia_agua],
      ['Vidro',d.vidro],['Garantia',d.garantia],['Conteúdo da embalagem',d.conteudo_embalagem]
    ].filter(([,v])=>String(v||'').trim());
    return specs.map(([k,v])=>`<div class="spec-item"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  function render(p,all){
    document.title=`${p.nome} — Relógio e Cia`;
    const meta=document.querySelector('meta[name="description"]');
    if(meta)meta.content=(p.desc||`${p.nome} da ${p.marca}.`).slice(0,155);
    const fotos=fotosDoProduto(p);
    const principal=fotos[0]||'';
    const stock=Number(p.estoque||0);
    const pix=p.preco*0.95;
    const related=all.filter(x=>x.id!==p.id&&x.ativo!==false&&(x.marca===p.marca||x.categoria===p.categoria)).slice(0,4);
    root.innerHTML=`
      <nav class="product-breadcrumb" aria-label="Navegação estrutural"><a href="index.html">Início</a><span>—</span><a href="produtos.html">Produtos</a><span>—</span><span>${esc(p.marca)}</span></nav>
      <section class="product-hero">
        <div class="product-gallery">
          <div class="product-thumbs">${fotos.map((f,i)=>`<button class="product-thumb ${i===0?'active':''}" type="button" data-photo="${escAttr(f)}"><img src="${escAttr(f)}" alt="${escAttr(p.nome)} — foto ${i+1}" onerror="this.closest('button').remove()"></button>`).join('')}</div>
          <div class="product-main-photo" id="product-main-photo">${principal?`<img src="${escAttr(principal)}" alt="${escAttr(p.nome)}" onerror="tratarErroFoto(this)">`:'<span class="product-photo-empty">Foto em breve</span>'}</div>
        </div>
        <div class="product-buy">
          <span class="product-brand">${esc(p.marca)}</span>
          <h1>${esc(p.nome)}</h1>
          <div class="product-ref">Ref. ${esc(p.sku)} · ${esc(p.categoria)}</div>
          <div class="product-price">${money(p.preco)}</div>
          <div class="product-pix">${money(pix)} no PIX com 5% de desconto</div>
          <div class="product-payment-note">ou ${money(p.preco)} no cartão, conforme as condições disponíveis no checkout</div>
          <div class="product-stock ${stock>0?'ok':'out'}">${stock>0?`${stock} unidade${stock===1?'':'s'} em estoque`:'Produto indisponível no momento'}</div>
          <div class="product-actions-main">
            <button class="btn btn-primary" type="button" id="product-add" ${stock<=0?'disabled':''}>Adicionar ao carrinho</button>
            <a class="btn btn-outline" href="https://wa.me/555196311864?text=${encodeURIComponent('Olá! Tenho interesse no '+p.nome+' (Ref. '+p.sku+').')}" target="_blank" rel="noopener">Falar com a loja</a>
          </div>
          <div class="product-shipping">
            <h3>Calcule a entrega</h3><p>Veja preços e prazos para o seu CEP antes de adicionar o produto ao pedido.</p>
            <div class="product-shipping-form"><input id="product-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" aria-label="CEP"><button class="btn btn-outline" id="product-calc-shipping" type="button">Calcular</button></div>
            <div class="product-shipping-result" id="product-shipping-result"></div>
          </div>
          <div class="product-trust">
            <div><strong>Produto original</strong><span>Procedência e autenticidade.</span></div>
            <div><strong>Nota fiscal</strong><span>Emitida pela empresa vendedora.</span></div>
            <div><strong>Garantia</strong><span>${esc(p.detalhes?.garantia||'Conforme fabricante')}</span></div>
          </div>
        </div>
      </section>
      <section class="product-content-section"><div class="product-section-label"><p class="eyebrow">Sobre o relógio</p><h2>Detalhes que importam.</h2></div><div class="product-section-body"><p class="product-description">${esc(p.desc||'Informações detalhadas deste produto serão adicionadas em breve.')}</p></div></section>
      <section class="product-content-section"><div class="product-section-label"><p class="eyebrow">Ficha técnica</p><h2>Especificações</h2></div><div class="product-section-body"><dl class="spec-grid">${specList(p)}</dl></div></section>
      <section class="product-content-section"><div class="product-section-label"><p class="eyebrow">Compra segura</p><h2>Originalidade e garantia</h2></div><div class="product-section-body"><div class="originality-strip"><div><strong>Original</strong><span>Produto vendido como original e com procedência.</span></div><div><strong>Nota fiscal</strong><span>Documento fiscal vinculado à venda.</span></div><div><strong>Atendimento</strong><span>Suporte da Relógio e Cia antes e depois da compra.</span></div></div></div></section>
      <section class="related-section"><div class="related-head"><div><p class="eyebrow">Seleção relacionada</p><h2>Você também pode gostar</h2></div><a href="produtos.html?marca=${encodeURIComponent(p.marca)}">Ver todos da marca →</a></div><div class="related-grid">${related.map(r=>{const f=fotosDoProduto(r)[0];return `<a class="related-card" href="produto.html?id=${r.id}"><div class="related-photo">${f?`<img src="${escAttr(f)}" alt="${escAttr(r.nome)}" onerror="tratarErroFoto(this)">`:'<span class="product-photo-empty">Foto em breve</span>'}</div><span class="brand-chip">${esc(r.marca)}</span><h3>${esc(r.nome)}</h3><span class="price">${money(r.preco)}</span></a>`}).join('')}</div></section>`;

    root.querySelectorAll('.product-thumb').forEach(btn=>btn.addEventListener('click',()=>{
      const img=document.querySelector('#product-main-photo img');if(img)img.src=btn.dataset.photo;
      root.querySelectorAll('.product-thumb').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    }));
    const add=document.getElementById('product-add');
    if(add)add.onclick=()=>{adicionarAoCarrinho(p.id);add.textContent='Adicionado ✓';setTimeout(()=>add.textContent='Adicionar ao carrinho',1300)};
    const cep=document.getElementById('product-cep');
    if(cep)cep.addEventListener('input',e=>{let v=e.target.value.replace(/\D/g,'').slice(0,8);e.target.value=v.length>5?v.slice(0,5)+'-'+v.slice(5):v});
    const calc=document.getElementById('product-calc-shipping');
    if(calc)calc.onclick=()=>calcularFrete(p);
  }

  async function calcularFrete(p){
    const cep=document.getElementById('product-cep').value.replace(/\D/g,'');
    const box=document.getElementById('product-shipping-result');
    if(cep.length!==8){box.innerHTML='<div class="form-error">Informe um CEP válido com 8 números.</div>';return}
    box.innerHTML='<span class="product-loading">Calculando...</span>';
    try{
      const response=await fetch('/api/shipping/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postal_code:cep,items:[{id:p.id,qtd:1}]})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Não foi possível calcular o frete.');
      box.innerHTML=data.quotes.slice(0,4).map(q=>`<div class="shipping-option-detail"><div><strong>${esc((q.company_name+' '+q.service_name).trim())}</strong><br><span>${q.delivery_time!=null?q.delivery_time+' dias úteis':'Prazo a confirmar'}</span></div><strong>${money(q.price)}</strong></div>`).join('');
    }catch(e){box.innerHTML=`<div class="form-error">${esc(e.message)}</div>`}
  }

  function fail(){root.innerHTML='<div class="product-error"><strong>Produto não encontrado.</strong><br><a href="produtos.html">Voltar ao catálogo</a></div>'}
  quandoCatalogoPronto(()=>{const p=PRODUTOS.find(x=>Number(x.id)===id&&x.ativo!==false);if(!p)return fail();render(p,PRODUTOS)});
})();
