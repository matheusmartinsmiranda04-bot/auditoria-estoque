'use strict';
/* CONFERÊNCIA EM DUPLA — duas pessoas contando a mesma auditoria ao mesmo tempo.
   - Cada lançamento é um evento com identificador único (op); reenviar nunca duplica.
   - Eventos entram numa fila salva no aparelho e só saem dela quando o servidor confirma.
   - Planilha, códigos e quantidades são cifrados aqui (AES-GCM). A chave vai só no link (#...), que não é enviado ao servidor. */
const Colab=(()=>{
 const cfg=()=>window.AUDITORIA_CONFIG||{},ligado=()=>!!(cfg().supabaseUrl&&cfg().supabaseKey&&window.crypto&&crypto.subtle);
 const b64u=u=>{let s='';u=new Uint8Array(u);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
 const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const rnd=n=>b64u(crypto.getRandomValues(new Uint8Array(n))),enc=new TextEncoder(),dec=new TextDecoder();
 let timer=0,rodando=false,denovo=false,chave=null,chaveDe='',falhas=0;
 const V={online:false,part:[],erro:''};                                  // situação da conexão (não é salva)

 /* ---------- cifra ---------- */
 async function key(k){if(chaveDe!==k){chave=await crypto.subtle.importKey('raw',unb64u(k),'AES-GCM',false,['encrypt','decrypt']);chaveDe=k}return chave}
 async function cifrar(k,obj,ctx){const iv=crypto.getRandomValues(new Uint8Array(12)),c=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(ctx)},await key(k),enc.encode(JSON.stringify(obj)));
  const u=new Uint8Array(12+c.byteLength);u.set(iv);u.set(new Uint8Array(c),12);return b64u(u)}
 async function decifrar(k,s,ctx){const u=unb64u(s);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12),additionalData:enc.encode(ctx)},await key(k),u.slice(12))))}

 /* ---------- servidor ---------- */
 const MSG={CODIGO_INVALIDO:'Código de criação incorreto.',SALA_INEXISTENTE:'Esta conferência não existe mais ou o link está incompleto.',LIMITE_SALAS:'Limite de conferências no servidor. Apague alguma antiga.',LIMITE_EVENTOS:'Limite de lançamentos desta conferência.',LIMITE_PARTICIPANTES:'Limite de participantes desta conferência.',DADOS_INVALIDOS:'O servidor recusou os dados enviados.'};
 async function rpc(f,args){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),20000);
  try{const r=await fetch(cfg().supabaseUrl.replace(/\/+$/,'')+'/rest/v1/rpc/'+f,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg().supabaseKey},body:JSON.stringify(args),signal:ac.signal,cache:'no-store',referrerPolicy:'no-referrer'});
   const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null}catch(e){}
   if(!r.ok){const c=Object.keys(MSG).find(k=>String(j&&j.message||'').includes(k)),e=new Error(c?MSG[c]:'O servidor respondeu com erro '+r.status+'.');e.code=c||'HTTP';throw e}
   return j}
  catch(e){if(e.code)throw e;const x=new Error('Sem conexão com o servidor.');x.code='REDE';throw x}
  finally{clearTimeout(t)}}

 /* ---------- eventos ---------- */
 const novoId=()=>crypto.randomUUID();
 const eu=()=>({por:S.sala.part,nome:S.sala.nome});
 const evDe=h=>({k:'c',key:h.key,code:h.code,q:h.q,t:+h.t,por:h.por,nome:h.nome});
 const conhecida=op=>S.sala.anul.includes(op)||S.hist.some(h=>h.op===op)||S.unapplied.some(h=>h.op===op);
 function fila(op,ev){S.sala.fila.push({op,ev})}
 function lancar(h){if(!S.sala)return;h.op=novoId();Object.assign(h,eu());fila(h.op,evDe(h));agendar(0)}
 function anular(h){if(!S.sala||!h.op)return;S.sala.anul.push(h.op);fila(novoId(),{k:'x',ref:h.op,t:Date.now(),...eu()});agendar(0)}
 const txtOk=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n;
 /* Aplica um evento recebido. Devolve true se mudou algo. */
 function aplicar(op,e){
  if(!e||!txtOk(e.por,60)||typeof e.nome!=='string'||!Number.isFinite(e.t))return false;
  if(e.k==='x'){if(!txtOk(e.ref,60)||S.sala.anul.includes(e.ref))return false;S.sala.anul.push(e.ref);
   const h=S.hist.find(x=>x.op===e.ref);if(h)tirarLancamento(h);S.unapplied=S.unapplied.filter(x=>x.op!==e.ref);return true}
  if(e.k!=='c'||!txtOk(e.code,80)||!txtOk(e.key,80)||!Number.isFinite(e.q)||e.q<0||conhecida(op))return false;
  const nome=e.nome.slice(0,40),info=S.ok?lookup(e.code):null;S.hid++;
  if(!info){S.unapplied.push({id:S.hid,key:e.key,code:e.code,q:e.q,t:new Date(e.t),op,por:e.por,nome});return true}
  const meu=S.hist.some(h=>h.key===info.key&&h.por===S.sala.part);
  applyCount(info,e.q,new Date(e.t),S.hid,{op,por:e.por,nome});
  if(e.por!==S.sala.part&&meu){toast(`Atenção: ${nome} também contou ${info.code}`,1);vibrate(80)}
  return true}

 /* ---------- sincronização ---------- */
 function agendar(ms){clearTimeout(timer);if(S.sala)timer=setTimeout(sincronizar,ms)}
 async function sincronizar(){
  if(!S.sala||!S.wb)return;if(rodando){denovo=true;return}
  rodando=true;denovo=false;const sala=S.sala;let mais=false;
  try{
   const lote=sala.fila.slice(0,100),evs=[];
   for(const f of lote)evs.push({op:f.op,dados:await cifrar(sala.key,f.ev,sala.id+f.op)});
   const r=await rpc('sincronizar',{p_sala:sala.id,p_token:sala.token,p_desde:sala.seq,p_eventos:evs,p_part:sala.part,p_nome:await cifrar(sala.key,sala.nome,sala.id+'nome')});
   const prontos=[];for(const x of r.eventos||[]){let e=null;try{e=await decifrar(sala.key,x.dados,sala.id+x.op)}catch(err){console.warn('evento ilegível ignorado',x.seq)}prontos.push([x,e])}
   const part=[];for(const p of r.participantes||[]){let n='Participante';try{n=String(await decifrar(sala.key,p.nome,sala.id+'nome')).slice(0,40)}catch(e){}part.push({id:p.id,nome:n,ativo:!!p.ativo})}
   if(S.sala!==sala)return;                                               // saiu da conferência enquanto esperava
   let mudou=false;for(const [x,e] of prontos){if(e&&aplicar(x.op,e)){mudou=true;S.dirty=true}sala.seq=Math.max(sala.seq,x.seq)}
   const ok=new Set(lote.map(f=>f.op));sala.fila=sala.fila.filter(f=>!ok.has(f.op));
   mais=sala.fila.length>0||prontos.length>=500;
   V.online=true;V.erro='';V.part=part;falhas=0;
   if(prontos.length||lote.length){if(mudou){if(cur)onCode();refresh()}await persist()}
  }catch(e){if(S.sala===sala){V.online=false;V.erro=e.message;falhas++;if(e.code!=='REDE')console.warn(e)}}
  finally{rodando=false;render();if(S.sala)agendar(denovo||mais?50:falhas?Math.min(3000*falhas,15000):document.hidden?15000:2500)}}

 /* ---------- criar, entrar, sair ---------- */
 const link=s=>location.origin+location.pathname+'#dupla='+[s.id,s.token,s.key].join('.');
 function lerLink(){const m=/^#dupla=([0-9a-f-]{36})\.([\w-]{32,64})\.([\w-]{43})$/.exec(location.hash);return m?{id:m[1],token:m[2],key:m[3]}:null}
 const limparLink=()=>{if(location.hash.startsWith('#dupla='))history.replaceState(null,'',location.pathname+location.search)};
 async function criar(codigo,nome){
  const s={id:novoId(),token:rnd(32),dono:rnd(32),key:rnd(32),part:novoId(),nome,seq:0,anul:[],fila:[]},buf=S.buf;
  const meta=await cifrar(s.key,{nome:S.file,b64:b64u(buf),cfg:S.cfg,fid:S.fid},s.id+'arquivo');
  if(meta.length>8000000)throw new Error('A planilha é grande demais para a conferência em dupla.');
  await rpc('criar_sala',{p_codigo:codigo,p_sala:s.id,p_token:s.token,p_dono:s.dono,p_arquivo:meta});
  if(S.buf!==buf)throw new Error('A planilha mudou durante a criação. Tente de novo.');
  S.sala=s;for(const h of [...S.hist,...S.unapplied].sort((a,b)=>a.id-b.id)){h.op=novoId();Object.assign(h,eu());fila(h.op,evDe(h))}
  refresh();await persist();await sincronizar()}
 async function entrar(l,nome){
  const meta=await decifrar(l.key,await rpc('abrir_sala',{p_sala:l.id,p_token:l.token}),l.id+'arquivo').catch(e=>{throw e.code?e:new Error('O link está incompleto ou foi alterado.')});
  const buf=unb64u(meta.b64).buffer,wb=readWorkbook(buf),c=meta.cfg;
  if(!c||![c.base,c.cont].every(x=>x&&wb.SheetNames.includes(x.sheet)&&Number.isInteger(x.hr)&&x.cols&&typeof x.cols==='object'))throw new Error('A conferência recebida está inválida.');
  loadWorkbook(wb,buf,String(meta.nome),newId());S.cfg=meta.cfg;build();
  S.sala={id:l.id,token:l.token,key:l.key,part:novoId(),nome,seq:0,anul:[],fila:[]};
  cur=null;$('#code').value='';onCode();refresh();await persist();await sincronizar()}
 async function sair(apagar){const s=S.sala;if(!s)return;
  if(apagar)await rpc('apagar_sala',{p_sala:s.id,p_dono:s.dono});
  clearTimeout(timer);S.sala=null;V.online=false;V.part=[];V.erro='';refresh();await persist()}

 /* ---------- telas ---------- */
 const campo=(id,rot,at)=>[el('label',{class:'lbl',for:id},rot),el('input',{class:'input small',id,autocomplete:'off',...at})];
 function modal(titulo,corpo,botoes){return new Promise(res=>{const d=$('#dlg');let r=null;
  const erro=el('div',{class:'alert e',role:'alert'});erro.hidden=true;
  d.replaceChildren(el('form',{class:'stack'},el('h2',null,titulo),...corpo,erro,...botoes.map((b,i)=>el('button',{class:'btn '+(b.cls||'secondary'),type:i?'button':'submit','data-i':i},b.txt))));
  const f=d.firstChild;const agir=async i=>{const b=botoes[i],els=f.querySelectorAll('button');
   if(!b.acao){d.close();return}erro.hidden=true;els.forEach(x=>x.disabled=true);
   try{r=await b.acao();if(r!==false)d.close()}catch(e){console.warn(e);erro.textContent=e.message;erro.hidden=false}finally{els.forEach(x=>x.disabled=false)}};
  f.onsubmit=e=>{e.preventDefault();agir(0)};f.onclick=e=>{const b=e.target.closest('button[data-i]');if(b&&b.dataset.i!=='0')agir(+b.dataset.i)};
  d.onclose=()=>res(r);d.showModal();const i=f.querySelector('input');if(i)i.focus()})}
 const pegarNome=()=>{const n=$('#dNome').value.trim().slice(0,30);if(!n)throw new Error('Informe seu nome.');localPref('nome',n);return n};
 const P=t=>el('p',{class:'muted dlg-p'},t);
 async function telaCriar(){if(!S.ok)return toast('Importe uma planilha válida primeiro',1);
  await modal('Conferir em dupla',[P('A planilha e as contagens são cifradas neste aparelho antes de ir para o servidor. Quem tiver o link poderá ver e contar.'),...campo('dNome','Seu nome',{maxlength:30,value:localPref('nome')||''}),...campo('dCod','Código de criação',{type:'password'})],
   [{txt:'Criar conferência',cls:'primary',acao:async()=>{const n=pegarNome();await criar($('#dCod').value.trim(),n);return true}},{txt:'Cancelar'}])
   &&telaConvite()}
 function telaConvite(){const u=link(S.sala),q=qrcode(0,'L');q.addData(u);q.make();
  const n=q.getModuleCount(),svg=document.createElementNS(SVG,'svg'),p=document.createElementNS(SVG,'path');let d='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))d+=`M${x+4} ${y+4}h1v1h-1z`;
  svg.setAttribute('viewBox',`0 0 ${n+8} ${n+8}`);svg.setAttribute('class','qr');svg.setAttribute('role','img');svg.setAttribute('aria-label','QR code do convite');p.setAttribute('d',d);svg.append(p);
  const bs=[{txt:'Fechar',cls:'primary'},{txt:'Copiar link',acao:async()=>{await navigator.clipboard.writeText(u);toast('Link copiado');return false}}];
  if(navigator.share)bs.push({txt:'Compartilhar convite',acao:async()=>{try{await navigator.share({title:'Auditoria de Estoque',text:'Entre na conferência:',url:u})}catch(e){if(e.name!=='AbortError')throw e}return false}});
  return modal('Convidar a segunda pessoa',[P('Aponte a câmera do outro celular para o código. Trate o link como uma senha: quem o tiver vê a auditoria.'),svg],bs)}
 async function telaEntrar(l){if(S.sala&&S.sala.id===l.id){limparLink();return}
  if(!ligado()){limparLink();toast('Conferência em dupla indisponível neste endereço',1);return}
  const av=S.sala?'Você já está em outra conferência neste aparelho; ela será substituída.':S.wb&&(S.dirty||S.hist.length)?'Há uma auditoria neste aparelho. Entrar vai substituí-la; exporte antes se precisar dela.':'';
  await modal('Entrar na conferência',[...(av?[alertBox('w','alert',av)]:[]),P('Informe seu nome para a outra pessoa saber quem contou.'),...campo('dNome','Seu nome',{maxlength:30,value:localPref('nome')||''})],
   [{txt:'Entrar',cls:'primary',acao:async()=>{await entrar(l,pegarNome());return true}},{txt:'Cancelar'}]);
  limparLink()}
 const telaSair=()=>{const pend=S.sala.fila.length,dono=!!S.sala.dono;
  return modal('Sair da conferência',[...(pend?[alertBox('e','alert',`${pend} lançamento(s) deste aparelho ainda não chegaram à outra pessoa.`)]:[]),P('As contagens recebidas continuam neste aparelho. Depois de sair, os lançamentos deixam de ser compartilhados.')],
   [{txt:'Continuar na conferência',cls:'primary'},{txt:'Sair',acao:()=>sair(false)},...(dono?[{txt:'Sair e apagar do servidor',cls:'ghost-danger',acao:()=>sair(true)}]:[])])};

 function render(){
  const on=ligado()&&S.ok,s=S.sala;$('#dupCard').hidden=!(on||s)||!S.wb;if($('#dupCard').hidden)return;
  $('#dupOff').hidden=!!s;$('#dupOn').hidden=!s;if(!s)return;
  const outros=V.part.filter(p=>p.id!==s.part),at=outros.filter(p=>p.ativo),n=s.fila.length;
  $('#dupDot').className='dot '+(V.online?'ok':'off');
  $('#dupTxt').textContent=V.online?(at.length?'Conferindo com '+at.map(p=>p.nome).join(', '):outros.length?outros.map(p=>p.nome).join(', ')+' está ausente agora':'Aguardando a segunda pessoa'):(V.erro||'Conectando…');
  $('#dupFila').textContent=n?n+' lançamento(s) aguardando envio, guardados neste aparelho':V.online?'Tudo enviado':'Os lançamentos ficam guardados neste aparelho';
  const por=new Map();for(const h of S.hist){const k=h.por||'',o=por.get(k)||{nome:h.por===s.part?s.nome+' (você)':h.nome||'—',n:0};o.n++;por.set(k,o)}
  $('#dupPor').replaceChildren(...[...por.values()].map(o=>el('div',{class:'fact'},el('span',null,o.nome),el('b',{class:'num'},o.n),el('small',{class:'muted'},' lançamentos'))))}
 /* Quem já contou o material, fora eu */
 function outros(k){if(!S.sala)return [];const m=new Map();for(const h of S.hist)if(h.key===k&&h.por!==S.sala.part){const o=m.get(h.por)||{nome:h.nome,q:0,t:h.t};o.q+=h.q;if(h.t>o.t)o.t=h.t;m.set(h.por,o)}return [...m.values()]}
 const repetidos=()=>{const m=new Map();for(const h of S.hist){if(!m.has(h.key))m.set(h.key,new Set());m.get(h.key).add(h.por)}return new Set([...m].filter(([,s])=>s.size>1).map(([k])=>k))};
 function iniciar(){
  $('#bDup').onclick=telaCriar;$('#bConv').onclick=telaConvite;$('#bSairDup').onclick=telaSair;
  window.addEventListener('online',()=>agendar(0));document.addEventListener('visibilitychange',()=>{if(!document.hidden)agendar(0)});
  const abrir=()=>{const l=lerLink();if(l)telaEntrar(l);else if(location.hash.startsWith('#dupla=')){limparLink();toast('O link de convite está incompleto',1)}};
  window.addEventListener('hashchange',abrir);render();agendar(0);abrir()}
 /* Espera a sincronização em andamento e faz mais uma (usado antes de exportar). */
 async function sincronizarJa(){for(let i=0;rodando&&i<200;i++)await new Promise(r=>setTimeout(r,100));await sincronizar()}
 const pendente=()=>!!S.sala&&(S.sala.fila.length>0||!V.online);
 return{ligado,lancar,anular,render,iniciar,outros,repetidos,pendente,sincronizarJa,situacao:V}
})();
