/* =========================================================
   RELÓGIO E CIA — frete e embalagem no painel
   Mantém o Admin alinhado às regras efetivas usadas no servidor.
   ========================================================= */
(function () {
  const TOKEN_KEY = 'reloja_admin_token';
  const BOXES = Object.freeze({
    P: Object.freeze({ height: 10, width: 12, length: 12 }),
    M: Object.freeze({ height: 12, width: 15, length: 15 }),
    G: Object.freeze({ height: 24, width: 30, length: 30 })
  });
  const WEIGHT_STANDARDS_KG = Object.freeze({
    casio: 0.500,
    gshock: 0.600,
    technos: 0.600,
    technos_titanium: 0.750,
    orient: 0.500,
    citizen: 0.800
  });

  let shippingMap = {};
  let productMap = {};
  let refreshing = false;
  let productsRefreshing = false;

  const $ = s => document.querySelector(s);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
  const normalizeText = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  function editorProduct() {
    return {
      nome: $('#p-nome')?.value || '',
      marca: $('#p-marca')?.value || '',
      categoria: $('#p-categoria')?.value || '',
      sku: $('#p-sku')?.value || '',
      desc: $('#p-desc')?.value || ''
    };
  }

  function isWatchProduct(product) {
    return normalizeText(product?.categoria).includes('relogio');
  }

  function normalizedBrand(product) {
    return normalizeText(product?.marca).replace(/[^a-z0-9]/g, '');
  }

  function isTechnosTitanium(product) {
    if (normalizedBrand(product) !== 'technos') return false;
    const haystack = normalizeText([
      product?.nome,
      product?.sku,
      product?.desc,
      product?.descricao
    ].filter(Boolean).join(' '));
    return haystack.includes('titanium') || haystack.includes('titanio');
  }

  function standardWeightForProduct(product = editorProduct()) {
    if (!isWatchProduct(product)) return null;
    const brand = normalizedBrand(product);
    if (brand === 'casio') return WEIGHT_STANDARDS_KG.casio;
    if (brand === 'gshock' || brand.includes('gshock')) return WEIGHT_STANDARDS_KG.gshock;
    if (brand === 'technos') {
      return isTechnosTitanium(product)
        ? WEIGHT_STANDARDS_KG.technos_titanium
        : WEIGHT_STANDARDS_KG.technos;
    }
    if (brand === 'orient') return WEIGHT_STANDARDS_KG.orient;
    if (brand === 'citizen') return WEIGHT_STANDARDS_KG.citizen;
    return null;
  }

  function weightRuleLabel(product = editorProduct()) {
    const brand = normalizedBrand(product);
    if (brand === 'technos' && isTechnosTitanium(product)) return 'Technos Titanium';
    if (brand === 'gshock' || brand.includes('gshock')) return 'G-Shock';
    if (brand === 'casio') return 'Casio';
    if (brand === 'technos') return 'Technos';
    if (brand === 'orient') return 'Orient';
    if (brand === 'citizen') return 'Citizen';
    return String(product?.marca || 'marca').trim();
  }

  function suggestedBoxForProduct(product = editorProduct()) {
    if (!isWatchProduct(product)) return '';
    const brand = normalizedBrand(product);
    if (brand === 'orient') return 'P';
    if (brand === 'technos') return 'P';
    if (brand === 'casio') return 'P';
    if (brand === 'gshock' || brand.includes('gshock')) return 'M';
    if (brand === 'citizen') return 'M';
    return '';
  }

  function suggestedBoxByBrand() {
    return suggestedBoxForProduct(editorProduct());
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

  function syncWeightUi() {
    const input = $('#shipping-weight');
    const help = $('#shipping-weight-help');
    if (!input) return;

    const product = editorProduct();
    const standard = standardWeightForProduct(product);
    const hasStandard = positive(standard);

    if (hasStandard) {
      if (input.dataset.weightSource !== 'brand_standard') {
        input.dataset.manualValue = input.value || input.dataset.manualValue || '';
      }
      input.value = Number(standard).toFixed(3);
      input.readOnly = true;
      input.dataset.weightSource = 'brand_standard';
      input.title = `Peso automático usado no cálculo: ${Number(standard).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
      if (help) {
        help.textContent = `Automático pela marca: ${weightRuleLabel(product)} — ${Number(standard).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg. Já inclui a margem temporária de embalagem definida pela loja.`;
      }
      return;
    }

    if (input.dataset.weightSource === 'brand_standard') {
      input.value = input.dataset.manualValue || '';
    }
    input.readOnly = false;
    input.dataset.weightSource = 'manual';
    input.title = '';
    if (help) help.textContent = 'Sem peso automático para esta marca/categoria. Informe o peso manual pronto para envio.';
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

  function syncShippingUi() {
    syncWeightUi();
    syncBoxUi();
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
      <p>Para relógios Casio, G-Shock, Technos, Orient e Citizen, peso e caixa podem ser definidos automaticamente pela regra da marca. Valores manuais continuam disponíveis para marcas sem padrão.</p>
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
        <div class="form-field"><label>Peso pronto para envio (kg)</label><input id="shipping-weight" type="number" min="0.001" step="0.001" placeholder="Peso manual"><small id="shipping-weight-help" class="shipping-box-help"></small></div>
        <div class="form-field"><label>Largura (cm)</label><input id="shipping-width" type="number" min="1" step="0.1" placeholder="Ex.: 15"></div>
        <div class="form-field"><label>Altura (cm)</label><input id="shipping-height" type="number" min="1" step="0.1" placeholder="Ex.: 10"></div>
        <div class="form-field"><label>Comprimento (cm)</label><input id="shipping-length" type="number" min="1" step="0.1" placeholder="Ex.: 20"></div>
      </div>
      <p class="shipping-product-note"><strong>Regras atuais:</strong> Casio, Orient e Technos usam caixa P; G-Shock e Citizen usam M; estojos especiais podem ser marcados como G; pedidos com mais de um relógio usam G automaticamente. Pesos padrão: Casio 0,500 kg; G-Shock 0,600 kg; Technos 0,600 kg; Technos Titanium 0,750 kg; Orient 0,500 kg; Citizen 0,800 kg.</p>`;
    if (photoField) editor.insertBefore(host, photoField);
    else editor.appendChild(host);

    $('#shipping-box-size')?.addEventListener('change', syncShippingUi);
    ['#p-marca', '#p-nome', '#p-sku', '#p-desc'].forEach(selector => {
      $(selector)?.addEventListener('input', syncShippingUi);
    });
    $('#p-categoria')?.addEventListener('input', syncShippingUi);
    $('#p-categoria')?.addEventListener('change', syncShippingUi);
    syncShippingUi();
  }

  function clearFields() {
    ['shipping-weight','shipping-width','shipping-height','shipping-length'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const weight = $('#shipping-weight');
    if (weight) {
      weight.dataset.manualValue = '';
      weight.dataset.weightSource = 'manual';
    }
    if ($('#shipping-box-size')) $('#shipping-box-size').value = '';
    syncShippingUi();
  }

  function fillFields(productId) {
    ensureFields();
    const d = shippingMap[String(productId)] || {};
    const weight = $('#shipping-weight');
    if (weight) {
      const manual = d.weight_kg ?? '';
      weight.value = manual;
      weight.dataset.manualValue = manual;
      weight.dataset.weightSource = 'manual';
    }
    $('#shipping-width').value = d.width_cm ?? '';
    $('#shipping-height').value = d.height_cm ?? '';
    $('#shipping-length').value = d.length_cm ?? '';
    $('#shipping-box-size').value = BOXES[String(d.box_size || '').toUpperCase()] ? String(d.box_size).toUpperCase() : '';
    syncShippingUi();
  }

  function fieldPayload() {
    const explicitBox = String($('#shipping-box-size')?.value || '').toUpperCase();
    const weightInput = $('#shipping-weight');
    const automaticWeight = weightInput?.dataset.weightSource === 'brand_standard';
    return {
      // Não grava o padrão da marca como se fosse peso manual. O servidor continua
      // sendo a fonte efetiva da regra automática e pode ser ajustado no futuro.
      weight_kg: automaticWeight ? null : Number(weightInput?.value),
      width_cm: Number($('#shipping-width')?.value),
      height_cm: Number($('#shipping-height')?.value),
      length_cm: Number($('#shipping-length')?.value),
      box_size: BOXES[explicitBox] ? explicitBox : ''
    };
  }

  function dimensionsComplete(payload = fieldPayload(), product = editorProduct()) {
    if (BOXES[suggestedBoxForProduct(product)] || BOXES[String(payload.box_size || '').toUpperCase()]) return true;
    return positive(payload.width_cm) && positive(payload.height_cm) && positive(payload.length_cm);
  }

  function complete(payload = fieldPayload(), product = editorProduct()) {
    const effectiveWeight = standardWeightForProduct(product) ?? payload.weight_kg;
    return positive(effectiveWeight) && dimensionsComplete(payload, product);
  }

  function saveable(payload = fieldPayload(), product = editorProduct()) {
    return dimensionsComplete(payload, product) || Boolean(BOXES[String(payload.box_size || '').toUpperCase()]);
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

  async function loadProductMap() {
    if (!token() || productsRefreshing) return;
    productsRefreshing = true;
    try {
      const response = await fetch('/api/admin/products', {
        headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
        cache: 'no-store'
      });
      if (response.ok) {
        const products = await response.json();
        productMap = Array.isArray(products)
          ? Object.fromEntries(products.map(product => [String(product.id), product]))
          : {};
      }
    } catch {}
    finally { productsRefreshing = false; }
  }

  async function saveShipping(productId, payload) {
    if (!productId || !saveable(payload, productMap[String(productId)] || editorProduct())) return false;
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

      const id = String(edit.dataset.edit);
      const d = shippingMap[id] || {};
      const product = productMap[id] || null;
      const ok = product ? complete({
        weight_kg: d.weight_kg,
        width_cm: d.width_cm,
        height_cm: d.height_cm,
        length_cm: d.length_cm,
        box_size: d.box_size
      }, product) : positive(d.weight_kg) && (
        BOXES[String(d.box_size || '').toUpperCase()] ||
        (positive(d.width_cm) && positive(d.height_cm) && positive(d.length_cm))
      );
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
        await Promise.all([loadShippingMap(), loadProductMap()]);
        fillFields(edit.dataset.edit);
      }, 0);
      if (event.target.closest('#novo-produto')) setTimeout(() => {
        ensureFields();
        clearFields();
      }, 0);
      if (event.target.closest('#login-btn')) setTimeout(async () => {
        await Promise.all([loadShippingMap(), loadProductMap()]);
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
        await loadProductMap();
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
    await Promise.all([loadShippingMap(), loadProductMap()]);

    const list = $('#products-list');
    if (list) {
      new MutationObserver(async () => {
        if (token() && !Object.keys(shippingMap).length) await loadShippingMap();
        if (token() && !Object.keys(productMap).length) await loadProductMap();
        enhanceProductRows();
        document.querySelectorAll('[data-edit]').forEach(button => {
          if (button.dataset.shippingBound) return;
          button.dataset.shippingBound = '1';
          button.addEventListener('click', () => setTimeout(async () => {
            await Promise.all([loadShippingMap(), loadProductMap()]);
            fillFields(button.dataset.edit);
          }, 0));
        });
      }).observe(list, { childList: true, subtree: true });
    }
    enhanceProductRows();
  });
})();
