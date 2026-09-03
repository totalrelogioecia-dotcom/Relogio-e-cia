function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

async function sendResendEmail({ to, subject, html, idempotencyKey, attachments } = {}) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM || '').trim();
  const recipient = cleanEmail(to);

  if (!apiKey || !from) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!recipient) {
    return { sent: false, reason: 'invalid_recipient' };
  }

  const body = {
    from,
    to: [recipient],
    subject: String(subject || 'Relógio e Cia').slice(0, 200),
    html: String(html || '')
  };

  if (Array.isArray(attachments) && attachments.length) {
    body.attachments = attachments
      .filter(item => item && item.filename && item.content)
      .slice(0, 5)
      .map(item => ({
        filename: String(item.filename).slice(0, 180),
        content: String(item.content)
      }));
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        sent: false,
        reason: 'provider_error',
        status: response.status,
        message: data?.message || data?.name || 'erro do provedor'
      };
    }
    return { sent: true, id: data?.id || null };
  } catch (error) {
    return {
      sent: false,
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      message: error?.message || 'falha de comunicação'
    };
  }
}

module.exports = { sendResendEmail, cleanEmail };
