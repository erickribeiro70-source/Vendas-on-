'use strict';
const assert = require('node:assert/strict');
const {RECIPES,firstMatchedRecipe,localAnswer,sanitizeHistory} = require('./server');
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
console.log('9 testes concluídos.');
