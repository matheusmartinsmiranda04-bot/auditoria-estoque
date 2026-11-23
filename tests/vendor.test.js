// Integridade e APIs do SheetJS local: node tests/vendor.test.js
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const f=path.join(__dirname,'..','vendor','xlsx.full.min.js');
assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
const X=require(f);assert.strictEqual(X.version,'0.20.3');
for(const k of ['read','write'])assert.strictEqual(typeof X[k],'function',k);
for(const k of ['encode_cell','decode_cell','encode_range','decode_range','encode_col'])assert.strictEqual(typeof X.utils[k],'function',k);
for(const k of ['read','write'])assert.strictEqual(typeof X.CFB[k],'function','CFB.'+k);
assert.strictEqual(typeof X.CFB.utils.cfb_del,'function');
console.log('OK: SheetJS',X.version);
