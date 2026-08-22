/* =========================================================
   RELÓGIO E CIA — sincronização de pedidos pendentes
   Ao abrir/atualizar Pedidos, consulta o Mercado Pago pelo endpoint
   público do próprio servidor e grava status/status_detail no pedido.
   ========================================================= */
(function () {
  const TOKEN_KEY = 'reloja_admin_token';
  let running = false;
  let lastSignature = '';
  let lastRun = 0;
  let refreshScheduled = false;

  async function adminOrders() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return [];
    const response = await fetch('/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  }

  function isPending(order) {
    const status = String(order?.status || '').toLowerCase();
    const payment = String(order?.payment_status || '').toLowerCase();
    return status === 'pending' || payment === 'pending' || (!status && !payment);
  }

  async function syncOrder(order) {
    const response = await fetch(`/api/order/${encodeURIComponent(order.id)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  async function syncPending() {
    if (running) return;
    const now = Date.now();
    const orders = await adminOrders();
    const pending = orders.filter(isPending);
    if (!pending.length) return;

    const signature = pending.map(o => `${o.id}:${o.updated_at || o.created_at || ''}`).join('|');
    if (signature === lastSignature && now - lastRun < 30000) return;

    running = true;
    lastSignature = signature;
    lastRun = now;
    let changed = false;

    try {
      // Processa em sequência para não disparar várias consultas simultâneas no Mercado Pago.
      for (const order of pending.slice(0, 25)) {
        const beforeStatus = String(order.payment_status || order.status || '').toLowerCase();
        const result = await syncOrder(order);
        const afterStatus = String(result?.payment_status || result?.status || '').toLowerCase();
        const gotDetail = Boolean(result?.payment_detail?.status_detail || result?.payment_id);
        if (result && (afterStatus !== beforeStatus || gotDetail)) changed = true;
      }
    } catch (_) {
      // O painel continua funcionando mesmo se uma sincronização pontual falhar.
    } finally {
      running = false;
    }

    if (changed && typeof window.loadOrders === 'function' && !refreshScheduled) {
      refreshScheduled = true;
      setTimeout(async () => {
        try { await window.loadOrders(); }
        catch (_) {}
        refreshScheduled = false;
      }, 120);
    }
  }

  function schedule() {
    setTimeout(() => syncPending().catch(() => {}), 180);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.getElementById('orders-list');
    if (host) new MutationObserver(schedule).observe(host, { childList: true, subtree: true });

    const refresh = document.getElementById('refresh-orders');
    if (refresh) refresh.addEventListener('click', () => setTimeout(schedule, 250));

    document.querySelectorAll('.admin-tabs button').forEach(button => {
      if (button.dataset.tab === 'pedidos') button.addEventListener('click', schedule);
    });
  });
})();

