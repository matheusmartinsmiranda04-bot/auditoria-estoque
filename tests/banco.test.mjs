// Testes do banco em PostgreSQL real (PGlite). Uso: npm i --no-save @electric-sql/pglite && node tests/banco.test.mjs
import {createRequire} from 'module';import fs from 'fs';import path from 'path';import assert from 'assert';import {fileURLToPath,pathToFileURL} from 'url';import {randomUUID} from 'crypto';
const aqui=path.dirname(fileURLToPath(import.meta.url)),req=createRequire(path.join(process.env.PGLITE_DIR||aqui,'x.js'));
const {PGlite}=await import(pathToFileURL(req.resolve('@electric-sql/pglite')));
const sql=fs.readFileSync(path.join(aqui,'..','supabase','conferencia.sql'),'utf8');
const db=await PGlite.create();await db.exec('create role anon nologin;create role authenticated nologin;');await db.exec(sql);await db.exec(sql);   // idempotente
await db.query("select conferencia.definir_codigo('codigo-de-teste-1')");await assert.rejects(db.query("select conferencia.definir_codigo('curto')"));
const rpc=async(f,a)=>{await db.exec('set role anon');try{const k=Object.keys(a);return (await db.query(`select public.${f}(${k.map((x,i)=>x+'=>$'+(i+1)).join(',')}) r`,k.map(x=>typeof a[x]==='object'?JSON.stringify(a[x]):a[x]))).rows[0].r}finally{await db.exec('reset role')}};
const T='t'.repeat(40),D='d'.repeat(40),A=randomUUID(),B=randomUUID(),p1=randomUUID(),p2=randomUUID();
const sinc=(sala,token,desde,ev,part=p1)=>rpc('sincronizar',{p_sala:sala,p_token:token,p_desde:desde,p_eventos:ev,p_part:part,p_nome:'n'});
await assert.rejects(rpc('criar_sala',{p_codigo:'errado',p_sala:A,p_token:T,p_dono:D,p_arquivo:'x'}),/CODIGO_INVALIDO/);
await rpc('criar_sala',{p_codigo:'codigo-de-teste-1',p_sala:A,p_token:T,p_dono:D,p_arquivo:'cifrado'});
await rpc('criar_sala',{p_codigo:'codigo-de-teste-1',p_sala:A,p_token:T,p_dono:D,p_arquivo:'outro'});              // repetir não troca o arquivo
await rpc('criar_sala',{p_codigo:'codigo-de-teste-1',p_sala:B,p_token:'b'.repeat(40),p_dono:D,p_arquivo:'B'});
assert.strictEqual(await rpc('abrir_sala',{p_sala:A,p_token:T}),'cifrado');
for(const [s,t] of [[A,'x'.repeat(40)],[A,''],[A,null],[B,T],[randomUUID(),T]]){await assert.rejects(rpc('abrir_sala',{p_sala:s,p_token:t}),/SALA_INEXISTENTE/);await assert.rejects(sinc(s,t,0,[]),/SALA_INEXISTENTE/)}
const o1=randomUUID(),o2=randomUUID(),o3=randomUUID();
let r=await sinc(A,T,0,[{op:o1,dados:'1'},{op:o2,dados:'2'}]);assert.deepStrictEqual(r.eventos.map(e=>e.seq),[1,2]);
r=await sinc(A,T,0,[{op:o1,dados:'1'},{op:o3,dados:'3'}],p2);assert.deepStrictEqual(r.eventos.map(e=>e.dados),['1','2','3']);   // reenvio não duplica
assert.deepStrictEqual((await sinc(A,T,2,[])).eventos.map(e=>e.op),[o3]);assert.strictEqual((await sinc(A,T,3,[])).participantes.length,2);
assert.strictEqual((await sinc(B,'b'.repeat(40),0,[])).eventos.length,0);                                         // salas isoladas
await assert.rejects(sinc(A,T,0,[{op:o1,dados:'x'.repeat(5000)}]),/DADOS_INVALIDOS/);await assert.rejects(sinc(A,T,0,{a:1}),/DADOS_INVALIDOS/);
await db.exec('set role anon');
for(const t of ['ajustes','salas','eventos','participantes'])for(const q of [`select * from conferencia.${t}`,`delete from conferencia.${t}`])await assert.rejects(db.query(q),/permission denied/);
await assert.rejects(db.query("select conferencia.definir_codigo('tentativa-de-invasao')"),/permission denied/);await db.exec('reset role');
await assert.rejects(rpc('apagar_sala',{p_sala:A,p_dono:T}),/SALA_INEXISTENTE/);await rpc('apagar_sala',{p_sala:A,p_dono:D});
await assert.rejects(rpc('abrir_sala',{p_sala:A,p_token:T}),/SALA_INEXISTENTE/);assert.strictEqual((await db.query('select count(*)::int n from conferencia.eventos')).rows[0].n,0);
console.log('OK: banco');
