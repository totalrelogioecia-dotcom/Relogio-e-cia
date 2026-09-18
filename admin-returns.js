(() => {
  const TOKEN_KEY = 'reloja_admin_token';
  const $ = s => document.querySelector(s);
  let currentProtocol = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function brl(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function statusLabel(value) {
    return ({ recebida:'Recebida', em_analise:'Em análise', aguardando_cliente:'Aguardando cliente', aprovada:'Aprovada', concluida:'Concluída', recusada:'Não aprovada' })[value] || value;
  }

  function typeLabel(value) {
    return ({ troca:'Troca', devolucao:'Devolução', estorno:'Estorno/cancelamento', garantia:'Garantia/defeito', outro:'Outro' })[value] || value;
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

  function addStyles() {
    if ($('#admin-returns-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-returns-style';
    style.textContent = `
      .return-admin-status{display:inline-flex;padding:4px 8px;border:1px solid rgba(0,0,0,.18);font-size:12px}
      .return-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
      .return-admin-grid div{background:#f5f3ee;padding:12px;font-size:13px;line-height:1.5}
      .return-admin-message{white-space:pre-wrap;background:#f8f7f3;border:1px solid rgba(0,0,0,.12);padding:14px;line-height:1.6}
      .return-admin-images{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px}
      .return-admin-images a{display:block;border:1px solid rgba(0,0,0,.14);padding:6px;background:#fff}
      .return-admin-images img{width:100%;height:120px;object-fit:cover;display:block}
      .return-admin-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
      .return-admin-modal.open{display:flex}.return-admin-dialog{background:#fff;width:min(760px,100%);padding:26px;position:relative}
      .return-admin-close{position:absolute;right:15px;top:12px;border:0;background:transparent;font-size:26px;cursor:pointer}
      .return-admin-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.return-admin-actions textarea{grid-column:1/-1;min-height:90px;padding:10px;font:inherit}
      .return-admin-actions select{padding:10px;font:inherit}.return-admin-actions button{min-height:42px}
      @media(max-width:700px){.return-admin-grid,.return-admin-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if ($('#return-admin-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'return-admin-modal';
    modal.className = 'return-admin-modal';
    modal.innerHTML = `<div class="return-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="return-admin-title"><button class="return-admin-close" type="button" aria-label="Fechar">×</button><p class="eyebrow">Pós-venda</p><h2 id="return-admin-title">Solicitação</h2><div id="return-admin-detail"></div><div class="return-admin-actions"><label for="return-admin-status">Status da solicitação</label><select id="return-admin-status"><option value="recebida">Recebida</option><option value="em_analise">Em análise</option><option value="aguardando_cliente">Aguardando cliente</option><option value="aprovada">Aprovada</option><option value="concluida">Concluída</option><option value="recusada">Não aprovada</option></select><button id="return-admin-save" class="btn btn-primary" type="button">Salvar status</button><label for="return-admin-note">Observação para o cliente</label><textarea id="return-admin-note" placeholder="Observação visível ao cliente ao consultar o protocolo"></textarea></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.return-admin-close').onclick = closeModal;
    modal.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeModal(); } });
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    $('#return-admin-save').onclick = saveRequest;
  }

  function closeModal() {
    $('#return-admin-modal')?.classList.remove('open');
    currentProtocol = null;
  }

  async function openRequest(protocol) {
    try {
      ensureModal();
      const data = await api(`/api/admin/return-requests/${encodeURIComponent(protocol)}`);
      const request = data.request;
      const order = data.order;
      currentProtocol = request.protocol;
      $('#return-admin-title').textContent = request.protocol;
      $('#return-admin-status').value = request.status;
      $('#return-admin-note').value = request.admin_note || '';
      const images = (request.attachments || []).map((item, index) => `<a href="${item.data}" target="_blank" rel="noopener"><img src="${item.data}" alt="Anexo ${index + 1}"><small>${esc(item.name || `Anexo ${index + 1}`)}</small></a>`).join('');
      const items = order?.items?.map(item => `${esc(item.nome)} × ${Number(item.quantidade || 1)}`).join('<br>') || 'Pedido não localizado';
      $('#return-admin-detail').innerHTML = `<div class="return-admin-grid"><div><strong>Cliente</strong><br>${esc(request.customer_name)}<br>${esc(request.email)}</div><div><strong>Pedido</strong><br>${esc(request.order_id)}${order ? `<br>${brl(order.total)} · ${esc(order.payment_status || order.status || '')}` : ''}</div><div><strong>Tipo</strong><br>${esc(typeLabel(request.type))}</div><div><strong>Motivo</strong><br>${esc(request.reason)}</div></div><p><strong>Itens do pedido</strong><br>${items}</p><p><strong>Mensagem do cliente</strong></p><div class="return-admin-message">${esc(request.message)}</div>${images ? `<p><strong>Anexos</strong></p><div class="return-admin-images">${images}</div>` : '<p><small>Sem imagens anexadas.</small></p>'}`;
      $('#return-admin-modal').classList.add('open');
    } catch (error) {
      window.RelogioUI.notice(error.message);
    }
  }

  async function saveRequest() {
    if (!currentProtocol) return;
    const button = $('#return-admin-save');
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      await api(`/api/admin/return-requests/${encodeURIComponent(currentProtocol)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: $('#return-admin-status').value, admin_note: $('#return-admin-note').value })
      });
      closeModal();
      await loadRequests();
    } catch (error) {
      window.RelogioUI.notice(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar status';
    }
  }

  async function loadRequests() {
    const host = $('#return-requests-list');
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">Carregando solicitações...</p>';
    try {
      const requests = await api('/api/admin/return-requests');
      host.innerHTML = `<table class="admin-table"><thead><tr><th>Protocolo</th><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>${requests.map(item => `<tr><td><strong>${esc(item.protocol)}</strong></td><td>${esc(item.order_id)}</td><td>${esc(item.customer_name || '')}<br><small>${esc(item.email)}</small></td><td>${esc(typeLabel(item.type))}<br><small>${esc(item.reason)}</small></td><td><span class="return-admin-status">${esc(statusLabel(item.status))}</span></td><td>${new Date(item.created_at).toLocaleString('pt-BR')}</td><td><button data-return-open="${esc(item.protocol)}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhuma solicitação de pós-venda.</td></tr>'}</tbody></table>`;
      host.querySelectorAll('[data-return-open]').forEach(button => button.onclick = () => openRequest(button.dataset.returnOpen));
    } catch (error) {
      host.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
    }
  }

  function setupTabs() {
    const button = document.querySelector('.admin-tabs [data-tab="trocas"]');
    const panel = $('#tab-trocas');
    if (!button || !panel) return;

    button.onclick = () => {
      document.querySelectorAll('.admin-tabs button').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      ['tab-produtos', 'tab-pedidos', 'tab-cupons'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      panel.style.display = 'block';
      loadRequests();
    };

    document.querySelectorAll('.admin-tabs button:not([data-tab="trocas"])').forEach(other => {
      other.addEventListener('click', () => { panel.style.display = 'none'; });
    });
    $('#refresh-return-requests')?.addEventListener('click', loadRequests);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    ensureModal();
    setupTabs();
  });
})();
