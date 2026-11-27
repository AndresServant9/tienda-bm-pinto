'use strict';
const assert=require('node:assert/strict'),{createReadOnlySource}=require('./private-source.cjs');
(async()=>{
 const rows=[
  {id:'14600000-0000-4000-8000-000000000001',season_year:2026,division:'male',number:44,birth_min:2013,birth_max:2013,player_name:'Persona privada ficticia',state:'active',source_key:'readonly-one'},
  {id:'14600000-0000-4000-8000-000000000002',season_year:2026,division:'male',number:45,birth_min:2013,birth_max:2013,player_name:'BAJA: Otra persona privada ficticia',state:'active',source_key:'readonly-two'}
 ];
 const source=await createReadOnlySource(rows);
 try{
  const opts=await source.options({p_birth:'2015-04-15',p_division:'male',p_name:rows[0].player_name});
  assert.ok(!opts.available.includes(44));assert.ok(opts.available.includes(45));
  assert.ok(opts.available.includes(7),'no incluye las reservas ficticias del demo');
  assert.equal(opts.own_number,null);assert.equal(opts.preserved,false);
  assert.deepEqual(Object.keys(opts).sort(),['available','own_number','preserved','season_year']);
  assert.ok(!JSON.stringify(opts).includes('Persona'));
  const parallel=await Promise.all(Array.from({length:5},()=>source.options({p_birth:'2015-04-15',p_division:'female'})));
  assert.ok(parallel.every(x=>x.available.includes(44)));
  await assert.rejects(source.options({p_birth:'invalid',p_division:'male'}));
  assert.ok((await source.options({p_birth:'2015-04-15',p_division:'female'})).available.includes(44));
  console.log('PASS: consulta privada aislada, anonima, sin datos personales ni reservas ficticias, bajas, concurrencia y recuperacion tras error.');
 }finally{await source.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
