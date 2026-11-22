'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createDatabase}=require('./database.cjs');
(async()=>{
 if(!process.argv[2])throw Error('Indica el JSON privado de asignaciones. No se incluye en el repositorio.');
 const records=JSON.parse(await fs.readFile(path.resolve(process.argv[2]),'utf8'));
 const dir=path.join(__dirname,'../.dev-data/sheet-audit');await fs.mkdir(dir,{recursive:true});const db=await createDatabase(dir);
 try{
  await db.exec('begin');await db.query("delete from bm_pinto.dorsal_assignments where source_key like 'fixture-%'");
  for(const r of records)await db.query('insert into bm_pinto.dorsal_assignments(id,season_year,division,number,birth_min,birth_max,player_name,state,source_key,preserve_existing) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true) on conflict(source_key) do update set player_name=excluded.player_name,state=excluded.state,birth_min=excluded.birth_min,birth_max=excluded.birth_max,number=excluded.number,preserve_existing=true',[r.id,r.season_year,r.division,r.number,r.birth_min,r.birth_max,r.player_name,r.state,r.source_key]);
  await db.exec('commit');const stats=(await db.query("select (select count(*)::int from bm_pinto.dorsal_assignments) as assignments,(select count(*)::int from bm_pinto.dorsal_assignments where state='review') as review,(select count(*)::int from bm_pinto.dorsal_assignments a join bm_pinto.dorsal_assignments b on a.id<b.id and a.division=b.division and a.number=b.number and a.season_year=b.season_year where a.state='active' and b.state='active' and bm_pinto.dorsal_overlap(a.birth_min,a.birth_max,b.birth_min,b.birth_max,a.season_year)) as active_conflicting_pairs")).rows[0];console.log('AUDITORIA LOCAL PRIVADA',JSON.stringify(stats));
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
