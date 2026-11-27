-- Compras personales de adultos, sin heredar los correos de la familia.
begin;
create table if not exists bm_pinto.player_purchase_contacts (
 id uuid primary key default gen_random_uuid(),player_id uuid not null references bm_pinto.family_players(id),
 email text not null,confirmed boolean not null default true,unique(player_id,email)
);
create unique index if not exists player_purchase_email_confirmed on bm_pinto.player_purchase_contacts(email) where confirmed;
create table if not exists bm_pinto.player_purchase_audit (
 id uuid primary key default gen_random_uuid(),player_id uuid not null references bm_pinto.family_players(id),
 email text not null,actor_id uuid not null,action text not null check(action in('confirm','revoke','account')),created_at timestamptz not null default now()
);
create table if not exists bm_pinto.player163_function_backup(signature text primary key,definition text not null,captured_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['player_purchase_contacts','player_purchase_audit','player163_function_backup'] loop
execute format('alter table bm_pinto.%I enable row level security',t);
execute format('revoke all on bm_pinto.%I from public,anon,authenticated',t);end loop;end;$$;
insert into bm_pinto.player163_function_backup(signature,definition)
select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p where p.oid in('public.bm_pinto_player_dossier(uuid)'::regprocedure,'public.bm_pinto_open_player_source(uuid,integer,integer,text)'::regprocedure) on conflict do nothing;

create or replace function public.bm_pinto_confirm_player_purchases(p_player_id uuid,p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();p bm_pinto.family_players;email_value text:=lower(btrim(coalesce(p_email,'')));changed boolean;begin
 if not public.bm_pinto_is_admin() then raise exception 'Solo el club puede vincular compras personales' using errcode='42501';end if;
 select * into strict p from bm_pinto.family_players where id=p_player_id;
 if p.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' then raise exception 'Los menores usan pedidos familiares' using errcode='22023';end if;
 if length(email_value)>254 or email_value!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Revisa el correo' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(email_value,163));
 if exists(select 1 from bm_pinto.player_purchase_contacts where email=email_value and confirmed and player_id<>p.id)
 or exists(select 1 from bm_pinto.family_players x join auth.users u on u.id=x.personal_account where x.id<>p.id and lower(btrim(u.email))=email_value) then raise exception 'El correo ya esta vinculado a otro jugador; el club debe revisarlo' using errcode='PT409';end if;
 select not confirmed into changed from bm_pinto.player_purchase_contacts where player_id=p.id and email=email_value;
 changed:=coalesce(changed,true);
 insert into bm_pinto.player_purchase_contacts(player_id,email,confirmed) values(p.id,email_value,true) on conflict(player_id,email) do update set confirmed=true;
 if changed then insert into bm_pinto.player_purchase_audit(player_id,email,actor_id,action) values(p.id,email_value,actor,'confirm');end if;
 return jsonb_build_object('orders',(select count(*) from bm_pinto.orders where lower(btrim(email))=email_value and not is_test),'login_granted',false);
end;$$;

create or replace function public.bm_pinto_revoke_player_purchases(p_player_id uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();email_value text:=lower(btrim(p_email));begin
 if not public.bm_pinto_is_admin() then raise exception 'Solo el club puede revisar compras personales' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(email_value,163));
 if exists(select 1 from bm_pinto.family_players p join auth.users u on u.id=p.personal_account where p.id=p_player_id and lower(btrim(u.email))=email_value) then raise exception 'Es el correo de su cuenta propia; revisa la autorizacion de cuenta' using errcode='PT409';end if;
 update bm_pinto.player_purchase_contacts set confirmed=false where player_id=p_player_id and email=email_value and confirmed;
 if found then insert into bm_pinto.player_purchase_audit(player_id,email,actor_id,action) values(p_player_id,email_value,actor,'revoke');end if;
end;$$;

create or replace function public.bm_pinto_link_player_account(p_player_id uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();p bm_pinto.family_players;account uuid;document_value text;begin
 if not public.bm_pinto_is_admin() then raise exception 'Solo el club puede autorizar cuentas de jugadores' using errcode='42501';end if;
 select * into strict p from bm_pinto.family_players where id=p_player_id;
 if p.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' then raise exception 'Los menores usan cuentas familiares' using errcode='22023';end if;
 select id into account from auth.users where lower(btrim(email))=lower(btrim(p_email)) and email_confirmed_at is not null;
 if account is null then raise exception 'La cuenta debe existir y estar verificada' using errcode='PT409';end if;
 document_value:=coalesce(nullif(p.profile->'details'->>'playerId',''),p.profile->'archive'->>'identifier');
 if coalesce(document_value,'')='' or not exists(select 1 from bm_pinto.customer_identifiers where user_id=account and identifier_hash=encode(sha256(convert_to(upper(regexp_replace(document_value,'[[:space:].-]','','g')),'UTF8')),'hex')) then raise exception 'El documento de la cuenta no coincide con el jugador' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)),163));
 perform pg_advisory_xact_lock(hashtextextended(p.id::text,163));
 select * into strict p from bm_pinto.family_players where id=p_player_id;
 if exists(select 1 from bm_pinto.family_players where id<>p.id and personal_account=account)
 or exists(select 1 from bm_pinto.player_purchase_contacts where player_id<>p.id and email=lower(btrim(p_email)) and confirmed) then raise exception 'La cuenta o su correo ya estan vinculados a otro jugador; revisar' using errcode='PT409';end if;
 if exists(select 1 from bm_pinto.family_players where id=p.id and personal_account is not null and personal_account<>account) then raise exception 'El jugador ya tiene otra cuenta; revisar' using errcode='PT409';end if;
 if p.personal_account is distinct from account then
 update bm_pinto.family_players set personal_account=account where id=p.id;
 insert into bm_pinto.player_purchase_audit(player_id,email,actor_id,action) values(p.id,lower(btrim(p_email)),actor,'account');end if;
end;$$;

revoke all on function public.bm_pinto_confirm_player_purchases(uuid,text),public.bm_pinto_revoke_player_purchases(uuid,text),public.bm_pinto_link_player_account(uuid,text) from public,anon,authenticated;
grant execute on function public.bm_pinto_confirm_player_purchases(uuid,text),public.bm_pinto_revoke_player_purchases(uuid,text),public.bm_pinto_link_player_account(uuid,text) to authenticated;

create or replace function public.bm_pinto_open_player_source(p_registration_id uuid default null,p_player_index integer default 0,p_history_row integer default null,p_account_email text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();pid uuid;f uuid;p jsonb;r jsonb;account uuid;email_value text;matches integer;source_count integer;birth_value date;
begin
 if p_registration_id is not null then
  if not public.bm_pinto_is_admin() and not exists(select 1 from bm_pinto.registration_test_owners where registration_id=p_registration_id and user_id=actor) then raise exception 'Acceso reservado' using errcode='42501';end if;
  if not exists(select 1 from bm_pinto.family_registration_players where registration_id=p_registration_id) then perform bm_pinto.attach_registration_family(p_registration_id);end if;
  select player_id into pid from bm_pinto.family_registration_players where registration_id=p_registration_id and player_index=p_player_index;
 else
  if p_history_row is null then raise exception 'Selecciona un jugador';end if;
  perform pg_advisory_xact_lock(hashtextextended('archive:'||p_history_row::text,163));
  select count(*) into source_count from bm_pinto.registration_history where source_row=p_history_row and is_current;
  if source_count<>1 then raise exception 'El club debe revisar la ficha de archivo';end if;
  select profile into p from bm_pinto.registration_history where source_row=p_history_row and is_current;
  select lower(btrim(email)) into email_value from auth.users where id=actor;
  if not public.bm_pinto_is_admin() and email_value not in(lower(btrim(coalesce(p->>'contactEmail',''))),lower(btrim(coalesce(p->>'submittedEmail','')))) then raise exception 'Acceso reservado' using errcode='42501';end if;
  if (p->>'birth')::date<=(now() at time zone 'Europe/Madrid')::date-interval '18 years' and not public.bm_pinto_is_admin() and not exists(select 1 from bm_pinto.customer_identifiers where user_id=actor and identifier_hash=encode(sha256(convert_to(upper(regexp_replace(coalesce(p->>'identifier',''),'[[:space:].-]','','g')),'UTF8')),'hex')) then raise exception 'El club debe verificar tu identidad de jugador' using errcode='42501';end if;
  select player_id into pid from bm_pinto.family_history_players where source_row=p_history_row;
  if pid is not null then return jsonb_build_object('player_id',pid);end if;
  birth_value:=(p->>'birth')::date;
  if birth_value<=(now() at time zone 'Europe/Madrid')::date-interval '18 years' then
   if p_account_email is null then return jsonb_build_object('archive',p,'source_row',p_history_row,'needs_personal_link',true);end if;
   if lower(btrim(coalesce(p_account_email,'')))!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Indica el correo del jugador';end if;
   if not public.bm_pinto_is_admin() then
    if lower(btrim(p_account_email)) is distinct from email_value or not exists(select 1 from bm_pinto.customer_identifiers where user_id=actor and identifier_hash=encode(sha256(convert_to(upper(regexp_replace(coalesce(p->>'identifier',''),'[[:space:].-]','','g')),'UTF8')),'hex')) then raise exception 'El club debe verificar tu identidad de jugador' using errcode='42501';end if;
    account:=actor;
   else account:=null;end if;
   insert into bm_pinto.families(name) values('Ficha de '||(p->>'name')) returning id into f;
   pid:=bm_pinto.family_player(f,p->>'name',birth_value,jsonb_build_object('archive',p),account);
   insert into bm_pinto.family_history_players values(p_history_row,pid);
   if public.bm_pinto_is_admin() then perform public.bm_pinto_confirm_player_purchases(pid,p_account_email);end if;
   return jsonb_build_object('player_id',pid);
  end if;
  -- El archivo solo se vincula tras confirmar la relacion, no al abrir el nombre.
  if p_account_email is null then return jsonb_build_object('archive',p,'source_row',p_history_row,'needs_family_link',true);end if;
  if not public.bm_pinto_is_admin() then
   if lower(btrim(p_account_email)) is distinct from email_value then raise exception 'Confirma el correo de tu propia cuenta' using errcode='42501';end if;
   account:=actor;
  else
   select count(*),min(id::text)::uuid into matches,account from auth.users where lower(btrim(email))=lower(btrim(p_account_email)) and email_confirmed_at is not null;
   if matches>1 then raise exception 'El club debe revisar la cuenta del responsable';end if;
  end if;
  birth_value:=(p->>'birth')::date;
  if account is not null then f:=bm_pinto.ensure_family(account,'Familia de '||coalesce(p->>'contactName',p->>'name'));
  else
   if coalesce(p_account_email,'')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Indica correo familiar valido';end if;
   select count(distinct family_id),min(family_id::text)::uuid into matches,f from bm_pinto.family_contacts where lower(btrim(email))=lower(btrim(p_account_email)) and confirmed;
   if matches>1 then raise exception 'El correo figura en varias familias; revisar';end if;
   if f is null then insert into bm_pinto.families(name) values('Familia de '||coalesce(p->>'contactName',p->>'name')) returning id into f;end if;
  end if;
  insert into bm_pinto.family_contacts(family_id,full_name,email,phone,account_id,confirmed) values(f,coalesce(p->>'contactName','Responsable'),lower(btrim(coalesce(p_account_email,email_value))),left(coalesce(p->>'phone',''),40),account,true) on conflict do nothing;
  pid:=bm_pinto.family_player(f,p->>'name',birth_value,jsonb_build_object('archive',p),null);
  insert into bm_pinto.family_history_players values(p_history_row,pid);
 end if;
 if pid is null then raise exception 'Jugador no encontrado';end if;
 return jsonb_build_object('player_id',pid);
end;$$;


create or replace function public.bm_pinto_player_dossier(p_player_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();p bm_pinto.family_players;is_admin boolean:=public.bm_pinto_is_admin();minor boolean;orders_value jsonb:='[]';members_value jsonb:='[]';registrations_value jsonb:='[]';r record;pay jsonb;emails text[];
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
 return jsonb_build_object('player',jsonb_build_object('id',p.id,'name',p.full_name,'birth',p.birth,'profile',p.profile),
 'photo',(select jsonb_build_object('mime',mime,'base64',replace(encode(image,'base64'),E'\n','')) from bm_pinto.family_player_photos where player_id=p.id),
 'family',case when minor then jsonb_build_object('id',p.family_id,'name',(select name from bm_pinto.families where id=p.family_id)) else null end,
 'siblings',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.full_name) order by x.full_name),'[]') from bm_pinto.family_players x where minor and x.family_id=p.family_id and (is_admin or x.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' or x.personal_account=actor)),
 'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.full_name,'relationship',c.relationship,'email',c.email,'phone',c.phone,'confirmed',c.confirmed,'has_account',c.account_id is not null or exists(select 1 from bm_pinto.family_accounts fa join auth.users fu on fu.id=fa.user_id where fa.family_id=c.family_id and lower(btrim(fu.email))=lower(btrim(c.email)))) order by c.full_name),'[]') from bm_pinto.family_contacts c where minor and c.family_id=p.family_id),
 'personal_contacts',(select coalesce(jsonb_agg(jsonb_build_object('email',c.email,'confirmed',c.confirmed,'from_account',exists(select 1 from auth.users u where u.id=p.personal_account and lower(btrim(u.email))=c.email)) order by c.email),'[]') from bm_pinto.player_purchase_contacts c where not minor and c.player_id=p.id),'personal_account_email',(select email from auth.users where id=p.personal_account),'is_minor',minor,
 'orders',orders_value,'orders_scope',case when minor then 'family' else 'personal' end,'memberships',members_value,'registrations',registrations_value,'admin',is_admin);
end;$$;



notify pgrst,'reload schema';
commit;
