(() => {
  'use strict';

  let resolver = null;
  let ultimoFoco = null;

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
