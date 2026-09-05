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
    banner.setAttribute('aria-label', 'Preferências de análise do site');
    banner.innerHTML = `
      <div class="analytics-consent-copy">
        <strong>Privacidade e análise</strong>
        <span>Podemos usar o Google Analytics para entender o uso do site e melhorar a experiência. Cookies de análise só serão ativados se você aceitar.</span>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" data-analytics-choice="denied">Recusar</button>
        <button type="button" data-analytics-choice="granted" class="primary">Aceitar análise</button>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'analytics-consent-style';
    style.textContent = `
      #analytics-consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:980px;margin:0 auto;padding:16px 18px;border:1px solid #d6d6d6;border-radius:10px;background:#fff;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.2);font:inherit}
      #analytics-consent-banner .analytics-consent-copy{display:grid;gap:5px;line-height:1.4}
      #analytics-consent-banner .analytics-consent-copy strong{font-size:1rem}
      #analytics-consent-banner .analytics-consent-copy span{font-size:.9rem}
      #analytics-consent-banner .analytics-consent-actions{display:flex;gap:8px;flex:0 0 auto}
      #analytics-consent-banner button{min-height:44px;padding:0 14px;border:1px solid #222;border-radius:6px;background:#fff;color:#111;font:inherit;font-weight:700;cursor:pointer}
      #analytics-consent-banner button.primary{background:#b40000;border-color:#b40000;color:#fff}
      @media (max-width:700px){#analytics-consent-banner{align-items:stretch;flex-direction:column}#analytics-consent-banner .analytics-consent-actions{display:grid;grid-template-columns:1fr 1fr}#analytics-consent-banner button{width:100%}}
      @media (prefers-color-scheme:dark){#analytics-consent-banner{background:#151515;color:#fff;border-color:#555}#analytics-consent-banner button{background:#222;color:#fff;border-color:#aaa}}
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
