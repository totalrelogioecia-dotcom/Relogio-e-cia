/* CPF do cliente no painel administrativo.
   O documento fica oculto por padrão e só é buscado no servidor ao clicar em Ver. */
(() => {
  const TOKEN_KEY = 'reloja_admin_token';
  const MASKED = '•••.•••.•••-••';

  function formatCpf(value) {
    const n = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (n.length !== 11) return n || 'não informado';
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  }

  function addStyle() {
    if (document.getElementById('admin-cpf-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-cpf-style';
    style.textContent = `
      .order-cpf { display:flex; align-items:center; gap:7px; flex-wrap:nowrap; margin-top:5px; font-size:12px; color:var(--ink-soft,#666); }
      .order-cpf button { appearance:none; -webkit-appearance:none; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; min-height:22px; border:1px solid var(--line-strong,rgba(0,0,0,.32)); background:var(--bg,#fff); color:var(--ink,#111); padding:2px 8px; font:inherit; font-size:11px; line-height:1.2; cursor:pointer; transition:background .16s,color .16s,border-color .16s,box-shadow .16s; }
      .order-cpf button:hover { background:var(--paper,#f7f7f5); border-color:var(--ink,#111); color:var(--ink,#111); }
      .order-cpf button:focus-visible { outline:2px solid var(--red,#e31e24); outline-offset:2px; border-color:var(--red,#e31e24); }
      .order-cpf button:disabled { opacity:.55; cursor:default; background:var(--paper,#f7f7f5); color:var(--ink-soft,#666); }
      .order-cpf-value { font-family:var(--font-mono,monospace); white-space:nowrap; }
    `;
    document.head.appendChild(style);
  }

  async function reveal(orderId, value, button) {
    if (button.dataset.visible === '1') {
      value.textContent = MASKED;
      button.textContent = 'Ver';
      button.dataset.visible = '0';
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      value.textContent = 'sessão expirada';
      button.disabled = true;
      return;
    }

    button.disabled = true;
    button.textContent = '...';
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/customer-document`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o CPF.');

      if (!data.available || !data.number) {
        value.textContent = 'não informado';
        button.textContent = '—';
        button.disabled = true;
        return;
      }

      value.textContent = formatCpf(data.number);
      button.textContent = 'Ocultar';
      button.dataset.visible = '1';
    } catch (error) {
      value.textContent = error.message || 'erro ao consultar';
      button.textContent = 'Tentar novamente';
    } finally {
      if (button.textContent !== '—') button.disabled = false;
    }
  }

  function enhanceOrders() {
    const rows = document.querySelectorAll('#orders-list table tbody tr');
    rows.forEach(row => {
      if (row.querySelector('.order-cpf')) return;
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;

      const orderId = cells[0].querySelector('strong')?.textContent?.trim();
      if (!orderId || !/^PED-/i.test(orderId)) return;

      const line = document.createElement('div');
      line.className = 'order-cpf';

      const label = document.createElement('span');
      label.textContent = 'CPF:';
      const value = document.createElement('span');
      value.className = 'order-cpf-value';
      value.textContent = MASKED;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Ver';
      button.dataset.visible = '0';
      button.addEventListener('click', () => reveal(orderId, value, button));

      line.append(label, value, button);
      cells[1].appendChild(line);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyle();
    enhanceOrders();
    const host = document.getElementById('orders-list');
    if (host) new MutationObserver(enhanceOrders).observe(host, { childList: true, subtree: true });
  });
})();
