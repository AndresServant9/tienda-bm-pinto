-- RAMA DE DESARROLLO: aplicar solo a la base aislada hasta integrar frontend y backend.
-- Numeros del 1 al 99; sexo independiente, categoria actual y proxima temporada.
begin;
create table if not exists bm_pinto.dorsal_assignments (
 id uuid primary key default gen_random_uuid(),
 season_year integer not null check(season_year between 2020 and 2100),
 division text not null check(division in('male','female')),
 number integer not null check(number between 1 and 99),
 birth_min integer not null check(birth_min between 1900 and 2100),
 birth_max integer not null check(birth_max>=birth_min and birth_max<=2100),
 player_name text not null check(char_length(player_name) between 1 and 120),
 owner_id uuid references auth.users(id),
 registration_id uuid references bm_pinto.registration_tests(id) on delete cascade,
 state text not null default 'active' check(state in('active','review','released')),
 source_key text unique,
 created_at timestamptz not null default now()
);
create table if not exists bm_pinto.registration_dorsals (
 registration_id uuid not null references bm_pinto.registration_tests(id) on delete cascade,
 player_index integer not null check(player_index between 0 and 11),
 assignment_id uuid not null references bm_pinto.dorsal_assignments(id),
 number integer not null check(number between 1 and 99),
 primary key(registration_id,player_index)
);
create table if not exists bm_pinto.dorsal_submission_fingerprints (
 registration_id uuid primary key references bm_pinto.registration_tests(id) on delete cascade,
 fingerprint text not null
);
alter table bm_pinto.dorsal_assignments enable row level security;
alter table bm_pinto.registration_dorsals enable row level security;
alter table bm_pinto.dorsal_submission_fingerprints enable row level security;
revoke all on bm_pinto.dorsal_assignments,bm_pinto.registration_dorsals,bm_pinto.dorsal_submission_fingerprints from public,anon,authenticated;
create index if not exists dorsal_availability_idx on bm_pinto.dorsal_assignments(season_year,division,number) where state<>'released';

create or replace function bm_pinto.dorsal_category(birth_year integer,season_year integer)
returns integer language sql immutable set search_path='' as $$
 select least(6,greatest(0,floor((season_year-birth_year-6)::numeric/2)::integer));
$$;
create or replace function bm_pinto.dorsal_name(value text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(translate(upper(btrim(value)),'ÁÉÍÓÚÜ','AEIOUU'),'\s+',' ','g');
$$;
create or replace function bm_pinto.dorsal_overlap(a_min integer,a_max integer,b_min integer,b_max integer,season_year integer)
returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from generate_series(season_year,season_year+1) y
 where bm_pinto.dorsal_category(a_max,y)<=bm_pinto.dorsal_category(b_min,y)+1
 and bm_pinto.dorsal_category(b_max,y)<=bm_pinto.dorsal_category(a_min,y)+1);
$$;
create or replace function public.bm_pinto_dorsal_options(p_birth date,p_division text,p_name text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare year_value integer; birth_year integer; own_id uuid; matches integer; own_number integer;
begin
 select start_year into year_value from bm_pinto.campaign_release_state where singleton;
 if year_value is null then raise exception 'Temporada sin configurar'; end if;
 if p_birth is null or p_birth<date '1900-01-01' or p_birth>(now() at time zone 'Europe/Madrid')::date
 or extract(year from p_birth)>year_value or p_division is null or p_division not in('male','female') or char_length(coalesce(p_name,''))>120 then
  raise exception 'Revisa nacimiento y rama' using errcode='22023';
 end if;
 birth_year:=extract(year from p_birth)::integer;
 select count(*),min(id::text)::uuid,min(number) into matches,own_id,own_number
 from bm_pinto.dorsal_assignments a where a.season_year=year_value and a.division=p_division
 and a.state='active' and a.owner_id=auth.uid()
 and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 and birth_year between a.birth_min and a.birth_max and bm_pinto.dorsal_name(a.player_name)=bm_pinto.dorsal_name(p_name);
 if matches>1 then raise exception 'El club debe revisar el dorsal asignado' using errcode='PT409'; end if;
 return jsonb_build_object('season_year',year_value,'own_number',case when matches=1 then own_number else null end,
 'available',coalesce((select jsonb_agg(n order by n) from generate_series(1,99) n
 where (matches=0 or n=own_number) and not exists(select 1 from bm_pinto.dorsal_assignments a
 where a.season_year=year_value and a.division=p_division and a.number=n and a.state<>'released'
 and a.id is distinct from own_id and bm_pinto.dorsal_overlap(birth_year,birth_year,a.birth_min,a.birth_max,year_value))),'[]'::jsonb));
end;$$;
revoke all on function public.bm_pinto_dorsal_options(date,text,text) from public,anon,authenticated;
grant execute on function public.bm_pinto_dorsal_options(date,text,text) to anon,authenticated;

-- Mantener la validacion completa anterior privada y cerrar el envio sin dorsal.
do $$ begin
 if to_regprocedure('bm_pinto.submit_registration_without_dorsals_140(uuid,jsonb,text,jsonb)') is null then
  alter function public.bm_pinto_submit_registration_test_details(uuid,jsonb,text,jsonb) rename to submit_registration_without_dorsals_140;
  alter function public.submit_registration_without_dorsals_140(uuid,jsonb,text,jsonb) set schema bm_pinto;
 end if;
end;$$;
revoke all on function bm_pinto.submit_registration_without_dorsals_140(uuid,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create or replace function public.bm_pinto_submit_registration_test_details(submission_id uuid,submission jsonb,first_receipt text,p_details jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare year_value integer; count_players integer; fingerprint_value text; previous_hash text;
 player jsonb; detail jsonb; idx integer; number_value integer; birth_year integer; birth_value date;
 own_id uuid; number_id uuid; options jsonb; reference text;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Inicia sesion con una cuenta verificada' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(140026);
 fingerprint_value:=encode(sha256(convert_to(jsonb_build_array(submission,p_details,first_receipt)::text,'UTF8')),'hex');
 select f.fingerprint into previous_hash from bm_pinto.dorsal_submission_fingerprints f
 join bm_pinto.registration_test_owners o on o.registration_id=f.registration_id
 where f.registration_id=submission_id and o.user_id=auth.uid();
 if found then
  if previous_hash<>fingerprint_value then raise exception 'El reintento contiene otros datos' using errcode='PT409'; end if;
  return 'INS-PRUEBA-'||submission_id::text;
 end if;
 if exists(select 1 from bm_pinto.registration_tests where id=submission_id) then
  raise exception 'Esta inscripcion ya existe; contacta con el club' using errcode='PT409';
 end if;
 if jsonb_typeof(submission->'players') is distinct from 'array' or jsonb_typeof(p_details->'players') is distinct from 'array'
 or jsonb_typeof(p_details->'dorsals') is distinct from 'array' then raise exception 'Elige un dorsal para cada jugador' using errcode='22023'; end if;
 count_players:=jsonb_array_length(submission->'players');
 if count_players not between 1 and 12 or count_players<>jsonb_array_length(p_details->'players') or count_players<>jsonb_array_length(p_details->'dorsals') then
  raise exception 'Elige un dorsal para cada jugador' using errcode='22023';
 end if;
 select start_year into year_value from bm_pinto.campaign_release_state where singleton;
 -- La funcion anterior comprueba importes, socio, identidad, ficha y justificante.
 reference:=bm_pinto.submit_registration_without_dorsals_140(submission_id,submission,first_receipt,p_details-'dorsals');
 for idx in 0..count_players-1 loop
  player:=submission->'players'->idx; detail:=p_details->'players'->idx;
  if jsonb_typeof(p_details->'dorsals'->idx) is distinct from 'number' or (p_details->'dorsals'->>idx)!~'^[0-9]{1,2}$'
  then raise exception 'Dorsal incorrecto' using errcode='22023'; end if;
  number_value:=(p_details->'dorsals'->>idx)::integer;
  birth_value:=(detail->>'birth')::date; birth_year:=extract(year from birth_value)::integer;
  options:=public.bm_pinto_dorsal_options(birth_value,player->>'division',player->>'name');
  if not (options->'available' @> to_jsonb(array[number_value])) then
   raise exception 'Ese dorsal ya no esta disponible. Elige otro numero.' using errcode='PT410';
  end if;
  select a.id into own_id from bm_pinto.dorsal_assignments a where a.season_year=year_value and a.division=player->>'division'
  and a.state='active' and a.owner_id=auth.uid() and birth_year between a.birth_min and a.birth_max
  and bm_pinto.dorsal_name(a.player_name)=bm_pinto.dorsal_name(player->>'name');
  -- Un jugador no puede ocupar dos posiciones de la misma inscripcion.
  if own_id is not null and exists(select 1 from bm_pinto.registration_dorsals d where d.assignment_id=own_id) then
   raise exception 'El jugador ya tiene una inscripcion con este dorsal' using errcode='PT409';
  end if;
  if own_id is null then
   insert into bm_pinto.dorsal_assignments(season_year,division,number,birth_min,birth_max,player_name,owner_id,registration_id)
   values(year_value,player->>'division',number_value,birth_year,birth_year,player->>'name',auth.uid(),submission_id) returning id into number_id;
  else number_id:=own_id; end if;
  insert into bm_pinto.registration_dorsals values(submission_id,idx,number_id,number_value);
 end loop;
 insert into bm_pinto.dorsal_submission_fingerprints values(submission_id,fingerprint_value);
 return reference;
end;$$;
revoke all on function public.bm_pinto_submit_registration_test_details(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.bm_pinto_submit_registration_test_details(uuid,jsonb,text,jsonb) to authenticated,service_role;
create or replace function public.bm_pinto_registration_dorsals(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bm_pinto_is_admin() and not exists(select 1 from bm_pinto.registration_test_owners o where o.registration_id=p_id and o.user_id=auth.uid()) then
  raise exception 'Acceso reservado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('player_index',player_index,'number',number) order by player_index) from bm_pinto.registration_dorsals where registration_id=p_id),'[]'::jsonb);
end;$$;
revoke all on function public.bm_pinto_registration_dorsals(uuid) from public,anon,authenticated;
grant execute on function public.bm_pinto_registration_dorsals(uuid) to authenticated;
create or replace function public.bm_pinto_my_registration_dorsals()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesion' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('registration_id',d.registration_id,'player_index',d.player_index,'number',d.number))
 from bm_pinto.registration_dorsals d where public.bm_pinto_is_admin() or exists(select 1 from bm_pinto.registration_test_owners o
 where o.registration_id=d.registration_id and o.user_id=auth.uid())),'[]'::jsonb);
end;$$;
revoke all on function public.bm_pinto_my_registration_dorsals() from public,anon,authenticated;
grant execute on function public.bm_pinto_my_registration_dorsals() to authenticated;
revoke all on function bm_pinto.dorsal_category(integer,integer),bm_pinto.dorsal_name(text),bm_pinto.dorsal_overlap(integer,integer,integer,integer,integer) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
