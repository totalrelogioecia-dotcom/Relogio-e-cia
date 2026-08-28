# Auditoria Mercado Pago — Checkout Pro

Data: 2026-08-28

## Escopo

Esta auditoria cobre a integração atual da Relógio e Cia com **Mercado Pago Checkout Pro via Preferences API**, o fluxo PIX já existente, notificações Webhook, Device ID, dados do comprador, frete, cupons e sincronização de pedidos.

## Ponto de restauração

Antes da auditoria foi preservado o estado do projeto no commit:

`c82610ada89d12aa87101766b80727412ab2e15d`

Branch de backup:

`backup-before-mp-audit-2026-08-28-c82610a`

## Problemas encontrados na implementação anterior

1. O `auth-bootstrap.js` modificava `Preference.prototype.create` do SDK oficial para injetar `payer`, Device ID e capturar `init_point`.
2. O mesmo arquivo substituía `WebhookSignatureValidator.validate` por uma implementação própria.
3. A resposta de `/api/checkout` recebia `init_point` de forma indireta, fazendo o frontend redirecionar diretamente e frequentemente não usar o Wallet Brick apesar do log indicar o contrário.
4. Existiam arquivos de compatibilidade que também modificavam o SDK ou implementavam assinatura Webhook manualmente.
5. O checkout com cupom possuía uma segunda implementação de preferência e dependia dos mesmos patches ocultos para enviar Device ID e completar os dados do comprador.
6. O painel administrativo identificava a integração como `mercadopago-v2`, embora o fluxo atual seja Checkout Pro via Preferences API.

## Decisões da refatoração

- Usar somente classes e métodos públicos do SDK oficial `mercadopago`.
- Não modificar protótipos do SDK.
- Montar `payer` explicitamente na preferência.
- Enviar Device ID explicitamente por `requestOptions.meliSessionId`, que o SDK transforma no header `X-Meli-Session-Id`.
- Usar `WebhookSignatureValidator.validate` do SDK sem substituí-lo.
- Preservar `external_reference`, `back_urls`, `auto_return`, `notification_url`, frete, parcelamento e descriptor.
- Manter `binary_mode` desativado/ausente para não transformar estados intermediários em rejeição.
- Fazer o cartão usar o Wallet Brick a partir do `preference_id`.
- Manter o fluxo PIX funcional e com o mínimo de mudanças comportamentais.
- Manter validação de preços e estoque no servidor.

## Caso real em investigação

Pedido interno: `PED-1787877478963-7A9354`

Payment ID: `175964423352`

Resultado:

- `status: rejected`
- `status_detail: cc_rejected_high_risk`

A refatoração melhora rastreabilidade e garante que os dados recomendados pelo Mercado Pago sejam enviados de forma explícita. Ela **não garante** que uma nova tentativa real será aprovada, porque a decisão antifraude também depende de fatores internos do Mercado Pago, comprador, meio de pagamento, conta e dispositivo.

## Fontes oficiais

- Criar preferência: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- Referência da preferência: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post
- Melhorar aprovação: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/how-tos/improve-payment-approval/recommendations
- Notificações: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
- Teste de integração: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test
- Compras de teste: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-purchases
