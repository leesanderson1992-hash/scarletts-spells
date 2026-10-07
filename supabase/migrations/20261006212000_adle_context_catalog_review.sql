-- Make unmatched ADLE Review confirmations actionable in catalog review.
create function public.link_adle_review_context_catalog_case(
  p_case_id uuid,p_micro_skill_key text,p_admin_user_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.adle_review_context_catalog_cases%rowtype;
  v_pair public.contextual_micro_skill_pairs%rowtype;
  v_child uuid; v_count integer:=0;
begin
  if p_admin_user_id is null or p_micro_skill_key is null then
    raise exception 'adle_context_catalog_request_invalid'; end if;
  select * into c from public.adle_review_context_catalog_cases
    where id=p_case_id and case_status='open' for update;
  if c.id is null then raise exception 'adle_context_catalog_case_not_open'; end if;
  if not exists(select 1 from public.micro_skill_catalog m
      where m.micro_skill_key=p_micro_skill_key and m.mastery_domain_key='D4'
        and m.is_active and m.is_assignable) then
    raise exception 'adle_context_catalog_skill_not_available'; end if;
  select * into v_pair from public.contextual_micro_skill_pairs p
    where p.dialect_code='en-GB'
      and p.member_a=least(c.observed_normalized,c.intended_normalized)
      and p.member_b=greatest(c.observed_normalized,c.intended_normalized);
  if v_pair.id is not null and v_pair.micro_skill_key<>p_micro_skill_key then
    raise exception 'adle_context_catalog_pair_already_linked'; end if;
  insert into public.contextual_micro_skill_members(micro_skill_key,member_normalized,
    member_display,approved_by_admin_user_id)
  values(p_micro_skill_key,c.observed_normalized,c.observed_normalized,p_admin_user_id),
    (p_micro_skill_key,c.intended_normalized,c.intended_normalized,p_admin_user_id)
  on conflict do nothing;
  insert into public.contextual_micro_skill_pairs(member_a,member_b,micro_skill_key,
    approved_by_admin_user_id)
  values(least(c.observed_normalized,c.intended_normalized),
    greatest(c.observed_normalized,c.intended_normalized),p_micro_skill_key,p_admin_user_id)
  on conflict do nothing;
  for v_child in
    update public.adle_review_context_catalog_cases review
      set case_status='reviewed'
      where case_status='open'
        and least(review.observed_normalized,review.intended_normalized)=
          least(c.observed_normalized,c.intended_normalized)
        and greatest(review.observed_normalized,review.intended_normalized)=
          greatest(c.observed_normalized,c.intended_normalized)
      returning review.child_id
  loop
    v_count:=v_count+1;
    perform public.reconcile_contextual_micro_skill_demand(v_child,p_micro_skill_key);
  end loop;
  return v_count;
end $$;
revoke all on function public.link_adle_review_context_catalog_case(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.link_adle_review_context_catalog_case(uuid,text,uuid)
  to service_role;
