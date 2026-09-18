(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  let loading = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }

  function statusCard(title, tone, value, detail) {
    return `<article class="store-health-card ${tone}">
      <span class="store-health-dot" aria-hidden="true"></span>
      <div><small>${esc(title)}</small><strong>${esc(value)}</strong><p>${esc(detail)}</p></div>
    </article>`;
  }

  function renderWarnings(data) {
    const box = $('#store-health-warnings');
    if (!box) return;
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    if (!warnings.length) {
      box.className = 'store-health-banner ok';
      box.innerHTML = '<strong>Nenhum alerta estrutural encontrado.</strong><span>Continue fazendo testes reais de pagamento e frete antes da abertura oficial.</span>';
      return;
    }
    box.className = 'store-health-banner warn';
    box.innerHTML = `<strong>${warnings.length} ponto(s) para revisar</strong><ul>${warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function renderCards(data) {
    const box = $('#store-health-cards');
    if (!box) return;
    const services = data?.services || {};
    const catalog = data?.catalog || {};
    const shipping = data?.shipping || {};
    const database = services.database || {};
    const mp = services.mercado_pago || {};
    const melhorEnvio = services.melhor_envio || {};
    const resend = services.resend || {};

    const shippingTone = Number(shipping.blocking_in_stock || 0) > 0
      ? 'error'
      : (Number(shipping.incomplete || 0) > 0 ? 'warn' : 'ok');
    const shippingValue = Number(shipping.blocking_in_stock || 0) > 0
      ? `${shipping.blocking_in_stock} bloqueando venda`
      : (Number(shipping.incomplete || 0) > 0 ? `${shipping.incomplete} pendente(s)` : 'Todos prontos');
    const catalogProblems = Number(catalog.visible_without_photo || 0)
      + Number(catalog.visible_invalid_price || 0)
      + Number(catalog.visible_without_sku || 0);

    box.innerHTML = [
      statusCard('Banco de dados', database.persistent ? 'ok' : 'error', database.persistent ? 'PostgreSQL ativo' : 'Persistência inativa', database.provider || 'não identificado'),
      statusCard('Mercado Pago', mp.configured ? 'ok' : 'error', mp.configured ? 'Configurado' : 'Configuração incompleta', mp.public_url_https ? 'Checkout HTTPS pronto no código' : 'PUBLIC_URL HTTPS pendente'),
      statusCard('Melhor Envio', melhorEnvio.configured && melhorEnvio.environment === 'production' ? 'ok' : (melhorEnvio.configured ? 'warn' : 'error'), melhorEnvio.configured ? (melhorEnvio.environment === 'production' ? 'Produção' : 'SANDBOX') : 'Não configurado', melhorEnvio.connected ? 'Conta conectada' : 'Conta não conectada'),
      statusCard('E-mails', resend.configured ? 'ok' : 'warn', resend.configured ? 'Resend configurado' : 'Configuração pendente', resend.configured ? 'Avisos e mensagens podem ser enviados' : 'Pedidos de aviso continuam salvos'),
      statusCard('Frete dos produtos', shippingTone, shippingValue, `${Number(shipping.ready || 0)} de ${Number(shipping.visible_products || 0)} produto(s) visível(is) prontos`),
      statusCard('Catálogo', catalogProblems ? 'warn' : 'ok', catalogProblems ? `${catalogProblems} cadastro(s) para revisar` : 'Cadastros essenciais OK', `${Number(catalog.visible || 0)} visíveis · ${Number(catalog.hidden || 0)} ocultos · ${Number(catalog.visible_out_of_stock || 0)} sem estoque`)
    ].join('');
  }

  function boxLabel(item) {
    if (item.box_size) return `Caixa ${esc(item.box_size)} (${esc(item.box_source)})`;
    return 'Dimensões manuais';
  }

  function setShippingExpanded(expanded) {
    const table = $('#store-health-shipping-table');
    const toggle = $('#store-health-shipping-toggle');
    if (!table || !toggle) return;
    const hasProducts = toggle.dataset.hasProducts === '1';
    const nextExpanded = Boolean(expanded && hasProducts);
    table.hidden = !nextExpanded;
    toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
    toggle.querySelector('.store-health-toggle-label').textContent = nextExpanded ? 'Ocultar lista' : 'Ver lista';
    toggle.querySelector('.store-health-toggle-icon').textContent = nextExpanded ? '−' : '+';
  }

  function setupShippingCollapse() {
    const section = document.querySelector('.store-health-shipping');
    const title = section?.querySelector('h3');
    const table = $('#store-health-shipping-table');
    if (!section || !title || !table || $('#store-health-shipping-toggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'store-health-shipping-toggle';
    toggle.type = 'button';
    toggle.className = 'store-health-shipping-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'store-health-shipping-table');
    toggle.dataset.hasProducts = '0';
    toggle.innerHTML = '<span>Produtos com frete incompleto</span><span class="store-health-toggle-action"><span class="store-health-toggle-label">Ver lista</span><span class="store-health-toggle-icon" aria-hidden="true">+</span></span>';

    title.textContent = '';
    title.appendChild(toggle);
    table.hidden = true;

    toggle.addEventListener('click', () => {
      if (toggle.dataset.hasProducts !== '1') return;
      setShippingExpanded(toggle.getAttribute('aria-expanded') !== 'true');
    });
  }

  function renderShippingTable(data) {
    const summary = $('#store-health-shipping-summary');
    const table = $('#store-health-shipping-table');
    const toggle = $('#store-health-shipping-toggle');
    if (!summary || !table) return;
    const shipping = data?.shipping || {};
    const products = Array.isArray(shipping.products) ? shipping.products : [];

    if (toggle) {
      toggle.dataset.hasProducts = products.length ? '1' : '0';
      toggle.disabled = !products.length;
    }

    if (!products.length) {
      summary.innerHTML = '<strong>Frete completo.</strong> Todos os produtos visíveis têm os dados mínimos necessários para uma cotação individual.';
      table.innerHTML = '';
      setShippingExpanded(false);
      return;
    }

    summary.innerHTML = `<strong>${Number(shipping.incomplete || products.length)} produto(s) com frete incompleto.</strong> <span class="store-health-critical">${Number(shipping.blocking_in_stock || 0)} têm estoque e podem bloquear uma venda agora.</span>`;
    table.innerHTML = `<table class="admin-table store-health-table">
      <thead><tr><th>Produto</th><th>Estoque</th><th>Embalagem</th><th>Falta cadastrar</th><th>Ação</th></tr></thead>
      <tbody>${products.map(item => `<tr class="${Number(item.stock || 0) > 0 ? 'is-blocking' : 'is-waiting'}">
        <td><strong>${esc(item.name || 'Produto')}</strong><br><small>${esc(item.brand || '')}${item.sku ? ` · ${esc(item.sku)}` : ''}</small></td>
        <td>${Number(item.stock || 0)}${Number(item.stock || 0) <= 0 ? '<br><small>sem estoque</small>' : ''}</td>
        <td>${boxLabel(item)}${item.weight_kg ? `<br><small>${esc(item.weight_kg)} kg</small>` : ''}</td>
        <td><span class="store-health-missing">${(item.missing || []).map(esc).join(', ') || '—'}</span></td>
        <td><button type="button" class="btn btn-outline store-health-edit" data-health-edit="${Number(item.product_id)}">Editar produto</button></td>
      </tr>`).join('')}</tbody>
    </table>`;

    table.querySelectorAll('[data-health-edit]').forEach(button => {
      button.onclick = () => openProduct(Number(button.dataset.healthEdit));
    });
  }

  async function openProduct(productId) {
    const productsTab = document.querySelector('.admin-tabs button[data-tab="produtos"]');
    if (productsTab && !productsTab.classList.contains('active')) productsTab.click();

    let editButton = document.querySelector(`[data-edit="${productId}"]`);
    if (!editButton && typeof window.loadProducts === 'function') {
      await window.loadProducts();
      editButton = document.querySelector(`[data-edit="${productId}"]`);
    }
    if (editButton) {
      editButton.click();
      window.setTimeout(() => $('#product-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return;
    }
    window.RelogioUI.notice('Não foi possível abrir o produto automaticamente. Procure-o na lista de produtos.');
  }

  async function loadStoreHealth() {
    if (loading) return;
    const panel = $('#store-health-panel');
    if (!panel || getComputedStyle($('#dashboard')).display === 'none') return;
    loading = true;
    panel.classList.add('is-loading');
    const refreshed = $('#store-health-refreshed');
    if (refreshed) refreshed.textContent = 'Verificando...';

    try {
      const response = await fetch('/api/admin/store-health', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o status da loja.');
      renderWarnings(data);
      renderCards(data);
      renderShippingTable(data);
      if (refreshed) refreshed.textContent = `Atualizado ${new Date(data.generated_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
      const warnings = $('#store-health-warnings');
      if (warnings) {
        warnings.className = 'store-health-banner error';
        warnings.innerHTML = `<strong>Não foi possível gerar o diagnóstico.</strong><span>${esc(error.message)}</span>`;
      }
      if (refreshed) refreshed.textContent = 'Falha na verificação';
    } finally {
      loading = false;
      panel.classList.remove('is-loading');
    }
  }

  window.loadStoreHealth = loadStoreHealth;

  function setup() {
    setupShippingCollapse();

    const refresh = $('#refresh-store-health');
    if (refresh) refresh.onclick = loadStoreHealth;

    const dashboard = $('#dashboard');
    if (!dashboard) return;
    const observer = new MutationObserver(() => {
      if (getComputedStyle(dashboard).display !== 'none') loadStoreHealth();
    });
    observer.observe(dashboard, { attributes: true, attributeFilter: ['style'] });

    if (getComputedStyle(dashboard).display !== 'none') loadStoreHealth();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
