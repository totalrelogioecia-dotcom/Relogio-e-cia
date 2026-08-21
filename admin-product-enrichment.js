(function () {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const CASIO_BASE = 'https://www.casio.com/';

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

  function compactSku(value) {
    return cleanSku(value).replace(/[^A-Z0-9]/g, '');
  }

  function skuVariants(raw) {
    const clean = cleanSku(raw);
    if (!clean) return [];

    const out = [clean];
    // Algumas referências comerciais brasileiras aparecem com ou sem o sufixo regional.
    if (!/(?:DF|DR)$/.test(clean)) out.push(clean + 'DF', clean + 'DR');
    if (/DF$/.test(clean)) out.push(clean.replace(/DF$/, ''));
    if (/DR$/.test(clean)) out.push(clean.replace(/DR$/, ''));
    return [...new Set(out.filter(Boolean))];
  }

  function officialCandidates(sku) {
    const encoded = encodeURIComponent(sku);
    return [
      { brand: 'Casio', region: 'Brasil', url: `https://www.casio.com/br/watches/casio/product.${encoded}/` },
      { brand: 'G-Shock', region: 'Brasil', url: `https://www.casio.com/br/watches/gshock/product.${encoded}/` },
      { brand: 'Casio', region: 'Internacional', url: `https://www.casio.com/intl/watches/casio/product.${encoded}/` },
      { brand: 'G-Shock', region: 'Internacional', url: `https://www.casio.com/intl/watches/gshock/product.${encoded}/` }
    ];
  }

  function htmlDocument(html) {
    return new DOMParser().parseFromString(String(html || ''), 'text/html');
  }

  function pageText(doc) {
    const clone = doc.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,svg').forEach(node => node.remove());
    return String(clone.body?.innerText || clone.documentElement?.innerText || '')
      .replace(/\r/g, '')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
  }

  function containsSku(text, sku) {
    const compactText = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const compact = compactSku(sku);
    return Boolean(compact && compactText.includes(compact));
  }

  function pick(text, labels, max = 360) {
    const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const current = lines[i].replace(/^#+\s*/, '').trim();
      for (const label of labels) {
        const normalizedCurrent = current.toLocaleLowerCase('pt-BR');
        const normalizedLabel = label.toLocaleLowerCase('pt-BR');
        if (normalizedCurrent !== normalizedLabel && !normalizedCurrent.startsWith(normalizedLabel + ':')) continue;

        let value = current.slice(label.length).replace(/^\s*[:：-]\s*/, '').trim();
        if (!value) value = String(lines[i + 1] || '').trim();
        if (value && value.length <= max && !labels.some(item => value.toLocaleLowerCase('pt-BR') === item.toLocaleLowerCase('pt-BR'))) return value;
      }
    }
    return '';
  }

  function displayType(text) {
    const upper = String(text || '').toUpperCase();
    if (/DIGITAL\s*[-+/ ]\s*ANAL[ÓO]GICO|ANAL[ÓO]GICO\s*[-+/ ]\s*DIGITAL/.test(upper)) return 'Digital + analógico';
    if (/\bDIGITAL\b/.test(upper) && /\bANAL[ÓO]GICO\b/.test(upper)) return 'Digital + analógico';
    if (/\bDIGITAL\b/.test(upper)) return 'Digital';
    if (/\bANAL[ÓO]GICO\b/.test(upper)) return 'Analógico';
    return '';
  }

  function officialImages(doc, sku, max = 6) {
    const found = [];
    const add = raw => {
      if (!raw) return;
      try {
        const url = new URL(String(raw).trim(), CASIO_BASE);
        if (url.protocol !== 'https:' || url.hostname !== 'www.casio.com' || !url.pathname.startsWith('/content/dam/casio/')) return;
        const value = url.toString();
        if (!found.includes(value)) found.push(value);
      } catch {}
    };

    doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(node => add(node.getAttribute('content')));
    doc.querySelectorAll('img').forEach(img => {
      add(img.getAttribute('src'));
      add(img.getAttribute('data-src'));
      add(img.getAttribute('data-lazy-src'));
      const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
      srcset.split(',').forEach(part => add(part.trim().split(/\s+/)[0]));
    });
    doc.querySelectorAll('source').forEach(source => {
      const srcset = source.getAttribute('srcset') || source.getAttribute('data-srcset') || '';
      srcset.split(',').forEach(part => add(part.trim().split(/\s+/)[0]));
    });

    const compact = compactSku(sku).toLowerCase();
    const score = value => {
      const lower = value.toLowerCase();
      const compactUrl = lower.replace(/[^a-z0-9]/g, '');
      let points = 0;
      if (compact && compactUrl.includes(compact)) points += 180;
      if (/seq0?1|seq0?2|seq0?3|main-visual|assets/.test(lower)) points += 30;
      if (/icon|logo|banner|feature|manual|qr|size-guide/.test(lower)) points -= 180;
      return points;
    };

    return found.sort((a, b) => score(b) - score(a)).filter(value => score(value) > 0).slice(0, max);
  }

  function descriptionFrom(doc, text) {
    const meta = doc.querySelector('meta[name="description"]')?.getAttribute('content')
      || doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
      || '';
    if (String(meta).trim()) return String(meta).replace(/\s+/g, ' ').trim().slice(0, 1200);

    const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
    const useful = lines.find(line => line.length > 55 && line.length < 700 && /resistente|cron[oô]metro|alarme|bluetooth|solar|digital|anal[oó]gico|bateria|design/i.test(line));
    return String(useful || '').slice(0, 1200);
  }

  function parseOfficialHtml(html, sku, candidate) {
    const doc = htmlDocument(html);
    const text = pageText(doc);
    if (!containsSku(text, sku)) return null;

    const h1 = String(doc.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
    const title = String(doc.querySelector('title')?.textContent || '').replace(/\s*\|\s*CASIO.*$/i, '').replace(/\s+/g, ' ').trim();
    const baseName = h1 || title || sku;
    const nome = compactSku(baseName) === compactSku(sku) ? `${candidate.brand} ${sku}` : baseName.slice(0, 140);

    const detalhes = {
      movimento: pick(text, ['Movimento', 'Movement']) || displayType(text),
      caixa_material: pick(text, ['Material da caixa e da moldura', 'Material da caixa e do bisel', 'Material da caixa', 'Case and bezel material', 'Case material']),
      pulseira_material: pick(text, ['Pulseira', 'Bracelete', 'Band', 'Material da pulseira']),
      cor: pick(text, ['Cor', 'Color', 'Cor da pulseira', 'Band color']),
      diametro: pick(text, ['Tamanho do Relógio (Caixa|Visor) C x L x A', 'Tamanho do Relógio', 'Tamanho da caixa (C × L × A)', 'Tamanho da caixa', 'Case size (L× W× H)', 'Case size']),
      resistencia_agua: pick(text, ['Resistente a água', 'Resistência à água', 'Resistência à água de', 'Water resistance']),
      vidro: pick(text, ['Vidro', 'Glass'])
    };

    Object.keys(detalhes).forEach(key => {
      if (!String(detalhes[key] || '').trim()) delete detalhes[key];
    });

    const fotos = officialImages(doc, sku, 6);
    return {
      sku,
      nome,
      marca: candidate.brand,
      categoria: 'Relógios',
      desc: descriptionFrom(doc, text),
      fotos,
      detalhes,
      fonte: candidate.url,
      origem: candidate.region === 'Brasil'
        ? (candidate.brand === 'G-Shock' ? 'Casio Brasil — G-Shock' : 'Casio Brasil')
        : `Casio oficial — ${candidate.region}`,
      aviso: fotos.length ? '' : 'A referência foi confirmada no catálogo oficial, mas nenhuma foto pôde ser extraída automaticamente desta página.'
    };
  }

  async function fetchOfficialThroughAllOrigins(url, signal) {
    // Fallback usado apenas quando o servidor do Render não consegue abrir a Casio.
    // O conteúdo consultado continua sendo a URL oficial informada em `url`.
    const endpoint = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint, { cache: 'no-store', signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return '';
    const payload = await response.json().catch(() => null);
    return String(payload?.contents || '');
  }

  async function browserFallback(sku, signal) {
    for (const candidate of officialCandidates(sku)) {
      try {
        const html = await fetchOfficialThroughAllOrigins(candidate.url, signal);
        if (!html) continue;
        const parsed = parseOfficialHtml(html, sku, candidate);
        if (parsed) return parsed;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
      }
    }
    return null;
  }

  async function consultar(sku, signal) {
    let lastError = 'Não foi possível localizar essa referência.';

    for (const candidate of skuVariants(sku)) {
      try {
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
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (/sessão administrativa/i.test(String(error?.message || ''))) throw error;
      }

      // A Casio bloqueia algumas redes de datacenter. Nesse caso o próprio navegador
      // tenta ler a mesma página oficial por uma camada CORS pública, sem mudar a fonte.
      const fallback = await browserFallback(candidate, signal);
      if (fallback) {
        fallback.sku_original = sku;
        fallback.sku_consultado = candidate;
        return fallback;
      }
    }

    throw new Error(lastError || 'Não consegui consultar a referência no catálogo oficial Casio/G-Shock.');
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
    const timer = setTimeout(() => controller.abort(), 75000);

    try {
      const data = await consultar(sku, controller.signal);
      mostrarPreview(data);
      const variation = data.sku_consultado && data.sku_consultado.toUpperCase() !== sku.toUpperCase()
        ? ` (localizada como ${esc(data.sku_consultado)})`
        : '';
      status.innerHTML = `<span class="ok">Encontrado em ${esc(data.origem || 'Casio oficial')}${variation}. Revise os dados antes de aplicar.</span>`;
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'A consulta demorou demais. A Casio pode estar bloqueando consultas automáticas temporariamente.'
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
    // <img> pode carregar a imagem oficial diretamente sem CORS. Isso evita
    // obrigar o Render a baixar a imagem da Casio, que é justamente onde ocorre o bloqueio.
    return String(url || '');
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
