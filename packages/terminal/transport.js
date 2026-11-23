const key='shadowcompute-companion-v1';
export function validateCompanionUrl(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.port||Number(url.port)<1024||Number(url.port)>65535)throw new Error('Use an HTTP localhost or 127.0.0.1 companion URL with its port.');
 return url.origin;
}
export function createTransport({location,storage,fetcher=fetch}){
 const hosted=!['localhost','127.0.0.1'].includes(location.hostname);let pairing=null,localToken='';
 function configure(url,token){const origin=validateCompanionUrl(url);if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Paste the 64-character code from your local companion.');pairing={origin,token};storage.setItem(key,JSON.stringify(pairing));}
 if(hosted){try{const saved=JSON.parse(storage.getItem(key));if(saved)configure(saved.origin,saved.token);}catch{storage.removeItem(key);}}
 return {hosted,get configured(){return !hosted||!!pairing;},configure,disconnect(){pairing=null;localToken='';storage.removeItem(key);},async request(path,body){
  if(!/^\/api\/[a-z/-]+$/.test(path))throw new Error('Invalid companion request');
  if(hosted&&!pairing)throw new Error('Connect your local demo companion first.');
  if(hosted&&path==='/api/session')return {token:pairing.token};
  let response;
  try{response=await fetcher((hosted?pairing.origin:'')+path,{method:body?'POST':'GET',headers:{'x-console-token':hosted?pairing.token:localToken,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(path.endsWith('/inference')?420000:30000)});}catch{throw new Error('Companion unreachable. Start it, allow this exact website origin and permit local network access in your browser.');}
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Companion request failed');if(!hosted&&path==='/api/session')localToken=result.token;return result;
 }};
}
