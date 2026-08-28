# Troubleshooting — Mercado Pago

## `cc_rejected_high_risk`

Esse `status_detail` significa que o pagamento foi recusado pela análise de risco do Mercado Pago. Não deve ser tratado como erro de rede ou como aprovação pendente.

### O que verificar na integração

- preferência criada com `payer` completo dentro do que o site realmente conhece;
- CPF/documento coerente com o comprador;
- telefone quando disponível;
- endereço quando disponível;
- `date_created` da conta do comprador quando disponível;
- itens com ID/SKU, nome, descrição, quantidade, preço, imagem e categoria quando disponíveis;
- Device ID capturado e enviado como `X-Meli-Session-Id` por meio de `requestOptions.meliSessionId` do SDK;
- valores, frete e parcelas coerentes;
- credenciais pertencentes ao ambiente correto;
- `live_mode` do pagamento real;
- ausência de dados fictícios em tentativa de produção.

A documentação do Mercado Pago recomenda enviar o máximo de informações disponíveis sobre comprador e produto e destaca o Device ID como sinal importante para segurança e taxa de aprovação.

### O que NÃO fazer

- não repetir muitas tentativas seguidas com os mesmos dados após recusas;
- não alterar CPF, nome ou endereço para tentar enganar o antifraude;
- não habilitar `binary_mode` com o objetivo de “forçar” aprovação;
- não retirar dados reais do payer para tentar mudar o score;
- não expor Access Token, Webhook Secret ou dados completos do cartão nos logs;
- não considerar uma `back_url` de sucesso como confirmação de pagamento.

## Caso observado

Payment ID: `175964423352`

Pedido: `PED-1787877478963-7A9354`

Resultado:

- `status: rejected`
- `status_detail: cc_rejected_high_risk`

Esse caso deve ser comparado com um teste oficial `APRO` em ambiente de teste. Se o fluxo oficial passar e uma compra real legítima continuar recebendo `cc_rejected_high_risk`, o Payment ID deve ser levado ao suporte Mercado Pago para análise dos sinais internos que não são expostos pela API.

## Webhook não atualiza pedido

Verificar:

1. `PUBLIC_URL` é HTTPS e aponta para o serviço correto.
2. URL configurada no Mercado Pago termina em `/api/mercadopago/webhook`.
3. Evento Pagamentos está habilitado.
4. `MERCADOPAGO_WEBHOOK_SECRET` corresponde à configuração da aplicação/URL.
5. O request possui `x-signature`, `x-request-id` e `data.id` na query.
6. A simulação em Suas integrações recebe HTTP 200 quando válida.
7. O backend consegue consultar o Payment ID com o Access Token correspondente.

Pagamentos criados com credenciais de teste não enviam Webhooks reais. Use a função **Simular** no painel para testar a recepção.

## Checkout não abre

Verificar:

- `/api/mercadopago/config` retorna `configured: true`;
- `public_key` está presente;
- `preference_id` é retornado por `/api/checkout`;
- SDK JS `https://sdk.mercadopago.com/js/v2` carregou;
- Wallet Brick foi criado sem erro;
- navegador não está bloqueando scripts do Mercado Pago.

## Preferência falha

Verificar logs sanitizados do backend e confirmar:

- item com preço numérico válido;
- `PUBLIC_URL` HTTPS;
- payer válido;
- parcelas válidas para o total;
- credencial correta;
- campos suportados pela Preferences API.

## Fontes oficiais

- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/how-tos/improve-payment-approval/recommendations
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-purchases
