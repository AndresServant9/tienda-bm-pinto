'use strict';
const assert=require('node:assert/strict'),{createDatabase}=require('./database.cjs'),{sourceState}=require('./import-status.cjs');
const family='14000000-0000-4000-8000-000000000001';
(async()=>{
 assert.equal(sourceState('BAJA: Persona ficticia','review'),'released');
 assert.equal(sourceState(' baja : Persona ficticia','review'),'released');
 assert.equal(sourceState('Duda: Persona ficticia','active'),'review');
 assert.equal(sourceState('Persona con baja en observaciones','active'),'active');
 assert.equal(sourceState('BAJAMAR DE EJEMPLO','active'),'active');
 const db=await createDatabase();try{
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const opts=async(name='Nuevo')=>(await q("select public.bm_pinto_dorsal_options('2015-04-15','male',$1) as data",[name]))[0].data;
  await q("select set_config('request.jwt.claim.sub',$1,false)",[family]);
  const row=(await q("insert into bm_pinto.dorsal_assignments(season_year,division,number,birth_min,birth_max,player_name,owner_id,preserve_existing) values(2026,'male',70,2015,2015,'Baja ficticia',$1,true) returning id",[family]))[0];
  assert.ok(!(await opts()).available.includes(70));
  await q("update bm_pinto.dorsal_assignments set state='released' where id=$1",[row.id]);
  assert.ok((await opts()).available.includes(70));assert.equal((await opts('Baja ficticia')).own_number,null);
  const history=(await q('select state,number,preserve_existing from bm_pinto.dorsal_assignments where id=$1',[row.id]))[0];assert.deepEqual(history,{state:'released',number:70,preserve_existing:true});
  await q("insert into bm_pinto.dorsal_assignments(season_year,division,number,birth_min,birth_max,player_name,state) values(2026,'male',71,2013,2013,'Baja anterior','released'),(2026,'male',71,2014,2014,'Jugador vigente','active'),(2026,'male',72,2012,2012,'Duda pendiente','review')");
  const available=await opts();assert.ok(!available.available.includes(71),'otro jugador sigue reservando el numero');assert.ok(!available.available.includes(72),'una duda no se libera');
  console.log('PASS: bajas liberadas sin borrar historico, sin recuperacion automatica del antiguo titular, reservas vigentes y dudas conservadas.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
