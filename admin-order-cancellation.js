/* RELÓGIO E CIA — cancelamento manual de pedido com estorno integral */
(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  const REASONS = [
    ['product_unavailable', 'Produto indisponível'],
    ['supplier_unavailable', 'Fornecedor não conseguiu atender'],
    ['stock_error', 'Problema de estoque'],
    ['delivery_impossible', 'Impossibilidade de entrega'],
    ['operational_issue', 'Imprevisto operacional da loja'],
    ['other', 'Outro motivo']
  ];

  let orders = [];
  let activeOrder = null;
  const originalFetch = window.fetch.bind(window);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  }

  function paid(order) {
    const status = String(order?.status || '').toLowerCase();
    const paymentStatus = String(order?.payment_status || '').toLowerCase();
    return status === 'paid' || paymentStatus === 'approved' || paymentStatus === 'processed';
  }

  function cancellation(order) {
    return order?.store_cancellation || null;
  }

  function ensureStyles() {
    if (document.getElementById('admin-order-cancellation-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-order-cancellation-style';
    style.textContent = `
      .store-cancel-note{margin-top:7px;font-size:.72rem;line-height:1.4;max-width:260px}
      .store-cancel-note.ok{color:#22623b}.store-cancel-note.fail{color:#9d261d}.store-cancel-note.pending{color:#7a5a00}
      .store-cancel-btn{margin-top:6px;white-space:nowrap}
      .store-cancel-modal{position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:10000;display:none;align-items:center;justify-content:center;padding:18px}
      .store-cancel-modal.open{display:flex}.store-cancel-card{width:min(580px,100%);max-height:90vh;overflow:auto;background:#fff;border:1px solid #bbb;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
      .store-cancel-card h3{margin:0 0 8px}.store-cancel-warning{padding:12px 14px;background:#fff4e8;border-left:3px solid #b44b21;margin:16px 0;font-size:.82rem;line-height:1.5}
      .store-cancel-fiscal{padding:10px 12px;background:#fff9df;border:1px solid #e5b800;margin:12px 0;font-size:.8rem;line-height:1.45}
      .store-cancel-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.store-cancel-error{display:none;margin-top:12px;padding:10px 12px;background:#fff0ee;color:#8d2119;font-size:.8rem}
      .store-cancel-confirm{display:flex;gap:8px;align-items:flex-start;margin-top:14px;font-size:.78rem;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    ensureStyles();
    if (document.getElementById('store-cancel-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'store-cancel-modal';
    modal.className = 'store-cancel-modal';
    modal.innerHTML = `
      <div class="store-cancel-card" role="dialog" aria-modal="true" aria-labelledby="store-cancel-title">
        <p class="eyebrow">Ação administrativa</p>
        <h3 id="store-cancel-title">Cancelar pedido e estornar</h3>
        <p id="store-cancel-order" class="admin-muted"></p>
        <div class="store-cancel-warning"><strong>Atenção:</strong> esta ação solicita <strong>reembolso integral</strong> ao Mercado Pago. O pedido só será marcado como cancelado depois que o estorno for confirmado pelo provedor. O estoque não será alterado automaticamente.</div>
        <div id="store-cancel-fiscal" class="store-cancel-fiscal" style="display:none"><strong>Nota fiscal emitida:</strong> o cancelamento da NF-e não é feito por este botão. Trate a parte fiscal separadamente antes/depois conforme orientação do contador.</div>
        <div class="form-field"><label for="store-cancel-reason">Motivo do cancelamento</label><select id="store-cancel-reason">${REASONS.map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
        <div class="form-field"><label for="store-cancel-details">Explicação para o cliente <span style="font-weight:400;opacity:.65">(opcional, obrigatória em “Outro motivo”)</span></label><textarea id="store-cancel-details" rows="3" maxlength="500" placeholder="Ex.: O fornecedor informou que o modelo não estará disponível no prazo necessário."></textarea></div>
        <label class="store-cancel-confirm"><input type="checkbox" id="store-cancel-confirm"><span>Confirmo que a loja não conseguirá cumprir este pedido e quero solicitar o estorno integral ao cliente.</span></label>
        <div id="store-cancel-error" class="store-cancel-error"></div>
        <div class="store-cancel-actions"><button type="button" class="btn btn-outline" id="store-cancel-close">Voltar</button><button type="button" class="btn btn-primary" id="store-cancel-submit" disabled>Cancelar e estornar</button></div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.getElementById('store-cancel-close').addEventListener('click', closeModal);
    document.getElementById('store-cancel-confirm').addEventListener('change', event => {
      document.getElementById('store-cancel-submit').disabled = !event.target.checked;
    });
    document.getElementById('store-cancel-submit').addEventListener('click', submitCancellation);
  }

  function closeModal() {
    const modal = document.getElementById('store-cancel-modal');
    if (modal) modal.classList.remove('open');
    activeOrder = null;
  }

  function openModal(order) {
    ensureModal();
    activeOrder = order;
    const c = cancellation(order);
    document.getElementById('store-cancel-order').innerHTML = `<strong>${esc(order.id)}</strong> · ${esc(order?.payer?.nome || order?.payer?.email || 'Cliente')} · ${Number(order?.total || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`;
    document.getElementById('store-cancel-reason').value = c?.reason_code || 'product_unavailable';
    document.getElementById('store-cancel-details').value = c?.details || '';
    document.getElementById('store-cancel-confirm').checked = false;
    document.getElementById('store-cancel-submit').disabled = true;
    document.getElementById('store-cancel-submit').textContent = c?.status === 'refund_failed' || c?.status === 'refund_pending' ? 'Tentar estorno novamente' : 'Cancelar e estornar';
    const error = document.getElementById('store-cancel-error');
    error.style.display = 'none'; error.textContent = '';
    const invoiceEmitted = String(order?.invoice?.status || '').toLowerCase() === 'emitted';
    document.getElementById('store-cancel-fiscal').style.display = invoiceEmitted ? 'block' : 'none';
    document.getElementById('store-cancel-modal').classList.add('open');
  }

  async function submitCancellation() {
    if (!activeOrder) return;
    const button = document.getElementById('store-cancel-submit');
    const errorBox = document.getElementById('store-cancel-error');
    const reasonCode = document.getElementById('store-cancel-reason').value;
    const details = document.getElementById('store-cancel-details').value.trim();
    if (reasonCode === 'other' && details.length < 5) {
      errorBox.textContent = 'Explique o motivo quando selecionar “Outro motivo”.';
      errorBox.style.display = 'block';
      return;
    }

    button.disabled = true;
    button.textContent = 'Solicitando estorno...';
    errorBox.style.display = 'none';
    try {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const response = await originalFetch(`/api/admin/orders/${encodeURIComponent(activeOrder.id)}/cancel-by-store`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_code: reasonCode, details })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir o cancelamento.');

      closeModal();
      const msg = document.getElementById('admin-msg');
      if (msg) {
        msg.className = 'form-success';
        msg.textContent = 'Pedido cancelado e estorno integral confirmado pelo Mercado Pago.';
        msg.style.display = 'block';
      }
      document.getElementById('refresh-orders')?.click();
    } catch (error) {
      errorBox.textContent = error.message || 'Não foi possível confirmar o estorno.';
      errorBox.style.display = 'block';
      button.disabled = false;
      button.textContent = 'Tentar estorno novamente';
    }
  }

  function cancellationNote(order) {
    const c = cancellation(order);
    if (!c) return '';
    const detail = c.details ? ` · ${esc(c.details)}` : '';
    if (c.status === 'refunded') return `<div class="store-cancel-note ok"><strong>Cancelado pela loja</strong><br>Reembolso integral confirmado · ${esc(c.reason_label || 'Motivo registrado')}${detail}</div>`;
    if (c.status === 'refund_failed') return `<div class="store-cancel-note fail"><strong>Estorno não confirmado</strong><br>${esc(c.last_error || 'Tente novamente.')}</div>`;
    if (c.status === 'refund_pending') return `<div class="store-cancel-note pending"><strong>Estorno pendente</strong><br>A solicitação foi registrada e pode ser retomada com segurança.</div>`;
    return '';
  }

  function decorateOrders() {
    ensureStyles();
    const host = document.getElementById('orders-list');
    if (!host || !Array.isArray(orders) || !orders.length) return;
    host.querySelectorAll('tbody tr').forEach(row => {
      const id = row.querySelector('td:first-child strong')?.textContent?.trim();
      const order = orders.find(item => String(item?.id || '') === id);
      if (!order) return;
      const paymentCell = row.children[3];
      const actions = row.lastElementChild;
      if (!actions) return;

      actions.querySelectorAll('.store-cancel-btn').forEach(node => node.remove());
      paymentCell?.querySelectorAll('.store-cancel-note').forEach(node => node.remove());
      const note = cancellationNote(order);
      if (note && paymentCell) paymentCell.insertAdjacentHTML('beforeend', note);

      const c = cancellation(order);
      const canStart = paid(order) && !c;
      const canRetry = ['refund_failed', 'refund_pending'].includes(String(c?.status || ''));
      if (!canStart && !canRetry) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline store-cancel-btn';
      button.textContent = canRetry ? 'Tentar estorno' : 'Cancelar pedido';
      button.addEventListener('click', () => openModal(order));
      actions.appendChild(button);
    });
  }

  window.fetch = async function (input, init = {}) {
    const response = await originalFetch(input, init);
    const url = String(input?.url || input || '');
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'GET' && /\/api\/admin\/orders(?:\?|$)/.test(url) && response.ok) {
      response.clone().json().then(data => {
        if (Array.isArray(data)) orders = data;
        setTimeout(decorateOrders, 0);
      }).catch(() => {});
    }
    return response;
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensureModal();
    const host = document.getElementById('orders-list');
    if (host) new MutationObserver(() => setTimeout(decorateOrders, 0)).observe(host, { childList: true, subtree: true });
  });
})();
