# BemViver IA — Servidor de pagamentos
Este servidor fica isolado em `bemviver-server/` do repositório que já hospeda o site BemViver IA.
Não armazenar credenciais, PDF original ou chaves no GitHub.
Build Render: `cd bemviver-server && npm install --omit=dev`
Start Render: `node bemviver-server/server.js`
Variáveis privadas necessárias: `MP_ACCESS_TOKEN`, `DELIVERY_SIGNING_KEY` (mínimo 32 caracteres), `MP_WEBHOOK_SECRET`, `GUIDE_PDF_BASE64` (ou partes `GUIDE_PDF_PART_1` etc), `PUBLIC_API_URL` e `ENABLE_CHECKOUT`.
`ENABLE_CHECKOUT` deve permanecer `false` até credenciais, entrega do PDF e testes serem concluídos.
Endpoints: `GET /health`, `POST /api/checkout`, `GET /retorno?ticket=...`, `GET /api/status?ticket=...`, `GET /api/download?ticket=...` e `POST /webhooks/mercadopago`.
O PDF só é entregue após confirmação da ordem pelo Mercado Pago. A entrega é via link de download após retorno do checkout; envio por e-mail ainda não está implementado.
