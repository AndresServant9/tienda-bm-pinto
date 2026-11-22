'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{JSDOM}=require('jsdom');
const base='http://127.0.0.1:8140',root=path.resolve(__dirname,'..');
async function rpc(name,data={},auth=true){const res=await fetch(base+'/__test__/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer local-dorsales-only'}:{})},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};}
function registration(number){const id=randomUUID();return {submission_id:id,submission:{registration_day:'2026-11-22',payment:'single',member:false,total:360,players:[{name:'Ensayo HTTP '+id.slice(0,8),category:'Alevín',team:'standard',division:'male',hasKit:true,member:false,payments:[360,0,0]}]},first_receipt:null,p_details:{dorsals:[number],contact:{name:'Familia de ejemplo',email:'familia@example.test',phone:'600000000'},players:[{birth:'2015-02-01'}]}};}
(async()=>{
 let options=(await rpc('bm_pinto_dorsal_options',{p_birth:'2015-02-01',p_division:'male',p_name:'Ensayo HTTP'})).data;
 const request=registration(options.available[0]);const accepted=await rpc('bm_pinto_submit_registration_test_details',request);assert.equal(accepted.status,200);
 const own=(await rpc('bm_pinto_my_registration_tests')).data;assert.ok(own.some(r=>r.id===request.submission_id));
 const numbers=(await rpc('bm_pinto_my_registration_dorsals')).data;assert.equal(numbers.find(r=>r.registration_id===request.submission_id).number,request.p_details.dorsals[0]);
 assert.equal((await rpc('bm_pinto_my_registration_tests',{},false)).status,400);
 assert.equal((await rpc('bm_pinto_my_registration_dorsals',{},false)).status,400);
 options=(await rpc('bm_pinto_dorsal_options',{p_birth:'2015-02-01',p_division:'male',p_name:'Ensayo HTTP'})).data;
 const a=registration(options.available[0]),b=registration(options.available[0]);
 const simultaneous=await Promise.all([rpc('bm_pinto_submit_registration_test_details',a),rpc('bm_pinto_submit_registration_test_details',b)]);
 assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,400]);assert.equal(simultaneous.find(r=>r.status===400).data.code,'PT410');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'mis-inscripciones.html'),'utf8'),{url:base+'/mis-inscripciones',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.AbortSignal=AbortSignal;w.Request=Request;w.fetch=(input,init)=>{const url=new URL(String(input),w.location.href);assert.equal(url.origin,base);return fetch(url,init);};w.HTMLElement.prototype.scrollIntoView=function(){};
 try{
  for(const file of ['dev-guard.js','club-auth.js','justificantes.js','mis-inscripciones.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  await w.ClubAuth.signIn('familia@example.test','PruebaLocal123!');
  for(let i=0;i<100&&!w.document.querySelector('#enrollments').textContent.includes('Dorsal');i++)await new Promise(r=>setTimeout(r,100));
  assert.match(w.document.querySelector('#enrollments').textContent,new RegExp('Dorsal '+request.p_details.dorsals[0]));
 }finally{w.close();}
 console.log('PASS HTTP/DOM: reserva, consulta familiar con dorsal, bloqueo anonimo y dos envios simultaneos (uno aceptado, otro rechazado). Solo datos ficticios locales.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
