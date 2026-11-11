# BemViver IA — agente de atendimento (somente testes)

Diretório: `bemviver-agent-test/`. Branch: `teste/agente-bemviver-v1`.

## O que funciona

- Interface responsiva em português na própria URL do serviço.
- API `POST /api/chat` com continuidade por histórico da sessão.
- Catálogo real de seis receitas do site oficial.
- Guia: PDF com 30 receitas por R$ 14,90, preço único.
- Encaminhamento de dúvidas de pagamentos ou reembolsos por e-mail.
- Limitação de taxa, validação das mensagens, nenhuma persistência de conversa.
- Modo demonstração sem credencial e modo opcional de IA generativa via Gemini.

## O que não faz

- Cobrar, criar pedidos, acessar Mercado Pago ou liberar o PDF.
- Enviar mensagens via WhatsApp/Gmail.
- Marcar consultas, criar agenda ou inventar horários.
- Diagnosticar doenças ou pedir dados pessoais sensíveis.
- Alterar os serviços existentes de produção.

## Teste local

Em Node >=20: `cd bemviver-agent-test && node tests.js && node server.js`. Abra `http://localhost:10000`.

## Render, serviço separado

- Plano `free`, branch `teste/agente-bemviver-v1`.
- Build: `cd bemviver-agent-test && node tests.js && node --check server.js && node --check client.js`.
- Start: `node bemviver-agent-test/server.js`.
- Variável: `NODE_ENV=testing`.
- Não copiar chaves de pagamento nem vincular com o checkout.
- Opcional: `GEMINI_API_KEY` apenas no Render e `GEMINI_MODEL=gemini-2.5-flash` após avaliar custo e dados enviados ao provedor.

## API

- `GET /`: demonstração
- `GET /health`: indicadores, sempre `checkoutEnabled:false`
- `GET /api/recipes`: receitas públicas
- `POST /api/chat`: JSON com `message` e `history` de `role: user|model` e `content`.
- Nenhum endpoint de Mercado Pago.

## Limitações

- Sem `GEMINI_API_KEY`, respostas guiadas por regras; não é IA generativa.
- Histórico existe apenas no navegador durante a sessão; não é armazenado pelo servidor.
- Sem reconhecimento de áudio, agenda, CRM ou integração comercial transacional.
- Serviço Render gratuito suspende após inatividade; não garante 24/7.
- Antes de produção: revisão de privacidade/LGPD, autenticação, monitoramento, moderação, custos e testes.
