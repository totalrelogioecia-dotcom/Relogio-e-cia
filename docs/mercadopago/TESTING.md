# Roteiro de testes — Mercado Pago Checkout Pro

Este roteiro segue a documentação oficial do Mercado Pago para **Checkout Pro via Preferences API**.

## 1. Separar teste e produção

### Ambiente de teste

No Render de teste, configurar:

- `MERCADOPAGO_ENV=test`
- `MERCADOPAGO_PUBLIC_KEY` = Public Key de teste da aplicação
- `MERCADOPAGO_ACCESS_TOKEN` = Access Token de teste da mesma aplicação
- `MERCADOPAGO_WEBHOOK_SECRET` = chave correspondente à URL/evento que será simulado
- `PUBLIC_URL` = URL HTTPS do ambiente que será testado

Nunca colocar Access Token ou Webhook Secret no frontend, GitHub ou arquivos versionados.

> Atenção: o Access Token de teste também pode começar com `APP_USR`. O prefixo não é uma forma confiável de distinguir teste de produção. Confira a seção correta em **Suas integrações**.

### Produção

Somente depois dos testes, usar as credenciais da seção **Produção** e configurar `MERCADOPAGO_ENV=production`.

## 2. Conta de teste comprador

1. Acessar Mercado Pago Developers > Suas integrações.
2. Abrir a aplicação usada pelo site.
3. Ir em **Contas de teste**.
4. Selecionar a conta **Comprador**.
5. Guardar usuário, senha e código de verificação da conta de teste.

Se for necessário outro país, a documentação orienta criar contas de teste vendedor e comprador para o país correspondente.

## 3. Compra de teste com cartão

O Mercado Pago recomenda realizar a compra em **janela anônima/privada** para evitar conflito entre credenciais reais e de teste.

Fluxo:

1. Configurar no ambiente apenas as credenciais de teste da aplicação.
2. Abrir uma janela anônima.
3. Entrar no Mercado Pago com a conta de teste comprador.
4. Abrir a loja no ambiente de teste.
5. Adicionar um produto com estoque suficiente.
6. Selecionar cartão.
7. Finalizar o pedido.
8. O backend cria uma nova preferência para esse pedido.
9. O frontend recebe `preference_id` e monta o Wallet Brick.
10. Continuar no Checkout Pro do Mercado Pago.
11. Usar um cartão oficial de teste e um cenário de titular.
12. Confirmar o estado retornado pelo Mercado Pago e o estado salvo no pedido.

## 4. Cartões de teste oficiais atuais

Conferir sempre a página oficial antes de testar, pois esses dados podem mudar.

- Mastercard crédito: `5480 8328 0103 3311` — CVV `123` — validade `11/30`
- Visa crédito: `4235 6477 2802 5682` — CVV `123` — validade `11/30`
- American Express crédito: `3753 651535 56885` — CVV `1234` — validade `11/30`
- Elo débito: `5067 7667 8388 8311` — CVV `123` — validade `11/30`

Para simular **aprovação**:

- Nome do titular: `APRO`
- CPF: `12345678909`

Outros cenários oficiais incluem `OTHE`, `CONT`, `CALL`, `FUND`, `SECU`, `EXPI`, `FORM`, `CARD`, `INST`, `DUPL`, `LOCK`, `CTNA`, `ATTE`, `BLAC`, `UNSU` e `TEST`.

## 5. O que validar na aprovação

Após um cenário `APRO`, conferir:

- preferência criada com um ID válido;
- Wallet Brick montado a partir de `preference_id`;
- `external_reference` igual ao ID interno do pedido;
- pagamento consultável pela API;
- status do pedido atualizado para `paid` quando o pagamento estiver `approved`;
- `payment_id` salvo;
- `payment_detail.status` igual a `approved`;
- baixa de estoque aplicada somente uma vez;
- valores do item, frete e total coerentes;
- retorno para a `back_url` correta.

## 6. Cenários de erro

Executar pelo menos:

- `APRO` — aprovado;
- `OTHE` — recusa geral;
- `CONT` — pendente;
- `FUND` — saldo insuficiente;
- `SECU` — código de segurança inválido;
- `INST` — parcelas inválidas.

Confirmar que uma recusa não baixa estoque e que estados pendentes continuam consultáveis pelo backend.

## 7. Webhooks

A implementação valida o Webhook com `WebhookSignatureValidator.validate` do SDK oficial e usa `data.id` da query string.

Importante: a documentação do Checkout Pro informa que **pagamentos criados com credenciais de teste não enviam notificações reais**. Para testar a recepção do Webhook:

1. Mercado Pago Developers > Suas integrações.
2. Abrir a aplicação.
3. Webhooks > Configurar notificações.
4. Configurar a URL HTTPS.
5. Selecionar evento **Pagamentos**.
6. Salvar.
7. Clicar em **Simular**.
8. Selecionar a URL e o evento.
9. Informar um Data ID apropriado.
10. Enviar o teste e conferir a resposta HTTP.

## 8. Device ID

O frontend carrega o SDK JavaScript do Mercado Pago e o script oficial de segurança. Quando um Device ID válido é obtido, ele é enviado ao backend e o SDK Node recebe o valor em `requestOptions.meliSessionId`, que corresponde ao header `X-Meli-Session-Id`.

Nos logs, conferir `device_id_sent: true` durante o teste de cartão.

## 9. Teste real de produção

Somente depois de o roteiro de teste passar:

1. Trocar para credenciais de produção da mesma aplicação correta.
2. Definir `MERCADOPAGO_ENV=production`.
3. Confirmar URL e Webhook de produção.
4. Fazer uma compra legítima de baixo valor em dispositivo e conta habituais.
5. Não usar VPN nem dados fictícios.
6. Conferir `live_mode`, `status`, `status_detail`, `external_reference`, `payment_id` e estoque.

Uma aprovação em teste valida a integração funcional, mas não garante aprovação de uma transação real, pois o antifraude de produção considera outros sinais.

## Fontes oficiais

- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-purchases
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/go-to-production
- https://www.mercadopago.com.br/developers/pt/docs/credentials
