'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{createDatabase}=require('./database.cjs'),{linkHistory,emailHashes}=require('./link-history.cjs'),{importLinks}=require('./history-link-db.cjs'),{fictionalRequest}=require('./test-dorsals.cjs');
const family='14000000-0000-4000-8000-000000000001',other='14000000-0000-4000-8000-000000000002';
function pureTests(){
 const a={id:randomUUID(),player_name:'Álex García López',birth_min:2013,birth_max:2013,division:'male',state:'active'};
 const h={player_key:'source-child',source_row:5,is_current:true,profile:{name:'ÁLEX GARCÍA LÓPEZ',birth:'2013-04-15',division:'Masculino',contactEmail:'Familia@example.test',submittedEmail:'familia@example.test'}};
 assert.equal(linkHistory([a],[h]).links.length,1);assert.equal(emailHashes(h.profile).length,1);
 assert.equal(linkHistory([{...a,player_name:'Álex García'}],[h]).links.length,0,'nombre abreviado requiere revision');
 assert.equal(linkHistory([{...a,player_name:'Álex García'}],[h]).review[0].candidate_rows.length,1);
 assert.equal(linkHistory([a],[h,{...h,player_key:'another-child',source_row:6}]).review[0].reason,'ambiguous_history');
 assert.equal(linkHistory([a,{...a,id:randomUUID()}],[h]).review[0].reason,'ambiguous_assignment');
 assert.equal(linkHistory([a],[{...h,profile:{...h.profile,division:'Femenino'}}]).links.length,0);
 assert.equal(linkHistory([a],[{...h,profile:{...h.profile,birth:'2014-04-15'}}]).links.length,0);
 assert.equal(linkHistory([a],[{...h,profile:{...h.profile,contactEmail:'',submittedEmail:''}}]).review[0].reason,'missing_contact');
 assert.equal(linkHistory([a],[{...h,is_current:false}]).links.length,0);
}
async function runLinkContracts(db,makeRequest=fictionalRequest){
 pureTests();const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const setUser=id=>q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 const name='Jugador vinculado '+randomUUID().slice(0,8),id=randomUUID();
 await q("insert into bm_pinto.dorsal_assignments(id,season_year,division,number,birth_min,birth_max,player_name,preserve_existing) values($1,2026,'male',58,2013,2013,$2,true)",[id,name]);
 await importLinks(db,[{assignment_id:id,source_player_key:'test-link-'+id,canonical_name:name,birth:'2013-04-15',email_hashes:emailHashes({contactEmail:'familia@example.test'}),source_row:5}]);
 const options=async(birth='2013-04-15',n=name)=>(await q("select public.bm_pinto_dorsal_options($1::date,'male',$2) as data",[birth,n]))[0].data;
 await setUser(family);assert.deepEqual((await options()).available,[58]);
 assert.equal((await q('select owner_id from bm_pinto.dorsal_assignments where id=$1',[id]))[0].owner_id,null,'consultar no reclama el dorsal');
 assert.equal((await options('2013-04-16')).own_number,null,'fecha completa, no solo ano');
 assert.equal((await options('2013-04-15','Otro jugador')).own_number,null);
 await setUser(other);assert.equal((await options()).own_number,null);await setUser(null);assert.equal((await options()).own_number,null);
 await setUser(family);await q('update auth.users set email_confirmed_at=null where id=$1',[family]);assert.equal((await options()).own_number,null);await q('update auth.users set email_confirmed_at=now() where id=$1',[family]);
 const submit=async r=>(await q('select public.bm_pinto_submit_registration_test_details($1::uuid,$2::jsonb,$3,$4::jsonb) as ref',[r.id,JSON.stringify(r.summary),r.receipt,JSON.stringify(r.details)]))[0].ref;
 const failed=makeRequest();failed.id=randomUUID();failed.summary.total=860;failed.summary.players.forEach((p,i)=>{p.name=i?'Otro menor '+id.slice(0,8):name;p.category=i?'Alevín':'Infantil';p.division='male';p.team='standard';p.member=false;p.hasKit=false;p.payments=[280,0,150];});failed.details.players[0].birth='2013-04-15';failed.details.dorsals=[58,7];
 await assert.rejects(submit(failed),e=>e.code==='PT410');assert.equal((await q('select owner_id from bm_pinto.dorsal_assignments where id=$1',[id]))[0].owner_id,null,'fallo posterior revierte la vinculacion de propietario');
 const request=makeRequest();request.id=randomUUID();const p=request.summary.players[0];Object.assign(p,{name,category:'Infantil',division:'male',team:'standard',member:false,hasKit:false,payments:[280,0,160]});request.summary.players=[p];request.summary.total=440;request.summary.payment='single';request.details.players=[{...request.details.players[0],birth:'2013-04-15'}];request.details.dorsals=[58];
 await submit(request);assert.equal((await q('select owner_id from bm_pinto.dorsal_assignments where id=$1',[id]))[0].owner_id,family);
 await q("update auth.users set email='cambio@example.test' where id=$1",[family]);assert.deepEqual((await options()).available,[58],'cuenta propietaria conserva el dorsal tras cambiar correo');await q("update auth.users set email='familia@example.test' where id=$1",[family]);
 await db.exec('set role authenticated');await assert.rejects(q('select * from bm_pinto.dorsal_player_links'),e=>e.code==='42501');await db.exec('reset role');
 console.log('PASS: coincidencias exactas, abreviaturas pendientes, ambiguedad, contacto verificado, fecha completa, privacidad, asignacion atomica del titular y cambio de correo.');
}
if(require.main===module)(async()=>{const db=await createDatabase();try{await runLinkContracts(db);}finally{await db.close();}})().catch(e=>{console.error(e.code,e.stack);process.exitCode=1;});
module.exports={runLinkContracts};
