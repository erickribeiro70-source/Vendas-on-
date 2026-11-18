'use strict';
const EVENTS=new Set(['home_view','catalog_view','recipe_view','guide_view','offer_view','offer_click','checkout_submit','checkout_open','checkout_error']);
const SOURCES=new Set(['instagram','facebook','threads','whatsapp','tiktok','youtube','direct']);
function validEvent(body){
 return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(k=>['event','source','test'].includes(k))&&EVENTS.has(body.event)&&SOURCES.has(body.source)&&typeof body.test==='boolean';
}
function createEventHandler({site,log=console.info}){
 const budgets=new Map();
 return async function eventHandler(req,res){
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.headers.origin!==site)return reply(403,{error:'Origem não permitida'});
  if(req.headers['content-type']?.split(';',1)[0].trim().toLowerCase()!=='application/json')return reply(415,{error:'Envie JSON'});
  if(Number(req.headers['content-length'])>1024)return reply(413,{error:'Evento acima do limite'});
  const now=Date.now();
  for(const [key,state] of budgets)if(state.until<=now)budgets.delete(key);
  // Transient connection addresses are used only for abuse limits, never logged.
  const key=req.socket.remoteAddress||'unknown';
  const state=budgets.get(key)||{count:0,until:now+60000};
  if(state.count>=120||(!budgets.has(key)&&budgets.size>=2000))return reply(429,{error:'Aguarde um minuto'});
  state.count++;budgets.set(key,state);
  try{
   const chunks=[];let bytes=0;
   for await(const chunk of req.iterator({destroyOnReturn:false})){
    bytes+=chunk.length;
    if(bytes>1024){req.resume();return reply(413,{error:'Evento acima do limite'});}
    chunks.push(chunk);
   }
   const event=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!validEvent(event))return reply(400,{error:'Evento inválido'});
   // Only the two allowlisted fields enter provider-retained operational logs.
   // No cookies, fingerprints, emails, URLs, text, IPs or payment records.
   if(!event.test)log('BV_EVENT '+JSON.stringify({event:event.event,source:event.source}));
   return reply(202,{accepted:true,recorded:!event.test});
  }catch{return reply(400,{error:'Evento inválido'});}
 };
}
module.exports={validEvent,createEventHandler};
