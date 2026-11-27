'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'ficha-jugador.html'),'utf8'),script=fs.readFileSync(path.join(root,'ficha-jugador.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture(admin=false){return {player:{id:'player-a',name:'Ana <img src=x onerror=alert(1)>',birth:'2018-04-15',profile:{sports:{category:'Benjamín',division:'female'},details:{address:'Calle ficticia'}}},family:{id:'family',name:'Familia de prueba'},siblings:[{id:'player-a',name:'Ana'},{id:'player-b',name:'Pablo'}],contacts:[{name:'Madre',relationship:'mother',email:'familia@example.test',confirmed:true},{name:'Padre',relationship:'father',email:'otra@example.test',confirmed:false}],registrations:[{player:{category:'Benjamín'},shared:true,payments:{total:820,confirmed:80,in_review:0,pending:740,installments:[{due_on:'2026-12-24',amount:740,status:'pending'}]}}],orders_scope:'family',orders:[{reference:'PEDIDO-UNICO',recipient:'Familia',created_at:'2026-11-27',payment_status:'confirmed',total_cents:5700,lines:[{garment:'Chándal',size:'S',quantity:1}]}],memberships:[{name:'Solicitud',kind:'new',season:'2026/2027',rejected_at:'2026-11-27'}],admin};}
async function setup(query,data,admin=false){
 const dom=new JSDOM(html,{url:'http://localhost/ficha-jugador.html'+query,runScripts:'outside-only'}),w=dom.window,calls=[];let subscriber;
 w.ClubAuth={subscribe:fn=>{subscriber=fn;},getSession:async()=>({user:{id:'owner'}}),isAdmin:async()=>admin,authorized:async(endpoint,body)=>{calls.push({endpoint,body});if(endpoint.endsWith('bm_pinto_player_dossier'))return data;if(endpoint.endsWith('bm_pinto_family_players'))return [{id:'player-a',name:'Ana',category:'Benjamín'}];return {needs_family_link:true,archive:{name:'Ana',birth:'2018-04-15',contactEmail:'familia@example.test'}};}};
 w.eval(script);await tick();await tick();return {dom,w,calls,logout:()=>subscriber(null)};
}
(async()=>{
 for(const admin of [false,true]){
  const t=await setup('?player=player-a',fixture(admin),admin),d=t.w.document;
  try{
   assert.match(d.querySelector('#playerTitle').textContent,/<img/);assert.equal(d.querySelectorAll('#playerTitle img').length,0,'nombre se representa como texto');assert.match(d.querySelector('#playerSubtitle').textContent,/Femenino/);
   assert.match(d.querySelector('#playerPayments').textContent,/inscripción compartida/);assert.match(d.querySelector('#playerPayments').textContent,/740,00/);
   assert.equal(d.querySelectorAll('#playerOrders article').length,1);assert.match(d.querySelector('#playerOrders').textContent,/Cada compra se registra una sola vez/);
   assert.match(d.querySelector('#playerMemberships').textContent,/Rechazada/);assert.match(d.querySelector('#playerFamily').textContent,/Pendiente de confirmar/);
   assert.equal(d.querySelector('#playerFamily').textContent.includes('Vincular cuenta familiar'),admin);
   assert.match(d.querySelector('#playerFamily a:last-child').href,/player=player-b/);
   await t.logout();assert.equal(d.querySelector('#playerSections').hidden,true);assert.equal(d.querySelector('#playerFamily').textContent,'');assert.equal(d.querySelector('#playerAvatar').textContent,'BP');
  }finally{t.dom.window.close();}
 }
 const archive=await setup('?history=1601',fixture());try{assert.equal(archive.w.document.querySelector('#sourceLink').hidden,false);assert.equal(archive.calls.filter(c=>c.body?.p_account_email).length,0,'no se confirma ninguna familia al abrir el archivo');assert.equal(archive.w.document.querySelector('#playerSections').hidden,true);}finally{archive.dom.window.close();}
 const roster=await setup('',fixture());try{assert.equal(roster.w.document.querySelector('#familyRoster').hidden,false);assert.match(roster.w.document.querySelector('#familyRosterEntries a').href,/player=player-a/);}finally{roster.dom.window.close();}
 console.log('PASS: ficha, importes compartidos, estados, nombres seguros, controles de administrador, archivo sin enlace automatico, listado y limpieza al cerrar sesion.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
