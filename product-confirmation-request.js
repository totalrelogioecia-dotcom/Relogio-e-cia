/* RELÓGIO E CIA — solicitação e compra individual após confirmação */
(function () {
  'use strict';
  const dialog = options => window.relojaDialog?.open(options) || Promise.resolve('dismiss');
  const productId = Number(new URLSearchParams(location.search).get('id') || 0);
  let activeRelease = null;
  let checkingRelease = false;

  function confirmationButton(target) {
    const button = target.closest?.('.product-actions-main .btn-primary');
    if (!button) return null;
    const root = button.closest?.('.product-buy');
    if (!root?.querySelector('.product-availability-box.confirmation')) return null;
    return button;
  }

  function formattedExpiry(value) {
    const parsed = new Date(value || 0);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('pt-BR');
  }

  async function loadRelease() {
    if (!productId || checkingRelease) return activeRelease;
    checkingRelease = true;
    try {
      const response = await fetch(`/api/availability-requests/mine?product_id=${encodeURIComponent(productId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        activeRelease = null;
        return null;
      }
      const data = await response.json().catch(() => ({}));
      const requestedToken = String(new URLSearchParams(location.search).get('confirmacao') || '').trim();
      const candidates = (Array.isArray(data.items) ? data.items : []).filter(item => item?.purchase?.active);
      activeRelease = requestedToken
        ? candidates.find(item => String(item?.purchase?.token || '') === requestedToken) || null
        : candidates[0] || null;
      return activeRelease;
    } catch {
      activeRelease = null;
      return null;
    } finally {
      checkingRelease = false;
    }
  }

  function addConfirmedProduct(button) {
    if (!activeRelease) return;
    const allowed = Math.max(1, Number(activeRelease?.purchase?.quantity) || 1);
    if (allowed < 1) return;
    if (typeof window.adicionarAoCarrinho !== 'function') {
      dialog({
        kicker: 'Não foi possível adicionar',
        title: 'Atualize a página',
        message: 'A compra está liberada, mas o carrinho ainda não terminou de carregar.',
        primaryLabel: 'Entendi'
      });
      return;
    }
    window.adicionarAoCarrinho(productId);
    const original = button.textContent;
    button.textContent = 'Adicionado ✓';
    setTimeout(() => { button.textContent = original; }, 1300);
  }

  function applyReleasedState() {
    if (!activeRelease?.purchase?.active) return false;
    const buy = document.querySelector('#product-page .product-buy');
    const box = buy?.querySelector('.product-availability-box.confirmation, .product-availability-box.confirmation-released');
    if (!buy || !box) return false;

    const expiry = formattedExpiry(activeRelease.purchase.expires_at);
    box.classList.remove('confirmation');
    box.classList.add('confirmation-released');
    box.innerHTML = `<strong>Disponibilidade confirmada</strong><span>Compra liberada somente para a sua conta${expiry ? ` até ${expiry}` : ''}. Quantidade liberada: ${Math.max(1, Number(activeRelease.purchase.quantity) || 1)} unidade(s).</span>`;

    const actions = buy.querySelector('.product-actions-main');
    const current = actions?.querySelector('.btn-primary');
    if (!actions || !current) return true;
    if (current.dataset.confirmPurchaseReady === '1') return true;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = current.className;
    button.dataset.confirmPurchaseReady = '1';
    button.textContent = 'Adicionar ao carrinho';
    button.addEventListener('click', () => addConfirmedProduct(button));
    current.replaceWith(button);
    return true;
  }

  async function syncReleasedState() {
    if (!productId) return;
    if (!activeRelease) await loadRelease();
    applyReleasedState();
  }

  document.addEventListener('click', async event => {
    const button = confirmationButton(event.target);
    if (!button) return;
    if (button.dataset.confirmRequestSent === '1') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (!productId) return;

    const original = button.textContent;
    const originalHref = button.href;
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'Enviando...';

    try {
      const response = await fetch('/api/availability-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product_id: productId, source: 'product_page' })
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        const action = await dialog({
          kicker: 'Confirmação de disponibilidade',
          title: 'Entre na sua conta',
          message: 'Para registrar a solicitação, precisamos vincular este produto à sua conta.',
          detail: 'Depois do acesso, volte a este produto e solicite a confirmação novamente.',
          primaryLabel: 'Entrar na conta',
          secondaryLabel: 'Continuar no produto'
        });
        if (action === 'primary') location.href = 'conta.html';
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar a solicitação.');

      if (data.request?.purchase?.active) {
        activeRelease = null;
        await loadRelease();
        applyReleasedState();
        await dialog({
          tone: 'success',
          kicker: 'Disponibilidade confirmada',
          title: 'Sua compra já está liberada',
          message: 'Este produto já foi confirmado para a sua conta.',
          detail: 'Você já pode adicioná-lo ao carrinho e finalizar a compra enquanto a liberação estiver válida.',
          primaryLabel: 'Entendi'
        });
        return;
      }

      button.dataset.confirmRequestSent = '1';
      button.removeAttribute('aria-disabled');
      button.textContent = 'Enviado ✓ · abrir WhatsApp';
      const action = await dialog({
        tone: 'success',
        kicker: data.duplicate ? 'Solicitação localizada' : 'Solicitação registrada',
        title: data.duplicate ? 'Solicitação já registrada' : 'Solicitação enviada',
        message: data.duplicate
          ? 'Este pedido de confirmação já está no painel da Relógio e Cia.'
          : 'A Relógio e Cia recebeu seu pedido de confirmação e ele já aparece no painel da loja.',
        detail: 'Se quiser agilizar o atendimento, você também pode falar conosco pelo WhatsApp.',
        primaryLabel: 'Abrir WhatsApp',
        secondaryLabel: 'Continuar no produto'
      });
      if (action === 'primary' && originalHref) window.open(originalHref, '_blank', 'noopener');
    } catch (error) {
      button.removeAttribute('aria-disabled');
      button.textContent = original;
      await dialog({
        kicker: 'Não foi possível enviar',
        title: 'Tente novamente',
        message: error.message || 'Não foi possível registrar a solicitação.',
        detail: 'Se o problema continuar, fale com a loja pelo WhatsApp.',
        primaryLabel: 'Entendi'
      });
    }
  }, true);

  function startObserver() {
    const root = document.getElementById('product-page');
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (activeRelease) applyReleasedState();
      else syncReleasedState();
    });
    observer.observe(root, { childList: true, subtree: true });
    syncReleasedState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  else startObserver();
})();
