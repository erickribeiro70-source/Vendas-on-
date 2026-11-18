const allowedSources = ['instagram','facebook','threads','whatsapp','tiktok','youtube','direct'];
let campaignSource='direct';
const params=new URLSearchParams(location.search);
try {
 const incoming=params.get('utm_source');
 const stored=sessionStorage.getItem('bv_source');
 campaignSource=allowedSources.includes(incoming)?incoming:allowedSources.includes(stored)?stored:'direct';
 if(incoming&&allowedSources.includes(incoming))sessionStorage.setItem('bv_source',incoming);
} catch {}
export function campaignLink(path){return path+(path.includes('?')?'&':'?')+'utm_source='+encodeURIComponent(campaignSource);}
export function track(event){
 if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return Promise.resolve();
 // QA events do not enter sales metrics. No full URLs, referrers, cookies or IDs are sent.
 const test=params.get('qa')==='1';
 return fetch('https://bemviver-ia-api.onrender.com/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,source:campaignSource,test}),credentials:'omit',referrerPolicy:'no-referrer',keepalive:true}).catch(()=>{});
}
