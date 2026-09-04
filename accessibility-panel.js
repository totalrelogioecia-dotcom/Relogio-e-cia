(() => {
  'use strict';
  if (window.__relogioAccessibilityPanelLoaded) return;
  window.__relogioAccessibilityPanelLoaded = true;

  const KEYS = {
    contrast: 'reloja_high_contrast',
    dark: 'reloja_dark_mode',
    scale: 'reloja_text_scale',
    readable: 'reloja_access_readable_font',
    spacing: 'reloja_access_spacing',
    links: 'reloja_access_underlined_links',
    motion: 'reloja_access_reduce_motion',
    focus: 'reloja_access_focus',
    targets: 'reloja_access_targets',
    guide: 'reloja_access_reading_guide'
  };
  const LEGACY_LARGE_TEXT_KEY = 'reloja_large_text';
  const root = document.documentElement;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const remove = key => { try { localStorage.removeItem(key); } catch {} };
  const bool = key => read(key) === '1';

  function migrateLegacyTextPreference() {
    if (read(KEYS.scale) == null && read(LEGACY_LARGE_TEXT_KEY) === '1') write(KEYS.scale, '112.5');
    remove(LEGACY_LARGE_TEXT_KEY);
    root.classList.remove('reloja-large-text');
  }

  function injectStyles() {
    if (document.getElementById('reloja-accessibility-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'reloja-accessibility-panel-style';
    style.textContent = `
      .reloja-accessibility-global-rail,
      .reloja-accessibility-header,
      .reloja-accessibility-rail{display:none!important}

      .reloja-a11y-trigger{
        position:static!important;
        flex:0 0 40px;
        width:40px;
        height:40px;
        min-width:40px;
        min-height:40px;
        margin:0 8px 0 0;
        padding:0;
        border:1px solid var(--ink,#111);
        border-radius:0;
        background:var(--bg,#fff);
        color:var(--ink,#111);
        box-shadow:none;
        display:inline-grid;
        place-items:center;
        font:700 .82rem/1 var(--font-mono,monospace);
        letter-spacing:.02em;
        cursor:pointer;
        transition:background .16s,color .16s,border-color .16s
      }
      .reloja-a11y-trigger:hover{background:var(--ink,#111);color:var(--bg,#fff)}
      .reloja-a11y-trigger[aria-expanded="true"]{background:var(--ink,#111);color:var(--bg,#fff)}
      .reloja-a11y-trigger:focus-visible{outline:3px solid var(--red,#b00020);outline-offset:3px}

      .reloja-a11y-backdrop{
        position:fixed;
        inset:0;
        z-index:500;
        background:rgba(0,0,0,.58);
        display:none;
        align-items:flex-start;
        justify-content:flex-end;
        padding:86px max(16px,env(safe-area-inset-right)) 16px 16px
      }
      .reloja-a11y-backdrop.open{display:flex}
      .reloja-a11y-panel{
        width:min(430px,100%);
        max-height:calc(100vh - 102px);
        overflow:auto;
        background:var(--bg,#fff);
        color:var(--ink,#111);
        border:2px solid var(--ink,#111);
        border-radius:0;
        box-shadow:0 24px 80px rgba(0,0,0,.3);
        padding:22px
      }
      .reloja-a11y-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid var(--line,#ddd);padding-bottom:14px;margin-bottom:14px}
      .reloja-a11y-head h2{margin:0 0 4px;font:700 1.35rem/1.15 var(--font-display,Arial,sans-serif)}
      .reloja-a11y-head p{margin:0;color:var(--ink-soft,#555);font-size:.82rem;line-height:1.45}
      .reloja-a11y-close{border:1px solid currentColor;border-radius:0;background:transparent;color:inherit;width:38px;height:38px;font-size:22px;cursor:pointer}
      .reloja-a11y-group{border:0;padding:0;margin:18px 0}
      .reloja-a11y-group legend{font-family:var(--font-mono,monospace);font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-bottom:9px}
      .reloja-a11y-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line,#ddd)}
      .reloja-a11y-row:last-child{border-bottom:0}
      .reloja-a11y-row span{font-size:.88rem;line-height:1.4}
      .reloja-a11y-row small{display:block;color:var(--ink-soft,#666);font-size:.72rem;margin-top:2px}
      .reloja-a11y-row input[type=checkbox]{width:22px;height:22px;flex:0 0 auto}
      .reloja-a11y-row select{min-width:120px;padding:8px;border:1px solid currentColor;border-radius:0;background:var(--bg,#fff);color:inherit;font:inherit}
      .reloja-a11y-reset{width:100%;min-height:44px;border:1px solid currentColor;border-radius:0;background:transparent;color:inherit;font-family:var(--font-mono,monospace);font-weight:700;cursor:pointer}
      .reloja-a11y-status{position:absolute;left:-9999px}
      .reloja-skip-link{position:fixed;left:12px;top:12px;z-index:700;transform:translateY(-150%);background:#000;color:#fff;padding:12px 16px;font-weight:700;text-decoration:none}
      .reloja-skip-link:focus{transform:none}

      html.reloja-readable-font body,
      html.reloja-readable-font button,
      html.reloja-readable-font input,
      html.reloja-readable-font select,
      html.reloja-readable-font textarea{font-family:Arial,Verdana,Helvetica,sans-serif!important}
      html.reloja-spacious-text body{line-height:1.72!important;letter-spacing:.025em!important;word-spacing:.07em!important}
      html.reloja-spacious-text p,
      html.reloja-spacious-text li,
      html.reloja-spacious-text dd{line-height:1.8!important}
      html.reloja-underlined-links a:not(.btn):not([class*=button]){text-decoration:underline!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important}
      html.reloja-reduce-motion *,
      html.reloja-reduce-motion *::before,
      html.reloja-reduce-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
      html.reloja-strong-focus :focus-visible{outline:4px solid #b00020!important;outline-offset:4px!important;box-shadow:0 0 0 2px #fff!important}
      html.reloja-large-targets button,
      html.reloja-large-targets .btn,
      html.reloja-large-targets input,
      html.reloja-large-targets select,
      html.reloja-large-targets textarea{min-height:44px!important}
      html.reloja-large-targets a.nav-icon-link,
      html.reloja-large-targets .nav-links a{min-height:44px!important;display:inline-flex!important;align-items:center!important}
      .reloja-reading-guide{position:fixed;left:0;right:0;height:34px;z-index:340;pointer-events:none;display:none;border-top:2px solid rgba(176,0,32,.7);border-bottom:2px solid rgba(176,0,32,.7);background:rgba(255,235,59,.10)}
      html.reloja-reading-guide-on .reloja-reading-guide{display:block}

      html.reloja-dark .reloja-a11y-panel,
      html.reloja-dark .reloja-a11y-trigger{background:#17191c!important;color:#f5f5f2!important;border-color:#f5f5f2!important}
      html.reloja-dark .reloja-a11y-trigger:hover,
      html.reloja-dark .reloja-a11y-trigger[aria-expanded="true"]{background:#f5f5f2!important;color:#111!important}
      html.reloja-dark .reloja-a11y-row select{background:#111214!important;color:#fff!important}
      html.reloja-high-contrast .reloja-a11y-panel,
      html.reloja-high-contrast .reloja-a11y-trigger{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .reloja-a11y-trigger:hover,
      html.reloja-high-contrast .reloja-a11y-trigger[aria-expanded="true"]{background:#000!important;color:#fff!important}
      html.reloja-high-contrast .reloja-a11y-backdrop{background:rgba(0,0,0,.75)}

      @media(max-width:640px){
        .reloja-a11y-trigger{flex-basis:40px;width:40px;height:40px;margin:0}
        .reloja-a11y-backdrop{padding:72px 0 0;align-items:flex-start}
        .reloja-a11y-panel{width:100%;max-height:calc(100vh - 72px);border-left:0;border-right:0;border-bottom:0;padding:18px}
      }
    `;
    document.head.appendChild(style);
  }

  function effectiveScale() {
    return Math.max(100, Math.min(140, Number(read(KEYS.scale) || 100)));
  }

  function apply() {
    const contrast = bool(KEYS.contrast);
    const dark = bool(KEYS.dark) && !contrast;
    root.classList.toggle('reloja-high-contrast', contrast);
    root.classList.toggle('reloja-dark', dark);
    root.classList.toggle('reloja-readable-font', bool(KEYS.readable));
    root.classList.toggle('reloja-spacious-text', bool(KEYS.spacing));
    root.classList.toggle('reloja-underlined-links', bool(KEYS.links));
    root.classList.toggle('reloja-reduce-motion', bool(KEYS.motion));
    root.classList.toggle('reloja-strong-focus', bool(KEYS.focus));
    root.classList.toggle('reloja-large-targets', bool(KEYS.targets));
    root.classList.toggle('reloja-reading-guide-on', bool(KEYS.guide));
    root.classList.remove('reloja-large-text');
    root.style.fontSize = `${effectiveScale()}%`;
    syncForm();
  }

  function setBool(key, enabled) {
    write(key, enabled ? '1' : '0');
    apply();
    announce('Preferência atualizada.');
  }

  function setContrast(enabled) {
    write(KEYS.contrast, enabled ? '1' : '0');
    if (enabled) write(KEYS.dark, '0');
    apply();
    announce(enabled ? 'Alto contraste ativado.' : 'Alto contraste desativado.');
  }

  function setDark(enabled) {
    write(KEYS.dark, enabled ? '1' : '0');
    if (enabled) write(KEYS.contrast, '0');
    apply();
    announce(enabled ? 'Modo escuro ativado.' : 'Modo escuro desativado.');
  }

  let panel;
  let status;
  let lastFocus;
  let trigger;

  function syncForm() {
    if (!panel) return;
    const map = {
      contrast: KEYS.contrast,
      dark: KEYS.dark,
      readable: KEYS.readable,
      spacing: KEYS.spacing,
      links: KEYS.links,
      motion: KEYS.motion,
      focus: KEYS.focus,
      targets: KEYS.targets,
      guide: KEYS.guide
    };
    Object.entries(map).forEach(([name, key]) => {
      const input = panel.querySelector(`[name="${name}"]`);
      if (input) input.checked = bool(key);
    });
    const scale = panel.querySelector('[name="scale"]');
    if (scale) scale.value = String(effectiveScale());
  }

  function announce(message) {
    if (!status) return;
    status.textContent = '';
    requestAnimationFrame(() => { status.textContent = message; });
  }

  function open() {
    if (!panel) return;
    lastFocus = document.activeElement;
    panel.parentElement.classList.add('open');
    panel.parentElement.setAttribute('aria-hidden', 'false');
    trigger?.setAttribute('aria-expanded', 'true');
    setTimeout(() => panel.querySelector('.reloja-a11y-close')?.focus(), 20);
  }

  function close() {
    if (!panel) return;
    panel.parentElement.classList.remove('open');
    panel.parentElement.setAttribute('aria-hidden', 'true');
    trigger?.setAttribute('aria-expanded', 'false');
    lastFocus?.focus?.();
  }

  function reset() {
    Object.values(KEYS).forEach(remove);
    remove(LEGACY_LARGE_TEXT_KEY);
    root.style.fontSize = '';
    [
      'reloja-readable-font',
      'reloja-spacious-text',
      'reloja-underlined-links',
      'reloja-reduce-motion',
      'reloja-strong-focus',
      'reloja-large-targets',
      'reloja-reading-guide-on',
      'reloja-high-contrast',
      'reloja-dark',
      'reloja-large-text'
    ].forEach(cls => root.classList.remove(cls));
    apply();
    announce('Preferências de acessibilidade restauradas.');
  }

  function removeLegacyFloatingControls() {
    document.querySelectorAll(
      '.reloja-accessibility-global-rail,.reloja-accessibility-header,.reloja-accessibility-rail'
    ).forEach(node => node.remove());
  }

  function installTrigger() {
    const nav = document.querySelector('.site-header .nav');
    if (!nav) return null;

    const existing = nav.querySelector('.reloja-a11y-trigger');
    if (existing) return existing;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reloja-a11y-trigger';
    button.setAttribute('aria-label', 'Abrir painel de acessibilidade');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'reloja-a11y-panel');
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Acessibilidade (Alt+A)';
    button.textContent = 'A';

    const catalog = nav.querySelector('.nav-cta');
    const mobileToggle = nav.querySelector('.nav-toggle');
    nav.insertBefore(button, catalog || mobileToggle || null);
    return button;
  }

  function install() {
    migrateLegacyTextPreference();
    injectStyles();
    removeLegacyFloatingControls();

    if (!document.querySelector('.reloja-skip-link')) {
      const skip = document.createElement('a');
      skip.className = 'reloja-skip-link';
      skip.href = '#main-content';
      skip.textContent = 'Ir para o conteúdo principal';
      const main = document.querySelector('main') || document.querySelector('[role=main]');
      if (main && !main.id) main.id = 'main-content';
      if (main) skip.href = `#${main.id}`;
      document.body.prepend(skip);
    }

    let guide = document.querySelector('.reloja-reading-guide');
    if (!guide) {
      guide = document.createElement('div');
      guide.className = 'reloja-reading-guide';
      guide.setAttribute('aria-hidden', 'true');
      document.body.appendChild(guide);
    }
    const moveGuide = y => {
      if (bool(KEYS.guide)) guide.style.top = `${Math.max(0, y - 17)}px`;
    };
    document.addEventListener('pointermove', event => moveGuide(event.clientY), { passive: true });
    document.addEventListener('focusin', event => {
      if (!bool(KEYS.guide)) return;
      const rect = event.target?.getBoundingClientRect?.();
      if (rect) moveGuide(rect.top + Math.min(rect.height / 2, 24));
    });

    trigger = installTrigger();

    const backdrop = document.createElement('div');
    backdrop.className = 'reloja-a11y-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <section id="reloja-a11y-panel" class="reloja-a11y-panel" role="dialog" aria-modal="true" aria-labelledby="reloja-a11y-title">
        <div class="reloja-a11y-head">
          <div>
            <h2 id="reloja-a11y-title">Acessibilidade</h2>
            <p>Todos os ajustes ficam reunidos aqui e salvos neste navegador.</p>
          </div>
          <button class="reloja-a11y-close" type="button" aria-label="Fechar painel">×</button>
        </div>

        <fieldset class="reloja-a11y-group">
          <legend>Visualização</legend>
          <label class="reloja-a11y-row"><span>Alto contraste<small>Preto e branco com contornos reforçados.</small></span><input name="contrast" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Modo escuro<small>Reduz a luminosidade da interface.</small></span><input name="dark" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Tamanho do texto<small>Amplia o texto sem usar o zoom do navegador.</small></span><select name="scale"><option value="100">100%</option><option value="112.5">112%</option><option value="125">125%</option><option value="140">140%</option></select></label>
          <label class="reloja-a11y-row"><span>Fonte de alta legibilidade<small>Usa uma família sem serifa mais simples.</small></span><input name="readable" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Mais espaçamento<small>Aumenta linhas, letras e palavras.</small></span><input name="spacing" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Sublinhar links<small>Facilita identificar elementos clicáveis.</small></span><input name="links" type="checkbox"></label>
        </fieldset>

        <fieldset class="reloja-a11y-group">
          <legend>Navegação e movimento</legend>
          <label class="reloja-a11y-row"><span>Reduzir animações<small>Minimiza movimentos e transições.</small></span><input name="motion" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Foco reforçado<small>Destaca o elemento selecionado pelo teclado.</small></span><input name="focus" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Botões e campos maiores<small>Aumenta alvos de clique e toque.</small></span><input name="targets" type="checkbox"></label>
          <label class="reloja-a11y-row"><span>Guia de leitura<small>Exibe uma faixa horizontal acompanhando ponteiro ou foco.</small></span><input name="guide" type="checkbox"></label>
        </fieldset>

        <button class="reloja-a11y-reset" type="button">Restaurar padrão</button>
        <div class="reloja-a11y-status" aria-live="polite"></div>
      </section>
    `;
    document.body.appendChild(backdrop);
    panel = backdrop.querySelector('.reloja-a11y-panel');
    status = panel.querySelector('.reloja-a11y-status');

    trigger?.addEventListener('click', open);
    panel.querySelector('.reloja-a11y-close').addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    panel.querySelector('.reloja-a11y-reset').addEventListener('click', reset);
    panel.querySelector('[name=contrast]').addEventListener('change', event => setContrast(event.target.checked));
    panel.querySelector('[name=dark]').addEventListener('change', event => setDark(event.target.checked));
    ['readable', 'spacing', 'links', 'motion', 'focus', 'targets', 'guide'].forEach(name => {
      panel.querySelector(`[name=${name}]`).addEventListener('change', event => setBool(KEYS[name], event.target.checked));
    });
    panel.querySelector('[name=scale]').addEventListener('change', event => {
      write(KEYS.scale, event.target.value);
      apply();
      announce(`Tamanho do texto: ${event.target.value}%.`);
    });

    document.addEventListener('keydown', event => {
      if (event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        backdrop.classList.contains('open') ? close() : open();
      }
      if (event.key === 'Escape' && backdrop.classList.contains('open')) close();
    });

    const observer = new MutationObserver(removeLegacyFloatingControls);
    observer.observe(document.body, { childList: true });

    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();