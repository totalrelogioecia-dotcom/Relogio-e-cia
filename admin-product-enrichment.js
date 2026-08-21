(function () {
  'use strict';

  const $ = selector => document.querySelector(selector);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, '&#96;');
  }

  function ensureBox() {
    const sku = $('#p-sku');
    if (!sku || $('#product-enrichment-box')) return;

    const field = sku.closest('.form-field');
    const box = document.createElement('div');
    box.id = 'product-enrichment-box';
    box.className = 'product-enrichment-box';
    box.innerHTML = `
      <div class="enrichment-copy">
        <strong>Busca inteligente — Casio e G-Shock</strong>
        <span>Informe a referência do relógio para consultar o catálogo oficial da Casio e preencher os dados encontrados.</span>
      </div>
      <button type="button" id="buscar-referencia" class="btn btn-outline">Buscar no site da Casio</button>
      <div id="enrichment-status" class="enrichment-status" aria-live="polite"></div>`;

    field.parentElement.insertBefore(box, field.nextSibling);
    $('#buscar-referencia').onclick = buscar;
  }

  function skuVariants(raw) {
    const clean = String(raw || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
    if (!clean) return [];

    const out = [clean];
    // Algumas referências comerciais brasileiras aparecem com ou sem o sufixo regional.
    if (!/(?:DF|DR)$/.test(clean)) out.push(clean + 'DF', clean + 'DR');
    if (/DF$/.test(clean)) out.push(clean.replace(/DF$/, ''));
    if (/DR$/.test(clean)) out.push(clean.replace(/DR$/, ''));
    return [...new Set(out.filter(Boolean))];
  }

  async function consultar(sku, signal) {
    let lastError = 'Não foi possível localizar essa referência.';

    for (const candidate of skuVariants(sku)) {
      const response = await fetch(`/api/admin/casio-enrichment?sku=${encodeURIComponent(candidate)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
        headers: { Accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        data.sku_original = sku;
        data.sku_consultado = candidate;
        return data;
      }

      if (data.error) lastError = data.error;
      if (response.status === 401) throw new Error('Sua sessão administrativa expirou. Entre novamente no painel.');
      if (response.status !== 404) throw new Error(lastError);
    }

    throw new Error('Não encontrei essa referência no catálogo oficial Casio/G-Shock. Confira se ela foi digitada completa.');
  }

  async function buscar() {
    const sku = $('#p-sku')?.value?.trim();
    const status = $('#enrichment-status');
    const button = $('#buscar-referencia');

    if (!sku) {
      status.innerHTML = '<span class="bad">Informe primeiro a referência/SKU.</span>';
      return;
    }

    button.disabled = true;
    button.textContent = 'Buscando...';
    status.textContent = 'Consultando o catálogo oficial Casio/G-Shock...';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
      const data = await consultar(sku, controller.signal);
      mostrarPreview(data);
      const variation = data.sku_consultado && data.sku_consultado.toUpperCase() !== sku.toUpperCase()
        ? ` (localizada como ${esc(data.sku_consultado)})`
        : '';
      status.innerHTML = `<span class="ok">Encontrado em ${esc(data.origem || 'Casio oficial')}${variation}. Revise os dados antes de aplicar.</span>`;
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'A consulta demorou demais. Tente novamente em alguns segundos.'
        : (error.message || 'Não foi possível buscar essa referência.');
      status.innerHTML = `<span class="bad">${esc(message)}</span>`;
    } finally {
      clearTimeout(timer);
      button.disabled = false;
      button.textContent = 'Buscar no site da Casio';
    }
  }

  function specRows(details) {
    const labels = {
      movimento: 'Movimento / tipo de exibição',
      caixa_material: 'Material da caixa',
      pulseira_material: 'Material da pulseira',
      cor: 'Cor',
      diametro: 'Dimensões da caixa',
      resistencia_agua: 'Resistência à água',
      vidro: 'Vidro',
      garantia: 'Garantia',
      conteudo_embalagem: 'Conteúdo da embalagem'
    };

    return Object.entries(labels)
      .filter(([key]) => String(details?.[key] || '').trim())
      .map(([key, label]) => `<div><span>${esc(label)}</span><strong>${esc(details[key])}</strong></div>`)
      .join('');
  }

  function previewPhoto(url) {
    const source = String(url || '');
    if (/^https:\/\/www\.casio\.com\/content\/dam\/casio\//i.test(source)) {
      return `/api/casio-v2-image?url=${encodeURIComponent(source)}`;
    }
    return source;
  }

  function mostrarPreview(data) {
    let modal = $('#enrichment-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'enrichment-modal';
      modal.className = 'admin-modal-backdrop enrichment-modal';
      document.body.appendChild(modal);
    }

    const photos = (data.fotos || []).filter(Boolean).slice(0, 6);
    const specs = specRows(data.detalhes || {});

    modal.innerHTML = `<div class="admin-modal enrichment-dialog" role="dialog" aria-modal="true" aria-labelledby="enrichment-title">
      <button type="button" class="admin-modal-close" id="enrichment-close" aria-label="Fechar">×</button>
      <p class="eyebrow">${esc(data.marca || 'Casio')}</p>
      <h2 id="enrichment-title">${esc(data.nome || data.sku)}</h2>
      <p class="admin-muted">Referência ${esc(data.sku_original || data.sku)}${data.sku_consultado && data.sku_consultado !== data.sku_original ? ` · ficha localizada como ${esc(data.sku_consultado)}` : ''} · ${esc(data.origem || 'Casio oficial')}</p>
      ${photos.length ? `<div class="enrichment-photos">${photos.slice(0, 5).map((url, index) => `<img src="${escAttr(previewPhoto(url))}" alt="Foto oficial ${index + 1}" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>` : ''}
      ${data.desc ? `<div class="enrichment-description"><strong>Descrição encontrada</strong><p>${esc(data.desc)}</p></div>` : ''}
      <div class="enrichment-specs">${specs || '<p class="admin-muted">A referência foi encontrada, mas não foi possível estruturar a ficha técnica automaticamente.</p>'}</div>
      ${data.aviso ? `<p class="admin-muted">${esc(data.aviso)}</p>` : ''}
      <label class="enrichment-replace"><input id="enrichment-replace" type="checkbox"> Substituir campos que já estão preenchidos</label>
      <p class="enrichment-note"><strong>Não altera:</strong> preço, estoque, medidas/peso do frete e status do produto. Esses dados continuam sob seu controle.</p>
      <div class="editor-actions"><button id="enrichment-apply" type="button" class="btn btn-primary">Aplicar ao produto</button><button id="enrichment-cancel" type="button" class="btn btn-outline">Cancelar</button></div>
      ${data.fonte ? `<a class="enrichment-source" href="${escAttr(data.fonte)}" target="_blank" rel="noopener">Abrir página oficial da Casio ↗</a>` : ''}
    </div>`;

    const close = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('admin-modal-open');
    };

    $('#enrichment-close').onclick = close;
    $('#enrichment-cancel').onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };
    $('#enrichment-apply').onclick = () => {
      aplicar(data, $('#enrichment-replace').checked);
      close();
    };

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
  }

  function setIf(selector, value, replace) {
    const element = $(selector);
    if (!element || !String(value || '').trim()) return;
    if (replace || !String(element.value || '').trim()) element.value = String(value).trim();
  }

  function aplicar(data, replace) {
    // A referência digitada pelo lojista é mantida. Um eventual sufixo regional
    // usado somente para localizar a ficha não substitui o SKU comercial.
    setIf('#p-sku', data.sku_original || data.sku, replace);
    setIf('#p-nome', data.nome, replace);
    setIf('#p-marca', data.marca, replace);
    setIf('#p-categoria', data.categoria || 'Relógios', replace);
    setIf('#p-desc', data.desc, replace);

    Object.entries(data.detalhes || {}).forEach(([key, value]) => setIf(`#pd-${key}`, value, replace));

    const photos = (data.fotos || []).filter(Boolean).slice(0, 8);
    const hasExisting = Boolean($('#photo-preview img')) || Boolean(String($('#p-fotos')?.value || '').trim());
    if (photos.length && (replace || !hasExisting)) {
      try {
        if (typeof setPhotos === 'function') {
          setPhotos(photos);
          const area = $('#p-fotos');
          if (area) area.value = '';
        }
      } catch (error) {
        console.warn('Não foi possível aplicar automaticamente as fotos da Casio:', error.message);
      }
    }

    const status = $('#enrichment-status');
    if (status) status.innerHTML = '<span class="ok">Dados aplicados. Revise o cadastro e clique em “Salvar produto”.</span>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureBox();
    const observer = new MutationObserver(ensureBox);
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
