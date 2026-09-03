/* Arquivos fiscais da NF-e: DANFE em PDF e XML.
   Os arquivos ficam em armazenamento separado do pedido e nunca são expostos como recurso público. */
(() => {
  const TOKEN_KEY = 'reloja_admin_token';
  const LIMITS = { danfe_pdf: 4 * 1024 * 1024, nfe_xml: 1024 * 1024 };
  let currentOrderId = '';
  let currentInvoiceStatus = 'pending';

  const $ = selector => document.querySelector(selector);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} MB`;
  }

  async function request(url, options = {}) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}`, Accept: 'application/json' };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function addStyles() {
    if ($('#admin-invoice-files-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-invoice-files-style';
    style.textContent = `
      .invoice-files-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}
      .invoice-file-box{border:1px solid var(--line-strong,rgba(0,0,0,.25));padding:14px;background:var(--bg-soft,#f7f6f2)}
      .invoice-file-box label{display:block;font-weight:700;margin-bottom:7px}
      .invoice-file-box input[type="file"]{width:100%;font-size:12px}
      .invoice-file-limit{display:block;margin-top:6px;font-size:11px;color:var(--ink-soft,#666)}
      .invoice-files-current{margin:14px 0;padding:13px 14px;border:1px solid var(--line,rgba(0,0,0,.15))}
      .invoice-files-current h3{font-size:14px;margin:0 0 9px}
      .invoice-file-current-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--line,rgba(0,0,0,.12));font-size:12px}
      .invoice-file-current-row:first-of-type{border-top:0}
      .invoice-file-current-row strong{display:block}
      .invoice-file-current-row button{white-space:nowrap}
      .invoice-files-status{font-size:12px;line-height:1.5;margin:10px 0}
      @media(max-width:640px){.invoice-files-grid{grid-template-columns:1fr}.invoice-file-current-row{align-items:flex-start;flex-direction:column}}
      html.reloja-dark .invoice-file-box,html.reloja-dark .invoice-files-current{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-high-contrast .invoice-file-box,html.reloja-high-contrast .invoice-files-current{background:#fff!important;color:#000!important;border:2px solid #000!important}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if ($('#invoice-files-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'invoice-files-modal';
    wrap.className = 'admin-modal-backdrop';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `<div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-files-title">
      <button type="button" class="admin-modal-close" id="invoice-files-close" aria-label="Fechar">×</button>
      <p class="eyebrow">Nota fiscal</p>
      <h2 id="invoice-files-title">Arquivos da NF-e</h2>
      <p class="admin-muted" id="invoice-files-order"></p>
      <div id="invoice-files-error" class="form-error" style="display:none"></div>
      <div id="invoice-files-success" class="form-success" style="display:none"></div>
      <div class="invoice-files-current" id="invoice-files-current"><h3>Arquivos já cadastrados</h3><p class="admin-muted">Carregando...</p></div>
      <div class="invoice-files-grid">
        <div class="invoice-file-box">
          <label for="invoice-danfe-file">DANFE em PDF</label>
          <input id="invoice-danfe-file" type="file" accept=".pdf,application/pdf">
          <span class="invoice-file-limit">PDF válido, até 4 MB.</span>
        </div>
        <div class="invoice-file-box">
          <label for="invoice-xml-file">XML da NF-e</label>
          <input id="invoice-xml-file" type="file" accept=".xml,application/xml,text/xml">
          <span class="invoice-file-limit">XML de NF-e válido, até 1 MB.</span>
        </div>
      </div>
      <p class="invoice-files-status" id="invoice-files-status"></p>
      <div class="editor-actions">
        <button type="button" id="invoice-files-save" class="btn btn-primary">Salvar arquivos</button>
        <button type="button" id="invoice-files-cancel" class="btn btn-outline">Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);
    $('#invoice-files-close').onclick = closeModal;
    $('#invoice-files-cancel').onclick = closeModal;
    $('#invoice-files-save').onclick = saveFiles;
    wrap.addEventListener('click', event => { if (event.target === wrap) closeModal(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && wrap.classList.contains('open')) closeModal();
    });
  }

  function setMessage(type, text) {
    const error = $('#invoice-files-error');
    const success = $('#invoice-files-success');
    if (error) error.style.display = 'none';
    if (success) success.style.display = 'none';
    const box = type === 'error' ? error : success;
    if (box && text) {
      box.textContent = text;
      box.style.display = 'block';
    }
  }

  function renderCurrent(files) {
    const host = $('#invoice-files-current');
    if (!host) return;
    const list = Array.isArray(files) ? files : [];
    const byKind = Object.fromEntries(list.map(item => [item.kind, item]));
    const rows = [
      ['danfe_pdf', 'DANFE em PDF'],
      ['nfe_xml', 'XML da NF-e']
    ].map(([kind, label]) => {
      const file = byKind[kind];
      if (!file) return `<div class="invoice-file-current-row"><div><strong>${label}</strong><span>Não anexado</span></div></div>`;
      return `<div class="invoice-file-current-row"><div><strong>${label}</strong><span>${escapeHtml(file.filename)} · ${formatBytes(file.size_bytes)}</span></div><button type="button" class="btn btn-outline" data-remove-invoice-file="${kind}">Remover</button></div>`;
    }).join('');
    host.innerHTML = `<h3>Arquivos já cadastrados</h3>${rows}`;
    host.querySelectorAll('[data-remove-invoice-file]').forEach(button => {
      button.onclick = () => removeFile(button.dataset.removeInvoiceFile, button);
    });
  }

  async function refreshFiles() {
    const data = await request(`/api/admin/invoice-files/${encodeURIComponent(currentOrderId)}`);
    currentInvoiceStatus = String(data.invoice_status || 'pending').toLowerCase();
    renderCurrent(data.files);
    const status = $('#invoice-files-status');
    if (status) {
      status.textContent = currentInvoiceStatus === 'emitted'
        ? 'A NF-e já está emitida. Ao adicionar ou substituir um arquivo, o e-mail fiscal será atualizado com os anexos.'
        : 'Você pode anexar os arquivos agora. Eles serão incluídos automaticamente quando a NF-e for marcada como emitida.';
    }
  }

  async function openModal(orderId) {
    ensureModal();
    currentOrderId = String(orderId || '');
    setMessage('', '');
    $('#invoice-danfe-file').value = '';
    $('#invoice-xml-file').value = '';
    $('#invoice-files-order').textContent = `Pedido ${currentOrderId}`;
    const modal = $('#invoice-files-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    try {
      await refreshFiles();
    } catch (error) {
      setMessage('error', error.message);
      renderCurrent([]);
    }
  }

  function closeModal() {
    const modal = $('#invoice-files-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    currentOrderId = '';
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
      reader.onload = () => {
        const data = String(reader.result || '');
        const comma = data.indexOf(',');
        if (comma < 0) return reject(new Error(`Não foi possível processar ${file.name}.`));
        resolve(data.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    });
  }

  async function prepareFile(file, kind) {
    if (!file) return null;
    const expected = kind === 'danfe_pdf' ? '.pdf' : '.xml';
    const label = kind === 'danfe_pdf' ? 'DANFE' : 'XML da NF-e';
    if (!String(file.name || '').toLowerCase().endsWith(expected)) throw new Error(`${label}: selecione um arquivo ${expected.toUpperCase()}.`);
    if (file.size > LIMITS[kind]) throw new Error(`${label}: o arquivo excede o limite permitido.`);
    return { kind, filename: file.name, content_base64: await readBase64(file) };
  }

  async function saveFiles() {
    if (!currentOrderId) return;
    const danfe = $('#invoice-danfe-file').files?.[0] || null;
    const xml = $('#invoice-xml-file').files?.[0] || null;
    if (!danfe && !xml) {
      setMessage('error', 'Selecione o DANFE em PDF, o XML da NF-e ou ambos.');
      return;
    }

    const button = $('#invoice-files-save');
    button.disabled = true;
    button.textContent = 'Salvando...';
    setMessage('', '');
    try {
      const files = [];
      const preparedDanfe = await prepareFile(danfe, 'danfe_pdf');
      const preparedXml = await prepareFile(xml, 'nfe_xml');
      if (preparedDanfe) files.push(preparedDanfe);
      if (preparedXml) files.push(preparedXml);
      const data = await request(`/api/admin/invoice-files/${encodeURIComponent(currentOrderId)}`, {
        method: 'PUT',
        body: JSON.stringify({ files })
      });
      renderCurrent(data.files);
      $('#invoice-danfe-file').value = '';
      $('#invoice-xml-file').value = '';
      setMessage('success', currentInvoiceStatus === 'emitted'
        ? 'Arquivos salvos. O e-mail fiscal será atualizado com os anexos.'
        : 'Arquivos salvos. Eles serão enviados quando a NF-e for marcada como emitida.');
    } catch (error) {
      setMessage('error', error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar arquivos';
    }
  }

  async function removeFile(kind, button) {
    if (!currentOrderId || !kind) return;
    button.disabled = true;
    try {
      const data = await request(`/api/admin/invoice-files/${encodeURIComponent(currentOrderId)}/${encodeURIComponent(kind)}`, { method: 'DELETE' });
      renderCurrent(data.files);
      setMessage('success', 'Arquivo removido do armazenamento da loja. E-mails já enviados não podem ser recolhidos.');
    } catch (error) {
      setMessage('error', error.message);
    } finally {
      button.disabled = false;
    }
  }

  function enhanceOrderRows() {
    document.querySelectorAll('#orders-list [data-invoice]').forEach(invoiceButton => {
      const actions = invoiceButton.closest('.admin-actions');
      if (!actions || actions.querySelector('[data-invoice-files]')) return;
      const orderId = String(invoiceButton.dataset.invoice || '').trim();
      if (!orderId) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Arquivos NF-e';
      button.dataset.invoiceFiles = orderId;
      button.title = 'Anexar DANFE em PDF e XML da NF-e';
      button.onclick = () => openModal(orderId);
      actions.appendChild(button);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    ensureModal();
    enhanceOrderRows();
    const host = $('#orders-list');
    if (host) new MutationObserver(enhanceOrderRows).observe(host, { childList: true, subtree: true });
  });
})();
