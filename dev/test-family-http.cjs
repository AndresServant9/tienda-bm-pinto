'use strict';
const assert=require('node:assert/strict'),base='http://127.0.0.1:8140/__test__/rest/v1/rpc/';
async function rpc(name,body={},token='local-dorsales-only',sheet=false){const response=await fetch(base+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(sheet?{'x-club-dorsal-source':'sheet'}:{})},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
(async()=>{
 const roster=await rpc('bm_pinto_family_players');assert.equal(roster.status,200);const ana=roster.data.find(p=>p.name==='Ana de ejemplo'),pablo=roster.data.find(p=>p.name==='Pablo de ejemplo');assert.ok(ana&&pablo);
 const a=await rpc('bm_pinto_player_dossier',{p_player_id:ana.id}),b=await rpc('bm_pinto_player_dossier',{p_player_id:pablo.id});assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.data.orders,b.data.orders);assert.ok(a.data.orders.some(o=>o.reference==='DEMO-FAMILIA-01'));assert.equal(a.data.family.id,b.data.family.id);assert.notEqual(a.data.player.id,b.data.player.id);assert.ok(a.data.registrations[0].payments.installments.length);
 for(const token of ['local-other-only',null]){const denied=await rpc('bm_pinto_player_dossier',{p_player_id:ana.id},token);assert.notEqual(denied.status,200);assert.equal(denied.data.code,'42501');}
 const sheet=await rpc('bm_pinto_player_dossier',{p_player_id:ana.id},'local-dorsales-only',true);assert.equal(sheet.status,403);assert.equal(sheet.data.code,'READ_ONLY');
 console.log('PASS HTTP: fichas distintas, pedidos familiares compartidos, plazos visibles, cuenta ajena/anonima bloqueada y copia privada de dorsales aislada. Sin escrituras.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
