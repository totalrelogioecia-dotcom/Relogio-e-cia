(() => {
  const CONTRAST_KEY = 'reloja_high_contrast';
  const TEXT_KEY = 'reloja_large_text';
  const THEME_KEY = 'reloja_dark_mode';

  function readBool(key) {
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
  }

  function writeBool(key, value) {
    try { localStorage.setItem(key, value ? '1' : '0'); }
    catch (_) {}
  }

  function applySavedPreferences() {
    const contrast = readBool(CONTRAST_KEY);
    const largeText = readBool(TEXT_KEY);
    const dark = readBool(THEME_KEY) && !contrast;
    document.documentElement.classList.toggle('reloja-high-contrast', contrast);
    document.documentElement.classList.toggle('reloja-large-text', largeText);
    document.documentElement.classList.toggle('reloja-dark', dark);
  }

  function ensureStyles() {
    if (document.getElementById('reloja-accessibility-controls-v4-style')) return;
    const style = document.createElement('style');
    style.id = 'reloja-accessibility-controls-v4-style';
    style.textContent = `
      .reloja-contrast-toggle{display:none!important}
      .reloja-accessibility-controls{display:flex;align-items:stretch;gap:0;z-index:120;border:1px solid var(--line-strong);background:var(--bg);box-shadow:0 1px 0 rgba(0,0,0,.03)}
      .reloja-accessibility-button{appearance:none;width:29px;height:29px;min-width:29px;min-height:29px;padding:0;border:0;background:transparent;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;font:700 .64rem/1 var(--font-mono);letter-spacing:-.02em;cursor:pointer;transition:background .16s,color .16s}
      .reloja-accessibility-button+.reloja-accessibility-button{border-left:1px solid var(--line)}
      .reloja-accessibility-button:hover{background:var(--bg-soft);color:var(--red)}
      .reloja-accessibility-button[aria-pressed="true"]{background:var(--red);color:#fff}
      .reloja-accessibility-button:focus-visible{position:relative;z-index:2;outline:2px solid var(--red);outline-offset:2px}
      .reloja-accessibility-global-rail{position:fixed;left:18px;top:42vh;transform:translateY(-50%);flex-direction:column;border-color:var(--line);background:var(--bg)}
      .reloja-accessibility-global-rail .reloja-accessibility-button+.reloja-accessibility-button{border-left:0;border-top:1px solid var(--line)}
      .reloja-accessibility-header{margin-left:8px;margin-right:10px;flex-shrink:0}
      html.reloja-large-text{font-size:112.5%}
      html.reloja-dark{color-scheme:dark;--bg:#111214;--bg-soft:#1A1C20;--bg-black:#050506;--bg-black-2:#0B0C0E;--ink:#F5F5F2;--ink-soft:#D7D9DE;--muted:#A7AAB1;--paper:#17191C;--line:rgba(255,255,255,.14);--line-strong:rgba(255,255,255,.28);--line-inverse:rgba(255,255,255,.25)}
      html.reloja-dark body,html.reloja-dark .site-header{background:var(--bg);color:var(--ink)}
      html.reloja-dark input,html.reloja-dark select,html.reloja-dark textarea{background:var(--bg)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .policy-card,html.reloja-dark .cart-panel,html.reloja-dark .account-card,html.reloja-dark .product-card,html.reloja-dark .cart-summary{background:var(--bg-soft);color:var(--ink)}
      html.reloja-dark .section-black,html.reloja-dark footer{background:#050506}
      html.reloja-dark img{filter:none}
      html.reloja-dark .reloja-accessibility-controls{background:#17191c;border-color:rgba(255,255,255,.18);box-shadow:none}
      html.reloja-dark .reloja-accessibility-button{color:#e7e8ea}
      html.reloja-dark .reloja-accessibility-button:hover{background:#22252a;color:var(--red)}
      html.reloja-dark .reloja-accessibility-button+.reloja-accessibility-button{border-color:rgba(255,255,255,.13)}
      html.reloja-high-contrast .reloja-accessibility-controls{border-color:#000;background:#fff}
      html.reloja-high-contrast .reloja-accessibility-button{color:#000}
      html.reloja-high-contrast .reloja-accessibility-button+.reloja-accessibility-button{border-color:#000}
      @media(min-width:901px){.reloja-accessibility-header{display:none!important}.reloja-accessibility-global-rail{display:flex}}
      @media(max-width:900px){.reloja-accessibility-global-rail{display:none!important}.reloja-accessibility-header{display:flex;margin-left:auto;margin-right:8px}}
      @media(max-width:640px){.reloja-accessibility-header{margin-right:5px}.reloja-accessibility-button{width:27px;height:27px;min-width:27px;min-height:27px;font-size:.61rem}}
    `;
    document.head.appendChild(style);
  }

  function syncButtons() {
    const contrast = document.documentElement.classList.contains('reloja-high-contrast');
    const largeText = document.documentElement.classList.contains('reloja-large-text');
    const dark = document.documentElement.classList.contains('reloja-dark');

    document.querySelectorAll('[data-reloja-accessibility="contrast"]').forEach(button => {
      button.setAttribute('aria-pressed', contrast ? 'true' : 'false');
      button.setAttribute('aria-label', contrast ? 'Desativar alto contraste' : 'Ativar alto contraste');
      button.title = contrast ? 'Desativar alto contraste' : 'Ativar alto contraste';
    });
    document.querySelectorAll('[data-reloja-accessibility="text"]').forEach(button => {
      button.setAttribute('aria-pressed', largeText ? 'true' : 'false');
      button.setAttribute('aria-label', largeText ? 'Voltar ao tamanho normal do texto' : 'Aumentar o tamanho do texto');
      button.title = largeText ? 'Tamanho normal do texto' : 'Aumentar texto';
    });
    document.querySelectorAll('[data-reloja-accessibility="theme"]').forEach(button => {
      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
      button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.title = dark ? 'Modo claro' : 'Modo escuro';
      button.textContent = dark ? '☀' : '☾';
    });
  }

  function toggleFeature(type) {
    if (type === 'contrast') {
      const next = !document.documentElement.classList.contains('reloja-high-contrast');
      document.documentElement.classList.toggle('reloja-high-contrast', next);
      writeBool(CONTRAST_KEY, next);
      if (next) {
        document.documentElement.classList.remove('reloja-dark');
        writeBool(THEME_KEY, false);
      }
    } else if (type === 'text') {
      const next = !document.documentElement.classList.contains('reloja-large-text');
      document.documentElement.classList.toggle('reloja-large-text', next);
      writeBool(TEXT_KEY, next);
    } else if (type === 'theme') {
      const next = !document.documentElement.classList.contains('reloja-dark');
      document.documentElement.classList.toggle('reloja-dark', next);
      writeBool(THEME_KEY, next);
      if (next) {
        document.documentElement.classList.remove('reloja-high-contrast');
        writeBool(CONTRAST_KEY, false);
      }
    }
    syncButtons();
  }

  function createGroup(extraClass) {
    const group = document.createElement('div');
    group.className = `reloja-accessibility-controls ${extraClass}`;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Opções de acessibilidade e visualização');

    [
      ['contrast', '◐', 'Ativar alto contraste'],
      ['text', 'A+', 'Aumentar o tamanho do texto'],
      ['theme', '☾', 'Ativar modo escuro']
    ].forEach(([type, symbol, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reloja-accessibility-button';
      button.dataset.relojaAccessibility = type;
      button.textContent = symbol;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', 'false');
      button.title = label;
      button.addEventListener('click', () => toggleFeature(type));
      group.appendChild(button);
    });

    return group;
  }

  function removeLegacyContrastButton() {
    document.querySelectorAll('.reloja-contrast-toggle').forEach(button => button.remove());
  }

  function removeRedundantStoreNav() {
    document.querySelectorAll('.site-header .nav-links a[href$="sobre.html#loja"]').forEach(link => {
      const item = link.closest('li');
      if (item) item.remove();
      else link.remove();
    });
  }

  function cleanLegacyHeaderItems() {
    removeLegacyContrastButton();
    removeRedundantStoreNav();
  }

  function watchLegacyHeader(nav) {
    if (!nav || nav.dataset.relojaLegacyHeaderWatch === '1') return;
    nav.dataset.relojaLegacyHeaderWatch = '1';
    new MutationObserver(cleanLegacyHeaderItems).observe(nav, { childList: true, subtree: true });
  }

  function install() {
    applySavedPreferences();
    ensureStyles();
    cleanLegacyHeaderItems();

    const nav = document.querySelector('.site-header .nav');
    watchLegacyHeader(nav);
    if (nav && !nav.querySelector('.reloja-accessibility-header')) {
      const group = createGroup('reloja-accessibility-header');
      const cta = nav.querySelector('.nav-cta');
      const toggle = nav.querySelector('.nav-toggle');
      nav.insertBefore(group, cta || toggle || null);
    }

    document.querySelectorAll('.reloja-accessibility-rail').forEach(group => group.remove());
    if (!document.querySelector('.reloja-accessibility-global-rail')) {
      document.body.appendChild(createGroup('reloja-accessibility-global-rail'));
    }

    cleanLegacyHeaderItems();
    syncButtons();
  }

  applySavedPreferences();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
