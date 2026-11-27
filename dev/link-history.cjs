'use strict';
const {createHash}=require('node:crypto');
const nameKey=value=>String(value||'').trim().toUpperCase().replace(/[ÁÉÍÓÚÜ]/g,c=>({'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U'}[c])).replace(/\s+/g,' ');
const emailHashes=profile=>[...new Set([profile.contactEmail,profile.submittedEmail].map(v=>String(v||'').trim().toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))].map(value=>createHash('sha256').update(value).digest('hex')).sort();
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
const division=value=>({'Masculino':'male','Femenino':'female','male':'male','female':'female'}[value]||'');
const matchesName=(shortName,fullName,allowAbbreviations=false)=>{
 const short=nameKey(shortName),full=nameKey(fullName);
 return short===full||(allowAbbreviations&&short.split(' ').length>=2&&full.startsWith(short+' '));
};
// Only for an explicit identity decision: omitted compound given names.
const confirmedNameMatches=(shortName,fullName)=>{
 const short=nameKey(shortName).split(' '),full=nameKey(fullName).split(' ');
 if(short.length<2)return false;
 let next=0;for(const token of full)if(token===short[next])next++;
 return next===short.length;
};
function linkHistory(assignments,history,{allowUniqueAbbreviations=false}={}){
 const current=history.filter(h=>h.is_current&&validDate(h.profile.birth));
 const active=assignments.filter(a=>a.state==='active');
 const eligible=(a,h)=>division(h.profile.division)===a.division&&Number(h.profile.birth.slice(0,4))>=a.birth_min&&Number(h.profile.birth.slice(0,4))<=a.birth_max;
 const exact=new Map(active.map(a=>[a.id,current.filter(h=>eligible(a,h)&&matchesName(a.player_name,h.profile.name,allowUniqueAbbreviations))]));
 const reverse=new Map();for(const a of active)for(const h of exact.get(a.id)){const key=h.player_key;reverse.set(key,[...(reverse.get(key)||[]),a.id]);}
 const links=[],review=[];
 for(const a of active){const matches=exact.get(a.id);const h=matches[0];
  const ambiguousName=allowUniqueAbbreviations&&current.filter(h=>matchesName(a.player_name,h.profile.name,true)).length>1;
  const ambiguousLedger=allowUniqueAbbreviations&&h&&active.filter(other=>matchesName(other.player_name,h.profile.name,true)).length>1;
  if(matches.length===1&&!ambiguousName&&!ambiguousLedger&&reverse.get(h.player_key).length===1&&emailHashes(h.profile).length){
   links.push({assignment_id:a.id,source_player_key:h.player_key,canonical_name:h.profile.name.trim(),birth:h.profile.birth,email_hashes:emailHashes(h.profile),source_row:h.source_row,match_rule:nameKey(a.player_name)===nameKey(h.profile.name)?'exact':'club_unique_name_prefix'});
  }else{
   const key=nameKey(a.player_name);
   const suggestions=key.split(' ').length<2?[]:current.filter(h=>eligible(a,h)&&nameKey(h.profile.name).startsWith(key+' '));
   review.push({assignment_id:a.id,source_key:a.source_key,name:a.player_name,number:a.number,division:a.division,
    reason:matches.length>1||ambiguousName?'ambiguous_history':ambiguousLedger||(matches.length===1&&reverse.get(h.player_key).length>1)?'ambiguous_assignment':matches.length===1?'missing_contact':'no_exact_match',
    candidate_rows:[...new Set([...matches,...suggestions].map(h=>h.source_row))],
    candidates:[...new Set([...matches,...suggestions].map(h=>h.profile.name))]});
  }
 }
 return {links,review};
}
module.exports={linkHistory,nameKey,emailHashes,validDate,matchesName,confirmedNameMatches};
