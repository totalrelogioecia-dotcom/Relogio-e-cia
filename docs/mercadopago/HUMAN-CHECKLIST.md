# Checklist humano — antes da produção

## Prioridade 1 — teste oficial do cartão

- [ ] No Mercado Pago, abrir **Suas integrações > aplicação > Testes > Credenciais de teste**.
- [ ] Confirmar Public Key e Access Token de teste da mesma aplicação.
- [ ] Configurar essas duas credenciais no ambiente de teste do Render.
- [ ] Definir `MERCADOPAGO_ENV=test`.
- [ ] Obter a conta de teste **Comprador**.
- [ ] Abrir uma janela anônima.
- [ ] Entrar com a conta comprador de teste.
- [ ] Fazer uma compra com cartão oficial de teste.
- [ ] Usar titular `APRO` e CPF `12345678909` para o cenário aprovado.
- [ ] Confirmar pedido `paid`, pagamento `approved` e baixa única de estoque.

## Prioridade 2 — cenários negativos

- [ ] Testar `OTHE`.
- [ ] Testar `CONT`.
- [ ] Testar `FUND`.
- [ ] Testar `SECU`.
- [ ] Confirmar que recusas não baixam estoque.
- [ ] Confirmar que pendentes continuam sincronizáveis.

## Prioridade 3 — Webhook

- [ ] Configurar a URL HTTPS em Webhooks.
- [ ] Selecionar evento Pagamentos.
- [ ] Conferir a chave secreta correta no Render.
- [ ] Usar **Simular** no painel Mercado Pago.
- [ ] Confirmar resposta HTTP esperada.

Observação: pagamentos criados com credenciais de teste não enviam Webhooks reais; o teste de recepção deve ser feito pela ferramenta de simulação do Mercado Pago.

## Prioridade 4 — voltar para produção

- [ ] Substituir Public Key e Access Token pelas credenciais de produção.
- [ ] Definir `MERCADOPAGO_ENV=production`.
- [ ] Confirmar `PUBLIC_URL` HTTPS.
- [ ] Confirmar Webhook de produção e chave secreta.
- [ ] Fazer uma única compra real legítima de baixo valor.
- [ ] Usar dispositivo, conta e meio de pagamento habituais.
- [ ] Conferir `live_mode`, `payment_id`, `status`, `status_detail` e estoque.

## Se ocorrer `cc_rejected_high_risk` novamente

- [ ] Não repetir várias tentativas em sequência.
- [ ] Registrar Payment ID.
- [ ] Conferir no log se `device_id_sent: true`.
- [ ] Conferir se payer contém nome, e-mail, CPF, telefone/endereço quando disponíveis.
- [ ] Levar o Payment ID ao suporte Mercado Pago para análise dos sinais internos de risco.

## Rollback

Se houver regressão de integração, o código anterior está preservado em:

- commit `c82610ada89d12aa87101766b80727412ab2e15d`
- branch `backup-before-mp-audit-2026-08-28-c82610a`
