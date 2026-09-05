(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-YXYDW5Y2M5';
  const STORAGE_KEY = 'relogio_analytics_consent';
  const VALID = new Set(['granted', 'denied']);
  let tagLoaded = false;

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
    if (tagLoaded || document.querySelector(`script[data-ga4="${MEASUREMENT_ID}"]`)) return;
    tagLoaded = true;

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
    if (value === 'granted') loadGoogleTag();
  }

  function showBanner() {
    if (document.getElementById('analytics-consent-banner')) return;

    const banner = document.createElement('section');
    banner.id = 'analytics-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferências de privacidade e cookies');
    banner.innerHTML = `
      <div class="analytics-consent-copy">
        <div class="analytics-consent-kicker">RELÓGIO E CIA</div>
        <strong>Privacidade e cookies</strong>
        <span>Usamos cookies de análise para entender como o site é utilizado e melhorar sua experiência. Eles só serão ativados com sua autorização.</span>
        <a href="politica-de-privacidade.html">Saiba mais na Política de Privacidade</a>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" data-analytics-choice="denied">Recusar</button>
        <button type="button" data-analytics-choice="granted" class="primary">Aceitar</button>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'analytics-consent-style';
    style.textContent = `
      #analytics-consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;display:flex;align-items:center;justify-content:space-between;gap:22px;max-width:980px;margin:0 auto;padding:18px 20px;border:1px solid #d9d9d9;border-top:4px solid #b40000;border-radius:12px;background:#fff;color:#111;box-shadow:0 12px 34px rgba(0,0,0,.22);font:inherit}
      #analytics-consent-banner .analytics-consent-copy{display:grid;gap:5px;line-height:1.45;max-width:670px}
      #analytics-consent-banner .analytics-consent-kicker{font-size:.68rem;font-weight:800;letter-spacing:.14em;color:#b40000}
      #analytics-consent-banner .analytics-consent-copy strong{font-size:1.02rem;letter-spacing:.01em}
      #analytics-consent-banner .analytics-consent-copy span{font-size:.9rem;color:#3e3e3e}
      #analytics-consent-banner .analytics-consent-copy a{width:max-content;max-width:100%;font-size:.78rem;font-weight:700;color:#111;text-decoration:underline;text-underline-offset:3px}
      #analytics-consent-banner .analytics-consent-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:0 0 auto;min-width:245px}
      #analytics-consent-banner button{min-height:44px;padding:0 15px;border:1px solid #222;border-radius:7px;background:#fff;color:#111;font:inherit;font-weight:750;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
      #analytics-consent-banner button.primary{background:#b40000;border-color:#b40000;color:#fff}
      #analytics-consent-banner button:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
      #analytics-consent-banner button:focus-visible,#analytics-consent-banner a:focus-visible{outline:3px solid #111;outline-offset:3px}
      html.reloja-dark #analytics-consent-banner{background:#111;color:#fff;border-color:#3c3c3c;border-top-color:#d52121}
      html.reloja-dark #analytics-consent-banner .analytics-consent-kicker{color:#ff4d4d}
      html.reloja-dark #analytics-consent-banner .analytics-consent-copy span{color:#ddd}
      html.reloja-dark #analytics-consent-banner .analytics-consent-copy a{color:#fff}
      html.reloja-dark #analytics-consent-banner button{background:#111;color:#fff;border-color:#aaa}
      html.reloja-dark #analytics-consent-banner button.primary{background:#c51616;border-color:#c51616}
      html.reloja-high-contrast #analytics-consent-banner{background:#fff!important;color:#000!important;border:3px solid #000!important;border-top:6px solid #000!important;box-shadow:none!important}
      html.reloja-high-contrast #analytics-consent-banner .analytics-consent-kicker,html.reloja-high-contrast #analytics-consent-banner .analytics-consent-copy span,html.reloja-high-contrast #analytics-consent-banner .analytics-consent-copy a{color:#000!important}
      html.reloja-high-contrast #analytics-consent-banner button{background:#fff!important;color:#000!important;border:3px solid #000!important}
      html.reloja-high-contrast #analytics-consent-banner button.primary{background:#000!important;color:#fff!important}
      @media (max-width:700px){#analytics-consent-banner{left:10px;right:10px;bottom:10px;align-items:stretch;flex-direction:column;gap:14px;padding:16px}#analytics-consent-banner .analytics-consent-actions{min-width:0;width:100%;grid-template-columns:1fr 1fr}#analytics-consent-banner button{width:100%}}
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
    loadGoogleTag();
  } else if (!stored) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner, { once: true });
    } else {
      showBanner();
    }
  }
})();
