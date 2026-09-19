'use strict';
const fs = require('fs');
const path = require('path');
const { authenticatedRequest } = require('./admin-session');
const { flushPersistentStore } = require('./persistent-store');
const FILE = path.join(path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')), 'home-carousel.json');
const MAX_IMAGE_BYTES = 600 * 1024;
const defaults = () => ({ revision: 0, autoplay: true, interval: 7, slides: [1, 2, 3].map(n => ({ id: `slide-${n}`, enabled: true, alt: '', image: '', mobile_image: '', dark_image: '', dark_mobile_image: '', href: '' })) });
let saving = Promise.resolve();
function error(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function readCarousel() {
  try {
    const value = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return value && !Array.isArray(value) && Array.isArray(value.slides) ? value : defaults();
  } catch { return defaults(); }
}
function imageData(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > MAX_IMAGE_BYTES * 1.4 + 100) throw error('Cada foto deve ter no máximo 600 KB após otimização.');
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw error('Use fotos JPG, PNG ou WebP. SVG e links externos não são aceitos.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== match[2]) throw error('Foto inválida ou muito grande.');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw error('O conteúdo da foto não corresponde ao formato informado.');
  return value;
}
function slideHref(value) {
  const href = String(value || '').trim();
  if (!href) return '';
  if (!/^(?:\/)?(?:produtos|produto|sobre)\.html(?:[?#][^\s<>"'\\]*)?$/.test(href) || href.length > 300) throw error('O destino deve ser uma página de produtos, produto ou sobre da própria loja.');
  return href;
}
function normalizeCarousel(body) {
  if (!body || !Array.isArray(body.slides) || body.slides.length > 5) throw error('Cadastre no máximo 5 slides.');
  const seen = new Set();
  const slides = body.slides.map(slide => {
    if (!slide || typeof slide.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(slide.id) || seen.has(slide.id)) throw error('Identificação de slide inválida ou repetida.');
    seen.add(slide.id);
    const image = imageData(slide.image);
    const mobile_image = imageData(slide.mobile_image);
    const dark_image = imageData(slide.dark_image);
    const dark_mobile_image = imageData(slide.dark_mobile_image);
    const alt = String(slide.alt || '').trim().slice(0, 180);
    if ((image || mobile_image || dark_image || dark_mobile_image) && !alt) throw error('Descreva cada foto para os leitores de tela.');
    if ((mobile_image || dark_image || dark_mobile_image) && !image) throw error('Adicione a foto principal antes das versões alternativas.');
    return { id: slide.id, enabled: slide.enabled === true, alt, image, mobile_image, dark_image, dark_mobile_image, href: slideHref(slide.href) };
  });
  return { autoplay: body.autoplay === true, interval: Math.max(6, Math.min(12, Number(body.interval) || 7)), slides };
}
function publicCarousel(value) {
  const revision = Number(value.revision) || 0;
  return { revision, autoplay: value.autoplay === true, interval: value.interval || 7,
    slides: value.slides.filter(s => s.enabled && s.image).map(s => ({ id: s.id, alt: s.alt, href: s.href,
      image: `/api/home-carousel/images/${encodeURIComponent(s.id)}/desktop?v=${revision}`,
      mobile_image: s.mobile_image ? `/api/home-carousel/images/${encodeURIComponent(s.id)}/mobile?v=${revision}` : '',
      dark_image: s.dark_image ? `/api/home-carousel/images/${encodeURIComponent(s.id)}/dark-desktop?v=${revision}` : '',
      dark_mobile_image: s.dark_mobile_image ? `/api/home-carousel/images/${encodeURIComponent(s.id)}/dark-mobile?v=${revision}` : '' })) };
}
function owner(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const admin = authenticatedRequest(req);
  if (!admin) return res.status(401).json({ error: 'Entre no Admin para continuar.' });
  if (admin.access_level !== 'owner') return res.status(403).json({ error: 'Somente o proprietário pode alterar o carrossel.' });
  req.admin = admin;
  next();
}
function registerHomeCarouselRoutes(app) {
  app.get('/api/home-carousel', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(publicCarousel(readCarousel())); });
  app.get('/api/home-carousel/images/:id/:variant', (req, res) => {
    const slide = readCarousel().slides.find(s => s.id === req.params.id && s.enabled && s.image);
    const variants = { desktop: 'image', mobile: 'mobile_image', 'dark-desktop': 'dark_image', 'dark-mobile': 'dark_mobile_image' };
    const data = slide && variants[req.params.variant] ? slide[variants[req.params.variant]] : '';
    if (!data) return res.status(404).end();
    try {
      imageData(data);
      const [type, encoded] = data.slice(5).split(';base64,');
      res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.send(Buffer.from(encoded, 'base64'));
    } catch { res.status(404).end(); }
  });
  app.get('/api/admin/home-carousel', owner, (req, res) => res.json(readCarousel()));
  app.put('/api/admin/home-carousel', owner, async (req, res) => {
    try {
      const input = normalizeCarousel(req.body);
      const revision = Number(req.body.revision);
      const task = saving.catch(() => {}).then(async () => {
        const previous = readCarousel();
        if (!Number.isSafeInteger(revision) || revision !== Number(previous.revision || 0)) throw error('O carrossel mudou em outra sessão. Recarregue antes de salvar.', 409);
        const value = { ...input, revision: revision + 1, updated_at: new Date().toISOString() };
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        try {
          fs.writeFileSync(FILE, JSON.stringify(value), 'utf8');
          await flushPersistentStore();
        } catch (failure) {
          fs.writeFileSync(FILE, JSON.stringify(previous), 'utf8');
          await flushPersistentStore().catch(() => {});
          throw error('Não foi possível guardar o carrossel. Tente novamente.', 503);
        }
        return value;
      });
      saving = task;
      res.json(await task);
    } catch (failure) { res.status(failure.statusCode || 500).json({ error: failure.message || 'Não foi possível salvar.' }); }
  });
}
module.exports = { registerHomeCarouselRoutes, normalizeCarousel, publicCarousel, readCarousel, imageData, FILE };
