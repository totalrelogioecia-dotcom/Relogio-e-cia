const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');
const REVIEWS = path.join(DATA, 'product-reviews.json');
const ALLOWED_REVIEW_STATUS = new Set(['pending', 'approved', 'rejected']);

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function write(file, value) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

async function persistReviews(reviews) {
  write(REVIEWS, reviews);
  await flushPersistentStore();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function paidOrder(order) {
  const orderStatus = String(order?.status || '').toLowerCase();
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  return orderStatus === 'paid' || ['approved', 'processed'].includes(paymentStatus);
}

function orderCancelled(order) {
  const orderStatus = String(order?.status || '').toLowerCase();
  const cancellationStatus = String(order?.store_cancellation?.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'refunded'].includes(orderStatus) || cancellationStatus === 'refunded';
}

function itemProductId(item) {
  const value = item?.id ?? item?.product_id ?? item?.produto_id ?? item?.product?.id;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function orderContainsProduct(order, productId) {
  const candidates = [order?.items, order?.products, order?.produtos, order?.cart?.items, order?.checkout?.items];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    if (list.some(item => itemProductId(item) === Number(productId))) return true;
  }
  return false;
}

function verifiedPurchase(user, productId) {
  if (!user?.email || !Number.isFinite(Number(productId))) return null;
  const email = normalizeEmail(user.email);
  return read(ORDERS, [])
    .filter(order => normalizeEmail(order?.payer?.email) === email)
    .filter(order => paidOrder(order) && !orderCancelled(order))
    .filter(order => orderContainsProduct(order, productId))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

function publicName(name) {
  const parts = String(name || 'Cliente').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Cliente';
  if (parts.length === 1) return parts[0].slice(0, 40);
  return `${parts[0].slice(0, 32)} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

function cleanText(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function publicReview(review) {
  return {
    id: review.id,
    product_id: review.product_id,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    author_name: review.author_name,
    verified_purchase: true,
    created_at: review.created_at
  };
}

function aggregate(reviews) {
  const approved = reviews.filter(review => review.status === 'approved');
  const count = approved.length;
  const average = count
    ? Number((approved.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count).toFixed(1))
    : 0;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  approved.forEach(review => {
    const rating = Number(review.rating);
    if (distribution[rating] != null) distribution[rating] += 1;
  });
  return { count, average, distribution };
}

function registerReviewRoutes(app, { userFromRequest } = {}) {
  app.use('/api/reviews', express.json({ limit: '64kb' }));
  app.use('/api/admin/reviews', express.json({ limit: '64kb' }));

  app.get('/api/reviews', (req, res) => {
    const productId = Number(req.query.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Produto inválido.' });
    }
    const reviews = read(REVIEWS, [])
      .filter(review => Number(review.product_id) === productId && review.status === 'approved')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    res.set('Cache-Control', 'no-store');
    return res.json({ summary: aggregate(reviews), reviews: reviews.map(publicReview) });
  });

  app.get('/api/reviews/eligibility', (req, res) => {
    const productId = Number(req.query.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Produto inválido.' });
    }
    const user = typeof userFromRequest === 'function' ? userFromRequest(req) : null;
    if (!user) {
      return res.json({ authenticated: false, eligible: false, reason: 'login_required' });
    }
    const order = verifiedPurchase(user, productId);
    if (!order) {
      return res.json({ authenticated: true, eligible: false, reason: 'verified_purchase_required' });
    }
    const existing = read(REVIEWS, []).find(review => review.user_id === user.id && Number(review.product_id) === productId);
    return res.json({
      authenticated: true,
      eligible: true,
      order_id: order.id,
      existing_review: existing ? {
        id: existing.id,
        rating: existing.rating,
        title: existing.title,
        comment: existing.comment,
        status: existing.status,
        updated_at: existing.updated_at || existing.created_at
      } : null
    });
  });

  app.post('/api/reviews', async (req, res) => {
    try {
      const user = typeof userFromRequest === 'function' ? userFromRequest(req) : null;
      if (!user) return res.status(401).json({ error: 'Entre na sua conta para avaliar um produto.' });

      const productId = Number(req.body?.product_id);
      const rating = Number(req.body?.rating);
      const title = cleanText(req.body?.title, 80);
      const comment = cleanText(req.body?.comment, 900);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ error: 'Produto inválido.' });
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Escolha uma nota de 1 a 5 estrelas.' });
      if (comment.length < 15) return res.status(400).json({ error: 'Conte um pouco mais sobre sua experiência com o produto.' });

      const product = read(PRODUCTS, []).find(item => Number(item.id) === productId);
      if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
      const order = verifiedPurchase(user, productId);
      if (!order) return res.status(403).json({ error: 'Somente clientes que compraram este produto podem avaliá-lo.' });

      const reviews = read(REVIEWS, []);
      const index = reviews.findIndex(review => review.user_id === user.id && Number(review.product_id) === productId);
      const now = new Date().toISOString();
      const base = index >= 0 ? reviews[index] : {
        id: crypto.randomUUID(),
        user_id: user.id,
        product_id: productId,
        product_name: String(product.nome || '').slice(0, 180),
        product_sku: String(product.sku || '').slice(0, 100),
        author_name: publicName(user.nome),
        customer_email: normalizeEmail(user.email),
        order_id: String(order.id || '').slice(0, 160),
        created_at: now
      };
      const review = {
        ...base,
        rating,
        title,
        comment,
        verified_purchase: true,
        status: 'pending',
        moderation_note: '',
        moderated_at: null,
        updated_at: now
      };
      if (index >= 0) reviews[index] = review;
      else reviews.push(review);
      await persistReviews(reviews);
      return res.status(index >= 0 ? 200 : 201).json({
        ok: true,
        review: { id: review.id, status: review.status },
        message: 'Avaliação recebida. Ela ficará visível depois da moderação da loja.'
      });
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error.message);
      return res.status(500).json({ error: 'Não foi possível salvar sua avaliação.' });
    }
  });

  app.get('/api/admin/reviews', (req, res) => {
    const status = cleanText(req.query.status, 20).toLowerCase();
    let reviews = read(REVIEWS, []).slice();
    if (ALLOWED_REVIEW_STATUS.has(status)) reviews = reviews.filter(review => review.status === status);
    reviews.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    res.set('Cache-Control', 'no-store');
    return res.json(reviews);
  });

  app.patch('/api/admin/reviews/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const status = cleanText(req.body?.status, 20).toLowerCase();
      const moderationNote = cleanText(req.body?.moderation_note, 500);
      if (!ALLOWED_REVIEW_STATUS.has(status) || status === 'pending') {
        return res.status(400).json({ error: 'Selecione Aprovar ou Rejeitar.' });
      }
      const reviews = read(REVIEWS, []);
      const index = reviews.findIndex(review => review.id === id);
      if (index < 0) return res.status(404).json({ error: 'Avaliação não encontrada.' });
      const now = new Date().toISOString();
      reviews[index] = {
        ...reviews[index],
        status,
        moderation_note: moderationNote,
        moderated_at: now,
        updated_at: now
      };
      await persistReviews(reviews);
      return res.json({ ok: true, review: reviews[index] });
    } catch (error) {
      console.error('Erro ao moderar avaliação:', error.message);
      return res.status(500).json({ error: 'Não foi possível atualizar a avaliação.' });
    }
  });
}

module.exports = {
  aggregate,
  orderContainsProduct,
  paidOrder,
  registerReviewRoutes,
  verifiedPurchase
};