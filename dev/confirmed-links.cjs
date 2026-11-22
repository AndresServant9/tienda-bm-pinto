'use strict';
const {linkHistory,matchesName,emailHashes,validDate}=require('./link-history.cjs');
// Decisions are private, supplied by the club; never received through a public RPC.
function confirmedLinks(assignments,history,decisions){
 const result=linkHistory(assignments,history,{allowUniqueAbbreviations:true});
 for(const decision of decisions){
  const a=assignments.find(a=>a.id===decision.assignment_id);
  const candidates=history.filter(h=>h.is_current&&h.player_key===decision.source_player_key);
  const h=candidates[0],gender=h&&({'Masculino':'male','Femenino':'female'}[h.profile.division]||h.profile.division);
  if(!a||a.state!=='active'||candidates.length!==1||!validDate(h.profile.birth)||gender!==a.division||!matchesName(a.player_name,h.profile.name,true)||
   Number(h.profile.birth.slice(0,4))<a.birth_min||Number(h.profile.birth.slice(0,4))>a.birth_max||!emailHashes(h.profile).length||
   decisions.filter(d=>d.assignment_id===a.id||d.source_player_key===h.player_key).length!==1||
   result.links.some(l=>l.assignment_id!==a.id&&l.source_player_key===h.player_key))throw Error('Decision de identidad incompatible o duplicada');
  result.links=result.links.filter(l=>l.assignment_id!==a.id);
  result.links.push({assignment_id:a.id,source_player_key:h.player_key,canonical_name:h.profile.name.trim(),birth:h.profile.birth,email_hashes:emailHashes(h.profile),source_row:h.source_row,match_rule:'club_confirmed_identity'});
  result.review=result.review.filter(r=>r.assignment_id!==a.id);
 }
 return result;
}
module.exports={confirmedLinks};
