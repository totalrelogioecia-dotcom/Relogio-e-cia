const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { maxInstallmentsForAmount } = require('./installment-policy');
const { resolveSelectedShipping, isConfigured } = require('./shipping-service');
const { flushPersistentStore } = require('./persistent-store');
const { assertPickupAllowed } = require('./pickup-policy');
const { customerCanAccessOrder, sendOrderNotFound } = require('./order-access');
const { consumeCoupon, releaseCoupon } = require('./coupon-service');
const {
  readDetails,
  validateCheckoutAvailability
} = require('./product-availability-service');
const { applyPaidOrderStock, registerStockResult } = require('./inventory-service');
const {
  WebhookSignatureValidator,
  clients,
  errorStatus,
  mercadoPagoEnvironment,
  paymentPayer,
  paymentSafe,
  preferencePayer,
  publicBaseUrl,
  publicKey,
  receiverAddress,
  requestOptions,
  safeErrorData,
  statementDescriptor,
  webhookSecret
} = require('./mercadopago-core');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
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
  if (product?.categoria_id_mp) {
    return String(product.categoria_id_mp).trim().slice(0, 100);
  }
  const category = String(product?.categoria || '').toLowerCase();
  if (category.includes('relóg') || category.includes('relog') || category.includes('acess')) {
    return 'fashion';
  }
  return undefined;
}

function normalizeCartItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const error = new Error('Carrinho vazio.');
    error.status = 400;
    throw error;
  }

  const products = read(PRODUCTS, []);
  const detailsMap = readDetails();
  return rawItems.map(raw => {
    const product = products.find(
      item => Number(item.id) === Number(raw.id) && item.ativo !== false
    );
    if (!product) {
      const error = new Error('Um produto do carrinho não foi encontrado.');
      error.status = 400;
      throw error;
    }

    const quantity = Math.max(1, Math.min(99, Number(raw.qtd) || 1));
    const availability = validateCheckoutAvailability(product, quantity, detailsMap);

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
      foto: picture || null,
      disponibilidade: availability.type,
      prazo_preparacao_dias_uteis: availability.preparation_days || 0
    };
  });
}

function itemDescription(item) {
  const description = String(item.descricao || '').trim();
  if (description) return description.slice(0, 256);
  return [
    item.nome,
    item.sku ? `SKU ${item.sku}` : '',
    'Produto físico vendido pela Relógio e Cia'
  ]
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

function orderStatus(paymentStatus) {
  if (paymentStatus === 'approved') return 'paid';
  if (paymentStatus === 'rejected') return 'rejected';
  if (paymentStatus === 'cancelled') return 'cancelled';
  return 'pending';
}

async function resolveShipping(body, payer) {
  const selected = body?.shipping;
  const serviceId = String(selected?.service_id || selected?.mode || '').trim().toLowerCase();

  if (serviceId === 'pickup') {
    assertPickupAllowed(payer);
    return resolveSelectedShipping({
      postalCode: digits(selected?.postal_code).slice(0, 8),
      serviceId: 'pickup',
      items: body.items
    });
  }

  if (!isConfigured()) {
    const error = new Error('A entrega ainda não está disponível. Se o endereço for em Porto Alegre/RS, selecione Retirar na loja.');
    error.status = 409;
    throw error;
  }

  if (!selected?.service_id) {
    const error = new Error('Calcule e selecione uma opção de frete antes de finalizar o pedido.');
    error.status = 409;
    throw error;
  }

  const selectedZip = digits(selected.postal_code).slice(0, 8);
  if (selectedZip.length !== 8) {
    const error = new Error('Calcule e selecione uma opção de frete antes de finalizar o pedido.');
    error.status = 409;
    throw error;
  }

  const accountZip = digits(payer?.endereco?.zip_code).slice(0, 8);
  if (accountZip && accountZip !== selectedZip) {
    const error = new Error('O CEP do frete deve ser o mesmo do endereço de entrega cadastrado na sua conta.');
    error.status = 409;
    throw error;
  }

  return resolveSelectedShipping({
    postalCode: selectedZip,
    serviceId: selected.service_id,
    items: body.items
  });
}

async function applyPayment(payment) {
  const orderId = String(payment?.external_reference || '').trim();
  if (!orderId) return null;

  const initialOrder = read(ORDERS, []).find(order => order.id === orderId);
  if (!initialOrder) return null;
  if (initialOrder.coupon?.id) {
    if (payment?.status === 'approved') {
      await consumeCoupon(initialOrder.coupon.id, initialOrder.payer?.email, initialOrder.id);
    } else if (['rejected', 'cancelled', 'canceled', 'refunded'].includes(String(payment?.status || '').toLowerCase())) {
      await releaseCoupon(initialOrder.id);
    }
  }

  // Releia depois de qualquer operação assíncrona para não sobrescrever uma
  // atualização concorrente de outro pedido no arquivo persistido.
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
    const stockResult = applyPaidOrderStock(products, order.items);
    if (stockResult.applied) write(PRODUCTS, stockResult.products);
    registerStockResult(order, stockResult);
  }

  orders[index] = order;
  await persistOrders(orders);

  console.log('Mercado Pago: pedido atualizado', {
    orderId,
    status: order.status,
    payment_status: order.payment_status,
    payment_id: order.payment_id,
    status_detail: order.payment_detail?.status_detail || null,
    live_mode: order.payment_detail?.live_mode ?? null
  });

  return order;
}

async function getPayment(paymentId, options = {}) {
  const { payment } = clients();
  return payment.get({
    id: String(paymentId),
    requestOptions: options
  });
}

async function findPaymentByOrder(orderId) {
  const { payment } = clients();
  const result = await payment.search({
    options: {
      external_reference: String(orderId),
      sort: 'date_created',
      criteria: 'desc',
      limit: 1
    }
  });
  return Array.isArray(result?.results) && result.results.length
    ? result.results[0]
    : null;
}

async function syncOrder(order) {
  if (!order || ((order.status === 'paid' || order.payment_status === 'approved') && !order.stock_conflict)) return order;
  if (order.status === 'checkout_error') return order;

  try {
    const payment = order.payment_id
      ? await getPayment(order.payment_id)
      : await findPaymentByOrder(order.id);
    if (!payment) return order;
    return (await applyPayment(payment)) || order;
  } catch (error) {
    console.warn('Mercado Pago: não foi possível sincronizar pedido', {
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
  orders[index].checkout_error = String(
    error?.message || 'Falha ao iniciar pagamento.'
  ).slice(0, 500);
  orders[index].updated_at = new Date().toISOString();
  await persistOrders(orders);
}

function registerMercadoPagoClean(app) {
  app.use('/api/checkout', express.json({ limit: '1mb' }));
  app.use('/api/mercadopago/webhook', express.json({ limit: '1mb' }));

  app.get('/api/mercadopago/config', (req, res) => {
    const key = publicKey();
    res.set('Cache-Control', 'no-store');
    return res.json({
      integration: 'checkout-pro-preferences-api',
      environment: mercadoPagoEnvironment(),
      configured: Boolean(key && String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()),
      public_key: key || null,
      webhook_secret_configured: Boolean(webhookSecret())
    });
  });

  app.post('/api/checkout', async (req, res) => {
    let orderId = null;

    try {
      const body = req.body || {};
      const payer = body.payer || {};
      const method = body.metodo === 'pix' ? 'pix' : 'cartao';
      const deviceId = body.device_id;

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
        const { payment } = clients();
        const data = await payment.create({
          body: {
            transaction_amount: total,
            description: `Pedido ${orderId}`,
            statement_descriptor: statementDescriptor(),
            payment_method_id: 'pix',
            external_reference: orderId,
            notification_url: `${base}/api/mercadopago/webhook`,
            payer: paymentPayer(payer),
            additional_info: { items: pixItems(items) }
          },
          requestOptions: requestOptions({
            idempotencyKey: crypto.randomUUID(),
            deviceId
          })
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
        console.log('Mercado Pago: PIX criado', {
          orderId,
          payment_id: order.payment_id,
          shipping_cost: shippingCost,
          total,
          environment: mercadoPagoEnvironment()
        });

        return res.json({
          order_id: orderId,
          payment_id: order.payment_id,
          redirect_url: redirectUrl
        });
      }

      const cardTotal = Number((productsSubtotal + shippingCost).toFixed(2));
      const maxInstallments = maxInstallmentsForAmount(cardTotal);
      const preferenceBody = {
        items: preferenceItems(items),
        payer: preferencePayer(payer),
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

      const { preference } = clients();
      const data = await preference.create({
        body: preferenceBody,
        requestOptions: requestOptions({
          idempotencyKey: crypto.randomUUID(),
          deviceId
        })
      });

      if (!data?.id) {
        throw new Error('O Mercado Pago não retornou o ID da preferência.');
      }

      order.status = 'pending';
      order.payment_status = 'pending';
      order.preference_id = String(data.id);
      order.total = cardTotal;
      order.updated_at = new Date().toISOString();
      await saveOrder(order);

      console.log('Mercado Pago: preferência Checkout Pro criada', {
        orderId,
        preference_id: order.preference_id,
        shipping_cost: shippingCost,
        total: order.total,
        max_installments: maxInstallments,
        device_id_sent: Boolean(requestOptions({ deviceId }).meliSessionId),
        environment: mercadoPagoEnvironment(),
        frontend: 'wallet-brick'
      });

      return res.json({
        order_id: orderId,
        preference_id: order.preference_id
      });
    } catch (error) {
      if (orderId) await markCheckoutError(orderId, error).catch(() => {});
      console.error('Mercado Pago: erro no checkout', {
        orderId,
        message: error.message,
        status: errorStatus(error),
        data: safeErrorData(error)
      });
      const status = errorStatus(error);
      return res.status(status >= 400 && status < 500 ? status : 502).json({
        error: error.message || 'Não foi possível iniciar o pagamento.'
      });
    }
  });

  app.post('/api/mercadopago/webhook', async (req, res) => {
    const type = String(req.body?.type || req.query?.type || '').trim().toLowerCase();
    const dataId = String(req.query?.['data.id'] || '').trim();

    if (type !== 'payment' || !dataId) {
      console.log('Mercado Pago: webhook ignorado', {
        type: type || null,
        data_id: dataId || null
      });
      return res.sendStatus(200);
    }

    const secret = webhookSecret();
    if (!secret) {
      console.warn('Mercado Pago: webhook recebido sem MERCADOPAGO_WEBHOOK_SECRET configurado.');
      return res.sendStatus(503);
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: req.headers['x-signature'],
        xRequestId: req.headers['x-request-id'],
        dataId,
        secret
      });
    } catch (error) {
      console.warn('Mercado Pago: assinatura do webhook inválida', {
        type,
        paymentId: dataId,
        message: error.message
      });
      return res.sendStatus(401);
    }

    try {
      const payment = await getPayment(
        dataId,
        requestOptions({ timeout: 8000, maxRetries: 0 })
      );
      await applyPayment(payment);
      return res.sendStatus(200);
    } catch (error) {
      const status = errorStatus(error);
      if (status === 404) {
        console.warn('Mercado Pago: webhook válido, pagamento não encontrado', {
          paymentId: dataId
        });
        return res.sendStatus(200);
      }

      console.error('Mercado Pago: falha ao processar webhook', {
        paymentId: dataId,
        message: error.message,
        status
      });
      return res.sendStatus(500);
    }
  });

  app.get('/api/order/:id', async (req, res) => {
    let order = read(ORDERS, []).find(item => item.id === req.params.id);
    if (!order || !customerCanAccessOrder(req, order)) return sendOrderNotFound(res);

    if (
      ['creating', 'pending'].includes(order.status) ||
      ['creating', 'pending'].includes(order.payment_status) ||
      Boolean(order.stock_conflict)
    ) {
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

  app.get('/api/admin/order/:id/sync', async (req, res) => {
    let order = read(ORDERS, []).find(item => item.id === req.params.id);
    if (!order) return sendOrderNotFound(res);

    if (
      ['creating', 'pending'].includes(order.status) ||
      ['creating', 'pending'].includes(order.payment_status) ||
      Boolean(order.stock_conflict)
    ) {
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
