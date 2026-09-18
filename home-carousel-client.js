(() => {
  'use strict';
  const root = document.getElementById('home-carousel');
  if (!root) return;
  const stage = document.getElementById('home-carousel-stage');
  const controls = document.getElementById('home-carousel-controls');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let slides = [], index = 0, timer = null, visible = true, interval = 7, startX = null, swiped = false, temporarilyPaused = false;
  function placeholder() {
    const box = document.createElement('div');
    box.className = 'home-carousel-placeholder';
    const brand = document.createElement('span'); brand.textContent = 'RELÓGIO E CIA';
    const heading = document.createElement('strong'); heading.textContent = 'Novos destaques em breve';
    const text = document.createElement('p'); text.textContent = 'Conheça os relógios e acessórios no nosso catálogo.';
    box.append(brand, heading, text); stage.replaceChildren(box);
  }
  function schedule() {
    clearInterval(timer); timer = null;
    if (!reduced.matches && !temporarilyPaused && !document.hidden && visible && slides.length > 1) {
      timer = setInterval(() => show(index + 1), interval * 1000);
    }
    stage.setAttribute('aria-live', 'polite');
  }
  function pauseTemporarily() { temporarilyPaused = true; schedule(); }
  function resumeAutomatic() { temporarilyPaused = false; schedule(); }
  function show(next) {
    if (!slides.length) return;
    index = (next + slides.length) % slides.length;
    const slide = slides[index];
    const frame = document.createElement(slide.href ? 'a' : 'div');
    if (slide.href) frame.href = slide.href;
    frame.setAttribute('role', slide.href ? 'link' : 'group');
    frame.setAttribute('aria-roledescription', 'slide');
    frame.setAttribute('aria-label', `${index + 1} de ${slides.length}${slide.href ? ': ' + slide.alt : ''}`);
    const picture = document.createElement('picture');
    if (slide.mobile_image) { const source = document.createElement('source'); source.media = '(max-width: 760px)'; source.srcset = slide.mobile_image; picture.append(source); }
    const image = document.createElement('img');
    image.src = slide.image; image.alt = slide.alt; image.width = 1920; image.height = 600; image.decoding = 'async';
    image.addEventListener('error', () => { pauseTemporarily(); placeholder(); }, { once: true });
    picture.append(image); frame.append(picture); stage.replaceChildren(frame);
    controls.querySelectorAll('[data-slide]').forEach(button => button.setAttribute('aria-current', Number(button.dataset.slide) === index ? 'true' : 'false'));
  }
  function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; }
  function renderControls() {
    controls.replaceChildren(); controls.hidden = slides.length < 2;
    if (slides.length < 2) return;
    const previous = button('←', () => { show(index - 1); schedule(); }); previous.setAttribute('aria-label', 'Slide anterior');
    const next = button('→', () => { show(index + 1); schedule(); }); next.setAttribute('aria-label', 'Próximo slide');
    const dots = document.createElement('div'); dots.className = 'home-carousel-dots';
    slides.forEach((slide, n) => { const b = button('', () => { show(n); schedule(); }); b.dataset.slide = n; b.setAttribute('aria-label', `Mostrar slide ${n + 1}`); dots.append(b); });
    controls.append(previous, dots, next);
  }
  root.addEventListener('pointerenter', pauseTemporarily);
  root.addEventListener('pointerleave', resumeAutomatic);
  root.addEventListener('focusin', pauseTemporarily);
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) resumeAutomatic(); });
  root.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1)); schedule(); } });
  stage.addEventListener('pointerdown', event => { startX = event.clientX; swiped = false; pauseTemporarily(); });
  stage.addEventListener('pointerup', event => { if (startX !== null && Math.abs(event.clientX - startX) > 50) { swiped = true; show(index + (event.clientX < startX ? 1 : -1)); } startX = null; resumeAutomatic(); });
  stage.addEventListener('pointercancel', () => { startX = null; resumeAutomatic(); });
  stage.addEventListener('click', event => { if (swiped) { event.preventDefault(); swiped = false; } }, true);
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }).observe(root);
  async function load() {
    try {
      const response = await fetch('/api/home-carousel', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw Error('Não foi possível carregar os destaques.');
      const data = await response.json();
      slides = Array.isArray(data.slides) ? data.slides : [];
      interval = Math.max(6, Math.min(12, Number(data.interval) || 7));
      renderControls(); if (slides.length) show(0); else placeholder(); schedule();
    } catch { placeholder(); controls.hidden = true; }
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '300px' }); observer.observe(root);
  } else load();
})();
