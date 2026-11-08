'use strict';
// Verificações de build sem rede, sem credenciais e sem iniciar cobranças.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const checkout=fs.readFileSync(path.join(__dirname,'..','bemviver','comprar.html'),'utf8');
new vm.Script(server,{filename:'bemviver-server/server.js'});
const start=checkout.lastIndexOf('<script>');
const end=checkout.lastIndexOf('</script>');
if(start<0||end<start)throw Error('Script da pagina de compra nao encontrado');
new vm.Script(checkout.slice(start+8,end),{filename:'bemviver/comprar.html:inline.js'});
if(!server.includes("ENABLE_CHECKOUT==='true'"))throw Error('Trava de cobranca ausente');
if(!checkout.includes('id="compra-automatica"')||!checkout.includes('id="form-checkout"'))throw Error('Formulario de checkout em falta');
if(!checkout.includes('https://mpago.la/22itHvV'))throw Error('Pagamento manual existente deve ser preservado');
if(!server.includes("if(!ready())return json(res,503"))throw Error('Checkout desativado deve retornar 503');
console.log('BemViver: sintaxe e bloqueio de checkout aprovados (sem rede e sem pagamentos).');
