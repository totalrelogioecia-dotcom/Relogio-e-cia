(() => {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  const OWN_TABS = new Set(['overview', 'reviews', 'audit']);
  const LEGACY_PANELS = ['tab-produtos', 'tab-pedidos', 'tab-cupons', 'tab-trocas', 'tab-confirmacoes', 'tab-cancelamentos-loja'];
  const $ = selector => document.querySelector(selector);
  let overviewLoaded = false;
  let dashboardLoading = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function number(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
  }

  function stars(value) {
    const rating = Math.max(0, Math.min(5, Number(value) || 0));
    return `${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}`;
  }

  async function api(url, options = {}) {
    const marker = localStorage.getItem(TOKEN_KEY) || '';
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${marker}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function setActive(tab) {
    document.querySelectorAll('.admin-tabs button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tab);
    });
  }

  function hideOwnPanels(except = '') {
    for (const tab of OWN_TABS) {
      const panel = document.getElementById(`tab-${tab}`);
      if (panel) panel.style.display = tab === except ? 'block' : 'none';
    }
  }

  function hideLegacyPanels() {
    LEGACY_PANELS.forEach(id => {
      const panel = document.getElementById(id);
      if (panel) panel.style.display = 'none';
    });
  }

  function showOwnTab(tab) {
    if (!OWN_TABS.has(tab)) return;
    hideLegacyPanels();
    hideOwnPanels(tab);
    setActive(tab);
    if (tab === 'overview') loadDashboard();
    if (tab === 'reviews') loadReviews();
    if (tab === 'audit') loadAudit();
  }

  function openTarget(tab) {
    const button = document.querySelector(`.admin-tabs button[data-tab="${CSS.escape(String(tab))}"]`);
    if (button) button.click();
  }

  function renderKpis(kpis) {
    const host = $('#dashboard-kpis');
    if (!host) return;
    const cards = [
      ['Faturamento aprovado', money(kpis.gross_revenue), 'Pedidos pagos e não cancelados, incluindo frete.'],
      ['Pedidos pagos', number(kpis.paid_orders), `${number(kpis.total_orders)} pedido(s) registrados no total.`],
      ['Ticket médio', money(kpis.average_ticket), 'Média dos pedidos pagos e não cancelados.'],
      ['Itens vendidos', number(kpis.items_sold), 'Quantidade de itens em pedidos aprovados.']
    ];
    host.innerHTML = cards.map(([label, value, note]) => `<article class="dashboard-kpi"><span class="dashboard-kpi-label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  }

  function renderAlerts(alerts) {
    const host = $('#dashboard-alerts');
    if (!host) return;
    host.innerHTML = alerts.map(alert => `<button type="button" class="dashboard-alert ${alert.severity === 'ok' ? 'ok' : 'warning'}" data-dashboard-target="${esc(alert.target)}"><strong>${number(alert.count)}</strong><span>${esc(alert.label)}</span><small>${alert.count ? 'Abrir área →' : 'Tudo em ordem'}</small></button>`).join('');
    host.querySelectorAll('[data-dashboard-target]').forEach(button => {
      button.addEventListener('click', () => openTarget(button.dataset.dashboardTarget));
    });
  }

  function renderRecentOrders(orders) {
    const host = $('#dashboard-recent-orders');
    if (!host) return;
    if (!orders.length) {
      host.innerHTML = '<div class="dashboard-empty">Nenhum pedido registrado.</div>';
      return;
    }
    host.innerHTML = `<div class="admin-table-wrap"><table class="dashboard-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th>Data</th></tr></thead><tbody>${orders.map(order => {
      const paid = ['paid', 'approved', 'processed'].includes(String(order.payment_status || order.status || '').toLowerCase());
      return `<tr><td><strong>${esc(order.id)}</strong></td><td>${esc(order.customer_name)}<br><small>${esc(order.customer_email)}</small></td><td>${money(order.total)}</td><td><span class="dashboard-status ${paid ? 'ok' : 'warn'}">${esc(order.payment_status || order.status || '—')}</span></td><td>${date(order.created_at)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderTopProducts(items) {
    const host = $('#dashboard-top-products');
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<div class="dashboard-empty">Ainda não há vendas aprovadas para ranquear produtos.</div>';
      return;
    }
    host.innerHTML = `<table class="dashboard-table"><thead><tr><th>Produto</th><th>Marca</th><th>Unidades</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.brand)}</td><td>${number(item.quantity)}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderBrands(items) {
    const host = $('#dashboard-brands');
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<div class="dashboard-empty">Ainda não há vendas aprovadas por marca.</div>';
      return;
    }
    host.innerHTML = `<table class="dashboard-table"><thead><tr><th>Marca</th><th>Unidades vendidas</th></tr></thead><tbody>${items.slice(0, 8).map(item => `<tr><td><strong>${esc(item.brand)}</strong></td><td>${number(item.quantity)}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderLowStock(items, kpis) {
    const host = $('#dashboard-low-stock');
    if (!host) return;
    const zero = Number(kpis.out_of_stock_products || 0);
    const header = `<p class="dashboard-note"><strong>${number(kpis.total_stock_units)}</strong> unidade(s) em estoque nos produtos visíveis. <strong>${zero}</strong> produto(s) visível(is) estão zerados.</p>`;
    if (!items.length) {
      host.innerHTML = `${header}<div class="dashboard-empty">Nenhum produto com estoque entre 1 e 2 unidades.</div>`;
      return;
    }
    host.innerHTML = `${header}<table class="dashboard-table"><thead><tr><th>Produto</th><th>Ref.</th><th>Estoque</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${esc(item.nome)}</strong><br><small>${esc(item.marca)}</small></td><td>${esc(item.sku || '—')}</td><td><span class="dashboard-stock low">${number(item.estoque)}</span></td></tr>`).join('')}</tbody></table>`;
  }

  function renderOperations(kpis) {
    const host = $('#dashboard-operation-summary');
    if (!host) return;
    const rows = [
      ['Pagamentos aguardando definição', kpis.pending_payment_orders, kpis.pending_payment_orders ? 'warn' : 'ok'],
      ['Pedidos cancelados/reembolsados', kpis.cancelled_orders, kpis.cancelled_orders ? 'warn' : 'ok'],
      ['Produtos ativos', kpis.active_products, 'ok'],
      ['Produtos com estoque baixo', kpis.low_stock_products, kpis.low_stock_products ? 'warn' : 'ok'],
      ['Avaliações publicadas', kpis.approved_reviews, 'ok']
    ];
    host.innerHTML = `<table class="dashboard-table"><tbody>${rows.map(([label, value, status]) => `<tr><td>${esc(label)}</td><td><span class="dashboard-status ${status}">${number(value)}</span></td></tr>`).join('')}</tbody></table>`;
  }

  async function loadDashboard(force = false) {
    if (dashboardLoading || (overviewLoaded && !force)) return;
    dashboardLoading = true;
    const refresh = $('#refresh-admin-dashboard');
    if (refresh) { refresh.disabled = true; refresh.textContent = 'Atualizando...'; }
    try {
      const data = await api('/api/admin/dashboard-summary');
      renderKpis(data.kpis || {});
      renderAlerts(data.alerts || []);
      renderRecentOrders(data.recent_orders || []);
      renderTopProducts(data.top_products || []);
      renderBrands(data.sales_by_brand || []);
      renderLowStock(data.low_stock || [], data.kpis || {});
      renderOperations(data.kpis || {});
      const refreshed = $('#dashboard-refreshed');
      if (refreshed) refreshed.textContent = `Atualizado em ${date(data.generated_at)}`;
      overviewLoaded = true;
    } catch (error) {
      const host = $('#dashboard-kpis');
      if (host) host.innerHTML = `<div class="dashboard-error">${esc(error.message)}</div>`;
    } finally {
      dashboardLoading = false;
      if (refresh) { refresh.disabled = false; refresh.textContent = 'Atualizar painel'; }
    }
  }

  function reviewStatusLabel(status) {
    return ({ pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada' })[status] || status || '—';
  }

  async function moderateReview(id, status, button) {
    const row = button.closest('[data-review-row]');
    const note = row?.querySelector('[data-review-note]')?.value || '';
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      await api(`/api/admin/reviews/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, moderation_note: note })
      });
      overviewLoaded = false;
      await loadReviews();
    } catch (error) {
      window.RelogioUI.notice(error.message);
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function loadReviews() {
    const host = $('#admin-reviews-list');
    if (!host) return;
    const filter = $('#admin-review-filter')?.value || '';
    host.innerHTML = '<div class="dashboard-loading">Carregando avaliações...</div>';
    try {
      const reviews = await api(`/api/admin/reviews${filter ? `?status=${encodeURIComponent(filter)}` : ''}`);
      if (!reviews.length) {
        host.innerHTML = '<div class="dashboard-empty">Nenhuma avaliação encontrada neste filtro.</div>';
        return;
      }
      host.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Avaliação</th><th>Produto / pedido</th><th>Cliente</th><th>Comentário</th><th>Status</th><th>Moderação</th></tr></thead><tbody>${reviews.map(review => `<tr data-review-row="${esc(review.id)}"><td><span class="review-stars" aria-label="${number(review.rating)} de 5 estrelas">${stars(review.rating)}</span><br><small>${date(review.created_at)}</small></td><td><strong>${esc(review.product_name || `Produto ${review.product_id}`)}</strong><br><small>Ref. ${esc(review.product_sku || '—')} · Pedido ${esc(review.order_id || '—')}</small></td><td>${esc(review.author_name || 'Cliente')}<br><small>${esc(review.customer_email || '')}</small><br><small>Compra verificada</small></td><td><div class="review-comment">${review.title ? `<strong>${esc(review.title)}</strong>` : ''}${esc(review.comment || '')}</div></td><td><span class="review-status ${esc(review.status)}">${esc(reviewStatusLabel(review.status))}</span>${review.moderated_at ? `<br><small>${date(review.moderated_at)}</small>` : ''}</td><td><div class="review-moderation"><textarea data-review-note maxlength="500" placeholder="Observação interna de moderação">${esc(review.moderation_note || '')}</textarea><div class="review-moderation-actions"><button type="button" data-review-action="approved" data-review-id="${esc(review.id)}">Aprovar</button><button type="button" data-review-action="rejected" data-review-id="${esc(review.id)}">Rejeitar</button></div></div></td></tr>`).join('')}</tbody></table></div>`;
      host.querySelectorAll('[data-review-action]').forEach(button => {
        button.addEventListener('click', () => moderateReview(button.dataset.reviewId, button.dataset.reviewAction, button));
      });
    } catch (error) {
      host.innerHTML = `<div class="dashboard-error">${esc(error.message)}</div>`;
    }
  }

  async function loadAudit() {
    const host = $('#admin-audit-list');
    if (!host) return;
    host.innerHTML = '<div class="dashboard-loading">Carregando histórico...</div>';
    try {
      const data = await api('/api/admin/audit?limit=150');
      const entries = data.entries || [];
      if (!entries.length) {
        host.innerHTML = '<div class="dashboard-empty">O histórico começará a aparecer conforme novas ações administrativas forem realizadas.</div>';
        return;
      }
      host.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Data</th><th>Ação</th><th>Recurso</th><th>Administrador</th><th>Resultado</th><th>Origem técnica</th></tr></thead><tbody>${entries.map(entry => `<tr><td>${date(entry.created_at)}</td><td><span class="audit-action">${esc(entry.action)}</span><br><small>${esc(entry.method || '')} ${esc(entry.path || '')}</small></td><td>${esc(entry.entity || '—')}${entry.entity_id ? `<br><small>${esc(entry.entity_id)}</small>` : ''}</td><td><div class="audit-actor">${esc(entry.actor || 'administrador')}</div></td><td><span class="dashboard-status ${entry.success ? 'ok' : 'fail'}">${entry.success ? 'Sucesso' : 'Falha'}${entry.status_code ? ` · ${number(entry.status_code)}` : ''}</span></td><td><div class="audit-origin">${entry.ip ? `IP: ${esc(entry.ip)}` : 'IP indisponível'}${entry.user_agent ? `<br>${esc(entry.user_agent)}` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
    } catch (error) {
      host.innerHTML = `<div class="dashboard-error">${esc(error.message)}</div>`;
    }
  }

  function activateOverviewWhenVisible() {
    const dashboard = $('#dashboard');
    if (!dashboard || dashboard.style.display === 'none') return;
    const active = document.querySelector('.admin-tabs button.active')?.dataset?.tab;
    if (!active || active === 'produtos' || active === 'overview') showOwnTab('overview');
  }

  window.addEventListener('reloja:admin-session', event => { overviewLoaded = false; if (event.detail.authenticated) loadDashboard(true); });

  document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelector('.admin-tabs');
    if (tabs) {
      tabs.addEventListener('click', event => {
        const button = event.target.closest('button[data-tab]');
        if (!button) return;
        const tab = String(button.dataset.tab || '');
        if (OWN_TABS.has(tab)) {
          showOwnTab(tab);
        } else {
          hideOwnPanels();
        }
      });
    }

    $('#refresh-admin-dashboard')?.addEventListener('click', () => loadDashboard(true));
    $('#admin-review-filter')?.addEventListener('change', loadReviews);
    $('#refresh-admin-reviews')?.addEventListener('click', loadReviews);
    $('#refresh-admin-audit')?.addEventListener('click', loadAudit);

    const dashboard = $('#dashboard');
    if (dashboard) {
      const observer = new MutationObserver(activateOverviewWhenVisible);
      observer.observe(dashboard, { attributes: true, attributeFilter: ['style'] });
    }
    activateOverviewWhenVisible();
  });

  window.relogioAdminDashboard = {
    refresh() { overviewLoaded = false; return loadDashboard(true); },
    open: openTarget
  };
})();
