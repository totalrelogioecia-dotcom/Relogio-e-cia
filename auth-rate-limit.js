function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function createAuthRateLimit({ name, max, windowMs }) {
  const attempts = new Map();
  const limit = positiveInteger(max, 10);
  const interval = positiveInteger(windowMs, 15 * 60 * 1000);

  return function authRateLimit(req, res, next) {
    const now = Date.now();
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    let state = attempts.get(key);
    if (!state || state.resetAt <= now) state = { count: 0, resetAt: now + interval };
    state.count += 1;
    attempts.set(key, state);

    if (attempts.size > 5000) {
      for (const [entryKey, entry] of attempts) {
        if (entry.resetAt <= now) attempts.delete(entryKey);
      }
    }

    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(Math.max(0, limit - state.count)));
    if (state.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        code: `${name || 'auth'}_rate_limited`
      });
    }
    return next();
  };
}

module.exports = { createAuthRateLimit };
