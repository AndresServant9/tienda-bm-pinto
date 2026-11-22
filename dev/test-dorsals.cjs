'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const rules=require('../dorsales.js'),{createDatabase}=require('./database.cjs');
const family='14000000-0000-4000-8000-000000000001',other='14000000-0000-4000-8000-000000000002';
async function runContracts(db,createRequest){
 const makeRequest=()=>{const r=createRequest();const suffix=randomUUID().slice(0,8);r.summary.players.forEach(p=>p.name+=' '+suffix);return r;};
 const q=async(sql,args=[])=> (await db.query(sql,args)).rows;
 const setUser=async id=>q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 const options=async(birth,division='male',name='Nuevo de ejemplo')=>(await q('select public.bm_pinto_dorsal_options($1::date,$2,$3) as data',[birth,division,name]))[0].data;
 await setUser(null);
 const empty=await options('2015-02-01');assert.ok(!empty.available.includes(7),'alevin segundo y cadete primero');assert.ok(!empty.available.includes(12));assert.equal(empty.own_number,null);assert.deepEqual(Object.keys(empty).sort(),['available','own_number','season_year']);
 assert.ok((await options('2016-02-01')).available.includes(7),'dos categorias y sin cruce la siguiente temporada');
 assert.ok((await options('2015-02-01','female')).available.includes(7),'ramas independientes');
 assert.ok(!(await options('2009-02-01')).available.includes(88),'juvenil y senior');
 assert.ok(!(await options('2011-02-01')).available.includes(88),'cadete segundo y senior en temporada siguiente');
 await assert.rejects(options('2099-01-01'),e=>e.code==='22023');await assert.rejects(options('2015-01-01','mixed'),e=>e.code==='22023');
 await setUser(family);assert.deepEqual((await options('2015-02-01','male','Lucas de ejemplo')).available,[12]);
 await setUser(other);assert.equal((await options('2015-02-01','male','Lucas de ejemplo')).own_number,null);
 await db.exec('set role authenticated');await assert.rejects(q('select * from bm_pinto.dorsal_assignments'),e=>e.code==='42501');await db.exec('reset role');
 const request=makeRequest();request.id=randomUUID();request.details.dorsals=[21,22];
 await setUser(family);const submit=async r=>(await q('select public.bm_pinto_submit_registration_test_details($1::uuid,$2::jsonb,$3,$4::jsonb) as reference',[r.id,JSON.stringify(r.summary),r.receipt,JSON.stringify(r.details)]))[0].reference;
 const ref=await submit(request);assert.equal(await submit(request),ref);
 const changed=structuredClone(request);changed.details.dorsals=[23,24];await assert.rejects(submit(changed),e=>e.code==='PT409');
 assert.equal((await q('select count(*)::int as n from bm_pinto.registration_dorsals where registration_id=$1',[request.id]))[0].n,2);
 assert.deepEqual((await q('select public.bm_pinto_registration_dorsals($1) as data',[request.id]))[0].data.map(d=>d.number),[21,22]);
 assert.equal((await q('select public.bm_pinto_my_registration_dorsals() as data'))[0].data.length,2);
 await setUser(other);await assert.rejects(q('select public.bm_pinto_registration_dorsals($1)',[request.id]),e=>e.code==='42501');await assert.rejects(submit(request),e=>e.code==='PT409');
 assert.deepEqual((await q('select public.bm_pinto_my_registration_dorsals() as data'))[0].data,[]);
 const bad=makeRequest();bad.id=randomUUID();bad.details.dorsals=[23,7];await setUser(family);await assert.rejects(submit(bad),e=>e.code==='PT410');
 assert.equal((await q('select count(*)::int as n from bm_pinto.registration_tests where id=$1',[bad.id]))[0].n,0,'fallo revierte ficha y pagos');
 const duplicate=makeRequest();duplicate.id=randomUUID();duplicate.details.dorsals=[24,24];await assert.rejects(submit(duplicate),e=>e.code==='PT410');
 assert.equal((await q('select count(*)::int as n from bm_pinto.dorsal_assignments where registration_id=$1',[duplicate.id]))[0].n,0);
 // Dos clientes consultan 25 disponible. Tras confirmar uno, el otro ya no puede reservarlo.
 const staleA=makeRequest(),staleB=makeRequest();staleA.id=randomUUID();staleB.id=randomUUID();staleA.details.dorsals=[25,26];staleB.details.dorsals=[25,27];
 assert.ok((await options('2017-04-15')).available.includes(25));await submit(staleA);await setUser(other);await assert.rejects(submit(staleB),e=>e.code==='PT410');
 assert.equal((await q('select count(*)::int as n from bm_pinto.registration_tests where id=$1',[staleB.id]))[0].n,0);
 const missing=makeRequest();missing.id=randomUUID();delete missing.details.dorsals;await assert.rejects(submit(missing),e=>e.code==='22023');
 await setUser(null);await assert.rejects(submit(makeRequest()),e=>e.code==='42501');
 const matrix=await q('select a,b,bm_pinto.dorsal_overlap(a,a,b,b,2026) as collision from generate_series(1995,2026) a cross join generate_series(1995,2026) b');
 for(const r of matrix)assert.equal(r.collision,rules.conflicts({division:'male',birthYear:r.a},{division:'male',birthYear:r.b},2026));
 assert.throws(()=>rules.checkFamily([{number:7,division:'male',birthYear:2015},{number:7,division:'male',birthYear:2012}],2026));
 rules.checkFamily([{number:7,division:'male',birthYear:2016},{number:7,division:'male',birthYear:2012}],2026);
 console.log('PASS: dorsales, ramas, prebenjamin-senior, siguiente temporada, titular, privacidad, reintento, rechazo atomico y cliente desactualizado; 1024 pares JS/SQL.');
}
function fictionalRequest(){return {id:randomUUID(),summary:{registration_day:'2026-11-22',payment:'split',member:false,total:880,players:[{name:'Nuevo A',category:'Benjamín',division:'male',team:'standard',hasKit:false,payments:[80,150,150]},{name:'Nuevo B',category:'Alevín',division:'male',team:'standard',hasKit:false,payments:[80,200,160]}]},details:{players:[{birth:'2017-04-15'},{birth:'2015-04-15'}]},receipt:null};}
if(require.main===module)(async()=>{const db=await createDatabase();try{await runContracts(db,fictionalRequest);await db.exec(fs.readFileSync(path.join(__dirname,'../sql/140-dorsales.sql'),'utf8'));console.log('PASS: migracion reejecutable.');}finally{await db.close();}})().catch(e=>{console.error('FAIL',e.code,e.message);process.exitCode=1;});
module.exports={runContracts,fictionalRequest};
