-- Base desechable y ficticia. Nunca se conecta a Supabase.
create role anon;create role authenticated;create role service_role;
create schema auth;create schema bm_pinto;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table bm_pinto.campaign_release_state(singleton boolean primary key,start_year integer);
insert into bm_pinto.campaign_release_state values(true,2026);
create table bm_pinto.registration_tests(id uuid primary key,received_at timestamptz default now(),summary jsonb not null);
create table bm_pinto.registration_test_owners(registration_id uuid primary key references bm_pinto.registration_tests(id) on delete cascade,user_id uuid references auth.users(id));
create table bm_pinto.registration_test_details(registration_id uuid primary key references bm_pinto.registration_tests(id) on delete cascade,details jsonb not null);
create function public.bm_pinto_is_admin() returns boolean language sql stable as $$select false$$;
create function public.bm_pinto_submit_registration_test_details(submission_id uuid,submission jsonb,first_receipt text,p_details jsonb)
returns text language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Cuenta requerida' using errcode='42501';end if;
 insert into bm_pinto.registration_tests(id,summary) values(submission_id,submission);
 insert into bm_pinto.registration_test_owners values(submission_id,auth.uid());
 insert into bm_pinto.registration_test_details values(submission_id,p_details);
 return 'INS-PRUEBA-'||submission_id::text;
end;$$;
insert into auth.users values('14000000-0000-4000-8000-000000000001','familia@example.test',now()),('14000000-0000-4000-8000-000000000002','otra@example.test',now());
