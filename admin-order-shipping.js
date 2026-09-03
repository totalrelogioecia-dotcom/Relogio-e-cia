/* Relógio e Cia — registro de envio/retirada no painel de pedidos */
(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_admin_token';
  let currentOrder = null;
  let scheduled = false;
  let loading = false;

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function paid(order) {
    const status = String(order?.status || '').toLowerCase();
    const payment = String(order?.payment_status || '').toLowerCase();
    return status === 'paid' || ['approved', 'processed'].includes(payment);
  }
  function cancelled(order) { return order?.store_cancellation?.status === 'refunded'; }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o envio.');
    return data;
  }

  function ensureStyles() {
    if (document.getElementById('admin-order-shipping-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-order-shipping-style';
    style.textContent = `
      .order-shipping-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .order-shipping-help{font-size:.78rem;line-height:1.5;color:var(--ink-soft);margin:4px 0 18px}
      .order-shipping-status{display:block;font-size:.68rem;color:var(--ink-soft);margin-top:4px}
      @media(max-width:640px){.order-shipping-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('order-shipping-modal')) return;
    ensureStyles();
    const wrap = document.createElement('div');
    wrap.id = 'order-shipping-modal';
    wrap.className = 'admin-modal-backdrop';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `<div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="order-shipping-title">
      <button type="button" class="admin-modal-close" data-shipping-close aria-label="Fechar">×</button>
      <p class="eyebrow">Entrega</p>
      <h2 id="order-shipping-title">Registrar envio</h2>
      <p class="admin-muted" id="order-shipping-order"></p>
      <div id="order-shipping-error" class="form-error" style="display:none"></div>
      <div class="form-field"><label for="order-shipping-status">Situação</label><select id="order-shipping-status"><option value="shipped">Pedido enviado</option><option value="ready_for_pickup">Pronto para retirada na loja</option></select></div>
      <div id="order-shipping-delivery-fields">
        <div class="order-shipping-grid">
          <div class="form-field"><label for="order-shipping-carrier">Transportadora / serviço</label><input id="order-shipping-carrier" maxlength="120" placeholder="Ex.: Correios, Jadlog"></div>
          <div class="form-field"><label for="order-shipping-code">Código de rastreamento</label><input id="order-shipping-code" maxlength="120" placeholder="Opcional"></div>
        </div>
        <div class="form-field"><label for="order-shipping-url">Link de rastreamento</label><input id="order-shipping-url" type="url" maxlength="1000" placeholder="https://..."></div>
      </div>
      <div class="form-field"><label for="order-shipping-estimate">Previsão informada ao cliente</label><input id="order-shipping-estimate" maxlength="120" placeholder="Ex.: 3 a 5 dias úteis"></div>
      <p class="order-shipping-help">Ao salvar como enviado ou pronto para retirada, o cliente receberá automaticamente um e-mail pelo Resend quando o domínio estiver configurado.</p>
      <div class="editor-actions"><button type="button" id="order-shipping-save" class="btn btn-primary">Salvar e avisar cliente</button><button type="button" data-shipping-close class="btn btn-outline">Fechar</button></div>
    </div>`;
    document.body.appendChild(wrap);

    wrap.querySelectorAll('[data-shipping-close]').forEach(button => button.addEventListener('click', closeModal));
    wrap.addEventListener('click', event => { if (event.target === wrap) closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && wrap.classList.contains('open')) closeModal(); });
    document.getElementById('order-shipping-status').addEventListener('change', syncFields);
    document.getElementById('order-shipping-save').addEventListener('click', save);
  }

  function syncFields() {
    const pickup = document.getElementById('order-shipping-status')?.value === 'ready_for_pickup';
    const fields = document.getElementById('order-shipping-delivery-fields');
    if (fields) fields.style.display = pickup ? 'none' : '';
  }

  function openModal(order) {
    ensureModal();
    currentOrder = order;
    const fulfillment = order.fulfillment || {};
    const pickupOrder = String(order?.shipping?.mode || '').toLowerCase() === 'pickup';
    document.getElementById('order-shipping-order').textContent = `Pedido ${order.id} · ${order.payer?.nome || 'Cliente'}`;
    document.getElementById('order-shipping-status').value = fulfillment.status || (pickupOrder ? 'ready_for_pickup' : 'shipped');
    document.getElementById('order-shipping-carrier').value = fulfillment.carrier || order?.shipping?.company_name || '';
    document.getElementById('order-shipping-code').value = fulfillment.tracking_code || '';
    document.getElementById('order-shipping-url').value = fulfillment.tracking_url || '';
    document.getElementById('order-shipping-estimate').value = fulfillment.estimated_delivery || '';
    document.getElementById('order-shipping-error').style.display = 'none';
    syncFields();
    const modal = document.getElementById('order-shipping-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
  }

  function closeModal() {
    const modal = document.getElementById('order-shipping-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    currentOrder = null;
  }

  async function save() {
    if (!currentOrder) return;
    const errorBox = document.getElementById('order-shipping-error');
    const button = document.getElementById('order-shipping-save');
    const payload = {
      status: document.getElementById('order-shipping-status').value,
      carrier: document.getElementById('order-shipping-carrier').value.trim(),
      tracking_code: document.getElementById('order-shipping-code').value.trim(),
      tracking_url: document.getElementById('order-shipping-url').value.trim(),
      estimated_delivery: document.getElementById('order-shipping-estimate').value.trim()
    };
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      await api(`/api/admin/orders/${encodeURIComponent(currentOrder.id)}/fulfillment`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      closeModal();
      if (typeof window.loadOrders === 'function') await window.loadOrders();
      else document.getElementById('refresh-orders')?.click();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.style.display = 'block';
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar e avisar cliente';
    }
  }

  async function enhanceRows() {
    if (loading || !token()) return;
    const host = document.getElementById('orders-list');
    if (!host || !host.querySelector('tbody')) return;
    loading = true;
    try {
      const orders = await api('/api/admin/orders');
      const map = new Map((Array.isArray(orders) ? orders : []).map(order => [String(order.id), order]));
      host.querySelectorAll('tbody tr').forEach(row => {
        const orderId = String(row.querySelector('td strong')?.textContent || '').trim();
        const order = map.get(orderId);
        const actions = row.querySelector('.admin-actions');
        if (!order || !actions || actions.querySelector('[data-order-shipping]')) return;
        if (!paid(order) || cancelled(order)) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.orderShipping = orderId;
        button.textContent = order.fulfillment ? 'Editar envio' : (String(order?.shipping?.mode || '').toLowerCase() === 'pickup' ? 'Pronto p/ retirada' : 'Registrar envio');
        button.addEventListener('click', () => openModal(order));
        actions.appendChild(button);

        if (order.fulfillment?.status) {
          const note = document.createElement('small');
          note.className = 'order-shipping-status';
          note.textContent = order.fulfillment.status === 'ready_for_pickup' ? 'Retirada avisada' : 'Envio registrado';
          actions.appendChild(note);
        }
      });
    } catch (_) {
      // O painel principal continua funcional mesmo se este complemento falhar.
    } finally {
      loading = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      enhanceRows().catch(() => {});
    }, 120);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureModal();
    const host = document.getElementById('orders-list');
    if (host) new MutationObserver(schedule).observe(host, { childList: true, subtree: true });
    document.getElementById('refresh-orders')?.addEventListener('click', () => setTimeout(schedule, 200));
    document.querySelectorAll('.admin-tabs button').forEach(button => {
      if (button.dataset.tab === 'pedidos') button.addEventListener('click', schedule);
    });
    schedule();
  });
})();
