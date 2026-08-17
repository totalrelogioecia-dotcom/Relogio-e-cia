/* =========================================================
   RELÓGIO E CIA — dimensões de frete no painel
   Mantidas separadamente do cadastro comercial do produto.
   ========================================================= */
(function () {
  const TOKEN_KEY = 'reloja_admin_token';
  let shippingMap = {};

  const $ = s => document.querySelector(s);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;

  function ensureFields() {
    const editor = $('#product-editor');
    if (!editor || $('#shipping-product-fields')) return;
    const photoField = editor.querySelector('.photo-manager');
    const host = document.createElement('div');
    host.id = 'shipping-product-fields';
    host.className = 'shipping-product-fields';
    host.innerHTML = `
      <h4>Frete e embalagem</h4>
      <p>Informe as medidas da embalagem pronta para envio. O Melhor Envio usa centímetros e quilogramas para calcular o frete.</p>
      <div class="shipping-product-grid">
        <div class="form-field"><label>Peso (kg)</label><input id="shipping-weight" type="number" min="0.001" step="0.001" placeholder="Ex.: 0.350"></div>
        <div class="form-field"><label>Largura (cm)</label><input id="shipping-width" type="number" min="1" step="0.1" placeholder="Ex.: 15"></div>
        <div class="form-field"><label>Altura (cm)</label><input id="shipping-height" type="number" min="1" step="0.1" placeholder="Ex.: 10"></div>
        <div class="form-field"><label>Comprimento (cm)</label><input id="shipping-length" type="number" min="1" step="0.1" placeholder="Ex.: 20"></div>
      </div>
      <p class="shipping-product-note"><strong>Importante:</strong> use a caixa final, já com o relógio e a proteção interna. Produtos sem essas quatro informações não entram na cotação automática.</p>`;
    if (photoField) editor.insertBefore(host, photoField);
    else editor.appendChild(host);
  }

  function clearFields() {
    ['shipping-weight','shipping-width','shipping-height','shipping-length'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }

  function fillFields(productId) {
    ensureFields();
    const d = shippingMap[String(productId)] || {};
    $('#shipping-weight').value = d.weight_kg ?? '';
    $('#shipping-width').value = d.width_cm ?? '';
    $('#shipping-height').value = d.height_cm ?? '';
    $('#shipping-length').value = d.length_cm ?? '';
  }

  function fieldPayload() {
    return {
      weight_kg: Number($('#shipping-weight')?.value),
      width_cm: Number($('#shipping-width')?.value),
      height_cm: Number($('#shipping-height')?.value),
      length_cm: Number($('#shipping-length')?.value)
    };
  }

  function complete(payload = fieldPayload()) {
    return positive(payload.weight_kg) && positive(payload.width_cm) && positive(payload.height_cm) && positive(payload.length_cm);
  }

  async function loadShippingMap() {
    if (!token()) return;
    try {
      const response = await fetch('/api/admin/shipping-products', {
        headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
        cache: 'no-store'
      });
      if (response.ok) shippingMap = await response.json();
    } catch {}
  }

  async function saveShipping(productId, payload) {
    if (!productId || !complete(payload)) return false;
    const response = await fetch(`/api/admin/shipping-products/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível salvar peso e dimensões.');
    }
    shippingMap[String(productId)] = await response.json();
    return true;
  }

  function enhanceProductRows() {
    document.querySelectorAll('#products-list tbody tr').forEach(row => {
      if (row.querySelector('.shipping-product-status')) return;
      const edit = row.querySelector('[data-edit]');
      const first = row.querySelector('td');
      if (!edit || !first) return;
      const d = shippingMap[String(edit.dataset.edit)] || {};
      const ok = complete({ weight_kg:d.weight_kg, width_cm:d.width_cm, height_cm:d.height_cm, length_cm:d.length_cm });
      const badge = document.createElement('span');
      badge.className = `shipping-product-status ${ok ? 'ok' : 'pending'}`;
      badge.textContent = ok ? 'Frete pronto' : 'Frete pendente';
      first.appendChild(document.createElement('br'));
      first.appendChild(badge);
    });
  }

  function watchEditorActions() {
    document.addEventListener('click', event => {
      const edit = event.target.closest('[data-edit]');
      if (edit) setTimeout(() => fillFields(edit.dataset.edit), 0);
      if (event.target.closest('#novo-produto')) setTimeout(() => { ensureFields(); clearFields(); }, 0);
    });
  }

  function interceptProductSave() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
      const url = String(input?.url || input || '');
      const method = String(init.method || 'GET').toUpperCase();
      const isProductSave = url.includes('/api/admin/products') && (method === 'POST' || method === 'PUT') && !url.includes('/shipping-products');
      if (!isProductSave) return originalFetch(input, init);

      const payload = fieldPayload();
      const response = await originalFetch(input, init);
      if (!response.ok || !complete(payload)) return response;

      try {
        let productId = '';
        if (method === 'PUT') productId = url.split('/').filter(Boolean).pop();
        else {
          const clone = response.clone();
          const product = await clone.json();
          productId = product?.id;
        }
        if (productId) await saveShipping(productId, payload);
      } catch (error) {
        console.warn('Produto salvo, mas os dados de frete não puderam ser salvos:', error.message);
      }
      return response;
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    ensureFields();
    interceptProductSave();
    watchEditorActions();
    await loadShippingMap();

    const list = $('#products-list');
    if (list) {
      new MutationObserver(() => {
        enhanceProductRows();
        document.querySelectorAll('[data-edit]').forEach(button => {
          if (button.dataset.shippingBound) return;
          button.dataset.shippingBound = '1';
          button.addEventListener('click', () => setTimeout(() => fillFields(button.dataset.edit), 0));
        });
      }).observe(list, { childList: true, subtree: true });
    }
    enhanceProductRows();
  });
})();
