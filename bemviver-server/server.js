'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const nodePath=require('node:path');
const crypto=require('node:crypto');
const {URL}=require('node:url');
const SITE='https://bemviver-ia.onrender.com';
const HOST=process.env.PUBLIC_API_URL||'https://bemviver-ia-api.onrender.com';
const TOKEN=process.env.MP_ACCESS_TOKEN||'';
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
function ready(){return process.env.ENABLE_CHECKOUT==='true'&&TOKEN.length>20&&SECRET.length>=32&&WHSECRET.length>=16&&!!pdf();}
function logReadiness(){
 // Diagnóstico operacional sem expor valores privados.
 console.info('BemViver sales readiness',JSON.stringify({
   checkoutFeatureEnabled:process.env.ENABLE_CHECKOUT==='true',
   paymentTokenConfigured:TOKEN.length>20,
   deliverySigningKeyConfigured:SECRET.length>=32,
   paidGuidePdfLoaded:!!pdf(),
   webhookSignatureConfigured:WHSECRET.length>0,
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
 try{const r=await fetch('https://api.mercadopago.com'+path,{method:method||'GET',headers:h,body:body?JSON.stringify(body):undefined,signal:ctl.signal});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error('Mercado Pago HTTP '+r.status);return j;}finally{clearTimeout(timer);}
}
async function hasPaid(p){
 const q=new URLSearchParams({begin_date:new Date(p.at-3600000).toISOString(),end_date:new Date(Math.min(Date.now()+3600000,p.at+31*86400000)).toISOString(),external_reference:p.ref,page_size:'10'});
 const r=await mp('/v1/orders?'+q);
 return Array.isArray(r.data)&&r.data.some(o=>o.external_reference===p.ref&&o.status==='processed'&&o.status_detail==='accredited'&&o.currency==='BRL'&&Number(o.total_amount)===14.9&&Number(o.total_paid_amount)>=14.9);
}
function verifyWebhook(req,u){
 // Apenas códigos de diagnóstico; nunca registrar credenciais, assinaturas ou dados pessoais.
 const reject=(reason)=>{console.warn('Webhook rejected:',reason);return false;};
 const sig=String(req.headers['x-signature']||'');
 const ts=sig.match(/(?:^|,)\s*ts=(\d+)/)?.[1];
 const signature=sig.match(/(?:^|,)\s*v1=([a-f0-9]{64})/i)?.[1];
 const id=u.searchParams.get('data.id');
 const requestId=req.headers['x-request-id'];
 if(!WHSECRET)return reject('secret-not-configured');
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

const rate=new Map();
http.createServer(async(req,res)=>{
 const u=new URL(req.url,HOST),path=u.pathname;
 if(req.headers.origin===SITE){res.setHeader('Access-Control-Allow-Origin',SITE);res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 if(req.method==='GET'&&path==='/health')return json(res,200,{name:'BemViver IA API',running:true,checkoutEnabled:ready(),pdfLoaded:!!pdf(),webhookConfigured:WHSECRET.length>=16});
 if(req.method==='POST'&&path==='/webhooks/mercadopago')return verifyWebhook(req,u)?json(res,200,{received:true}):json(res,401,{error:'Invalid signature'});
 if(req.method==='POST'&&path==='/api/checkout'){
  if(!ready())return json(res,503,{error:'Checkout ainda não ativado. Nenhuma cobrança foi iniciada.'});
  const ip=req.socket.remoteAddress||'unknown',now=Date.now(),recent=(rate.get(ip)||[]).filter(t=>now-t<60000);
  if(recent.length>=8)return json(res,429,{error:'Muitas tentativas'});recent.push(now);rate.set(ip,recent);if(rate.size>2000)rate.clear();
  try{
   let data='';for await(const b of req){data+=b;if(data.length>8192)return json(res,413,{error:'Pedido grande demais'});}
   const email=String(JSON.parse(data).email||'').trim().toLowerCase();
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Informe e-mail válido'});
   const ref='BV_'+crypto.randomBytes(16).toString('hex'),ticket=makeTicket(ref,Date.now()),ret=HOST+'/retorno?ticket='+encodeURIComponent(ticket);
   const o=await mp('/v1/orders','POST',{type:'online',processing_mode:'manual',total_amount:PRICE,external_reference:ref,payer:{email},items:[{title:'Guia Digital BemViver IA - 30 receitas',unit_price:PRICE,quantity:1}],config:{online:{success_url:ret,pending_url:ret,failure_url:ret,auto_return:'all'}}},crypto.randomUUID());
   if(!o.checkout_url)throw Error('Missing checkout_url');
   const checkoutDestination=new URL(o.checkout_url);
   if(checkoutDestination.protocol!=='https:'||!(checkoutDestination.hostname==='mercadopago.com.br'||checkoutDestination.hostname.endsWith('.mercadopago.com.br')))throw Error('Unsafe checkout_url');
   return json(res,200,{checkoutUrl:o.checkout_url,ticket});
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
   if(!await hasPaid(p))return json(res,200,{paid:false});
   if(path==='/api/status')return json(res,200,{paid:true});
   const file=pdf();if(!file)return json(res,503,{error:'PDF indisponível'});
   res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':file.length,'Content-Disposition':'attachment; filename="BemViver_IA_Guia_30_Receitas.pdf"','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});return res.end(file);
  }catch(e){console.error('Payment lookup error',e.message);return json(res,503,{error:'Não foi possível verificar o pagamento'});}
 }
 if(await servePublicSite(req,res,path))return;
 return json(res,404,{error:'Não encontrado'});
}).listen(Number(process.env.PORT||10000),'0.0.0.0',()=>{logReadiness();console.log('BemViver IA API ready');});
