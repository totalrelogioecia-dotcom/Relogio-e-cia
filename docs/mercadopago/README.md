# Mercado Pago — Relógio e Cia

## Arquitetura atual

### Cartão

- Solução: **Checkout Pro via Preferences API**.
- Backend: `mercadopago-clean.js`.
- Código compartilhado/SDK: `mercadopago-core.js`.
- Frontend: `mercadopago-checkout-client.js`.
- Abertura do checkout: Wallet Brick usando `preference_id`.
- Atualização de pedido: Webhook de pagamento + consulta de pagamento pelo backend.

### PIX

O site mantém o fluxo PIX existente. Ele é tratado antes do Checkout Pro pelo módulo `mercadopago-orders-pix.js`. A refatoração do cartão foi feita sem trocar o mecanismo do PIX que já havia sido validado com pagamento aprovado.

### Cupom de frete grátis

`coupon-checkout.js` preserva a validação do cupom no servidor. Para cartão, cria a preferência com o mesmo padrão explícito de payer e Device ID usado pelo checkout sem cupom.

## Segurança

- Access Token somente no backend.
- Public Key pode ser entregue ao frontend por `/api/mercadopago/config`.
- Webhook Secret somente no backend.
- Preço, estoque, cupom e frete são recalculados/validados no servidor.
- Estado do pagamento é confirmado no backend; a URL de retorno não é fonte de verdade.
- O SDK oficial valida a assinatura do Webhook.
- O projeto não modifica protótipos do SDK Mercado Pago.

## Variáveis

Ver `.env.example`.

Principais:

- `MERCADOPAGO_ENV=test|production`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_PUBLIC_KEY`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_STATEMENT_DESCRIPTOR`
- `PUBLIC_URL`

`MERCADOPAGO_ENV` é um marcador operacional do próprio projeto. A credencial correta deve sempre ser conferida no painel Mercado Pago; o prefixo do Access Token não identifica com segurança se ele é de teste ou produção.

## Fluxo do cartão

1. Cliente autenticado finaliza o carrinho.
2. Frontend obtém Device ID do Mercado Pago.
3. Backend reconstrói o payer a partir da conta autenticada.
4. Backend valida CPF, endereço, produtos, estoque e frete.
5. Backend cria uma preferência nova.
6. `payer` é enviado explicitamente com os dados disponíveis.
7. Device ID é enviado pelo SDK como `meliSessionId`/`X-Meli-Session-Id`.
8. Backend devolve `preference_id`.
9. Frontend monta Wallet Brick.
10. Mercado Pago processa o checkout hospedado.
11. Webhook assinado ou sincronização posterior consulta o pagamento no backend.
12. Estoque só é baixado após `approved` e com proteção contra dupla baixa.

## Documentação complementar

- `AUDIT.md` — problemas encontrados e decisões.
- `TESTING.md` — roteiro de teste oficial.
- `TROUBLESHOOTING.md` — diagnóstico de recusas e falhas.

## Fontes oficiais

- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/how-tos/improve-payment-approval/recommendations
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
