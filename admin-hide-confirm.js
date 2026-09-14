(() => {
  'use strict';

  let resolver = null;
  let ultimoFoco = null;
  let actionResolver = null;
  let actionFocus = null;

  function $(sel) { return document.querySelector(sel); }

  function garantirModal() {
    let backdrop = $('#admin-hide-product-modal');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'admin-hide-product-modal';
    backdrop.className = 'admin-modal-backdrop admin-hide-modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div class="admin-modal admin-hide-product-modal" role="dialog" aria-modal="true" aria-labelledby="admin-hide-product-title" aria-describedby="admin-hide-product-copy">
        <button type="button" class="admin-modal-close" data-hide-cancel aria-label="Fechar">×</button>
        <p class="eyebrow">Visibilidade do catálogo</p>
        <h2 id="admin-hide-product-title">Ocultar produto?</h2>
        <p id="admin-hide-product-copy" class="admin-muted">O produto <strong id="admin-hide-product-name"></strong> deixará de aparecer para os clientes.</p>
        <div class="admin-hide-product-note">
          <strong>Ele não será excluído.</strong>
          <span>O cadastro continuará no painel administrativo e poderá ser reativado depois.</span>
        </div>
        <div class="editor-actions admin-hide-product-actions">
          <button type="button" class="btn btn-primary" id="admin-hide-product-confirm">Ocultar produto</button>
          <button type="button" class="btn btn-outline" data-hide-cancel>Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const finalizar = (valor) => {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('admin-modal-open');
      const resolve = resolver;
      resolver = null;
      if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
      ultimoFoco = null;
      if (resolve) resolve(valor);
    };

    backdrop.querySelector('#admin-hide-product-confirm').addEventListener('click', () => finalizar(true));
    backdrop.querySelectorAll('[data-hide-cancel]').forEach(btn => btn.addEventListener('click', () => finalizar(false)));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finalizar(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && backdrop.classList.contains('open')) finalizar(false);
    });

    return backdrop;
  }

  function garantirModalAcao() {
    let backdrop = $('#admin-confirm-action-modal');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'admin-confirm-action-modal';
    backdrop.className = 'admin-modal-backdrop admin-hide-modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div class="admin-modal admin-hide-product-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-action-title" aria-describedby="admin-confirm-action-copy">
        <button type="button" class="admin-modal-close" data-action-cancel aria-label="Fechar">×</button>
        <p class="eyebrow" id="admin-confirm-action-kicker">Confirmação</p>
        <h2 id="admin-confirm-action-title">Confirmar ação?</h2>
        <p id="admin-confirm-action-copy" class="admin-muted"></p>
        <div class="admin-hide-product-note">
          <strong id="admin-confirm-action-note-title"></strong>
          <span id="admin-confirm-action-note-copy"></span>
        </div>
        <div class="editor-actions admin-hide-product-actions">
          <button type="button" class="btn btn-primary" id="admin-confirm-action-confirm">Confirmar</button>
          <button type="button" class="btn btn-outline" data-action-cancel>Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const finalizar = (valor) => {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('admin-modal-open');
      const resolve = actionResolver;
      actionResolver = null;
      if (actionFocus && typeof actionFocus.focus === 'function') actionFocus.focus();
      actionFocus = null;
      if (resolve) resolve(valor);
    };

    backdrop.querySelector('#admin-confirm-action-confirm').addEventListener('click', () => finalizar(true));
    backdrop.querySelectorAll('[data-action-cancel]').forEach(btn => btn.addEventListener('click', () => finalizar(false)));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finalizar(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && backdrop.classList.contains('open')) finalizar(false);
    });

    return backdrop;
  }

  function confirmarOcultar(nome, trigger) {
    const backdrop = garantirModal();
    if (resolver) resolver(false);
    ultimoFoco = trigger || document.activeElement;
    backdrop.querySelector('#admin-hide-product-name').textContent = String(nome || 'este produto');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    window.setTimeout(() => backdrop.querySelector('[data-hide-cancel]')?.focus(), 40);
    return new Promise(resolve => { resolver = resolve; });
  }

  function confirmarAcao(options, trigger) {
    const backdrop = garantirModalAcao();
    if (actionResolver) actionResolver(false);
    actionFocus = trigger || document.activeElement;
    backdrop.querySelector('#admin-confirm-action-kicker').textContent = String(options.kicker || 'Confirmação');
    backdrop.querySelector('#admin-confirm-action-title').textContent = String(options.title || 'Confirmar ação?');
    backdrop.querySelector('#admin-confirm-action-copy').textContent = String(options.message || 'Revise os dados antes de continuar.');
    backdrop.querySelector('#admin-confirm-action-note-title').textContent = String(options.noteTitle || 'Importante');
    backdrop.querySelector('#admin-confirm-action-note-copy').textContent = String(options.note || 'Esta ação será aplicada imediatamente.');
    backdrop.querySelector('#admin-confirm-action-confirm').textContent = String(options.confirmLabel || 'Confirmar');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    window.setTimeout(() => backdrop.querySelector('[data-action-cancel]')?.focus(), 40);
    return new Promise(resolve => { actionResolver = resolve; });
  }

  async function apiConfirmacao(url, options = {}) {
    const token = localStorage.getItem('reloja_admin_token');
    const response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function atualizarConfirmacoes() {
    const refresh = $('#refresh-confirmations');
    if (refresh) refresh.click();
  }

  async function liberarCompra(button) {
    const row = button.closest('[data-confirmation-row]');
    const id = button.getAttribute('data-release-purchase') || row?.getAttribute('data-confirmation-row');
    if (!row || !id) return;
    const quantity = Math.max(1, Math.min(9, Number(row.querySelector('[data-release-quantity]')?.value) || 1));
    const hours = Math.max(1, Math.min(168, Number(row.querySelector('[data-release-hours]')?.value) || 48));
    const cliente = row.querySelector('td:nth-child(3)')?.childNodes?.[0]?.textContent?.trim() || 'este cliente';
    const produto = row.querySelector('td:nth-child(2) strong')?.textContent?.trim() || 'o produto';

    const confirmado = await confirmarAcao({
      kicker: 'Confirmação de disponibilidade',
      title: 'Liberar compra para este cliente?',
      message: `Você está confirmando a disponibilidade de ${produto} para ${cliente}.`,
      noteTitle: 'Liberação individual',
      note: `${quantity} unidade(s) · validade de ${hours} hora(s). Somente a conta deste cliente poderá concluir a compra durante esse período.`,
      confirmLabel: 'Confirmar e liberar'
    }, button);
    if (!confirmado) return;

    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Liberando...';
    try {
      await apiConfirmacao(`/api/admin/availability-requests/${encodeURIComponent(id)}/release-purchase`, {
        method: 'POST',
        body: JSON.stringify({ quantity, hours })
      });
      atualizarConfirmacoes();
    } catch (error) {
      button.disabled = false;
      button.textContent = old;
      if (typeof window.msg === 'function') window.msg(error.message || 'Não foi possível liberar a compra.');
      else window.alert(error.message || 'Não foi possível liberar a compra.');
    }
  }

  async function revogarCompra(button) {
    const row = button.closest('[data-confirmation-row]');
    const id = button.getAttribute('data-revoke-purchase') || row?.getAttribute('data-confirmation-row');
    if (!row || !id) return;

    const confirmado = await confirmarAcao({
      kicker: 'Liberação individual',
      title: 'Revogar esta liberação?',
      message: 'O cliente deixará de ter autorização para comprar este produto com esta confirmação.',
      noteTitle: 'O link será desativado',
      note: 'Se o produto continuar disponível depois, você poderá gerar uma nova liberação para o mesmo cliente.',
      confirmLabel: 'Revogar liberação'
    }, button);
    if (!confirmado) return;

    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Revogando...';
    try {
      await apiConfirmacao(`/api/admin/availability-requests/${encodeURIComponent(id)}/revoke-purchase`, {
        method: 'POST',
        body: '{}'
      });
      atualizarConfirmacoes();
    } catch (error) {
      button.disabled = false;
      button.textContent = old;
      if (typeof window.msg === 'function') window.msg(error.message || 'Não foi possível revogar a liberação.');
      else window.alert(error.message || 'Não foi possível revogar a liberação.');
    }
  }

  async function ocultarProduto(id, nome, trigger) {
    if (!await confirmarOcultar(nome, trigger)) return;

    try {
      const token = localStorage.getItem('reloja_admin_token');
      const response = await fetch(`/api/admin/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível ocultar o produto.');

      if (typeof window.msg === 'function') window.msg('Produto ocultado.', true);
      if (typeof window.loadProducts === 'function') await window.loadProducts();
    } catch (error) {
      if (typeof window.msg === 'function') window.msg(error.message || 'Não foi possível ocultar o produto.');
      else window.alert(error.message || 'Não foi possível ocultar o produto.');
    }
  }

  document.addEventListener('click', (event) => {
    const releaseButton = event.target.closest?.('[data-release-purchase]');
    if (releaseButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      liberarCompra(releaseButton);
      return;
    }

    const revokeButton = event.target.closest?.('[data-revoke-purchase]');
    if (revokeButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      revogarCompra(revokeButton);
      return;
    }

    const button = event.target.closest?.('[data-del]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const id = button.getAttribute('data-del');
    const row = button.closest('tr');
    const nome = row?.querySelector('td strong')?.textContent?.trim() || 'este produto';
    ocultarProduto(id, nome, button);
  }, true);
})();
