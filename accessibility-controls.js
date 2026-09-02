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
    if (document.getElementById('reloja-accessibility-controls-v5-style')) return;
    const style = document.createElement('style');
    style.id = 'reloja-accessibility-controls-v5-style';
    style.textContent = `
      .reloja-contrast-toggle{display:none!important}
      .reloja-accessibility-controls{display:flex;align-items:stretch;gap:0;z-index:240;border:1px solid var(--line-strong);background:var(--bg);box-shadow:0 8px 24px rgba(0,0,0,.12);isolation:isolate}
      .reloja-accessibility-button{appearance:none;width:34px;height:34px;min-width:34px;min-height:34px;padding:0;border:0;background:transparent;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;font:700 .69rem/1 var(--font-mono);letter-spacing:-.02em;cursor:pointer;transition:background .16s,color .16s}
      .reloja-accessibility-button+.reloja-accessibility-button{border-left:1px solid var(--line)}
      .reloja-accessibility-button:hover{background:var(--bg-soft);color:var(--red)}
      .reloja-accessibility-button[aria-pressed="true"]{background:var(--red);color:#fff}
      .reloja-accessibility-button:focus-visible{position:relative;z-index:2;outline:3px solid var(--red);outline-offset:2px}
      .reloja-accessibility-global-rail{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));top:auto;transform:none;flex-direction:column;border-color:var(--line);background:var(--bg)}
      .reloja-accessibility-global-rail .reloja-accessibility-button+.reloja-accessibility-button{border-left:0;border-top:1px solid var(--line)}
      .reloja-accessibility-header{display:none!important}
      html.reloja-large-text{font-size:112.5%}

      html.reloja-dark{color-scheme:dark;--bg:#111214;--bg-soft:#1A1C20;--bg-black:#050506;--bg-black-2:#0B0C0E;--ink:#F5F5F2;--ink-soft:#D7D9DE;--muted:#A7AAB1;--paper:#202226;--red:#FF4D53;--red-dark:#FF6A6F;--line:rgba(255,255,255,.14);--line-strong:rgba(255,255,255,.32);--line-inverse:rgba(255,255,255,.25)}
      html.reloja-dark body,html.reloja-dark .site-header,html.reloja-dark main,html.reloja-dark .hero,html.reloja-dark .section,html.reloja-dark .policy-main{background:var(--bg);color:var(--ink)}
      html.reloja-dark h1,html.reloja-dark h2,html.reloja-dark h3,html.reloja-dark h4,html.reloja-dark h5,html.reloja-dark h6,html.reloja-dark strong,html.reloja-dark label{color:var(--ink)}
      html.reloja-dark input,html.reloja-dark select,html.reloja-dark textarea{background:var(--bg)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark input::placeholder,html.reloja-dark textarea::placeholder{color:var(--muted);opacity:1}
      html.reloja-dark .policy-card,html.reloja-dark .cart-panel,html.reloja-dark .account-card,html.reloja-dark .account-box,html.reloja-dark .product-card,html.reloja-dark .cart-summary,html.reloja-dark .modal,html.reloja-dark .shipping-option,html.reloja-dark .shipping-option-detail,html.reloja-dark .coupon-box,html.reloja-dark .return-form-card{background:var(--bg-soft)!important;color:var(--ink);border-color:var(--line-strong)!important}
      html.reloja-dark .policy-hero{background:#17191c!important;color:var(--ink);border-color:var(--line)!important}
      html.reloja-dark .policy-hero h1,html.reloja-dark .policy-hero .policy-breadcrumb,html.reloja-dark .policy-hero .policy-kicker{color:var(--ink)!important}
      html.reloja-dark .policy-hero .intro,html.reloja-dark .policy-card p,html.reloja-dark .policy-card li,html.reloja-dark .policy-card .policy-small,html.reloja-dark .policy-card .policy-kicker{color:var(--ink-soft)!important}
      html.reloja-dark .policy-card:not(.policy-contact) a{color:var(--ink)!important}
      html.reloja-dark .policy-note{background:#24272c!important;color:var(--ink-soft)!important;border-left-color:var(--red)!important}
      html.reloja-dark .policy-checklist li:before{border-color:var(--ink)!important;color:var(--ink)!important}
      html.reloja-dark .policy-contact{background:#050506!important;color:#f5f5f2!important}
      html.reloja-dark .policy-contact h2,html.reloja-dark .policy-contact h3,html.reloja-dark .policy-contact p,html.reloja-dark .policy-contact li,html.reloja-dark .policy-contact strong,html.reloja-dark .policy-contact a{color:#f5f5f2!important}
      html.reloja-dark .policy-contact .btn-light{background:#f5f5f2!important;color:#111!important;border-color:#f5f5f2!important}
      html.reloja-dark .section-black,html.reloja-dark footer{background:#050506!important;color:#f5f5f2}
      html.reloja-dark .section-black h1,html.reloja-dark .section-black h2,html.reloja-dark .section-black h3,html.reloja-dark .section-black h4,html.reloja-dark .section-black strong,html.reloja-dark footer h5{color:#f5f5f2!important}
      html.reloja-dark .section-black p,html.reloja-dark footer p,html.reloja-dark footer .footer-bottom{color:#c6c9cf!important}
      html.reloja-dark footer a{color:#e4e5e8!important}
      html.reloja-dark footer a:hover{color:#ff5358!important}
      html.reloja-dark .site-search-toggle,html.reloja-dark .site-search-close,html.reloja-dark .forgot-password-button,html.reloja-dark [data-forgot-password]{color:var(--ink)!important;border-color:var(--line-strong)!important;background:transparent!important}
      html.reloja-dark .site-header .nav-links a,html.reloja-dark .site-header .nav-icon-link,html.reloja-dark .site-header .brand-mark{color:var(--ink)!important}
      html.reloja-dark .site-header .nav-links a:hover,html.reloja-dark .site-header .nav-links a[aria-current="page"]{background:var(--ink)!important;color:var(--bg)!important}
      html.reloja-dark .nav-cta{background:#B9131A!important;color:#fff!important}
      html.reloja-dark .nav-cta:hover{background:#971016!important}
      html.reloja-dark .btn-outline,html.reloja-dark .admin-actions button{background:transparent!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .shipping-message.info,html.reloja-dark .cart-legal-summary{background:#202328!important;color:var(--ink-soft)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .shipping-address-picker{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .shipping-address-picker .shipping-address-current{color:var(--ink-soft)!important}
      html.reloja-dark .shipping-address-picker .shipping-address-manage{color:var(--red)!important}
      html.reloja-dark .shipping-message.error,html.reloja-dark .form-error{background:#2a1719!important;color:#ffb5b8!important;border-color:#a93a3f!important}
      html.reloja-dark .form-success{background:#13271b!important;color:#a8e5bc!important;border-color:#34794d!important}
      html.reloja-dark .admin-card,html.reloja-dark .admin-table-wrap,html.reloja-dark .admin-modal,html.reloja-dark .photo-card,html.reloja-dark .photo-dropzone{background:var(--bg-soft)!important;color:var(--ink)!important;border-color:var(--line-strong)!important}
      html.reloja-dark .admin-table th,html.reloja-dark .admin-table td,html.reloja-dark .admin-tabs{border-color:var(--line)!important}
      html.reloja-dark .admin-tabs button{color:var(--ink)!important}
      html.reloja-dark .admin-tabs button.active{background:var(--ink)!important;color:var(--bg)!important}
      html.reloja-dark .admin-page [class*="help"],html.reloja-dark .admin-page [class*="muted"],html.reloja-dark .admin-page small{color:var(--ink-soft)!important}
      html.reloja-dark .return-field small{color:var(--ink-soft)!important}
      html.reloja-dark img{filter:none}
      html.reloja-dark .reloja-accessibility-controls{background:#17191c;border-color:rgba(255,255,255,.18);box-shadow:none}
      html.reloja-dark .reloja-accessibility-button{color:#e7e8ea}
      html.reloja-dark .reloja-accessibility-button[aria-pressed="true"]{background:#B9131A;color:#fff}
      html.reloja-dark .reloja-accessibility-button:hover{background:#22252a;color:var(--red)}
      html.reloja-dark .reloja-accessibility-button+.reloja-accessibility-button{border-color:rgba(255,255,255,.13)}

      html.reloja-high-contrast{color-scheme:light;--bg:#fff;--bg-soft:#fff;--bg-black:#000;--bg-black-2:#000;--ink:#000;--ink-soft:#000;--muted:#000;--paper:#fff;--red:#b00020;--line:#000;--line-strong:#000;--line-inverse:#fff}
      html.reloja-high-contrast body,html.reloja-high-contrast main,html.reloja-high-contrast .site-header,html.reloja-high-contrast .hero,html.reloja-high-contrast .section,html.reloja-high-contrast .policy-hero,html.reloja-high-contrast .policy-main{background:#fff!important;color:#000!important}
      html.reloja-high-contrast h1,html.reloja-high-contrast h2,html.reloja-high-contrast h3,html.reloja-high-contrast h4,html.reloja-high-contrast h5,html.reloja-high-contrast h6,html.reloja-high-contrast p,html.reloja-high-contrast li,html.reloja-high-contrast strong,html.reloja-high-contrast label,html.reloja-high-contrast small{color:#000!important}
      html.reloja-high-contrast input,html.reloja-high-contrast select,html.reloja-high-contrast textarea{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .policy-card,html.reloja-high-contrast .account-box,html.reloja-high-contrast .account-card,html.reloja-high-contrast .cart-summary,html.reloja-high-contrast .product-card,html.reloja-high-contrast .modal,html.reloja-high-contrast .admin-card,html.reloja-high-contrast .admin-table-wrap,html.reloja-high-contrast .admin-modal,html.reloja-high-contrast .shipping-option,html.reloja-high-contrast .coupon-box{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .shipping-address-picker{background:#fff!important;color:#000!important;border:2px solid #000!important}
      html.reloja-high-contrast .shipping-address-picker .shipping-address-current,html.reloja-high-contrast .shipping-address-picker .shipping-address-manage{color:#000!important}
      html.reloja-high-contrast .section-black,html.reloja-high-contrast footer,html.reloja-high-contrast .policy-contact{background:#000!important;color:#fff!important}
      html.reloja-high-contrast .section-black h1,html.reloja-high-contrast .section-black h2,html.reloja-high-contrast .section-black h3,html.reloja-high-contrast .section-black h4,html.reloja-high-contrast .section-black p,html.reloja-high-contrast .section-black strong,html.reloja-high-contrast footer h5,html.reloja-high-contrast footer p,html.reloja-high-contrast footer a,html.reloja-high-contrast footer span,html.reloja-high-contrast .policy-contact h2,html.reloja-high-contrast .policy-contact h3,html.reloja-high-contrast .policy-contact p,html.reloja-high-contrast .policy-contact li,html.reloja-high-contrast .policy-contact strong,html.reloja-high-contrast .policy-contact a{color:#fff!important}
      html.reloja-high-contrast a:not(.btn):not(.btn-light):not(.btn-dark-outline){text-decoration:underline!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important}
      html.reloja-high-contrast :focus-visible{outline:3px solid #b00020!important;outline-offset:3px!important}
      html.reloja-high-contrast .reloja-accessibility-controls{border-color:#000;background:#fff}
      html.reloja-high-contrast .reloja-accessibility-button{color:#000}
      html.reloja-high-contrast .reloja-accessibility-button[aria-pressed="true"]{background:#000;color:#fff}
      html.reloja-high-contrast .reloja-accessibility-button+.reloja-accessibility-button{border-color:#000}
      html.reloja-large-text .policy-hero h1{font-size:clamp(2.25rem,5vw,4rem)}
      @media(max-width:640px){.reloja-accessibility-global-rail{left:max(8px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom))}.reloja-accessibility-button{width:32px;height:32px;min-width:32px;min-height:32px;font-size:.65rem}}
      @media(prefers-reduced-motion:reduce){.reloja-accessibility-button{transition:none}}
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
    document.querySelectorAll('.reloja-accessibility-header,.reloja-accessibility-rail').forEach(group => group.remove());
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
