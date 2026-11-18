import {products} from './catalog.js';
const main = document.querySelector('main');
const dialog = document.querySelector('#ai-dialog');
const toast = document.querySelector('#toast');
const storeUrl = 'https://bemviver-ia.onrender.com';
const mpActivity = 'https://www.mercadopago.com.br/activities';
const price = 14.90;
const shareText = 'Conheça o BemViver IA e seu guia de receitas caseiras.';
const whatsappUrl = 'https://wa.me/?text='+encodeURIComponent(shareText+' '+storeUrl+'?utm_source=whatsapp&utm_medium=share');
const facebookUrl = 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(storeUrl+'?utm_source=facebook&utm_medium=share');
const brl = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateTime = new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
const categories = ['Todos','Guias digitais','Café da manhã','Almoço e jantar','Lanches','Bebidas e sobremesas'];

const paths = {
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H5m6-6-6 6 6 6"/>',
  bag:'<path d="M5 8h14l1 13H4L5 8Zm4 0V6a3 3 0 0 1 6 0v2"/>',
  book:'<path d="M12 5v15m0-14c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/>',
  pay:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  order:'<path d="M7 3h10l3 3v15H4V3h3Zm1 7h8m-8 5h8"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  share:'<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 5V4H4v12h1"/>',
};
let availability = null;
let availabilityRequest;
let search = '';
let category = 'Todos';
let toastTimer;

const originalRecipes = [
{nome:"Panqueca de banana com aveia",tipo:"cafe",items:["banana","aveia","ovo"],tempo:"12 min",ingredientes:"1 banana madura, 1 ovo, 3 colheres de aveia",passos:"Amasse a banana, misture o ovo e a aveia. Doure pequenas porções em frigideira antiaderente dos dois lados."},
{nome:"Omelete de tomate e ervas",tipo:"cafe",items:["ovo","tomate"],tempo:"10 min",ingredientes:"2 ovos, 1 tomate pequeno, cheiro-verde",passos:"Bata os ovos, acrescente o tomate picado e as ervas. Cozinhe em frigideira tampada até firmar."},
{nome:"Arroz colorido da semana",tipo:"almoco",items:["arroz","tomate"],tempo:"15 min",ingredientes:"1 xícara de arroz já cozido, 1 cenoura, 1 tomate, 1 colher de azeite",passos:"Refogue a cenoura ralada e o tomate, junte o arroz cozido e aqueça bem."},
{nome:"Frango de panela com legumes",tipo:"almoco",items:["frango","tomate"],tempo:"30 min",ingredientes:"250 g de frango em cubos, 1 tomate, 1 cenoura, 1/2 cebola",passos:"Refogue a cebola, doure o frango, adicione legumes e um pouco de água. Cozinhe até o frango estar totalmente cozido."},
{nome:"Vitamina cremosa de banana",tipo:"lanche",items:["banana","aveia"],tempo:"5 min",ingredientes:"1 banana, 200 ml de leite ou bebida vegetal, 1 colher de aveia",passos:"Bata todos os ingredientes no liquidificador e consuma em seguida. Verifique alergênicos."},
{nome:"Bolinho de aveia de frigideira",tipo:"lanche",items:["aveia","ovo","banana"],tempo:"12 min",ingredientes:"1 ovo, 2 colheres de aveia, 1/2 banana amassada",passos:"Misture tudo, despeje em frigideira pequena untada e cozinhe em fogo baixo dos dois lados."}
];
for (const [i,r] of originalRecipes.entries()) {
 if(products.some(p=>p.name===r.nome)) continue;
 products.push({id:['panqueca','omelete','arroz','frango','vitamina','bolinho'][i],name:r.nome,category:{cafe:'Café da manhã',almoco:'Almoço e jantar',lanche:'Lanches'}[r.tipo],tag:'Receita gratuita',description:'Receita prática do catálogo BemViver.',time:r.tempo,ingredients:r.ingredientes.split(', '),steps:[r.passos],note:'Confira ingredientes e alergênicos antes de preparar.'});
}
function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
}
function esc(value) {
  return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function pill(label, tone = '') {
  return '<span class="pill '+tone+'">'+esc(label)+'</span>';
}
function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(()=>{toast.hidden=true},3800);
}
async function request(path, options) {
  const response = await fetch(path,{cache:'no-store',...options});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Não foi possível concluir a solicitação.');
  return data;
}
function addChatMessage(role, content) {
  const message = document.createElement('p');
  message.className = 'chat-message '+(role==='user'?'visitor':'assistant');
  const label = document.createElement('span');
  label.className = 'sr-only';
  label.textContent = role==='user'?'Você. ':'Assistente. ';
  message.append(label);
  for (const part of content.split(/(\*\*[^*\n]+\*\*)/g)) {
    if (part.startsWith('**') && part.endsWith('**') && part.length>4) {
      const emphasis = document.createElement('strong');
      emphasis.textContent = part.slice(2,-2);
      message.append(emphasis);
    } else {
      message.append(part);
    }
  }
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}
function checkoutLabel(state) {
  return {ready:'Checkout ativo', configuration:'Aguardando configuração',unavailable:'Verificação indisponível'}[state] || 'Verificando checkout…';
}
function statusItem(href, glyph, title, copy, id = '') {
  return '<a class="status-item" href="'+href+'"><span class="iconbox">'+icon(glyph)+'</span><span><strong>'+title+'</strong><small'+(id ? ' id="'+id+'"' : '')+'>'+copy+'</small></span></a>';
}
function hero() {
  return '<section class="hero"><div class="hero-copy"><p class="eyebrow">Saúde &amp; bem-estar</p><h1>Comida de verdade<br>para o <em>dia a dia.</em></h1><p>Explore receitas caseiras, conheça o guia completo e encontre ideias para o dia a dia.</p><div class="hero-actions"><a class="btn gold" href="#catalogo">Receitas grátis '+icon('arrow')+'</a><button class="btn hero-link" type="button" data-ai>✧ Ajuda por ingredientes</button></div></div><div class="hero-img" role="img" aria-label="Salada caseira com grão-de-bico, abacate e legumes"></div></section>'+
    '<section class="status-strip" aria-label="Atalhos e status">'+statusItem('#catalogo','book','Catálogo de receitas','1 guia digital e 8 receitas gratuitas')+statusItem('/comprar.html','pay','Guia digital',checkoutLabel(availability?.checkout),'checkout-strip')+statusItem('/ia.html','order','Converse com a IA','Ideias de receitas e dúvidas sobre o guia')+'</section>';
}
function card(item) {
  const guide = item.id === 'guia';
  return '<article class="card"><a class="card-media '+item.id+'" href="#produto/'+item.id+'" aria-label="'+esc(item.name)+'">'+(item.image?'<img src="/assets/'+item.image+'.webp" alt="" width="480" height="300" loading="lazy">':'<div class="recipe-placeholder" aria-hidden="true">'+esc(item.category)+'</div>')+pill(item.tag)+'</a><div class="card-body"><h3><a href="#produto/'+item.id+'">'+item.name+'</a></h3><p>'+item.description+'</p><div class="card-foot"><strong>'+(guide?brl.format(price):'Gratuita')+'</strong><a href="#produto/'+item.id+'">'+(guide?'Ver guia':'Ver receita')+icon('arrow')+'</a></div></div></article>';
}
function catalog() {
  return '<section class="section" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">Guias e receitas</p><h2 id="catalog-title">Catálogo BemViver</h2><p>Escolha uma categoria ou busque pelo nome.</p></div><label class="search">'+icon('search')+'<input type="search" aria-label="Buscar no catálogo" placeholder="Buscar receitas ou guias" id="search"></label></div><div class="filters" role="group" aria-label="Categorias do catálogo">'+categories.map(label=>'<button class="chip" type="button" data-category="'+label+'" aria-pressed="'+(category===label)+'">'+label+'</button>').join('')+'</div><div class="cards" id="cards" aria-live="polite"></div></section>';
}
function updateCards() {
  const list = document.querySelector('#cards');
  if (!list) return;
  const normalize = value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const terms = normalize(search.trim()).split(/\s+/);
  const items = products.filter(item=>(category==='Todos'||item.category===category)&&terms.every(term=>normalize([item.name,item.category,item.description,...(item.ingredients||[])].join(' ')).includes(term)));
  list.innerHTML = items.length ? items.map(card).join('') : '<div class="empty"><h3>Nenhum conteúdo encontrado</h3><p class="muted">Tente outra busca ou peça uma sugestão à assistente.</p><button class="btn primary" type="button" data-ai>Pedir ajuda à IA</button></div>';
  document.querySelectorAll('[data-category]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.category===category)));
}
function social() {
  return `<section class="section social" aria-labelledby="social-heading">
    <div class="social-row">
      <div><h2 id="social-heading">Divulgue o BemViver IA</h2><p>Compartilhe a loja pública com seus contatos ou nas redes sociais.</p></div>
      <div class="action-row">
        <button class="btn primary" type="button" data-share>${icon('share')} Compartilhar</button>
        <button class="btn ghost" type="button" data-copy="${storeUrl}" data-copy-store>${icon('copy')} Copiar link</button>
        <a class="btn ghost" href="${whatsappUrl}" target="_top" rel="noreferrer" data-share-link>WhatsApp</a>
        <a class="btn ghost" href="${facebookUrl}" target="_top" rel="noreferrer" data-share-link>Facebook</a>
      </div>
    </div>
    <div class="share-fallback" data-share-fallback hidden>
      <label for="share-store-link">Link da loja para compartilhar</label>
      <input class="field" id="share-store-link" value="${storeUrl}" readonly>
      <p class="feedback" data-share-message role="status"></p>
    </div>
  </section>`;
}
function showShareLink(trigger, message, select = false) {
  const panel = trigger.closest('.social')?.querySelector('[data-share-fallback]');
  if (!panel) return;
  panel.hidden = false;
  panel.querySelector('[data-share-message]').textContent = message;
  if (select) {
    const field = panel.querySelector('input');
    field.focus();
    field.select();
  }
}
function detail(item) {
  const guide = item.id==='guia';
  const description = guide
    ? '<p>Guia em PDF com receitas para café da manhã, almoço, jantar, lanches, bebidas e sobremesas. Inclui ingredientes, preparo, tempo estimado e rendimento de cada receita.</p><ul class="detail-list"><li>30 receitas organizadas por tipo de refeição</li><li>Download liberado após a confirmação do Mercado Pago</li></ul><strong class="price">'+brl.format(price)+'</strong><div class="action-row"><a class="btn primary" href="/comprar.html">Ver oferta e disponibilidade</a><a class="btn ghost" href="/termos.html">Informações da compra</a></div>'
    : '<p>'+item.description+'</p><p><strong>'+item.time+'</strong> · '+(item.yield||'Receita caseira')+'</p><h2>Ingredientes</h2><ul class="detail-list">'+item.ingredients.map(line=>'<li>'+line+'</li>').join('')+'</ul><h2>Modo de preparo</h2><ol class="detail-list">'+item.steps.map(line=>'<li>'+line+'</li>').join('')+'</ol><p>'+item.note+'</p><a class="btn primary" href="#produto/guia">Conhecer o guia completo '+icon('arrow')+'</a>';
  return '<a class="back" href="#catalogo">'+icon('back')+' Voltar ao catálogo</a><article class="detail"><div class="detail-image">'+(item.image?'<img src="/assets/'+item.image+'.webp" alt="'+esc(item.name)+'">':'<div class="recipe-placeholder" aria-hidden="true">'+esc(item.category)+'</div>')+'</div><div class="detail-content">'+pill(guide?'Guia digital · PDF':item.category)+'<h1>'+item.name+'</h1>'+description+'</div></article>';
}
function catalogReply(message, history) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const text = normalize(message);
  const action = item => ({label:item.id === 'guia' ? 'Ver guia e disponibilidade' : 'Abrir receita completa',href:'#produto/'+item.id});
  if (/\b(preco|custa|valor|comprar|compra|guia|pagamento|pagar|pix|cartao|download|baixar|reembolso|paguei|pedido)\b/.test(text)) {
    return {reply:'O guia BemViver reúne 30 receitas caseiras em PDF e custa R$ 14,90. Abra a página do guia para conferir a disponibilidade e comprar pelo Mercado Pago. O download depende da confirmação do pagamento; guarde a página de retorno para consultar o acesso. Não consigo confirmar pagamentos pelo chat.',actions:[action(products[0])]};
  }
  if (/\b(diabetes|diabetico|pressao|doenca|remedio|medicamento|cura|emagrecer|gestante|gravida|bebe)\b/.test(text)) return null;
  const followup = /\b(essa|esta|ela|outra|preparo|ingredientes|receita anterior)\b/.test(text);
  const previous = followup ? history.filter(x=>x.role==='user').map(x=>normalize(x.content)).join(' ') : '';
  const query = previous+' '+text;
  if (!/\b(receita|receitas|preparar|lanche|comida|banana|aveia|abobora|sopa|abacate|cacau|panqueca|sobremesa|ovo|leite|minutos|jantar)\b/.test(query)) return null;
  const restrictions = [];
  if (/\b(sem ovo|sem ovos|alergia a ovo|alergia ao ovo|vegana|vegano)\b/.test(query)) restrictions.push('ovo');
  if (/\b(sem leite|sem lactose|alergia a leite|alergia ao leite|vegana|vegano)\b/.test(query)) restrictions.push('leite');
  for (const word of ['banana','aveia','abobora','gengibre','abacate','cacau','ovo','leite','frango','arroz','tomate','cenoura']) {
    if (new RegExp('\\bsem '+word+'\\b').test(query)) restrictions.push(word);
  }
  if (/\b(vegana|vegano|vegetariana|vegetariano|sem carne)\b/.test(query)) restrictions.push('frango');
  // Only list recipes whose published ingredients do not include the excluded item.
  let candidates = products.filter(item=>item.id!=='guia' && restrictions.every(word=>!normalize(item.ingredients.join(' ')).includes(word)));
  if (/\b(sem gluten|celiaco|celiaca)\b/.test(query)) candidates = candidates.filter(item=>!normalize(item.ingredients.join(' ')).includes('aveia'));
  const time = /(?:ate|em)\s+(\d{1,2})\s*(?:min|minutos)/.exec(query);
  if (time) candidates = candidates.filter(item=>parseInt(item.time)<=Number(time[1]));
  const ingredients = ['banana','aveia','abobora','gengibre','abacate','cacau','ovo','leite','frango','arroz','tomate','cenoura'];
  const wanted = ingredients.filter(word=>query.includes(word) && !restrictions.includes(word));
  if (wanted.length) candidates = candidates.filter(item=>wanted.every(word=>normalize(item.ingredients.join(' ')).includes(word)));
  if (!candidates.length) return {reply:'Não encontrei uma receita publicada que combine com esse pedido. Tenho panqueca de banana com aveia, sopa de abóbora e creme de cacau com abacate. Você prefere mudar os ingredientes ou me dizer outra restrição?',actions:[]};
  const item = candidates[0];
  const details = wanted.length || followup || candidates.length===1;
  const caution = restrictions.length || /gluten|alerg/.test(query) ? '\nConfira os rótulos e a possibilidade de contaminação cruzada antes de preparar.' : '';
  return {reply:details ? item.name+' · '+item.time+' · '+(item.yield||'Receita caseira')+'\n\nIngredientes:\n'+item.ingredients.map(x=>'• '+x).join('\n')+'\n\nPreparo:\n'+item.steps.map((x,i)=>(i+1)+'. '+x).join('\n')+'\n\n'+(item.note||'Confira os ingredientes e alergênicos.')+caution : 'Estas receitas do catálogo combinam com seu pedido:\n'+candidates.map(x=>'• '+x.name+' ('+x.time+')').join('\n')+caution+'\nEscolha uma para abrir o preparo completo.',actions:(details?[item]:candidates).map(action)};
}


const chatHistory=[];
const chatMessages=document.querySelector('#ai-messages');
const chatInput=document.querySelector('#ai-input');
const chatForm=document.querySelector('#ai-form');
const chatFeedback=document.querySelector('#ai-feedback');
function resetChat(){chatHistory.length=0;chatMessages.replaceChildren();addChatMessage('model','Posso encontrar receitas publicadas pelo ingrediente e pelo tempo disponível, ou explicar o guia. O que você tem em casa?');chatInput.value='';chatFeedback.textContent='';}
function sendChat(message){
 message=message.trim();if(!message)return;
 addChatMessage('user',message);
 const result=catalogReply(message,chatHistory)||{reply:'Posso ajudar com o catálogo de receitas e com o guia de R$ 14,90. Para perguntas mais abertas, use Conversar com IA beta. Não confirmo pagamentos nem forneço orientação médica.',actions:[]};
 const answer=addChatMessage('model',result.reply);
 for(const action of result.actions||[]){if(!products.some(p=>action.href==='#produto/'+p.id))continue;const link=document.createElement('a');link.className='btn ghost chat-action';link.href=action.href;link.textContent=action.label;link.dataset.aiClose='';answer.append(link);}
 chatHistory.push({role:'user',content:message},{role:'model',content:result.reply});if(chatHistory.length>8)chatHistory.splice(0,chatHistory.length-8);
 chatInput.value='';chatFeedback.textContent='Resposta baseada nas receitas publicadas. Confira se tem todos os ingredientes.';chatMessages.scrollTop=chatMessages.scrollHeight;
}
function render(){
 const [page,id]=location.hash.slice(1).split('/');
 document.querySelectorAll('[data-nav]').forEach(el=>{if(el.dataset.nav===(page||'inicio'))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 if(page==='produto'){const item=products.find(p=>p.id===id);main.innerHTML=item?detail(item):'<div class="empty"><h1>Receita não encontrada</h1><a class="btn primary" href="#catalogo">Voltar ao catálogo</a></div>';}
 else if(page==='guia'){main.innerHTML=detail(products[0]);}
 else if(page==='catalogo'||page==='experimentar'){main.innerHTML=catalog();}
 else if(page==='divulgar'||page==='compartilhar'){main.innerHTML=social();}
 else{main.innerHTML=hero()+catalog()+'<section class="chat-launch"><h2>Uma ideia para o que você tem em casa</h2><p>Encontre receitas do catálogo pelos ingredientes ou converse com a IA beta.</p><div class="action-row"><button class="btn primary" type="button" data-ai>Ajuda por ingredientes</button><a class="btn ghost" href="/ia.html">Conversar com IA beta</a></div></section>'+social();}
 const input=document.querySelector('#search');if(input){input.value=search;input.addEventListener('input',()=>{search=input.value;updateCards();});updateCards();}
 const strip=document.querySelector('#checkout-strip');if(strip)strip.textContent=checkoutLabel(availability?.checkout);
 window.scrollTo(0,0);
}
async function checkSales(){
 try{const response=await fetch('https://bemviver-ia-api.onrender.com/health',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error();const data=await response.json();availability={checkout:data.checkoutEnabled===true&&data.pdfLoaded===true&&data.sellerIdentityReady===true&&data.webhookConfigured===true?'ready':'configuration'};}
 catch{availability={checkout:'unavailable'};}
 const strip=document.querySelector('#checkout-strip');if(strip)strip.textContent=checkoutLabel(availability.checkout);
}
document.addEventListener('click',async event=>{
 if(event.target.closest('[data-ai-close]'))dialog.close();
 const link=event.target.closest('[data-share-link]');if(link)showShareLink(link,'Se a rede social não abrir, copie este link e cole na sua publicação.');
 const button=event.target.closest('button');if(!button)return;
 if(button.matches('[data-ai]')){dialog.showModal();chatInput.focus();}
 if(button.dataset.aiPrompt)sendChat(button.dataset.aiPrompt);
 if(button.dataset.category){category=button.dataset.category;updateCards();}
 if(button.dataset.copy){try{await navigator.clipboard.writeText(button.dataset.copy);notify('Link copiado.');}catch{showShareLink(button,'Toque e segure para copiar.',true);}}
 if(button.matches('[data-share]')){try{if(navigator.share){await navigator.share({title:'BemViver IA',text:shareText,url:storeUrl});return;}}catch(error){if(error.name==='AbortError')return;}showShareLink(button,'Use Copiar link, WhatsApp ou Facebook para compartilhar.');}
});
chatForm.addEventListener('submit',event=>{event.preventDefault();sendChat(chatInput.value);});
document.querySelector('#ai-clear').addEventListener('click',resetChat);
window.addEventListener('hashchange',render);
resetChat();render();void checkSales();
