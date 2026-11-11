'use strict';
const form=document.getElementById('chat-form');
const input=document.getElementById('message');
const send=document.getElementById('send');
const messages=document.getElementById('messages');
const status=document.getElementById('status');
const history=[];
let busy=false;
const introduction='Olá! 🌿 Sou o assistente BemViver IA, em fase de testes. Que tal me contar quais ingredientes você tem na cozinha? Também posso explicar como funciona nosso guia de receitas.';
function addBubble(text,who) {
  const row=document.createElement('div');row.className='bubble-row '+(who==='user'?'user-row':'assistant-row');
  const bubble=document.createElement('div');bubble.className='bubble '+(who==='user'?'user-msg':'assist-msg');
  bubble.textContent=text;row.appendChild(bubble);messages.appendChild(row);messages.scrollTop=messages.scrollHeight;
}
async function ask(message) {
  if(busy||!message.trim())return;
  busy=true;send.disabled=true;input.disabled=true;
  addBubble(message,'user');
  const prior=history.slice(-8);
  history.push({role:'user',content:message});
  status.textContent='Preparando resposta…';
  try {
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,history:prior})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Falha no atendimento.');
    const reply=String(result.reply||'Não consegui responder agora.');
    addBubble(reply,'assistant');
    history.push({role:'model',content:reply});
    status.textContent=result.mode==='ia'?'IA generativa conectada • testes':'Modo demonstração • testes';
  } catch(error) {
    addBubble('Não consegui responder agora. Tente novamente em instantes. Nenhum pagamento foi realizado.','assistant');
    status.textContent='Falha temporária • testes';
  } finally {busy=false;send.disabled=false;input.disabled=false;input.focus();}
}
form.addEventListener('submit',event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.value='';ask(text);});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
for(const btn of document.querySelectorAll('[data-question]'))btn.addEventListener('click',()=>ask(btn.dataset.question));
document.getElementById('reset').addEventListener('click',()=>{if(busy)return;history.length=0;messages.replaceChildren();addBubble(introduction,'assistant');status.textContent='Conversa reiniciada • testes';});
fetch('/health').then(r=>r.json()).then(d=>{status.textContent=d.mode==='ia-configurada'?'IA configurada • testes':'Modo demonstração • testes';}).catch(()=>{status.textContent='Modo demonstração • testes';});
