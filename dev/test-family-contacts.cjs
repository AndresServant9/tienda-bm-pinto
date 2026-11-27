'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createDatabase}=require('./database.cjs'),{fictionalRequest}=require('./test-dorsals.cjs');
async function runContactContracts(db,makeRequest=fictionalRequest){
 const q=async(s,args=[])=>(await db.query(s,args)).rows,user=id=>q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 const owner='14000000-0000-4000-8000-000000000001',admin='14000000-0000-4000-8000-000000000003',outsider=randomUUID(),suffix=randomUUID().slice(0,8),email='invitado-'+suffix+'@example.test';
 await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[outsider,'ajeno-'+suffix+'@example.test']);
 await user(owner);const request=makeRequest();request.id=randomUUID();request.details.contact={name:'Responsable de prueba',email:'familia@example.test',phone:'600000000'};request.summary.players.forEach((p,i)=>p.name='Contacto '+suffix+' hijo '+i);
 const selected=[];for(const [i,p] of request.summary.players.entries()){const result=(await q('select public.bm_pinto_dorsal_options($1::date,$2,$3) as data',[request.details.players[i].birth,p.division,p.name]))[0].data;selected.push(result.available.find(n=>!selected.includes(n)));}request.details.dorsals=selected;
 await q('select public.bm_pinto_submit_registration_test_details($1,$2::jsonb,$3,$4::jsonb)',[request.id,JSON.stringify(request.summary),request.receipt,JSON.stringify(request.details)]);
 const players=await q('select p.id,p.family_id from bm_pinto.family_players p join bm_pinto.family_registration_players r on r.player_id=p.id where r.registration_id=$1 order by r.player_index',[request.id]),fid=players[0].family_id;
 const order=randomUUID();await q("insert into bm_pinto.orders(id,reference,idempotency_key,recipient,email,phone,tariff,total_cents,payment_status,is_test) values($1,$2,$1,'Compra como invitado',$3,'600000000','regular',4200,'receipt_received',false)",[order,'CONTACTO-'+suffix,email]);
 const dossier=async id=>(await q('select public.bm_pinto_player_dossier($1) as data',[id]))[0].data;
 const confirm=async family=>(await q("select public.bm_pinto_confirm_family_contact($1,$2,'Padre ficticio','father') as data",[family,email]))[0].data;
 assert.ok(!(await dossier(players[0].id)).orders.some(o=>o.id===order));
 await assert.rejects(confirm(fid),e=>e.code==='42501');await user(outsider);await assert.rejects(confirm(fid),e=>e.code==='42501');await user(null);await assert.rejects(confirm(fid),e=>e.code==='42501');
 await user(admin);const accountsBefore=(await q('select count(*)::int n from bm_pinto.family_accounts'))[0].n;
 const result=await confirm(fid);assert.equal(result.orders,1);assert.equal(result.login_granted,false);await confirm(fid);
 assert.equal((await q('select count(*)::int n from auth.users where email=$1',[email]))[0].n,0,'no se crea cuenta');assert.equal((await q('select count(*)::int n from bm_pinto.family_accounts'))[0].n,accountsBefore,'no se concede acceso de cuenta');
 assert.equal((await q('select count(*)::int n from bm_pinto.family_contacts where family_id=$1 and email=$2',[fid,email]))[0].n,1);
 assert.equal((await q('select count(*)::int n from bm_pinto.family_contact_audit where contact_id=$1',[result.contact_id]))[0].n,1,'reintento idempotente');
 const another=(await q("insert into bm_pinto.families(name) values('Otra familia ficticia') returning id"))[0].id;await assert.rejects(confirm(another),e=>e.code==='PT409');
 await user(owner);for(const p of players){const data=await dossier(p.id);assert.ok(data.orders.some(o=>o.id===order));const contact=data.contacts.find(c=>c.email===email);assert.equal(contact.confirmed,true);assert.equal(contact.has_account,false);}
 await assert.rejects(q('select public.bm_pinto_revoke_family_contact($1)',[result.contact_id]),e=>e.code==='42501');
 await user(outsider);await assert.rejects(dossier(players[0].id),e=>e.code==='42501');
 await user(admin);await q('select public.bm_pinto_revoke_family_contact($1)',[result.contact_id]);await user(owner);assert.ok(!(await dossier(players[0].id)).orders.some(o=>o.id===order));
 await db.exec('set role authenticated');await assert.rejects(q('select * from bm_pinto.family_contact_audit'),e=>e.code==='42501');await db.exec('reset role');
 await q('delete from bm_pinto.orders where id=$1',[order]);await q('delete from auth.users where id=$1',[outsider]);
 console.log('PASS: compra de invitado compartida solo tras confirmacion del club, sin usuario ni acceso nuevo; hermanos, aislamiento, correo en otra familia bloqueado, auditoria, idempotencia y revocacion.');
}
if(require.main===module)(async()=>{const db=await createDatabase();try{await runContactContracts(db);await db.exec(fs.readFileSync(path.join(__dirname,'../sql/162-contactos-familia-sin-cuenta.sql'),'utf8'));console.log('PASS: SQL 162 reejecutable.');}finally{await db.close();}})().catch(e=>{console.error(e.code,e.stack);process.exitCode=1;});
module.exports={runContactContracts};
