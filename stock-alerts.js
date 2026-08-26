const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ALERTS = path.join(DATA, 'stock-alerts.json');
const PRODUCTS = path.join(DATA, 'products.json');
const inFlight = new Set();
const attempts = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 8;

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase().slice(0, 180);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[c]);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function rateAllowed(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const current = (attempts.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (current.length >= RATE_LIMIT) {
    attempts.set(ip, current);
    return false;
  }
  current.push(now);
  attempts.set(ip, current);
  return true;
}

function productLink(product) {
  const base = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return base ? `${base}/produto.html?id=${encodeURIComponent(product.id)}` : '';
}

function emailHtml(product) {
  const link = productLink(product);
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f5f3ef;padding:28px;color:#171717"><div style="max-width:620px;margin:auto;background:#fff;padding:30px;border:1px solid #ddd"><h2 style="margin-top:0">Relógio e Cia</h2><p>O relógio que você estava esperando voltou ao estoque.</p><h3 style="margin:20px 0 6px">${esc(product.nome || product.sku || 'Produto')}</h3><p style="color:#666;margin-top:0">Ref. ${esc(product.sku || '')}</p>${link ? `<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 20px">Ver produto</a></p>` : ''}<p style="font-size:12px;color:#777;margin-top:26px">Você recebeu este e-mail porque pediu para ser avisado quando este produto voltasse ao estoque. O aviso não reserva a unidade.</p></div></body></html>`;
}

async function sendPendingForProduct(product) {
  const productId = String(product?.id || '');
  if (!productId || inFlight.has(productId)) return;
  if (product?.ativo === false || Number(product?.estoque || 0) <= 0) return;

  inFlight.add(productId);
  try {
    const alerts = read(ALERTS, []);
    if (!Array.isArray(alerts)) return;
    const pending = alerts.filter(item => String(item?.product_id) === productId && item?.status === 'pending');
    if (!pending.length) return;

    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const from = String(process.env.RESEND_FROM || '').trim();
    if (!apiKey || !from) {
      console.log('Avisos de reposição aguardando configuração do Resend.', { productId, pendentes: pending.length });
      return;
    }

    let changed = false;
    for (const alert of pending) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [alert.email],
            subject: `${product.nome || 'Produto'} voltou ao estoque — Relógio e Cia`,
            html: emailHtml(product)
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.warn('Aviso de reposição não enviado', {
            productId,
            statusCode: response.status,
            message: data?.message || data?.name || 'erro do provedor'
          });
          continue;
        }

        alert.status = 'sent';
        alert.sent_at = new Date().toISOString();
        alert.provider_id = data?.id || null;
        changed = true;
      } catch (error) {
        console.warn('Falha não bloqueante no aviso de reposição', { productId, message: error.message });
      }
    }

    if (changed) {
      write(ALERTS, alerts);
      await flushPersistentStore();
    }
  } finally {
    inFlight.delete(productId);
  }
}

function queueStockAvailableEmails(product) {
  const snapshot = product ? { ...product } : null;
  setImmediate(() => { sendPendingForProduct(snapshot).catch(() => {}); });
}

function registerStockAlertRoutes(app) {
  app.post('/api/stock-alerts', express.json({ limit: '20kb' }), async (req, res) => {
    try {
      if (!rateAllowed(req)) {
        return res.status(429).json({ error: 'Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.' });
      }

      const productId = Number(req.body?.product_id);
      const email = cleanEmail(req.body?.email);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ error: 'Produto inválido.' });
      if (!email) return res.status(400).json({ error: 'Informe um e-mail válido.' });

      const products = read(PRODUCTS, []);
      const product = Array.isArray(products) ? products.find(item => Number(item?.id) === productId) : null;
      if (!product || product.ativo === false) return res.status(404).json({ error: 'Produto não encontrado.' });
      if (Number(product.estoque || 0) > 0) {
        return res.status(409).json({ error: 'Este produto já está disponível. Atualize a página para comprar.' });
      }

      const alerts = read(ALERTS, []);
      const list = Array.isArray(alerts) ? alerts : [];
      const duplicate = list.find(item => Number(item?.product_id) === productId && item?.email === email && item?.status === 'pending');
      if (duplicate) {
        return res.json({ ok: true, already_registered: true, message: 'Seu e-mail já está cadastrado para este produto.' });
      }

      list.push({
        id: crypto.randomUUID(),
        product_id: productId,
        sku: String(product.sku || '').trim(),
        product_name: String(product.nome || '').trim(),
        email,
        status: 'pending',
        created_at: new Date().toISOString(),
        sent_at: null,
        provider_id: null
      });
      write(ALERTS, list);
      await flushPersistentStore();
      return res.status(201).json({ ok: true, message: 'Pronto. Avisaremos por e-mail quando este produto voltar ao estoque.' });
    } catch (error) {
      console.error('Erro ao cadastrar aviso de reposição:', error.message);
      return res.status(500).json({ error: 'Não foi possível cadastrar o aviso agora. Tente novamente.' });
    }
  });
}

module.exports = { registerStockAlertRoutes, queueStockAvailableEmails };
