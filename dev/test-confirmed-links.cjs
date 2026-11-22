'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createDatabase}=require('./database.cjs'),{confirmedLinks}=require('./confirmed-links.cjs'),{importLinks}=require('./history-link-db.cjs');
(async()=>{
 const records=[2015,2017].map((year,i)=>({id:randomUUID(),player_name:'Bruno Prueba',birth_min:year,birth_max:year,division:'male',state:'active',number:74+i}));
 const history=records.map((a,i)=>({player_key:'confirmed-'+i,is_current:true,source_row:10+i,profile:{name:'Bruno Prueba '+(i?'Segundo':'Primero'),birth:a.birth_min+'-04-15',division:'Masculino',contactEmail:'familia@example.test'}}));
 const decisions=records.map((r,i)=>({assignment_id:r.id,source_player_key:history[i].player_key}));
 assert.equal(confirmedLinks(records,history,[]).links.length,0);
 const result=confirmedLinks(records,history,decisions);assert.equal(result.links.length,2);assert.equal(result.review.length,0);
 assert.throws(()=>confirmedLinks(records,history,[{...decisions[0],source_player_key:history[1].player_key}]),/incompatible/);
 assert.throws(()=>confirmedLinks(records,history,[decisions[0],decisions[0]]),/incompatible/);
 const db=await createDatabase();
 try{
  for(const r of records)await db.query("insert into bm_pinto.dorsal_assignments(id,season_year,division,number,birth_min,birth_max,player_name,preserve_existing) values($1,2026,'male',$2,$3,$3,$4,true)",[r.id,r.number,r.birth_min,r.player_name]);
  await assert.rejects(importLinks(db,result.links,{allowUniqueAbbreviations:true}),/decision expresa/);
  await assert.rejects(importLinks(db,result.links,{confirmedIdentities:[{...decisions[0],source_player_key:'wrong'}]}),/decision expresa/);
  await db.exec('begin');assert.equal(await importLinks(db,result.links,{confirmedIdentities:decisions}),2);await db.exec('commit');
  await db.query("select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',false)");
  for(const [i,h] of history.entries()){
   const data=(await db.query("select public.bm_pinto_dorsal_options($1::date,'male',$2) as data",[h.profile.birth,h.profile.name])).rows[0].data;assert.deepEqual(data.available,[74+i]);
  }
  await db.query("select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000002',false)");
  assert.equal((await db.query("select public.bm_pinto_dorsal_options('2015-04-15','male',$1) as data",[history[0].profile.name])).rows[0].data.own_number,null);
  console.log('PASS: homonimos separados solo por decision expresa, cohortes, decision duplicada o manipulada rechazada y recuperacion privada del numero correcto.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
