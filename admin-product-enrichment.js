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
        <span>Digite a referência. O sistema consulta primeiro o catálogo oficial sincronizado e só tenta a Casio ao vivo quando necessário.</span>
      </div>
      <button type="button" id="buscar-referencia" class="btn btn-outline">Buscar dados Casio</button>
      <div id="enrichment-status" class="enrichment-status" aria-live="polite"></div>`;
    field.parentElement.insertBefore(box, field.nextSibling);
    $('#buscar-referencia').onclick = buscar;
  }

  function cleanSku(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 40);
  }

  async function consultar(sku, signal) {
    const response = await fetch(`/api/admin/casio-enrichment?sku=${encodeURIComponent(cleanSku(sku))}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Sua sessão administrativa expirou. Entre novamente no painel.');
    if (!response.ok) throw new Error(data.error || 'Não foi possível buscar essa referência.');
    data.sku_original = cleanSku(sku);
    data.sku_consultado = data.sku || cleanSku(sku);
    return data;
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
    status.textContent = 'Consultando catálogo Casio/G-Shock...';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const data = await consultar(sku, controller.signal);
      mostrarPreview(data);
      const mode = data.modo === 'catalogo-local' ? 'catálogo oficial sincronizado' : (data.origem || 'Casio oficial');
      status.innerHTML = `<span class="ok">Encontrado em ${esc(mode)}. Revise os dados antes de aplicar.</span>`;
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'A consulta foi encerrada para não deixar o painel esperando. Tente novamente mais tarde.'
        : (error.message || 'Não foi possível buscar essa referência.');
      status.innerHTML = `<span class="bad">${esc(message)}</span>`;
    } finally {
      clearTimeout(timer);
      button.disabled = false;
      button.textContent = 'Buscar dados Casio';
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
      <p class="admin-muted">Referência ${esc(data.sku_original || data.sku)} · ${esc(data.origem || 'Casio oficial')}</p>
      ${photos.length ? `<div class="enrichment-photos">${photos.slice(0, 5).map((url, index) => `<img src="${escAttr(url)}" alt="Foto oficial ${index + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`).join('')}</div>` : ''}
      ${data.desc ? `<div class="enrichment-description"><strong>Descrição encontrada</strong><p>${esc(data.desc)}</p></div>` : ''}
      <div class="enrichment-specs">${specs || '<p class="admin-muted">A referência foi localizada, mas a ficha técnica não veio estruturada.</p>'}</div>
      ${data.aviso ? `<p class="admin-muted">${esc(data.aviso)}</p>` : ''}
      <label class="enrichment-replace"><input id="enrichment-replace" type="checkbox"> Substituir campos que já estão preenchidos</label>
      <p class="enrichment-note"><strong>Não altera:</strong> preço, estoque, medidas/peso do frete e status do produto.</p>
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

