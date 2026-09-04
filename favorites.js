const fs = require('fs');
const path = require('path');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');
const PRODUCTS = path.join(DATA, 'products.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}
function favoriteIds(user) {
  return Array.isArray(user?.favorites)
    ? user.favorites.map(item => Number(typeof item === 'object' ? item.product_id : item)).filter(Number.isFinite)
    : [];
}
function productSnapshot(product) {
  return {
    id: Number(product.id),
    nome: String(product.nome || ''),
    marca: String(product.marca || ''),
    sku: String(product.sku || ''),
    preco: Number(product.preco || 0),
    estoque: Number(product.estoque || 0),
    foto: (Array.isArray(product.fotos) && product.fotos.find(Boolean)) || product.foto || ''
  };
}

function registerFavoriteRoutes(app, { userFromRequest }) {
  app.use('/api/favorites', express.json({ limit: '20kb' }));

  app.get('/api/favorites', (req, res) => {
    const user = userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Entre na sua conta para ver seus favoritos.' });
    const ids = favoriteIds(user);
    const products = read(PRODUCTS, []).filter(product => ids.includes(Number(product.id)) && product.ativo !== false);
    const order = new Map(ids.map((id, index) => [id, index]));
    products.sort((a, b) => (order.get(Number(a.id)) ?? 9999) - (order.get(Number(b.id)) ?? 9999));
    return res.json({ ids, products: products.map(productSnapshot) });
  });

  app.post('/api/favorites/:productId', async (req, res) => {
    const user = userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Entre na sua conta para salvar favoritos.' });
    const productId = Number(req.params.productId);
    const product = read(PRODUCTS, []).find(item => Number(item.id) === productId && item.ativo !== false);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    const users = read(USERS, []);
    const index = users.findIndex(item => item.id === user.id);
    if (index < 0) return res.status(404).json({ error: 'Conta não encontrada.' });
    const current = Array.isArray(users[index].favorites) ? users[index].favorites : [];
    if (!favoriteIds(users[index]).includes(productId)) {
      users[index].favorites = [{ product_id: productId, created_at: new Date().toISOString() }, ...current].slice(0, 200);
      write(USERS, users);
      await flushPersistentStore();
    }
    return res.json({ ok: true, favorite: true, product: productSnapshot(product) });
  });

  app.delete('/api/favorites/:productId', async (req, res) => {
    const user = userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Entre na sua conta para alterar favoritos.' });
    const productId = Number(req.params.productId);
    const users = read(USERS, []);
    const index = users.findIndex(item => item.id === user.id);
    if (index < 0) return res.status(404).json({ error: 'Conta não encontrada.' });
    users[index].favorites = (Array.isArray(users[index].favorites) ? users[index].favorites : [])
      .filter(item => Number(typeof item === 'object' ? item.product_id : item) !== productId);
    write(USERS, users);
    await flushPersistentStore();
    return res.json({ ok: true, favorite: false });
  });

  app.get('/api/admin/favorites/summary', (req, res) => {
    const users = read(USERS, []);
    const products = read(PRODUCTS, []);
    const counts = new Map();
    let total = 0;
    for (const user of users) {
      for (const id of new Set(favoriteIds(user))) {
        counts.set(id, (counts.get(id) || 0) + 1);
        total += 1;
      }
    }
    const top = [...counts.entries()]
      .map(([id, count]) => {
        const product = products.find(item => Number(item.id) === Number(id));
        return product ? { ...productSnapshot(product), favorites: count } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.favorites - a.favorites || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 15);
    return res.json({ total_saves: total, customers_with_favorites: users.filter(user => favoriteIds(user).length).length, top });
  });
}

module.exports = { registerFavoriteRoutes, favoriteIds };
