(() => {
  'use strict';
  const root = document.getElementById('home-carousel');
  if (!root) return;
  const stage = document.getElementById('home-carousel-stage');
  const controls = document.getElementById('home-carousel-controls');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let slides = [], index = 0, timer = null, visible = true, interval = 7, startX = null, startY = null, activePointer = null, temporarilyPaused = false;
  let dragCurrent = null, dragNeighbor = null, dragDirection = 0, dragHorizontal = false, blockClicksUntil = 0;
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
  function darkMode() { return document.documentElement.classList.contains('reloja-dark'); }
  function replaceSlide(frame) {
    const previous = stage.children[stage.children.length - 1];
    if (!previous || reduced.matches || typeof frame.animate !== 'function' || typeof previous.animate !== 'function') {
      stage.replaceChildren(frame);
      return;
    }
    frame.style.opacity = '0';
    frame.style.zIndex = '2';
    previous.style.zIndex = '1';
    previous.style.pointerEvents = 'none';
    stage.append(frame);
    const options = { duration:700, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards' };
    const incoming = frame.animate([{ opacity:0 }, { opacity:1 }], options);
    const outgoing = previous.animate([{ opacity:1 }, { opacity:0 }], options);
    incoming.finished.then(() => { frame.style.opacity = ''; frame.style.zIndex = ''; incoming.cancel(); }, () => {});
    const removePrevious = () => { if (previous.parentNode === stage) previous.remove(); };
    outgoing.finished.then(removePrevious, removePrevious);
  }
  function createFrame(slide, slideIndex) {
    const frame = document.createElement(slide.href ? 'a' : 'div');
    frame.className = 'home-carousel-frame';
    if (slide.href) frame.href = slide.href;
    frame.setAttribute('role', slide.href ? 'link' : 'group');
    frame.setAttribute('aria-roledescription', 'slide');
    frame.setAttribute('aria-label', `${slideIndex + 1} de ${slides.length}${slide.href ? ': ' + slide.alt : ''}`);
    const picture = document.createElement('picture');
    const dark = darkMode();
    const desktopImage = dark && slide.dark_image ? slide.dark_image : slide.image;
    const mobileImage = dark ? (slide.dark_mobile_image || slide.dark_image || slide.mobile_image || slide.image) : (slide.mobile_image || slide.image);
    if (mobileImage !== desktopImage) { const source = document.createElement('source'); source.media = '(max-width: 760px)'; source.srcset = mobileImage; picture.append(source); }
    const image = document.createElement('img');
    image.src = desktopImage; image.alt = slide.alt; image.width = 1920; image.height = 600; image.decoding = 'async'; image.draggable = false;
    image.addEventListener('error', () => { pauseTemporarily(); placeholder(); }, { once: true });
    picture.append(image); frame.append(picture);
    return frame;
  }
  function updateCurrentControl() {
    controls.querySelectorAll('[data-slide]').forEach(button => button.setAttribute('aria-current', Number(button.dataset.slide) === index ? 'true' : 'false'));
  }
  function show(next) {
    if (!slides.length) return;
    index = (next + slides.length) % slides.length;
    replaceSlide(createFrame(slides[index], index));
    updateCurrentControl();
  }
  function renderControls() {
    controls.replaceChildren();
    controls.hidden = true;
  }
  root.addEventListener('pointerenter', pauseTemporarily);
  root.addEventListener('pointerleave', () => { if (activePointer === null) resumeAutomatic(); });
  root.addEventListener('focusin', pauseTemporarily);
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) resumeAutomatic(); });
  root.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1)); schedule(); } });
  stage.addEventListener('dragstart', event => event.preventDefault());
  function resetFrameStyle(frame) {
    if (!frame) return;
    frame.style.transform = '';
    frame.style.transition = '';
    frame.style.opacity = '';
    frame.style.zIndex = '';
    frame.style.pointerEvents = '';
  }
  function currentFrameForDrag() {
    const frame = stage.children[stage.children.length - 1];
    if (!frame || !String(frame.className || '').split(/\s+/).includes('home-carousel-frame')) return null;
    if (typeof frame.getAnimations === 'function') frame.getAnimations().forEach(animation => animation.cancel());
    resetFrameStyle(frame);
    if (stage.children.length > 1) stage.replaceChildren(frame);
    return frame;
  }
  function prepareNeighbor(direction) {
    if (dragNeighbor && dragDirection === direction) return;
    dragNeighbor?.remove();
    dragDirection = direction;
    const neighborIndex = (index + direction + slides.length) % slides.length;
    dragNeighbor = createFrame(slides[neighborIndex], neighborIndex);
    dragNeighbor.classList.add('is-drag-neighbor');
    dragNeighbor.setAttribute('aria-hidden', 'true');
    dragNeighbor.style.zIndex = '2';
    dragNeighbor.style.transition = 'none';
    stage.append(dragNeighbor);
  }
  function moveFrames(dx) {
    if (!dragCurrent || !dragNeighbor) return;
    const width = Math.max(1, stage.clientWidth || root.clientWidth || 1);
    dragCurrent.style.transform = `translate3d(${dx}px,0,0)`;
    dragNeighbor.style.transform = `translate3d(${dx + dragDirection * width}px,0,0)`;
  }
  stage.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    startX = event.clientX; startY = event.clientY; activePointer = event.pointerId ?? 1;
    dragCurrent = currentFrameForDrag(); dragNeighbor = null; dragDirection = 0; dragHorizontal = false;
    stage.classList.add('is-dragging');
    pauseTemporarily();
  });
  stage.addEventListener('pointermove', event => {
    if (activePointer === null || (event.pointerId !== undefined && event.pointerId !== activePointer)) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if (!dragHorizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      dragHorizontal = true;
      if (stage.setPointerCapture && event.pointerId !== undefined) stage.setPointerCapture(event.pointerId);
    }
    if (!dragHorizontal) return;
    if (event.cancelable) event.preventDefault();
    const direction = dx < 0 ? 1 : -1;
    prepareNeighbor(direction);
    moveFrames(dx);
  });
  function finishPointer(event, cancelled = false) {
    if (activePointer === null || (event.pointerId !== undefined && event.pointerId !== activePointer)) return;
    const dx = event.clientX === undefined ? 0 : event.clientX - startX;
    const dy = event.clientY === undefined ? 0 : event.clientY - startY;
    if (stage.releasePointerCapture && event.pointerId !== undefined && stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    const wasHorizontal = dragHorizontal;
    const current = dragCurrent, neighbor = dragNeighbor, direction = dragDirection;
    const width = Math.max(1, stage.clientWidth || root.clientWidth || 1);
    const threshold = Math.min(110, Math.max(55, width * .12));
    const commit = !cancelled && wasHorizontal && neighbor && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);
    startX = startY = null; activePointer = null; dragHorizontal = false; stage.classList.remove('is-dragging');
    if (!wasHorizontal || !current) {
      dragCurrent = dragNeighbor = null; dragDirection = 0; resumeAutomatic(); return;
    }
    blockClicksUntil = Date.now() + 500;
    const duration = reduced.matches ? 0 : 360;
    const transition = duration ? 'transform 360ms cubic-bezier(.22,.61,.36,1)' : 'none';
    current.style.transition = transition;
    if (neighbor) neighbor.style.transition = transition;
    if (commit) {
      current.style.transform = `translate3d(${-direction * width}px,0,0)`;
      neighbor.style.transform = 'translate3d(0,0,0)';
      index = (index + direction + slides.length) % slides.length;
      updateCurrentControl();
    } else {
      current.style.transform = 'translate3d(0,0,0)';
      if (neighbor) neighbor.style.transform = `translate3d(${direction * width}px,0,0)`;
    }
    const finish = () => {
      if (commit && neighbor) {
        neighbor.removeAttribute('aria-hidden'); neighbor.classList.remove('is-drag-neighbor'); resetFrameStyle(neighbor); stage.replaceChildren(neighbor);
      } else {
        neighbor?.remove(); resetFrameStyle(current); stage.replaceChildren(current);
      }
      dragCurrent = dragNeighbor = null; dragDirection = 0;
    };
    if (duration) setTimeout(finish, duration + 40); else finish();
    resumeAutomatic();
  }
  stage.addEventListener('pointerup', event => finishPointer(event));
  stage.addEventListener('pointercancel', event => finishPointer(event, true));
  stage.addEventListener('click', event => { if (Date.now() < blockClicksUntil) event.preventDefault(); }, true);
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  if ('MutationObserver' in window) new window.MutationObserver(mutations => { if (slides.length && mutations.some(mutation => mutation.attributeName === 'class')) show(index); }).observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
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
