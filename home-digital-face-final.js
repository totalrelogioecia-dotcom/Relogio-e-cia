/* RELÓGIO E CIA — acabamento final do mostrador digital da Home */
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TIME_ZONE = 'America/Sao_Paulo';
  const LIGHT_MS = 1800;
  const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const SEGMENTS = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'
  };
  const SHAPES = {
    a: '4,0 25,0 29,3 25,6 4,6 0,3',
    b: '26,5 29,8 29,27 26,30 23,27 23,8',
    c: '26,33 29,36 29,55 26,58 23,55 23,36',
    d: '4,57 25,57 29,60 25,63 4,63 0,60',
    e: '0,33 3,36 3,55 0,58 -3,55 -3,36',
    f: '0,5 3,8 3,27 0,30 -3,27 -3,8',
    g: '4,28 25,28 29,31 25,34 4,34 0,31'
  };

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'numeric', day: '2-digit', weekday: 'short'
  });

  let lightTimer = null;
  let tickTimer = null;

  function parts(formatter, date) {
    return formatter.formatToParts(date).reduce((out, part) => {
      if (part.type !== 'literal') out[part.type] = part.value;
      return out;
    }, {});
  }

  function nowInBrasilia() {
    const date = new Date();
    const time = parts(timeFormatter, date);
    const calendar = parts(dateFormatter, date);
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .indexOf(String(calendar.weekday || '').slice(0, 3));
    return {
      hour: String(Number(time.hour || 0)),
      minute: String(time.minute || '00').padStart(2, '0'),
      second: String(time.second || '00').padStart(2, '0'),
      period: String(time.dayPeriod || '').toUpperCase(),
      month: String(Number(calendar.month || 1)),
      day: String(calendar.day || '01').padStart(2, '0'),
      weekday: WEEKDAYS[Math.max(0, weekdayIndex)] || 'SU'
    };
  }

  function svg(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function clear(node) {
    while (node?.firstChild) node.removeChild(node.firstChild);
  }

  function digit(group, value, x, y, scale) {
    const active = SEGMENTS[value] || '';
    const wrapper = svg('g', { transform: `translate(${x} ${y}) scale(${scale})` });
    Object.entries(SHAPES).forEach(([segment, points]) => {
      wrapper.appendChild(svg('polygon', {
        points,
        class: `digital-final-segment ${active.includes(segment) ? 'is-on' : 'is-off'}`
      }));
    });
    group.appendChild(wrapper);
  }

  function colon(group, x, y, scale) {
    [21, 43].forEach(offset => group.appendChild(svg('circle', {
      cx: x,
      cy: y + (offset * scale),
      r: 2.2 * scale,
      class: 'digital-final-segment is-on'
    })));
  }

  function drawDate(root, month, day) {
    const group = root.querySelector('#digital-final-date');
    clear(group);
    if (!group) return;
    const text = `${month}-${day}`;
    const scale = .43;
    const digitAdvance = 15;
    const dashAdvance = 13;
    const total = Array.from(text).reduce((width, char) => width + (char === '-' ? dashAdvance : digitAdvance), 0);
    let x = 286 - total;
    const y = 120;
    Array.from(text).forEach(char => {
      if (char === '-') {
        group.appendChild(svg('rect', {
          x: x + 3,
          y: y + 13,
          width: 7,
          height: 2,
          rx: 1,
          class: 'digital-final-segment is-on'
        }));
        x += dashAdvance;
      } else {
        digit(group, char, x, y, scale);
        x += digitAdvance;
      }
    });
  }

  function drawTime(root, hour, minute, second) {
    const main = root.querySelector('#digital-final-time');
    const seconds = root.querySelector('#digital-final-seconds');
    clear(main);
    clear(seconds);
    if (!main || !seconds) return;

    const mainScale = .84;
    const hourAdvance = 27;
    const minuteAdvance = 32;
    const colonAdvance = 12;
    const y = 169;
    let x = hour.length === 1 ? 116 : 91;

    Array.from(hour).forEach(char => {
      digit(main, char, x, y, mainScale);
      x += hourAdvance;
    });
    colon(main, x + 2, y, mainScale);
    x += colonAdvance;
    Array.from(minute).forEach(char => {
      digit(main, char, x, y, mainScale);
      x += minuteAdvance;
    });

    const secondScale = .49;
    digit(seconds, second[0], 247, 187, secondScale);
    digit(seconds, second[1], 264, 187, secondScale);
  }

  function updateDisplay() {
    const root = document.querySelector('[data-final-digital-face]');
    if (!root) return;
    const current = nowInBrasilia();
    const weekday = root.querySelector('#digital-final-weekday');
    const period = root.querySelector('#digital-final-period');
    if (weekday) weekday.textContent = current.weekday;
    if (period) period.textContent = current.period;
    drawDate(root, current.month, current.day);
    drawTime(root, current.hour, current.minute, current.second);
  }

  function faceTemplate() {
    return `
      <div class="home-watch-art home-watch-art--digital-final" data-final-digital-face>
        <svg class="home-watch-svg digital-final-svg" viewBox="0 0 380 330" role="img" aria-labelledby="digital-final-title digital-final-desc">
          <title id="digital-final-title">Mostrador digital clássico</title>
          <desc id="digital-final-desc">Mostrador digital retangular com horário, dia, data e segundos de Brasília, além de botão de iluminação.</desc>
          <defs>
            <linearGradient id="digital-final-case" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#202224"/><stop offset="1" stop-color="#080909"/>
            </linearGradient>
            <linearGradient id="digital-final-band" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#626466"/><stop offset=".5" stop-color="#454749"/><stop offset="1" stop-color="#5b5d5f"/>
            </linearGradient>
            <linearGradient id="digital-final-lcd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#d7dacd"/><stop offset="1" stop-color="#bcc2b4"/>
            </linearGradient>
            <pattern id="digital-final-lines" width="3" height="3" patternUnits="userSpaceOnUse">
              <path d="M0 1H3" stroke="#111" stroke-opacity=".025" stroke-width=".65"/>
            </pattern>
          </defs>

          <rect class="digital-final-pusher" x="13" y="92" width="21" height="48" rx="5"/>
          <rect class="digital-final-pusher" x="13" y="213" width="21" height="48" rx="5"/>
          <rect class="digital-final-pusher" x="346" y="92" width="21" height="48" rx="5"/>
          <rect class="digital-final-pusher digital-final-pusher--light" x="346" y="213" width="21" height="48" rx="5"/>

          <path class="digital-final-case" d="M67 24H313Q334 24 348 43L370 74V256L348 287Q334 306 313 306H67Q46 306 32 287L10 256V74L32 43Q46 24 67 24Z"/>
          <path class="digital-final-red-line" d="M74 40H306Q324 40 337 57L353 80V250L337 273Q324 290 306 290H74Q56 290 43 273L27 250V80L43 57Q56 40 74 40Z"/>
          <path class="digital-final-band" d="M88 67H292Q311 67 323 83L338 104V226L323 247Q311 263 292 263H88Q69 263 57 247L42 226V104L57 83Q69 67 88 67Z"/>

          <text class="digital-final-illuminator" x="190" y="91">◀ ILLUMINATOR ▶</text>
          <text class="digital-final-led" x="190" y="251">LED BACKLIGHT</text>

          <circle class="digital-final-dot" cx="48" cy="105" r="4.5"/>
          <circle class="digital-final-dot" cx="48" cy="242" r="4.5"/>
          <circle class="digital-final-dot" cx="332" cy="105" r="4.5"/>
          <circle class="digital-final-dot" cx="332" cy="242" r="4.5"/>
          <text class="digital-final-side-label" x="52" y="153" transform="rotate(-90 52 153)">ADJUST</text>
          <text class="digital-final-side-label" x="52" y="207" transform="rotate(-90 52 207)">MODE</text>
          <text class="digital-final-side-label" x="328" y="153" transform="rotate(90 328 153)">START/STOP</text>
          <text class="digital-final-side-label" x="328" y="207" transform="rotate(90 328 207)">LIGHT</text>

          <rect class="digital-final-lcd-frame" x="70" y="101" width="240" height="151" rx="16"/>
          <rect class="digital-final-lcd-ring" x="77" y="108" width="226" height="137" rx="11"/>
          <rect class="digital-final-screen" x="81" y="112" width="218" height="129" rx="8"/>
          <rect class="digital-final-screen-texture" x="81" y="112" width="218" height="129" rx="8"/>

          <g class="digital-final-info">
            <g class="digital-final-sound" aria-hidden="true">
              <path d="M91 124q3 4 0 8"/><path d="M95 122q4 6 0 12"/><path d="M99 120q5 8 0 16"/><path d="M103 119q5 9 0 18"/><path d="M107 118q6 10 0 20"/>
            </g>
            <path class="digital-final-bell" d="M95 151c0-3.8 2-6.5 6-7.5V142c0-1.3.9-2.3 2.2-2.3s2.2 1 2.2 2.3v1.5c4 1 6 3.7 6 7.5v4l3 3.5H92l3-3.5zM100 161h6c-.8 2-2 3-3 3s-2.2-1-3-3z"/>
            <text id="digital-final-period" class="digital-final-period" x="92" y="178">PM</text>
            <text id="digital-final-weekday" class="digital-final-weekday" x="122" y="137">SU</text>
            <rect class="digital-final-date-box" x="198" y="115" width="94" height="43" rx="5"/>
            <g id="digital-final-date"></g>
            <g id="digital-final-time"></g>
            <g id="digital-final-seconds"></g>
            <path class="digital-final-light-icon" d="M270 164l4 6 7-2-1 7 6 4-6 4 1 7-7-2-4 6-4-6-7 2 1-7-6-4 6-4-1-7 7 2z"/>
            <rect class="digital-final-light-icon-center" x="266" y="175" width="8" height="8" rx="1"/>
          </g>
        </svg>
        <button class="watch-pusher-button digital-final-light-button" type="button" aria-label="Acender luz do mostrador digital" title="LIGHT"></button>
      </div>`;
  }

  function lightDisplay(root) {
    if (!root) return;
    root.classList.add('is-lit');
    clearTimeout(lightTimer);
    lightTimer = setTimeout(() => root.classList.remove('is-lit'), LIGHT_MS);
  }

  function bindLight(root) {
    const button = root.querySelector('.digital-final-light-button');
    if (!button || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      lightDisplay(root);
    });
  }

  function applyFinalDigital() {
    const stage = document.getElementById('home-watch-stage');
    if (!stage || stage.dataset.activeWatch !== '0') return;
    if (stage.querySelector('[data-final-digital-face]')) return;
    stage.innerHTML = faceTemplate();
    const root = stage.querySelector('[data-final-digital-face]');
    bindLight(root);
    updateDisplay();
  }

  function start() {
    const stage = document.getElementById('home-watch-stage');
    if (!stage) return;
    applyFinalDigital();
    new MutationObserver(() => applyFinalDigital()).observe(stage, { childList: true });
    tickTimer = setInterval(updateDisplay, 1000);
    window.addEventListener('pagehide', () => {
      clearInterval(tickTimer);
      clearTimeout(lightTimer);
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0), { once: true });
  } else {
    setTimeout(start, 0);
  }
})();
