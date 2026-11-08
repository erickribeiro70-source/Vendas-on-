'use strict';
// Verificações de build sem rede, sem credenciais e sem iniciar cobranças.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const checkout = fs.readFileSync(path.join(__dirname, '..', 'bemviver', 'comprar.html'), 'utf8');
new vm.Script(server, {filename:'bemviver-server/server.js'});
const scripts=[...checkout.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/g)];
if (scripts.length!==1) throw Error('Esperado um script local na pagina de compra');
new vm.Script(scripts[0][1], {filename:'bemviver/comprar.html:inline.js'});
if (!server.includes("ENABLE_CHECKOUT==='true'")) throw Error('Trava de cobranca ausente');
if (!checkout.includes('id="compra-automatica"') || !checkout.includes('id="form-checkout"')) throw Error('Formulario de checkout em falta');
if (!checkout.includes('https://mpago.la/22itHvV')) throw Error('Pagamento manual existente deve ser preservado');
if (!server.includes('return json(res,503')) throw Error('Checkout desativado deve retornar 503');
console.log('BemViver: verificacoes de sintaxe e bloqueio de checkout aprovadas (sem rede ou pagamentos).');
