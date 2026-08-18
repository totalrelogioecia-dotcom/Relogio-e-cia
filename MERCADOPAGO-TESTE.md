# Mercado Pago — modo de teste

O projeto mantém o comportamento atual de produção por padrão. Se `MERCADOPAGO_MODE` não estiver definido, o servidor continua usando `MERCADOPAGO_ACCESS_TOKEN` normalmente.

## Ativar o modo de teste no Render

Adicione/ajuste estas variáveis de ambiente:

```env
MERCADOPAGO_MODE=test
MERCADOPAGO_TEST_ACCESS_TOKEN=SEU_ACCESS_TOKEN_DE_TESTE
```

Se a aplicação do Mercado Pago usar uma chave de webhook diferente para os testes, também configure:

```env
MERCADOPAGO_TEST_WEBHOOK_SECRET=SUA_CHAVE_DE_WEBHOOK_DE_TESTE
```

Quando `MERCADOPAGO_TEST_WEBHOOK_SECRET` não existir, o projeto mantém `MERCADOPAGO_WEBHOOK_SECRET` como fallback.

## O que muda em `test`

- o backend passa a usar `MERCADOPAGO_TEST_ACCESS_TOKEN`;
- se o Mercado Pago devolver `sandbox_init_point`, o checkout usa essa URL de sandbox;
- pedidos criados durante o teste são marcados com `test_mode: true`;
- sincronizações e webhooks de teste atualizam o status do pedido sem baixar o estoque;
- o endpoint `GET /api/mercadopago/mode` informa o modo ativo sem expor credenciais.

## Voltar para produção

No Render, altere:

```env
MERCADOPAGO_MODE=production
```

ou remova `MERCADOPAGO_MODE`.

Nesse estado o projeto volta a usar o `MERCADOPAGO_ACCESS_TOKEN` já existente e as rotas normais de produção.

## Teste recomendado

Use a conta de teste comprador e os cartões de teste fornecidos pelo Mercado Pago. Faça o teste em janela anônima para evitar conflito entre a conta real e a conta de teste.
