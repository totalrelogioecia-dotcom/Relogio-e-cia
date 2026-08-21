const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { resolveSelectedShipping, isConfigured } = require('./shipping-service');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');
const COUPONS = path.join(DATA, 'coupons.json');

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function shippingRequired() { return ['1', 'true', 'yes', 'on'].includes(String(process.env.MELHORENVIO_REQUIRE_SHIPPING || '').trim().toLowerCase()); }
function normalizeCouponCode(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40); }

function validateFreeShippingCoupon(rawCode, subtotal, originalShipping) {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { applied: false, code: null };
  const coupons = read(COUPONS, []);
  const coupon = Array.isArray(coupons) ? coupons.find(c => normalizeCouponCode(c?.code) === code) : null;
  if (!coupon || coupon.active === false || String(coupon.type || '') !== 'free_shipping') {
    throw Object.assign(new Error('Cupom de frete grátis inválido ou inativo.'), { status: 400 });
  }
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) throw Object.assign(new Error('Este cupom ainda não está disponível.'), { status: 400 });
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) throw Object.assign(new Error('Este cupom expirou.'), { status: 400 });
  const minSubtotal = Math.max(0, Number(coupon.min_subtotal) || 0);
  if (subtotal < minSubtotal) throw Object.assign(new Error(`Este cupom exige subtotal mínimo de R$ ${minSubtotal.toFixed(2).replace('.', ',')}.`), { status: 400 });
  const maxShipping = coupon.max_shipping == null || coupon.max_shipping === '' ? null : Math.max(0, Number(coupon.max_shipping) || 0);
  if (maxShipping != null && originalShipping > maxShipping) throw Object.assign(new Error('O valor deste frete ultrapassa o limite permitido pelo cupom.'), { status: 400 });
  return { applied: true, code, coupon };
}

function normalizeCategory(product) {
  if (product?.categoria_id_mp) return String(product.categoria_id_mp).trim().slice(0, 100);
  const categoria = String(product?.categoria || '').toLowerCase();
  if (categoria.includes('relóg') || categoria.includes('relog') || categoria.includes('acess')) return 'fashion';
  return null;
}
function normalizeCartItems(items) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Carrinho vazio.'), { status: 400 });
  const products = read(PRODUCTS, []);
  return items.map(raw => {
    const product = products.find(p => Number(p.id) === Number(raw.id) && p.ativo !== false);
    const qtd = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    if (!product) throw Object.assign(new Error('Produto não encontrado.'), { status: 400 });
    if (Number(product.estoque) < qtd) throw Object.assign(new Error(`Estoque insuficiente para ${product.nome}.`), { status: 400 });
    const foto = Array.isArray(product.fotos) ? product.fotos.find(url => /^https:\/\//i.test(String(url || ''))) : null;
    return { id: Number(product.id), nome: String(product.nome || 'Produto'), sku: String(product.sku || ''), descricao: String(product.desc || '').trim(), categoria_id: normalizeCategory(product), quantidade: qtd, unit_price: Number(product.preco), foto: foto || null };
  });
}
function itemDescription(item) {
  if (String(item.descricao || '').trim()) return String(item.descricao).trim().slice(0, 256);
  return [item.nome, item.sku ? `SKU ${item.sku}` : '', 'Produto físico vendido pela Relógio e Cia'].filter(Boolean).join(' - ').slice(0, 256);
}
function statementDescriptor() {
  return String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'RELOGIOECIA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 13) || 'RELOGIOECIA';
}
function sdkClients() {
  const access = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!access) throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.'), { status: 503 });
  const client = new MercadoPagoConfig({ accessToken: access, options: { timeout: 10000, maxRetries: 2 } });
  return { preference: new Preference(client), payment: new Payment(client) };
}
function splitName(fullName) {
  const parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const name = parts.shift() || 'Cliente';
  return { name: name.slice(0, 80), surname: parts.join(' ').slice(0, 120) };
}
function preferencePayer(payer) {
  const fullName = splitName(payer?.nome);
  const result = { name: fullName.name, email: String(payer?.email || '').trim().toLowerCase().slice(0, 180) };
  if (fullName.surname) result.surname = fullName.surname;
  const area = digits(payer?.telefone?.area_code).slice(0, 4), phone = digits(payer?.telefone?.number).slice(0, 15);
  if (area && phone) result.phone = { area_code: area, number: phone };
  const type = String(payer?.identificacao?.type || '').trim().toUpperCase().slice(0, 20), number = digits(payer?.identificacao?.number).slice(0, 30);
  if (type && number) result.identification = { type, number };
  const zip = digits(payer?.endereco?.zip_code).slice(0, 8), street = String(payer?.endereco?.street_name || '').trim().slice(0, 120), match = String(payer?.endereco?.street_number || '').match(/\d+/);
  if (zip && street && match) result.address = { zip_code: zip, street_name: street, street_number: Number(match[0]) };
  if (payer?.date_created) { const d = new Date(payer.date_created); if (!Number.isNaN(d.getTime())) result.date_created = d.toISOString(); }
  return result;
}
function paymentPayer(payer) {
  const fullName = splitName(payer?.nome);
  const result = { email: String(payer?.email || '').trim().toLowerCase().slice(0, 180), first_name: fullName.name };
  if (fullName.surname) result.last_name = fullName.surname;
  const area = digits(payer?.telefone?.area_code).slice(0, 4), phone = digits(payer?.telefone?.number).slice(0, 15);
  if (area && phone) result.phone = { area_code: area, number: phone };
  const type = String(payer?.identificacao?.type || '').trim().toUpperCase().slice(0, 20), number = digits(payer?.identificacao?.number).slice(0, 30);
  if (type && number) result.identification = { type, number };
  const zip = digits(payer?.endereco?.zip_code).slice(0, 8), street = String(payer?.endereco?.street_name || '').trim().slice(0, 120), streetNumber = String(payer?.endereco?.street_number || '').trim().slice(0, 20);
  if (zip && street && streetNumber) result.address = { zip_code: zip, street_name: street, street_number: streetNumber, neighborhood: String(payer?.endereco?.neighborhood || '').trim().slice(0, 120) || undefined, city: String(payer?.endereco?.city_name || '').trim().slice(0, 120) || undefined, federal_unit: String(payer?.endereco?.state_code || '').trim().toUpperCase().slice(0, 2) || undefined };
  return result;
}
function preferenceItems(items) {
  return items.map(item => {
    const result = { id: String(item.sku || item.id), title: item.nome.slice(0, 256), description: itemDescription(item), quantity: item.quantidade, currency_id: 'BRL', unit_price: Number(item.unit_price.toFixed(2)), type: 'physical' };
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    if (item.categoria_id) result.category_id = item.categoria_id;
    return result;
  });
}
function pixItems(items) {
  return items.map(item => {
    const result = { id: String(item.sku || item.id), title: item.nome.slice(0, 256), description: itemDescription(item), quantity: item.quantidade, unit_price: Number((item.unit_price * 0.95).toFixed(2)) };
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    if (item.categoria_id) result.category_id = item.categoria_id;
    return result;
  });
}
function receiverAddress(payer) {
  const e = payer?.endereco || {}, zip = digits(e.zip_code).slice(0, 8);
  if (zip.length !== 8) return undefined;
  return { zip_code: zip, street_name: String(e.street_name || '').trim().slice(0, 120), city_name: String(e.city_name || '').trim().slice(0, 120), state_name: String(e.state_code || e.state_name || '').trim().slice(0, 120), street_number: Number(String(e.street_number || '').match(/\d+/)?.[0] || 0), country_name: 'Brasil' };
}
function paymentSafe(payment) {
  return { id: payment?.id ? String(payment.id) : null, status: payment?.status ? String(payment.status) : null, status_detail: payment?.status_detail ? String(payment.status_detail) : null, payment_method_id: payment?.payment_method_id ? String(payment.payment_method_id) : null, payment_type_id: payment?.payment_type_id ? String(payment.payment_type_id) : null, transaction_amount: Number.isFinite(Number(payment?.transaction_amount)) ? Number(payment.transaction_amount) : null, currency_id: payment?.currency_id ? String(payment.currency_id) : null, external_reference: payment?.external_reference ? String(payment.external_reference) : null, date_created: payment?.date_created ? String(payment.date_created) : null, date_approved: payment?.date_approved ? String(payment.date_approved) : null, live_mode: typeof payment?.live_mode === 'boolean' ? payment.live_mode : null };
}
function statusPedido(status) { if (status === 'approved') return 'paid'; if (status === 'rejected') return 'rejected'; if (status === 'cancelled') return 'cancelled'; return 'pending'; }

function registerCheckoutWithShipping(app) {
  app.use('/api/checkout', express.json({ limit: '1mb' }));
  app.post('/api/checkout', async (req, res, next) => {
    const shippingRequest = req.body?.shipping;
    if (!shippingRequest?.service_id || !shippingRequest?.postal_code) {
      if (shippingRequired() && isConfigured()) return res.status(409).json({ error: 'Calcule e selecione uma opção de frete antes de finalizar o pedido.' });
      return next();
    }
    try {
      const { items, payer, metodo } = req.body || {};
      if (!payer?.email || !payer?.nome) return res.status(400).json({ error: 'Faça login antes de finalizar a compra.' });
      if (!isConfigured()) return res.status(503).json({ error: 'Frete automático ainda não está configurado no servidor.' });
      const accountZip = digits(payer?.endereco?.zip_code).slice(0, 8), selectedZip = digits(shippingRequest.postal_code).slice(0, 8);
      if (accountZip && accountZip !== selectedZip) return res.status(409).json({ error: 'O CEP do frete deve ser o mesmo do endereço de entrega cadastrado na sua conta.' });

      const normalized = normalizeCartItems(items);
      const shipping = await resolveSelectedShipping({ postalCode: selectedZip, serviceId: shippingRequest.service_id, items });
      const base = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
      if (!base.startsWith('https://')) return res.status(503).json({ error: 'PUBLIC_URL precisa ser HTTPS.' });
      const orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const productsSubtotal = Number(normalized.reduce((s, i) => s + i.quantidade * i.unit_price, 0).toFixed(2));
      const shippingOriginal = Number(shipping.price.toFixed(2));
      const coupon = validateFreeShippingCoupon(req.body?.coupon_code || req.body?.coupon?.code, productsSubtotal, shippingOriginal);
      const shippingCost = coupon.applied ? 0 : shippingOriginal;
      const shippingForOrder = { ...shipping, original_price: shippingOriginal, price: shippingCost, free_shipping: coupon.applied, coupon_code: coupon.code };

      if (metodo === 'pix') {
        const productsAfterDiscount = Number((productsSubtotal * 0.95).toFixed(2));
        const discount = Number((productsSubtotal - productsAfterDiscount).toFixed(2));
        const total = Number((productsAfterDiscount + shippingCost).toFixed(2));
        const { payment } = sdkClients();
        const data = await payment.create({ body: { transaction_amount: total, description: `Pedido ${orderId}`, statement_descriptor: statementDescriptor(), payment_method_id: 'pix', external_reference: orderId, notification_url: `${base}/api/mercadopago/webhook`, payer: paymentPayer(payer), additional_info: { items: pixItems(normalized) } }, requestOptions: { idempotencyKey: crypto.randomUUID() } });
        const tx = data?.point_of_interaction?.transaction_data || {};
        if (!data?.id || !tx.qr_code || !tx.qr_code_base64) throw new Error('O Mercado Pago não retornou o QR Code do PIX.');
        const order = { id: orderId, status: statusPedido(data.status), payment_status: String(data.status || 'pending'), payment_id: String(data.id), payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180), endereco: payer.endereco || null }, items: normalized, subtotal: productsSubtotal, desconto_pix: discount, shipping: shippingForOrder, coupon: coupon.applied ? { code: coupon.code, type: 'free_shipping', discount: shippingOriginal } : null, total, metodo: 'pix', pix: { qr_code: String(tx.qr_code), qr_code_base64: String(tx.qr_code_base64), ticket_url: tx.ticket_url ? String(tx.ticket_url) : null }, payment_detail: paymentSafe(data), created_at: new Date().toISOString() };
        const orders = read(ORDERS, []); orders.push(order); write(ORDERS, orders);
        console.log('Checkout com frete criado:', { orderId, metodo: 'pix', shipping_service: shipping.service_name, shipping_original: shippingOriginal, shipping_charged: shippingCost, coupon: coupon.code, total });
        return res.json({ order_id: orderId, payment_id: order.payment_id, redirect_url: `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}` });
      }

      const { preference } = sdkClients();
      const preferenceBody = { items: preferenceItems(normalized), payer: preferencePayer(payer), payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }], installments: 12 }, shipments: { cost: shippingCost, mode: 'not_specified', receiver_address: receiverAddress(payer) }, statement_descriptor: statementDescriptor(), external_reference: orderId, back_urls: { success: `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`, failure: `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`, pending: `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}` }, auto_return: 'approved', notification_url: `${base}/api/mercadopago/webhook` };
      if (!preferenceBody.shipments.receiver_address?.street_name) delete preferenceBody.shipments.receiver_address;
      const data = await preference.create({ body: preferenceBody, requestOptions: { idempotencyKey: crypto.randomUUID() } });
      if (!data?.id || !data?.init_point) throw new Error('O Mercado Pago não retornou a preferência de pagamento completa.');
      const total = Number((productsSubtotal + shippingCost).toFixed(2));
      const order = { id: orderId, status: 'pending', payment_status: 'pending', payer: { nome: String(payer.nome).slice(0, 120), email: String(payer.email).slice(0, 180), endereco: payer.endereco || null }, items: normalized, subtotal: productsSubtotal, desconto_pix: 0, shipping: shippingForOrder, coupon: coupon.applied ? { code: coupon.code, type: 'free_shipping', discount: shippingOriginal } : null, total, metodo: 'cartao', preference_id: String(data.id), created_at: new Date().toISOString() };
      const orders = read(ORDERS, []); orders.push(order); write(ORDERS, orders);
      console.log('Checkout com frete criado:', { orderId, metodo: 'cartao', shipping_service: shipping.service_name, shipping_original: shippingOriginal, shipping_charged: shippingCost, coupon: coupon.code, total });
      return res.json({ order_id: orderId, init_point: data.init_point });
    } catch (error) {
      console.error('Erro checkout com frete:', { message: error.message, status: error.status || null, data: error?.cause || error?.data || null });
      const status = Number(error.status || error.statusCode || error?.api_response?.status || error?.cause?.status) || 502;
      return res.status(status >= 400 && status < 500 ? status : 502).json({ error: error.message || 'Não foi possível iniciar o pagamento com frete.' });
    }
  });
}

module.exports = { registerCheckoutWithShipping };
