/* Estados de carregamento e diálogos compartilhados, sem bloquear a página. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function loadingMarkup(label = 'Carregando…') {
    return `<p class="ui-loading" role="status" aria-live="polite"><span class="ui-spinner" aria-hidden="true"></span><span>${escape(label)}</span></p>`;
  }
  function loading(host, label) {
    if (!host) return;
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = loadingMarkup(label);
  }
  function ready(host) { host?.removeAttribute('aria-busy'); }
  function error(host, message, retry) {
    if (!host) return;
    ready(host);
    host.replaceChildren();
    const box = document.createElement('div');
    box.className = 'ui-error';
    box.setAttribute('role', 'alert');
    const text = document.createElement('p');
    text.textContent = message || 'Não foi possível carregar. Tente novamente.';
    box.appendChild(text);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-outline';
      button.textContent = 'Tentar novamente'; button.onclick = retry;
      box.appendChild(button);
    }
    host.appendChild(box);
  }
  async function notice(message) {
    return window.relojaDialog.open({ title: 'Aviso', message: String(message), primaryLabel: 'Entendi' });
  }
  async function confirm(message) {
    return await window.relojaDialog.open({ title: 'Confirmar ação', message: String(message), primaryLabel: 'Confirmar', secondaryLabel: 'Cancelar' }) === 'primary';
  }
  window.RelogioUI = { loadingMarkup, loading, ready, error, notice, confirm };

  // Normaliza mensagens já usadas pelos módulos, inclusive os inseridos depois.
  // Não altera fetch, alert ou confirm globais, nem intercepta resultados de APIs.
  function enhance(root) {
    if (!(root instanceof Element)) return;
    const elements = [root, ...root.querySelectorAll('p,small,strong,span,div,button')];
    for (const element of elements) {
      if (element.matches('button')) {
        const busy = element.disabled && /^(Entrando|Saindo|Salvando|Enviando|Atualizando|Calculando|Buscando|Confirmando)/i.test(element.textContent.trim());
        element.toggleAttribute('data-ui-busy', busy);
        if (busy) element.setAttribute('aria-busy', 'true');
        else if (element.getAttribute('aria-busy') === 'true') element.removeAttribute('aria-busy');
        continue;
      }
      if (element.id === 'stopwatch-data' || element.closest('.ui-loading,.admin-loading-copy') || element.childElementCount) continue;
      if (!/^(Carregando|Calculando|Buscando|Verificando|Preparando)\b/i.test(element.textContent.trim())) continue;
      element.classList.add('ui-loading');
      element.setAttribute('role', 'status'); element.setAttribute('aria-live', 'polite');
      const spinner = document.createElement('span');
      spinner.className = 'ui-spinner'; spinner.setAttribute('aria-hidden', 'true');
      element.prepend(spinner);
    }
  }
  function boot() {
    enhance(document.body);
    const observer = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'attributes') roots.add(record.target);
        if (record.type === 'characterData') roots.add(record.target.parentElement);
        for (const node of record.addedNodes || []) roots.add(node instanceof Element ? node : node.parentElement);
      }
      roots.forEach(enhance);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
