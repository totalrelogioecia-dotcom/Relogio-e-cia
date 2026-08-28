# Relógio e Cia — ecommerce Node.js

Aplicação da Relógio e Cia com catálogo, contas de clientes, painel administrativo, estoque, pedidos, frete, cupons e pagamentos.

## Stack

- Node.js 18+
- Express
- PostgreSQL para persistência do estado da aplicação
- Mercado Pago
- Melhor Envio
- Resend
- Render

## Mercado Pago

### Cartão

O cartão usa **Checkout Pro via Preferences API**.

Fluxo principal:

1. cliente autenticado inicia o checkout;
2. servidor reconstrói os dados do comprador a partir da conta;
3. servidor valida CPF, endereço, produtos, estoque, cupom e frete;
4. servidor cria uma preferência Mercado Pago;
5. frontend recebe `preference_id` e inicializa o Wallet Brick;
6. Mercado Pago processa o pagamento;
7. backend confirma o estado por Webhook/Payment API;
8. estoque é baixado somente depois de `approved` e apenas uma vez.

O projeto envia Device ID pelo mecanismo oficial do SDK (`meliSessionId` / `X-Meli-Session-Id`) quando disponível e envia os dados conhecidos do payer e dos produtos para melhorar a qualidade da análise de segurança.

### PIX

O PIX possui fluxo próprio e desconto de 5%. O estado do pedido e o estoque são atualizados no backend após a confirmação do pagamento.

### Webhooks

Configure `MERCADOPAGO_WEBHOOK_SECRET` com a chave secreta da aplicação. O endpoint `/api/mercadopago/webhook` usa `WebhookSignatureValidator.validate` do SDK oficial do Mercado Pago para validar notificações de pagamento.

A URL de retorno do navegador nunca é usada como fonte de verdade para aprovação.

## Frete

O site possui integração com Melhor Envio para cálculo e seleção do frete. O servidor revalida a opção escolhida antes de criar o pagamento. Também existe opção de retirada, que não adiciona custo de frete à preferência.

## Cupons

O checkout possui suporte a cupom de frete grátis, com validação no servidor antes da criação do pagamento.

## Segurança

- Access Token e Webhook Secret ficam somente no backend.
- A Public Key pode ser entregue ao frontend.
- preços e estoque são reconstruídos/validados no servidor;
- checkout exige sessão de cliente válida;
- CPF é validado antes do pagamento;
- webhook assinado é validado pelo SDK oficial;
- estoque possui proteção contra baixa duplicada;
- endpoint de checkout possui rate limit;
- logs de erro do Mercado Pago são sanitizados para não expor credenciais;
- painel administrativo possui autenticação no servidor.

## Variáveis de ambiente

Use `.env.example` somente como referência e nunca versione valores reais.

Principais variáveis Mercado Pago:

```env
PUBLIC_URL=https://seu-dominio.example
MERCADOPAGO_ENV=test
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_STATEMENT_DESCRIPTOR=RELOGIOECIA
```

`PUBLIC_URL` deve ser uma URL HTTPS pública.

## Desenvolvimento

```bash
npm install
npm start
```

Testes:

```bash
npm test
npm run test:payments
```

## Docker

Existe um `Dockerfile` com Node 20 para reproduzir o ambiente da aplicação. O deploy atual do Render continua podendo usar o `render.yaml` e `npm start`.

## Auditoria e testes Mercado Pago

A documentação específica está em `docs/mercadopago/`:

- `README.md` — arquitetura;
- `AUDIT.md` — auditoria e decisões da refatoração;
- `API.md` — endpoints internos;
- `TESTING.md` — roteiro oficial de testes;
- `TROUBLESHOOTING.md` — diagnóstico;
- `DEPLOYMENT.md` — deploy e rollback;
- `HUMAN-CHECKLIST.md` — etapas que dependem de validação humana.

## Rollback da auditoria de 2026-08-28

Estado preservado antes da refatoração Mercado Pago:

- commit: `c82610ada89d12aa87101766b80727412ab2e15d`
- branch: `backup-before-mp-audit-2026-08-28-c82610a`

## Documentação oficial Mercado Pago

- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/how-tos/improve-payment-approval/recommendations
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test
