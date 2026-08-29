/* RELÓGIO E CIA — carrossel leve de mostradores da Home */
(() => {
  'use strict';

  const TIME_ZONE = 'America/Sao_Paulo';
  const STORAGE_KEY = 'reloja_home_watch';
  const WATCH_COUNT = 3;
  const PT_WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const EN_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const pad = value => String(value).padStart(2, '0');

  const time24Formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });

  const time12Formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  });

  function parts(formatter, date) {
    return formatter.formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
  }

  function brasiliaNow() {
    const date = new Date();
    const time24 = parts(time24Formatter, date);
    const time12 = parts(time12Formatter, date);
    const calendar = parts(dateFormatter, date);
    const utcDate = new Date(Date.UTC(
      Number(calendar.year),
      Number(calendar.month) - 1,
      Number(calendar.day)
    ));

    return {
      hour: Number(time24.hour),
      hour12: String(time12.hour).padStart(2, '0'),
      minute: Number(time24.minute),
      second: Number(time24.second),
      millisecond: date.getMilliseconds(),
      dayPeriod: String(time12.dayPeriod || '').toUpperCase(),
      month: Number(calendar.month),
      day: Number(calendar.day),
      weekday: utcDate.getUTCDay()
    };
  }

  function setText(root, id, value) {
    const element = root.querySelector(`#${id}`);
    if (element && element.textContent !== String(value)) element.textContent = value;
  }

  function setRotation(root, id, degrees) {
    const element = root.querySelector(`#${id}`);
    if (element) element.style.transform = `rotate(${degrees}deg)`;
  }

  function hourTicks(centerY = 160, inner = 82, outer = 94) {
    return Array.from({ length: 12 }, (_, index) => (
      `<line class="watch-hour-tick" x1="160" y1="${centerY - outer}" x2="160" y2="${centerY - inner}" transform="rotate(${index * 30} 160 ${centerY})"></line>`
    )).join('');
  }

  function minuteTicks(centerY = 160, inner = 91, outer = 97) {
    return Array.from({ length: 60 }, (_, index) => {
      if (index % 5 === 0) return '';
      return `<line class="watch-minute-tick" x1="160" y1="${centerY - outer}" x2="160" y2="${centerY - inner}" transform="rotate(${index * 6} 160 ${centerY})"></line>`;
    }).join('');
  }

  function digitalTemplate() {
    return `
      <div class="home-watch-art home-watch-art--digital" data-watch-kind="digital">
        <svg class="home-watch-svg" viewBox="0 0 320 320" role="img" aria-labelledby="digital-watch-title digital-watch-desc">
          <title id="digital-watch-title">Mostrador digital clássico</title>
          <desc id="digital-watch-desc">Mostrador digital preto com dia, data, AM ou PM e horário real de Brasília.</desc>
          <rect class="digital-dial-shell" x="52" y="52" width="216" height="216" rx="28"></rect>
          <rect class="digital-dial-inset" x="66" y="68" width="188" height="184" rx="18"></rect>
          <circle class="digital-screw" cx="72" cy="73" r="4"></circle>
          <circle class="digital-screw" cx="248" cy="73" r="4"></circle>
          <circle class="digital-screw" cx="72" cy="247" r="4"></circle>
          <circle class="digital-screw" cx="248" cy="247" r="4"></circle>
          <rect class="digital-accent" x="77" y="91" width="166" height="141" rx="12"></rect>
          <rect class="digital-screen" x="88" y="104" width="144" height="115" rx="7"></rect>
          <g class="digital-info">
            <text class="digital-micro" x="101" y="126">SIG</text>
            <text id="digital-weekday" x="136" y="126">SAT</text>
            <text id="digital-date" x="194" y="126">08-29</text>
            <text id="digital-period" class="digital-period" x="102" y="149">PM</text>
            <text class="digital-micro" x="132" y="149">ALM</text>
            <text id="digital-hour-minute" class="digital-main" x="101" y="190">03:42</text>
            <text id="digital-second" class="digital-seconds" x="220" y="190">36</text>
          </g>
          <path class="digital-bottom-mark" d="M117 238h86"></path>
        </svg>
      </div>`;
  }

  function chronoTemplate() {
    return `
      <div class="home-watch-art home-watch-art--chrono" data-watch-kind="chrono">
        <svg class="home-watch-svg" viewBox="0 0 320 320" role="img" aria-labelledby="chrono-watch-title chrono-watch-desc">
          <title id="chrono-watch-title">Mostrador cronógrafo quartz interativo</title>
          <desc id="chrono-watch-desc">Cronógrafo de visual esportivo, com segundos em saltos de um segundo e botões de iniciar, parar e zerar.</desc>
          <path class="chrono-pusher" d="M104 55L92 32l23-12 14 29z"></path>
          <path class="chrono-pusher" d="M216 55l12-23-23-12-14 29z"></path>
          <rect class="chrono-crown" x="148" y="22" width="24" height="30" rx="4"></rect>
          <circle class="chrono-bezel" cx="160" cy="160" r="114"></circle>
          <circle class="chrono-dial" cx="160" cy="160" r="103"></circle>
          <g class="chrono-minute-ring">${minuteTicks()}</g>
          <g class="chrono-hour-ring">${hourTicks()}</g>
          <circle class="chrono-subdial" cx="111" cy="157" r="29"></circle>
          <circle class="chrono-subdial" cx="209" cy="157" r="29"></circle>
          <circle class="chrono-subdial" cx="160" cy="218" r="27"></circle>
          <g class="chrono-submarks">
            <line x1="111" y1="133" x2="111" y2="139"></line><line x1="111" y1="175" x2="111" y2="181"></line>
            <line x1="87" y1="157" x2="93" y2="157"></line><line x1="129" y1="157" x2="135" y2="157"></line>
            <line x1="209" y1="133" x2="209" y2="139"></line><line x1="209" y1="175" x2="209" y2="181"></line>
            <line x1="185" y1="157" x2="191" y2="157"></line><line x1="227" y1="157" x2="233" y2="157"></line>
            <line x1="160" y1="196" x2="160" y2="202"></line><line x1="160" y1="234" x2="160" y2="240"></line>
          </g>
          <text class="chrono-subtext" x="111" y="151">60</text>
          <text class="chrono-subtext" x="209" y="151">30</text>
          <text class="chrono-subtext" x="160" y="212">12</text>
          <line id="chrono-running-seconds" class="chrono-subhand" x1="111" y1="163" x2="111" y2="137"></line>
          <line id="chrono-minutes" class="chrono-subhand" x1="209" y1="163" x2="209" y2="137"></line>
          <line id="chrono-hours" class="chrono-subhand" x1="160" y1="224" x2="160" y2="202"></line>
          <line id="chrono-hour" class="analog-hand chrono-hour" x1="160" y1="168" x2="160" y2="111"></line>
          <line id="chrono-minute" class="analog-hand chrono-minute" x1="160" y1="170" x2="160" y2="84"></line>
          <line id="chrono-seconds" class="analog-hand chrono-seconds" x1="160" y1="181" x2="160" y2="67"></line>
          <circle class="chrono-center" cx="160" cy="160" r="7"></circle>
          <circle class="chrono-center-dot" cx="160" cy="160" r="3"></circle>
        </svg>
        <button class="watch-pusher-button watch-pusher-button--start" type="button" aria-label="Iniciar cronógrafo" aria-pressed="false" title="Iniciar ou parar cronógrafo"></button>
        <button class="watch-pusher-button watch-pusher-button--reset" type="button" aria-label="Zerar cronógrafo" title="Zerar cronógrafo quando estiver parado"></button>
      </div>`;
  }

  function classicTemplate() {
    return `
      <div class="home-watch-art home-watch-art--classic" data-watch-kind="classic">
        <svg class="home-watch-svg" viewBox="0 0 320 320" role="img" aria-labelledby="classic-watch-title classic-watch-desc">
          <title id="classic-watch-title">Mostrador clássico automático verde</title>
          <desc id="classic-watch-desc">Mostrador verde texturizado com degradê, índices dourados, calendário e ponteiro de segundos com movimento suave de relógio automático.</desc>
          <defs>
            <radialGradient id="classic-dial-gradient" cx="48%" cy="42%" r="68%">
              <stop offset="0%" stop-color="#17a267"></stop>
              <stop offset="34%" stop-color="#087548"></stop>
              <stop offset="72%" stop-color="#06462f"></stop>
              <stop offset="100%" stop-color="#03271c"></stop>
            </radialGradient>
            <linearGradient id="classic-band-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0"></stop>
              <stop offset="42%" stop-color="#7ff0b2" stop-opacity=".14"></stop>
              <stop offset="50%" stop-color="#d1ffe2" stop-opacity=".24"></stop>
              <stop offset="58%" stop-color="#7ff0b2" stop-opacity=".12"></stop>
              <stop offset="100%" stop-color="#000000" stop-opacity=".16"></stop>
            </linearGradient>
            <pattern id="classic-texture" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 1H8M0 5H8" stroke="#ffffff" stroke-opacity=".045" stroke-width="1"></path>
            </pattern>
          </defs>
          <circle class="classic-bezel" cx="160" cy="160" r="114"></circle>
          <circle class="classic-dial" cx="160" cy="160" r="103"></circle>
          <circle class="classic-band" cx="160" cy="160" r="103"></circle>
          <circle class="classic-texture" cx="160" cy="160" r="103"></circle>
          <g class="classic-minute-ring">${minuteTicks()}</g>
          <g class="classic-hour-ring">${hourTicks(160, 78, 94)}</g>
          <rect class="classic-calendar-frame" x="195" y="146" width="52" height="29" rx="2"></rect>
          <rect class="classic-calendar-day" x="198" y="149" width="26" height="23"></rect>
          <text id="classic-weekday" class="classic-calendar-text classic-calendar-weekday" x="211" y="165">SÁB</text>
          <text id="classic-date" class="classic-calendar-text" x="235" y="165">29</text>
          <text class="classic-stars" x="160" y="219">★ ★ ★</text>
          <line id="classic-hour" class="analog-hand classic-hour" x1="160" y1="168" x2="160" y2="111"></line>
          <line id="classic-minute" class="analog-hand classic-minute" x1="160" y1="170" x2="160" y2="82"></line>
          <line id="classic-second" class="analog-hand classic-second" x1="160" y1="181" x2="160" y2="69"></line>
          <circle class="classic-center" cx="160" cy="160" r="7"></circle>
          <circle class="classic-center-dot" cx="160" cy="160" r="2.5"></circle>
        </svg>
      </div>`;
  }

  function init() {
    const selector = document.getElementById('home-watch-selector');
    const stage = document.getElementById('home-watch-stage');
    const previous = document.getElementById('home-watch-previous');
    const next = document.getElementById('home-watch-next');
    const status = document.getElementById('home-watch-status');
    if (!selector || !stage || !previous || !next || !status) return;

    const templates = [digitalTemplate, chronoTemplate, classicTemplate];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
    if (!Number.isInteger(active) || active < 0 || active >= WATCH_COUNT) active = 0;

    let timer = 0;
    let transitionTimer = 0;
    let touchStartX = null;
    let chronoRunning = false;
    let chronoStartedAt = 0;
    let chronoElapsed = 0;
    let lastDigitalSecond = '';
    let lastQuartzSecond = -1;
    let lastChronoSecond = -1;

    function elapsedChrono() {
      return chronoElapsed + (chronoRunning ? performance.now() - chronoStartedAt : 0);
    }

    function updateDigital(now) {
      const secondKey = `${now.hour12}:${now.minute}:${now.second}:${now.day}:${now.dayPeriod}`;
      if (secondKey === lastDigitalSecond) return;
      lastDigitalSecond = secondKey;
      setText(stage, 'digital-weekday', EN_WEEKDAYS[now.weekday]);
      setText(stage, 'digital-date', `${pad(now.month)}-${pad(now.day)}`);
      setText(stage, 'digital-period', now.dayPeriod);
      setText(stage, 'digital-hour-minute', `${now.hour12}:${pad(now.minute)}`);
      setText(stage, 'digital-second', pad(now.second));
      status.textContent = `${EN_WEEKDAYS[now.weekday]} ${pad(now.day)}/${pad(now.month)} · ${now.hour12}:${pad(now.minute)}:${pad(now.second)} ${now.dayPeriod} · Brasília`;
    }

    function updateChrono(now) {
      if (now.second !== lastQuartzSecond) {
        lastQuartzSecond = now.second;
        setRotation(stage, 'chrono-running-seconds', now.second * 6);
        setRotation(stage, 'chrono-hour', ((now.hour % 12) + now.minute / 60) * 30);
        setRotation(stage, 'chrono-minute', (now.minute + now.second / 60) * 6);
      }

      const elapsedSeconds = Math.floor(elapsedChrono() / 1000);
      if (elapsedSeconds !== lastChronoSecond) {
        lastChronoSecond = elapsedSeconds;
        setRotation(stage, 'chrono-seconds', (elapsedSeconds % 60) * 6);
        setRotation(stage, 'chrono-minutes', ((elapsedSeconds / 60) % 30) * 12);
        setRotation(stage, 'chrono-hours', ((elapsedSeconds / 3600) % 12) * 30);
      }

      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      status.textContent = `${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)} · Brasília · Cronógrafo ${chronoRunning ? 'em andamento' : 'parado'} ${pad(elapsedMinutes)}:${pad(elapsedSeconds % 60)}`;
    }

    function updateClassic(now) {
      const fractionalSecond = now.second + (Math.floor(now.millisecond / 125) * 0.125);
      setRotation(stage, 'classic-hour', ((now.hour % 12) + now.minute / 60 + fractionalSecond / 3600) * 30);
      setRotation(stage, 'classic-minute', (now.minute + fractionalSecond / 60) * 6);
      setRotation(stage, 'classic-second', fractionalSecond * 6);
      setText(stage, 'classic-weekday', PT_WEEKDAYS[now.weekday]);
      setText(stage, 'classic-date', pad(now.day));
      status.textContent = `${PT_WEEKDAYS[now.weekday]} ${pad(now.day)}/${pad(now.month)} · ${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)} · Brasília`;
    }

    function clearTimer() {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    }

    function schedule() {
      clearTimer();
      if (document.hidden) return;
      const now = brasiliaNow();
      if (active === 0) updateDigital(now);
      if (active === 1) updateChrono(now);
      if (active === 2) updateClassic(now);

      let delay = 1000 - now.millisecond + 8;
      if (active === 2) delay = 125;
      if (active === 1 && chronoRunning) delay = 125;
      timer = window.setTimeout(schedule, delay);
    }

    function wireChronoButtons() {
      const start = stage.querySelector('.watch-pusher-button--start');
      const reset = stage.querySelector('.watch-pusher-button--reset');

      start?.addEventListener('click', () => {
        if (chronoRunning) {
          chronoElapsed += performance.now() - chronoStartedAt;
          chronoRunning = false;
          start.setAttribute('aria-label', 'Iniciar cronógrafo');
          start.setAttribute('aria-pressed', 'false');
        } else {
          chronoStartedAt = performance.now();
          chronoRunning = true;
          start.setAttribute('aria-label', 'Parar cronógrafo');
          start.setAttribute('aria-pressed', 'true');
        }
        lastChronoSecond = -1;
        schedule();
      });

      reset?.addEventListener('click', () => {
        if (chronoRunning) return;
        chronoElapsed = 0;
        lastChronoSecond = -1;
        schedule();
      });
    }

    function render() {
      stage.innerHTML = templates[active]();
      stage.dataset.activeWatch = String(active);
      selector.setAttribute('aria-label', `Mostrador ${active + 1} de ${WATCH_COUNT}`);
      if (active === 1) wireChronoButtons();
      lastDigitalSecond = '';
      lastQuartzSecond = -1;
      lastChronoSecond = -1;
      schedule();
    }

    function select(index, direction) {
      const nextIndex = (index + WATCH_COUNT) % WATCH_COUNT;
      if (nextIndex === active) return;
      window.clearTimeout(transitionTimer);
      clearTimer();

      const commit = () => {
        active = nextIndex;
        window.localStorage.setItem(STORAGE_KEY, String(active));
        render();
        stage.classList.remove('is-leaving');
        stage.classList.add(direction < 0 ? 'is-entering-back' : 'is-entering');
        transitionTimer = window.setTimeout(() => stage.classList.remove('is-entering', 'is-entering-back'), 260);
      };

      if (reduceMotion) commit();
      else {
        stage.classList.add('is-leaving');
        transitionTimer = window.setTimeout(commit, 120);
      }
    }

    previous.addEventListener('click', () => select(active - 1, -1));
    next.addEventListener('click', () => select(active + 1, 1));

    stage.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        select(active - 1, -1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        select(active + 1, 1);
      }
    });

    stage.addEventListener('pointerdown', event => {
      if (event.target.closest('.watch-pusher-button')) return;
      touchStartX = event.clientX;
    });

    stage.addEventListener('pointerup', event => {
      if (touchStartX === null || event.target.closest('.watch-pusher-button')) return;
      const distance = event.clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) < 42) return;
      select(active + (distance < 0 ? 1 : -1), distance < 0 ? 1 : -1);
    });

    stage.addEventListener('pointercancel', () => { touchStartX = null; });
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pagehide', clearTimer, { once: true });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
