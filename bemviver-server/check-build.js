'use strict';
// Offline checks: validate the actual browser modules and payment safeguards.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const root=path.join(__dirname,'..','bemviver');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const checkout=fs.readFileSync(path.join(root,'comprar.html'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
new vm.Script(server,{filename:'server.js'});
new vm.Script(fs.readFileSync(path.join(__dirname,'traffic-events.js'),'utf8'),{filename:'traffic-events.js'});
for(const name of ['checkout.js','app.js','catalog.js','traffic.js']){
 const code=fs.readFileSync(path.join(root,name),'utf8');
 execFileSync(process.execPath,['--input-type=module','--check'],{input:code,stdio:['pipe','inherit','inherit']});
}
const checkoutJs=fs.readFileSync(path.join(root,'checkout.js'),'utf8');
if(!checkout.includes('src="/checkout.js"')||!home.includes('src="/app.js"'))throw Error('Módulo da página ausente');
if(!checkoutJs.includes("paintSales('loading')")||!checkoutJs.includes("paintSales('error')")||!checkoutJs.includes("s.checkoutEnabled===true&&s.pdfLoaded===true&&s.webhookConfigured===true&&s.sellerIdentityReady===true"))throw Error('Disponibilidade de compra sem verificação completa');
if(!checkout.includes('id="compra-automatica" hidden')||!checkout.includes('id="form-checkout"'))throw Error('Formulário deve iniciar oculto');
if(!server.includes("ENABLE_CHECKOUT==='true'")||!server.includes("if(!ready())return json(res,503"))throw Error('Trava de cobrança ausente');
if(/mpago\.la/.test(checkout))throw Error('Link manual de pagamento não permitido');
if(!server.includes("mp('/checkout/preferences','POST'")||!server.includes("mp('/v1/payments/search?'")||server.includes("mp('/v1/orders'"))throw Error('API incorreta para Checkout Pro');
execFileSync(process.execPath,[path.join(__dirname,'offline-sales-test.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'sales-ui-test.js')],{stdio:'inherit'});
console.log('BemViver: módulos, estado de disponibilidade e proteções de pagamento aprovados.');
