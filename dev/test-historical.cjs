'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{createDatabase}=require('./database.cjs'),{fictionalRequest}=require('./test-dorsals.cjs'),rules=require('../dorsales.js');
const family='14000000-0000-4000-8000-000000000001',other='14000000-0000-4000-8000-000000000002';
async function runHistoricalContracts(db,createRequest=fictionalRequest){
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const setUser=id=>q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 const opts=async(year,name)=>(await q('select public.bm_pinto_dorsal_options($1::date,$2,$3) as data',[year+'-04-15','male',name]))[0].data;
 const suffix=randomUUID().slice(0,8),a='Historico A '+suffix,b='Historico B '+suffix;
 for(const [name,year]of[[a,2013],[b,2010]])await q('insert into bm_pinto.dorsal_assignments(season_year,division,number,birth_min,birth_max,player_name,owner_id,preserve_existing,source_key) values(2026,\'male\',24,$1,$1,$2,$3,true,$4)',[year,name,family,'legacy-'+randomUUID()]);
 await setUser(family);
 assert.deepEqual((await opts(2013,a)).available,[24]);assert.equal((await opts(2013,a)).preserved,true);
 assert.deepEqual((await opts(2010,b)).available,[24]);
 rules.checkFamily([{number:24,division:'male',birthYear:2013,preserved:true},{number:24,division:'male',birthYear:2010,preserved:true}],2026);
 assert.throws(()=>rules.checkFamily([{number:24,division:'male',birthYear:2013,preserved:true},{number:24,division:'male',birthYear:2010,preserved:false}],2026));
 const request=createRequest();request.id=randomUUID();request.summary.total=860;
 request.summary.players.forEach((p,i)=>{p.name=i?b:a;p.category=i?'Juvenil':'Infantil';p.division='male';p.team='standard';p.hasKit=false;p.member=false;p.payments=[280,0,150];});
 request.details.players.forEach((p,i)=>p.birth=(i?2010:2013)+'-04-15');request.details.dorsals=[24,24];
 const submit=async r=>(await q('select public.bm_pinto_submit_registration_test_details($1::uuid,$2::jsonb,$3,$4::jsonb) as reference',[r.id,JSON.stringify(r.summary),r.receipt,JSON.stringify(r.details)]))[0].reference;
 const accepted=await submit(request);assert.equal(await submit(request),accepted);
 assert.deepEqual((await q('select number from bm_pinto.registration_dorsals where registration_id=$1 order by player_index',[request.id])).map(r=>r.number),[24,24]);
 const fresh=createRequest();fresh.id=randomUUID();fresh.summary.players.forEach(p=>p.name+=' nuevo '+suffix);fresh.details.dorsals=[32,24];
 await assert.rejects(submit(fresh),e=>e.code==='PT410');
 assert.equal((await q('select count(*)::int as n from bm_pinto.registration_tests where id=$1',[fresh.id]))[0].n,0);
 await setUser(other);const stolen=await opts(2013,a);assert.equal(stolen.preserved,false);assert.equal(stolen.own_number,null);assert.ok(!stolen.available.includes(24));
 const steal=structuredClone(request);steal.id=randomUUID();await assert.rejects(submit(steal),e=>e.code==='PT410');
 await setUser(null);const anonymous=await opts(2013,a);assert.equal(anonymous.preserved,false);assert.ok(!anonymous.available.includes(24));
 await db.exec('set role authenticated');await assert.rejects(q('update bm_pinto.dorsal_assignments set preserve_existing=true'),e=>e.code==='42501');await db.exec('reset role');
 // Territorial y Nacional comparten control, con excepciones solo para titulares previos.
 const territorial='Territorial historico '+suffix,national='Nacional historico '+suffix;
 for(const [name,year]of[[territorial,1990],[national,1992]])await q('insert into bm_pinto.dorsal_assignments(season_year,division,number,birth_min,birth_max,player_name,owner_id,preserve_existing,source_key) values(2026,\'male\',89,$1,$1,$2,$3,true,$4)',[year,name,family,'legacy-senior-'+randomUUID()]);
 await setUser(family);assert.deepEqual((await opts(1990,territorial)).available,[89]);assert.deepEqual((await opts(1992,national)).available,[89]);
 for(const team of ['territorial','national']){
  const adult=createRequest();adult.id=randomUUID();const p=adult.summary.players[0];
  Object.assign(p,{name:'Senior nuevo '+team+' '+suffix,category:'Sénior',division:'male',team,hasKit:true,member:false,payments:team==='national'?[0,0,0]:[200,0,160]});delete p.equipment;
  adult.summary.players=[p];adult.summary.total=team==='national'?0:360;adult.summary.payment='single';
  adult.details.players=[{...adult.details.players[0],birth:'1995-04-15',guardianId:''}];adult.details.dorsals=[88];
  if(team==='national')adult.receipt=null;
  await assert.rejects(submit(adult),e=>e.code==='PT410');
  assert.equal((await q('select count(*)::int as n from bm_pinto.registration_tests where id=$1',[adult.id]))[0].n,0);
 }
 console.log('PASS: Territorial y Nacional comparten disponibilidad; sus duplicados historicos se respetan y ambos rechazan nuevas reservas ocupadas.');
 console.log('PASS: dos dorsales historicos coincidentes se conservan, incluidas dos personas de la misma familia; nuevas asignaciones, suplantacion y excepcion client-side bloqueadas.');
}
if(require.main===module)(async()=>{const db=await createDatabase();try{await runHistoricalContracts(db);}finally{await db.close();}})().catch(e=>{console.error(e.code,e.stack);process.exitCode=1;});
module.exports={runHistoricalContracts};
