-- Contacto familiar confirmado por el club: permite reunir compras de invitado.
-- No crea usuarios ni concede acceso para iniciar sesión.
begin;
create table if not exists bm_pinto.family162_function_backup(signature text primary key,definition text not null,captured_at timestamptz not null default now());
alter table bm_pinto.family162_function_backup enable row level security;
revoke all on bm_pinto.family162_function_backup from public,anon,authenticated;
insert into bm_pinto.family162_function_backup(signature,definition)
select 'public.bm_pinto_player_dossier(uuid)',pg_get_functiondef('public.bm_pinto_player_dossier(uuid)'::regprocedure) on conflict do nothing;
create table if not exists bm_pinto.family_contact_audit (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references bm_pinto.families(id),
 contact_id uuid not null references bm_pinto.family_contacts(id), actor_id uuid not null,
 action text not null check(action in('confirm','revoke')), created_at timestamptz not null default now()
);
alter table bm_pinto.family_contact_audit enable row level security;
revoke all on bm_pinto.family_contact_audit from public,anon,authenticated;

create or replace function public.bm_pinto_confirm_family_contact(p_family_id uuid,p_email text,p_name text default null,p_relationship text default 'guardian')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();email_value text:=lower(btrim(coalesce(p_email,'')));cid uuid;matches integer;changed boolean;begin
 if not public.bm_pinto_is_admin() then raise exception 'Solo el club puede confirmar contactos familiares' using errcode='42501';end if;
 if length(email_value)>254 or email_value!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or coalesce(p_relationship,'') not in('father','mother','guardian') or length(coalesce(p_name,''))>120 then raise exception 'Revisa nombre, correo y relacion' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(email_value,162));
 if not exists(select 1 from bm_pinto.families where id=p_family_id) then raise exception 'Familia inexistente';end if;
 if exists(select 1 from bm_pinto.family_contacts where lower(btrim(email))=email_value and family_id<>p_family_id and confirmed)
 or exists(select 1 from bm_pinto.family_accounts a join auth.users u on u.id=a.user_id where lower(btrim(u.email))=email_value and a.family_id<>p_family_id) then
 raise exception 'Este correo ya pertenece a otra familia; el club debe revisar la relacion' using errcode='PT409';end if;
 select count(*),min(id::text)::uuid into matches,cid from bm_pinto.family_contacts where family_id=p_family_id and lower(btrim(email))=email_value;
 if matches>1 then raise exception 'Hay varios contactos con ese correo; el club debe revisarlos' using errcode='PT409';end if;
 if cid is null then
  insert into bm_pinto.family_contacts(family_id,full_name,relationship,email,confirmed)
  values(p_family_id,coalesce(nullif(btrim(p_name),''),email_value),p_relationship,email_value,true) returning id into cid;
  changed:=true;
 else
  select not confirmed or (nullif(btrim(p_name),'') is not null and full_name<>btrim(p_name)) or relationship<>p_relationship into changed from bm_pinto.family_contacts where id=cid;
  update bm_pinto.family_contacts set full_name=coalesce(nullif(btrim(p_name),''),full_name),relationship=p_relationship,confirmed=true where id=cid;
 end if;
 if changed then insert into bm_pinto.family_contact_audit(family_id,contact_id,actor_id,action) values(p_family_id,cid,actor,'confirm');end if;
 return jsonb_build_object('contact_id',cid,'orders',(select count(*) from bm_pinto.orders where lower(btrim(email))=email_value and not is_test),'login_granted',false);
end;$$;

create or replace function public.bm_pinto_revoke_family_contact(p_contact_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=bm_pinto.verified_family_user();c bm_pinto.family_contacts;begin
 if not public.bm_pinto_is_admin() then raise exception 'Solo el club puede revisar contactos familiares' using errcode='42501';end if;
 select * into strict c from bm_pinto.family_contacts where id=p_contact_id;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(c.email)),162));
 if c.account_id is not null or exists(select 1 from bm_pinto.family_accounts a join auth.users u on u.id=a.user_id where a.family_id=c.family_id and lower(btrim(u.email))=lower(btrim(c.email))) then raise exception 'Este contacto tiene cuenta de acceso; revisa su autorizacion con el club' using errcode='PT409';end if;
 if c.confirmed then
  update bm_pinto.family_contacts set confirmed=false where id=c.id;
  insert into bm_pinto.family_contact_audit(family_id,contact_id,actor_id,action) values(c.family_id,c.id,actor,'revoke');
 end if;
end;$$;

revoke all on function public.bm_pinto_confirm_family_contact(uuid,text,text,text),public.bm_pinto_revoke_family_contact(uuid) from public,anon,authenticated;
grant execute on function public.bm_pinto_confirm_family_contact(uuid,text,text,text),public.bm_pinto_revoke_family_contact(uuid) to authenticated;

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
 'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.full_name,'relationship',c.relationship,'email',c.email,'phone',c.phone,'confirmed',c.confirmed,'has_account',c.account_id is not null or exists(select 1 from bm_pinto.family_accounts fa join auth.users fu on fu.id=fa.user_id where fa.family_id=c.family_id and lower(btrim(fu.email))=lower(btrim(c.email)))) order by c.full_name),'[]') from bm_pinto.family_contacts c where c.family_id=p.family_id),
 'orders',orders_value,'orders_scope',case when minor then 'family' else 'personal' end,'memberships',members_value,'registrations',registrations_value,'admin',is_admin);
end;$$;


notify pgrst,'reload schema';
commit;
