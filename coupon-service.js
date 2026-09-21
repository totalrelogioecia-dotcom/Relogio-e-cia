const { Pool } = require('pg');
const { databaseSsl } = require('./persistent-store');

let pool;
let schemaReady;

function db() {
  if (pool) return pool;
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) throw Object.assign(new Error('Banco de dados não configurado.'), { status: 503 });
  pool = new Pool({
    connectionString,
    ssl: databaseSsl(connectionString),
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
    await client.query('SELECT 1 FROM relogio_coupons LIMIT 1');
    await client.query('SELECT 1 FROM relogio_coupon_uses LIMIT 1');
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
    SELECT c.*, COUNT(u.id) FILTER (WHERE u.status='approved')::int AS uses_count
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
    const count = await db().query("SELECT COUNT(*)::int AS n FROM relogio_coupon_uses WHERE coupon_id=$1 AND status='approved'", [row.id]);
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
    SELECT c.*,
      COUNT(u.id) FILTER (WHERE u.status='approved')::int AS uses_count,
      COUNT(u.id) FILTER (
        WHERE u.status='approved' OR (u.status='reserved' AND u.expires_at > NOW())
      )::int AS active_uses_count
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
  if (row.max_uses != null && Number(row.active_uses_count) >= Number(row.max_uses)) return { valid: false, error: 'Este cupom atingiu o limite de usos.' };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (row.per_customer_limit != null && normalizedEmail) {
    const count = await db().query(`
      SELECT COUNT(*)::int AS n
      FROM relogio_coupon_uses
      WHERE coupon_id=$1 AND customer_email=$2
        AND (status='approved' OR (status='reserved' AND expires_at > NOW()))
    `, [row.id, normalizedEmail]);
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

function reservationMinutes() {
  const configured = Number(process.env.COUPON_RESERVATION_MINUTES || 60);
  return Number.isFinite(configured) ? Math.max(10, Math.min(1440, Math.floor(configured))) : 60;
}

async function reserveCoupon({ couponId, email, orderId, subtotal }) {
  await ensureSchema();
  const client = await db().connect();
  const normalizedEmail = String(email || '').trim().toLowerCase() || null;
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM relogio_coupons WHERE id=$1 FOR UPDATE', [Number(couponId)]);
    const coupon = result.rows[0];
    if (!coupon || !coupon.active) throw Object.assign(new Error('Cupom inválido ou inativo.'), { status: 400 });

    const now = Date.now();
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) throw Object.assign(new Error('Este cupom ainda não está disponível.'), { status: 400 });
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) throw Object.assign(new Error('Este cupom expirou.'), { status: 400 });
    if (Number(subtotal || 0) < Number(coupon.min_order_value || 0)) throw Object.assign(new Error(`Este cupom exige compra mínima de R$ ${Number(coupon.min_order_value).toFixed(2).replace('.', ',')}.`), { status: 400 });

    await client.query(
      "DELETE FROM relogio_coupon_uses WHERE coupon_id=$1 AND status='reserved' AND expires_at <= NOW()",
      [Number(couponId)]
    );
    const totals = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE customer_email=$2)::int AS customer_total
      FROM relogio_coupon_uses
      WHERE coupon_id=$1 AND (status='approved' OR (status='reserved' AND expires_at > NOW()))
    `, [Number(couponId), normalizedEmail]);
    const total = Number(totals.rows[0]?.total || 0);
    const customerTotal = Number(totals.rows[0]?.customer_total || 0);
    if (coupon.max_uses != null && total >= Number(coupon.max_uses)) throw Object.assign(new Error('Este cupom atingiu o limite de usos.'), { status: 400 });
    if (coupon.per_customer_limit != null && normalizedEmail && customerTotal >= Number(coupon.per_customer_limit)) throw Object.assign(new Error('Você já atingiu o limite de usos deste cupom.'), { status: 400 });

    await client.query(`
      INSERT INTO relogio_coupon_uses(coupon_id,customer_email,order_id,status,expires_at)
      VALUES($1,$2,$3,'reserved',NOW() + ($4 * INTERVAL '1 minute'))
      ON CONFLICT(order_id) DO NOTHING
    `, [Number(couponId), normalizedEmail, String(orderId), reservationMinutes()]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function consumeCoupon(couponId, email, orderId) {
  await ensureSchema();
  await db().query(`
    INSERT INTO relogio_coupon_uses(coupon_id,customer_email,order_id,status,expires_at,approved_at)
    VALUES($1,$2,$3,'approved',NULL,NOW())
    ON CONFLICT(order_id) DO UPDATE SET
      status='approved', expires_at=NULL, approved_at=COALESCE(relogio_coupon_uses.approved_at,NOW())
  `, [Number(couponId), String(email || '').trim().toLowerCase() || null, String(orderId)]);
}

async function releaseCoupon(orderId) {
  await ensureSchema();
  await db().query("DELETE FROM relogio_coupon_uses WHERE order_id=$1 AND status='reserved'", [String(orderId)]);
}

module.exports = {
  normalizeCode,
  listCoupons,
  saveCoupon,
  deleteCoupon,
  validateCoupon,
  reserveCoupon,
  consumeCoupon,
  releaseCoupon
};
