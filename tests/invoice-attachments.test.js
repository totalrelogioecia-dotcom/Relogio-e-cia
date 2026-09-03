const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const ROOT = path.join(__dirname, '..');

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function adminToken(secret) {
  const body = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function base64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('Admin salva DANFE e XML separados do pedido e o Resend recebe os dois anexos', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-invoice-files-'));
  const ordersFile = path.join(tempDir, 'orders.json');
  const invoiceFilesFile = path.join(tempDir, 'invoice-files.json');
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    DATABASE_URL: process.env.DATABASE_URL
  };
  const originalFetch = global.fetch;
  const secret = 'invoice-files-test-secret';

  process.env.DATA_DIR = tempDir;
  process.env.ADMIN_SESSION_SECRET = secret;
  process.env.RESEND_API_KEY = 're_test_invoice_attachments';
  process.env.RESEND_FROM = 'Relógio e Cia <pedidos@example.com>';
  delete process.env.DATABASE_URL;

  fs.writeFileSync(ordersFile, JSON.stringify([{
    id: 'PED-NFE-FILES-1',
    payer: { nome: 'Cliente Fiscal', email: 'cliente@example.com' },
    status: 'paid',
    payment_status: 'approved',
    total: 799,
    invoice: {
      status: 'emitted',
      number: '98765',
      access_key: '12345678901234567890123456789012345678901234'
    }
  }], null, 2), 'utf8');

  delete require.cache[require.resolve('../persistent-store')];
  const { registerInvoiceFileRoutes } = fresh('../invoice-files');
  const app = express();
  registerInvoiceFileRoutes(app);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/admin/invoice-files/PED-NFE-FILES-1`;
  const authorization = `Bearer ${adminToken(secret)}`;

  t.after(async () => {
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    restoreEnv('DATA_DIR', previous.DATA_DIR);
    restoreEnv('ADMIN_SESSION_SECRET', previous.ADMIN_SESSION_SECRET);
    restoreEnv('RESEND_API_KEY', previous.RESEND_API_KEY);
    restoreEnv('RESEND_FROM', previous.RESEND_FROM);
    restoreEnv('DATABASE_URL', previous.DATABASE_URL);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF';
  const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe123"/></NFe></nfeProc>';
  const upload = await originalFetch(url, {
    method: 'PUT',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [
        { kind: 'danfe_pdf', filename: 'DANFE-98765.pdf', content_base64: base64(pdfContent) },
        { kind: 'nfe_xml', filename: 'NFe-98765.xml', content_base64: base64(xmlContent) }
      ]
    })
  });
  assert.equal(upload.status, 200);
  const uploadData = await upload.json();
  assert.equal(uploadData.files.length, 2);
  assert.equal(uploadData.files.some(file => file.content_base64), false);

  const stored = JSON.parse(fs.readFileSync(invoiceFilesFile, 'utf8'));
  assert.equal(stored['PED-NFE-FILES-1'].danfe_pdf.filename, 'DANFE-98765.pdf');
  assert.equal(stored['PED-NFE-FILES-1'].nfe_xml.filename, 'NFe-98765.xml');
  assert.equal(stored['PED-NFE-FILES-1'].danfe_pdf.content_base64, base64(pdfContent));
  assert.equal(stored['PED-NFE-FILES-1'].nfe_xml.content_base64, base64(xmlContent));

  const metadataResponse = await originalFetch(url, { headers: { Authorization: authorization } });
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.files.length, 2);
  assert.equal(JSON.stringify(metadata).includes('content_base64'), false);

  const invalidPdf = await originalFetch(url, {
    method: 'PUT',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [{ kind: 'danfe_pdf', filename: 'falso.pdf', content_base64: base64('isto não é pdf') }] })
  });
  assert.equal(invalidPdf.status, 400);
  assert.match((await invalidPdf.json()).error, /PDF válido/i);

  const calls = [];
  global.fetch = async (resendUrl, options = {}) => {
    calls.push({ url: String(resendUrl), options });
    return { ok: true, status: 200, json: async () => ({ id: `invoice-files-email-${calls.length}` }) };
  };

  const { sendInvoiceEmail } = fresh('../invoice-email');
  await sendInvoiceEmail('PED-NFE-FILES-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.attachments.length, 2);
  assert.deepEqual(payload.attachments.map(file => file.filename).sort(), ['DANFE-98765.pdf', 'NFe-98765.xml'].sort());
  assert.equal(payload.attachments.find(file => file.filename.endsWith('.pdf')).content, base64(pdfContent));
  assert.equal(payload.attachments.find(file => file.filename.endsWith('.xml')).content, base64(xmlContent));
  assert.match(payload.html, /DANFE em PDF/);
  assert.match(payload.html, /XML da NF-e/);

  const savedOrder = JSON.parse(fs.readFileSync(ordersFile, 'utf8'))[0];
  assert.ok(savedOrder.notifications.invoice_email_sent_at);
  assert.ok(savedOrder.notifications.invoice_email_signature);

  await sendInvoiceEmail('PED-NFE-FILES-1');
  assert.equal(calls.length, 1, 'o mesmo conjunto de arquivos não deve gerar e-mail duplicado');

  const removal = await originalFetch(`${url}/danfe_pdf`, {
    method: 'DELETE',
    headers: { Authorization: authorization }
  });
  assert.equal(removal.status, 200);
  const removalData = await removal.json();
  assert.equal(removalData.files.length, 1);
  assert.equal(removalData.files[0].kind, 'nfe_xml');

  const orderAfterRemoval = JSON.parse(fs.readFileSync(ordersFile, 'utf8'))[0];
  assert.ok(orderAfterRemoval.notifications.invoice_email_attachment_removed_at);
  assert.notEqual(orderAfterRemoval.notifications.invoice_email_signature, savedOrder.notifications.invoice_email_signature);

  await sendInvoiceEmail('PED-NFE-FILES-1');
  assert.equal(calls.length, 1, 'remover anexo não deve reenviar um e-mail que já foi entregue');
});

test('painel carrega somente o cliente de anexos e mantém o armazenamento fiscal fora dos arquivos públicos', () => {
  const adminHtml = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const client = fs.readFileSync(path.join(ROOT, 'admin-invoice-files.js'), 'utf8');
  const policy = fs.readFileSync(path.join(ROOT, 'public-static-policy.js'), 'utf8');
  const backend = fs.readFileSync(path.join(ROOT, 'invoice-files.js'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(ROOT, 'auth-bootstrap.js'), 'utf8');
  const persistence = fs.readFileSync(path.join(ROOT, 'persistent-store.js'), 'utf8');

  assert.match(adminHtml, /admin-invoice-files\.js\?v=1/);
  assert.match(client, /DANFE em PDF/);
  assert.match(client, /XML da NF-e/);
  assert.match(client, /\/api\/admin\/invoice-files\//);
  assert.match(policy, /^\s*'admin-invoice-files\.js',/m);
  assert.doesNotMatch(policy, /^\s*'invoice-files\.js',/m);
  assert.match(backend, /4 \* 1024 \* 1024/);
  assert.match(backend, /MAX_TOTAL_BYTES = 5 \* 1024 \* 1024/);
  assert.match(backend, /%PDF-/);
  assert.match(backend, /nfeProc\|NFe/);
  assert.match(backend, /markRemovalAsCurrent/);
  assert.match(bootstrap, /registerInvoiceFileRoutes\(app\)/);
  assert.match(persistence, /invoice-files\.json/);
  assert.match(persistence, /invoice_files/);
});
