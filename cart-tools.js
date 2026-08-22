/* =========================================================
   RELÓGIO E CIA — utilitários do carrinho
   - Modal de confirmação no estilo visual da loja.
   - Toast amigável após remoção.
   - Guarda os itens enviados para cada checkout.
   - Após pagamento aprovado, retira apenas as quantidades compradas.
   ========================================================= */
(() => {
  const CART_KEY = 'reloja_carrinho';
  const CHECKOUT_PREFIX = 'reloja_checkout_';
  const cliquesConfirmados = new WeakSet();
  let modalAtivo = null;
  let toastTimer = null;

  function lerCarrinho() {
    try {
      const itens = JSON.parse(localStorage.getItem(CART_KEY));
      return Array.isArray(itens) ? itens : [];
    } catch (_) {
      return [];
    }
  }

  function salvarCarrinho(itens) {
    if (Array.isArray(itens) && itens.length) {
      localStorage.setItem(CART_KEY, JSON.stringify(itens));
    } else {
      localStorage.removeItem(CART_KEY);
    }
  }

  function chaveCheckout(orderId) {
    return CHECKOUT_PREFIX + String(orderId || '').trim();
  }

  function salvarSnapshotCheckout(orderId) {
    if (!orderId) return;
    const itens = lerCarrinho()
      .map(item => ({
        id: Number(item.id),
        qtd: Math.max(1, Number(item.qtd) || 1)
      }))
      .filter(item => Number.isFinite(item.id));

    if (!itens.length) return;

    try {
      localStorage.setItem(chaveCheckout(orderId), JSON.stringify({
        order_id: String(orderId),
        itens,
        created_at: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function lerSnapshotCheckout(orderId) {
    if (!orderId) return null;
    try {
      const snapshot = JSON.parse(localStorage.getItem(chaveCheckout(orderId)));
      return snapshot && Array.isArray(snapshot.itens) ? snapshot : null;
    } catch (_) {
      return null;
    }
  }

  function descartarCheckout(orderId) {
    if (!orderId) return;
    try { localStorage.removeItem(chaveCheckout(orderId)); }
    catch (_) {}
  }

  function retirarItensComprados(orderId) {
    const snapshot = lerSnapshotCheckout(orderId);
    if (!snapshot) return false;

    let carrinho = lerCarrinho();

    for (const comprado of snapshot.itens) {
      const id = Number(comprado.id);
      const qtdComprada = Math.max(1, Number(comprado.qtd) || 1);
      const indice = carrinho.findIndex(item => Number(item.id) === id);
      if (indice < 0) continue;

      const qtdAtual = Math.max(1, Number(carrinho[indice].qtd) || 1);
      const restante = qtdAtual - qtdComprada;

      if (restante > 0) carrinho[indice].qtd = restante;
      else carrinho.splice(indice, 1);
    }

    salvarCarrinho(carrinho);
    descartarCheckout(orderId);

    try {
      window.dispatchEvent(new CustomEvent('reloja:carrinho-atualizado', {
        detail: { motivo: 'pagamento-aprovado', orderId: String(orderId) }
      }));
    } catch (_) {}

    return true;
  }

  function garantirInterface() {
    if (document.getElementById('reloja-confirm-modal')) return;

    const style = document.createElement('style');
    style.id = 'reloja-cart-tools-style';
    style.textContent = `
      .reloja-confirm-modal{
        position:fixed; inset:0; z-index:10000; display:grid; place-items:center;
        padding:24px; opacity:0; visibility:hidden; transition:opacity .2s ease, visibility .2s ease;
      }
      .reloja-confirm-modal.is-open{ opacity:1; visibility:visible; }
      .reloja-confirm-backdrop{
        position:absolute; inset:0; background:rgba(13,13,13,.58); backdrop-filter:blur(2px);
      }
      .reloja-confirm-panel{
        position:relative; width:min(520px,100%); background:var(--bg,#fff); color:var(--ink,#111);
        border:1px solid var(--ink,#111); box-shadow:0 24px 70px rgba(0,0,0,.22);
        padding:34px 34px 30px; transform:translateY(12px) scale(.985);
        transition:transform .22s ease; overflow:hidden;
      }
      .reloja-confirm-modal.is-open .reloja-confirm-panel{ transform:translateY(0) scale(1); }
      .reloja-confirm-panel::before{
        content:''; position:absolute; top:0; left:0; right:0; height:3px; background:var(--red,#E31E24);
      }
      .reloja-confirm-close{
        position:absolute; top:18px; right:18px; width:34px; height:34px; display:grid; place-items:center;
        border:1px solid var(--line-strong,rgba(17,17,17,.32)); background:transparent; color:var(--ink,#111);
        font:500 20px/1 var(--font-body,Arial,sans-serif); cursor:pointer; transition:background .15s ease,color .15s ease;
      }
      .reloja-confirm-close:hover{ background:var(--ink,#111); color:#fff; }
      .reloja-confirm-kicker{
        display:flex; align-items:center; gap:9px; margin:0 44px 20px 0; color:var(--red,#E31E24);
        font:500 10px/1 var(--font-mono,monospace); letter-spacing:.22em; text-transform:uppercase;
      }
      .reloja-confirm-kicker::before{ content:''; width:18px; height:1px; background:currentColor; }
      .reloja-confirm-icon{
        width:48px; height:48px; display:grid; place-items:center; margin-bottom:20px;
        border:1px solid var(--line-strong,rgba(17,17,17,.32)); background:var(--paper,#F7F7F5);
      }
      .reloja-confirm-icon svg{ width:22px; height:22px; stroke:var(--red,#E31E24); }
      .reloja-confirm-title{
        margin:0 0 10px; font:700 clamp(1.45rem,4vw,1.85rem)/1.12 var(--font-display,Arial,sans-serif);
        letter-spacing:-.02em;
      }
      .reloja-confirm-text{
        margin:0; color:var(--ink-soft,#53555B); font:400 15px/1.65 var(--font-body,Arial,sans-serif);
      }
      .reloja-confirm-product{ color:var(--ink,#111); font-weight:600; }
      .reloja-confirm-note{
        margin:18px 0 0; padding:12px 14px; border-left:2px solid var(--red,#E31E24);
        background:var(--paper,#F7F7F5); color:var(--ink-soft,#53555B);
        font:400 12px/1.5 var(--font-body,Arial,sans-serif);
      }
      .reloja-confirm-actions{ display:flex; gap:10px; justify-content:flex-end; margin-top:26px; }
      .reloja-confirm-btn{
        min-height:44px; padding:0 20px; border:1px solid var(--ink,#111); cursor:pointer;
        font:500 11px/1 var(--font-mono,monospace); letter-spacing:.08em; text-transform:uppercase;
        transition:transform .12s ease,background .15s ease,color .15s ease,border-color .15s ease;
      }
      .reloja-confirm-btn:active{ transform:translateY(1px); }
      .reloja-confirm-cancel{ background:var(--bg,#fff); color:var(--ink,#111); }
      .reloja-confirm-cancel:hover{ background:var(--paper,#F7F7F5); }
      .reloja-confirm-remove{ background:var(--ink,#111); color:#fff; }
      .reloja-confirm-remove:hover{ background:var(--red,#E31E24); border-color:var(--red,#E31E24); }
      .reloja-toast{
        position:fixed; right:24px; bottom:24px; z-index:10001; width:min(390px,calc(100vw - 32px));
        display:flex; align-items:center; gap:13px; padding:15px 17px; background:var(--bg-black,#0D0D0D); color:#fff;
        border-left:3px solid var(--red,#E31E24); box-shadow:0 16px 38px rgba(0,0,0,.2);
        transform:translateY(18px); opacity:0; pointer-events:none; transition:opacity .2s ease,transform .2s ease;
      }
      .reloja-toast.is-visible{ opacity:1; transform:translateY(0); }
      .reloja-toast-mark{
        flex:0 0 28px; width:28px; height:28px; display:grid; place-items:center;
        border:1px solid rgba(255,255,255,.35); font:500 14px/1 var(--font-mono,monospace);
      }
      .reloja-toast-copy{ min-width:0; }
      .reloja-toast-copy strong{ display:block; margin-bottom:2px; font:600 13px/1.3 var(--font-body,Arial,sans-serif); }
      .reloja-toast-copy span{ display:block; color:rgba(255,255,255,.7); font:400 12px/1.4 var(--font-body,Arial,sans-serif); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      body.reloja-modal-open{ overflow:hidden; }
      @media (max-width:560px){
        .reloja-confirm-modal{ padding:14px; align-items:end; }
        .reloja-confirm-panel{ padding:30px 22px 22px; }
        .reloja-confirm-actions{ flex-direction:column-reverse; }
        .reloja-confirm-btn{ width:100%; }
        .reloja-toast{ right:16px; bottom:16px; }
      }
      @media (prefers-reduced-motion:reduce){
        .reloja-confirm-modal,.reloja-confirm-panel,.reloja-toast,.reloja-confirm-btn{ transition:none!important; }
      }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'reloja-confirm-modal';
    modal.className = 'reloja-confirm-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="reloja-confirm-backdrop" data-reloja-cancel></div>
      <section class="reloja-confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="reloja-confirm-title" aria-describedby="reloja-confirm-text">
        <button class="reloja-confirm-close" type="button" aria-label="Fechar" data-reloja-cancel>×</button>
        <p class="reloja-confirm-kicker">Carrinho</p>
        <div class="reloja-confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">
            <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 10v6M14 10v6"/>
          </svg>
        </div>
        <h2 class="reloja-confirm-title" id="reloja-confirm-title">Remover do carrinho?</h2>
        <p class="reloja-confirm-text" id="reloja-confirm-text">Tem certeza de que deseja remover <span class="reloja-confirm-product" id="reloja-confirm-product">este produto</span>?</p>
        <p class="reloja-confirm-note">O item será retirado apenas deste carrinho. Você poderá adicioná-lo novamente pelo catálogo quando quiser.</p>
        <div class="reloja-confirm-actions">
          <button class="reloja-confirm-btn reloja-confirm-cancel" type="button" data-reloja-cancel>Manter no carrinho</button>
          <button class="reloja-confirm-btn reloja-confirm-remove" type="button" id="reloja-confirm-remove">Remover item</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);

    const toast = document.createElement('div');
    toast.id = 'reloja-toast';
    toast.className = 'reloja-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <div class="reloja-toast-mark" aria-hidden="true">✓</div>
      <div class="reloja-toast-copy"><strong>Produto removido</strong><span id="reloja-toast-text">O carrinho foi atualizado.</span></div>
    `;
    document.body.appendChild(toast);
  }

  function mostrarToast(nome) {
    garantirInterface();
    const toast = document.getElementById('reloja-toast');
    const texto = document.getElementById('reloja-toast-text');
    texto.textContent = nome ? `${nome} foi retirado do carrinho.` : 'O item foi retirado do carrinho.';
    clearTimeout(toastTimer);
    toast.classList.remove('is-visible');
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function confirmarRemocao(item) {
    garantirInterface();
    if (modalAtivo) return modalAtivo;

    const modal = document.getElementById('reloja-confirm-modal');
    const nome = document.getElementById('reloja-confirm-product');
    const remover = document.getElementById('reloja-confirm-remove');
    const focoAnterior = document.activeElement;

    nome.textContent = item?.nome ? `“${item.nome}”` : 'este produto';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('reloja-modal-open');

    modalAtivo = new Promise(resolve => {
      let encerrado = false;

      function fechar(resultado) {
        if (encerrado) return;
        encerrado = true;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('reloja-modal-open');
        modal.removeEventListener('click', aoClicar);
        document.removeEventListener('keydown', aoTeclado, true);
        setTimeout(() => {
          try { focoAnterior?.focus?.(); } catch (_) {}
        }, 0);
        modalAtivo = null;
        resolve(resultado);
      }

      function aoClicar(event) {
        if (event.target.closest('[data-reloja-cancel]')) fechar(false);
        else if (event.target.closest('#reloja-confirm-remove')) fechar(true);
      }

      function aoTeclado(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          fechar(false);
          return;
        }
        if (event.key === 'Tab') {
          const focaveis = Array.from(modal.querySelectorAll('button:not([disabled])'));
          if (!focaveis.length) return;
          const primeiro = focaveis[0];
          const ultimo = focaveis[focaveis.length - 1];
          if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault(); ultimo.focus();
          } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault(); primeiro.focus();
          }
        }
      }

      modal.addEventListener('click', aoClicar);
      document.addEventListener('keydown', aoTeclado, true);
      requestAnimationFrame(() => remover.focus());
    });

    return modalAtivo;
  }

  /*
   * Guarda uma fotografia do carrinho assim que o servidor cria o pedido.
   * Isso permite retirar só o que realmente foi comprado, sem apagar produtos
   * que o cliente tenha adicionado em outra aba enquanto pagava.
   */
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await originalFetch(...args);
      const requestUrl = String(args[0]?.url || args[0] || '');

      if (requestUrl.includes('/api/checkout')) {
        try {
          const data = await response.clone().json();
          if (response.ok && data?.order_id) salvarSnapshotCheckout(data.order_id);
        } catch (_) {}
      }

      return response;
    };
  }

  /*
   * Intercepta apenas as ações que realmente removeriam um produto.
   * Depois da confirmação, repete o clique uma única vez e deixa a lógica
   * original da página atualizar quantidades, totais e badge normalmente.
   */
  document.addEventListener('click', async event => {
    const remover = event.target.closest?.('[data-remover]');
    const diminuir = event.target.closest?.('[data-menos]');
    const acao = remover || diminuir;
    if (!acao) return;

    if (cliquesConfirmados.has(acao)) {
      cliquesConfirmados.delete(acao);
      return;
    }

    let id = null;
    if (remover) {
      id = Number(remover.dataset.remover);
    } else {
      id = Number(diminuir.dataset.menos);
      const itemAtual = lerCarrinho().find(item => Number(item.id) === id);
      if (!itemAtual || Number(itemAtual.qtd) > 1) return;
    }

    if (!Number.isFinite(id)) return;
    const item = lerCarrinho().find(produto => Number(produto.id) === id);

    event.preventDefault();
    event.stopImmediatePropagation();

    const confirmou = await confirmarRemocao(item);
    if (!confirmou || !acao.isConnected) return;

    cliquesConfirmados.add(acao);
    acao.click();
    setTimeout(() => mostrarToast(item?.nome || ''), 80);
  }, true);

  window.relojaConfirmarCompra = retirarItensComprados;
  window.relojaDescartarCheckout = descartarCheckout;
  window.relojaConfirmarRemocao = confirmarRemocao;
  window.relojaMostrarAvisoCarrinho = mostrarToast;
})();

