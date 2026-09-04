const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const DETAILS = path.join(DATA, 'product-details.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function photoOf(product) {
  if (Array.isArray(product?.fotos)) return product.fotos.find(Boolean) || '';
  return product?.foto || '';
}

function publicRelated(product, products) {
  return products
    .filter(item => item && item.ativo !== false && Number(item.id) !== Number(product.id))
    .map(item => {
      let score = 0;
      if (item.marca === product.marca) score += 4;
      if (item.categoria === product.categoria) score += 2;
      const base = Math.max(1, Number(product.preco) || 1);
      const delta = Math.abs((Number(item.preco) || 0) - base) / base;
      if (delta <= 0.15) score += 3;
      else if (delta <= 0.35) score += 2;
      else if (delta <= 0.6) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || Number(a.item.id) - Number(b.item.id))
    .slice(0, 6)
    .map(({ item }) => ({
      id: Number(item.id),
      nome: String(item.nome || ''),
      marca: String(item.marca || ''),
      categoria: String(item.categoria || ''),
      preco: Number(item.preco) || 0,
      sku: String(item.sku || ''),
      fotos: photoOf(item) ? [photoOf(item)] : [],
      estoque: Math.max(0, Number(item.estoque) || 0)
    }));
}

function registerProductPageRoute(app) {
  app.get('/api/product-page/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Produto inválido.' });

    const products = readJson(PRODUCTS, []);
    const details = readJson(DETAILS, {});
    const product = Array.isArray(products)
      ? products.find(item => Number(item?.id) === id && item?.ativo !== false)
      : null;

    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    res.set('Cache-Control', 'no-store');
    res.json({
      product: {
        ...product,
        detalhes: details && typeof details === 'object' && !Array.isArray(details)
          ? (details[String(id)] || {})
          : {}
      },
      related: publicRelated(product, products)
    });
  });
}

module.exports = { registerProductPageRoute };
