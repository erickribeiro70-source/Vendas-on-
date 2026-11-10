'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const nodePath=require('node:path');
const crypto=require('node:crypto');
const {URL}=require('node:url');
const SITE='https://bemviver-ia.onrender.com';
const HOST=process.env.PUBLIC_API_URL||'https://bemviver-ia-api.onrender.com';
// Remover caracteres de colagem sem imprimir a credencial secreta.
const TOKEN_INPUT=String(process.env.MP_ACCESS_TOKEN||'');
const TOKEN=TOKEN_INPUT.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim().replace(/^Bearer\s+/i,'').trim();
console.info('Mercado Pago credential format diagnostic',JSON.stringify({
  configured:TOKEN.length>20,
  hasProductionPrefix:/^APP_USR-/.test(TOKEN),
  hadOuterWhitespace:TOKEN_INPUT!==TOKEN_INPUT.trim(),
  hadWrappingQuotes:/^(['"])[\s\S]*\1$/.test(TOKEN_INPUT.trim()),
  hadBearerPrefix:/^Bearer\s+/i.test(TOKEN_INPUT.trim())
}));
const SECRET=process.env.DELIVERY_SIGNING_KEY||'';
// Normaliza apenas caracteres de colagem em variáveis de ambiente. Nunca registra credenciais.
const WEBHOOK_SECRET_RAW=String(process.env.MP_WEBHOOK_SECRET||'');
const WHSECRET=WEBHOOK_SECRET_RAW.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
console.info('Webhook configuration diagnostic',JSON.stringify({
 configured:WHSECRET.length>0,
 secretLengthClass:WHSECRET.length===0?'absent':WHSECRET.length<16?'short':WHSECRET.length<32?'medium':'long',
 hadOuterWhitespace:WEBHOOK_SECRET_RAW!==WEBHOOK_SECRET_RAW.trim(),
 hadWrappingQuotes:/^(['"])[\s\S]*\1$/.test(WEBHOOK_SECRET_RAW.trim()),
 looksLikeAccessToken:/^(APP_USR-|TEST-|Bearer\\s)/i.test(WHSECRET),
 sameAsAccessToken:WHSECRET.length>0&&WHSECRET===TOKEN,
 sameAsDeliveryKey:WHSECRET.length>0&&WHSECRET===SECRET
}));
const WEBHOOK_SECRET_VALID=WHSECRET.length>=16&&!/^(APP_USR-|TEST-|Bearer\s)/i.test(WHSECRET)&&WHSECRET!==TOKEN&&WHSECRET!==SECRET;
const PRICE='14.90';
function pdf(){
  const b64=process.env.GUIDE_PDF_BASE64||Array.from({length:12},(_,i)=>process.env['GUIDE_PDF_PART_'+(i+1)]||'').join('');
  if(!b64)return null;
  const b=Buffer.from(b64,'base64');
  if(!(b.length>200&&b.length<15000000&&b.subarray(0,5).toString()==='%PDF-'))return null;
  const expected=String(process.env.GUIDE_PDF_SHA256||'').trim().toLowerCase();
  if(expected&&(!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(b).digest('hex')!==expected))return null;
  return b;
}
// O CPF só será divulgado depois de preenchido no Render e da autorização explícita
// BEMVIVER_PUBLISH_CPF=true. Não inclua CPF no repositório, URLs ou logs.
function publicSellerCpf(){
 const cpf=String(process.env.BEMVIVER_PUBLIC_CPF||'').replace(/\D/g,'');
 if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return null;
 for(let n=9;n<=10;n++){
  let soma=0;
  for(let i=0;i<n;i++)soma+=Number(cpf[i])*(n+1-i);
  if(((soma*10)%11)%10!==Number(cpf[n]))return null;
 }
 return cpf.slice(0,3)+'.'+cpf.slice(3,6)+'.'+cpf.slice(6,9)+'-'+cpf.slice(9);
}
function sellerDisclosureReady(){
 return process.env.BEMVIVER_PUBLISH_CPF==='true'&&!!publicSellerCpf();
}
function ready(){
 return process.env.ENABLE_CHECKOUT==='true'&&TOKEN.length>20&&SECRET.length>=32&&WEBHOOK_SECRET_VALID&&!!pdf()&&
 (process.env.BEMVIVER_SANDBOX_MODE==='true'?/^\d{6,16}$/.test(String(process.env.BEMVIVER_TEST_SELLER_ID||'')):sellerDisclosureReady());
}
function logReadiness(){
 // Diagnóstico operacional sem expor valores privados.
 console.info('BemViver sales readiness',JSON.stringify({
   checkoutFeatureEnabled:process.env.ENABLE_CHECKOUT==='true',
   paymentTokenConfigured:TOKEN.length>20,
   deliverySigningKeyConfigured:SECRET.length>=32,
   paidGuidePdfLoaded:!!pdf(),
   webhookSignatureConfigured:WEBHOOK_SECRET_VALID,
   sellerIdentityReady:process.env.BEMVIVER_SANDBOX_MODE==='true'?null:sellerDisclosureReady(),
   sellerCpfValuePresent:process.env.BEMVIVER_SANDBOX_MODE==='true'?null:!!String(process.env.BEMVIVER_PUBLIC_CPF||'').trim(),
   sellerCpfChecksumValid:process.env.BEMVIVER_SANDBOX_MODE==='true'?null:!!publicSellerCpf(),
   autoCheckoutReady:ready()
 }));
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function mac(s){return crypto.createHmac('sha256',SECRET).update(s).digest('hex');}
function makeTicket(ref,at){const b=Buffer.from(JSON.stringify({ref,at,exp:at+30*86400000})).toString('base64url');return b+'.'+mac(b);}
function parseTicket(t){
 if(!SECRET||typeof t!=='string'||t.length>1000)return null;
 const a=t.split('.');if(a.length!==2||!/^[0-9a-f]{64}$/.test(a[1]))return null;
 if(!crypto.timingSafeEqual(Buffer.from(mac(a[0])),Buffer.from(a[1])))return null;
 try{const p=JSON.parse(Buffer.from(a[0],'base64url').toString());return /^BV_[0-9a-f]{32}$/.test(p.ref)&&Number.isFinite(p.at)&&p.at<Date.now()+60000&&p.exp>Date.now()?p:null;}catch{return null;}
}
async function mp(path,method,body,key){
 const h={'Authorization':'Bearer '+TOKEN,'Accept':'application/json'};
 if(body)h['Content-Type']='application/json';if(key)h['X-Idempotency-Key']=key;
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),10000);
 try{const r=await fetch('https://api.mercadopago.com'+path,{method:method||'GET',headers:h,body:body?JSON.stringify(body):undefined,signal:ctl.signal});const j=await r.json().catch(()=>({}));if(!r.ok){const code=String(j.code||j.cause?.[0]?.code||j.error||'').replace(/[^a-z0-9_.-]/gi,'').slice(0,60);const requestId=String(r.headers.get('x-request-id')||'').replace(/[^a-z0-9-]/gi,'').slice(0,90);throw Error('Mercado Pago HTTP '+r.status+(code?' ['+code+']':'')+(requestId?' [x-request-id:'+requestId+']':''));}return j;}finally{clearTimeout(timer);}
}
// Diagnóstico sem cobranças: consultar somente a API de pagamentos do Checkout Pro.
async function gatewayPreflight(){
 if(process.env.MP_GATEWAY_PREFLIGHT==='true'){
  if(!TOKEN){console.warn('Gateway preflight: missing-token');}
  else{
   const qs=new URLSearchParams({external_reference:'BV_PREFLIGHT_NO_MATCH',limit:'1'});
   try{
    const response=await mp('/v1/payments/search?'+qs);
    console.info('Gateway payments preflight',JSON.stringify({authorized:true,searchResponseValid:Array.isArray(response.results),readOnly:true}));
   }catch(e){console.warn('Gateway payments preflight failed:',e.message);}
  }
 }
 // Teste opcional de permissão para criar uma preferência; não inicia nem confirma pagamento.
 // O link retornado nunca é divulgado, registrado ou enviado a compradores.
 if(process.env.MP_PREFERENCE_PREFLIGHT==='true'){
  if(!TOKEN){console.warn('Gateway preferences preflight: missing-token');return;}
  try{
   const preference=await mp('/checkout/preferences','POST',{
    items:[{id:'bemviver-validacao-sem-cobranca',title:'Validacao tecnica BemViver IA - nao comprar',quantity:1,currency_id:'BRL',unit_price:Number(PRICE)}],
    external_reference:'BV_TECHNICAL_TEST_'+crypto.randomBytes(8).toString('hex'),
    back_urls:{success:SITE,pending:SITE,failure:SITE},
    notification_url:HOST+'/webhooks/mercadopago'
   });
   console.info('Gateway preferences preflight',JSON.stringify({
    authorized:true,preferenceCreated:!!preference.id,checkoutUrlReturned:!!preference.init_point,
    paymentInitiated:false,preferenceLinkExposed:false,
    sandboxSellerVerified:process.env.BEMVIVER_SANDBOX_MODE==='true'?String(preference.collector_id||'')===String(process.env.BEMVIVER_TEST_SELLER_ID||''):null,
     productionSellerVerified:process.env.BEMVIVER_SANDBOX_MODE==='true'?null:(/^\d{6,16}$/.test(String(process.env.BEMVIVER_PRODUCTION_SELLER_ID||''))&&String(preference.collector_id||'')===String(process.env.BEMVIVER_PRODUCTION_SELLER_ID||''))
   }));
  }catch(e){console.warn('Gateway preferences preflight failed:',e.message);}
 }
}
async function hasPaid(p){
 const q=new URLSearchParams({external_reference:p.ref,limit:'30'});
 const r=await mp('/v1/payments/search?'+q);
 return Array.isArray(r.results)&&r.results.some(payment=>
   payment.external_reference===p.ref&&
   payment.status==='approved'&&
   payment.status_detail==='accredited'&&
   payment.currency_id==='BRL'&&
   Number(payment.transaction_amount)===14.9&&
   Number(payment.transaction_amount_refunded||0)===0&&
   Number(payment.transaction_details?.total_paid_amount)>=14.9
 );
}
function verifyWebhook(req,u){
 // Apenas códigos de diagnóstico; nunca registrar credenciais, assinaturas ou dados pessoais.
 const reject=(reason)=>{console.warn('Webhook rejected:',reason);return false;};
 const sig=String(req.headers['x-signature']||'');
 const ts=sig.match(/(?:^|,)\s*ts=(\d+)/)?.[1];
 const signature=sig.match(/(?:^|,)\s*v1=([a-f0-9]{64})/i)?.[1];
 const id=u.searchParams.get('data.id');
 const requestId=req.headers['x-request-id'];
 if(!WEBHOOK_SECRET_VALID)return reject('secret-not-valid');
 if(!ts||!signature||!id||!requestId)return reject('signature-fields-missing');
 // Algumas notificações informam ts em segundos; outras em milissegundos.
 const timestamp=Number(ts);
 const timestampMs=ts.length<=10?timestamp*1000:timestamp;
 if(!Number.isFinite(timestampMs)||Math.abs(Date.now()-timestampMs)>300000)return reject('timestamp-out-of-window');
 const check=crypto.createHmac('sha256',WHSECRET).update('id:'+id.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';').digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(check,'hex'),Buffer.from(signature,'hex')))return reject('invalid-hmac');
 return true;
}
function page(t){
 const safe=JSON.stringify(t);
 return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BemViver IA — Entrega</title><style>body{font:17px system-ui;background:#f3f8f3;color:#153f31;max-width:600px;margin:40px auto;padding:20px}main{background:white;padding:24px;border-radius:14px}a{color:#215d4b}#download a{display:inline-block;background:#215d4b;color:white;padding:12px;border-radius:8px}</style><main><h1>BemViver IA</h1><p id="msg">Consultando seu pagamento no Mercado Pago…</p><p id="download"></p><a href="'+SITE+'">Voltar ao site</a></main><script>const t='+safe+';let count=0;async function check(){try{const r=await fetch("/api/status?ticket="+encodeURIComponent(t));const j=await r.json();if(j.paid){document.getElementById("msg").textContent="Pagamento aprovado!";const a=document.createElement("a");a.href="/api/download?ticket="+encodeURIComponent(t);a.textContent="Baixar guia de 30 receitas";document.getElementById("download").replaceChildren(a);return;}document.getElementById("msg").textContent="Pagamento ainda não confirmado. Vamos consultar novamente.";}catch{document.getElementById("msg").textContent="Verificação indisponível. Atualize esta página.";}if(++count<60)setTimeout(check,10000)}check()</script></html>';
}

// Versão unificada: o mesmo serviço pode entregar o site e a API.
// Diretório público com lista fechada; credenciais e código de servidor nunca são servidos.
const PUBLIC_PAGES=new Map([
 ['/','index.html'],['/index.html','index.html'],['/comprar.html','comprar.html'],
 ['/divulgar.html','divulgar.html'],['/privacidade.html','privacidade.html'],
 ['/termos.html','termos.html'],['/robots.txt','robots.txt'],['/sitemap.xml','sitemap.xml']
]);
async function servePublicSite(req,res,pathName){
 const filename=PUBLIC_PAGES.get(pathName);
 if(req.method!=='GET'||!filename)return false;
 try{
  const filenameOnDisk=nodePath.join(__dirname,'..','bemviver',filename);
  const bytes=await fs.readFile(filenameOnDisk);
  const contentType=filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.xml')?'application/xml; charset=utf-8':'text/plain; charset=utf-8';
  res.writeHead(200,{
   'Content-Type':contentType,'Content-Length':bytes.length,
   'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
   'Cache-Control':filename.endsWith('.html')?'no-cache':'public, max-age=3600'
  });
  res.end(bytes);return true;
 }catch(e){
  console.error('Public site file unavailable:',filename,e.code||'read-error');
  json(res,503,{error:'Página temporariamente indisponível'});
  return true;
 }
}

const SANDBOX_CHECKOUT_PAGE="<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>BemViver IA - Compra simulada</title>\n<style>body{background:#f6faf5;color:#173e31;font:17px system-ui,-apple-system,sans-serif;margin:0;line-height:1.6}main{max-width:650px;margin:auto;padding:28px 18px}.card{background:white;padding:24px;border:1px solid #d7e8da;border-radius:18px}h1{line-height:1.2;margin:8px 0 20px;font-size:29px}.pill{font-size:13px;font-weight:900;letter-spacing:.06em;color:#245e4d}label{display:block;font-weight:700;margin-top:20px}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #9ab3a2;border-radius:9px;font:inherit}button{background:#245e4d;color:white;padding:15px 20px;border:0;border-radius:10px;font-size:17px;font-weight:800;margin-top:20px;width:100%;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.warning{background:#fff5d8;padding:15px;border-radius:9px;border-left:4px solid #c39029}#message{font-weight:700;min-height:1.5em}</style></head><body><main><div class=\"card\"><div class=\"pill\">AMBIENTE DE HOMOLOGAÇÃO - NÃO É VENDA REAL</div><h1>BemViver IA - Testar compra de R$ 14,90</h1><p>Esta página serve exclusivamente para testar o Checkout Pro do Mercado Pago. A entrega utiliza um PDF demonstrativo, e não o guia comercial.</p><p class=\"warning\">Use apenas a conta de <strong>comprador de teste</strong> e os cartões fictícios oficiais. Não use conta, CPF ou cartão reais. Abra o checkout em uma janela anônima para evitar conflitos de sessão.</p><p id=\"message\" role=\"status\" aria-live=\"polite\">Conferindo se o ambiente está preparado...</p><form id=\"buy\"><label for=\"email\">E-mail associado ao comprador de teste</label><input id=\"email\" type=\"email\" maxlength=\"254\" required placeholder=\"comprador-de-teste@exemplo.com\" autocomplete=\"off\"><button id=\"send\" type=\"submit\" disabled>Iniciar pagamento simulado</button></form><p style=\"font-size:13px\">O pagamento é confirmado pela API do Mercado Pago. O PDF demonstrativo só pode ser baixado após o status aprovado.</p></div></main><script>\nconst message=document.getElementById('message'),btn=document.getElementById('send');\nfetch('/health',{cache:'no-store'}).then(async r=>r.ok?r.json():null).then(s=>{if(s&&s.checkoutEnabled===true){btn.disabled=false;message.textContent='Ambiente preparado. Utilize apenas credenciais e cartão de teste.';}else{message.textContent='Checkout simulado ainda desativado. Nenhuma compra pode ser iniciada.';}}).catch(()=>{message.textContent='Servidor de teste indisponível.';});\ndocument.getElementById('buy').addEventListener('submit',async e=>{e.preventDefault();if(btn.disabled)return;btn.disabled=true;message.textContent='Criando pedido de teste...';try{const email=document.getElementById('email').value.trim();const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const j=await r.json();if(!r.ok||!j.checkoutUrl)throw Error('checkout-not-ready');const u=new URL(j.checkoutUrl);if(u.protocol!=='https:'||!(u.hostname==='mercadopago.com.br'||u.hostname.endsWith('.mercadopago.com.br')||u.hostname==='mercadopago.com'||u.hostname.endsWith('.mercadopago.com')))throw Error('invalid-checkout-url');window.location.assign(u.href);}catch{message.textContent='Falha na criação do checkout de teste. Nenhum pagamento foi iniciado.';btn.disabled=false;}});\n</script></body></html>";

const rate=new Map();
http.createServer(async(req,res)=>{
 const u=new URL(req.url,HOST),path=u.pathname;
 if(req.headers.origin===SITE){res.setHeader('Access-Control-Allow-Origin',SITE);res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 if(req.method==='GET'&&path==='/teste-compra'){
  if(process.env.BEMVIVER_SANDBOX_MODE!=='true')return json(res,404,{error:'Não encontrado'});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'"});
  return res.end(SANDBOX_CHECKOUT_PAGE);
 }
 if(req.method==='GET'&&path==='/public/identificacao')return json(res,200,{published:sellerDisclosureReady(),cpf:sellerDisclosureReady()?publicSellerCpf():null});
 if(req.method==='GET'&&path==='/health')return json(res,200,{name:'BemViver IA API',running:true,checkoutEnabled:ready(),pdfLoaded:!!pdf(),webhookConfigured:WEBHOOK_SECRET_VALID,sellerIdentityReady:process.env.BEMVIVER_SANDBOX_MODE==='true'?null:sellerDisclosureReady()});
 if(req.method==='POST'&&path==='/webhooks/mercadopago'){
  const authentic=verifyWebhook(req,u);
  // Registro operacional sem IDs, emails, tokens nem assinatura.
  if(authentic)console.info('Mercado Pago webhook authenticated: receipt only; payment approval requires API lookup');
  return authentic?json(res,200,{received:true}):json(res,401,{error:'Invalid signature'});
 }
 if(req.method==='POST'&&path==='/api/checkout'){
  if(!ready())return json(res,503,{error:'Checkout ainda não ativado. Nenhuma cobrança foi iniciada.'});
  const ip=req.socket.remoteAddress||'unknown',now=Date.now(),recent=(rate.get(ip)||[]).filter(t=>now-t<60000);
  if(recent.length>=8)return json(res,429,{error:'Muitas tentativas'});recent.push(now);rate.set(ip,recent);if(rate.size>2000)rate.clear();
  try{
   let data='';for await(const b of req){data+=b;if(data.length>8192)return json(res,413,{error:'Pedido grande demais'});}
   const email=String(JSON.parse(data).email||'').trim().toLowerCase();
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Informe e-mail válido'});
   const ref='BV_'+crypto.randomBytes(16).toString('hex'),ticket=makeTicket(ref,Date.now()),ret=HOST+'/retorno?ticket='+encodeURIComponent(ticket);
   const preference=await mp('/checkout/preferences','POST',{
    items:[{id:'bemviver-guia-30-receitas',title:'Guia Digital BemViver IA - 30 receitas',quantity:1,currency_id:'BRL',unit_price:Number(PRICE)}],
    payer:{email},external_reference:ref,
    back_urls:{success:ret,pending:ret,failure:ret},auto_return:'approved',
    notification_url:HOST+'/webhooks/mercadopago'
   });
   if(!preference.init_point)throw Error('Missing init_point');
   // Um checkout de teste nunca deve redirecionar se o token pertence a um vendedor real.
   if(process.env.BEMVIVER_SANDBOX_MODE==='true'&&String(preference.collector_id||'')!==String(process.env.BEMVIVER_TEST_SELLER_ID||'')){
    console.warn('Sandbox checkout blocked: seller identity mismatch');
    return json(res,503,{error:'Vendedor de teste não confirmado; checkout bloqueado'});
   }
   // Nunca redirecionar o comprador para uma conta vendedora diferente da configurada.
   if(process.env.BEMVIVER_SANDBOX_MODE!=='true'&&(!/^\d{6,16}$/.test(String(process.env.BEMVIVER_PRODUCTION_SELLER_ID||''))||String(preference.collector_id||'')!==String(process.env.BEMVIVER_PRODUCTION_SELLER_ID||''))){
    console.warn('Production checkout blocked: seller identity mismatch');
    return json(res,503,{error:'Vendedor não confirmado; checkout bloqueado'});
   }
   const checkoutDestination=new URL(preference.init_point);
   const hostname=checkoutDestination.hostname;
   if(checkoutDestination.protocol!=='https:'||!(hostname==='mercadopago.com'||hostname.endsWith('.mercadopago.com')||hostname==='mercadopago.com.br'||hostname.endsWith('.mercadopago.com.br')))throw Error('Unsafe init_point');
   return json(res,200,{checkoutUrl:preference.init_point,ticket});
  }catch(e){console.error('Checkout error',e.message);return json(res,502,{error:'Não foi possível iniciar o checkout'});}
 }
 if(req.method==='GET'&&path==='/retorno'){
  const p=parseTicket(u.searchParams.get('ticket'));if(!p)return json(res,403,{error:'Link inválido'});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'"});return res.end(page(u.searchParams.get('ticket')));
 }
 if(req.method==='GET'&&(path==='/api/status'||path==='/api/download')){
  const p=parseTicket(u.searchParams.get('ticket'));if(!p)return json(res,403,{error:'Link inválido ou expirado'});
  if(!TOKEN)return json(res,503,{error:'Servidor não configurado'});
  try{
   if(!await hasPaid(p))return json(res,path==='/api/download'?403:200,{paid:false});
   if(path==='/api/status')return json(res,200,{paid:true});
   const file=pdf();if(!file)return json(res,503,{error:'PDF indisponível'});
   res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':file.length,'Content-Disposition':'attachment; filename="BemViver_IA_Guia_30_Receitas.pdf"','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});return res.end(file);
  }catch(e){console.error('Payment lookup error',e.message);return json(res,503,{error:'Não foi possível verificar o pagamento'});}
 }
 if(await servePublicSite(req,res,path))return;
 return json(res,404,{error:'Não encontrado'});
}).listen(Number(process.env.PORT||10000),'0.0.0.0',()=>{logReadiness();console.log('BemViver IA API ready');void gatewayPreflight();});
