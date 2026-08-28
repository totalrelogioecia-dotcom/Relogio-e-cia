const crypto = require('crypto');

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function createCheckoutRateLimit(resolveUser) {
  const windowMs = positiveInteger(process.env.CHECKOUT_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
  const maxRequests = positiveInteger(process.env.CHECKOUT_RATE_LIMIT_MAX, 30);
  const attempts = new Map();

  function keyFor(req) {
    let user = null;
    try {
      user = typeof resolveUser === 'function' ? resolveUser(req) : null;
    } catch {}

    const identity = user?.id || user?.email || req.ip || req.socket?.remoteAddress || 'unknown';
    return crypto.createHash('sha256').update(String(identity)).digest('hex');
  }

  return function checkoutRateLimit(req, res, next) {
    const now = Date.now();
    const key = keyFor(req);
    const current = attempts.get(key);

    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Muitas tentativas de pagamento em pouco tempo. Aguarde alguns minutos e tente novamente.',
        code: 'checkout_rate_limited'
      });
    }

    current.count += 1;
    attempts.set(key, current);
    return next();
  };
}

module.exports = { createCheckoutRateLimit };
