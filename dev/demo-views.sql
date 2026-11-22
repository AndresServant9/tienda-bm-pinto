-- Vista de la cuenta familiar solo para la base ficticia del servidor local.
create or replace function public.bm_pinto_my_registration_tests()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]'; r record; installments jsonb; amount numeric; total numeric; i integer; day_value text;
begin
 if auth.uid() is null then raise exception 'Inicia sesion' using errcode='42501';end if;
 for r in select t.* from bm_pinto.registration_tests t join bm_pinto.registration_test_owners o on o.registration_id=t.id where o.user_id=auth.uid() order by t.received_at desc loop
  total:=(r.summary->>'total')::numeric;day_value:=r.summary->>'registration_day';installments:='[]';
  if r.summary->>'payment'='single' then
   installments:=jsonb_build_array(jsonb_build_object('schedule','standard','installment',1,'due_on',day_value,'amount',total,'status','pending'));
  else
   for i in 0..2 loop
    select coalesce(sum((p->'payments'->>i)::numeric),0) into amount from jsonb_array_elements(r.summary->'players') p;
    installments:=installments||jsonb_build_array(jsonb_build_object('schedule','standard','installment',i+1,'due_on',case i when 0 then day_value when 1 then '2026-09-15' else '2026-12-24' end,'amount',amount,'status',case when amount=0 then 'not_applicable' else 'pending' end));
   end loop;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('id',r.id,
   'categories',(select jsonb_agg(distinct p->>'category') from jsonb_array_elements(r.summary->'players') p),
   'payments',jsonb_build_object('player_names',(select jsonb_agg(p->>'name') from jsonb_array_elements(r.summary->'players') p),
    'mode',r.summary->>'payment','total',total,'confirmed',0,'in_review',0,'pending',total,'installments',installments)));
 end loop;
 return result;
end;$$;
revoke all on function public.bm_pinto_my_registration_tests() from public,anon,authenticated;
grant execute on function public.bm_pinto_my_registration_tests() to authenticated;
