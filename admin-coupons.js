(() => {
  const TOKEN_KEY = 'reloja_admin_token';
  const $ = s => document.querySelector(s);
  const token = () => localStorage.getItem(TOKEN_KEY);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function feedback(text, ok = false) {
    const el = $('#coupon-admin-msg');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'form-success' : 'form-error';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  function clearForm() {
    $('#coupon-id').value = '';
    $('#coupon-code').value = '';
    $('#coupon-min').value = '0';
    $('#coupon-max-uses').value = '';
    $('#coupon-per-customer').value = '1';
    $('#coupon-starts').value = '';
    $('#coupon-expires').value = '';
    $('#coupon-active').checked = true;
    $('#coupon-editor-title').textContent = 'Novo cupom de frete grátis';
    $('#coupon-editor').style.display = 'block';
  }

  function isoForInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function edit(coupon) {
    $('#coupon-id').value = coupon.id;
    $('#coupon-code').value = coupon.code || '';
    $('#coupon-min').value = coupon.min_order_value ?? 0;
    $('#coupon-max-uses').value = coupon.max_uses ?? '';
    $('#coupon-per-customer').value = coupon.per_customer_limit ?? '';
    $('#coupon-starts').value = isoForInput(coupon.starts_at);
    $('#coupon-expires').value = isoForInput(coupon.expires_at);
    $('#coupon-active').checked = coupon.active !== false;
    $('#coupon-editor-title').textContent = `Editar cupom ${coupon.code}`;
    $('#coupon-editor').style.display = 'block';
    $('#coupon-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function status(c) {
    const now = Date.now();
    if (!c.active) return '<span class="coupon-status inactive">Inativo</span>';
    if (c.starts_at && new Date(c.starts_at).getTime() > now) return '<span class="coupon-status scheduled">Agendado</span>';
    if (c.expires_at && new Date(c.expires_at).getTime() < now) return '<span class="coupon-status expired">Expirado</span>';
    if (c.max_uses != null && Number(c.uses_count) >= Number(c.max_uses)) return '<span class="coupon-status expired">Esgotado</span>';
    return '<span class="coupon-status active">Ativo</span>';
  }

  async function loadCoupons() {
    try {
      const coupons = await api('/api/admin/coupons');
      $('#coupons-list').innerHTML = `<table class="admin-table coupon-table"><thead><tr><th>Código</th><th>Status</th><th>Compra mínima</th><th>Usos</th><th>Por cliente</th><th>Validade</th><th>Ações</th></tr></thead><tbody>${coupons.map(c => {
        const uses = c.max_uses == null ? `${c.uses_count} / ilimitado` : `${c.uses_count} / ${c.max_uses}`;
        const validity = c.expires_at ? new Date(c.expires_at).toLocaleString('pt-BR') : 'Sem expiração';
        return `<tr><td><strong>${esc(c.code)}</strong><br><small>Frete grátis</small></td><td>${status(c)}</td><td>${brl(c.min_order_value)}</td><td>${uses}</td><td>${c.per_customer_limit == null ? 'Ilimitado' : c.per_customer_limit}</td><td>${esc(validity)}</td><td><div class="admin-actions"><button data-coupon-edit="${c.id}">Editar</button><button data-coupon-delete="${c.id}">Excluir</button></div></td></tr>`;
      }).join('') || '<tr><td colspan="7">Nenhum cupom criado.</td></tr>'}</tbody></table>`;
      coupons.forEach(c => {
        const e = document.querySelector(`[data-coupon-edit="${c.id}"]`);
        const d = document.querySelector(`[data-coupon-delete="${c.id}"]`);
        if (e) e.onclick = () => edit(c);
        if (d) d.onclick = () => remove(c);
      });
    } catch (error) { feedback(error.message); }
  }

  async function save() {
    const id = $('#coupon-id').value;
    const body = {
      code: $('#coupon-code').value,
      active: $('#coupon-active').checked,
      min_order_value: Number($('#coupon-min').value || 0),
      max_uses: $('#coupon-max-uses').value || null,
      per_customer_limit: $('#coupon-per-customer').value || null,
      starts_at: $('#coupon-starts').value ? new Date($('#coupon-starts').value).toISOString() : null,
      expires_at: $('#coupon-expires').value ? new Date($('#coupon-expires').value).toISOString() : null
    };
    try {
      await api(id ? `/api/admin/coupons/${id}` : '/api/admin/coupons', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      $('#coupon-editor').style.display = 'none';
      feedback('Cupom salvo com sucesso.', true);
      await loadCoupons();
    } catch (error) { feedback(error.message); }
  }

  async function remove(coupon) {
    if (!confirm(`Excluir o cupom ${coupon.code}?`)) return;
    try {
      await api(`/api/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      feedback('Cupom excluído.', true);
      await loadCoupons();
    } catch (error) { feedback(error.message); }
  }

  function setupTabs() {
    document.querySelectorAll('.admin-tabs button').forEach(button => {
      button.onclick = () => {
        document.querySelectorAll('.admin-tabs button').forEach(x => x.classList.remove('active'));
        button.classList.add('active');
        const tab = button.dataset.tab;
        $('#tab-produtos').style.display = tab === 'produtos' ? 'block' : 'none';
        $('#tab-pedidos').style.display = tab === 'pedidos' ? 'block' : 'none';
        $('#tab-cupons').style.display = tab === 'cupons' ? 'block' : 'none';
        if (tab === 'pedidos' && typeof loadOrders === 'function') loadOrders();
        if (tab === 'cupons') loadCoupons();
      };
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    $('#novo-cupom')?.addEventListener('click', clearForm);
    $('#salvar-cupom')?.addEventListener('click', save);
    $('#cancelar-cupom')?.addEventListener('click', () => { $('#coupon-editor').style.display = 'none'; });
  });
})();

