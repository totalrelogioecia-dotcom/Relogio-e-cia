/* =========================================================
   RELÓGIO E CIA — utilitários do carrinho
   - Confirma remoções feitas pelo cliente.
   - Guarda os itens enviados para cada checkout.
   - Após pagamento aprovado, retira apenas as quantidades compradas.
   ========================================================= */
(() => {
  const CART_KEY = 'reloja_carrinho';
  const CHECKOUT_PREFIX = 'reloja_checkout_';

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
   * Usa a fase de captura para perguntar antes dos handlers existentes de
   * "Remover" e do botão "−" quando a quantidade já é 1.
   */
  document.addEventListener('click', event => {
    const remover = event.target.closest?.('[data-remover]');
    const diminuir = event.target.closest?.('[data-menos]');
    if (!remover && !diminuir) return;

    let id = null;
    if (remover) {
      id = Number(remover.dataset.remover);
    } else if (diminuir) {
      id = Number(diminuir.dataset.menos);
      const itemAtual = lerCarrinho().find(item => Number(item.id) === id);
      if (!itemAtual || Number(itemAtual.qtd) > 1) return;
    }

    if (!Number.isFinite(id)) return;
    const item = lerCarrinho().find(produto => Number(produto.id) === id);
    const nome = item?.nome ? ` “${item.nome}”` : '';

    if (!window.confirm(`Tem certeza de que deseja remover${nome} do carrinho?`)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.relojaConfirmarCompra = retirarItensComprados;
  window.relojaDescartarCheckout = descartarCheckout;
})();
