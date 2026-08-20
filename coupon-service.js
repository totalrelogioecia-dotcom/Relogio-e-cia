const { Pool } = require('pg');

let pool;
let schemaReady;

function db() {
  if (pool) return pool;
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) throw Object.assign(new Error('Banco de dados não configurado.'), { status: 503 });
  pool = new Pool({
    connectionString,
    ssl: /sslmode=(require|verify-ca|verify-full)/i.test(connectionString) ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = db();
    await client.query(`
      CREATE TABLE IF NOT EXISTS relogio_coupons (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        max_uses INTEGER,
        per_customer_limit INTEGER,
        starts_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS relogio_coupon_uses (
        id BIGSERIAL PRIMARY KEY,
        coupon_id BIGINT NOT NULL REFERENCES relogio_coupons(id) ON DELETE CASCADE,
        customer_email TEXT,
        order_id TEXT NOT NULL UNIQUE,
        used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS relogio_coupon_uses_coupon_idx ON relogio_coupon_uses(coupon_id)');
    await client.query('CREATE INDEX IF NOT EXISTS relogio_coupon_uses_email_idx ON relogio_coupon_uses(coupon_id, customer_email)');
  })().catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function publicCoupon(row) {
  return {
    id: Number(row.id),
    code: row.code,
    active: Boolean(row.active),
    min_order_value: Number(row.min_order_value || 0),
    max_uses: row.max_uses == null ? null : Number(row.max_uses),
    per_customer_limit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
    starts_at: row.starts_at || null,
    expires_at: row.expires_at || null,
    uses_count: Number(row.uses_count || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function listCoupons() {
  await ensureSchema();
  const result = await db().query(`
    SELECT c.*, COUNT(u.id)::int AS uses_count
    FROM relogio_coupons c
    LEFT JOIN relogio_coupon_uses u ON u.coupon_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  return result.rows.map(publicCoupon);
}

async function saveCoupon(input, id = null) {
  await ensureSchema();
  const code = normalizeCode(input.code);
  if (code.length < 3) throw Object.assign(new Error('O cupom precisa ter pelo menos 3 caracteres.'), { status: 400 });
  const min = Math.max(0, Number(input.min_order_value || 0));
  const maxUses = numberOrNull(input.max_uses);
  const perCustomer = numberOrNull(input.per_customer_limit);
  const startsAt = dateOrNull(input.starts_at);
  const expiresAt = dateOrNull(input.expires_at);
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) throw Object.assign(new Error('A validade final precisa ser posterior à data inicial.'), { status: 400 });
  const values = [code, input.active !== false, min, maxUses && maxUses > 0 ? Math.floor(maxUses) : null, perCustomer && perCustomer > 0 ? Math.floor(perCustomer) : null, startsAt, expiresAt];
  try {
    let result;
    if (id) {
      result = await db().query(`UPDATE relogio_coupons SET code=$1,active=$2,min_order_value=$3,max_uses=$4,per_customer_limit=$5,starts_at=$6,expires_at=$7,updated_at=NOW() WHERE id=$8 RETURNING *`, [...values, Number(id)]);
      if (!result.rows.length) throw Object.assign(new Error('Cupom não encontrado.'), { status: 404 });
    } else {
      result = await db().query(`INSERT INTO relogio_coupons(code,active,min_order_value,max_uses,per_customer_limit,starts_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, values);
    }
    const row = result.rows[0];
    const count = await db().query('SELECT COUNT(*)::int AS n FROM relogio_coupon_uses WHERE coupon_id=$1', [row.id]);
    return publicCoupon({ ...row, uses_count: count.rows[0]?.n || 0 });
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('Já existe um cupom com esse código.'), { status: 409 });
    throw error;
  }
}

async function deleteCoupon(id) {
  await ensureSchema();
  const result = await db().query('DELETE FROM relogio_coupons WHERE id=$1 RETURNING id', [Number(id)]);
  if (!result.rows.length) throw Object.assign(new Error('Cupom não encontrado.'), { status: 404 });
  return true;
}

async function validateCoupon({ code, subtotal, shippingCost, email }) {
  await ensureSchema();
  const normalized = normalizeCode(code);
  if (!normalized) return { valid: false, error: 'Informe um cupom.' };
  const result = await db().query(`
    SELECT c.*, COUNT(u.id)::int AS uses_count
    FROM relogio_coupons c
    LEFT JOIN relogio_coupon_uses u ON u.coupon_id=c.id
    WHERE c.code=$1
    GROUP BY c.id
  `, [normalized]);
  const row = result.rows[0];
  if (!row || !row.active) return { valid: false, error: 'Cupom inválido ou inativo.' };
  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return { valid: false, error: 'Este cupom ainda não está disponível.' };
  if (row.expires_at && new Date(row.expires_at).getTime() < now) return { valid: false, error: 'Este cupom expirou.' };
  if (Number(subtotal || 0) < Number(row.min_order_value || 0)) return { valid: false, error: `Este cupom exige compra mínima de R$ ${Number(row.min_order_value).toFixed(2).replace('.', ',')}.` };
  if (row.max_uses != null && Number(row.uses_count) >= Number(row.max_uses)) return { valid: false, error: 'Este cupom atingiu o limite de usos.' };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (row.per_customer_limit != null && normalizedEmail) {
    const count = await db().query('SELECT COUNT(*)::int AS n FROM relogio_coupon_uses WHERE coupon_id=$1 AND customer_email=$2', [row.id, normalizedEmail]);
    if (Number(count.rows[0]?.n || 0) >= Number(row.per_customer_limit)) return { valid: false, error: 'Você já atingiu o limite de usos deste cupom.' };
  }
  return {
    valid: true,
    coupon: publicCoupon(row),
    free_shipping: true,
    original_shipping: Number(shippingCost || 0),
    shipping_discount: Number(shippingCost || 0)
  };
}

async function consumeCoupon(couponId, email, orderId) {
  await ensureSchema();
  await db().query(`INSERT INTO relogio_coupon_uses(coupon_id,customer_email,order_id) VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING`, [Number(couponId), String(email || '').trim().toLowerCase() || null, String(orderId)]);
}

module.exports = { normalizeCode, listCoupons, saveCoupon, deleteCoupon, validateCoupon, consumeCoupon };
