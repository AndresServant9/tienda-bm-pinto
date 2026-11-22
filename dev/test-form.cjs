'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'inscripciones.html'),'utf8'),{url:'http://127.0.0.1:8140/inscripciones',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[];w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.Request=Request;
 w.fetch=async(input,init)=>{const url=new URL(String(input),w.location.href);assert.equal(url.origin,'http://127.0.0.1:8140','ninguna llamada externa');requests.push(url.pathname);return fetch(url,init);};
 w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=message=>{throw Error(message)};
 try{
  for(const file of ['dev-guard.js','club-auth.js','dorsales.js','transferencias.js','justificantes.js','inscripcion.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  const player=w.document.querySelector('.player'),field=name=>player.querySelector('[name="'+name+'"]');
  const change=(name,value)=>{field(name).value=value;field(name).dispatchEvent(new w.Event('change',{bubbles:true}));};
  change('playerName','Nuevo de prueba');change('birth','2015-02-01');change('division','male');await pause(650);
  let numbers=[...field('dorsal').options].map(x=>x.value);assert.ok(!numbers.includes('7'));assert.ok(numbers.includes('21'));assert.equal(field('dorsal').disabled,false);
  change('birth','2016-02-01');await pause(300);assert.ok([...field('dorsal').options].some(x=>x.value==='7'));
  change('birth','2015-02-01');change('division','female');await pause(300);assert.ok([...field('dorsal').options].some(x=>x.value==='7'));
  await w.ClubAuth.signIn('familia@example.test','PruebaLocal123!');change('playerName','Lucas de ejemplo');change('division','male');await pause(300);
  assert.equal(field('dorsal').value,'12');assert.match(player.querySelector('.dorsal-status').textContent,/conserva/);
  field('noPlayerId').checked=true;field('noPlayerId').dispatchEvent(new w.Event('change',{bubbles:true}));change('address','Domicilio ficticio');change('town','Pinto');change('registeredInPinto','Sí');change('hasKit','yes');change('hasHealth','no');for(const name of ['outings','transport','images'])change(name,'No');
  const form=w.document.querySelector('#registration');for(const [name,value]of Object.entries({contact:'Familia de ejemplo',contactIdentifier:'00000000T',email:'familia@example.test',phone:'600000000'}))form.elements[name].value=value;form.elements.privacyRead.checked=true;
  assert.equal(form.checkValidity(),true);await form.onsubmit(new w.Event('submit',{cancelable:true}));
  assert.equal(w.document.querySelector('#summary').hidden,false);assert.match(w.document.querySelector('#breakdown').textContent,/Dorsal 12/);
  // Una respuesta antigua no puede pisar la rama o nacimiento elegidos despues.
  let unblock;const previousFetch=w.fetch;w.fetch=async(input,init)=>{const p=JSON.parse(init?.body||'{}');if(p.p_birth==='2016-03-03'){await new Promise(resolve=>{unblock=resolve;});return new Response(JSON.stringify({available:[99],own_number:null}),{headers:{'Content-Type':'application/json'}});}return previousFetch(input,init);};
  change('birth','2016-03-03');await pause(50);change('birth','2015-02-01');await pause(250);unblock();await pause(50);assert.equal(field('dorsal').value,'12');
  console.log('PASS DOM: selector dinamico, cambio de nacimiento/rama, dorsal propio, resumen, respuesta desactualizada y peticiones solo locales.');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
