(() => {
  'use strict';
  let identity = null, state = null, session = 0, dirty = false, busy = false, processing = 0, openSlideId = null;
  const esc = v => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel = () => document.getElementById('tab-home-carousel');
  const status = message => { const box = document.getElementById('carousel-editor-status'); if (box) box.textContent = message; };
  function updateButtons() {
    panel()?.querySelectorAll('button,input,select').forEach(e => { e.disabled = busy || processing > 0 || !state; });
    const add = document.getElementById('carousel-add'); if (add && state?.slides.length >= 5) add.disabled = true;
    panel()?.querySelectorAll('[data-photo]:not([data-photo="image"])').forEach(input => { const slide = state?.slides.find(s => s.id === input.closest('[data-id]').dataset.id); if (!slide?.image) input.disabled = true; });
  }
  function ensureUI() {
    const tabs = document.querySelector('.admin-tabs'); const dashboard = document.getElementById('dashboard');
    if (!tabs || !dashboard) return;
    if (!tabs.querySelector('[data-tab="home-carousel"]')) {
      const tab = document.createElement('button'); tab.type = 'button'; tab.dataset.tab = 'home-carousel'; tab.hidden = true; tab.textContent = 'Carrossel da home'; tabs.append(tab);
      tab.addEventListener('click', () => {
        if (identity?.access_level !== 'owner') return;
        dashboard.querySelectorAll(':scope > [id^="tab-"]').forEach(p => { p.style.display = p.id === 'tab-home-carousel' ? 'block' : 'none'; });
        tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === tab));
        if (!state && !busy) load();
      });
      tabs.addEventListener('click', event => { const other = event.target.closest('button[data-tab]'); if (other && other.dataset.tab !== 'home-carousel' && panel()) panel().style.display = 'none'; });
    }
    if (!panel()) {
      const p = document.createElement('section'); p.id = 'tab-home-carousel'; p.className = 'admin-module-panel'; p.style.display = 'none';
      p.innerHTML = `<div class="admin-toolbar admin-module-toolbar"><div><h2>Carrossel da home</h2><p class="carousel-editor-help">Exclusivo do proprietário. Até 5 fotos; nenhuma imagem é publicada antes de salvar.</p></div><a class="btn btn-outline" href="index.html" target="_blank" rel="noopener">Ver a home</a></div>
        <p class="carousel-editor-help">Para cada slide, você pode cadastrar quatro versões: computador claro e escuro (recomendado 1920 × 600 px) e celular claro e escuro (recomendado 1000 × 1000 px). As versões escuras e de celular são opcionais; quando faltarem, o site usa automaticamente a foto clara disponível. Use JPG, PNG ou WebP.</p>
        <div class="carousel-editor-settings"><label><input type="checkbox" id="carousel-autoplay"> Troca automática</label><label for="carousel-interval">Intervalo <select id="carousel-interval">${[6,7,8,9,10,11,12].map(n => `<option value="${n}">${n} segundos</option>`).join('')}</select></label></div>
        <div id="carousel-editor-list" class="carousel-editor-list"></div>
        <div class="carousel-editor-actions"><button type="button" class="btn btn-outline" id="carousel-add">+ Adicionar slide</button><div><button type="button" class="btn btn-outline" id="carousel-reload">Recarregar</button> <button type="button" class="btn btn-primary" id="carousel-save">Salvar carrossel</button></div></div>
        <p id="carousel-editor-status" class="carousel-editor-status" role="status" aria-live="polite"></p>`;
      dashboard.append(p);
      document.getElementById('carousel-add').onclick = () => { if (state.slides.length >= 5) return; const slide = { id: 'slide-' + crypto.randomUUID(), admin_name: '', enabled: true, image: '', mobile_image: '', dark_image: '', dark_mobile_image: '', alt: '', href: '' }; state.slides.push(slide); openSlideId = slide.id; dirty = true; render(); window.requestAnimationFrame(() => document.getElementById(`${slide.id}-admin-name`)?.focus()); };
      document.getElementById('carousel-save').onclick = save;
      document.getElementById('carousel-reload').onclick = async () => { if (dirty && !(await window.RelogioUI.confirm('Descartar as alterações ainda não salvas e recarregar o carrossel?'))) return; load(); };
      document.getElementById('carousel-autoplay').onchange = event => { state.autoplay = event.target.checked; dirty = true; };
      document.getElementById('carousel-interval').onchange = event => { state.interval = Number(event.target.value); dirty = true; };
    }
    tabs.querySelector('[data-tab="home-carousel"]').hidden = identity?.access_level !== 'owner';
    updateButtons();
  }
  async function request(options = {}) {
    const response = await fetch('/api/admin/home-carousel', { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'Não foi possível acessar o carrossel.');
    return data;
  }
  async function load() {
    if (identity?.access_level !== 'owner' || busy || processing) return;
    const generation = session; busy = true; updateButtons(); status('Carregando carrossel…');
    try { const data = await request(); if (session !== generation) return; state = data; dirty = false; render(); status('Carrossel carregado. Escolha as fotos e salve para publicar.'); }
    catch (error) { if (session === generation) { status(error.message); const reload = document.getElementById('carousel-reload'); if (reload) reload.disabled = false; } }
    finally { if (session === generation) { busy = false; updateButtons(); const reload = document.getElementById('carousel-reload'); if (reload) reload.disabled = false; } }
  }
  function render() {
    if (!state || !panel()) return;
    document.getElementById('carousel-autoplay').checked = state.autoplay;
    document.getElementById('carousel-interval').value = String(state.interval);
    const list = document.getElementById('carousel-editor-list');
    list.innerHTML = state.slides.map((s,n) => {
      const title = String(s.admin_name || '').trim() || `Post ${n+1}`;
      const open = s.id === openSlideId;
      const statusLabel = s.enabled && s.image ? 'Ativo' : (s.image ? 'Inativo' : 'Sem foto');
      return `<article class="carousel-editor-card${open ? ' is-open' : ''}" data-id="${esc(s.id)}">
        <div class="carousel-editor-summary">
          <button type="button" class="carousel-editor-toggle" data-toggle aria-expanded="${open}" aria-controls="${esc(s.id)}-body">
            <span class="carousel-editor-thumb">${s.image ? `<img src="${esc(s.image)}" alt="">` : '<span aria-hidden="true">＋</span>'}</span>
            <span class="carousel-editor-summary-copy"><small>Post ${n+1}</small><strong>${esc(title)}</strong></span>
            <span class="carousel-editor-state${s.enabled && s.image ? ' is-active' : ''}">${statusLabel}</span>
            <span class="carousel-editor-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="carousel-editor-order">
            <button type="button" class="btn btn-outline" data-move="-1" aria-label="Mover post ${n+1} para cima" ${n === 0 ? 'hidden' : ''}>↑</button>
            <button type="button" class="btn btn-outline" data-move="1" aria-label="Mover post ${n+1} para baixo" ${n === state.slides.length-1 ? 'hidden' : ''}>↓</button>
          </div>
        </div>
        <div class="carousel-editor-body" id="${esc(s.id)}-body" ${open ? '' : 'hidden'}>
          <div class="carousel-editor-name-row"><label for="${s.id}-admin-name">Nome do post <small>Somente para organização no painel</small></label><input id="${s.id}-admin-name" maxlength="80" value="${esc(s.admin_name || '')}" data-field="admin_name" placeholder="Ex.: G-Shock — Built to Resist"></div>
          <div class="carousel-editor-grid">${[
            ['image','Computador · modo claro','1920 × 600 px',false],
            ['mobile_image','Celular · modo claro (opcional)','1000 × 1000 px',false],
            ['dark_image','Computador · modo escuro (opcional)','1920 × 600 px',true],
            ['dark_mobile_image','Celular · modo escuro (opcional)','1000 × 1000 px',true]
          ].map(([key,label,size,dark]) => `<div class="carousel-editor-photo"><label for="${s.id}-${key}">${label}<small>${size}</small></label><input id="${s.id}-${key}" type="file" accept="image/jpeg,image/png,image/webp" data-photo="${key}" ${key!=='image' && !s.image ? 'disabled' : ''}><div class="carousel-editor-preview${dark ? ' is-dark' : ''}">${s[key] ? `<img src="${esc(s[key])}" alt="Prévia: ${label.toLowerCase()}">` : 'Sem foto'}</div>${s[key] ? `<button type="button" class="btn btn-outline" data-clear="${key}">Retirar foto</button>` : ''}</div>`).join('')}</div>
          <div class="carousel-editor-grid"><div><label for="${s.id}-alt">Descrição da foto (acessibilidade)</label><input id="${s.id}-alt" maxlength="180" value="${esc(s.alt)}" data-field="alt" placeholder="Ex.: três relógios G-Shock sobre fundo claro"></div><div><label for="${s.id}-href">Destino ao clicar (opcional)</label><input id="${s.id}-href" maxlength="300" value="${esc(s.href)}" data-field="href" placeholder="produtos.html?marca=G-Shock"></div></div>
          <div class="carousel-editor-footer"><label><input type="checkbox" data-enabled ${s.enabled ? 'checked' : ''}> Ativar este post quando houver foto principal</label><button type="button" class="btn btn-outline carousel-editor-remove" data-remove>Remover post</button></div>
        </div>
      </article>`;
    }).join('');
    list.querySelectorAll('.carousel-editor-card').forEach(card => {
      const slide = state.slides.find(s => s.id === card.dataset.id);
      card.querySelector('[data-toggle]').onclick = () => { openSlideId = openSlideId === slide.id ? null : slide.id; render(); };
      card.querySelectorAll('[data-field]').forEach(input => input.oninput = () => { slide[input.dataset.field] = input.value; dirty = true; if (input.dataset.field === 'admin_name') { const strong = card.querySelector('.carousel-editor-summary-copy strong'); if (strong) strong.textContent = input.value.trim() || `Post ${state.slides.indexOf(slide)+1}`; } });
      card.querySelector('[data-enabled]').onchange = event => { slide.enabled = event.target.checked; dirty = true; };
      card.querySelectorAll('[data-photo]').forEach(input => input.onchange = () => upload(input.files[0], slide, input.dataset.photo));
      card.querySelectorAll('[data-clear]').forEach(button => button.onclick = () => { slide[button.dataset.clear] = ''; if (button.dataset.clear === 'image') { slide.mobile_image = ''; slide.dark_image = ''; slide.dark_mobile_image = ''; } dirty = true; openSlideId = slide.id; render(); });
      card.querySelectorAll('[data-move]').forEach(button => button.onclick = event => { event.stopPropagation(); const from = state.slides.indexOf(slide), to = from + Number(button.dataset.move); if (to < 0 || to >= state.slides.length) return; [state.slides[from],state.slides[to]] = [state.slides[to],state.slides[from]]; openSlideId = slide.id; dirty = true; render(); panel().querySelector(`[data-id="${slide.id}"] [data-toggle]`)?.focus(); });
      card.querySelector('[data-remove]').onclick = async () => { const generation = session; const name = String(slide.admin_name || '').trim() || `Post ${state.slides.indexOf(slide)+1}`; if (!(await window.RelogioUI.confirm(`Remover “${name}”? A mudança só será publicada ao salvar.`)) || session !== generation || !state || busy || processing) return; state.slides = state.slides.filter(s => s !== slide); if (openSlideId === slide.id) openSlideId = null; dirty = true; render(); };
    });
    updateButtons();
  }
  async function optimizedPhoto(file, key) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Escolha uma foto JPG, PNG ou WebP.');
    if (file.size > 12*1024*1024) throw Error('A foto original deve ter até 12 MB.');
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40000000) throw Error('A foto tem resolução muito alta. Reduza para até 40 megapixels.');
      const limit = key === 'mobile_image' || key === 'dark_mobile_image' ? 1000 : 1920;
      const scale = Math.min(1, limit/bitmap.width, limit/bitmap.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(bitmap.width*scale)); canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      const context = canvas.getContext('2d'); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [.86,.76,.66,.56,.46]) { const data = canvas.toDataURL('image/webp', quality); if (data.length <= 600*1024*4/3 + 24) return data; }
      throw Error('A foto continua muito grande. Use uma imagem mais leve.');
    } finally { bitmap.close(); }
  }
  async function upload(file, slide, key) {
    if (!file || busy || processing) return;
    const generation = session; processing++; updateButtons(); status('Otimizando foto…');
    try { const data = await optimizedPhoto(file, key); if (session !== generation || !state.slides.includes(slide)) return; slide[key] = data; dirty = true; render(); status('Foto preparada. Preencha a descrição e salve para publicar.'); }
    catch (error) { if (session === generation) status(error.message); }
    finally { if (session === generation) { processing--; updateButtons(); } }
  }
  async function save() {
    if (!state || busy || processing || identity?.access_level !== 'owner') return;
    if (state.slides.some(s => (s.image || s.mobile_image || s.dark_image || s.dark_mobile_image) && !s.alt.trim())) { status('Preencha a descrição de cada foto antes de salvar.'); return; }
    const generation = session; busy = true; updateButtons(); status('Salvando carrossel…');
    try { const data = await request({ method:'PUT', body:JSON.stringify(state) }); if (session !== generation) return; state = data; dirty = false; render(); status('Carrossel salvo e publicado na home.'); }
    catch (error) { if (session === generation) status(error.message); }
    finally { if (session === generation) { busy = false; updateButtons(); } }
  }
  function applyIdentity(admin) {
    const changed = identity?.id !== admin?.id || identity?.access_level !== admin?.access_level;
    identity = admin || null;
    if (changed) { session++; state = null; dirty = false; busy = false; processing = 0; const list = document.getElementById('carousel-editor-list'); if (list) list.replaceChildren(); status(''); }
    ensureUI();
    if (identity?.access_level !== 'owner' && panel()) panel().style.display = 'none';
  }
  window.addEventListener('reloja:admin-session', event => applyIdentity(event.detail?.admin));
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyIdentity(window.RelogioAdminClient?.admin), { once:true });
  else applyIdentity(window.RelogioAdminClient?.admin);
})();
