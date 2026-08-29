/* RELÓGIO E CIA — seletor leve de relógios da Home */
(() => {
  'use strict';

  const TIME_ZONE = 'America/Sao_Paulo';
  const STORAGE_KEY = 'reloja_home_watch';
  const EN_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const PT_WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const WATCH_COUNT = 3;

  const pad = value => String(value).padStart(2, '0');
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  function parts(formatter, date) {
    return formatter.formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
  }

  function brasiliaNow() {
    const date = new Date();
    const time = parts(timeFormatter, date);
    const calendar = parts(dateFormatter, date);
    const utcDate = new Date(Date.UTC(
      Number(calendar.year),
      Number(calendar.month) - 1,
      Number(calendar.day)
    ));

    return {
      date,
      hour: Number(time.hour),
      minute: Number(time.minute),
      second: Number(time.second),
      millisecond: date.getMilliseconds(),
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

  function hourTicks() {
    return Array.from({ length: 12 }, (_, index) => (
      `<line class="watch-hour-tick" x1="160" y1="71" x2="160" y2="83" transform="rotate(${index * 30} 160 154)"></line>`
    )).join('');
  }

  function digitalTemplate() {
    return `
      <div class="home-watch-art home-watch-art--digital" data-watch-kind="digital">
        <svg class="home-watch-svg" viewBox="0 0 320 320" role="img" aria-labelledby="digital-watch-title digital-watch-desc">
          <title id="digital-watch-title">Relógio digital Casio G-Shock</title>
          <desc id="digital-watch-desc">Relógio digital com dia em inglês, data e horário de Brasília.</desc>
          <path class="digital-case" d="M91 42h138l8 19 18 10 12 37-7 20 7 64-12 37-18 10-8 39H91l-8-39-18-10-12-37 7-32-7-32 12-37 18-10z"></path>
          <path class="digital-case-inset" d="M91 72h138l15 20 7 68-7 68-15 20H91l-15-20-7-68 7-68z"></path>
          <text class="watch-brand watch-brand--light" x="160" y="96">CASIO</text>
          <rect class="digital-accent" x="80" y="103" width="160" height="112" rx="15"></rect>
          <rect class="digital-screen" x="88" y="111" width="144" height="96" rx="8"></rect>
          <g class="digital-info">
            <path class="watch-alarm-icon" d="M101 128c0-4 2-7 6-8v-2h3v2c4 1 6 4 6 8v5l3 4h-21l3-4zm5 12h5c-1 3-4 3-5 0z"></path>
            <text id="digital-weekday" x="123" y="135">SAT</text>
            <text id="digital-date" x="184" y="135">08-29</text>
            <text class="digital-small" x="101" y="157">ALM</text>
            <text class="digital-small" x="130" y="157">24H</text>
            <text id="digital-hour-minute" class="digital-main" x="99" y="190">15:42</text>
            <text id="digital-second" class="digital-seconds" x="204" y="190">36</text>
          </g>
          <text class="watch-brand watch-brand--light watch-brand--lower" x="160" y="239">G-SHOCK</text>
          <circle class="digital-screw" cx="93" cy="60" r="5"></circle>
          <circle class="digital-screw" cx="227" cy="60" r="5"></circle>
          <circle class="digital-screw" cx="93" cy="260" r="5"></circle>
          <circle class="digital-screw" cx="227" cy="260" r="5"></circle>
        </svg>
      </div>`;
  }

  function citizenTemplate() {
    return `
      <div class="home-watch-art home-watch-art--citizen" data-watch-kind="citizen">
        <svg class="home-watch-svg" viewBox="0 0 320 320" role="img" aria-labelledby="citizen-watch-title citizen-watch-desc">
          <title id="citizen-watch-title">Cronógrafo Citizen panda</title>
          <desc id="citizen-watch-desc">Cronógrafo quartz interativo com três submostradores e calendário inferior.</desc>
          <path class="citizen-pusher" d="M104 53l-15-25 22-13 16 28z"></path>
          <path class="citizen-pusher" d="M216 53l15-25-22-13-16 28z"></path>
          <rect class="citizen-crown" x="147" y="18" width="26" height="29" rx="5"></rect>
          <path class="citizen-case" d="M89 51q71-30 142 0l25 45 9 134-32 47q-73 25-146 0l-32-47 9-134z"></path>
          <circle class="citizen-bezel" cx="160" cy="154" r="111"></circle>
          <circle class="citizen-dial" cx="160" cy="154" r="101"></circle>
          <g>${hourTicks()}</g>
          <text class="watch-brand watch-brand--dark" x="160" y="105">CITIZEN</text>
          <circle class="panda-subdial" cx="112" cy="157" r="30"></circle>
          <circle class="panda-subdial" cx="208" cy="157" r="30"></circle>
          <circle class="panda-subdial" cx="160" cy="218" r="28"></circle>
          <g class="subdial-marks">
            <line x1="112" y1="132" x2="112" y2="138"></line><line x1="112" y1="176" x2="112" y2="182"></line>
            <line x1="87" y1="157" x2="93" y2="157"></line><line x1="131" y1="157" x2="137" y2="157"></line>
            <line x1="208" y1="132" x2="208" y2="138"></line><line x1="208" y1="176" x2="208" y2="182"></line>
            <line x1="183" y1="157" x2="189" y2="157"></line><line x1="227" y1="157" x2="233" y2="157"></line>
          </g>
          <line id="citizen-running-seconds" class="subdial-hand" x1="112" y1="164" x2="112" y2="139"></line>
          <line id="citizen-chrono-minutes" class="subdial-hand" x1="208" y1="164" x2="208" y2="139"></line>
          <text id="citizen-weekday" class="calendar-text" x="160" y="214">SÁB</text>
          <text id="citizen-date" class="calendar-date" x="160" y="235">29</text>
          <line id="citizen-hour" class="analog-hand analog-hour" x1="160" y1="162" x2="160" y2="112"></line>
          <line id="citizen-minute" class="analog-hand analog-minute" x1="160" y1="164" x2="160" y2="91"></line>
          <line id="citizen-chrono-seconds" class="analog-hand chrono-second" x1="160" y1="176" x2="160" y2="67"></line>
          <circle class="analog-center" cx="160" cy="154" r="7"></circle>
          <circle class="analog-center-dot" cx="160" cy="154" r="3"></circle>
        </svg>
        <button class="watch-pusher-button watch-pusher-button--start" type="button" aria-label="Iniciar cronógrafo" title="Iniciar ou parar o cronógrafo"></button>
        <button class="watch-pusher-button watch-pusher-button--reset" type="button" aria-label="Zerar cronógrafo" title="Zerar o cronógrafo quando estiver parado"></button>
      </div>`;
  }

  function orientTemplate() {
    return `
      <div class="home-watch-art home-watch-art--orient" data-watch-kind="orient">
        <svg class="home-watch-svg" viewBox="0 0 320 320" role="img" aria-labelledby="orient-watch-title orient-watch-desc">
          <title id="orient-watch-title">Relógio automático Orient verde</title>
          <desc id="orient-watch-desc">Relógio automático com mostrador verde degradê, dia e data.</desc>
          <defs>
            <linearGradient id="orient-dial-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#06271d"></stop>
              <stop offset="37%" stop-color="#0a563a"></stop>
              <stop offset="50%" stop-color="#13965e"></stop>
              <stop offset="63%" stop-color="#0a563a"></stop>
              <stop offset="100%" stop-color="#041d16"></stop>
            </linearGradient>
          </defs>
          <path class="orient-case" d="M105 34h110l8 28q35 21 45 65v61q-10 44-45 65l-8 33H105l-8-33q-35-21-45-65v-61q10-44 45-65z"></path>
          <circle class="orient-bezel" cx="160" cy="160" r="112"></circle>
          <circle class="orient-dial" cx="160" cy="160" r="101"></circle>
          <g class="orient-indices">${hourTicks()}</g>
          <g class="orient-mark" aria-hidden="true">
            <circle cx="160" cy="92" r="7"></circle><path d="M148 92h24M160 80v24"></path>
          </g>
          <text class="watch-brand orient-brand" x="160" y="116">ORIENT</text>
          <rect class="orient-calendar-frame" x="199" y="146" width="48" height="26" rx="2"></rect>
          <rect class="orient-calendar-day" x="202" y="149" width="24" height="20"></rect>
          <text id="orient-weekday" class="orient-calendar-text orient-calendar-weekday" x="214" y="164">SÁB</text>
          <text id="orient-date" class="orient-calendar-text" x="236" y="164">29</text>
          <line id="orient-hour" class="analog-hand orient-hour" x1="160" y1="168" x2="160" y2="111"></line>
          <line id="orient-minute" class="analog-hand orient-minute" x1="160" y1="170" x2="160" y2="83"></line>
          <line id="orient-second" class="analog-hand orient-second" x1="160" y1="181" x2="160" y2="69"></line>
          <circle class="orient-center" cx="160" cy="160" r="7"></circle>
          <circle class="orient-center-dot" cx="160" cy="160" r="2.5"></circle>
          <rect class="orient-crown" x="270" y="143" width="14" height="34" rx="4"></rect>
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

    const templates = [digitalTemplate, citizenTemplate, orientTemplate];
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
    let lastCitizenSecond = -1;
    let lastChronoSecond = -1;

    function elapsedChrono() {
      return chronoElapsed + (chronoRunning ? performance.now() - chronoStartedAt : 0);
    }

    function updateDigital(now) {
      const secondKey = `${now.hour}:${now.minute}:${now.second}:${now.day}`;
      if (secondKey === lastDigitalSecond) return;
      lastDigitalSecond = secondKey;
      setText(stage, 'digital-weekday', EN_WEEKDAYS[now.weekday]);
      setText(stage, 'digital-date', `${pad(now.month)}-${pad(now.day)}`);
      setText(stage, 'digital-hour-minute', `${pad(now.hour)}:${pad(now.minute)}`);
      setText(stage, 'digital-second', pad(now.second));
      status.textContent = `${EN_WEEKDAYS[now.weekday]} ${pad(now.month)}-${pad(now.day)} · ${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)} · Brasília`;
    }

    function updateCitizen(now) {
      const realSecond = now.second;
      if (realSecond !== lastCitizenSecond) {
        lastCitizenSecond = realSecond;
        setRotation(stage, 'citizen-running-seconds', realSecond * 6);
        setRotation(stage, 'citizen-hour', ((now.hour % 12) + now.minute / 60) * 30);
        setRotation(stage, 'citizen-minute', (now.minute + now.second / 60) * 6);
        setText(stage, 'citizen-weekday', PT_WEEKDAYS[now.weekday]);
        setText(stage, 'citizen-date', pad(now.day));
      }

      const elapsedSeconds = Math.floor(elapsedChrono() / 1000);
      if (elapsedSeconds !== lastChronoSecond) {
        lastChronoSecond = elapsedSeconds;
        setRotation(stage, 'citizen-chrono-seconds', (elapsedSeconds % 60) * 6);
        setRotation(stage, 'citizen-chrono-minutes', ((elapsedSeconds / 60) % 30) * 12);
      }
      const minutes = Math.floor(elapsedSeconds / 60);
      status.textContent = `Cronógrafo ${chronoRunning ? 'em andamento' : 'parado'} · ${pad(minutes)}:${pad(elapsedSeconds % 60)}`;
    }

    function updateOrient(now) {
      const fractionalSecond = now.second + now.millisecond / 1000;
      setRotation(stage, 'orient-hour', ((now.hour % 12) + now.minute / 60 + fractionalSecond / 3600) * 30);
      setRotation(stage, 'orient-minute', (now.minute + fractionalSecond / 60) * 6);
      setRotation(stage, 'orient-second', fractionalSecond * 6);
      setText(stage, 'orient-weekday', PT_WEEKDAYS[now.weekday]);
      setText(stage, 'orient-date', pad(now.day));
      status.textContent = `${PT_WEEKDAYS[now.weekday]} ${pad(now.day)}/${pad(now.month)} · ${pad(now.hour)}:${pad(now.minute)} · Brasília`;
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
      if (active === 1) updateCitizen(now);
      if (active === 2) updateOrient(now);

      let delay = 1000 - now.millisecond + 8;
      if (active === 2) delay = 125;
      if (active === 1 && chronoRunning) delay = 125;
      timer = window.setTimeout(schedule, delay);
    }

    function wireCitizenButtons() {
      const start = stage.querySelector('.watch-pusher-button--start');
      const reset = stage.querySelector('.watch-pusher-button--reset');
      start?.addEventListener('click', () => {
        if (chronoRunning) {
          chronoElapsed += performance.now() - chronoStartedAt;
          chronoRunning = false;
          start.setAttribute('aria-label', 'Iniciar cronógrafo');
        } else {
          chronoStartedAt = performance.now();
          chronoRunning = true;
          start.setAttribute('aria-label', 'Parar cronógrafo');
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
      selector.style.setProperty('--watch-index', String(active));
      selector.setAttribute('aria-label', `Relógio ${active + 1} de ${WATCH_COUNT}`);
      if (active === 1) wireCitizenButtons();
      lastDigitalSecond = '';
      lastCitizenSecond = -1;
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

      if (reduceMotion) {
        commit();
      } else {
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

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
