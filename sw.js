/* AUDITORIA DE ESTOQUE — service worker: permite abrir o sistema sem internet depois do primeiro acesso. */
const CACHE='auditoria-v2';
const XLSX_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(['./','./index.html',XLSX_URL].map(u=>c.add(u).catch(()=>{})))));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  // Biblioteca XLSX (versão fixa): usa a cópia guardada; baixa só se ainda não tiver.
  if(url.href===XLSX_URL){
    e.respondWith(caches.match(XLSX_URL).then(m=>m||fetch(req).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(XLSX_URL,cp));return res})));
    return;
  }
  // Página do sistema: tenta a versão mais nova na internet; sem conexão, usa a cópia guardada.
  if(url.origin===self.location.origin){
    e.respondWith(fetch(req).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp))}return res})
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(m=>m||caches.match('./index.html')).then(m=>m||caches.match('./'))));
  }
});
