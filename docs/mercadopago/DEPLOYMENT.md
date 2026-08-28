# Deploy e rollback — Mercado Pago

## Estado seguro anterior

Commit preservado antes da refatoração:

`c82610ada89d12aa87101766b80727412ab2e15d`

Branch de backup:

`backup-before-mp-audit-2026-08-28-c82610a`

Nunca apagar essa branch durante a fase de testes.

## Validação antes do deploy

Executar:

```bash
npm install
npm test
npm run test:payments
node --check mercadopago-core.js
node --check mercadopago-clean.js
node --check coupon-checkout.js
node --check auth-bootstrap.js
```

O GitHub Actions executa essas validações automaticamente na branch de auditoria.

## Render

O `render.yaml` continua usando a inicialização Node existente:

- build: `npm install`
- start: `npm start`

O Dockerfile foi adicionado como ambiente reproduzível auxiliar e não altera o modo atual de deploy do Render.

## Ambiente de teste recomendado

Para seguir o roteiro oficial do Mercado Pago sem misturar transações reais e testes, use um ambiente/serviço separado ou uma janela controlada de manutenção com:

- branch de auditoria;
- `MERCADOPAGO_ENV=test`;
- Public Key de teste;
- Access Token de teste;
- URL HTTPS do ambiente;
- conta de teste comprador.

Não copie credenciais para GitHub.

## Produção

Depois de passar pelos cenários de teste:

- voltar para `MERCADOPAGO_ENV=production`;
- usar Public Key e Access Token da seção Produção da aplicação;
- confirmar Webhook de produção e sua chave secreta;
- confirmar `PUBLIC_URL` HTTPS;
- fazer uma transação real legítima de validação.

## Rollback

Se a nova versão apresentar regressão, restaurar a branch de deploy para:

`c82610ada89d12aa87101766b80727412ab2e15d`

Isso devolve o código versionado ao estado exato anterior à auditoria.

Variáveis de ambiente do Render não fazem parte do Git e devem ser restauradas separadamente se forem alteradas durante o teste.

## Verificações humanas obrigatórias

- selecionar manualmente credenciais de teste ou produção no painel Mercado Pago;
- confirmar que Public Key e Access Token pertencem à mesma aplicação/ambiente;
- criar/usar a conta comprador de teste;
- executar a compra oficial `APRO` em janela anônima;
- usar a função Webhooks > Simular para testar a notificação em ambiente de teste;
- fazer uma transação real somente após os testes;
- conferir o Payment ID no painel Mercado Pago caso haja nova recusa.
