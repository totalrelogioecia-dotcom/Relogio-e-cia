const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const CNPJ = '05583329000146';

function isValidCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  const digit = weights => {
    const sum = weights.reduce((total, weight, index) => total + numbers[index] * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (digit([5,4,3,2,9,8,7,6,5,4,3,2]) !== numbers[12]) return false;
  return digit([6,5,4,3,2,9,8,7,6,5,4,3,2]) === numbers[13];
}

test('CNPJ informado possui dígitos verificadores válidos', () => {
  assert.equal(isValidCnpj(CNPJ), true);
});

test('rodapé jurídico distingue nome fantasia, razão social e CNPJ', () => {
  const source = read('legal-footer.js');
  assert.match(source, /Nome fantasia:/);
  assert.match(source, /Relógio & Cia/);
  assert.match(source, /Razão social:/);
  assert.match(source, /Albernard Comércio de Relógios Ltda/);
  assert.match(source, /05\.583\.329\/0001-46/);
  assert.doesNotMatch(source, /Inscrição Estadual:/);
  assert.match(source, /trocas-estornos\.html/);
  assert.match(source, /politica-de-privacidade\.html/);
  assert.match(source, /termos-de-uso\.html/);
});

test('rodapé exibe Instagram e WhatsApp como botões e fixo em Atendimento', () => {
  const source = read('legal-footer.js');
  assert.match(source, /https:\/\/www\.instagram\.com\/relogio\.ecia\//);
  assert.match(source, /@relogio\.ecia/);
  assert.match(source, /footer-instagram-link/);
  assert.match(source, /https:\/\/wa\.me\/\$\{WHATSAPP_NUMBER\}/);
  assert.match(source, /555196311864/);
  assert.match(source, /footer-whatsapp-link/);
  assert.doesNotMatch(source, /footer-landline-link/);
  assert.match(source, /function replaceAttendancePhone/);
  assert.match(source, /tel:\+555137371597/);
  assert.match(source, /\(51\) 3737-1597/);
  assert.match(source, /phoneLink\.href = LANDLINE_HREF/);
  assert.match(source, /phoneLink\.textContent = LANDLINE_LABEL/);
  assert.match(source, /noopener noreferrer/);
});

test('principais páginas públicas carregam a identificação empresarial', () => {
  for (const file of ['index.html', 'produtos.html', 'produto.html', 'carrinho.html', 'conta.html', 'sobre.html', 'politica-de-privacidade.html', 'termos-de-uso.html']) {
    assert.match(read(file), /legal-footer\.js/, `${file} deve carregar legal-footer.js`);
  }
});

test('Política de Privacidade identifica controlador e cobre direitos LGPD essenciais', () => {
  const source = read('politica-de-privacidade.html');
  assert.match(source, /Albernard Comércio de Relógios Ltda/);
  assert.match(source, /05\.583\.329\/0001-46/);
  assert.match(source, /controladora dos dados pessoais/);
  assert.match(source, /confirmação da existência de tratamento/);
  assert.match(source, /acesso aos seus dados pessoais/);
  assert.match(source, /correção de dados incompletos/);
  assert.match(source, /portabilidade dos dados/);
  assert.match(source, /revogação do consentimento/);
  assert.match(source, /Autoridade Nacional de Proteção de Dados/);
  assert.match(source, /Resend e serviços de comunicação/);
});

test('Termos exibem fornecedor e direito de arrependimento em 7 dias', () => {
  const source = read('termos-de-uso.html');
  assert.match(source, /Identificação do fornecedor/);
  assert.match(source, /05\.583\.329\/0001-46/);
  assert.match(source, /7 dias corridos/);
  assert.match(source, /não depende de defeito ou justificativa/);
  assert.match(source, /trocas-estornos\.html#solicitar/);
});

test('pós-venda deixa o arrependimento operacional e confirma protocolo', () => {
  const source = read('return-request-form.js');
  assert.match(source, /Direito de arrependimento: 7 dias/);
  assert.match(source, /Devolução \/ arrependimento \(compra online\)/);
  assert.match(source, /não gera ônus ao consumidor/);
  assert.match(source, /protocolo confirma imediatamente|protocolo gerado pelo próprio site confirma imediatamente/i);
  assert.match(source, /em até 5 dias/);
  assert.match(source, /legal-footer\.js/);
});
