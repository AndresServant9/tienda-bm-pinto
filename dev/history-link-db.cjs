'use strict';
const {matchesName,validDate}=require('./link-history.cjs');
async function importLinks(db,links,{allowUniqueAbbreviations=false}={}){
 let imported=0;
 for(const link of links){
  if(!validDate(link.birth)||!Array.isArray(link.email_hashes)||!link.email_hashes.length||link.email_hashes.length>2||link.email_hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Vinculo privado incorrecto');
  const assignment=(await db.query('select * from bm_pinto.dorsal_assignments where id=$1',[link.assignment_id])).rows[0];
  const allowPrefix=allowUniqueAbbreviations&&link.match_rule==='club_unique_name_prefix';
  if(!assignment||assignment.state!=='active'||!assignment.preserve_existing||!matchesName(assignment.player_name,link.canonical_name,allowPrefix)||Number(link.birth.slice(0,4))<assignment.birth_min||Number(link.birth.slice(0,4))>assignment.birth_max)throw Error('Vinculacion sin coincidencia aprobada');
  if(allowPrefix){
   const active=(await db.query("select id,player_name from bm_pinto.dorsal_assignments where state='active'")).rows;
   if(active.filter(a=>matchesName(a.player_name,link.canonical_name,true)).length!==1||links.filter(l=>l.source_player_key===link.source_player_key).length!==1)throw Error('Nombre abreviado ambiguo; revisar');
  }
  const result=await db.query('insert into bm_pinto.dorsal_player_links as current_link(assignment_id,source_player_key,canonical_name,birth,email_hashes,source_row) values($1,$2,$3,$4,$5,$6) on conflict(assignment_id) do update set canonical_name=excluded.canonical_name,birth=excluded.birth,email_hashes=excluded.email_hashes,source_row=excluded.source_row where current_link.source_player_key=excluded.source_player_key returning assignment_id',[link.assignment_id,link.source_player_key,link.canonical_name,link.birth,link.email_hashes,link.source_row]);
  if(result.rows.length!==1)throw Error('La vinculacion anterior pertenece a otro jugador; revisar');imported++;
 }
 return imported;
}
module.exports={importLinks};
