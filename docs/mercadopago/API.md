# API interna — Mercado Pago

Esta documentação descreve os endpoints da Relógio e Cia relacionados ao pagamento. Não substitui a referência oficial da API Mercado Pago.

## `GET /api/mercadopago/config`

Entrega somente configuração segura necessária ao frontend.

Resposta esperada:

```json
{
  "integration": "checkout-pro-preferences-api",
  "environment": "test",
  "configured": true,
  "public_key": "PUBLIC_KEY",
  "webhook_secret_configured": true
}
```

O Access Token e o Webhook Secret nunca são retornados.

## `POST /api/checkout`

Requer cliente autenticado. O middleware substitui os dados sensíveis do `payer` pelos dados da conta autenticada antes de chegar ao módulo de pagamento.

### Cartão — corpo lógico

```json
{
  "items": [{ "id": 1, "qtd": 1 }],
  "metodo": "cartao",
  "shipping": {
    "service_id": "1",
    "postal_code": "00000000",
    "address_id": "endereco-id"
  },
  "device_id": "DEVICE_ID"
}
```

O browser não é fonte de verdade para preço, estoque ou payer.

### Resposta do cartão

```json
{
  "order_id": "PED-...",
  "preference_id": "..."
}
```

O frontend usa `preference_id` para montar o Wallet Brick.

### PIX

O PIX sem cupom é tratado pelo módulo existente `mercadopago-orders-pix.js`. A resposta inclui a URL interna para a página que exibe o QR Code.

## `POST /api/mercadopago/webhook`

Recebe notificações de pagamento. Para o evento `payment`, a integração principal:

1. lê `data.id` da query;
2. valida `x-signature` e `x-request-id` com `WebhookSignatureValidator.validate` do SDK oficial;
3. consulta o pagamento no Mercado Pago pelo backend;
4. vincula o pagamento ao pedido por `external_reference`;
5. atualiza o estado local;
6. aplica a baixa de estoque somente em `approved` e apenas uma vez.

Notificações de outros tipos não são usadas para aprovar pedidos.

## `GET /api/order/:id`

Retorna o estado seguro do pedido para a interface. Pedidos ainda pendentes podem ser sincronizados com o Mercado Pago pelo backend.

Campos típicos:

```json
{
  "id": "PED-...",
  "status": "pending",
  "payment_status": "pending",
  "payment_id": null,
  "metodo": "cartao",
  "preference_id": "...",
  "payment_detail": null,
  "checkout_error": null,
  "updated_at": "..."
}
```

## Fonte oficial Mercado Pago

- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
