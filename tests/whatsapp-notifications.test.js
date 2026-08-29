const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBrazilPhone,
  userOptedIn,
  buildTemplatePayload
} = require('../whatsapp-notifications');

test('normaliza telefone brasileiro para o formato internacional do WhatsApp', () => {
  assert.equal(normalizeBrazilPhone({ area_code: '51', number: '99999-1234' }), '5551999991234');
  assert.equal(normalizeBrazilPhone('55 51 99999-1234'), '5551999991234');
  assert.equal(normalizeBrazilPhone('9999'), null);
});

test('WhatsApp automático exige consentimento explícito do cliente', () => {
  assert.equal(userOptedIn({ whatsapp_opt_in: true }), true);
  assert.equal(userOptedIn({ whatsapp_opt_in: false }), false);
  assert.equal(userOptedIn({}), false);
});

test('payload usa mensagem template e não inclui credenciais', () => {
  const payload = buildTemplatePayload({
    to: '5551999991234',
    templateName: 'pedido_recebido',
    language: 'pt_BR',
    parameters: ['João', 'PED-123', 'R$ 500,00']
  });

  assert.deepEqual(payload, {
    messaging_product: 'whatsapp',
    to: '5551999991234',
    type: 'template',
    template: {
      name: 'pedido_recebido',
      language: { code: 'pt_BR' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'João' },
          { type: 'text', text: 'PED-123' },
          { type: 'text', text: 'R$ 500,00' }
        ]
      }]
    }
  });
  assert.equal(JSON.stringify(payload).includes('ACCESS_TOKEN'), false);
});
