(() => {
  'use strict';
  if (window.__relogioAccessibilityPanelLoaded) return;
  window.__relogioAccessibilityPanelLoaded = true;

  const KEYS = {
    contrast: 'reloja_high_contrast', dark: 'reloja_dark_mode', scale: 'reloja_text_scale',
    readable: 'reloja_access_readable_font', spacing: 'reloja_access_spacing', links: 'reloja_access_underlined_links',
    motion: 'reloja_access_reduce_motion', focus: 'reloja_access_focus', targets: 'reloja_access_targets', guide: 'reloja_access_reading_guide'
  };
  const root = document.documentElement;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const bool = key => read(key) === '1';

  function injectStyles() {
    if (document.getElementById('reloja-accessibility-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'reloja-accessibility-panel-style';
    style.textContent = `
      .reloja-a11y-trigger{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(132px,env(safe-area-inset-bottom) + 132px);z-index:350;border:2px solid currentColor;background:var(--bg,#fff);color:var(--ink,#111);width:44px;height:44px;border-radius:50%;font:700 18px/1 Arial,sans-serif;display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.16)}
      .reloja-a11y-trigger:focus-visible{outline:4px solid var(--red,#b00020);outline-offset:3px}
      .reloja-a11y-backdrop{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.58);display:none;align-items:flex-end;justify-content:flex-start;padding:16px}
      .reloja-a11y-backdrop.open{display:flex}.reloja-a11y-panel{width:min(430px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:2px solid var(--ink,#111);box-shadow:0 24px 80px rgba(0,0,0,.3);padding:22px}
      .reloja-a11y-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid var(--line,#ddd);padding-bottom:14px;margin-bottom:14px}.reloja-a11y-head h2{margin:0 0 4px;font:700 1.35rem/1.15 var(--font-display,Arial,sans-serif)}.reloja-a11y-head p{margin:0;color:var(--ink-soft,#555);font-size:.82rem;line-height:1.45}.reloja-a11y-close{border:1px solid currentColor;background:transparent;color:inherit;width:38px;height:38px;font-size:22px;cursor:pointer}
      .reloja-a11y-group{border:0;padding:0;margin:18px 0}.reloja-a11y-group legend{font-weight:700;margin-bottom:9px}.reloja-a11y-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line,#ddd)}.reloja-a11y-row:last-child{border-bottom:0}.reloja-a11y-row span{font-size:.88rem;line-height:1.4}.reloja-a11y-row small{display:block;color:var(--ink-soft,#666);font-size:.72rem;margin-top:2px}.reloja-a11y-row input[type=checkbox]{width:22px;height:22px;flex:0 0 auto}.reloja-a11y-row select{min-width:120px;padding:8px;border:1px solid currentColor;background:var(--bg,#fff);color:inherit;font:inherit}.reloja-a11y-reset{width:100%;min-height:44px;border:1px solid currentColor;background:transparent;color:inherit;font-weight:700;cursor:pointer}.reloja-a11y-status{position:absolute;left:-9999px}
      .reloja-skip-link{position:fixed;left:12px;top:12px;z-index:700;transform:translateY(-150%);background:#000;color:#fff;padding:12px 16px;font-weight:700;text-decoration:none}.reloja-skip-link:focus{transform:none}
      html.reloja-readable-font body,html.reloja-readable-font button,html.reloja-readable-font input,html.reloja-readable-font select,html.reloja-readable-font textarea{font-family:Arial,Verdana,Helvetica,sans-serif!important}
      html.reloja-spacious-text body{line-height:1.72!important;letter-spacing:.025em!important;word-spacing:.07em!important}html.reloja-spacious-text p,html.reloja-spacious-text li,html.reloja-spacious-text dd{line-height:1.8!important}
      html.reloja-underlined-links a:not(.btn):not([class*=button]){text-decoration:underline!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important}
      html.reloja-reduce-motion *,html.reloja-reduce-motion *::before,html.reloja-reduce-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
      html.reloja-strong-focus :focus-visible{outline:4px solid #b00020!important;outline-offset:4px!important;box-shadow:0 0 0 2px #fff!important}
      html.reloja-large-targets button,html.reloja-large-targets .btn,html.reloja-large-targets input,html.reloja-large-targets select,html.reloja-large-targets textarea{min-height:44px!important}html.reloja-large-targets a.nav-icon-link,html.reloja-large-targets .nav-links a{min-height:44px!important;display:inline-flex!important;align-items:center!important}
      .reloja-reading-guide{position:fixed;left:0;right:0;height:34px;z-index:340;pointer-events:none;display:none;border-top:2px solid rgba(176,0,32,.7);border-bottom:2px solid rgba(176,0,32,.7);background:rgba(255,235,59,.10)}html.reloja-reading-guide-on .reloja-reading-guide{display:block}
      html.reloja-dark .reloja-a11y-panel,html.reloja-dark .reloja-a11y-trigger{background:#17191c!important;color:#f5f5f2!important;border-color:#f5f5f2!important}html.reloja-dark .reloja-a11y-row select{background:#111214!important;color:#fff!important}
      html.reloja-high-contrast .reloja-a11y-panel,html.reloja-high-contrast .reloja-a11y-trigger{background:#fff!important;color:#000!important;border:3px solid #000!important}html.reloja-high-contrast .reloja-a11y-backdrop{background:rgba(0,0,0,.75)}
      @media(max-width:600px){.reloja-a11y-backdrop{padding:0}.reloja-a11y-panel{width:100%;max-height:88vh;border-left:0;border-right:0;border-bottom:0}.reloja-a11y-trigger{left:10px;bottom:132px}}
    `;
    document.head.appendChild(style);
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
    const scale = Math.max(100, Math.min(140, Number(read(KEYS.scale) || (root.classList.contains('reloja-large-text') ? 112.5 : 100))));
    root.style.fontSize = `${scale}%`;
    syncForm();
  }

  function setBool(key, enabled) { write(key, enabled ? '1' : '0'); apply(); announce('Preferência atualizada.'); }
  function setContrast(enabled) { write(KEYS.contrast, enabled ? '1' : '0'); if (enabled) write(KEYS.dark, '0'); apply(); }
  function setDark(enabled) { write(KEYS.dark, enabled ? '1' : '0'); if (enabled) write(KEYS.contrast, '0'); apply(); }

  let panel, status, lastFocus;
  function syncForm() {
    if (!panel) return;
    const map = { contrast: KEYS.contrast, dark: KEYS.dark, readable: KEYS.readable, spacing: KEYS.spacing, links: KEYS.links, motion: KEYS.motion, focus: KEYS.focus, targets: KEYS.targets, guide: KEYS.guide };
    Object.entries(map).forEach(([name, key]) => { const input = panel.querySelector(`[name="${name}"]`); if (input) input.checked = bool(key); });
    const scale = panel.querySelector('[name="scale"]'); if (scale) scale.value = String(Number(read(KEYS.scale) || 100));
  }
  function announce(message) { if (status) { status.textContent = ''; requestAnimationFrame(() => { status.textContent = message; }); } }
  function open() { lastFocus = document.activeElement; panel.parentElement.classList.add('open'); panel.parentElement.setAttribute('aria-hidden','false'); setTimeout(() => panel.querySelector('.reloja-a11y-close')?.focus(), 20); }
  function close() { panel.parentElement.classList.remove('open'); panel.parentElement.setAttribute('aria-hidden','true'); lastFocus?.focus?.(); }

  function reset() {
    Object.values(KEYS).forEach(key => { try { localStorage.removeItem(key); } catch {} });
    try { localStorage.removeItem('reloja_large_text'); } catch {}
    root.style.fontSize = '';
    ['reloja-readable-font','reloja-spacious-text','reloja-underlined-links','reloja-reduce-motion','reloja-strong-focus','reloja-large-targets','reloja-reading-guide-on','reloja-high-contrast','reloja-dark','reloja-large-text'].forEach(cls => root.classList.remove(cls));
    apply(); announce('Preferências de acessibilidade restauradas.');
  }

  function install() {
    injectStyles();
    if (!document.querySelector('.reloja-skip-link')) {
      const skip = document.createElement('a'); skip.className = 'reloja-skip-link'; skip.href = '#main-content'; skip.textContent = 'Ir para o conteúdo principal';
      const main = document.querySelector('main') || document.querySelector('[role=main]'); if (main && !main.id) main.id = 'main-content'; else if (main) skip.href = `#${main.id}`;
      document.body.prepend(skip);
    }
    const guide = document.createElement('div'); guide.className = 'reloja-reading-guide'; guide.setAttribute('aria-hidden','true'); document.body.appendChild(guide);
    const moveGuide = y => { if (bool(KEYS.guide)) guide.style.top = `${Math.max(0, y - 17)}px`; };
    document.addEventListener('pointermove', event => moveGuide(event.clientY), { passive: true });
    document.addEventListener('focusin', event => { if (bool(KEYS.guide)) { const r = event.target?.getBoundingClientRect?.(); if (r) moveGuide(r.top + Math.min(r.height / 2, 24)); } });

    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'reloja-a11y-trigger'; trigger.setAttribute('aria-label','Abrir painel de acessibilidade'); trigger.title = 'Acessibilidade (Alt+A)'; trigger.textContent = 'A'; document.body.appendChild(trigger);
    const backdrop = document.createElement('div'); backdrop.className = 'reloja-a11y-backdrop'; backdrop.setAttribute('aria-hidden','true');
    backdrop.innerHTML = `<section class="reloja-a11y-panel" role="dialog" aria-modal="true" aria-labelledby="reloja-a11y-title"><div class="reloja-a11y-head"><div><h2 id="reloja-a11y-title">Acessibilidade</h2><p>Ajuste a leitura e a navegação. As preferências ficam salvas neste navegador.</p></div><button class="reloja-a11y-close" type="button" aria-label="Fechar painel">×</button></div><fieldset class="reloja-a11y-group"><legend>Visualização</legend><label class="reloja-a11y-row"><span>Alto contraste<small>Preto e branco com contornos reforçados.</small></span><input name="contrast" type="checkbox"></label><label class="reloja-a11y-row"><span>Modo escuro<small>Reduz luminosidade da interface.</small></span><input name="dark" type="checkbox"></label><label class="reloja-a11y-row"><span>Tamanho do texto<small>Amplia o texto sem usar zoom do navegador.</small></span><select name="scale"><option value="100">100%</option><option value="112.5">112%</option><option value="125">125%</option><option value="140">140%</option></select></label><label class="reloja-a11y-row"><span>Fonte de alta legibilidade<small>Usa uma família sem serifa mais simples.</small></span><input name="readable" type="checkbox"></label><label class="reloja-a11y-row"><span>Mais espaçamento<small>Aumenta linhas, letras e palavras.</small></span><input name="spacing" type="checkbox"></label><label class="reloja-a11y-row"><span>Sublinhar links<small>Facilita identificar elementos clicáveis.</small></span><input name="links" type="checkbox"></label></fieldset><fieldset class="reloja-a11y-group"><legend>Navegação e movimento</legend><label class="reloja-a11y-row"><span>Reduzir animações<small>Minimiza movimentos e transições.</small></span><input name="motion" type="checkbox"></label><label class="reloja-a11y-row"><span>Foco reforçado<small>Destaca o elemento selecionado pelo teclado.</small></span><input name="focus" type="checkbox"></label><label class="reloja-a11y-row"><span>Botões e campos maiores<small>Aumenta alvos de clique e toque.</small></span><input name="targets" type="checkbox"></label><label class="reloja-a11y-row"><span>Guia de leitura<small>Exibe uma faixa horizontal acompanhando ponteiro ou foco.</small></span><input name="guide" type="checkbox"></label></fieldset><button class="reloja-a11y-reset" type="button">Restaurar padrão</button><div class="reloja-a11y-status" aria-live="polite"></div></section>`;
    document.body.appendChild(backdrop); panel = backdrop.querySelector('.reloja-a11y-panel'); status = panel.querySelector('.reloja-a11y-status');
    trigger.addEventListener('click', open); panel.querySelector('.reloja-a11y-close').addEventListener('click', close); backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); }); panel.querySelector('.reloja-a11y-reset').addEventListener('click', reset);
    panel.querySelector('[name=contrast]').addEventListener('change', e => setContrast(e.target.checked)); panel.querySelector('[name=dark]').addEventListener('change', e => setDark(e.target.checked));
    ['readable','spacing','links','motion','focus','targets','guide'].forEach(name => panel.querySelector(`[name=${name}]`).addEventListener('change', e => setBool(KEYS[name], e.target.checked)));
    panel.querySelector('[name=scale]').addEventListener('change', e => { write(KEYS.scale, e.target.value); apply(); announce(`Tamanho do texto: ${e.target.value}%.`); });
    document.addEventListener('keydown', e => { if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); backdrop.classList.contains('open') ? close() : open(); } if (e.key === 'Escape' && backdrop.classList.contains('open')) close(); });
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
})();
