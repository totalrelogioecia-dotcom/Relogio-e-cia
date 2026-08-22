const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { maxInstallmentsForAmount } = require('./installment-policy');
const {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator
} = require('mercadopago');
const { resolveSelectedShipping, isConfigured } = require('./shipping-service');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

async function persistOrders(orders) {
  write(ORDERS, orders);
  await flushPersistentStore();
}

async function saveOrder(order) {
  const orders = read(ORDERS, []);
  const index = orders.findIndex(item => item.id === order.id);
  if (index >= 0) orders[index] = order;
  else orders.push(order);
  await persistOrders(orders);
  return order;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCategory(product) {
  if (product?.categoria_id_mp) return String(product.categoria_id_mp).trim().slice(0, 100);
  const category = String(product?.categoria || '').toLowerCase();
  if (category.includes('relóg') || category.includes('relog') || category.includes('acess')) return 'fashion';
  return undefined;
}

function normalizeCartItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const error = new Error('Carrinho vazio.');
    error.status = 400;
    throw error;
  }

  const products = read(PRODUCTS, []);
  return rawItems.map(raw => {
    const product = products.find(item => Number(item.id) === Number(raw.id) && item.ativo !== false);
    if (!product) {
      const error = new Error('Um produto do carrinho não foi encontrado.');
      error.status = 400;
      throw error;
    }

    const quantity = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    if (Number(product.estoque) < quantity) {
      const error = new Error(`Estoque insuficiente para ${product.nome}.`);
      error.status = 409;
      throw error;
    }

    const picture = Array.isArray(product.fotos)
      ? product.fotos.find(url => /^https:\/\//i.test(String(url || '')))
      : null;

    return {
      id: Number(product.id),
      sku: String(product.sku || ''),
      nome: String(product.nome || 'Produto'),
      descricao: String(product.desc || '').trim(),
      categoria_id: normalizeCategory(product),
      quantidade: quantity,
      unit_price: Number(Number(product.preco || 0).toFixed(2)),
      foto: picture || null
    };
  });
}

function itemDescription(item) {
  const description = String(item.descricao || '').trim();
  if (description) return description.slice(0, 256);
  return [item.nome, item.sku ? `SKU ${item.sku}` : '', 'Produto físico vendido pela Relógio e Cia']
    .filter(Boolean)
    .join(' - ')
    .slice(0, 256);
}

function preferenceItems(items) {
  return items.map(item => {
    const result = {
      id: String(item.sku || item.id),
      title: item.nome.slice(0, 256),
      description: itemDescription(item),
      quantity: item.quantidade,
      currency_id: 'BRL',
      unit_price: Number(item.unit_price.toFixed(2))
    };
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    if (item.categoria_id) result.category_id = item.categoria_id;
    return result;
  });
}

function pixItems(items) {
  return items.map(item => {
    const result = {
      id: String(item.sku || item.id),
      title: item.nome.slice(0, 256),
      description: itemDescription(item),
      quantity: item.quantidade,
      unit_price: Number((item.unit_price * 0.95).toFixed(2))
    };
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    if (item.categoria_id) result.category_id = item.categoria_id;
    return result;
  });
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const firstName = parts.shift() || 'Cliente';
  return { firstName: firstName.slice(0, 80), lastName: parts.join(' ').slice(0, 120) };
}

function pixPayer(payer) {
  const name = splitName(payer?.nome);
  const result = {
    email: String(payer?.email || '').trim().toLowerCase().slice(0, 180),
    first_name: name.firstName
  };
  if (name.lastName) result.last_name = name.lastName;

  const type = String(payer?.identificacao?.type || '').trim().toUpperCase().slice(0, 20);
  const number = digits(payer?.identificacao?.number).slice(0, 30);
  if (type && number) result.identification = { type, number };

  const area = digits(payer?.telefone?.area_code).slice(0, 4);
  const phone = digits(payer?.telefone?.number).slice(0, 15);
  if (area && phone) result.phone = { area_code: area, number: phone };

  return result;
}

function receiverAddress(payer) {
  const address = payer?.endereco || {};
  const zipCode = digits(address.zip_code).slice(0, 8);
  const streetName = String(address.street_name || '').trim().slice(0, 120);
  const streetNumber = Number(String(address.street_number || '').match(/\d+/)?.[0] || 0);
  if (zipCode.length !== 8 || !streetName || !streetNumber) return undefined;

  return {
    zip_code: zipCode,
    street_name: streetName,
    city_name: String(address.city_name || '').trim().slice(0, 120),
    state_name: String(address.state_code || address.state_name || '').trim().slice(0, 120),
    street_number: streetNumber,
    country_name: 'Brasil'
  };
}

function statementDescriptor() {
  return String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'RELOGIOECIA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 13) || 'RELOGIOECIA';
}

function publicBaseUrl() {
  const base = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!base.startsWith('https://')) {
    const error = new Error('PUBLIC_URL precisa estar configurada com HTTPS.');
    error.status = 503;
    throw error;
  }
  return base;
}

function sdkClients() {
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!accessToken) {
    const error = new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
    error.status = 503;
    throw error;
  }

  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10000, maxRetries: 2 }
  });

  return {
    preference: new Preference(client),
    payment: new Payment(client)
  };
}

function paymentSafe(payment) {
  return {
    id: payment?.id ? String(payment.id) : null,
    status: payment?.status ? String(payment.status) : null,
    status_detail: payment?.status_detail ? String(payment.status_detail) : null,
    payment_method_id: payment?.payment_method_id ? String(payment.payment_method_id) : null,
    payment_type_id: payment?.payment_type_id ? String(payment.payment_type_id) : null,
    operation_type: payment?.operation_type ? String(payment.operation_type) : null,
    transaction_amount: Number.isFinite(Number(payment?.transaction_amount)) ? Number(payment.transaction_amount) : null,
    currency_id: payment?.currency_id ? String(payment.currency_id) : null,
    installments: Number.isFinite(Number(payment?.installments)) ? Number(payment.installments) : null,
    issuer_id: payment?.issuer_id ? String(payment.issuer_id) : null,
    external_reference: payment?.external_reference ? String(payment.external_reference) : null,
    date_created: payment?.date_created ? String(payment.date_created) : null,
    date_approved: payment?.date_approved ? String(payment.date_approved) : null,
    date_last_updated: payment?.date_last_updated ? String(payment.date_last_updated) : null,
    live_mode: typeof payment?.live_mode === 'boolean' ? payment.live_mode : null
  };
}

function orderStatus(paymentStatus) {
  if (paymentStatus === 'approved') return 'paid';
  if (paymentStatus === 'rejected') return 'rejected';
  if (paymentStatus === 'cancelled') return 'cancelled';
  return 'pending';
}

async function resolveShipping(body, payer) {
  if (!isConfigured()) return null;

  const request = body?.shipping;
  if (!request?.service_id || !request?.postal_code) {
    const error = new Error('Calcule e selecione uma opção de frete antes de finalizar o pedido.');
    error.status = 409;
    throw error;
  }

  const accountZip = digits(payer?.endereco?.zip_code).slice(0, 8);
  const selectedZip = digits(request.postal_code).slice(0, 8);
  if (accountZip && accountZip !== selectedZip) {
    const error = new Error('O CEP do frete deve ser o mesmo do endereço de entrega cadastrado na sua conta.');
    error.status = 409;
    throw error;
  }

  return resolveSelectedShipping({
    postalCode: selectedZip,
    serviceId: request.service_id,
    items: body.items
  });
}

async function applyPayment(payment) {
  const orderId = String(payment?.external_reference || '').trim();
  if (!orderId) return null;

  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => order.id === orderId);
  if (index < 0) return null;

  const order = orders[index];
  order.payment_id = payment?.id ? String(payment.id) : null;
  order.payment_status = String(payment?.status || 'pending');
  order.status = orderStatus(payment?.status);
  order.payment_detail = paymentSafe(payment);
  order.updated_at = new Date().toISOString();

  if (payment?.status === 'approved' && !order.stock_applied) {
    const products = read(PRODUCTS, []);
    for (const item of order.items || []) {
      const productIndex = products.findIndex(product => Number(product.id) === Number(item.id));
      if (productIndex >= 0) {
        products[productIndex].estoque = Math.max(
          0,
          Number(products[productIndex].estoque || 0) - Number(item.quantidade || 0)
        );
      }
    }
    write(PRODUCTS, products);
    order.stock_applied = true;
  }

  orders[index] = order;
  await persistOrders(orders);
  await flushPersistentStore();

  console.log('Mercado Pago clean: pedido atualizado', {
    orderId,
    status: order.status,
    payment_status: order.payment_status,
    payment_id: order.payment_id,
    status_detail: order.payment_detail?.status_detail || null
  });

  return order;
}

async function getPayment(paymentId) {
  const { payment } = sdkClients();
  return payment.get({ id: String(paymentId) });
}

async function findPaymentByOrder(orderId) {
  const { payment } = sdkClients();
  const result = await payment.search({
    options: {
      external_reference: String(orderId),
      sort: 'date_created',
      criteria: 'desc',
      limit: 1
    }
  });
  return Array.isArray(result?.results) && result.results.length ? result.results[0] : null;
}

async function syncOrder(order) {
  if (!order || order.status === 'paid' || order.payment_status === 'approved') return order;
  if (order.status === 'checkout_error') return order;

  try {
    const payment = order.payment_id
      ? await getPayment(order.payment_id)
      : await findPaymentByOrder(order.id);
    if (!payment) return order;
    return await applyPayment(payment) || order;
  } catch (error) {
    console.warn('Mercado Pago clean: não foi possível sincronizar pedido', {
      orderId: order.id,
      message: error.message
    });
    return order;
  }
}

async function markCheckoutError(orderId, error) {
  const orders = read(ORDERS, []);
  const index = orders.findIndex(order => order.id === orderId);
  if (index < 0) return;
  orders[index].status = 'checkout_error';
  orders[index].payment_status = 'checkout_error';
  orders[index].checkout_error = String(error?.message || 'Falha ao iniciar pagamento.').slice(0, 500);
  orders[index].updated_at = new Date().toISOString();
  await persistOrders(orders);
}

function errorStatus(error) {
  return Number(
    error?.status ||
    error?.statusCode ||
    error?.api_response?.status ||
    error?.cause?.status
  ) || 502;
}

function registerMercadoPagoClean(app) {
  app.use('/api/checkout', express.json({ limit: '1mb' }));
  app.use('/api/mercadopago/webhook', express.json({ limit: '1mb' }));

  app.get('/api/mercadopago/config', (req, res) => {
    const publicKey = String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();
    res.set('Cache-Control', 'no-store');
    return res.json({
      integration: 'checkout-pro-clean',
      configured: Boolean(publicKey && String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()),
      public_key: publicKey || null,
      webhook_secret_configured: Boolean(String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim())
    });
  });

  app.post('/api/checkout', async (req, res) => {
    let orderId = null;

    try {
      const body = req.body || {};
      const payer = body.payer || {};
      const method = body.metodo === 'pix' ? 'pix' : 'cartao';

      if (!payer.email || !payer.nome) {
        return res.status(401).json({ error: 'Faça login antes de finalizar a compra.' });
      }

      const items = normalizeCartItems(body.items);
      const shipping = await resolveShipping(body, payer);
      const productsSubtotal = Number(
        items.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0).toFixed(2)
      );
      const shippingCost = Number(Number(shipping?.price || 0).toFixed(2));
      const base = publicBaseUrl();

      orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const order = {
        id: orderId,
        status: 'creating',
        payment_status: 'creating',
        payment_id: null,
        payer: {
          nome: String(payer.nome).slice(0, 120),
          email: String(payer.email).slice(0, 180),
          endereco: payer.endereco || null
        },
        items,
        subtotal: productsSubtotal,
        desconto_pix: method === 'pix' ? Number((productsSubtotal * 0.05).toFixed(2)) : 0,
        shipping,
        metodo: method,
        created_at: new Date().toISOString()
      };
      await saveOrder(order);

      if (method === 'pix') {
        const discountedProducts = Number((productsSubtotal * 0.95).toFixed(2));
        const total = Number((discountedProducts + shippingCost).toFixed(2));
        const { payment } = sdkClients();
        const data = await payment.create({
          body: {
            transaction_amount: total,
            description: `Pedido ${orderId}`,
            statement_descriptor: statementDescriptor(),
            payment_method_id: 'pix',
            external_reference: orderId,
            notification_url: `${base}/api/mercadopago/webhook`,
            payer: pixPayer(payer),
            additional_info: { items: pixItems(items) }
          },
          requestOptions: { idempotencyKey: crypto.randomUUID() }
        });

        const transaction = data?.point_of_interaction?.transaction_data || {};
        if (!data?.id || !transaction.qr_code || !transaction.qr_code_base64) {
          throw new Error('O Mercado Pago não retornou o QR Code do PIX.');
        }

        order.status = orderStatus(data.status);
        order.payment_status = String(data.status || 'pending');
        order.payment_id = String(data.id);
        order.total = total;
        order.pix = {
          qr_code: String(transaction.qr_code),
          qr_code_base64: String(transaction.qr_code_base64),
          ticket_url: transaction.ticket_url ? String(transaction.ticket_url) : null
        };
        order.payment_detail = paymentSafe(data);
        order.updated_at = new Date().toISOString();
        await saveOrder(order);

        const redirectUrl = `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}`;
        console.log('Mercado Pago clean: PIX criado', {
          orderId,
          payment_id: order.payment_id,
          shipping_cost: shippingCost,
          total
        });

        return res.json({
          order_id: orderId,
          payment_id: order.payment_id,
          redirect_url: redirectUrl,
          init_point: redirectUrl
        });
      }

      const cardTotal = Number((productsSubtotal + shippingCost).toFixed(2));
      const maxInstallments = maxInstallmentsForAmount(cardTotal);
      const preferenceBody = {
        items: preferenceItems(items),
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' },
            { id: 'bank_transfer' }
          ],
          installments: maxInstallments
        },
        statement_descriptor: statementDescriptor(),
        external_reference: orderId,
        back_urls: {
          success: `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`,
          failure: `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`,
          pending: `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}`
        },
        auto_return: 'approved',
        notification_url: `${base}/api/mercadopago/webhook`
      };

      if (shipping) {
        preferenceBody.shipments = {
          cost: shippingCost,
          mode: 'not_specified'
        };
        const address = receiverAddress(payer);
        if (address) preferenceBody.shipments.receiver_address = address;
      }

      const { preference } = sdkClients();
      const data = await preference.create({
        body: preferenceBody,
        requestOptions: { idempotencyKey: crypto.randomUUID() }
      });

      if (!data?.id) throw new Error('O Mercado Pago não retornou o ID da preferência.');

      order.status = 'pending';
      order.payment_status = 'pending';
      order.preference_id = String(data.id);
      order.total = cardTotal;
      order.updated_at = new Date().toISOString();
      await saveOrder(order);

      console.log('Mercado Pago clean: preferência Checkout Pro criada', {
        orderId,
        preference_id: order.preference_id,
        shipping_cost: shippingCost,
        total: order.total,
        max_installments: maxInstallments,
        frontend: 'mercadopago.js-wallet'
      });

      return res.json({
        order_id: orderId,
        preference_id: order.preference_id
      });
    } catch (error) {
      if (orderId) await markCheckoutError(orderId, error).catch(() => {});
      console.error('Mercado Pago clean: erro no checkout', {
        orderId,
        message: error.message,
        status: errorStatus(error),
        data: error?.cause || error?.data || null
      });
      const status = errorStatus(error);
      return res.status(status >= 400 && status < 500 ? status : 502).json({
        error: error.message || 'Não foi possível iniciar o pagamento.'
      });
    }
  });

  app.post('/api/mercadopago/webhook', async (req, res) => {
    const type = String(req.body?.type || req.query?.type || '').trim();
    const queryDataId = String(req.query?.['data.id'] || '').trim();
    const paymentId = queryDataId || String(req.body?.data?.id || '').trim();

    if (type !== 'payment' || !paymentId) {
      console.log('Mercado Pago clean: webhook ignorado', {
        type: type || null,
        data_id: paymentId || null
      });
      return res.sendStatus(200);
    }

    const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      console.warn('Mercado Pago clean: webhook recebido sem MERCADOPAGO_WEBHOOK_SECRET configurado.');
      return res.sendStatus(503);
    }

    if (!queryDataId) {
      console.warn('Mercado Pago clean: webhook sem data.id na query; assinatura não pode ser validada.');
      return res.sendStatus(400);
    }

    try {
      if (!WebhookSignatureValidator?.validate) {
        throw new Error('A versão instalada do SDK não possui WebhookSignatureValidator.');
      }

      WebhookSignatureValidator.validate({
        xSignature: req.headers['x-signature'],
        xRequestId: req.headers['x-request-id'],
        dataId: queryDataId,
        secret
      });
    } catch (error) {
      console.warn('Mercado Pago clean: assinatura do webhook inválida', {
        type,
        paymentId,
        message: error.message
      });
      return res.sendStatus(401);
    }

    try {
      const payment = await getPayment(paymentId);
      await applyPayment(payment);
      return res.sendStatus(200);
    } catch (error) {
      const status = errorStatus(error);

      if (status === 404) {
        console.warn('Mercado Pago clean: webhook válido, pagamento não encontrado', {
          paymentId
        });
        return res.sendStatus(200);
      }

      console.error('Mercado Pago clean: falha ao processar webhook', {
        paymentId,
        message: error.message,
        status
      });
      return res.sendStatus(500);
    }
  });

  app.get('/api/order/:id', async (req, res) => {
    let order = read(ORDERS, []).find(item => item.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (['creating', 'pending'].includes(order.status) || ['creating', 'pending'].includes(order.payment_status)) {
      order = await syncOrder(order);
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      payment_id: order.payment_id || null,
      metodo: order.metodo || null,
      pix: order.pix || null,
      preference_id: order.preference_id || null,
      payment_detail: order.payment_detail || null,
      checkout_error: order.checkout_error || null,
      updated_at: order.updated_at || null
    });
  });
}

module.exports = { registerMercadoPagoClean };
