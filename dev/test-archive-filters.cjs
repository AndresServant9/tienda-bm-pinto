'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.resolve(__dirname,'../archivo-inscripciones.js'),'utf8');
const rows=[...Array.from({length:25},(_,i)=>({source_row:i+1,profile:{name:'Jugador '+i,category:'Alevín',division:'Masculino'}})),...Array.from({length:3},(_,i)=>({source_row:i+26,profile:{name:'Jugadora '+i,category:'Alevín',division:i===1?' FEMENINO ':'Femenino'}})),{source_row:29,profile:{name:'Juvenil',category:'Juvenil',division:'Femenino'}},{source_row:30,profile:{name:'Sin rama',category:'Alevín'}}];
async function run(family){
 const dom=new JSDOM('<main id="'+(family?'family':'registrationsPane')+'"></main>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;let callback;
 w.ClubAuth={subscribe:fn=>{callback=fn;},getSession:async()=>({user:{id:'fixture'}}),isAdmin:async()=>true,authorized:async endpoint=>{assert.ok(endpoint.endsWith(family?'bm_pinto_my_registration_history':'bm_pinto_admin_registration_history'));return rows;}};
 try{
  w.eval(source);await new Promise(r=>setTimeout(r,0));if(!family){w.document.querySelector('button').click();await new Promise(r=>setTimeout(r,0));}
  const section=w.document.querySelector('.registration-history'),status=()=>section.querySelector('[role=status]').textContent,articles=()=>section.querySelectorAll('article');
  const category=section.querySelector('[aria-label="Categoría del formulario anterior"]'),division=section.querySelector('[aria-label="Rama del formulario anterior"]'),search=section.querySelector('input');
  const change=(el,value)=>{el.value=value;el.dispatchEvent(new w.Event(el===search?'input':'change'));};
  assert.match(status(),/30 fichas importadas · 30/);assert.equal(articles().length,20);
  change(category,'Alevín');change(division,'masculino');assert.match(status(),/25 coinciden/);section.querySelector('nav button:last-child').click();assert.equal(articles().length,5);
  change(division,'femenino');assert.equal(articles().length,3);assert.match(section.querySelector('nav p').textContent,/Página 1 de 1/);
  change(search,'Jugadora 2');assert.equal(articles().length,1);assert.equal(articles()[0].querySelector('h2').textContent,'Jugadora 2');
  change(search,'no existe');assert.equal(articles().length,0);assert.match(section.querySelector('nav p').textContent,/No hay fichas/);
  change(search,'');change(category,'');change(division,'');assert.equal(articles().length,20);assert.match(status(),/30 coinciden/);
  await callback(null);assert.equal(section.hidden,true);assert.equal(division.value,'');assert.equal(articles().length,0);
 }finally{dom.window.close();}
}
(async()=>{await run(false);await run(true);console.log('PASS: filtro de rama combinado con categoria/busqueda, normalizacion, paginacion, vacios y cierre de sesion en panel y cuenta familiar.');})().catch(e=>{console.error(e.stack);process.exitCode=1;});
