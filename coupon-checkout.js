const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { maxInstallmentsForAmount } = require('./installment-policy');
const { resolveSelectedShipping, isConfigured } = require('./shipping-service');
const { validateCoupon, reserveCoupon, consumeCoupon, releaseCoupon } = require('./coupon-service');
const { flushPersistentStore } = require('./persistent-store');
const { assertPickupAllowed } = require('./pickup-policy');
const {
  readDetails,
  validateCheckoutAvailability
} = require('./product-availability-service');
const {
  clients,
  errorStatus,
  mercadoPagoEnvironment,
  paymentPayer,
  preferencePayer,
  publicBaseUrl,
  receiverAddress,
  requestOptions,
  safeErrorData,
  statementDescriptor
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

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeItems(rawItems) {
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
    const quantidade = Math.max(1, Math.min(99, Number(raw.qtd) || 1));

    if (!product) {
      const error = new Error('Um produto do carrinho não foi encontrado.');
      error.status = 400;
      throw error;
    }
    const availability = validateCheckoutAvailability(product, quantidade, detailsMap);

    const picture = Array.isArray(product.fotos)
      ? product.fotos.find(url => /^https:\/\//i.test(String(url || '')))
      : null;

    return {
      id: Number(product.id),
      sku: String(product.sku || ''),
      nome: String(product.nome || 'Produto'),
      descricao: String(product.desc || '').trim(),
      categoria: String(product.categoria || '').trim(),
      foto: picture || null,
      quantidade,
      unit_price: money(product.preco),
      disponibilidade: availability.type,
      prazo_preparacao_dias_uteis: availability.preparation_days || 0
    };
  });
}

function categoryId(item) {
  const category = String(item.categoria || '').toLowerCase();
  if (category.includes('relóg') || category.includes('relog') || category.includes('acess')) {
    return 'fashion';
  }
  return undefined;
}

function preferenceItems(items) {
  return items.map(item => {
    const result = {
      id: String(item.sku || item.id),
      title: item.nome.slice(0, 256),
      description: (item.descricao || `Produto físico vendido pela Relógio e Cia - SKU ${item.sku || item.id}`).slice(0, 256),
      quantity: item.quantidade,
      currency_id: 'BRL',
      unit_price: item.unit_price
    };
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    const category = categoryId(item);
    if (category) result.category_id = category;
    return result;
  });
}

function pixItems(items) {
  return items.map(item => {
    const result = {
      id: String(item.sku || item.id),
      title: item.nome.slice(0, 256),
      description: (item.descricao || `Produto físico vendido pela Relógio e Cia - SKU ${item.sku || item.id}`).slice(0, 256),
      quantity: item.quantidade,
      unit_price: money(item.unit_price * 0.95)
    };
    if (item.foto) result.picture_url = item.foto.slice(0, 1000);
    const category = categoryId(item);
    if (category) result.category_id = category;
    return result;
  });
}

async function persistOrder(order) {
  const orders = read(ORDERS, []);
  const index = orders.findIndex(item => item.id === order.id);
  if (index >= 0) orders[index] = order;
  else orders.push(order);
  write(ORDERS, orders);
  await flushPersistentStore();
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

function registerCouponCheckout(app) {
  app.use('/api/checkout', express.json({ limit: '1mb' }));

  app.post('/api/checkout', async (req, res, next) => {
    const couponCode = String(req.body?.coupon || '').trim();
    if (!couponCode) return next();

    let orderId = null;
    let couponReserved = false;
    let externalPaymentCreated = false;
    try {
      const body = req.body || {};
      const payer = body.payer || {};
      const deviceId = body.device_id;

      if (!payer.email || !payer.nome) {
        return res.status(401).json({ error: 'Faça login antes de finalizar a compra.' });
      }

      const items = normalizeItems(body.items);
      const subtotal = money(
        items.reduce((sum, item) => sum + item.quantidade * item.unit_price, 0)
      );
      const shipping = await resolveShipping(body, payer);
      const originalShipping = money(shipping?.price || 0);
      const validation = await validateCoupon({
        code: couponCode,
        subtotal,
        shippingCost: originalShipping,
        email: payer.email
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error || 'Cupom inválido.'
        });
      }

      orderId = `PED-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await reserveCoupon({
        couponId: validation.coupon.id,
        email: payer.email,
        orderId,
        subtotal
      });
      couponReserved = true;
      const productDiscount = money(validation.product_discount || 0);
      const discountedSubtotal = money(Math.max(0, subtotal - productDiscount));
      const couponShipping = shipping ? { ...shipping, original_price: originalShipping, price: validation.free_shipping ? 0 : originalShipping, coupon_code: validation.coupon.code } : null;
      const chargedShipping = validation.free_shipping ? 0 : originalShipping;
      const base = publicBaseUrl();
      const method = body.metodo === 'pix' ? 'pix' : 'cartao';
      const pixDiscount = method === 'pix' ? money(discountedSubtotal * 0.05) : 0;
      const total = money(discountedSubtotal - pixDiscount + chargedShipping);

      const localOrder = {
        id: orderId,
        status: 'creating',
        payment_status: 'creating',
        payment_id: null,
        mp_order_id: null,
        payer: {
          nome: String(payer.nome).slice(0, 120),
          email: String(payer.email).slice(0, 180),
          endereco: payer.endereco || null
        },
        items,
        subtotal,
        desconto_pix: pixDiscount,
        shipping: couponShipping,
        coupon: {
          id: validation.coupon.id,
          code: validation.coupon.code,
          type: validation.coupon.coupon_type,
          discount_type: validation.coupon.discount_type,
          discount: validation.free_shipping ? originalShipping : productDiscount
        },
        metodo: method,
        total,
        created_at: new Date().toISOString()
      };
      await persistOrder(localOrder);

      if (method === 'pix') {
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
          const error = new Error('O Mercado Pago não retornou o QR Code do PIX.');
          error.status = 502;
          throw error;
        }
        externalPaymentCreated = true;

        localOrder.payment_id = String(data.id);
        localOrder.payment_status = String(data.status || 'pending');
        localOrder.status = data.status === 'approved' ? 'paid' : 'pending';
        localOrder.pix = {
          qr_code: String(transaction.qr_code),
          qr_code_base64: String(transaction.qr_code_base64),
          ticket_url: transaction.ticket_url ? String(transaction.ticket_url) : null
        };
        localOrder.updated_at = new Date().toISOString();
        await persistOrder(localOrder);
        if (data.status === 'approved') {
          await consumeCoupon(validation.coupon.id, payer.email, orderId);
          couponReserved = false;
        }

        const redirectUrl = `${base}/pagamento-pix.html?pedido=${encodeURIComponent(orderId)}`;
        console.log('Checkout PIX com cupom criado:', {
          orderId,
          payment_id: localOrder.payment_id,
          shipping_original: originalShipping,
          shipping_charged: 0,
          coupon: validation.coupon.code,
          total,
          environment: mercadoPagoEnvironment()
        });

        return res.json({
          order_id: orderId,
          payment_id: localOrder.payment_id,
          redirect_url: redirectUrl,
          coupon: localOrder.coupon
        });
      }

      const preferenceBody = {
        items: productDiscount > 0 ? [{
          id: `CUPOM-${validation.coupon.code}`,
          title: `Produtos do pedido - cupom ${validation.coupon.code}`.slice(0,256),
          description: `Valor dos produtos após desconto do cupom ${validation.coupon.code}`.slice(0,256),
          quantity: 1,
          currency_id: 'BRL',
          unit_price: discountedSubtotal
        }] : preferenceItems(items),
        payer: preferencePayer(payer),
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' },
            { id: 'bank_transfer' }
          ],
          installments: maxInstallmentsForAmount(total)
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
          cost: chargedShipping,
          mode: 'not_specified'
        };
        const address = receiverAddress(payer);
        if (address) preferenceBody.shipments.receiver_address = address;
      }

      const { preference } = clients();
      const pref = await preference.create({
        body: preferenceBody,
        requestOptions: requestOptions({
          idempotencyKey: crypto.randomUUID(),
          deviceId
        })
      });

      if (!pref?.id) {
        throw new Error('O Mercado Pago não retornou o ID da preferência.');
      }
      externalPaymentCreated = true;

      localOrder.status = 'pending';
      localOrder.payment_status = 'pending';
      localOrder.preference_id = String(pref.id);
      localOrder.updated_at = new Date().toISOString();
      await persistOrder(localOrder);

      console.log('Checkout Pro com cupom criado:', {
        orderId,
        preference_id: localOrder.preference_id,
        coupon: validation.coupon.code,
        device_id_sent: Boolean(requestOptions({ deviceId }).meliSessionId),
        environment: mercadoPagoEnvironment(),
        frontend: 'wallet-brick'
      });

      return res.json({
        order_id: orderId,
        preference_id: localOrder.preference_id,
        coupon: localOrder.coupon
      });
    } catch (error) {
      if (couponReserved && !externalPaymentCreated && orderId) await releaseCoupon(orderId).catch(() => {});
      console.error('Checkout com cupom falhou:', {
        orderId,
        message: error?.message || null,
        status: errorStatus(error),
        mercado_pago: safeErrorData(error)
      });
      const status = errorStatus(error);
      return res.status(status >= 400 && status < 500 ? status : 502).json({
        error: error?.message || 'Não foi possível aplicar o cupom.'
      });
    }
  });
}

module.exports = { registerCouponCheckout };
