'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){
 const html=fs.readFileSync(path.join(root,file),'utf8'),dom=new JSDOM(html);
 assert.equal(dom.window.document.querySelectorAll('script[src="dev-guard.js"]').length,0,'guarda de demostracion en '+file);
 for(const element of dom.window.document.querySelectorAll('script[src],link[rel=stylesheet]')){
  const value=element.getAttribute('src')||element.getAttribute('href');
  if(!value||/^(https?:|data:|\/\/)/.test(value))continue;
  assert.ok(fs.existsSync(path.join(root,value.split('?')[0].replace(/^\//,''))),'recurso ausente '+file+' '+value);
 }
 dom.window.close();
}
const headers=fs.readFileSync(path.join(root,'_headers'),'utf8');
assert.match(headers,/connect-src 'self' https:\/\/dfwnzfznhnkcqrdcydnx\.supabase\.co;/);
assert.match(headers,/frame-ancestors 'none'/);assert.match(headers,/object-src 'none'/);
const original=execFileSync('git',['rev-parse','2c23c7f47c71b945fe48305519fe52b801bda018:index.html'],{cwd:root,encoding:'utf8'}).trim();
const current=execFileSync('git',['hash-object','index.html'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(current,original,'el catalogo y checkout operativos permanecen intactos');
console.log('PASS: paginas publicadas sin demo, recursos locales presentes, CSP de produccion y tienda/checkout intactos.');
