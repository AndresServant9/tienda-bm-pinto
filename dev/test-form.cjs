'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(condition)=>{const limit=Date.now()+10000;while(!condition()&&Date.now()<limit)await pause(25);assert.ok(condition(),'respuesta del formulario dentro del plazo');};
(async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'inscripciones.html'),'utf8'),{url:'http://127.0.0.1:8140/inscripciones',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[];w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.Request=Request;
 w.fetch=async(input,init)=>{const url=new URL(String(input),w.location.href);assert.equal(url.origin,'http://127.0.0.1:8140','ninguna llamada externa');requests.push(url.pathname);return fetch(url,init);};
 w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=message=>{throw Error(message)};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 try{
  for(const file of ['dev-guard.js','club-auth.js','dorsales.js','dorsal-picker.js','transferencias.js','justificantes.js','inscripcion.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  const player=w.document.querySelector('.player'),field=name=>player.querySelector('[name="'+name+'"]');
  const change=(name,value)=>{field(name).value=value;field(name).dispatchEvent(new w.Event('change',{bubbles:true}));};
  change('playerName','Nuevo de prueba');change('birth','2015-02-01');change('division','male');await until(()=>!field('dorsal').disabled&&field('dorsal').options.length>1);
  let numbers=[...field('dorsal').options].map(x=>x.value);assert.ok(!numbers.includes('7'));const chosen=numbers.find(n=>Number(n)>=20);assert.ok(chosen);assert.equal(field('dorsal').disabled,false);
  const picker=player.querySelector('.dorsal-picker-button'),dialog=player.querySelector('.dorsal-dialog');
  picker.click();assert.equal(dialog.open,true);assert.equal(player.querySelector('[data-dorsal-choice="7"]'),null);
  const search=dialog.querySelector('input');search.value=chosen;search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(dialog.querySelectorAll('[data-dorsal-choice]').length,1);dialog.querySelector('[data-dorsal-choice="'+chosen+'"]').click();assert.equal(field('dorsal').value,chosen);assert.equal(dialog.open,false);assert.ok(picker.textContent.includes('Dorsal '+chosen));
  picker.click();search.value='7';search.dispatchEvent(new w.Event('input'));assert.equal(dialog.querySelector('.dorsal-grid-empty').hidden,false);dialog.querySelector('.dorsal-dialog-heading button').click();assert.equal(dialog.open,false);
  change('birth','2016-02-01');await until(()=>!field('dorsal').disabled);assert.ok([...field('dorsal').options].some(x=>x.value==='7'));
  change('birth','2015-02-01');change('division','female');await until(()=>!field('dorsal').disabled);assert.ok([...field('dorsal').options].some(x=>x.value==='7'));
  await w.ClubAuth.signIn('familia@example.test','PruebaLocal123!');change('playerName','Lucas de ejemplo');change('division','male');await until(()=>field('dorsal').value==='12');
  assert.equal(field('dorsal').value,'12');assert.match(player.querySelector('.dorsal-status').textContent,/conserva/);
  field('noPlayerId').checked=true;field('noPlayerId').dispatchEvent(new w.Event('change',{bubbles:true}));change('address','Domicilio ficticio');change('town','Pinto');change('registeredInPinto','Sí');change('hasKit','yes');change('hasHealth','no');for(const name of ['outings','transport','images'])change(name,'No');
  const form=w.document.querySelector('#registration');for(const [name,value]of Object.entries({contact:'Familia de ejemplo',contactIdentifier:'00000000T',email:'familia@example.test',phone:'600000000'}))form.elements[name].value=value;form.elements.privacyRead.checked=true;
  assert.equal(form.checkValidity(),true);await form.onsubmit(new w.Event('submit',{cancelable:true}));
  assert.equal(w.document.querySelector('#summary').hidden,false);assert.match(w.document.querySelector('#breakdown').textContent,/Dorsal 12/);
  // Una respuesta antigua no puede pisar la rama o nacimiento elegidos despues.
  let unblock;const previousFetch=w.fetch;w.fetch=async(input,init)=>{const p=JSON.parse(init?.body||'{}');if(p.p_birth==='2016-03-03'){await new Promise(resolve=>{unblock=resolve;});return new Response(JSON.stringify({available:[99],own_number:null}),{headers:{'Content-Type':'application/json'}});}return previousFetch(input,init);};
  change('birth','2016-03-03');await until(()=>typeof unblock==='function');change('birth','2015-02-01');await until(()=>field('dorsal').value==='12');unblock();await pause(50);assert.equal(field('dorsal').value,'12');
  // Dos hermanos con un dorsal historico coincidente deben poder revisar juntos.
  w.fetch=async(input,init)=>{const body=JSON.parse(init?.body||'{}');if(String(input).includes('dorsal_options'))return new Response(JSON.stringify({available:[24],own_number:24,preserved:true}),{headers:{'Content-Type':'application/json'}});return previousFetch(input,init);};
  change('playerName','Historico A');change('birth','2013-04-15');await pause(100);
  w.document.querySelector('#add').click();const second=[...w.document.querySelectorAll('.player')][1];
  const secondField=name=>second.querySelector('[name="'+name+'"]');
  for(const [name,value]of Object.entries({playerName:'Historico B',birth:'2010-04-15',division:'male',address:'Domicilio ficticio',town:'Pinto',registeredInPinto:'Sí',hasKit:'yes',hasHealth:'no',outings:'No',transport:'No',images:'No'})){secondField(name).value=value;secondField(name).dispatchEvent(new w.Event('change',{bubbles:true}));}
  secondField('noPlayerId').checked=true;secondField('noPlayerId').dispatchEvent(new w.Event('change',{bubbles:true}));await pause(150);
  await form.onsubmit(new w.Event('submit',{cancelable:true}));assert.equal(w.document.querySelector('#summary').hidden,false);assert.equal((w.document.querySelector('#breakdown').textContent.match(/Dorsal 24/g)||[]).length,2);
  assert.equal(field('dorsal').dataset.preserved,'true');assert.equal(secondField('dorsal').dataset.preserved,'true');
  console.log('PASS DOM: selector compacto, busqueda, numeros ocupados, cierre, cambio de nacimiento/rama, dorsal propio, resumen, respuesta desactualizada y peticiones solo locales.');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
