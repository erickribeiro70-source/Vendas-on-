import {track} from './traffic.js';
const apiBemViver='https://bemviver-ia-api.onrender.com';
const caixaAutomatica=document.getElementById('compra-automatica');
const formCheckout=document.getElementById('form-checkout');
const botaoCheckout=document.getElementById('botao-checkout');
const mensagemCheckout=document.getElementById('mensagem-checkout');
const offer=document.querySelector('.offer');
const shortcut=offer.querySelector('a.btn');
const statusText=document.getElementById('estado-checkout');
const retry=document.getElementById('retry-checkout');
let checking=false;
let available=false;
function paintSales(state){
 available=state==='ready';
 caixaAutomatica.hidden=!available;
 botaoCheckout.disabled=!available;
 retry.hidden=state==='loading'||available;
 document.getElementById('como-comprar').hidden=state==='loading'||available;
 shortcut.setAttribute('aria-disabled',String(!available));
 shortcut.href=available?'#compra-automatica':'#estado-checkout';
 shortcut.textContent=available?'Comprar agora — R$ 14,90':state==='loading'?'Verificando pagamento…':'Pagamento indisponível agora';
 statusText.textContent=available?'Pague com segurança pelo Mercado Pago. O download do guia é liberado na página de retorno após a confirmação.':state==='loading'?'Conferindo a disponibilidade do pagamento seguro…':state==='disabled'?'O pagamento está temporariamente indisponível. Tente verificar novamente em alguns instantes.':'Não conseguimos confirmar a disponibilidade agora. Toque em Verificar novamente.';
}
async function checkSales(){
 if(checking)return;
 checking=true;paintSales('loading');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try {
  const response=await fetch(apiBemViver+'/health',{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('health-unavailable');
  const s=await response.json();
  paintSales(s.running===true&&s.checkoutEnabled===true&&s.pdfLoaded===true&&s.webhookConfigured===true&&s.sellerIdentityReady===true?'ready':'disabled');
 } catch {paintSales('error');}
 finally {clearTimeout(timer);checking=false;}
}
shortcut.addEventListener('click',event=>{if(!available)event.preventDefault();});
retry.addEventListener('click',checkSales);
void track('offer_view');
void checkSales();
formCheckout.addEventListener('submit',async event=>{
 event.preventDefault();
 if(botaoCheckout.disabled||!available)return;
 const email=document.getElementById('email-checkout').value.trim();
 if(!email||!formCheckout.reportValidity())return;
 botaoCheckout.disabled=true;
 void track('checkout_submit');
 mensagemCheckout.textContent='Preparando seu pedido com segurança…';
 try{
  const r=await fetch(apiBemViver+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  const data=await r.json();
  if(!r.ok||!data.checkoutUrl)throw new Error('indisponivel');
  const url=new URL(data.checkoutUrl);
  if(url.protocol!=='https:'||!(url.hostname==='mercadopago.com'||url.hostname.endsWith('.mercadopago.com')||url.hostname==='mercadopago.com.br'||url.hostname.endsWith('.mercadopago.com.br')))throw new Error('destino-invalido');
  void track('checkout_open');
  window.location.assign(url.href);
 }catch{
  void track('checkout_error');
  mensagemCheckout.textContent='Não foi possível iniciar o checkout. Nenhum pagamento foi feito. Use o atendimento para obter ajuda.';
  botaoCheckout.disabled=false;
 }
});
document.getElementById('copy').addEventListener('click',async()=>{
 const message='Olá! Tenho uma dúvida sobre a compra do Guia BemViver IA de 30 receitas por R$ 14,90 e o download do PDF após o pagamento.';
 const status=document.getElementById('copy-status');
 try{await navigator.clipboard.writeText(message);status.textContent='Mensagem copiada. Cole no seu e-mail de atendimento.'}
 catch{status.textContent='Copie esta mensagem: '+message}
});
