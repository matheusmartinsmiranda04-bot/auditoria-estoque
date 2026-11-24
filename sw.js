/* AUDITORIA DE ESTOQUE — service worker: permite abrir o sistema sem internet depois do primeiro acesso. */
const CACHE='auditoria-v4';
const LIB='./vendor/xlsx.full.min.js';
const ARQUIVOS=['./','./index.html',LIB,'./vendor/qrcode.js','./config.js','./colab.js','./demo/planilha-demonstracao.xlsx'];
const LIB_URL=new URL(LIB,self.location).href;

// Só instala se TODOS os arquivos forem guardados; se algo falhar, a versão anterior continua valendo.
// cache:'reload' ignora o cache HTTP, para não guardar uma página antiga junto com a biblioteca nova.
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARQUIVOS.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));
});

// Apaga apenas caches antigos deste sistema (outros sites podem usar o mesmo domínio github.io).
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('auditoria-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  const guardar=res=>{if(res.ok){const cp=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}))}return res};
  // Biblioteca (versão fixa): usa a cópia guardada; baixa só se ainda não tiver.
  if(url.href===LIB_URL){
    e.respondWith(caches.open(CACHE).then(c=>c.match(LIB)).then(m=>m||fetch(req).then(guardar)));
    return;
  }
  // Página do sistema: tenta a versão mais nova na internet; sem conexão, usa a cópia guardada.
  e.respondWith(fetch(req).then(guardar).catch(async()=>{
    const c=await caches.open(CACHE),m=await c.match(req,{ignoreSearch:true});
    if(m)return m;
    return (req.mode==='navigate'&&(await c.match('./index.html')))||Response.error();
  }));
});
