-- Estado de socio del jugador y responsables: consulta, sin cambiar cuotas ni altas.
begin;
create table if not exists bm_pinto.membership164_function_backup(signature text primary key,definition text not null,captured_at timestamptz not null default now());
alter table bm_pinto.membership164_function_backup enable row level security;
revoke all on bm_pinto.membership164_function_backup from public,anon,authenticated;
insert into bm_pinto.membership164_function_backup(signature,definition)
select 'public.bm_pinto_player_dossier(uuid)',pg_get_functiondef('public.bm_pinto_player_dossier(uuid)'::regprocedure) on conflict do nothing;

create or replace function bm_pinto.member_name_match_164(a text,b text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(bm_pinto.dorsal_name(a)<>'' and bm_pinto.dorsal_name(b)<>'' and (
 bm_pinto.dorsal_name(a)=bm_pinto.dorsal_name(b) or (
 array_length(regexp_split_to_array(bm_pinto.dorsal_name(a),'\s+'),1)>=2 and array_length(regexp_split_to_array(bm_pinto.dorsal_name(b),'\s+'),1)>=2
 and (starts_with(bm_pinto.dorsal_name(a)||' ',bm_pinto.dorsal_name(b)||' ') or starts_with(bm_pinto.dorsal_name(b)||' ',bm_pinto.dorsal_name(a)||' ')))),false);
$$;

create or replace view bm_pinto.membership_people_164 as
 select h.season,h.identifier_hash,h.profile->>'fullName' as name,lower(btrim(h.profile->>'email')) as email,'register'::text as source
 from bm_pinto.membership_history h join bm_pinto.memberships m on m.season=h.season and m.identifier_hash=h.identifier_hash
 union
 select d.season,d.identifier_hash,d.full_name,lower(btrim(d.email)),'register' from bm_pinto.membership_renewal_directory d join bm_pinto.memberships m on m.season=d.season and m.identifier_hash=d.identifier_hash
 union
 select r.season,r.identifier_hash,r.profile->>'fullName',lower(btrim(r.profile->>'email')),'approved' from bm_pinto.membership_test_requests r
 where r.approved_at is not null and r.rejected_at is null and not coalesce(r.awaiting_receipt,false);
revoke all on bm_pinto.membership_people_164 from public,anon,authenticated;

create or replace function bm_pinto.membership_identity_164(p_name text,p_hashes text[],p_emails text[],p_season text,p_require_name boolean default false)
returns jsonb language plpgsql stable set search_path='' as $$
declare hashes text[];candidate_hash text;candidate_name text;candidate_source text;n integer;name_candidates integer;begin
 select array_agg(distinct x) into hashes from unnest(coalesce(p_hashes,array[]::text[])) x where x~'^[a-f0-9]{64}$';
 -- Un documento propio es suficiente salvo en el archivo de menores: puede ser el del tutor.
 if not p_require_name then
  select count(distinct identifier_hash),min(identifier_hash) into n,candidate_hash from (
   select identifier_hash from bm_pinto.memberships where season=p_season and identifier_hash=any(hashes)
   union select identifier_hash from bm_pinto.membership_people_164 where season=p_season and identifier_hash=any(hashes)) matched;
  if n>1 then return jsonb_build_object('status','review','is_member',false);end if;
  if n=1 then return jsonb_build_object('status','active','is_member',true,'name',p_name,'identity_key',candidate_hash,'source','document');end if;
 end if;
 select count(distinct v.identifier_hash),min(v.identifier_hash),min(v.name),min(v.source),count(distinct bm_pinto.dorsal_name(v.name))
 into n,candidate_hash,candidate_name,candidate_source,name_candidates
 from bm_pinto.membership_people_164 v where v.season=p_season and bm_pinto.member_name_match_164(p_name,v.name)
 and (v.identifier_hash=any(hashes) or v.email=any(p_emails));
 if n>1 or name_candidates>1 then return jsonb_build_object('status','review','is_member',false);end if;
 if n=1 then
  if coalesce(array_length(hashes,1),0)>0 and not candidate_hash=any(hashes) then return jsonb_build_object('status','review','is_member',false);end if;
  return jsonb_build_object('status','active','is_member',true,'name',candidate_name,'identity_key',candidate_hash,'source',candidate_source);
 end if;
 if p_require_name and exists(select 1 from bm_pinto.memberships where season=p_season and identifier_hash=any(hashes)) then return jsonb_build_object('status','review','is_member',false);end if;
 if exists(select 1 from bm_pinto.membership_test_requests r where r.season=p_season and r.approved_at is null and r.rejected_at is null
 and ((r.identifier_hash=any(hashes) and (not p_require_name or bm_pinto.member_name_match_164(p_name,r.profile->>'fullName')))
 or (lower(btrim(r.profile->>'email'))=any(p_emails) and bm_pinto.member_name_match_164(p_name,r.profile->>'fullName')))) then
 return jsonb_build_object('status','pending','is_member',false);end if;
 if coalesce(array_length(hashes,1),0)=0 and coalesce(array_length(p_emails,1),0)=0 then return jsonb_build_object('status','unknown','is_member',false);end if;
 return jsonb_build_object('status','not_found','is_member',false);
end;$$;

create or replace function bm_pinto.player_membership_state_164(p_player_id uuid,p_minor boolean,p_emails text[])
returns jsonb language plpgsql stable set search_path='' as $$
declare p bm_pinto.family_players;c record;season_value text;year_value integer;document_value text;hashes text[];guardian_hash text;own_state jsonb;status_value jsonb;contacts_value jsonb:='{}';guardians_value jsonb:='[]';seen text[]:=array[]::text[];begin
 select * into strict p from bm_pinto.family_players where id=p_player_id;
 select start_year into strict year_value from bm_pinto.campaign_release_state where singleton;
 season_value:=year_value::text||'/'||(year_value+1)::text;
 document_value:=coalesce(nullif(p.profile->'details'->>'playerId',''),p.profile->'archive'->>'identifier');
 hashes:=array[]::text[];
 if btrim(coalesce(document_value,''))<>'' then hashes:=array[encode(sha256(convert_to(upper(regexp_replace(document_value,'[[:space:].-]','','g')),'UTF8')),'hex')];end if;
 own_state:=bm_pinto.membership_identity_164(p.full_name,hashes,p_emails,season_value,p_minor);
 if p_minor then for c in select * from bm_pinto.family_contacts where family_id=p.family_id order by case when relationship in('mother','father') then 0 else 1 end,full_name,id loop
  if not c.confirmed then status_value:=jsonb_build_object('status','pending_link','is_member',false);
  else
   select array_agg(distinct h) into hashes from (
    select c.identifier_hash h where c.identifier_hash is not null
    union select i.identifier_hash from bm_pinto.customer_identifiers i join auth.users u on u.id=i.user_id where u.email_confirmed_at is not null and (u.id=c.account_id or lower(btrim(u.email))=lower(btrim(c.email)))
   ) q;
   if bm_pinto.member_name_match_164(c.full_name,coalesce(p.profile->'contact'->>'name',p.profile->'archive'->>'contactName')) and btrim(coalesce(p.profile->'details'->>'guardianId',''))<>'' then
    guardian_hash:=encode(sha256(convert_to(upper(regexp_replace(p.profile->'details'->>'guardianId','[[:space:].-]','','g')),'UTF8')),'hex');hashes:=array_append(hashes,guardian_hash);
   end if;
   status_value:=bm_pinto.membership_identity_164(c.full_name,hashes,case when c.email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then array[lower(btrim(c.email))] else array[]::text[] end,season_value,false);
  end if;
  contacts_value:=contacts_value||jsonb_build_object(c.id::text,status_value-'identity_key');
  if c.relationship in('mother','father','guardian') and (status_value->>'is_member')::boolean and not coalesce(status_value->>'identity_key','')=any(seen) then
   seen:=array_append(seen,status_value->>'identity_key');
   guardians_value:=guardians_value||jsonb_build_array(jsonb_build_object('name',coalesce(status_value->>'name',c.full_name),'relationship',c.relationship));
  end if;
 end loop;end if;
 return jsonb_build_object('season',season_value,'player',own_state-'identity_key','guardians',guardians_value,'contacts',contacts_value);
end;$$;
revoke all on function bm_pinto.member_name_match_164(text,text),bm_pinto.membership_identity_164(text,text[],text[],text,boolean),bm_pinto.player_membership_state_164(uuid,boolean,text[]) from public,anon,authenticated,service_role;

create or replace function public.bm_pinto_player_dossier(p_player_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();p bm_pinto.family_players;is_admin boolean:=public.bm_pinto_is_admin();minor boolean;orders_value jsonb:='[]';members_value jsonb:='[]';registrations_value jsonb:='[]';r record;pay jsonb;emails text[];member_state jsonb;
begin
 select * into strict p from bm_pinto.family_players where id=p_player_id;
 minor:=p.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years';
 if not is_admin and not (p.personal_account is not distinct from actor or (minor and exists(select 1 from bm_pinto.family_accounts where family_id=p.family_id and user_id=actor))) then raise exception 'Acceso reservado' using errcode='42501';end if;
 if minor then select array_agg(distinct email) into emails from (
 select lower(btrim(u.email)) as email from auth.users u join bm_pinto.family_accounts a on a.user_id=u.id where a.family_id=p.family_id and u.email_confirmed_at is not null
 union select lower(btrim(c.email)) from bm_pinto.family_contacts c where c.family_id=p.family_id and c.confirmed and c.email<>'') approved_emails;
 else select array_agg(distinct email) into emails from (select lower(btrim(email)) email from auth.users where id=p.personal_account and email_confirmed_at is not null union select email from bm_pinto.player_purchase_contacts where player_id=p.id and confirmed) personal_emails;end if;
 if to_regclass('bm_pinto.orders') is not null then
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]') into orders_value from (
   select o.created_at,jsonb_build_object('id',o.id,'reference',o.reference,'created_at',o.created_at,'recipient',o.recipient,'total_cents',o.total_cents,'payment_status',o.payment_status,
   'lines',(select coalesce(jsonb_agg(jsonb_build_object('garment',l.garment,'size',l.size,'quantity',l.quantity,'printed_name',l.printed_name,'printed_number',l.printed_number)),'[]') from bm_pinto.order_lines l where l.order_id=o.id)) as row_data
   from bm_pinto.orders o where not o.is_test and lower(btrim(o.email))=any(emails) order by o.created_at desc limit 100) q;
 end if;
 if to_regclass('bm_pinto.membership_test_requests') is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.profile->>'fullName','season',m.season,'kind',m.kind,'approved_at',m.approved_at,'rejected_at',m.rejected_at,'awaiting_receipt',m.awaiting_receipt) order by m.received_at desc),'[]') into members_value from bm_pinto.membership_test_requests m where lower(btrim(m.profile->>'email'))=any(emails);
 end if;
 for r in select l.registration_id,l.player_index,t.summary from bm_pinto.family_registration_players l join bm_pinto.registration_tests t on t.id=l.registration_id where l.player_id=p.id order by t.received_at desc loop
  pay:=null;if to_regprocedure('bm_pinto.family_payment_snapshot_160(uuid)') is not null then execute 'select bm_pinto.family_payment_snapshot_160($1)' into pay using r.registration_id;end if;
  registrations_value:=registrations_value||jsonb_build_array(jsonb_build_object('registration_id',r.registration_id,'player',r.summary->'players'->r.player_index,'shared',jsonb_array_length(r.summary->'players')>1,'payments',pay));
 end loop;
 member_state:=bm_pinto.player_membership_state_164(p.id,minor,emails);
 return jsonb_build_object('player',jsonb_build_object('id',p.id,'name',p.full_name,'birth',p.birth,'profile',p.profile),
 'photo',(select jsonb_build_object('mime',mime,'base64',replace(encode(image,'base64'),E'\n','')) from bm_pinto.family_player_photos where player_id=p.id),
 'family',case when minor then jsonb_build_object('id',p.family_id,'name',(select name from bm_pinto.families where id=p.family_id)) else null end,
 'siblings',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.full_name) order by x.full_name),'[]') from bm_pinto.family_players x where minor and x.family_id=p.family_id and (is_admin or x.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' or x.personal_account=actor)),
 'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.full_name,'relationship',c.relationship,'email',c.email,'phone',c.phone,'confirmed',c.confirmed,'has_account',c.account_id is not null or exists(select 1 from bm_pinto.family_accounts fa join auth.users fu on fu.id=fa.user_id where fa.family_id=c.family_id and lower(btrim(fu.email))=lower(btrim(c.email)))) order by c.full_name),'[]') from bm_pinto.family_contacts c where minor and c.family_id=p.family_id),
 'personal_contacts',(select coalesce(jsonb_agg(jsonb_build_object('email',c.email,'confirmed',c.confirmed,'from_account',exists(select 1 from auth.users u where u.id=p.personal_account and lower(btrim(u.email))=c.email)) order by c.email),'[]') from bm_pinto.player_purchase_contacts c where not minor and c.player_id=p.id),'personal_account_email',(select email from auth.users where id=p.personal_account),'is_minor',minor,
 'membership_state',member_state,'orders',orders_value,'orders_scope',case when minor then 'family' else 'personal' end,'memberships',members_value,'registrations',registrations_value,'admin',is_admin);
end;$$;




notify pgrst,'reload schema';
commit;
