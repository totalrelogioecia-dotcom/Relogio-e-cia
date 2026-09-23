require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticatedRequest } = require('./admin-session');
const { registerStockAlertRoutes, queueStockAvailableEmails } = require('./stock-alerts');
const { createPublicStaticGuard, isAdminStaticFile } = require('./public-static-policy');
const { buildHomeCatalog } = require('./home-catalog');
const { withPublicProductList } = require('./public-product-media');
const { fetchAllowedImage } = require('./remote-image');
const { registerHomeCarouselRoutes } = require('./home-carousel');

const app = express();
// Render encaminha cada requisição por um único proxy; não confiar em toda a cadeia enviada pelo cliente.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const PRODUCT_DETAILS = path.join(DATA, 'product-details.json');
const ORDERS = path.join(DATA, 'orders.json');

fs.mkdirSync(DATA, { recursive: true });

const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
const getProducts = () => read(PRODUCTS, []);
const getOrders = () => read(ORDERS, []);
app.use(express.json({ limit: '10mb' }));
registerHomeCarouselRoutes(app);
app.use('/data/stock-alerts.json', (req, res) => res.status(404).end());
registerStockAlertRoutes(app);
app.use(createPublicStaticGuard());
app.use(express.static(ROOT, {
  index: 'index.html',
  setHeaders(res, filePath) {
    // O painel e seus módulos precisam pertencer sempre ao mesmo deploy.
    // Não permita que o navegador misture HTML novo com JS/CSS administrativos antigos.
    if (isAdminStaticFile(filePath)) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return;
    }
    if (/\.(?:css|js|svg|png|jpe?g|webp|gif|avif|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  }
}));

function admin(req, res, next) {
  const session = authenticatedRequest(req);
  if (!session) return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  req.admin = session;
  next();
}

function normalizeProduct(p) {
  return {
    id: Number(p.id), nome: String(p.nome || '').trim(), marca: String(p.marca || '').trim(),
    categoria: String(p.categoria || 'Relógios').trim(), preco: Number(p.preco) || 0,
    sku: String(p.sku || '').trim(), desc: String(p.desc || '').trim(),
    fotos: Array.isArray(p.fotos) ? p.fotos.filter(Boolean).slice(0, 8) : [],
    estoque: Math.max(0, Number(p.estoque) || 0), ativo: p.ativo !== false
  };
}

function isPaidOrder(order) {
  return String(order?.status || '').toLowerCase() === 'paid' || String(order?.payment_status || '').toLowerCase() === 'approved';
}

function normalizeInvoiceInput(body, previous = null) {
  const allowed = new Set(['pending', 'emitted', 'cancelled']);
  const status = String(body?.status || previous?.status || 'pending').trim().toLowerCase();
  if (!allowed.has(status)) throw Object.assign(new Error('Status da nota fiscal inválido.'), { statusCode: 400 });
  const number = String(body?.number ?? previous?.number ?? '').trim().slice(0, 40);
  const accessKey = String(body?.access_key ?? previous?.access_key ?? '').replace(/\D/g, '').slice(0, 44);
  if (status === 'emitted') {
    if (!number) throw Object.assign(new Error('Informe o número da NF-e.'), { statusCode: 400 });
    if (accessKey.length !== 44) throw Object.assign(new Error('A chave de acesso da NF-e deve ter 44 dígitos.'), { statusCode: 400 });
  }
  if (status === 'cancelled' && !number && !accessKey) throw Object.assign(new Error('Registre a NF-e antes de marcá-la como cancelada.'), { statusCode: 400 });
  const now = new Date().toISOString();
  return { status, number: status === 'pending' ? '' : number, access_key: status === 'pending' ? '' : accessKey,
    issued_at: status === 'emitted' ? (previous?.issued_at || now) : (previous?.issued_at || null),
    cancelled_at: status === 'cancelled' ? now : null, updated_at: now };
}

function decodeHtml(s) {
  return String(s || '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&times;/gi, '×').replace(/&deg;/gi, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function textOnly(html) {
  return decodeHtml(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function casioSkuCandidates(raw) {
  const clean = String(raw || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  const out = [clean];
  if (/DF$/.test(clean)) out.push(clean.replace(/DF$/, ''));
  if (/-SC$/.test(clean)) out.push(clean.replace(/-SC$/, ''));
  return [...new Set(out.filter(Boolean))];
}
function findAfter(text, labels) {
  for (const label of labels) {
    const i = text.toLowerCase().indexOf(label.toLowerCase());
    if (i < 0) continue;
    const tail = text.slice(i + label.length).replace(/^\s*[:\-]?\s*/, '');
    const line = tail.split(/\n/).map(x => x.trim()).find(Boolean);
    if (line && line.length < 240) return line;
  }
  return '';
}
function extractCasioImages(html) {
  const found = [];
  const add = u => {
    u = decodeHtml(String(u || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/'));
    if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https:\/\//i.test(u)) return;
    if (!/casio/i.test(u) || !/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(u)) return;
    if (/logo|icon|sprite|banner|common/i.test(u)) return;
    if (!found.includes(u)) found.push(u);
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/(?:src|data-src|data-original)=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/https:\/\/[^"'\s\\]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s\\]*)?/gi)) add(m[0]);
  return found.slice(0, 8);
}

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/products/home', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(buildHomeCatalog(withPublicProductList(getProducts())));
});

app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(withPublicProductList(getProducts().filter(p => p.ativo !== false)));
});

// Busca oficial Casio/G-Shock por referência. Usa a página pública brasileira da Casio,
// que é mais estável para ficha técnica do que depender do mecanismo interno do Portal Casio.
app.get('/api/admin/casio-enrichment', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const candidates = casioSkuCandidates(req.query.sku);
  if (!candidates.length) return res.status(400).json({ error: 'Informe a referência do relógio.' });
  try {
    let html = '', sku = '', source = '';
    for (const candidate of candidates) {
      const url = `https://www.casio.com/br/watches/casio/product.${encodeURIComponent(candidate)}/`;
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 RelogioECia/1.0', 'accept-language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const body = await r.text();
      if (!new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(body)) continue;
      html = body; sku = candidate; source = url; break;
    }
    if (!html) return res.status(404).json({ error: 'Não encontrei essa referência no catálogo oficial da Casio Brasil. Confira a referência e tente novamente.' });

    const text = textOnly(html);
    const descMatch = text.match(/(?:•\s*)?([^\n]{20,220}(?:resist|cron[oô]metro|alarme|LED)[^\n]{0,220})/i);
    const details = {
      movimento: findAfter(text, ['Precisão']),
      caixa_material: findAfter(text, ['Material da caixa e da moldura', 'Material da caixa e do bisel']),
      pulseira_material: findAfter(text, ['Pulseira', 'Bracelete']),
      diametro: findAfter(text, ['Tamanho do Relógio (Caixa|Visor) C x L x A', 'Tamanho da caixa (C × L × A)', 'Tamanho da caixa']),
      resistencia_agua: findAfter(text, ['Resistente a água', 'Resistência à água', 'Resistente à água']),
      vidro: findAfter(text, ['Vidro'])
    };
    Object.keys(details).forEach(k => { if (!details[k]) delete details[k]; });
    const remoteImages = extractCasioImages(html);
    const fotos = remoteImages.map(u => `/api/casio-image?url=${encodeURIComponent(u)}`);

    res.json({
      sku, nome: `Casio ${sku}`, marca: /g-shock/i.test(text) ? 'G-Shock' : 'Casio', categoria: 'Relógios',
      desc: descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '', detalhes, fotos,
      origem: 'Casio Brasil', fonte: source,
      aviso: fotos.length ? '' : 'A ficha técnica foi encontrada, mas as fotos oficiais não puderam ser extraídas automaticamente.'
    });
  } catch (error) {
    console.error('Erro na busca Casio:', error);
    res.status(502).json({ error: 'A Casio demorou ou bloqueou a consulta. Tente novamente em alguns segundos.' });
  }
});

app.get('/api/casio-image', async (req, res) => {
  try {
    const raw = String(req.query.url || '').trim();
    const isAllowed = value => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'www.casio.com' && url.pathname.startsWith('/content/dam/casio/');
      } catch { return false; }
    };
    if (!isAllowed(raw)) return res.status(403).end();
    const image = await fetchAllowedImage(raw, {
      isAllowed,
      headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.casio.com/' },
      timeoutMs: 8000
    });
    if (!image) return res.status(404).end();
    res.set('Content-Type', image.type); res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(image.bytes);
  } catch { res.status(404).end(); }
});

// Login, cookie, níveis de acesso e revogação pertencem exclusivamente ao
// admin-security-bootstrap/admin-session carregados por startup.js.

app.get('/api/admin/products', admin, (req, res) => res.json(getProducts()));
app.post('/api/admin/products', admin, (req, res) => {
  const products = getProducts();
  const id = products.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
  const product = normalizeProduct({ ...req.body, id }); products.push(product); write(PRODUCTS, products); res.status(201).json(product);
});
app.put('/api/admin/products/:id', admin, (req, res) => {
  const id = Number(req.params.id), products = getProducts(), index = products.findIndex(p => Number(p.id) === id);
  if (index < 0) return res.status(404).json({ error: 'Produto não encontrado.' });
  const product = normalizeProduct({ ...products[index], ...req.body, id });
  products[index] = product;
  write(PRODUCTS, products);
  if (product.ativo !== false && Number(product.estoque || 0) > 0) queueStockAvailableEmails(product);
  res.json(product);
});
app.delete('/api/admin/products/:id', admin, (req, res) => {
  const id = Number(req.params.id), products = getProducts(), index = products.findIndex(p => Number(p.id) === id);
  if (index < 0) return res.status(404).json({ error: 'Produto não encontrado.' });
  products[index].ativo = false; write(PRODUCTS, products); res.json({ ok: true });
});
app.delete('/api/admin/products/:id/permanent', admin, (req, res) => {
  const id = Number(req.params.id);
  const products = getProducts();
  const index = products.findIndex(p => Number(p.id) === id);
  if (index < 0) return res.status(404).json({ error: 'Produto não encontrado.' });

  const [removed] = products.splice(index, 1);
  write(PRODUCTS, products);

  const rawDetails = read(PRODUCT_DETAILS, {});
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails) ? rawDetails : {};
  if (Object.prototype.hasOwnProperty.call(details, String(id))) {
    delete details[String(id)];
    write(PRODUCT_DETAILS, details);
  }

  console.log('Produto excluído permanentemente pelo administrador:', { id, sku: removed.sku || null, nome: removed.nome });
  res.json({ ok: true, deleted_id: id });
});

app.get('/api/admin/orders', admin, (req, res) => res.json(getOrders().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))));
app.patch('/api/admin/orders/:id/invoice', admin, (req, res) => {
  try {
    const orderId = String(req.params.id || '').trim(), orders = getOrders(), index = orders.findIndex(order => String(order.id) === orderId);
    if (index < 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const order = orders[index];
    const requestedStatus = String(req.body?.status || order.invoice?.status || 'pending').trim().toLowerCase();
    if (requestedStatus === 'emitted' && !isPaidOrder(order)) return res.status(409).json({ error: 'A NF-e só pode ser registrada como emitida após a confirmação do pagamento.' });
    if (requestedStatus === 'emitted' && order.stock_conflict) return res.status(409).json({ error: 'Revise o conflito de estoque antes de registrar a NF-e como emitida.' });
    order.invoice = normalizeInvoiceInput(req.body, order.invoice || null); order.updated_at = new Date().toISOString(); orders[index] = order; write(ORDERS, orders);
    console.log('Nota fiscal atualizada:', { orderId, invoice_status: order.invoice.status, invoice_number: order.invoice.number || null }); res.json(order);
  } catch (error) {
    const status = Number(error?.statusCode) || 500; if (status >= 500) console.error('Erro ao atualizar nota fiscal:', error);
    res.status(status).json({ error: error.message || 'Não foi possível atualizar a nota fiscal.' });
  }
});

app.get('/api/admin/payment-config', admin, (req, res) => {
  res.json({ access_token_configured: Boolean(String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()),
    public_key_configured: Boolean(String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim()),
    webhook_secret_configured: Boolean(String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim()),
    public_url: String(process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null, integration: 'mercadopago-v2' });
});

app.listen(PORT, () => {
  console.log(`Relógio e Cia: http://localhost:${PORT}`);
  console.log('Servidor principal iniciado sem rotas legadas do Mercado Pago.');
});
