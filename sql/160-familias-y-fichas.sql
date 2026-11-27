-- Desarrollo aislado. Aplicar despues de SQL 140; no modifica pedidos ni socios.
begin;
create table if not exists bm_pinto.families (
 id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now()
);
create table if not exists bm_pinto.family_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 family_id uuid not null references bm_pinto.families(id), created_at timestamptz not null default now()
);
create table if not exists bm_pinto.family_contacts (
 id uuid primary key default gen_random_uuid(),family_id uuid not null references bm_pinto.families(id),
 full_name text not null,relationship text not null default 'guardian',email text not null default '',phone text not null default '',
 identifier_hash text,account_id uuid references auth.users(id) on delete set null,confirmed boolean not null default false,
 unique(family_id,email,full_name)
);
create table if not exists bm_pinto.family_players (
 id uuid primary key default gen_random_uuid(),family_id uuid not null references bm_pinto.families(id),
 full_name text not null,birth date not null check(birth>=date '1900-01-01'),identity_key text not null,
 personal_account uuid references auth.users(id) on delete set null,profile jsonb not null default '{}',
 unique(family_id,identity_key)
);
create table if not exists bm_pinto.family_registration_players (
 registration_id uuid not null references bm_pinto.registration_tests(id) on delete cascade,
 player_index integer not null check(player_index between 0 and 11),player_id uuid not null references bm_pinto.family_players(id),
 primary key(registration_id,player_index)
);
create table if not exists bm_pinto.family_history_players (
 source_row integer primary key,player_id uuid not null references bm_pinto.family_players(id)
);
create table if not exists bm_pinto.family_submission_fingerprints (
 registration_id uuid primary key references bm_pinto.registration_tests(id) on delete cascade, fingerprint text not null
);
create table if not exists bm_pinto.family_player_photos (
 player_id uuid primary key references bm_pinto.family_players(id) on delete cascade,
 image bytea not null check(octet_length(image) between 20 and 524288),mime text not null check(mime in('image/jpeg','image/png')),changed_at timestamptz not null default now()
);
do $$declare t text;begin foreach t in array array['families','family_accounts','family_contacts','family_players','family_registration_players','family_history_players','family_submission_fingerprints','family_player_photos'] loop
 execute format('alter table bm_pinto.%I enable row level security',t);
 execute format('revoke all on bm_pinto.%I from public,anon,authenticated',t);
end loop;end;$$;

create or replace function bm_pinto.verified_family_user() returns uuid language plpgsql stable set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Inicia sesion con una cuenta verificada' using errcode='42501';end if;
 return auth.uid();
end;$$;
create or replace function bm_pinto.ensure_family(account uuid,label text) returns uuid language plpgsql set search_path='' as $$
declare f uuid;begin
 if not exists(select 1 from auth.users where id=account and email_confirmed_at is not null) then raise exception 'Cuenta sin verificar' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(account::text,160));
 select family_id into f from bm_pinto.family_accounts where user_id=account;
 if f is null then insert into bm_pinto.families(name) values(left(coalesce(nullif(btrim(label),''),'Familia del club'),120)) returning id into f;
 insert into bm_pinto.family_accounts values(account,f,now());end if;return f;
end;$$;
create or replace function bm_pinto.family_player(f uuid,n text,b date,p jsonb,personal uuid default null) returns uuid language plpgsql set search_path='' as $$
declare ident text;pid uuid;begin
 if char_length(btrim(n)) not between 1 and 120 or b is null or b<date '1900-01-01' or b>(now() at time zone 'Europe/Madrid')::date then raise exception 'Revisa nombre y nacimiento';end if;
 ident:=encode(sha256(convert_to(bm_pinto.dorsal_name(n)||'|'||b::text,'UTF8')),'hex');
 insert into bm_pinto.family_players(family_id,full_name,birth,identity_key,profile,personal_account) values(f,btrim(n),b,ident,p,personal)
 on conflict(family_id,identity_key) do update set profile=bm_pinto.family_players.profile||excluded.profile,full_name=excluded.full_name,personal_account=coalesce(bm_pinto.family_players.personal_account,excluded.personal_account)
 returning id into pid;return pid;
end;$$;
create or replace function bm_pinto.attach_registration_family(reg uuid,extra jsonb default '{}') returns uuid language plpgsql set search_path='' as $$
declare account uuid;f uuid;r jsonb;d jsonb;p jsonb;detail jsonb;pid uuid;i integer;birth_value date;own_account uuid;email_value text;contact_email text;contact_hash text;g jsonb;
begin
 select user_id into account from bm_pinto.registration_test_owners where registration_id=reg;
 select summary into strict r from bm_pinto.registration_tests where id=reg;
 select details into strict d from bm_pinto.registration_test_details where registration_id=reg;
 select lower(btrim(email)) into email_value from auth.users where id=account and email_confirmed_at is not null;
 if email_value is null then raise exception 'La inscripcion necesita cuenta verificada';end if;
 f:=bm_pinto.ensure_family(account,'Familia de '||coalesce(d->'contact'->>'name','la cuenta'));
 contact_email:=lower(btrim(coalesce(d->'contact'->>'email','')));
 select encode(sha256(convert_to(upper(regexp_replace(x->>'guardianId','[[:space:].-]','','g')),'UTF8')),'hex') into contact_hash from jsonb_array_elements(d->'players') x where btrim(coalesce(x->>'guardianId',''))<>'' limit 1;
 insert into bm_pinto.family_contacts(family_id,full_name,relationship,email,phone,identifier_hash,account_id,confirmed)
 values(f,left(coalesce(d->'contact'->>'name','Responsable'),120),coalesce(extra->>'relationship','guardian'),contact_email,left(coalesce(d->'contact'->>'phone',''),40),contact_hash,case when contact_email=email_value then account end,contact_email=email_value)
 on conflict(family_id,email,full_name) do update set phone=excluded.phone;
 if contact_email<>email_value then insert into bm_pinto.family_contacts(family_id,full_name,relationship,email,account_id,confirmed) values(f,'Titular de la cuenta','account',email_value,account,true) on conflict do nothing;end if;
 if jsonb_typeof(extra->'additional')='object' and btrim(coalesce(extra->'additional'->>'name',''))<>'' then
 g:=extra->'additional';
 insert into bm_pinto.family_contacts(family_id,full_name,relationship,email,phone,identifier_hash)
 values(f,left(g->>'name',120),coalesce(g->>'relationship','guardian'),lower(btrim(coalesce(g->>'email',''))),left(coalesce(g->>'phone',''),40),case when btrim(coalesce(g->>'identifier',''))<>'' then encode(sha256(convert_to(upper(regexp_replace(g->>'identifier','[[:space:].-]','','g')),'UTF8')),'hex') end) on conflict do nothing;
 end if;
 for i in 0..jsonb_array_length(r->'players')-1 loop
 p:=r->'players'->i;detail:=d->'players'->i;birth_value:=(detail->>'birth')::date;own_account:=null;
 p:=p||jsonb_build_object('dorsal',(select number from bm_pinto.registration_dorsals where registration_id=reg and player_index=i));
 -- Nunca se usa el documento del tutor como identidad del menor.
 if birth_value<=(now() at time zone 'Europe/Madrid')::date-interval '18 years' and to_regclass('bm_pinto.customer_identifiers') is not null then
  if exists(select 1 from bm_pinto.customer_identifiers where user_id=account and identifier_hash=encode(sha256(convert_to(upper(regexp_replace(coalesce(detail->>'playerId',''),'[[:space:].-]','','g')),'UTF8')),'hex')) then own_account:=account;end if;
 end if;
 pid:=bm_pinto.family_player(f,p->>'name',birth_value,jsonb_build_object('sports',p,'details',detail,'contact',d->'contact'),own_account);
 insert into bm_pinto.family_registration_players values(reg,i,pid) on conflict(registration_id,player_index) do nothing;
 end loop;return f;
end;$$;

do $$begin
 if to_regprocedure('bm_pinto.submit_registration_without_family_160(uuid,jsonb,text,jsonb)') is null then
  alter function public.bm_pinto_submit_registration_test_details(uuid,jsonb,text,jsonb) rename to submit_registration_without_family_160;
  alter function public.submit_registration_without_family_160(uuid,jsonb,text,jsonb) set schema bm_pinto;
 end if;
end;$$;
create or replace function public.bm_pinto_submit_registration_test_details(submission_id uuid,submission jsonb,first_receipt text,p_details jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare reference text;fingerprint_value text;previous_value text;extra jsonb:=coalesce(p_details->'family','{}');begin
 perform bm_pinto.verified_family_user();
 if jsonb_typeof(extra)<>'object' or octet_length(extra::text)>3000 or extra-array['relationship','additional']<>'{}'::jsonb then raise exception 'Datos familiares incorrectos';end if;
 if extra?'relationship' and extra->>'relationship' not in('father','mother','guardian','self') then raise exception 'Relacion familiar incorrecta';end if;
 if extra?'additional' and (jsonb_typeof(extra->'additional')<>'object' or (extra->'additional')-array['name','relationship','email','phone','identifier']<>'{}'::jsonb) then raise exception 'Otro responsable incorrecto';end if;
 if extra?'additional' and (
  length(btrim(coalesce(extra->'additional'->>'name','')))=0 or length(extra->'additional'->>'name')>200
  or coalesce(extra->'additional'->>'relationship','guardian') not in('father','mother','guardian')
  or length(coalesce(extra->'additional'->>'email',''))>254
  or (coalesce(extra->'additional'->>'email','')<>'' and extra->'additional'->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  or length(coalesce(extra->'additional'->>'phone',''))>40
  or length(coalesce(extra->'additional'->>'identifier',''))>20
 ) then raise exception 'Revisa los datos del otro responsable';end if;
 fingerprint_value:=encode(sha256(convert_to(jsonb_build_array(submission,p_details,first_receipt)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(140026);
 select f.fingerprint into previous_value from bm_pinto.family_submission_fingerprints f join bm_pinto.registration_test_owners o on o.registration_id=f.registration_id where f.registration_id=submission_id and o.user_id=auth.uid();
 if found then if previous_value<>fingerprint_value then raise exception 'El reintento contiene otros datos' using errcode='PT409';end if;return 'INS-PRUEBA-'||submission_id::text;end if;
 reference:=bm_pinto.submit_registration_without_family_160(submission_id,submission,first_receipt,p_details-'family');
 perform bm_pinto.attach_registration_family(submission_id,extra);
 insert into bm_pinto.family_submission_fingerprints values(submission_id,fingerprint_value);
 return reference;
end;$$;
revoke all on function public.bm_pinto_submit_registration_test_details(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.bm_pinto_submit_registration_test_details(uuid,jsonb,text,jsonb) to authenticated,service_role;

-- Reutiliza el calculo existente, conservando la funcion publica y sus permisos.
-- La copia privada solo es invocada tras autorizar la ficha familiar.
do $$declare definition text;cleaned text;begin
 if to_regprocedure('public.bm_pinto_registration_test_payments(uuid)') is not null then
 select pg_get_functiondef('public.bm_pinto_registration_test_payments(uuid)'::regprocedure) into definition;
 cleaned:=regexp_replace(definition,'(?is)if (session_user\s*<>\s*''postgres''\s+and\s+)?not public\.bm_pinto_is_admin\(\) and not exists\s*\([^;]+;[[:space:]]*end if;','');
 if cleaned=definition then raise exception 'La comprobacion de cuotas ha cambiado; revisar integracion familiar';end if;
 cleaned:=replace(cleaned,'public.bm_pinto_registration_test_payments','bm_pinto.family_payment_snapshot_160');execute cleaned;
 revoke all on function bm_pinto.family_payment_snapshot_160(uuid) from public,anon,authenticated,service_role;
 end if;
end;$$;

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
  select count(*) into source_count from bm_pinto.registration_history where source_row=p_history_row and is_current;
  if source_count<>1 then raise exception 'El club debe revisar la ficha de archivo';end if;
  select profile into p from bm_pinto.registration_history where source_row=p_history_row and is_current;
  select lower(btrim(email)) into email_value from auth.users where id=actor;
  if not public.bm_pinto_is_admin() and email_value not in(lower(btrim(coalesce(p->>'contactEmail',''))),lower(btrim(coalesce(p->>'submittedEmail','')))) then raise exception 'Acceso reservado' using errcode='42501';end if;
  select player_id into pid from bm_pinto.family_history_players where source_row=p_history_row;
  if pid is not null then return jsonb_build_object('player_id',pid);end if;
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
 else select array_agg(lower(btrim(email))) into emails from auth.users where id=p.personal_account and email_confirmed_at is not null;end if;
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
 'family',jsonb_build_object('id',p.family_id,'name',(select name from bm_pinto.families where id=p.family_id)),
 'siblings',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.full_name) order by x.full_name),'[]') from bm_pinto.family_players x where x.family_id=p.family_id and (is_admin or x.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' or x.personal_account=actor)),
 'contacts',(select coalesce(jsonb_agg(jsonb_build_object('name',c.full_name,'relationship',c.relationship,'email',c.email,'phone',c.phone,'confirmed',c.confirmed) order by c.full_name),'[]') from bm_pinto.family_contacts c where c.family_id=p.family_id),
 'orders',orders_value,'orders_scope',case when minor then 'family' else 'personal' end,'memberships',members_value,'registrations',registrations_value,'admin',is_admin);
end;$$;

create or replace function public.bm_pinto_set_player_photo(p_player_id uuid,p_image text default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();p bm_pinto.family_players;bytes bytea;mime_value text;begin
 select * into strict p from bm_pinto.family_players where id=p_player_id;
 if not public.bm_pinto_is_admin() and not (p.personal_account is not distinct from actor or (p.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' and exists(select 1 from bm_pinto.family_accounts where family_id=p.family_id and user_id=actor))) then raise exception 'Acceso reservado' using errcode='42501';end if;
 if p_image is null then delete from bm_pinto.family_player_photos where player_id=p.id;return;end if;
 if length(p_image)>700000 then raise exception 'Foto demasiado grande';end if;bytes:=decode(p_image,'base64');
 mime_value:=case when substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex') then 'image/png' when substring(bytes from 1 for 3)=decode('ffd8ff','hex') then 'image/jpeg' end;
 if mime_value is null or octet_length(bytes) not between 20 and 524288 then raise exception 'Usa una foto JPG o PNG';end if;
 insert into bm_pinto.family_player_photos(player_id,image,mime) values(p.id,bytes,mime_value) on conflict(player_id) do update set image=excluded.image,mime=excluded.mime,changed_at=now();
end;$$;

create or replace function public.bm_pinto_link_family_account(p_family_id uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare account uuid;existing uuid;begin
 perform bm_pinto.verified_family_user();if not public.bm_pinto_is_admin() then raise exception 'Solo el club puede confirmar otra cuenta familiar' using errcode='42501';end if;
 select id into account from auth.users where lower(btrim(email))=lower(btrim(p_email)) and email_confirmed_at is not null;
 if account is null then raise exception 'La cuenta debe existir y estar verificada';end if;
 perform pg_advisory_xact_lock(hashtextextended(account::text,160));
 if not exists(select 1 from bm_pinto.families where id=p_family_id) then raise exception 'Familia inexistente';end if;
 select family_id into existing from bm_pinto.family_accounts where user_id=account;
 if existing is not null and existing<>p_family_id then raise exception 'Esta cuenta ya pertenece a otra familia; revisar sin fusion automatica';end if;
 insert into bm_pinto.family_accounts values(account,p_family_id,now()) on conflict(user_id) do nothing;
 update bm_pinto.family_contacts set account_id=account,confirmed=true where family_id=p_family_id and lower(btrim(email))=lower(btrim(p_email));
end;$$;

create or replace function public.bm_pinto_family_players() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();begin
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'birth',p.birth,'family_name',f.name,'category',coalesce(p.profile->'sports'->>'category',p.profile->'archive'->>'category')) order by p.full_name),'[]')
 from bm_pinto.family_players p join bm_pinto.families f on f.id=p.family_id where public.bm_pinto_is_admin() or p.personal_account=actor or (p.birth>(now() at time zone 'Europe/Madrid')::date-interval '18 years' and exists(select 1 from bm_pinto.family_accounts a where a.family_id=p.family_id and a.user_id=actor)));
end;$$;

do $$declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='bm_pinto' and p.proname in('verified_family_user','ensure_family','family_player','attach_registration_family','submit_registration_without_family_160') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
end loop;end;$$;
revoke all on function public.bm_pinto_open_player_source(uuid,integer,integer,text),public.bm_pinto_player_dossier(uuid),public.bm_pinto_link_family_account(uuid,text),public.bm_pinto_family_players(),public.bm_pinto_set_player_photo(uuid,text) from public,anon,authenticated;
grant execute on function public.bm_pinto_open_player_source(uuid,integer,integer,text),public.bm_pinto_player_dossier(uuid),public.bm_pinto_link_family_account(uuid,text),public.bm_pinto_family_players(),public.bm_pinto_set_player_photo(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
