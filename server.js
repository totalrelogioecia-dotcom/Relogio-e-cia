require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');

fs.mkdirSync(DATA, { recursive: true });

/* =========================================================
   LOGIN ADMINISTRATIVO
========================================================= */

const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginAllowed(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, {
      startedAt: now,
      count: 0
    });

    return true;
  }

  return entry.count < MAX_LOGIN_ATTEMPTS;
}

function registerLoginFailure(ip) {
  const now = Date.now();

  const entry = loginAttempts.get(ip) || {
    startedAt: now,
    count: 0
  };

  if (now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, {
      startedAt: now,
      count: 1
    });
  } else {
    entry.count += 1;
    loginAttempts.set(ip, entry);
  }
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

/* =========================================================
   BANCO DE DADOS EM JSON
========================================================= */

const read = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const write = (file, value) => {
  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2),
    'utf8'
  );
};

const getProducts = () => read(PRODUCTS, []);
const getOrders = () => read(ORDERS, []);

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({
  limit: '10mb'
}));

app.use(express.static(ROOT, {
  index: 'index.html'
}));

/* =========================================================
   SEGURANÇA
========================================================= */

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));

  return (
    x.length === y.length &&
    crypto.timingSafeEqual(x, y)
  );
}

/* =========================================================
   TOKEN ADMIN
========================================================= */

function token(payload) {
  const secret =
    process.env.ADMIN_SESSION_SECRET || 'CHANGE-ME';

  const body = Buffer
    .from(JSON.stringify(payload))
    .toString('base64url');

  const sig = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return body + '.' + sig;
}

function validToken(t) {
  try {
    const [body, sig] = String(t || '').split('.');

    const secret =
      process.env.ADMIN_SESSION_SECRET || 'CHANGE-ME';

    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64url');

    if (!body || !safeEqual(sig, expected)) {
      return false;
    }

    const p = JSON.parse(
      Buffer.from(body, 'base64url').toString()
    );

    return (
      p.role === 'admin' &&
      p.exp > Date.now()
    );

  } catch {
    return false;
  }
}

function admin(req, res, next) {
  const t = (req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '');

  if (!validToken(t)) {
    return res.status(401).json({
      error: 'Sessão administrativa inválida ou expirada.'
    });
  }

  next();
}

/* =========================================================
   PRODUTOS
========================================================= */

function normalize(p) {
  return {
    id: Number(p.id),

    nome: String(p.nome || '').trim(),

    marca: String(p.marca || '').trim(),

    categoria:
      String(p.categoria || 'Relógios').trim(),

    preco:
      Number(p.preco) || 0,

    sku:
      String(p.sku || '').trim(),

    desc:
      String(p.desc || '').trim(),

    fotos:
      Array.isArray(p.fotos)
        ? p.fotos.filter(Boolean).slice(0, 8)
        : [],

    estoque:
      Math.max(0, Number(p.estoque) || 0),

    ativo:
      p.ativo !== false
  };
}

/* =========================================================
   API PRODUTOS
========================================================= */

app.get('/api/products', (req, res) => {
  res.json(
    getProducts().filter(
      p => p.ativo !== false
    )
  );
});

/* =========================================================
   LOGIN ADMIN
========================================================= */

app.post('/api/admin/login', (req, res) => {

  const ip =
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';

  if (!loginAllowed(ip)) {
    return res.status(429).json({
      error:
        'Muitas tentativas de login. Tente novamente em alguns minutos.'
    });
  }

  const email =
    String(req.body?.email || '')
      .trim()
      .toLowerCase();

  const senha =
    String(req.body?.senha || '');

  const adminEmail =
    (process.env.ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();

  const adminPass =
    process.env.ADMIN_PASSWORD || '';

  const secret =
    process.env.ADMIN_SESSION_SECRET || '';

  if (!adminEmail || !adminPass || !secret) {
    return res.status(503).json({
      error:
        'Painel administrativo não configurado. Defina ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_SESSION_SECRET.'
    });
  }

  if (
    !safeEqual(email, adminEmail) ||
    !safeEqual(senha, adminPass)
  ) {

    registerLoginFailure(ip);

    return res.status(401).json({
      error: 'E-mail ou senha inválidos.'
    });
  }

  clearLoginFailures(ip);

  res.json({
    token: token({
      role: 'admin',
      email: adminEmail,
      exp: Date.now() + 8 * 60 * 60 * 1000
    }),

    admin: {
      email: adminEmail
    }
  });
});

/* =========================================================
   ADMIN - PRODUTOS
========================================================= */

app.get('/api/admin/products', admin, (req, res) => {
  res.json(getProducts());
});

app.post('/api/admin/products', admin, (req, res) => {

  const ps = getProducts();

  const id =
    ps.reduce(
      (m, p) =>
        Math.max(m, Number(p.id) || 0),
      0
    ) + 1;

  const p = normalize({
    ...req.body,
    id
  });

  ps.push(p);

  write(PRODUCTS, ps);

  res.status(201).json(p);
});

app.put('/api/admin/products/:id', admin, (req, res) => {

  const id = Number(req.params.id);

  const ps = getProducts();

  const i =
    ps.findIndex(
      p => Number(p.id) === id
    );

  if (i < 0) {
    return res.status(404).json({
      error: 'Produto não encontrado.'
    });
  }

  ps[i] = normalize({
    ...ps[i],
    ...req.body,
    id
  });

  write(PRODUCTS, ps);

  res.json(ps[i]);
});

app.delete('/api/admin/products/:id', admin, (req, res) => {

  const id = Number(req.params.id);

  const ps = getProducts();

  const i =
    ps.findIndex(
      p => Number(p.id) === id
    );

  if (i < 0) {
    return res.status(404).json({
      error: 'Produto não encontrado.'
    });
  }

  ps[i].ativo = false;

  write(PRODUCTS, ps);

  res.json({
    ok: true
  });
});

/* =========================================================
   ADMIN - PEDIDOS
========================================================= */

app.get('/api/admin/orders', admin, (req, res) => {

  res.json(
    getOrders().sort(
      (a, b) =>
        new Date(b.created_at) -
        new Date(a.created_at)
    )
  );
});

/* =========================================================
   CHECKOUT MERCADO PAGO
========================================================= */

app.post('/api/checkout', async (req, res) => {

  try {

    const {
      items,
      payer,
      metodo
    } = req.body || {};

    if (
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({
        error: 'Carrinho vazio.'
      });
    }

    if (
      !payer?.email ||
      !payer?.nome
    ) {
      return res.status(400).json({
        error:
          'Dados do comprador incompletos.'
      });
    }

    const products = getProducts();

    const normalized = [];

    for (const item of items) {

      const p =
        products.find(
          x =>
            Number(x.id) ===
              Number(item.id) &&
            x.ativo !== false
        );

      const qtd =
        Math.max(
          1,
          Math.min(
            99,
            Number(item.qtd) || 1
          )
        );

      if (!p) {
        return res.status(400).json({
          error: 'Produto não encontrado.'
        });
      }

      if (
        Number(p.estoque) < qtd
      ) {
        return res.status(400).json({
          error:
            `Estoque insuficiente para ${p.nome}.`
        });
      }

      normalized.push({
        id: p.id,
        nome: p.nome,
        sku: p.sku,
        quantidade: qtd,
        unit_price: Number(p.preco)
      });
    }

    const base =
      (process.env.PUBLIC_URL || '')
        .replace(/\/+$/, '');

    const access =
      process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!access) {
      return res.status(503).json({
        error:
          'Pagamento não configurado: adicione MERCADOPAGO_ACCESS_TOKEN no ambiente.'
      });
    }

    if (!base.startsWith('https://')) {
      return res.status(503).json({
        error:
          'PUBLIC_URL precisa ser uma URL HTTPS pública.'
      });
    }

    const forma =
      metodo === 'pix'
        ? 'pix'
        : 'cartao';

    const descontoPix =
      forma === 'pix'
        ? 0.05
        : 0;

    const priced =
      normalized.map(i => ({
        ...i,

        unit_price:
          Number(
            (
              i.unit_price *
              (1 - descontoPix)
            ).toFixed(2)
          )
      }));

    const total =
      Number(
        priced.reduce(
          (s, i) =>
            s +
            i.quantidade *
            i.unit_price,
          0
        ).toFixed(2)
      );

    const orderId =
      'PED-' +
      Date.now() +
      '-' +
      crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase();

    const paymentMethods =
      forma === 'pix'

        ? {
            excluded_payment_types: [
              { id: 'credit_card' },
              { id: 'debit_card' },
              { id: 'ticket' }
            ]
          }

        : {
            excluded_payment_types: [
              { id: 'bank_transfer' },
              { id: 'ticket' }
            ],
            installments: 12
          };

    const pref = {

      items:
        priced.map(i => ({
          id: String(i.id),
          title: i.nome,
          quantity: i.quantidade,
          currency_id: 'BRL',
          unit_price: i.unit_price
        })),

      payer: {
        name:
          String(payer.nome)
            .slice(0, 120),

        email:
          String(payer.email)
            .slice(0, 180)
      },

      payment_methods:
        paymentMethods,

      external_reference:
        orderId,

      additional_info:
        descontoPix
          ? 'Desconto de 5% aplicado para pagamento via Pix.'
          : undefined,

      back_urls: {

        success:
          `${base}/pagamento.html?status=success&pedido=${encodeURIComponent(orderId)}`,

        failure:
          `${base}/pagamento.html?status=failure&pedido=${encodeURIComponent(orderId)}`,

        pending:
          `${base}/pagamento.html?status=pending&pedido=${encodeURIComponent(orderId)}`
      },

      auto_return:
        'approved',

      notification_url:
        `${base}/api/mercadopago/webhook`
    };

    const r =
      await fetch(
        'https://api.mercadopago.com/checkout/preferences',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${access}`,

            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(pref)
        }
      );

    const mp =
      await r.json();

    if (!r.ok) {

      console.error(
        'Mercado Pago:',
        mp
      );

      return res.status(502).json({
        error:
          'O Mercado Pago recusou o checkout.'
      });
    }

    const order = {

      id: orderId,

      status:
        'pending',

      payment_status:
        'pending',

      payer: {
        nome:
          String(payer.nome)
            .slice(0, 120),

        email:
          String(payer.email)
            .slice(0, 180)
      },

      items: priced,

      total,

      subtotal:
        Number(
          normalized.reduce(
            (s, i) =>
              s +
              i.quantidade *
              i.unit_price,
            0
          ).toFixed(2)
        ),

      desconto_pix:
        Number(
          (
            normalized.reduce(
              (s, i) =>
                s +
                i.quantidade *
                i.unit_price,
              0
            ) *
            descontoPix
          ).toFixed(2)
        ),

      metodo:
        forma,

      preference_id:
        mp.id,

      created_at:
        new Date().toISOString()
    };

    const orders =
      getOrders();

    orders.push(order);

    write(
      ORDERS,
      orders
    );

    res.json({
      order_id:
        orderId,

      init_point:
        mp.init_point
    });

  } catch (e) {

    console.error(e);

    res.status(500).json({
      error:
        'Erro interno ao preparar o pagamento.'
    });
  }
});

/* =========================================================
   VALIDAR WEBHOOK MERCADO PAGO
========================================================= */

function validarWebhookMercadoPago(req) {

  const secret =
    process.env.MERCADOPAGO_WEBHOOK_SECRET || '';

  if (!secret) {
    console.error(
      'MERCADOPAGO_WEBHOOK_SECRET não configurado.'
    );

    return false;
  }

  const xSignature =
    req.get('x-signature') || '';

  const xRequestId =
    req.get('x-request-id') || '';

  /*
    O Mercado Pago pode enviar o data.id
    pela query string ou pelo corpo da requisição.
  */

  const dataId =
    String(
      req.query['data.id'] ||
      req.body?.data?.id ||
      ''
    );

  if (!xSignature || !dataId) {

    console.error(
      'Webhook sem x-signature ou data.id.'
    );

    return false;
  }

  let ts = '';
  let v1 = '';

  for (
    const part of xSignature.split(',')
  ) {

    const [key, ...rest] =
      part.trim().split('=');

    const value =
      rest.join('=');

    if (key === 'ts') {
      ts = value;
    }

    if (key === 'v1') {
      v1 = value;
    }
  }

  if (!ts || !v1) {

    console.error(
      'Assinatura do Mercado Pago incompleta.'
    );

    return false;
  }

  /*
    Manifest usado para gerar a assinatura.
  */

  const manifestParts = [];

  manifestParts.push(
    `id:${dataId}`
  );

  if (xRequestId) {

    manifestParts.push(
      `request-id:${xRequestId}`
    );
  }

  manifestParts.push(
    `ts:${ts}`
  );

  const manifest =
    manifestParts.join(';') + ';';

  const expected =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(manifest)
      .digest('hex');

  if (!safeEqual(expected, v1)) {

    console.error(
      'Assinatura do webhook inválida.'
    );

    return false;
  }

  /*
    O timestamp do Mercado Pago
    normalmente vem em segundos.
  */

  const timestamp =
    Number(ts);

  if (!Number.isFinite(timestamp)) {

    return false;
  }

  const timestampMs =
    timestamp < 100000000000
      ? timestamp * 1000
      : timestamp;

  /*
    Aceitamos somente notificações
    com até 5 minutos de diferença.
  */

  if (
    Math.abs(
      Date.now() - timestampMs
    ) >
    5 * 60 * 1000
  ) {

    console.error(
      'Timestamp do webhook expirado.'
    );

    return false;
  }

  return true;
}

/* =========================================================
   WEBHOOK MERCADO PAGO
========================================================= */

/* =========================================================
   WEBHOOK MERCADO PAGO
========================================================= */

app.post(
  '/api/mercadopago/webhook',
  async (req, res) => {

    const type =
      req.body?.type ||
      req.body?.topic ||
      '';

    const paymentId =
      String(
        req.body?.data?.id ||
        req.query['data.id'] ||
        req.body?.id ||
        ''
      );

    const liveMode =
      req.body?.live_mode === true;

    const xSignature =
      req.get('x-signature') || '';

    /*
      ======================================================
      TESTE DO MERCADO PAGO
      ======================================================

      O simulador pode enviar uma requisição de teste
      sem assinatura.

      Nesse caso apenas respondemos 200.

      IMPORTANTE:
      Não alteramos pedido nem estoque.
    */

    if (!xSignature) {

      console.log(
        'Webhook recebido sem x-signature.'
      );

      console.log(
        'Tipo:',
        type
      );

      console.log(
        'Data ID:',
        paymentId
      );

      console.log(
        'Live mode:',
        liveMode
      );

      /*
        Se for uma simulação/teste, respondemos OK.
      */

      if (!liveMode) {

        console.log(
          'Simulação do Mercado Pago recebida com sucesso.'
        );

        return res.sendStatus(200);
      }

      /*
        Se estiver em produção e não houver assinatura,
        recusamos.
      */

      console.error(
        'Webhook de produção sem assinatura.'
      );

      return res.sendStatus(401);
    }

    /*
      ======================================================
      NOTIFICAÇÃO REAL
      ======================================================
    */

    if (
      !validarWebhookMercadoPago(req)
    ) {

      console.error(
        'Assinatura do webhook inválida.'
      );

      return res.sendStatus(401);
    }

    /*
      Respondemos rapidamente ao Mercado Pago.
    */

    res.sendStatus(200);

    /*
      ======================================================
      PROCESSAMENTO
      ======================================================
    */

    try {

      if (
        type !== 'payment'
      ) {

        console.log(
          'Webhook ignorado. Tipo:',
          type
        );

        return;
      }

      if (!paymentId) {

        console.error(
          'Webhook de pagamento sem data.id.'
        );

        return;
      }

      if (
        !process.env.MERCADOPAGO_ACCESS_TOKEN
      ) {

        console.error(
          'MERCADOPAGO_ACCESS_TOKEN não configurado.'
        );

        return;
      }

      /*
        Consulta o pagamento diretamente
        na API oficial do Mercado Pago.
      */

      const r =
        await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
          {
            headers: {
              Authorization:
                `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
            }
          }
        );

      if (!r.ok) {

        console.error(
          'Erro ao consultar pagamento no Mercado Pago:',
          r.status
        );

        return;
      }

      const payment =
        await r.json();

      console.log(
        'Pagamento consultado:',
        payment.id,
        payment.status
      );

      /*
        Recupera o número do nosso pedido.
      */

      const orderId =
        payment.external_reference;

      if (!orderId) {

        console.error(
          'Pagamento sem external_reference.'
        );

        return;
      }

      const orders =
        getOrders();

      const orderIndex =
        orders.findIndex(
          order =>
            order.id === orderId
        );

      if (orderIndex === -1) {

        console.error(
          'Pedido não encontrado:',
          orderId
        );

        return;
      }

      /*
        Atualiza informações do pagamento.
      */

      orders[orderIndex].payment_id =
        String(payment.id);

      orders[orderIndex].payment_status =
        payment.status || 'pending';

      /*
        Atualiza status do pedido.
      */

      if (
        payment.status === 'approved'
      ) {

        orders[orderIndex].status =
          'paid';

      } else if (
        payment.status === 'rejected'
      ) {

        orders[orderIndex].status =
          'rejected';

      } else if (
        payment.status === 'cancelled'
      ) {

        orders[orderIndex].status =
          'cancelled';

      } else {

        orders[orderIndex].status =
          'pending';
      }

      /*
        ====================================================
        BAIXA DE ESTOQUE
        ====================================================

        Só fazemos uma vez.
      */

      if (
        payment.status === 'approved' &&
        !orders[orderIndex].stock_applied
      ) {

        const products =
          getProducts();

        for (
          const item
          of orders[orderIndex].items || []
        ) {

          const productIndex =
            products.findIndex(
              product =>
                Number(product.id) ===
                Number(item.id)
            );

          if (
            productIndex !== -1
          ) {

            products[productIndex].estoque =
              Math.max(
                0,
                Number(
                  products[productIndex].estoque
                ) -
                Number(item.quantidade)
              );
          }
        }

        write(
          PRODUCTS,
          products
        );

        orders[orderIndex].stock_applied =
          true;

        console.log(
          'Estoque atualizado para o pedido:',
          orderId
        );
      }

      orders[orderIndex].updated_at =
        new Date().toISOString();

      write(
        ORDERS,
        orders
      );

      console.log(
        'Pedido atualizado:',
        orderId,
        '=>',
        orders[orderIndex].status
      );

    } catch (error) {

      console.error(
        'Erro ao processar Webhook Mercado Pago:',
        error
      );
    }
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  '/healthz',
  (req, res) => {
    res.json({
      ok: true
    });
  }
);

/* =========================================================
   CONSULTAR PEDIDO
========================================================= */

app.get(
  '/api/order/:id',
  (req, res) => {

    const o =
      getOrders().find(
        x =>
          x.id ===
          req.params.id
      );

    if (!o) {

      return res.status(404).json({
        error:
          'Pedido não encontrado.'
      });
    }

    res.json({

      id: o.id,

      status:
        o.status,

      payment_status:
        o.payment_status,

      total:
        o.total,

      created_at:
        o.created_at
    });
  }
);

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      `Relógio e Cia: http://localhost:${PORT}`
    );
  }
);
