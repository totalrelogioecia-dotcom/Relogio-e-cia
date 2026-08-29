/* RELÓGIO E CIA — envia pedido mediante confirmação para o painel administrativo */
(function () {
  'use strict';
  const TOKEN_KEY = 'reloja_auth_token';
  const dialog = options => window.relojaDialog?.open(options) || Promise.resolve('dismiss');

  function confirmationButton(target) {
    const button = target.closest?.('.product-actions-main .btn-primary');
    if (!button) return null;
    const root = button.closest?.('.product-buy');
    if (!root?.querySelector('.product-availability-box.confirmation')) return null;
    return button;
  }

  document.addEventListener('click', async event => {
    const button = confirmationButton(event.target);
    if (!button) return;
    if (button.dataset.confirmRequestSent === '1') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const productId = Number(new URLSearchParams(location.search).get('id') || 0);
    if (!productId) return;

    const original = button.textContent;
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'Enviando...';

    try {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const response = await fetch('/api/availability-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      if (action === 'primary') window.open(button.href, '_blank', 'noopener');
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
})();
