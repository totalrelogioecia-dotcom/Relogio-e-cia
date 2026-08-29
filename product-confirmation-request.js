/* RELÓGIO E CIA — envia pedido mediante confirmação para o painel administrativo */
(function () {
  'use strict';
  const TOKEN_KEY = 'reloja_auth_token';

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
        alert('Entre na sua conta para enviar a solicitação de disponibilidade. Depois, volte a este produto e solicite novamente.');
        location.href = 'conta.html';
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar a solicitação.');

      button.dataset.confirmRequestSent = '1';
      button.removeAttribute('aria-disabled');
      button.textContent = 'Enviado ✓ · abrir WhatsApp';
      alert(data.duplicate
        ? 'Sua solicitação já estava registrada no painel da loja. Você pode usar o WhatsApp para complementar o atendimento.'
        : 'Solicitação enviada para a loja e registrada no painel administrativo. Se quiser, clique novamente para também falar pelo WhatsApp.');
    } catch (error) {
      button.removeAttribute('aria-disabled');
      button.textContent = original;
      alert(error.message || 'Não foi possível registrar a solicitação.');
    }
  }, true);
})();
