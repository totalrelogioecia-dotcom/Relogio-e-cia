/* RELÓGIO E CIA — abas administrativas de confirmações e cancelamentos */
(function () {
  'use strict';
  const TOKEN_KEY = 'reloja_admin_token';
  const $ = selector => document.querySelector(selector);
  const STATUS_LABELS = {
    pending: 'Nova solicitação',
    contacted: 'Cliente contatado',
    confirmed_available: 'Disponibilidade confirmada',
    unavailable: 'Indisponível',
    closed: 'Encerrada'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function brl(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
  }

  async function api(url, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function addStyles() {
    if ($('#admin-extra-tabs-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-extra-tabs-style';
    style.textContent = `
      .confirmation-status{min-width:190px;padding:7px;font:inherit;font-size:.78rem}
      .confirmation-note{width:min(300px,100%);padding:7px;font:inherit;font-size:.76rem}
      .confirmation-contact{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.confirmation-contact a{font-size:.72rem}
      .admin-history-status{display:inline-block;padding:4px 7px;border:1px solid rgba(0,0,0,.18);font-size:.72rem;white-space:nowrap}
      .admin-history-status.ok{background:#edf7ef;color:#245d35}.admin-history-status.fail{background:#fff0ee;color:#8d2119}.admin-history-status.pending{background:#fff9df;color:#6d5500}
      .admin-extra-note{font-size:.76rem;line-height:1.45;max-width:330px;white-space:normal}
      .admin-extra-toolbar-copy{max-width:760px}
      @media(max-width:820px){.confirmation-status,.confirmation-note{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanels() {
    const tabs = $('.admin-tabs');
    const dashboard = $('#dashboard');
    if (!tabs || !dashboard) return false;

    if (!tabs.querySelector('[data-tab="confirmacoes"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tab = 'confirmacoes';
      button.textContent = '📨 Confirmações';
      tabs.appendChild(button);
    }
    if (!tabs.querySelector('[data-tab="cancelamentos-loja"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tab = 'cancelamentos-loja';
      button.textContent = '🚫 Cancelamentos da loja';
      tabs.appendChild(button);
    }

    if (!$('#tab-confirmacoes')) {
      const panel = document.createElement('div');
      panel.id = 'tab-confirmacoes';
      panel.style.display = 'none';
      panel.innerHTML = `<div class="admin-toolbar"><div class="admin-extra-toolbar-copy"><h2>Pedidos mediante confirmação</h2><p class="admin-muted">Solicitações enviadas por clientes para produtos cuja disponibilidade precisa ser confirmada antes do pagamento.</p></div><button id="refresh-confirmations" class="btn btn-outline" type="button">Atualizar</button></div><div id="confirmations-list" class="admin-table-wrap"></div>`;
      dashboard.appendChild(panel);
    }

    if (!$('#tab-cancelamentos-loja')) {
      const panel = document.createElement('div');
      panel.id = 'tab-cancelamentos-loja';
      panel.style.display = 'none';
      panel.innerHTML = `<div class="admin-toolbar"><div class="admin-extra-toolbar-copy"><h2>Cancelamentos feitos pela loja</h2><p class="admin-muted">Histórico dos cancelamentos iniciados pela Relógio e Cia, incluindo estornos confirmados, pendentes ou com falha.</p></div><button id="refresh-store-cancellations" class="btn btn-outline" type="button">Atualizar</button></div><div id="store-cancellations-list" class="admin-table-wrap"></div>`;
      dashboard.appendChild(panel);
    }
    return true;
  }

  function hideExtraPanels(except = '') {
    const confirmations = $('#tab-confirmacoes');
    const cancellations = $('#tab-cancelamentos-loja');
    if (confirmations) confirmations.style.display = except === 'confirmacoes' ? 'block' : 'none';
    if (cancellations) cancellations.style.display = except === 'cancelamentos-loja' ? 'block' : 'none';
  }

  function whatsappLink(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  }

  async function saveConfirmation(id) {
    const row = document.querySelector(`[data-confirmation-row="${CSS.escape(String(id))}"]`);
    if (!row) return;
    const button = row.querySelector('[data-confirmation-save]');
    const status = row.querySelector('[data-confirmation-status]')?.value || 'pending';
    const admin_note = row.querySelector('[data-confirmation-note]')?.value || '';
    const old = button?.textContent || 'Salvar';
    if (button) { button.disabled = true; button.textContent = 'Salvando...'; }
    try {
      await api(`/api/admin/availability-requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, admin_note })
      });
      if (button) button.textContent = 'Salvo ✓';
      setTimeout(() => { if (button) { button.disabled = false; button.textContent = old; } }, 900);
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = old; }
      alert(error.message);
    }
  }

  async function loadConfirmations() {
    const host = $('#confirmations-list');
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">Carregando solicitações...</p>';
    try {
      const requests = await api('/api/admin/availability-requests');
      host.innerHTML = `<table class="admin-table"><thead><tr><th>Protocolo</th><th>Produto</th><th>Cliente</th><th>Status / observação</th><th>Data</th><th>Ação</th></tr></thead><tbody>${requests.map(item => {
        const wa = whatsappLink(item.customer?.telefone);
        const options = Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
        return `<tr data-confirmation-row="${esc(item.id)}"><td><strong>${esc(item.id)}</strong><br><small>${esc(item.source === 'catalog' ? 'Catálogo' : item.source === 'product_page' ? 'Página do produto' : 'Site')}</small></td><td><strong>${esc(item.product?.nome || '')}</strong><br><small>${esc(item.product?.marca || '')} · Ref. ${esc(item.product?.sku || '')}</small><br><small>${brl(item.product?.preco)}</small></td><td>${esc(item.customer?.nome || '')}<br><small>${esc(item.customer?.email || '')}</small><div class="confirmation-contact">${wa ? `<a class="btn btn-outline" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></td><td><select class="confirmation-status" data-confirmation-status>${options}</select><div style="margin-top:6px"><input class="confirmation-note" data-confirmation-note maxlength="500" value="${esc(item.admin_note || '')}" placeholder="Observação interna"></div></td><td>${date(item.created_at)}${item.updated_at && item.updated_at !== item.created_at ? `<br><small>Atualizado: ${date(item.updated_at)}</small>` : ''}</td><td><button type="button" class="btn btn-primary" data-confirmation-save="${esc(item.id)}">Salvar</button></td></tr>`;
      }).join('') || '<tr><td colspan="6">Nenhuma solicitação de confirmação recebida.</td></tr>'}</tbody></table>`;
      host.querySelectorAll('[data-confirmation-save]').forEach(button => {
        button.addEventListener('click', () => saveConfirmation(button.dataset.confirmationSave));
      });
    } catch (error) {
      host.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
    }
  }

  function cancellationStatus(item) {
    const status = String(item?.cancellation?.status || '');
    if (status === 'refunded') return '<span class="admin-history-status ok">Reembolsado</span>';
    if (status === 'refund_failed') return '<span class="admin-history-status fail">Falha no estorno</span>';
    if (status === 'refund_pending') return '<span class="admin-history-status pending">Estorno pendente</span>';
    return `<span class="admin-history-status">${esc(status || 'Registrado')}</span>`;
  }

  async function loadCancellations() {
    const host = $('#store-cancellations-list');
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">Carregando cancelamentos...</p>';
    try {
      const items = await api('/api/admin/store-cancellations');
      host.innerHTML = `<table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Motivo</th><th>Estorno</th><th>Fiscal</th><th>Data</th></tr></thead><tbody>${items.map(item => {
        const c = item.cancellation || {};
        const fiscal = item.invoice?.status === 'emitted' ? `NF-e emitida${item.invoice.number ? ` · ${esc(item.invoice.number)}` : ''}` : item.invoice?.status === 'cancelled' ? 'NF-e cancelada' : 'Sem NF-e emitida registrada';
        const dateValue = c.completed_at || c.refunded_at || c.requested_at || item.updated_at;
        return `<tr><td><strong>${esc(item.order_id)}</strong><br><small>${esc(item.payment_status || item.order_status || '')}</small></td><td>${esc(item.customer?.nome || '')}<br><small>${esc(item.customer?.email || '')}</small></td><td>${brl(item.total)}</td><td><div class="admin-extra-note"><strong>${esc(c.reason_label || 'Motivo registrado')}</strong>${c.details ? `<br>${esc(c.details)}` : ''}</div></td><td>${cancellationStatus(item)}${c.last_error ? `<div class="admin-extra-note" style="margin-top:6px">${esc(c.last_error)}</div>` : ''}</td><td><div class="admin-extra-note">${fiscal}</div></td><td>${date(dateValue)}</td></tr>`;
      }).join('') || '<tr><td colspan="7">Nenhum cancelamento feito pela loja.</td></tr>'}</tbody></table>`;
    } catch (error) {
      host.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
    }
  }

  function setupTabs() {
    if (!ensurePanels()) return;
    const confirmationsButton = document.querySelector('.admin-tabs [data-tab="confirmacoes"]');
    const cancellationsButton = document.querySelector('.admin-tabs [data-tab="cancelamentos-loja"]');

    document.querySelectorAll('.admin-tabs button').forEach(button => {
      if (button === confirmationsButton || button === cancellationsButton) return;
      button.addEventListener('click', () => hideExtraPanels());
    });

    confirmationsButton?.addEventListener('click', () => {
      hideExtraPanels('confirmacoes');
      loadConfirmations();
    });
    cancellationsButton?.addEventListener('click', () => {
      hideExtraPanels('cancelamentos-loja');
      loadCancellations();
    });

    $('#refresh-confirmations')?.addEventListener('click', loadConfirmations);
    $('#refresh-store-cancellations')?.addEventListener('click', loadCancellations);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    ensurePanels();
    // Executa depois dos controladores antigos de abas para complementar, sem substituí-los.
    setTimeout(setupTabs, 0);
  });
})();
