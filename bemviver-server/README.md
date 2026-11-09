# BemViver IA — servidor de pedidos e entrega digital

## Estado de preparação (sem cobranças automáticas)

O site público está em `bemviver/` e a API em `bemviver-server/`.
O serviço Render da API é `bemviver-ia-api`. O serviço `bemviver-ia`
é um *Static Site*: não deve receber webhooks.

**Manter `ENABLE_CHECKOUT=false` no Render até a revisão dos testes.**
Quando desativado, `POST /api/checkout` retorna HTTP 503 **sem criar pedido**
no Mercado Pago, e a opção de checkout integrado fica oculta no site.
O link manual externo `mpago.la` existe independentemente da API, mas foi removido das páginas públicas do BemViver IA enquanto os testes não forem aprovados. O bloqueio do servidor não desativa um link externo já distribuído.

## Variáveis de ambiente (guardar apenas no Render, nunca no GitHub)

- `ENABLE_CHECKOUT=false`: trava de segurança do checkout automático.
- `MP_ACCESS_TOKEN`: credencial da aplicação Mercado Pago adequada ao ambiente.
- `MP_WEBHOOK_SECRET`: assinatura secreta da configuração de Webhooks **da mesma
  aplicação e do mesmo ambiente (teste/produção)**; não é o Access Token.
- `DELIVERY_SIGNING_KEY`: chave aleatória privada com pelo menos 32 caracteres.
- `GUIDE_PDF_SHA256`: hash SHA-256 do PDF, usado para recusar conteúdo corrompido.
- `GUIDE_PDF_BASE64` **ou** `GUIDE_PDF_PART_1` ... `GUIDE_PDF_PART_12`:
  bytes do PDF privado codificados em Base64, sem espaços, divididos em
  partes sequenciais quando necessário. O PDF pago **não pode ser enviado ao
  repositório público**, nem à pasta pública do Static Site.
- `PUBLIC_API_URL=https://bemviver-ia-api.onrender.com`
- `MP_GATEWAY_PREFLIGHT=true` (opcional): no início do serviço, faz somente uma consulta de leitura a `GET /v1/payments/search` para verificar autorização. **Não cria pagamentos nem preferências**. Esse teste, mesmo bem-sucedido, não substitui a compra simulada de ponta a ponta.

Os nomes das variáveis ficam à esquerda no Render e seus valores à direita. `true` ou `false` são **valores**, nunca nomes de variáveis; uma variável avulsa chamada `true` não ativa o checkout.

### Importação do guia sem colocar o conteúdo no GitHub

Foi preparado o arquivo privado `BemViver_IA_importar_no_Render.env`, contendo
`GUIDE_PDF_SHA256` e 12 partes `GUIDE_PDF_PART_1` a `GUIDE_PDF_PART_12`.
Ele é distribuído **somente como anexo privado da conversa**, não pelo
repositório e não no site público. No Render, abra a página Environment do
serviço `bemviver-ia-api`, use **Add from .env** para importar o arquivo,
confira os nomes das 13 variáveis e salve com deploy.

**Não** importar no Static Site `bemviver-ia`, não publicar no GitHub e não
adicionar `ENABLE_CHECKOUT=true` ao arquivo. Caso a ferramenta solicite
colar o conteúdo manualmente, não colar em mensagens públicas.

O guia oficial tem 34 páginas. Antes de ativar, confirmar que o endpoint de
saúde informa `pdfLoaded:true`. Sem PDF válido, a API permanece bloqueada.

## Webhook Mercado Pago

- URL correta: `https://bemviver-ia-api.onrender.com/webhooks/mercadopago`.
- Evento: **Pagamentos (`payment`)** para a integração Checkout Pro via **Preferences API**. Não selecionar eventos exclusivos de Orders.
- O HMAC é calculado sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
  usando a assinatura privada. Resposta HTTP 401 indica rejeição da
  autenticação: verificar se a assinatura no Render corresponde àquela
  exibida no painel Mercado Pago para a **mesma** aplicação/ambiente.
- Não relaxar a validação de assinatura para fazer o teste ficar verde.
  O webhook confirma somente a autenticidade da notificação; ele **não libera o PDF**. Os endpoints `/api/status` e `/api/download` verificam diretamente o pagamento aprovado via **Payments API** (`GET /v1/payments/search`, filtrando `external_reference`) antes de conceder acesso.
- Configurar o webhook no painel da aplicação correta; **não** apontá-lo
  para `bemviver-ia.onrender.com`, pois esse endereço é o site estático.

## Pré-verificação sem criar pedidos nem cobrar

```sh
curl -sS https://bemviver-ia-api.onrender.com/health
# esperado antes da ativação: {"running":true,"checkoutEnabled":false,...}
curl -i -X POST https://bemviver-ia-api.onrender.com/api/checkout \
  -H 'Content-Type: application/json' \
  --data '{"email":"exemplo@example.com"}'
# esperado: HTTP 503, sem chamar o Mercado Pago
```

O servidor retorna `/health` sem credenciais privadas, indicando
`pdfLoaded`, `webhookConfigured` e `checkoutEnabled` para diagnosticar
prontidão de forma segura. `webhookConfigured=true` indica apenas que a
variável existe, não que a assinatura foi validada com um teste autêntico.

## Preparação para ativar no futuro

1. Instalar o PDF protegido no Render. Confirmar que não há arquivos pagos
   públicos no GitHub nem em `bemviver/`.
2. Conferir credenciais do Mercado Pago sem compartilhá-las no chat.
3. Verificar assinatura HMAC de um webhook genuíno de teste.
4. Testar o fluxo ponta a ponta com conta/comprador de teste, sem cobrança real,
   verificando a preferência criada via `POST /checkout/preferences`, o pagamento aprovado via Payments API, o retorno, `/api/status` e `/api/download`.
5. Revisar e autorizar **separadamente** a mudança para
   `ENABLE_CHECKOUT=true`. Só então exibir checkout automático para clientes.

A entrega automática atual é por **download após retorno ao site**; envio
automático por e-mail **não está implementado**.

Endpoints: `GET /health`, `POST /api/checkout`,
`GET /retorno?ticket=...`, `GET /api/status?ticket=...`,
`GET /api/download?ticket=...` e `POST /webhooks/mercadopago`.
