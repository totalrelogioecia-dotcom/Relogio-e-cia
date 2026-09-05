(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-YXYDW5Y2M5';
  const CLARITY_PROJECT_ID = 'ydqjc4sykt';
  const STORAGE_KEY = 'relogio_analytics_consent_v2';
  const VALID = new Set(['granted', 'denied']);
  let googleTagLoaded = false;
  let clarityLoaded = false;

  if (!document.querySelector('link[data-relogio-cursor-theme]')) {
    const cursorTheme = document.createElement('link');
    cursorTheme.rel = 'stylesheet';
    cursorTheme.href = 'cursor-theme.css?v=1';
    cursorTheme.dataset.relogioCursorTheme = '1';
    document.head.appendChild(cursorTheme);
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  function setConsent(value, mode = 'update') {
    window.gtag('consent', mode, {
      analytics_storage: value,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }

  function loadGoogleTag() {
    if (googleTagLoaded || document.querySelector(`script[data-ga4="${MEASUREMENT_ID}"]`)) return;
    googleTagLoaded = true;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    script.dataset.ga4 = MEASUREMENT_ID;
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  }

  function loadClarity() {
    if (clarityLoaded || document.querySelector(`script[data-clarity="${CLARITY_PROJECT_ID}"]`)) return;
    clarityLoaded = true;

    window.clarity = window.clarity || function clarity() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${encodeURIComponent(CLARITY_PROJECT_ID)}`;
    script.dataset.clarity = CLARITY_PROJECT_ID;
    document.head.appendChild(script);
  }

  function loadAnalyticsTools() {
    loadGoogleTag();
    loadClarity();
  }

  function saveChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  function removeBanner() {
    document.getElementById('analytics-consent-banner')?.remove();
  }

  function choose(value) {
    saveChoice(value);
    setConsent(value);
    removeBanner();
    if (value === 'granted') loadAnalyticsTools();
  }

  function showBanner() {
    if (document.getElementById('analytics-consent-banner')) return;

    const banner = document.createElement('section');
    banner.id = 'analytics-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferências de privacidade e cookies');
    banner.innerHTML = `
      <div class="analytics-consent-copy">
        <strong>Privacidade e cookies</strong>
        <span>Usamos ferramentas de análise para melhorar sua experiência.</span>
        <a href="politica-de-privacidade.html">Política de Privacidade</a>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" data-analytics-choice="denied">Recusar</button>
        <button type="button" data-analytics-choice="granted" class="primary">Aceitar</button>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'analytics-consent-style';
    style.textContent = `
      #analytics-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:9998;display:flex;align-items:center;justify-content:center;gap:22px;width:100%;padding:9px 18px;border-top:2px solid #b40000;background:rgba(255,255,255,.985);color:#111;box-shadow:0 -4px 14px rgba(0,0,0,.09);font:inherit;backdrop-filter:blur(8px)}
      #analytics-consent-banner .analytics-consent-copy{display:flex;align-items:center;justify-content:center;gap:9px;min-width:0;line-height:1.25;white-space:nowrap}
      #analytics-consent-banner .analytics-consent-copy strong{font-size:.84rem;letter-spacing:.005em}
      #analytics-consent-banner .analytics-consent-copy span{font-size:.78rem;color:#444}
      #analytics-consent-banner .analytics-consent-copy a{font-size:.73rem;font-weight:700;color:#111;text-decoration:underline;text-underline-offset:2px}
      #analytics-consent-banner .analytics-consent-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
      #analytics-consent-banner button{min-height:36px;padding:0 14px;border:1px solid #222;border-radius:5px;background:#fff;color:#111;font:inherit;font-size:.8rem;font-weight:750;cursor:pointer;transition:background .15s ease,box-shadow .15s ease}
      #analytics-consent-banner button.primary{background:#b40000;border-color:#b40000;color:#fff}
      #analytics-consent-banner button:hover{box-shadow:0 2px 8px rgba(0,0,0,.12)}
      #analytics-consent-banner button:focus-visible,#analytics-consent-banner a:focus-visible{outline:3px solid #111;outline-offset:2px}
      html.reloja-dark #analytics-consent-banner{background:rgba(17,17,17,.985);color:#fff;border-top-color:#d52121}
      html.reloja-dark #analytics-consent-banner .analytics-consent-copy span{color:#ddd}
      html.reloja-dark #analytics-consent-banner .analytics-consent-copy a{color:#fff}
      html.reloja-dark #analytics-consent-banner button{background:#111;color:#fff;border-color:#aaa}
      html.reloja-dark #analytics-consent-banner button.primary{background:#c51616;border-color:#c51616}
      html.reloja-high-contrast #analytics-consent-banner{background:#fff!important;color:#000!important;border-top:4px solid #000!important;box-shadow:none!important}
      html.reloja-high-contrast #analytics-consent-banner .analytics-consent-copy span,html.reloja-high-contrast #analytics-consent-banner .analytics-consent-copy a{color:#000!important}
      html.reloja-high-contrast #analytics-consent-banner button{background:#fff!important;color:#000!important;border:3px solid #000!important}
      html.reloja-high-contrast #analytics-consent-banner button.primary{background:#000!important;color:#fff!important}
      @media (max-width:900px){#analytics-consent-banner{justify-content:space-between;gap:14px;padding:9px 12px}#analytics-consent-banner .analytics-consent-copy{white-space:normal;flex-wrap:wrap;justify-content:flex-start;gap:4px 8px}#analytics-consent-banner .analytics-consent-copy span{flex-basis:auto}}
      @media (max-width:620px){#analytics-consent-banner{align-items:stretch;flex-direction:column;gap:8px;padding:10px 12px}#analytics-consent-banner .analytics-consent-copy{display:grid;grid-template-columns:auto 1fr;align-items:baseline;gap:3px 8px}#analytics-consent-banner .analytics-consent-copy strong{grid-column:1 / -1}#analytics-consent-banner .analytics-consent-copy a{grid-column:1 / -1}#analytics-consent-banner .analytics-consent-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}#analytics-consent-banner button{width:100%;min-height:40px}}
      @media (max-width:360px){#analytics-consent-banner .analytics-consent-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    banner.addEventListener('click', event => {
      const button = event.target.closest('[data-analytics-choice]');
      if (!button) return;
      choose(button.dataset.analyticsChoice);
    });
  }

  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
  if (!VALID.has(stored)) stored = null;

  setConsent(stored === 'granted' ? 'granted' : 'denied', 'default');

  if (stored === 'granted') {
    loadAnalyticsTools();
  } else if (!stored) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner, { once: true });
    } else {
      showBanner();
    }
  }
})();
