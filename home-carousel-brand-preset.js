'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const CAROUSEL_FILE = path.join(DATA, 'home-carousel.json');
const BACKUP_FILE = path.join(DATA, 'home-carousel-brand-images-backup-2026-09-25.json');
const STATE_FILE = path.join(DATA, 'account-reset.json');
const ASSET_DIR = path.join(__dirname, 'assets', 'carousel');
const MARKER = 'brand_carousel_images_2026_09_25';
const MAX_IMAGE_BYTES = 600 * 1024;

const SLIDES = Object.freeze([
  {
    id: 'brand-technos',
    brand: 'Technos',
    desktop: 'technos-desktop.webp',
    mobile: 'technos-mobile.webp',
    alt: 'Relógio Technos Digitech dourado com mostrador preto em cenário claro.',
    href: 'produtos.html?marca=Technos'
  },
  {
    id: 'brand-casio',
    brand: 'Casio',
    desktop: 'casio-desktop.webp',
    mobile: 'casio-mobile.webp',
    alt: 'Relógio Casio Duro de aço com mostrador preto em cenário azul-escuro.',
    href: 'produtos.html?marca=Casio'
  },
  {
    id: 'brand-gshock',
    brand: 'G-Shock',
    desktop: 'gshock-desktop.webp',
    mobile: 'gshock-mobile.webp',
    alt: 'Relógio G-Shock CasiOak preto em cenário industrial com luz vermelha.',
    href: 'produtos.html?marca=G-Shock'
  },
  {
    id: 'brand-citizen',
    brand: 'Citizen',
    desktop: 'citizen-desktop.webp',
    mobile: 'citizen-mobile.webp',
    alt: 'Relógio Citizen Promaster Aqualand com mostrador luminoso em cenário aquático.',
    href: 'produtos.html?marca=Citizen'
  },
  {
    id: 'brand-orient',
    brand: 'Orient',
    desktop: 'orient-desktop.webp',
    mobile: 'orient-mobile.webp',
    alt: 'Relógio Orient 3 Estrelas automático de aço com mostrador branco em cenário claro.',
    href: 'produtos.html?marca=Orient'
  }
]);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function imageData(filename) {
  const bytes = fs.readFileSync(path.join(ASSET_DIR, filename));
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error(`Imagem do carrossel inválida ou maior que 600 KB: ${filename}`);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Imagem do carrossel não é WebP: ${filename}`);
  return `data:image/webp;base64,${bytes.toString('base64')}`;
}

function installBrandCarouselPresetOnce() {
  const state = readJson(STATE_FILE, {});
  if (state?.[MARKER]?.completed) return { applied: false, marker: state[MARKER] };

  const previous = readJson(CAROUSEL_FILE, { revision: 0, autoplay: true, interval: 7, slides: [] });
  const completedAt = new Date().toISOString();
  const revision = Math.max(0, Number(previous?.revision) || 0) + 1;
  const slides = SLIDES.map(slide => ({
    id: slide.id,
    admin_name: slide.brand,
    enabled: true,
    alt: slide.alt,
    href: slide.href,
    image: imageData(slide.desktop),
    mobile_image: imageData(slide.mobile),
    dark_image: '',
    dark_mobile_image: ''
  }));

  const existingBackup = readJson(BACKUP_FILE, null);
  if (!existingBackup || existingBackup.backup_reason !== MARKER) {
    writeJson(BACKUP_FILE, { ...previous, backed_up_at: completedAt, backup_reason: MARKER });
  }
  writeJson(CAROUSEL_FILE, { revision, autoplay: true, interval: 7, slides, updated_at: completedAt });
  const marker = {
    completed: true,
    revision,
    slide_ids: slides.map(slide => slide.id),
    backup_file: path.basename(BACKUP_FILE),
    completed_at: completedAt
  };
  writeJson(STATE_FILE, { ...state, [MARKER]: marker });
  return { applied: true, marker };
}

module.exports = { installBrandCarouselPresetOnce, CAROUSEL_FILE, BACKUP_FILE, STATE_FILE, MARKER, SLIDES };
