/* RELÓGIO E CIA — diálogos acessíveis no estilo visual da loja */
(function () {
  'use strict';

  const STYLE_ID = 'reloja-dialog-styles';
  const LAYER_ID = 'reloja-dialog-layer';
  let activeResolve = null;
  let lastFocused = null;

  function ensureUi() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        body.reloja-dialog-open{overflow:hidden}
        .reloja-dialog-layer{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:22px;background:rgba(13,13,13,.66);backdrop-filter:blur(4px);animation:reloja-dialog-fade .18s ease-out}
        .reloja-dialog-layer[hidden]{display:none!important}
        .reloja-dialog{position:relative;width:min(500px,100%);border:1px solid var(--ink,#161616);background:var(--paper,#f5f3ef);box-shadow:0 28px 85px rgba(0,0,0,.34);color:var(--ink,#161616);animation:reloja-dialog-rise .22s ease-out}
        .reloja-dialog::before{content:'';position:absolute;inset:0 0 auto;height:4px;background:var(--red,#d71920)}
        .reloja-dialog__close{position:absolute;top:14px;right:14px;width:34px;height:34px;border:1px solid var(--line,#cbc8c1);background:transparent;color:var(--ink,#161616);font:500 1rem/1 var(--font-mono,monospace);cursor:pointer;transition:.16s ease}
        .reloja-dialog__close:hover,.reloja-dialog__close:focus-visible{border-color:var(--red,#d71920);color:var(--red,#d71920);outline:none}
        .reloja-dialog__body{padding:34px 38px 28px}
        .reloja-dialog__status{display:flex;align-items:center;gap:12px;padding-right:42px}
        .reloja-dialog__mark{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid var(--red,#d71920);background:var(--red,#d71920);color:#fff;font:700 .9rem/1 var(--font-mono,monospace)}
        .reloja-dialog-layer[data-tone="success"] .reloja-dialog__mark{background:var(--ink,#161616);border-color:var(--ink,#161616)}
        .reloja-dialog__kicker{margin:0;color:var(--red,#d71920);font:600 .67rem/1.4 var(--font-mono,monospace);letter-spacing:.11em;text-transform:uppercase}
        .reloja-dialog h2{margin:18px 0 10px;font:700 clamp(1.45rem,4vw,2rem)/1.08 var(--font-display,"Space Grotesk",sans-serif);letter-spacing:-.025em}
        .reloja-dialog__message,.reloja-dialog__detail{margin:0;color:var(--ink-soft,#4d4d4d);font:400 .94rem/1.58 var(--font-body,"IBM Plex Sans",sans-serif)}
        .reloja-dialog__detail{margin-top:8px;font-size:.82rem}
        .reloja-dialog__detail[hidden]{display:none}
        .reloja-dialog__actions{display:flex;justify-content:flex-end;gap:9px;padding:18px 38px 28px;border-top:1px solid var(--line,#d6d2ca)}
        .reloja-dialog__button{min-height:44px;padding:0 18px;border:1px solid var(--ink,#161616);font:600 .68rem/1 var(--font-mono,monospace);letter-spacing:.075em;text-transform:uppercase;cursor:pointer;transition:.16s ease}
        .reloja-dialog__button--primary{background:var(--ink,#161616);color:#fff}
        .reloja-dialog__button--primary:hover,.reloja-dialog__button--primary:focus-visible{border-color:var(--red,#d71920);background:var(--red,#d71920);outline:none}
        .reloja-dialog__button--secondary{background:transparent;color:var(--ink,#161616)}
        .reloja-dialog__button--secondary:hover,.reloja-dialog__button--secondary:focus-visible{border-color:var(--red,#d71920);color:var(--red,#d71920);outline:none}
        .reloja-dialog__button[hidden]{display:none}
        @keyframes reloja-dialog-fade{from{opacity:0}to{opacity:1}}
        @keyframes reloja-dialog-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:560px){.reloja-dialog-layer{padding:14px}.reloja-dialog__body{padding:30px 24px 24px}.reloja-dialog__actions{padding:16px 24px 24px;flex-direction:column-reverse}.reloja-dialog__button{width:100%}}
        @media(prefers-reduced-motion:reduce){.reloja-dialog-layer,.reloja-dialog{animation:none}}
      `;
      document.head.appendChild(style);
    }

    let layer = document.getElementById(LAYER_ID);
    if (layer) return layer;

    layer = document.createElement('div');
    layer.id = LAYER_ID;
    layer.className = 'reloja-dialog-layer';
    layer.hidden = true;
    layer.innerHTML = `
      <section class="reloja-dialog" role="dialog" aria-modal="true" aria-labelledby="reloja-dialog-title" aria-describedby="reloja-dialog-message">
        <button class="reloja-dialog__close" type="button" aria-label="Fechar aviso">×</button>
        <div class="reloja-dialog__body">
          <div class="reloja-dialog__status"><span class="reloja-dialog__mark" aria-hidden="true">i</span><p class="reloja-dialog__kicker"></p></div>
          <h2 id="reloja-dialog-title"></h2>
          <p class="reloja-dialog__message" id="reloja-dialog-message"></p>
          <p class="reloja-dialog__detail"></p>
        </div>
        <div class="reloja-dialog__actions">
          <button class="reloja-dialog__button reloja-dialog__button--secondary" type="button"></button>
          <button class="reloja-dialog__button reloja-dialog__button--primary" type="button"></button>
        </div>
      </section>`;
    document.body.appendChild(layer);

    const finish = result => {
      if (layer.hidden) return;
      layer.hidden = true;
      document.body.classList.remove('reloja-dialog-open');
      const resolve = activeResolve;
      activeResolve = null;
      if (lastFocused?.focus) lastFocused.focus();
      lastFocused = null;
      resolve?.(result);
    };

    layer.querySelector('.reloja-dialog__close').addEventListener('click', () => finish('dismiss'));
    layer.querySelector('.reloja-dialog__button--primary').addEventListener('click', () => finish('primary'));
    layer.querySelector('.reloja-dialog__button--secondary').addEventListener('click', () => finish('secondary'));
    layer.addEventListener('click', event => {
      if (event.target === layer) finish('dismiss');
    });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('dismiss');
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...layer.querySelectorAll('button:not([hidden])')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    layer._relojaFinish = finish;
    return layer;
  }

  function open(options = {}) {
    const layer = ensureUi();
    if (activeResolve) layer._relojaFinish('dismiss');

    const tone = options.tone === 'success' ? 'success' : 'attention';
    const detail = String(options.detail || '').trim();
    const secondaryLabel = String(options.secondaryLabel || '').trim();
    layer.dataset.tone = tone;
    layer.querySelector('.reloja-dialog__mark').textContent = tone === 'success' ? '✓' : 'i';
    layer.querySelector('.reloja-dialog__kicker').textContent = String(options.kicker || 'Relógio e Cia');
    layer.querySelector('#reloja-dialog-title').textContent = String(options.title || 'Aviso');
    layer.querySelector('#reloja-dialog-message').textContent = String(options.message || '');

    const detailElement = layer.querySelector('.reloja-dialog__detail');
    detailElement.textContent = detail;
    detailElement.hidden = !detail;

    const primary = layer.querySelector('.reloja-dialog__button--primary');
    const secondary = layer.querySelector('.reloja-dialog__button--secondary');
    primary.textContent = String(options.primaryLabel || 'Entendi');
    secondary.textContent = secondaryLabel;
    secondary.hidden = !secondaryLabel;

    lastFocused = document.activeElement;
    layer.hidden = false;
    document.body.classList.add('reloja-dialog-open');

    return new Promise(resolve => {
      activeResolve = resolve;
      requestAnimationFrame(() => (secondaryLabel ? secondary : primary).focus());
    });
  }

  window.relojaDialog = { open };
})();
