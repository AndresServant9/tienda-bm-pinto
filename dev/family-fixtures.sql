-- Estructuras y usuarios ficticios para el entorno local; nunca exportar a produccion.
create table if not exists bm_pinto.club_admins(user_id uuid primary key references auth.users(id));
insert into auth.users(id,email,email_confirmed_at) values('14000000-0000-4000-8000-000000000003','admin@example.test',now()) on conflict do nothing;
insert into bm_pinto.club_admins values('14000000-0000-4000-8000-000000000003') on conflict do nothing;
create or replace function public.bm_pinto_is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from bm_pinto.club_admins where user_id=auth.uid())$$;
create table if not exists bm_pinto.customer_identifiers(user_id uuid primary key references auth.users(id),identifier_hash text not null);
create table if not exists bm_pinto.orders(id uuid primary key default gen_random_uuid(),reference text not null,idempotency_key uuid default gen_random_uuid(),created_at timestamptz default now(),recipient text,email text,phone text,tariff text default 'regular',total_cents integer,payment_status text,is_test boolean default false);
create table if not exists bm_pinto.order_lines(id uuid primary key default gen_random_uuid(),order_id uuid references bm_pinto.orders(id),garment text,size text,quantity integer,printed_name text,printed_number text);
create table if not exists bm_pinto.membership_test_requests(id uuid primary key,profile jsonb,season text,kind text,approved_at timestamptz,rejected_at timestamptz,awaiting_receipt boolean default false,received_at timestamptz default now());
alter table bm_pinto.membership_test_requests add column if not exists rejected_at timestamptz;
alter table bm_pinto.membership_test_requests add column if not exists awaiting_receipt boolean default false;
create table if not exists bm_pinto.registration_history(source_spreadsheet text not null,source_sheet text not null,source_row integer,season text,player_key text,is_current boolean default true,profile jsonb,source_headers jsonb default '[]',source_values jsonb default '[]',primary key(source_spreadsheet,source_sheet,source_row));
create or replace function public.bm_pinto_registration_test_payments(p_registration_id uuid) returns jsonb language plpgsql security definer set search_path='' as $body$
 declare s jsonb;plan jsonb:='[]';i integer;amount numeric;begin
 if not public.bm_pinto_is_admin() and not exists(select 1 from bm_pinto.registration_test_owners where registration_id=p_registration_id and user_id=auth.uid()) then raise exception 'Acceso reservado' using errcode='42501';end if;
 select summary into strict s from bm_pinto.registration_tests where id=p_registration_id;
 for i in 0..2 loop
 if i=1 and s->>'registration_day'>'2026-09-15' then continue;end if;
 if i=0 and s->>'registration_day'>'2026-09-15' then
 select coalesce(sum((p->'payments'->>0)::numeric+(p->'payments'->>1)::numeric),0) into amount from jsonb_array_elements(s->'players') p;
 else select coalesce(sum((p->'payments'->>i)::numeric),0) into amount from jsonb_array_elements(s->'players') p;end if;
 if amount>0 then plan:=plan||jsonb_build_array(jsonb_build_object('amount',amount,'due_on',case i when 0 then s->>'registration_day' when 1 then '2026-09-15' else '2026-12-24' end,'status','pending'));end if;
 end loop;
 return jsonb_build_object('total',(s->>'total')::numeric,'confirmed',0,'in_review',0,'pending',(s->>'total')::numeric,'installments',plan);
 end;$body$;
create or replace function public.bm_pinto_admin_registration_history() returns jsonb language plpgsql security definer set search_path='' as $$begin if not public.bm_pinto_is_admin() then raise exception 'Acceso reservado' using errcode='42501';end if;return (select coalesce(jsonb_agg(jsonb_build_object('source_row',source_row,'profile',profile)),'[]') from bm_pinto.registration_history where is_current);end;$$;
create or replace function public.bm_pinto_my_registration_history() returns jsonb language sql security definer set search_path='' as $$select coalesce(jsonb_agg(jsonb_build_object('source_row',r.source_row,'profile',r.profile)),'[]') from bm_pinto.registration_history r join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null where r.is_current and lower(r.profile->>'contactEmail')=lower(u.email)$$;
revoke all on bm_pinto.orders,bm_pinto.order_lines,bm_pinto.membership_test_requests,bm_pinto.registration_history from public,anon,authenticated;

create table if not exists bm_pinto.memberships(season text not null,identifier_hash text not null,imported_at timestamptz default now(),primary key(season,identifier_hash));
create table if not exists bm_pinto.membership_history(source_spreadsheet text not null,source_sheet text not null,source_row integer not null,season text not null,identifier_hash text not null,source_identifier_hash text not null,profile jsonb not null,source_date text default '',notes jsonb default '{}',imported_at timestamptz default now(),primary key(source_spreadsheet,source_sheet,source_row));
create table if not exists bm_pinto.membership_renewal_directory(season text not null,identifier_hash text not null,full_name text not null,email text not null,profile jsonb default '{}',primary key(season,identifier_hash));
alter table bm_pinto.membership_test_requests add column if not exists identifier_hash text;
revoke all on bm_pinto.memberships,bm_pinto.membership_history,bm_pinto.membership_renewal_directory from public,anon,authenticated;

alter table bm_pinto.membership_test_requests add column if not exists receipt bytea;
alter table bm_pinto.membership_test_requests add column if not exists mime text;
