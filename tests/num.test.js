// Testes de num() e parseNum(): node tests/num.test.js
// Extrai as funções do próprio index.html, para testar exatamente o código publicado.
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=/\/\* \[num:inicio\][\s\S]*?\[num:fim\] \*\//.exec(html)[0];
const {parseNum,num,ambNum}=new Function(src+';return{parseNum,num,ambNum}')();
let n=0;const t=(got,exp,msg)=>{assert.deepStrictEqual(got,exp,msg);n++};
// texto: [entrada, valor, ambíguo]
for(const [s,v,amb] of [['1.234,5',1234.5],['1234,5',1234.5],['1,5',1.5],['1.5',1.5],['1.234',1234,true],['12.345',12345,true],['999.000',999000,true],
 ['-1.234',-1234,true],['0.500',0.5],['1234.567',1234.567],['1.2345',1.2345],['1.234.567',1234567],['1.234.567,89',1234567.89],['1,234',1.234],['1,234.5',1234.5],
 ['1.23,4',null],['1,2,3',null],['1.2.3',null],['10',10],[' 10 ',10],['0',0],['5,',5],[',5',0.5],['',null],['abc',null],['-',null],['1e3',null],['10 UN',null],['1 234,5',1234.5]])
 t(parseNum(s),{v,amb:!!amb},'parseNum '+JSON.stringify(s));
// células
for(const [c,v] of [[null,null],[{t:'n',v:1.234},1.234],[{t:'n',v:1234},1234],[{t:'n',v:0},0],[{t:'s',v:'1.234,5'},1234.5],[{t:'s',v:'1234,5'},1234.5],[{t:'s',v:'1,5'},1.5],
 [{t:'s',v:'1.234'},1234],[{t:'s',v:'10 UN'},10],[{t:'s',v:'1,5kg'},1.5],[{t:'s',v:'1e3'},1000],[{t:'s',v:''},null],[{t:'s',v:'x'},null],[{t:'b',v:true},null],[{t:'n',v:NaN},null],[{t:'z'},null]])
 t(num(c),v,'num '+JSON.stringify(c));
t(ambNum({t:'s',v:'1.234'}),true);t(ambNum({t:'n',v:1.234}),false);t(ambNum({t:'s',v:'1,234'}),false);t(ambNum(null),false);
console.log('OK:',n,'testes');
