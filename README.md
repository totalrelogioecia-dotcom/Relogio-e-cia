# Relógio e Cia — loja com pagamentos e painel administrativo

Esta versão transforma o site estático em uma aplicação Node.js com:
- catálogo carregado do servidor;
- painel `/admin.html` para cadastrar, editar e ocultar produtos;
- estoque por produto;
- registro de pedidos;
- Checkout Pro do Mercado Pago para cartão e PIX;
- webhook com validação HMAC da assinatura do Mercado Pago;
- baixa de estoque após pagamento aprovado.
- desconto de 5% no Pix aplicado no valor enviado ao Mercado Pago.

## Webhook

Configure `MERCADOPAGO_WEBHOOK_SECRET` com a chave secreta gerada em Suas integrações > Webhooks. A loja valida `x-signature` antes de processar atualizações.

## Frete

A cotação automática por CEP ainda não está integrada. Para isso é necessário escolher um provedor de frete e configurar suas credenciais (por exemplo, Melhor Envio ou uma transportadora).

## O que falta configurar

Você precisa criar uma aplicação no Mercado Pago e colocar o **Access Token** no `.env`. O Access Token fica somente no servidor — nunca coloque essa chave no HTML ou JavaScript do navegador.

Crie `.env` a partir de `.env.example`:

```env
PORT=3000
PUBLIC_URL=https://www.seudominio.com.br
MERCADOPAGO_ACCESS_TOKEN=SEU_ACCESS_TOKEN
ADMIN_EMAIL=seuemail@dominio.com
ADMIN_PASSWORD=uma-senha-forte
ADMIN_SESSION_SECRET=uma-chave-aleatoria-muito-grande
```

`PUBLIC_URL` precisa ser uma URL HTTPS pública. O Mercado Pago exige HTTPS para as URLs de retorno e para notificações.

## Rodar no computador

Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

O painel fica em:

`http://localhost:3000/admin.html`

Para pagamento real, o endereço publicado precisa ser HTTPS e o `.env` precisa usar as credenciais de produção.

## Mercado Pago

O site usa o Checkout Pro. O cliente é enviado para o checkout seguro do Mercado Pago, onde pode pagar com cartão e PIX. O servidor cria uma preferência por pedido e recebe atualizações por webhook.

Documentação oficial:
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications

## Segurança

O painel possui autenticação no servidor. Não use os valores padrão do `.env.example`.

Para uma operação maior, recomendo trocar os arquivos JSON por PostgreSQL/MySQL, usar armazenamento de imagens (S3/Cloudinary etc.), implementar autenticação de clientes no servidor e adicionar proteção CSRF/rate limiting.
