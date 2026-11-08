'use strict';
// Testes offline: respostas falsas de pagamento, sem rede e sem cobrancas.
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const secret='simulated-webhook-secret-only-not-real-12345';
const env={
  PORT:'0',
  ENABLE_CHECKOUT:'false',
  MP_ACCESS_TOKEN:'TEST-simulated-not-a-real-credential-123456789',
  DELIVERY_SIGNING_KEY:'mock-delivery-key-0123456789abcdefghijklmnopqrstuvwxyz',
  MP_WEBHOOK_SECRET:secret,
  GUIDE_PDF_BASE64:Buffer.from('%PDF-1.4\n'+'PDF MOCK TESTE OFFLINE '.repeat(18)).toString('base64')
};
let handler;
let paid=false;
let refunded=false;
let upstreamCalls=0;
let latestRef='';
const sandbox={
  process:{env},Buffer,URLSearchParams,AbortController,setTimeout,clearTimeout,
  console:{info(){},log(){},warn(){},error(){}},
  require(name){
    if(name==='node:http')return {createServer(fn){handler=fn;return {listen(_port,_host,fn){fn()}}}};
    return require(name);
  },
  async fetch(url,opts={}){
    upstreamCalls++;
    assert.ok(String(url).startsWith('https://api.mercadopago.com/'),'Somente API simulada');
    if(opts.method==='POST'&&String(url).endsWith('/v1/orders')){
      const order=JSON.parse(opts.body);
      latestRef=order.external_reference;
      assert.equal(order.total_amount,'14.90');
      return {ok:true,async json(){return {checkout_url:'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTST-MOCK'}}};
    }
    assert.ok(String(url).includes('/v1/orders?'),'Consulta de order esperada');
    const query=new URL(url).searchParams;
    assert.equal(query.get('external_reference'),latestRef);
    const order={
      external_reference:latestRef,
      status:refunded?'refunded':paid?'processed':'created',
      status_detail:paid&&!refunded?'accredited':'created',
      currency:'BRL',total_amount:'14.90',
      total_paid_amount:paid?'14.90':'0.00'
    };
    return {ok:true,async json(){return {data:[order]}}};
  }
};
new vm.Script(source+'\n;globalThis.__test={ready,makeTicket,parseTicket}',{filename:'server.js'}).runInNewContext(sandbox);
async function request(method,url,body='',headers={}){
  let status=null;
  let response;
  let resultHeaders={};
  const req={method,url,headers,socket:{remoteAddress:'127.0.0.1'},
    async *[Symbol.asyncIterator](){if(body)yield Buffer.from(JSON.stringify(body))}};
  const res={setHeader(k,v){resultHeaders[k]=v},
    writeHead(n,h={}){status=n;Object.assign(resultHeaders,h)},
    end(v=''){response=v}};
  await handler(req,res);
  return {status,headers:resultHeaders,body:response,
    json(){return JSON.parse(Buffer.isBuffer(response)?response.toString():response)}};
}
(async()=>{
  assert.equal(sandbox.__test.ready(),false);
  let r=await request('POST','/api/checkout',{email:'teste@example.com'});
  assert.equal(r.status,503,'Checkout bloqueado antes da ativacao');
  assert.equal(upstreamCalls,0,'Checkout bloqueado nao deve criar order');
  r=await request('GET','/api/download?ticket=invalid');
  assert.equal(r.status,403,'Nao permite download sem ticket valido');
  env.ENABLE_CHECKOUT='true';
  assert.equal(sandbox.__test.ready(),true);
  r=await request('POST','/api/checkout',{email:'teste@example.com'});
  assert.equal(r.status,200,'Criacao simulada de order');
  assert.ok(r.json().checkoutUrl.includes('mercadopago.com.br'));
  const ticket=r.json().ticket;
  assert.ok(sandbox.__test.parseTicket(ticket),'Ticket assinado valida');
  assert.ok(!sandbox.__test.parseTicket(ticket+'x'),'Ticket adulterado bloqueado');
  paid=false;
  r=await request('GET','/api/status?ticket='+encodeURIComponent(ticket));
  assert.equal(r.status,200);
  assert.equal(r.json().paid,false,'Pedido ainda pendente');
  r=await request('GET','/api/download?ticket='+encodeURIComponent(ticket));
  assert.equal(r.status,403,'PDF bloqueado sem pagamento');
  paid=true;
  r=await request('GET','/api/status?ticket='+encodeURIComponent(ticket));
  assert.equal(r.json().paid,true,'Pagamento aprovado e reconhecido');
  r=await request('GET','/api/download?ticket='+encodeURIComponent(ticket));
  assert.equal(r.status,200,'Entrega digital aprovada');
  assert.equal(r.headers['Content-Type'],'application/pdf');
  assert.ok(Buffer.isBuffer(r.body),'Arquivo PDF entregue');
  refunded=true;
  r=await request('GET','/api/download?ticket='+encodeURIComponent(ticket));
  assert.equal(r.status,403,'Reembolso nao permite entrega');
  const id='ORDTST-FAKE-123';
  const requestId='request-test-123';
  const ts=String(Date.now());
  const mac=crypto.createHmac('sha256',secret).update('id:'+id.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';').digest('hex');
  r=await request('POST','/webhooks/mercadopago?data.id='+id,'',{
    'x-request-id':requestId,'x-signature':'ts='+ts+',v1='+mac
  });
  assert.equal(r.status,200,'Webhook simulado com assinatura valida');
  r=await request('POST','/webhooks/mercadopago?data.id='+id,'',{
    'x-request-id':requestId,'x-signature':'ts='+ts+',v1='+'0'.repeat(64)
  });
  assert.equal(r.status,401,'Webhook com assinatura invalida bloqueado');
  console.log('BemViver: checkout, notificacao assinada, status e PDF aprovados em simulacao offline. Nenhuma cobranca realizada.');
})().catch(e=>{console.error(e);process.exitCode=1});