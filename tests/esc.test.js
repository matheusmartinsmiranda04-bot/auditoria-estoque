// Escape de HTML: node tests/esc.test.js
const fs=require('fs'),path=require('path'),assert=require('assert');
const esc=new Function(/^const esc=.*$/m.exec(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'))[0]+';return esc')();
assert.strictEqual(esc(`<a b='c' d="e">&</a>`),'&lt;a b=&#39;c&#39; d=&quot;e&quot;&gt;&amp;&lt;/a&gt;');assert.strictEqual(esc(null),'');
console.log('OK: esc');
