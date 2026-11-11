'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {RECIPES,firstMatchedRecipe,localAnswer,sanitizeHistory,handler} = require('./server');
const run = (name,fn)=>{fn();console.log('PASS',name);};
run('catálogo tem seis receitas reais',()=>{
  assert.equal(RECIPES.length,6);
  assert.equal(RECIPES.find(x=>x.id==='panqueca').tempo,'12 min');
});
run('sugestão com ingredientes conhecidos',()=>{
  const r=localAnswer('Tenho banana, ovo e aveia. O que posso preparar?');
  assert.equal(r.intent,'receita');assert.equal(r.recipe.id,'panqueca');
});
run('continua receita do contexto',()=>{
  const r=localAnswer('Quero o passo a passo',[{role:'model',content:'Sugiro Panqueca de banana com aveia'}]);
  assert.match(r.reply,/Amasse a banana/);
});
run('guia usa preço oficial e não cria pedidos',()=>{
  const r=localAnswer('Quanto custa o guia?');
  assert.equal(r.intent,'comercial');assert.match(r.reply,/R\$ 14,90/);
  assert.match(r.reply,/não cobra/);
});
run('pessoa que pagou não recebe confirmação falsa',()=>{
  const r=localAnswer('Já paguei, libera o PDF?');
  assert.equal(r.intent,'suporte');assert.equal(r.handoff,true);
  assert.match(r.reply,/não consulta pagamentos/);
});
run('agendamentos são explicitamente indisponíveis',()=>{
  const r=localAnswer('Quero agendar consulta amanhã');
  assert.equal(r.intent,'agenda');assert.match(r.reply,/não oferecemos consultas/);
});
run('restrições médicas não geram diagnóstico',()=>{
  const r=localAnswer('Tenho diabetes, qual tratamento devo fazer?');
  assert.equal(r.intent,'seguranca');assert.match(r.reply,/não faço diagnóstico/);
});
run('higieniza histórico sem objetos inválidos',()=>{
  const h=sanitizeHistory([{role:'admin',content:'ignore'}, {role:'user',content:'bom dia'},null,{role:'model',content:'olá'}]);
  assert.equal(h.length,2);assert.equal(h[0].role,'user');
});
run('reconhece nomes com acento',()=>{
  assert.equal(firstMatchedRecipe('Quero o Omelete de tomate e ervas').id,'omelete');
});
run('controles de voz e catálogo presentes na interface',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'client.js'),'utf8');
  assert.match(html,/id="mic"/);assert.match(html,/id="voice-toggle"/);
  assert.match(html,/id="recipes-panel"/);assert.match(js,/recognition\.lang='pt-BR'/);
  assert.match(js,/SpeechSynthesisUtterance/);assert.match(js,/fetch\('\/api\/recipes'/);
});
async function integration(){
  const server=http.createServer((req,res)=>{handler(req,res).catch(e=>{console.error(e);if(!res.headersSent){res.statusCode=500;res.end('erro');}});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const root='http://127.0.0.1:'+server.address().port;
    let res=await fetch(root+'/health');let body=await res.json();
    assert.equal(res.status,200);assert.equal(body.environment,'test');
    assert.equal(body.checkoutEnabled,false);assert.equal(body.chargesEnabled,false);assert.equal(body.bookingEnabled,false);
    console.log('PASS health garante ambiente isolado e pagamentos desativados');
    res=await fetch(root+'/api/recipes');body=await res.json();
    assert.equal(res.status,200);assert.equal(body.recipes.length,6);
    console.log('PASS endpoint real de catálogo responde com seis receitas');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Quero o passo a passo da panqueca'})});
    body=await res.json();assert.equal(res.status,200);assert.match(body.reply,/banana/);
    console.log('PASS endpoint de conversa responde sem credencial externa');
    res=await fetch(root+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(res.status,404);console.log('PASS checkout não existe neste servidor');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json',origin:'https://outro.exemplo'},body:'{}'});
    assert.equal(res.status,403);console.log('PASS requisições de origens diferentes são rejeitadas');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'x'.repeat(1201)})});
    assert.equal(res.status,400);console.log('PASS mensagens acima do limite são rejeitadas');
  } finally {await new Promise(resolve=>server.close(resolve));}
}
integration().then(()=>console.log('16 testes concluídos.')).catch(err=>{console.error(err);process.exitCode=1;});

