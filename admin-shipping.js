/* =========================================================
   RELÓGIO E CIA — dimensões de frete no painel
   Mantidas separadamente do cadastro comercial do produto.
   ========================================================= */
(function () {
  const TOKEN_KEY = 'reloja_admin_token';
  const BOXES = Object.freeze({
    P: Object.freeze({ height: 10, width: 12, length: 12 }),
    M: Object.freeze({ height: 12, width: 15, length: 15 }),
    G: Object.freeze({ height: 24, width: 30, length: 30 })
  });

  let shippingMap = {};
  let refreshing = false;

  const $ = s => document.querySelector(s);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
  const normalizeText = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  function isWatchCategory() {
    return normalizeText($('#p-categoria')?.value).includes('relogio');
  }

  function suggestedBoxByBrand() {
    if (!isWatchCategory()) return '';
    const brand = normalizeText($('#p-marca')?.value).replace(/[^a-z0-9]/g, '');
    if (brand === 'orient') return 'P';
    if (brand === 'technos') return 'P';
    if (brand === 'gshock' || brand.includes('gshock')) return 'M';
    if (brand === 'citizen') return 'M';
    return '';
  }

  function selectedBox() {
    const explicit = String($('#shipping-box-size')?.value || '').toUpperCase();
    return BOXES[explicit] ? explicit : suggestedBoxByBrand();
  }

  function applyBoxDimensions(code) {
    const box = BOXES[code];
    const width = $('#shipping-width');
    const height = $('#shipping-height');
    const length = $('#shipping-length');
    if (!width || !height || !length) return;

    if (!box) {
      width.readOnly = false;
      height.readOnly = false;
      length.readOnly = false;
      return;
    }

    width.value = box.width;
    height.value = box.height;
    length.value = box.length;
    width.readOnly = true;
    height.readOnly = true;
    length.readOnly = true;
  }

  function syncBoxUi() {
    const select = $('#shipping-box-size');
    const help = $('#shipping-box-help');
    if (!select) return;

    const explicit = String(select.value || '').toUpperCase();
    const automatic = suggestedBoxByBrand();
    const effective = BOXES[explicit] ? explicit : automatic;

    applyBoxDimensions(effective);

    if (!help) return;
    if (BOXES[explicit]) {
      const b = BOXES[explicit];
      help.textContent = `Caixa ${explicit} selecionada manualmente: ${b.height} × ${b.length} × ${b.width} cm (A × C × L).`;
      return;
    }

    if (automatic) {
      const b = BOXES[automatic];
      help.textContent = `Automático pela marca: caixa ${automatic} — ${b.height} × ${b.length} × ${b.width} cm (A × C × L).`;
      return;
    }

    help.textContent = 'Esta marca ainda não tem caixa automática. Escolha P, M ou G, ou mantenha as dimensões manuais.';
  }

  function ensureFields() {
    const editor = $('#product-editor');
    if (!editor || $('#shipping-product-fields')) return;
    const photoField = editor.querySelector('.photo-manager');
    const host = document.createElement('div');
    host.id = 'shipping-product-fields';
    host.className = 'shipping-product-fields';
    host.innerHTML = `
      <h4>Frete e embalagem</h4>
      <p>As caixas P/M/G controlam as dimensões enviadas ao Melhor Envio. O peso pode ficar pendente até a caixa e a proteção reais serem pesadas.</p>
      <div class="form-field shipping-box-field">
        <label>Caixa de envio</label>
        <select id="shipping-box-size">
          <option value="">Automática pela marca</option>
          <option value="P">P — 10 × 12 × 12 cm</option>
          <option value="M">M — 12 × 15 × 15 cm</option>
          <option value="G">G — 24 × 30 × 30 cm</option>
        </select>
        <small id="shipping-box-help" class="shipping-box-help"></small>
      </div>
      <div class="shipping-product-grid">
        <div class="form-field"><label>Peso pronto para envio (kg)</label><input id="shipping-weight" type="number" min="0.001" step="0.001" placeholder="Pendente até pesar"></div>
        <div class="form-field"><label>Largura (cm)</label><input id="shipping-width" type="number" min="1" step="0.1" placeholder="Ex.: 15"></div>
        <div class="form-field"><label>Altura (cm)</label><input id="shipping-height" type="number" min="1" step="0.1" placeholder="Ex.: 10"></div>
        <div class="form-field"><label>Comprimento (cm)</label><input id="shipping-length" type="number" min="1" step="0.1" placeholder="Ex.: 20"></div>
      </div>
      <p class="shipping-product-note"><strong>Regras atuais:</strong> Orient e Technos simples usam P; G-Shock e Citizen usam M; estojos especiais podem ser marcados como G; pedidos com mais de um relógio usam G automaticamente. O peso ainda precisa ser validado antes da cotação real.</p>`;
    if (photoField) editor.insertBefore(host, photoField);
    else editor.appendChild(host);

    $('#shipping-box-size')?.addEventListener('change', syncBoxUi);
    $('#p-marca')?.addEventListener('input', syncBoxUi);
    $('#p-categoria')?.addEventListener('change', syncBoxUi);
    syncBoxUi();
  }

  function clearFields() {
    ['shipping-weight','shipping-width','shipping-height','shipping-length'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if ($('#shipping-box-size')) $('#shipping-box-size').value = '';
    syncBoxUi();
  }

  function fillFields(productId) {
    ensureFields();
    const d = shippingMap[String(productId)] || {};
    $('#shipping-weight').value = d.weight_kg ?? '';
    $('#shipping-width').value = d.width_cm ?? '';
    $('#shipping-height').value = d.height_cm ?? '';
    $('#shipping-length').value = d.length_cm ?? '';
    $('#shipping-box-size').value = BOXES[String(d.box_size || '').toUpperCase()] ? String(d.box_size).toUpperCase() : '';
    syncBoxUi();
  }

  function fieldPayload() {
    const explicitBox = String($('#shipping-box-size')?.value || '').toUpperCase();
    return {
      weight_kg: Number($('#shipping-weight')?.value),
      width_cm: Number($('#shipping-width')?.value),
      height_cm: Number($('#shipping-height')?.value),
      length_cm: Number($('#shipping-length')?.value),
      box_size: BOXES[explicitBox] ? explicitBox : ''
    };
  }

  function dimensionsComplete(payload = fieldPayload()) {
    return positive(payload.width_cm) && positive(payload.height_cm) && positive(payload.length_cm);
  }

  function complete(payload = fieldPayload()) {
    return positive(payload.weight_kg) && dimensionsComplete(payload);
  }

  function saveable(payload = fieldPayload()) {
    return dimensionsComplete(payload) || Boolean(BOXES[String(payload.box_size || '').toUpperCase()]);
  }

  async function loadShippingMap() {
    if (!token() || refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('/api/admin/shipping-products', {
        headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
        cache: 'no-store'
      });
      if (response.ok) shippingMap = await response.json();
    } catch {}
    finally { refreshing = false; }
  }

  async function saveShipping(productId, payload) {
    if (!productId || !saveable(payload)) return false;
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
      const edit = row.querySelector('[data-edit]');
      const first = row.querySelector('td');
      if (!edit || !first) return;

      const d = shippingMap[String(edit.dataset.edit)] || {};
      const ok = complete({
        weight_kg: d.weight_kg,
        width_cm: d.width_cm,
        height_cm: d.height_cm,
        length_cm: d.length_cm,
        box_size: d.box_size
      });
      const nextClass = `shipping-product-status ${ok ? 'ok' : 'pending'}`;
      const nextText = ok ? 'Frete pronto' : 'Frete pendente';

      let badge = row.querySelector('.shipping-product-status');
      if (!badge) {
        let spacer = row.querySelector('.shipping-product-status-break');
        if (!spacer) {
          spacer = document.createElement('br');
          spacer.className = 'shipping-product-status-break';
          first.appendChild(spacer);
        }
        badge = document.createElement('span');
        badge.className = nextClass;
        badge.textContent = nextText;
        first.appendChild(badge);
        return;
      }

      if (badge.className !== nextClass) badge.className = nextClass;
      if (badge.textContent !== nextText) badge.textContent = nextText;
    });
  }

  function watchEditorActions() {
    document.addEventListener('click', event => {
      const edit = event.target.closest('[data-edit]');
      if (edit) setTimeout(async () => {
        await loadShippingMap();
        fillFields(edit.dataset.edit);
      }, 0);
      if (event.target.closest('#novo-produto')) setTimeout(() => {
        ensureFields();
        clearFields();
      }, 0);
      if (event.target.closest('#login-btn')) setTimeout(async () => {
        await loadShippingMap();
        enhanceProductRows();
      }, 700);
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
      if (!response.ok || !saveable(payload)) return response;

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
      new MutationObserver(async () => {
        if (token() && !Object.keys(shippingMap).length) await loadShippingMap();
        enhanceProductRows();
        document.querySelectorAll('[data-edit]').forEach(button => {
          if (button.dataset.shippingBound) return;
          button.dataset.shippingBound = '1';
          button.addEventListener('click', () => setTimeout(async () => {
            await loadShippingMap();
            fillFields(button.dataset.edit);
          }, 0));
        });
      }).observe(list, { childList: true, subtree: true });
    }
    enhanceProductRows();
  });
})();