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
    // O processo web usa somente DML. Criação/alteração de tabelas pertence às
    // migrações administrativas do banco e nunca deve rodar durante uma requisição.
    const required = {
      relogio_coupons: [
        'id', 'code', 'active', 'min_order_value', 'coupon_type', 'discount_type',
        'discount_value', 'max_discount', 'max_uses', 'per_customer_limit',
        'starts_at', 'expires_at', 'created_at', 'updated_at'
      ],
      relogio_coupon_uses: [
        'id', 'coupon_id', 'customer_email', 'order_id', 'status',
        'expires_at', 'approved_at', 'used_at'
      ]
    };

    const result = await db().query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `, [Object.keys(required)]);

    const available = new Map();
    for (const row of result.rows) {
      if (!available.has(row.table_name)) available.set(row.table_name, new Set());
      available.get(row.table_name).add(row.column_name);
    }

    const missing = [];
    for (const [table, columns] of Object.entries(required)) {
      const present = available.get(table);
      if (!present) {
        missing.push(table);
        continue;
      }
      for (const column of columns) {
        if (!present.has(column)) missing.push(`${table}.${column}`);
      }
    }

    if (missing.length) {
      const error = new Error(
        'Estrutura de cupons do banco está desatualizada. Execute a migração administrativa antes de usar cupons.'
      );
      error.status = 503;
      error.missingSchema = missing;
      throw error;
    }
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
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
    coupon_type: row.coupon_type === 'discount' ? 'discount' : 'free_shipping',
    discount_type: row.discount_type === 'fixed' ? 'fixed' : (row.discount_type === 'percent' ? 'percent' : null),
    discount_value: row.discount_value == null ? null : Number(row.discount_value),
    max_discount: row.max_discount == null ? null : Number(row.max_discount),
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
  const couponType = input.coupon_type === 'discount' ? 'discount' : 'free_shipping';
  const discountType = couponType === 'discount' && input.discount_type === 'fixed' ? 'fixed' : (couponType === 'discount' ? 'percent' : null);
  const discountValue = couponType === 'discount' ? Number(input.discount_value || 0) : null;
  const maxDiscount = couponType === 'discount' && discountType === 'percent' ? numberOrNull(input.max_discount) : null;
  if (couponType === 'discount' && (!Number.isFinite(discountValue) || discountValue <= 0)) throw Object.assign(new Error('Informe um desconto maior que zero.'), { status: 400 });
  if (couponType === 'discount' && discountType === 'percent' && discountValue > 100) throw Object.assign(new Error('O desconto percentual não pode ser maior que 100%.'), { status: 400 });
  const maxUses = numberOrNull(input.max_uses);
  const perCustomer = numberOrNull(input.per_customer_limit);
  const startsAt = dateOrNull(input.starts_at);
  const expiresAt = dateOrNull(input.expires_at);
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) throw Object.assign(new Error('A validade final precisa ser posterior à data inicial.'), { status: 400 });
  const values = [code, input.active !== false, min, couponType, discountType, discountValue, maxDiscount && maxDiscount > 0 ? maxDiscount : null, maxUses && maxUses > 0 ? Math.floor(maxUses) : null, perCustomer && perCustomer > 0 ? Math.floor(perCustomer) : null, startsAt, expiresAt];
  try {
    let result;
    if (id) {
      result = await db().query(`UPDATE relogio_coupons SET code=$1,active=$2,min_order_value=$3,coupon_type=$4,discount_type=$5,discount_value=$6,max_discount=$7,max_uses=$8,per_customer_limit=$9,starts_at=$10,expires_at=$11,updated_at=NOW() WHERE id=$12 RETURNING *`, [...values, Number(id)]);
      if (!result.rows.length) throw Object.assign(new Error('Cupom não encontrado.'), { status: 404 });
    } else {
      result = await db().query(`INSERT INTO relogio_coupons(code,active,min_order_value,coupon_type,discount_type,discount_value,max_discount,max_uses,per_customer_limit,starts_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, values);
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
  const coupon = publicCoupon(row);
  let productDiscount = 0;
  if (coupon.coupon_type === 'discount') {
    productDiscount = coupon.discount_type === 'fixed'
      ? Number(coupon.discount_value || 0)
      : Number(subtotal || 0) * Number(coupon.discount_value || 0) / 100;
    if (coupon.max_discount != null) productDiscount = Math.min(productDiscount, Number(coupon.max_discount));
    productDiscount = Math.min(Number(subtotal || 0), Math.max(0, Number(productDiscount.toFixed(2))));
  }
  const freeShipping = coupon.coupon_type === 'free_shipping';
  return {
    valid: true,
    coupon,
    free_shipping: freeShipping,
    original_shipping: Number(shippingCost || 0),
    shipping_discount: freeShipping ? Number(shippingCost || 0) : 0,
    product_discount: productDiscount
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
