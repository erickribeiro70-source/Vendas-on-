'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createEventHandler}=require('./traffic-events');
async function main(){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',href:'',setAttribute(name,value){this[name]=value},addEventListener(){}});return nodes.get(id);};
 const source=fs.readFileSync(path.join(__dirname,'..','bemviver','checkout.js'),'utf8').replace(/^import .*?;\n/,'').replace('void checkSales();','');
 const pending={running:true,checkoutEnabled:true,pdfLoaded:true,webhookConfigured:true,sellerIdentityReady:true};
 const context=vm.createContext({document:{getElementById:node,querySelector:()=>({querySelector:()=>node('shortcut')})},track:()=>Promise.resolve(),AbortController,setTimeout:()=>1,clearTimeout:()=>{},fetch:async()=>({ok:true,json:async()=>pending})});
 vm.runInContext(source,context);
 await vm.runInContext('checkSales()',context);
 assert.equal(node('compra-automatica').hidden,false);
 assert.equal(node('botao-checkout').disabled,false);
 assert.match(node('estado-checkout').textContent,/Pague com segurança/);
 pending.pdfLoaded=false;await vm.runInContext('checkSales()',context);
 assert.equal(node('compra-automatica').hidden,true);
 assert.equal(node('botao-checkout').disabled,true);
 assert.equal(node('retry-checkout').hidden,false);
 context.fetch=async()=>{throw Error('offline')};await vm.runInContext('checkSales()',context);
 assert.match(node('estado-checkout').textContent,/Não conseguimos confirmar/);
 vm.runInContext("paintSales('loading')",context);
 assert.match(node('estado-checkout').textContent,/Conferindo/);
 assert.equal(node('compra-automatica').hidden,true);
 const logs=[];
 const handler=createEventHandler({site:'https://bemviver-ia.onrender.com',log:value=>logs.push(value)});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 const send=(body,origin='https://bemviver-ia.onrender.com')=>fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await send({event:'offer_view',source:'facebook',test:false})).status,202);
  assert.deepEqual(logs,['BV_EVENT {"event":"offer_view","source":"facebook"}']);
  const qa=await send({event:'checkout_open',source:'direct',test:true});assert.equal(qa.status,202);assert.equal((await qa.json()).recorded,false);assert.equal(logs.length,1);
  assert.equal((await send({event:'offer_view',source:'facebook',test:false,email:'test@example.invalid'})).status,400);
  assert.equal((await send({event:'payment_approved',source:'facebook',test:false})).status,400);
  assert.equal((await send({event:'offer_view',source:'https://unknown.invalid',test:false})).status,400);
  assert.equal((await send({event:'offer_view',source:'facebook',test:false},'https://unknown.invalid')).status,403);
  assert.equal(logs.length,1);
 }finally{await new Promise(r=>server.close(r));}
 console.log('Estados de compra, bloqueio em falhas, eventos sem dados pessoais e exclusão de QA: aprovados.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
