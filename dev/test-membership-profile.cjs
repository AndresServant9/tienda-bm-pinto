'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
 for(const minor of [true,false]){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'ficha-jugador.html'),'utf8'),{url:'http://localhost/ficha-jugador?player=test',runScripts:'outside-only'}),w=dom.window;let logout;
  const member={status:'active',is_member:true},notFound={status:'not_found',is_member:false};
  const data={player:{id:'test',name:'Jugador de ejemplo',birth:minor?'2015-01-01':'1990-01-01',profile:{}},is_minor:minor,family:{name:'Familia de ejemplo'},siblings:[],contacts:minor?[{id:'mother',name:'Madre <img>',relationship:'mother',confirmed:true},{id:'pending',name:'Padre',relationship:'father',confirmed:false}]:[],personal_contacts:[],orders_scope:minor?'family':'personal',orders:[],registrations:[],memberships:[],membership_state:{season:'2026/2027',player:minor?notFound:member,guardians:minor?[{name:'Madre <img>',relationship:'mother'}]:[],contacts:minor?{mother:member,pending:{status:'pending_link',is_member:false}}:{}},admin:false};
  w.ClubAuth={subscribe:fn=>logout=fn,getSession:async()=>({user:{id:'owner'}}),isAdmin:async()=>false,authorized:async()=>data};
  try{w.eval(fs.readFileSync(path.join(root,'ficha-jugador.js'),'utf8'));await tick();await tick();const d=w.document;
   assert.match(d.querySelector('#playerMemberships h2').textContent,/2026\/2027/);assert.equal(d.querySelectorAll('.player-membership-summary .member-active').length,1);
   if(minor){assert.match(d.querySelector('.player-membership-summary').textContent,/Jugador: No consta/);assert.match(d.querySelector('.player-membership-summary').textContent,/Madre socia: Madre <img>/);assert.equal(d.querySelectorAll('#playerData img').length,0);assert.match(d.querySelector('#playerFamily').textContent,/Relación pendiente de confirmar/);assert.match(d.querySelector('#playerFamily .member-active').textContent,/Socio\/a de 2026\/2027/);}
   else{assert.match(d.querySelector('.player-membership-summary').textContent,/Jugador: Socio\/a/);assert.doesNotMatch(d.querySelector('#playerMemberships').textContent,/Responsables|Madre/);}
   assert.doesNotMatch(d.querySelector('#playerMemberships').textContent,/No hay solicitudes/);await logout(null);assert.equal(d.querySelector('#playerData').textContent,'');assert.equal(d.querySelector('#playerMemberships').textContent,'');
  }finally{dom.window.close();}
 }
 console.log('PASS DOM: socio propio, madre socia diferenciada, temporada visible, contacto pendiente, adulto independiente, nombres seguros y limpieza al cerrar sesion.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
