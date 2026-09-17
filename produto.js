(function(){
  'use strict';
  const root=document.getElementById('product-page');
  if(!root)return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escAttr=v=>esc(v).replace(/`/g,'&#96;');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const id=Number(new URLSearchParams(location.search).get('id'));

  function fotosDoProduto(p){
    const list=Array.isArray(p?.fotos)?p.fotos.filter(Boolean):[];
    if(list.length)return list;
    return p?.foto?[p.foto]:[];
  }

  function availabilityInfo(p){
    if(!p)return{type:'pronta_entrega',days:0};
    const d=p?.detalhes||{};
    const raw=String(d.disponibilidade||'pronta_entrega').trim().toLowerCase();
    const type=['sob_encomenda','mediante_confirmacao'].includes(raw)?raw:'pronta_entrega';
    return{type,days:type==='sob_encomenda'?Math.max(15,Number(d.prazo_preparacao_dias_uteis)||15):0};
  }

  function specList(p){
    const d=p?.detalhes||{};
    const specs=[
      ['Marca',p.marca],['Referência',p.sku],['Categoria',p.categoria],
      ['Movimento',d.movimento],['Material da caixa',d.caixa_material],['Material da pulseira',d.pulseira_material],
      ['Cor',d.cor],['Dimensões da caixa',d.diametro],['Resistência à água',d.resistencia_agua],
      ['Vidro',d.vidro],['Garantia',d.garantia],['Conteúdo da embalagem',d.conteudo_embalagem]
    ].filter(([,v])=>String(v||'').trim());
    return specs.map(([k,v])=>`<div class="spec-item"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  function render(p,related=[]){
    window.__relogioCurrentProduct=p;
    document.title=`${p.nome} — Relógio e Cia`;
    const meta=document.querySelector('meta[name="description"]');
    if(meta)meta.content=(p.desc||`${p.nome} da ${p.marca}.`).slice(0,155);
    const fotos=fotosDoProduto(p);
    const principal=fotos[0]||'';
    const stock=Number(p.estoque||0);
    const availability=availabilityInfo(p);
    const preorder=availability.type==='sob_encomenda';
    const confirmation=availability.type==='mediante_confirmacao';
    const canBuy=preorder||(!confirmation&&stock>0);
    const pix=Number(p.preco||0)*0.95;
    const minimumInstallment=50;
    const installmentCount=Math.max(1,Math.min(12,Math.floor(Math.round(Number(p.preco||0)*100)/(minimumInstallment*100))));
    const installmentValue=Number(p.preco||0)/installmentCount;
    const whatsapp=`https://wa.me/555196311864?text=${encodeURIComponent((confirmation?'Olá! Quero confirmar a disponibilidade do ':'Olá! Tenho interesse no ')+p.nome+' (Ref. '+p.sku+').')}`;
    const availabilityHtml=preorder
      ? `<div class="product-availability-box preorder"><strong>Sob encomenda</strong><span>Prazo de preparação: ${availability.days} dias úteis. O prazo da transportadora começa depois da preparação.</span></div>`
      : confirmation
        ? `<div class="product-availability-box confirmation"><strong>Pedido mediante confirmação</strong><span>Ao confirmar, a solicitação é enviada ao painel da loja. Para acelerar o atendimento, fale conosco pelo WhatsApp.</span></div>`
        : `<div class="product-stock ${stock>0?'ok':'out'}">${stock>0?`${stock} unidade${stock===1?'':'s'} em estoque`:'Esse produto encontra-se indisponível.'}</div>`;

    root.innerHTML=`
      <nav class="product-breadcrumb" aria-label="Navegação estrutural"><a href="index.html">Início</a><span>—</span><a href="produtos.html">Produtos</a><span>—</span><span>${esc(p.marca)}</span></nav>
      <section class="product-hero">
        <div class="product-gallery">
          <div class="product-thumbs">${fotos.map((f,i)=>`<button class="product-thumb ${i===0?'active':''}" type="button" data-photo="${escAttr(f)}"><img src="${escAttr(f)}" alt="${escAttr(p.nome)} — foto ${i+1}" ${i===0?'fetchpriority="high"':'loading="lazy"'} onerror="this.closest('button').remove()"></button>`).join('')}</div>
          <div class="product-main-photo" id="product-main-photo">${principal?`<img src="${escAttr(principal)}" alt="${escAttr(p.nome)}" fetchpriority="high" decoding="async" onerror="tratarErroFoto(this)">`:'<span class="product-photo-empty">Foto em breve</span>'}</div>
        </div>
        <div class="product-buy">
          <span class="product-brand">${esc(p.marca)}</span>
          <h1>${esc(p.nome)}</h1>
          <div class="product-ref">Ref. ${esc(p.sku)} · ${esc(p.categoria)}</div>
          <div class="product-price">${money(p.preco)}</div>
          <div class="product-pix">${money(pix)} no PIX com 5% de desconto</div>
          <div class="product-installments">ou em até <strong>${installmentCount}x de ${money(installmentValue)}</strong> no cartão</div>
          <div class="product-payment-note">Condições e eventuais juros são informados pelo Mercado Pago no checkout.</div>
          ${availabilityHtml}
          ${!preorder&&!confirmation&&stock<=0?`<form class="stock-alert-box" id="stock-alert-form">
            <label for="stock-alert-email"><strong>Deixe seu e-mail que avisaremos quando chegar.</strong></label>
            <div class="stock-alert-fields"><input id="stock-alert-email" name="email" type="email" autocomplete="email" maxlength="180" placeholder="seuemail@exemplo.com" required><button class="btn btn-primary" type="submit">Avise-me</button></div>
            <p class="stock-alert-privacy">Usaremos este e-mail somente para avisar sobre a reposição deste produto. O aviso não reserva a unidade.</p>
            <div class="stock-alert-message" id="stock-alert-message" aria-live="polite"></div>
          </form>`:''}
          <div class="product-actions-main product-actions-balanced">
            ${confirmation
              ? `<a class="btn btn-primary" href="${whatsapp}" target="_blank" rel="noopener">Confirmar disponibilidade</a>`
              : `<button class="btn btn-primary" type="button" id="product-add" ${canBuy?'':'disabled'}>${canBuy?(preorder?'Adicionar sob encomenda':'Adicionar ao carrinho'):'Indisponível'}</button>`}
            <a class="btn btn-outline" href="${whatsapp}" target="_blank" rel="noopener">Falar no WhatsApp</a>
          </div>
          ${canBuy?`<div class="product-shipping">
            <h3>Calcule a entrega</h3><p>${preorder?`O prazo abaixo considera a preparação de ${availability.days} dias úteis mais o transporte.`:'Veja preços e prazos para o seu CEP antes de adicionar o produto ao pedido.'}</p>
            <div class="product-shipping-form"><input id="product-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" aria-label="CEP"><button class="btn btn-outline" id="product-calc-shipping" type="button">Calcular</button></div>
            <div class="product-shipping-result" id="product-shipping-result"></div>
          </div>`:''}
          <div class="product-trust">
            <div><strong>Produto original</strong><span>Procedência e autenticidade.</span></div>
            <div><strong>Pagamento seguro</strong><span>Processado pelo Mercado Pago.</span></div>
            <div><strong>Trocas e devoluções</strong><span>Solicitação pelo próprio site.</span></div>
            <div><strong>Garantia</strong><span>${esc(p.detalhes?.garantia||'Conforme fabricante')}</span></div>
          </div>
        </div>
      </section>
      <section class="product-content-section"><div class="product-section-label"><p class="eyebrow">Sobre o relógio</p><h2>Detalhes que importam.</h2></div><div class="product-section-body"><p class="product-description">${esc(p.desc||'Informações detalhadas deste produto serão adicionadas em breve.')}</p></div></section>
      <section class="product-content-section"><div class="product-section-label"><p class="eyebrow">Ficha técnica</p><h2>Especificações</h2></div><div class="product-section-body"><dl class="spec-grid">${specList(p)}</dl></div></section>
      <section class="product-content-section"><div class="product-section-label"><p class="eyebrow">Compra segura</p><h2>Originalidade e garantia</h2></div><div class="product-section-body"><div class="originality-strip"><div><strong>Original</strong><span>Produto vendido como original e com procedência.</span></div><div><strong>Nota fiscal</strong><span>Documento fiscal vinculado à venda.</span></div><div><strong>Atendimento</strong><span>Suporte da Relógio e Cia antes e depois da compra.</span></div></div></div></section>
      <section class="related-section"><div class="related-head"><div><p class="eyebrow">Seleção relacionada</p><h2>Você também pode gostar</h2></div><a href="produtos.html?marca=${encodeURIComponent(p.marca)}">Ver todos da marca →</a></div><div class="related-grid">${related.slice(0,4).map(r=>{const f=fotosDoProduto(r)[0];return `<a class="related-card" href="produto.html?id=${r.id}"><div class="related-photo">${f?`<img src="${escAttr(f)}" alt="${escAttr(r.nome)}" loading="lazy" decoding="async" onerror="tratarErroFoto(this)">`:'<span class="product-photo-empty">Foto em breve</span>'}</div><span class="brand-chip">${esc(r.marca)}</span><h3>${esc(r.nome)}</h3><span class="price">${money(r.preco)}</span></a>`}).join('')}</div></section>`;

    root.querySelectorAll('.product-thumb').forEach(btn=>btn.addEventListener('click',()=>{
      const img=document.querySelector('#product-main-photo img');if(img)img.src=btn.dataset.photo;
      root.querySelectorAll('.product-thumb').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    }));
    const add=document.getElementById('product-add');
    if(add&&canBuy)add.onclick=()=>{adicionarAoCarrinho(p.id);const original=preorder?'Adicionar sob encomenda':'Adicionar ao carrinho';add.textContent='Adicionado ✓';setTimeout(()=>add.textContent=original,1300)};
    const alertForm=document.getElementById('stock-alert-form');
    if(alertForm)alertForm.addEventListener('submit',event=>cadastrarAviso(event,p));
    const cep=document.getElementById('product-cep');
    if(cep)cep.addEventListener('input',e=>{let v=e.target.value.replace(/\D/g,'').slice(0,8);e.target.value=v.length>5?v.slice(0,5)+'-'+v.slice(5):v});
    const calc=document.getElementById('product-calc-shipping');
    if(calc)calc.onclick=()=>calcularFrete(p,availability);
  }

  async function cadastrarAviso(event,p){
    event.preventDefault();
    const form=event.currentTarget,input=form.querySelector('#stock-alert-email'),button=form.querySelector('button[type="submit"]'),message=form.querySelector('#stock-alert-message');
    const email=String(input?.value||'').trim();
    if(!email){message.textContent='Informe seu e-mail.';message.className='stock-alert-message error';return}
    const old=button.textContent;button.disabled=true;button.textContent='Cadastrando...';message.textContent='';message.className='stock-alert-message';
    try{
      const response=await fetch('/api/stock-alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:p.id,email})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Não foi possível cadastrar o aviso.');
      message.textContent=data.message||'Pronto. Avisaremos quando este produto voltar ao estoque.';message.className='stock-alert-message success';input.disabled=true;button.textContent='Aviso cadastrado ✓';
    }catch(error){message.textContent=error.message||'Não foi possível cadastrar o aviso.';message.className='stock-alert-message error';button.disabled=false;button.textContent=old}
  }

  async function calcularFrete(p,availability){
    const cep=document.getElementById('product-cep').value.replace(/\D/g,''),box=document.getElementById('product-shipping-result');
    if(cep.length!==8){box.innerHTML='<div class="form-error">Informe um CEP válido com 8 números.</div>';return}
    box.innerHTML='<span class="product-loading">Calculando...</span>';
    try{
      const response=await fetch('/api/shipping/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postal_code:cep,items:[{id:p.id,qtd:1}]})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível calcular o frete.');
      const preorder=availability?.type==='sob_encomenda';
      box.innerHTML=data.quotes.slice(0,4).map(q=>{const transport=q.delivery_time!=null?`${q.delivery_time} dias úteis de transporte`:'Prazo de transporte a confirmar';const deadline=preorder?`${availability.days} dias úteis de preparação + ${transport}`:transport;return `<div class="shipping-option-detail"><div><strong>${esc((q.company_name+' '+q.service_name).trim())}</strong><br><span>${deadline}</span></div><strong>${money(q.price)}</strong></div>`}).join('');
    }catch(e){box.innerHTML=`<div class="form-error">${esc(e.message)}</div>`}
  }

  function fail(message='Produto não encontrado.'){root.innerHTML=`<div class="product-error"><strong>${esc(message)}</strong><br><a href="produtos.html">Voltar ao catálogo</a></div>`}

  async function load(){
    if(!Number.isFinite(id)||id<=0)return fail();
    try{
      const response=await fetch(`/api/product-page/${encodeURIComponent(id)}`,{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Não foi possível carregar este produto.');
      if(!data.product)throw new Error('Produto não encontrado.');
      render(data.product,Array.isArray(data.related)?data.related:[]);
    }catch(error){
      console.error('Falha ao carregar página do produto:',error);
      fail(error.message||'Não foi possível carregar este produto.');
    }
  }

  load();
})();
