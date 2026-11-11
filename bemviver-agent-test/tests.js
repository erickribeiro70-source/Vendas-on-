'use strict';
const assert = require('node:assert/strict');
// Offline regression tests must not call a paid or quota-limited Gemini API.
delete process.env.GEMINI_API_KEY;
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {RECIPES,firstMatchedRecipe,ingredientPreferences,violatesIngredients,localAnswer,sanitizeHistory,officialCheckoutStatus,commercialStatusReply,handler} = require('./server');
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
run('ausência de ovo não permite receita com ovo',()=>{
  const result=localAnswer('Quero fazer um lanche mas não tenho ovo');
  assert.equal(result.intent,'receita');
  assert.ok(result.recipe);
  assert.ok(!result.recipe.items.includes('ovo'));
  assert.doesNotMatch(result.reply,/panqueca de banana com aveia/);
});
run('banana e aveia sem ovo escolhe receita adequada',()=>{
  const result=localAnswer('Tenho banana e aveia, mas não tenho ovo');
  assert.equal(result.recipe.id,'vitamina');
  assert.ok(!result.recipe.items.includes('ovo'));
});
run('negações e afirmações de ingredientes são separadas',()=>{
  const data=ingredientPreferences('Não tenho banana, mas tenho ovo e tomate');
  assert.ok(data.excluded.has('banana'));
  assert.ok(!data.excluded.has('ovo'));
  assert.ok(data.available.has('ovo'));
});
run('restrição nova não reutiliza receita anterior incompatível',()=>{
  const result=localAnswer('Quero fazer um lanche sem ovo',[{role:'model',content:'Sugiro Panqueca de banana com aveia'}]);
  assert.ok(!result.recipe.items.includes('ovo'));
});
run('resposta do Gemini com ingrediente proibido é descartada',()=>{
  const excluded=new Set(['ovo']);
  assert.equal(violatesIngredients('Use 2 ovos e aveia.',excluded),true);
  assert.equal(violatesIngredients('Uma vitamina de banana e aveia sem ovo.',excluded),false);
  assert.equal(violatesIngredients('Como você não tem ovo, sugiro uma vitamina de banana.',excluded),false);
  assert.equal(violatesIngredients('Não use ovo; bata banana, aveia e leite.',excluded),false);
  assert.equal(violatesIngredients('A receita não leva ovo. Bata banana e aveia.',excluded),false);
  assert.equal(violatesIngredients('Sem ovo, adicione 2 ovos à mistura.',excluded),true);
  assert.equal(violatesIngredients('Sugiro panqueca de banana com aveia sem ovo.',excluded),true);
});
run('controles de voz e catálogo presentes na interface',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'client.js'),'utf8');
  assert.match(html,/id="mic"/);assert.match(html,/id="voice-toggle"/);
  assert.match(html,/id="recipes-panel"/);assert.match(js,/recognition\.lang='pt-BR'/);
  assert.match(js,/SpeechSynthesisUtterance/);assert.match(js,/fetch\('\/api\/recipes'/);
});
run('formatação de texto da IA exibe negrito e marcadores sem executar HTML',()=>{
  const client=fs.readFileSync(path.join(__dirname,'client.js'),'utf8');
  const start=client.indexOf('function addSafeFormatting(');
  const end=client.indexOf('\nfunction addBubble(',start);
  assert.ok(start>=0&&end>start);
  const context={
    document:{
      createTextNode:(text)=>({textContent:text,nodeType:3}),
      createElement:(tagName)=>({tagName,textContent:'',nodeType:1})
    }
  };
  vm.runInNewContext(client.slice(start,end)+'\nthis.safeFormat=addSafeFormatting;',context);
  const nodes=[];
  context.safeFormat({appendChild:node=>nodes.push(node)},
    '**Ingredientes:**\n* 1 banana\n**Preparo:** Bata tudo.\n<script>alert(1)</script>');
  assert.equal(nodes.map(node=>node.textContent).join(''),
    'Ingredientes:\n• 1 banana\nPreparo: Bata tudo.\n<script>alert(1)</script>');
  assert.equal(nodes.filter(node=>node.tagName==='strong').length,2);
  assert.ok(nodes.every(node=>!node.tagName||node.tagName==='strong'));
});

run('reembolso é encaminhado sem estorno automático',()=>{
  const r=localAnswer('Quero solicitar um reembolso do guia');
  assert.equal(r.intent,'suporte');
  assert.equal(r.handoff,true);
  assert.equal(r.supportTopic,'reembolso');
  assert.match(r.reply,/não faz estornos/);
  assert.equal(r.support.email,'contato.bemviveria@gmail.com');
});
run('guia não recebido possui categoria própria e não libera PDF',()=>{
  const r=localAnswer('Já paguei e não recebi o PDF');
  assert.equal(r.intent,'suporte');
  assert.equal(r.supportTopic,'acesso');
  assert.match(r.reply,/não libera arquivos/);
});
run('cliente pode pedir atendimento humano diretamente',()=>{
  const r=localAnswer('Quero falar com atendente humano');
  assert.equal(r.intent,'suporte');
  assert.equal(r.supportTopic,'atendimento');
  assert.equal(r.handoff,true);
});
run('dúvida de cobrança não confirma pagamento',()=>{
  const r=localAnswer('Meu Pix foi aprovado?');
  assert.equal(r.intent,'suporte');
  assert.equal(r.supportTopic,'pagamento');
  assert.match(r.reply,/não confirma pagamentos/);
});
run('botão de e-mail não envia dados e só aparece no encaminhamento',()=>{
  const js=fs.readFileSync(path.join(__dirname,'client.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert.match(js,/if\(result\.handoff===true\)addSupportAction\(result\.support\)/);
  assert.match(js,/mailto:contato\.bemviveria@gmail\.com\?subject=/);
  assert.doesNotMatch(js,/fetch\(['"]\/api\/send-email/);
  assert.doesNotMatch(html,/data-question="Quero falar com atendente humano"/);
});

run('comercial informa preço e não autoriza cobrança no chat',()=>{
  const r=commercialStatusReply(true);
  assert.match(r,/R\$ 14,90/);
  assert.match(r,/checkout está habilitado/);
  assert.match(r,/não cria pedidos/);
});
run('cliente usa somente link oficial de compra sem enviar dados financeiros',()=>{
  const client=fs.readFileSync(path.join(__dirname,'client.js'),'utf8');
  assert.match(client,/bemviver-ia\.onrender\.com\/comprar\.html/);
  assert.match(client,/if\(result\.intent==='comercial'\)addCheckoutAction/);
  assert.doesNotMatch(client,/api\/checkout/);
});
async function checkoutStatusTests(){
  const enabled=await officialCheckoutStatus(async()=>({ok:true,json:async()=>({running:true,checkoutEnabled:true,pdfLoaded:true})}));
  assert.equal(enabled,true);
  console.log('PASS disponibilidade oficial habilitada com PDF carregado');
  const disabled=await officialCheckoutStatus(async()=>({ok:true,json:async()=>({running:true,checkoutEnabled:false,pdfLoaded:true})}));
  const noPdf=await officialCheckoutStatus(async()=>({ok:true,json:async()=>({running:true,checkoutEnabled:true,pdfLoaded:false})}));
  assert.equal(disabled,false);assert.equal(noPdf,false);
  console.log('PASS bloqueio quando checkout desativado ou PDF ausente');
  const unavailable=await officialCheckoutStatus(async()=>{throw new Error('connection lost');});
  assert.equal(unavailable,null);
  assert.match(commercialStatusReply(null),/Não consegui confirmar/);
  console.log('PASS falha de rede não inventa disponibilidade comercial');
}
async function integration(){
  const server=http.createServer((req,res)=>{handler(req,res).catch(e=>{console.error(e);if(!res.headersSent){res.statusCode=500;res.end('erro');}});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const root='http://127.0.0.1:'+server.address().port;
    let res=await fetch(root+'/health');let body=await res.json();
    assert.equal(res.status,200);assert.equal(body.environment,'test');
    assert.equal(body.checkoutEnabled,false);assert.equal(body.chargesEnabled,false);assert.equal(body.bookingEnabled,false);
    console.log('PASS health garante ambiente isolado e pagamentos desativados');
    res=await fetch(root+'/');
    assert.equal(res.status,200);
    assert.equal(res.headers.get('x-frame-options'),null);
    assert.match(res.headers.get('content-security-policy'),/frame-ancestors https:\/\/bemviver-ia\.onrender\.com/);
    console.log('PASS site oficial pode incorporar chat com frame-ancestors restrito');
    res=await fetch(root+'/api/recipes');body=await res.json();
    assert.equal(res.status,200);assert.equal(body.recipes.length,6);
    console.log('PASS endpoint real de catálogo responde com seis receitas');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Quero o passo a passo da panqueca'})});
    body=await res.json();assert.equal(res.status,200);assert.match(body.reply,/banana/);
    console.log('PASS endpoint de conversa responde sem credencial externa');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Quero um lanche mas não tenho ovo'})});
    body=await res.json();assert.equal(res.status,200);
    assert.equal(body.intent,'receita');assert.ok(!body.recipe.items.includes('ovo'));
    console.log('PASS API real respeita ingrediente indisponível');
    res=await fetch(root+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(res.status,404);console.log('PASS checkout não existe neste servidor');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json',origin:'https://outro.exemplo'},body:'{}'});
    assert.equal(res.status,403);console.log('PASS requisições de origens diferentes são rejeitadas');
    res=await fetch(root+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'x'.repeat(1201)})});
    assert.equal(res.status,400);console.log('PASS mensagens acima do limite são rejeitadas');
  } finally {await new Promise(resolve=>server.close(resolve));}
}
checkoutStatusTests().then(integration).then(()=>console.log('33 testes concluídos.')).catch(err=>{console.error(err);process.exitCode=1;});

