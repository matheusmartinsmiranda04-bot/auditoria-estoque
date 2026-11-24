// Migração do estado salvo no aparelho: node tests/migracao.test.js
const fs=require('fs'),path=require('path'),assert=require('assert');
const t=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=new Function(/const ESQUEMA=[\s\S]*?return st\}/.exec(t)[0]+';return migrarEstado')();
const h=[{id:1,key:'1',code:'1',q:2,t:3}];
const v1=m({cfg:{},dirty:true,hist:h});assert.deepStrictEqual([v1.v,v1.fid,v1.pend,v1.sala,v1.hist],[3,null,[],null,h]);
const v2=m({v:2,fid:'a',pend:h,hist:h});assert.deepStrictEqual([v2.v,v2.fid,v2.pend,v2.sala],[3,'a',h,null]);
const s={id:'i',token:'t',key:'k',fila:[],anul:[]};assert.deepStrictEqual(m({v:3,hist:[],pend:[],sala:s}).sala,s);
assert.strictEqual(m({v:3,sala:{id:'i'}}).sala,null);assert.strictEqual(m(null),null);
console.log('OK: migração');
