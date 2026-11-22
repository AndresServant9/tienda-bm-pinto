'use strict';
const {createDatabase}=require('./database.cjs');
const {sourceState}=require('./import-status.cjs');
// In-memory, anonymous and read-only. Never shares the writable demo database.
async function createReadOnlySource(records){
 const db=await createDatabase();
 try{
  await db.exec('begin; delete from bm_pinto.dorsal_assignments');
  for(const r of records)await db.query('insert into bm_pinto.dorsal_assignments(id,season_year,division,number,birth_min,birth_max,player_name,state,source_key,preserve_existing) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',[r.id,r.season_year,r.division,r.number,r.birth_min,r.birth_max,r.player_name,sourceState(r.player_name,r.state),r.source_key]);
  await db.exec('commit');
 }catch(e){await db.exec('rollback');await db.close();throw e;}
 let queue=Promise.resolve();
 return {close:()=>db.close(),options(body){
  const action=async()=>{try{
   await db.exec("begin; set local role anon; select set_config('request.jwt.claim.sub','',true)");
   const value=(await db.query('select public.bm_pinto_dorsal_options($1::date,$2,$3) as data',[body.p_birth,body.p_division,''])).rows[0].data;
   await db.exec('commit');return value;
  }catch(e){await db.exec('rollback');throw e;}};
  const pending=queue.then(action,action);queue=pending.catch(()=>{});return pending;
 }};
}
module.exports={createReadOnlySource};
