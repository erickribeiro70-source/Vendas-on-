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
    if (voiceEnabled) speakReply(reply);
    status.textContent=result.mode==='ia'?'IA generativa conectada • testes':result.mode==='regras'?'Resposta verificada • testes':'Atendimento guiado • testes';
  } catch(error) {
    addBubble('Não consegui responder agora. Tente novamente em instantes. Nenhum pagamento foi realizado.','assistant');
    status.textContent='Falha temporária • testes';
  } finally {busy=false;send.disabled=false;input.disabled=false;input.focus();}
}
form.addEventListener('submit',event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.value='';ask(text);});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
for(const btn of document.querySelectorAll('[data-question]'))btn.addEventListener('click',()=>ask(btn.dataset.question));
document.getElementById('reset').addEventListener('click',()=>{if(busy)return;stopSpeaking();history.length=0;messages.replaceChildren();addBubble(introduction,'assistant');status.textContent='Conversa reiniciada • testes';});
fetch('/health').then(r=>r.json()).then(d=>{status.textContent=d.mode==='ia-configurada'?'IA configurada • testes':'Modo demonstração • testes';}).catch(()=>{status.textContent='Modo demonstração • testes';});


/* Interface de voz do navegador. Nenhum arquivo de áudio é enviado ao servidor BemViver. */
const micButton = document.getElementById('mic');
const voiceButton = document.getElementById('voice-toggle');
const recipesButton = document.getElementById('recipes-toggle');
const recipesPanel = document.getElementById('recipes-panel');
const voiceNote = document.getElementById('voice-note');
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
let voiceEnabled = false;
let recognition = null;
let listening = false;
let catalogLoaded = false;
function stopSpeaking(){
  if(speechSupported)window.speechSynthesis.cancel();
}
function speakReply(reply){
  if(!voiceEnabled || !speechSupported)return;
  stopSpeaking();
  const utterance=new SpeechSynthesisUtterance(String(reply).slice(0,1400));
  utterance.lang='pt-BR';
  utterance.rate=1.02;
  utterance.pitch=1.0;
  const voices=window.speechSynthesis.getVoices();
  const voice=voices.find(v=>/^pt-BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang));
  if(voice)utterance.voice=voice;
  utterance.onerror=()=>{voiceNote.textContent='O dispositivo não conseguiu reproduzir a resposta. Você pode continuar lendo a conversa.';};
  try{window.speechSynthesis.speak(utterance);}
  catch{voiceNote.textContent='Não foi possível reproduzir o áudio neste navegador.';}
}
if(speechSupported){
  voiceButton.hidden=false;
  voiceButton.addEventListener('click',()=>{
    voiceEnabled=!voiceEnabled;
    voiceButton.setAttribute('aria-pressed',String(voiceEnabled));
    voiceButton.querySelector('span').textContent='Ouvir respostas: '+(voiceEnabled?'ligado':'desligado');
    voiceNote.textContent=voiceEnabled?'Leitura de respostas ativada. A voz disponível depende do dispositivo.':'Leitura de respostas desativada.';
    if(!voiceEnabled)stopSpeaking();
  });
}
if(Recognition){
  micButton.hidden=false;
  micButton.addEventListener('click',()=>{
    if(busy){voiceNote.textContent='Aguarde a resposta antes de começar a falar.';return;}
    if(listening && recognition){recognition.stop();return;}
    stopSpeaking();
    recognition=new Recognition();
    recognition.lang='pt-BR';
    recognition.interimResults=false;
    recognition.continuous=false;
    recognition.maxAlternatives=1;
    recognition.onstart=()=>{
      listening=true;micButton.setAttribute('aria-pressed','true');
      micButton.querySelector('span').textContent='Parar';
      voiceNote.textContent='Ouvindo... Fale sua pergunta em português. O texto será exibido para revisão.';
    };
    recognition.onresult=event=>{
      const transcript=event.results?.[0]?.[0]?.transcript?.trim();
      if(transcript){
        input.value=(input.value.trim()+' '+transcript).trim().slice(0,1200);
        input.focus();
        voiceNote.textContent='Áudio transcrito. Confira o texto e toque em enviar.';
      }
    };
    recognition.onerror=event=>{
      const errors={
        'not-allowed':'Permissão do microfone negada. Habilite-a no navegador.',
        'audio-capture':'Não foi possível acessar o microfone.',
        'no-speech':'Não foi identificada uma fala. Tente novamente.',
        'network':'Reconhecimento de voz indisponível por problema de rede.'
      };
      voiceNote.textContent=errors[event.error]||'O reconhecimento de voz não funcionou. Use o teclado se preferir.';
    };
    recognition.onend=()=>{
      listening=false;
      micButton.setAttribute('aria-pressed','false');
      micButton.querySelector('span').textContent='Falar';
    };
    try{recognition.start();}
    catch{voiceNote.textContent='Não foi possível iniciar o microfone. Tente usar o navegador Chrome.';}
  });
}
if(!Recognition && !speechSupported){
  voiceNote.textContent='Seu navegador não oferece entrada ou saída de voz. O chat por texto continua disponível.';
}
async function showRecipes(){
  if(!catalogLoaded){
    recipesPanel.textContent='Consultando o catálogo de receitas...';
    try{
      const response=await fetch('/api/recipes',{cache:'no-store'});
      if(!response.ok)throw Error('receitas indisponíveis');
      const data=await response.json();
      if(!Array.isArray(data.recipes) || data.recipes.length===0)throw Error('catálogo vazio');
      recipesPanel.replaceChildren();
      const heading=document.createElement('h3');heading.textContent='Receitas gratuitas do catálogo';
      const grid=document.createElement('div');grid.className='recipe-grid';
      for(const recipe of data.recipes){
        const box=document.createElement('article');box.className='recipe-item';
        const title=document.createElement('strong');title.textContent=String(recipe.nome||'Receita');
        const details=document.createElement('small');details.textContent=String(recipe.tempo||'')+' • '+String(recipe.tipo||'');
        const button=document.createElement('button');button.type='button';button.textContent='Ver preparo';
        button.addEventListener('click',()=>{
          recipesPanel.hidden=true;recipesButton.setAttribute('aria-expanded','false');
          ask('Quero o passo a passo de '+String(recipe.nome||''));
        });
        box.append(title,details,button);grid.appendChild(box);
      }
      recipesPanel.append(heading,grid);
      catalogLoaded=true;
    } catch{
      recipesPanel.textContent='Não foi possível consultar as receitas agora. Tente novamente.';
    }
  }
}
recipesButton.addEventListener('click',()=>{
  const opening=recipesPanel.hidden;
  recipesPanel.hidden=!opening;
  recipesButton.setAttribute('aria-expanded',String(opening));
  if(opening)showRecipes();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    stopSpeaking();
    if(listening && recognition)recognition.stop();
  }
});
