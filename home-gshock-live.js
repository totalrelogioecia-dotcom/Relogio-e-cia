/* Relógio e Cia — LCD funcional no G-Shock da Home */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TIME_ZONE = 'America/Sao_Paulo';
  const SEGMENTS = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'
  };
  const SHAPES = {
    a: '8,2 42,2 48,8 42,14 8,14 2,8',
    b: '43,10 49,16 49,40 43,46 37,40 37,16',
    c: '43,48 49,54 49,78 43,84 37,78 37,54',
    d: '8,80 42,80 48,86 42,92 8,92 2,86',
    e: '1,48 7,54 7,78 1,84 -5,78 -5,54',
    f: '1,10 7,16 7,40 1,46 -5,40 -5,16',
    g: '8,41 42,41 48,47 42,53 8,53 2,47'
  };

  function svgElement(name, attributes) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function drawDigit(group, digit, x, y, scale) {
    const active = SEGMENTS[digit] || '';
    const wrapper = svgElement('g', { transform: `translate(${x} ${y}) scale(${scale})` });
    active.split('').forEach(segment => {
      wrapper.appendChild(svgElement('polygon', {
        class: 'gshock-lcd-segment',
        points: SHAPES[segment]
      }));
    });
    group.appendChild(wrapper);
  }

  function drawColon(group, x, y, scale) {
    group.appendChild(svgElement('circle', {
      class: 'gshock-lcd-segment', cx: x, cy: y + (31 * scale), r: 4.5 * scale
    }));
    group.appendChild(svgElement('circle', {
      class: 'gshock-lcd-segment', cx: x, cy: y + (65 * scale), r: 4.5 * scale
    }));
  }

  function drawTime(group, hour, minute, second) {
    clear(group);
    const scale = 1.58;
    const startX = 390;
    const y = 548;
    drawDigit(group, hour[0], startX, y, scale);
    drawDigit(group, hour[1], startX + 91, y, scale);
    drawColon(group, startX + 184, y, scale);
    drawDigit(group, minute[0], startX + 207, y, scale);
    drawDigit(group, minute[1], startX + 298, y, scale);
    drawDigit(group, second[0], startX + 405, y + 51, .88);
    drawDigit(group, second[1], startX + 459, y + 51, .88);
  }

  function drawDate(group, month, day) {
    clear(group);
    const value = `${Number(month)}-${day}`;
    const scale = .73;
    const digitAdvance = 43;
    const dashAdvance = 30;
    const total = Array.from(value).reduce((width, char) => width + (char === '-' ? dashAdvance : digitAdvance), 0);
    let x = 787 - (total / 2);
    const y = 426;
    Array.from(value).forEach(char => {
      if (char === '-') {
        group.appendChild(svgElement('rect', {
          class: 'gshock-lcd-segment', x: x + 2, y: y + 32, width: 22, height: 6, rx: 2
        }));
        x += dashAdvance;
      } else {
        drawDigit(group, char, x, y, scale);
        x += digitAdvance;
      }
    });
  }

  function brasiliaParts() {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      weekday: 'short', month: 'numeric', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    return formatter.formatToParts(new Date()).reduce((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
  }

  function init() {
    const clock = document.getElementById('gshock-live-clock');
    const timeGroup = document.getElementById('gshock-live-time');
    const dateGroup = document.getElementById('gshock-live-date');
    const weekday = document.getElementById('gshock-live-weekday');
    const period = document.getElementById('gshock-live-period');
    const caption = document.getElementById('gshock-live-caption');
    if (!clock || !timeGroup || !dateGroup || !weekday || !period || !caption) return;

    let lastSecond = '';
    function update() {
      if (document.hidden) return;
      const parts = brasiliaParts();
      const secondKey = `${parts.month}-${parts.day}-${parts.hour}-${parts.minute}-${parts.second}-${parts.dayPeriod}`;
      if (secondKey === lastSecond) return;
      lastSecond = secondKey;
      const hour = String(parts.hour).padStart(2, '0');
      const minute = String(parts.minute).padStart(2, '0');
      const second = String(parts.second).padStart(2, '0');
      drawTime(timeGroup, hour, minute, second);
      drawDate(dateGroup, parts.month, parts.day);
      weekday.textContent = String(parts.weekday).toUpperCase();
      period.textContent = String(parts.dayPeriod).toUpperCase();
      caption.textContent = `${weekday.textContent} ${parts.day}/${parts.month} · ${hour}:${minute}:${second} ${period.textContent} · Brasília`;
      clock.setAttribute('aria-label', `Relógio digital marcando ${hour}:${minute}:${second} ${period.textContent}, horário de Brasília`);
    }

    update();
    const timer = window.setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
