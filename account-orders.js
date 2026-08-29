/* RELÓGIO E CIA — histórico de pedidos na conta do cliente */
(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_auth_token';
  let loading = false;
  let scheduled = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  }

  function brl(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function date(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString('pt-BR'); }
    catch { return ''; }
  }

  function statusLabel(order) {
    if (order?.cancellation?.status === 'refunded') return 'Cancelado pela loja · reembolsado';
    const status = String(order?.payment_status || order?.status || '').toLowerCase();
    if (status === 'approved' || status === 'paid' || status === 'processed') return 'Pagamento aprovado';
    if (status === 'refunded') return 'Reembolsado';
    if (status === 'rejected') return 'Pagamento recusado';
    if (status === 'cancelled' || status === 'canceled' || status === 'cancelled_by_store') return 'Cancelado';
    if (status === 'checkout_error') return 'Falha ao iniciar pagamento';
    return 'Aguardando pagamento';
  }

  function ensureStyle() {
    if (document.getElementById('account-orders-style')) return;
    const style = document.createElement('style');
    style.id = 'account-orders-style';
    style.textContent = `
      .account-orders-panel{margin-top:28px;padding-top:22px;border-top:1px solid rgba(0,0,0,.12)}
      .account-orders-panel h3{margin:0 0 14px;font-family:var(--font-display)}
      .account-order-card{border:1px solid rgba(0,0,0,.14);padding:14px;margin:0 0 10px;background:var(--paper,#fff)}
      .account-order-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.account-order-head strong{font-family:var(--font-mono);font-size:.78rem}
      .account-order-status{font-size:.75rem;font-weight:600}.account-order-items{margin:10px 0 0;padding:0;list-style:none;font-size:.78rem;line-height:1.5;color:var(--ink-soft)}
      .account-order-cancel{margin-top:12px;padding:11px 12px;background:#fff4e8;border-left:3px solid #b44b21;font-size:.78rem;line-height:1.5}
      .account-order-meta{font-size:.72rem;color:var(--ink-soft);margin-top:5px}
    `;
    document.head.appendChild(style);
  }

  function render(orders) {
    ensureStyle();
    const box = document.getElementById('account-box');
    if (!box) return;
    let panel = document.getElementById('account-orders-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'account-orders-panel';
      panel.className = 'account-orders-panel';
      box.appendChild(panel);
    }

    if (!orders.length) {
      panel.innerHTML = '<h3>Meus pedidos</h3><p class="form-note">Você ainda não possui pedidos vinculados a esta conta.</p>';
      return;
    }

    panel.innerHTML = `<h3>Meus pedidos</h3>${orders.map(order => {
      const cancellation = order.cancellation;
      const cancelBox = cancellation?.status === 'refunded'
        ? `<div class="account-order-cancel"><strong>Pedido cancelado pela loja</strong><br>O reembolso integral foi confirmado pelo Mercado Pago.<br><strong>Motivo:</strong> ${esc(cancellation.reason_label || 'Impossibilidade de prosseguir com o pedido')}${cancellation.details ? `<br>${esc(cancellation.details)}` : ''}${cancellation.refunded_at ? `<div class="account-order-meta">Reembolso registrado em ${esc(date(cancellation.refunded_at))}</div>` : ''}</div>`
        : '';
      const items = (order.items || []).map(item => `<li>${Number(item.quantidade || 1)}× ${esc(item.nome)} · ${brl(Number(item.unit_price || 0) * Number(item.quantidade || 1))}</li>`).join('');
      return `<article class="account-order-card"><div class="account-order-head"><div><strong>${esc(order.id)}</strong><div class="account-order-meta">${esc(date(order.created_at))}</div></div><div style="text-align:right"><div class="account-order-status">${esc(statusLabel(order))}</div><strong>${brl(order.total)}</strong></div></div><ul class="account-order-items">${items}</ul>${cancelBox}</article>`;
    }).join('')}`;
  }

  async function loadOrders() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const box = document.getElementById('account-box');
    if (!box) return;
    if (!token) {
      document.getElementById('account-orders-panel')?.remove();
      return;
    }
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('/api/auth/orders', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.status === 401) {
        document.getElementById('account-orders-panel')?.remove();
        return;
      }
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      render(Array.isArray(data.orders) ? data.orders : []);
    } finally {
      loading = false;
    }
  }

  function scheduleLoad() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; loadOrders().catch(() => {}); }, 80);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('account-box');
    if (box) {
      new MutationObserver(mutations => {
        const externalMutation = mutations.some(mutation => !mutation.target.closest?.('#account-orders-panel'));
        if (externalMutation) scheduleLoad();
      }).observe(box, { childList: true, subtree: true });
    }
    setTimeout(scheduleLoad, 250);
    window.addEventListener('storage', event => { if (event.key === TOKEN_KEY) scheduleLoad(); });
  });
})();
