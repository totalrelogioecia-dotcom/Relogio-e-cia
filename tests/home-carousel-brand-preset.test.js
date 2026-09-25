'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-carousel-preset-test-'));
process.env.DATA_DIR = dataDir;

const {
  installBrandCarouselPresetOnce,
  CAROUSEL_FILE,
  BACKUP_FILE,
  STATE_FILE,
  MARKER,
  SLIDES
} = require('../home-carousel-brand-preset');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('preset cria cinco slides PC/mobile, guarda backup e só é aplicado uma vez', () => {
  const previous = {
    revision: 8,
    autoplay: false,
    interval: 12,
    slides: [{ id: 'anterior', enabled: true, image: 'data:image/webp;base64,UklGRg==', mobile_image: '', dark_image: '', dark_mobile_image: '', alt: 'Anterior', href: '' }]
  };
  fs.writeFileSync(CAROUSEL_FILE, JSON.stringify(previous));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ completed: true }));

  const first = installBrandCarouselPresetOnce();
  assert.equal(first.applied, true);

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  assert.equal(backup.revision, 8);
  assert.equal(backup.slides[0].id, 'anterior');

  const carousel = JSON.parse(fs.readFileSync(CAROUSEL_FILE, 'utf8'));
  assert.equal(carousel.revision, 9);
  assert.equal(carousel.autoplay, true);
  assert.equal(carousel.interval, 7);
  assert.deepEqual(carousel.slides.map(slide => slide.id), SLIDES.map(slide => slide.id));
  assert.deepEqual(carousel.slides.map(slide => slide.href), [
    'produtos.html?marca=Technos',
    'produtos.html?marca=Casio',
    'produtos.html?marca=G-Shock',
    'produtos.html?marca=Citizen',
    'produtos.html?marca=Orient'
  ]);
  for (const slide of carousel.slides) {
    assert.equal(slide.enabled, true);
    assert.match(slide.image, /^data:image\/webp;base64,UklGR/);
    assert.match(slide.mobile_image, /^data:image\/webp;base64,UklGR/);
    assert.equal(slide.dark_image, '');
    assert.equal(slide.dark_mobile_image, '');
    assert.ok(slide.alt.length > 20);
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  assert.equal(state[MARKER].completed, true);
  assert.equal(state[MARKER].backup_file, path.basename(BACKUP_FILE));

  const changed = { ...carousel, interval: 11 };
  fs.writeFileSync(CAROUSEL_FILE, JSON.stringify(changed));
  const second = installBrandCarouselPresetOnce();
  assert.equal(second.applied, false);
  assert.equal(JSON.parse(fs.readFileSync(CAROUSEL_FILE, 'utf8')).interval, 11);
});
