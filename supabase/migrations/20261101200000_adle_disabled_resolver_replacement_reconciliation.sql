begin;

-- The admin resolver can disable an old mapping and create a new exact-pair
-- mapping without setting replacement_mapping_id. Reconcile that route too,
-- but only when the old mapping is unambiguous and was previously visible.
create or replace function public.adle_record_visible_resolver_change_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  old_mapping public.spelling_canonical_mappings%rowtype;
  prior_mapping_uuid uuid;
  old_count integer;
begin
  if new.mapping_status<>'active' or new.resolver_visibility_status<>'visible'
    or old.resolver_visibility_status='visible' then return new; end if;

  select count(*),(array_agg(m.id))[1] into old_count,prior_mapping_uuid
  from public.spelling_canonical_mappings m
  where m.misspelling_normalized=new.misspelling_normalized
    and m.correct_spelling_normalized=new.correct_spelling_normalized
    and m.dialect_code=new.dialect_code
    and m.normalization_version=new.normalization_version
    and m.micro_skill_key<>new.micro_skill_key
    and ((m.mapping_status='superseded' and m.replacement_mapping_id=new.id)
      or (m.mapping_status='disabled' and m.resolver_visibility_status='disabled'
        and m.replacement_mapping_id is null
        and exists(select 1 from public.spelling_canonical_mapping_events e
          where e.mapping_id=m.id and e.event_type='resolver_visibility_enabled'
            and e.new_resolver_visibility_status='visible')));
  if old_count<>1 then return new; end if;

  select * into old_mapping from public.spelling_canonical_mappings where id=prior_mapping_uuid;
  insert into public.adle_resolver_change_reconciliations(
    old_mapping_id,new_mapping_id,misspelling_normalized,correct_spelling_normalized,
    dialect_code,normalization_version,old_micro_skill_key,new_micro_skill_key,
    requested_by,reason)
  values(old_mapping.id,new.id,new.misspelling_normalized,new.correct_spelling_normalized,
    new.dialect_code,new.normalization_version,old_mapping.micro_skill_key,new.micro_skill_key,
    case when exists(select 1 from auth.users u where u.id=new.created_by_admin_user_id)
      then new.created_by_admin_user_id else null end,
    coalesce(nullif(btrim(new.decision_note),''),
      'Visible exact resolver mapping replaced a disabled prior skill'))
  on conflict(old_mapping_id) do nothing;
  return new;
end $$;

-- The pre-existing assignment guard only followed replacement_mapping_id.
-- A disabled old mapping with a recorded change must have the same protection.
create or replace function public.adle_guard_stale_resolver_assignment_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare item_id uuid; skill_key text;
begin
  if new.domain_module<>'spelling' then return new; end if;
  skill_key:=new.metadata->>'microSkillKey';
  if skill_key is null then return new; end if;
  if nullif(coalesce(new.metadata->>'adleLearningItemRef',
    new.metadata->>'learningItemId'),'') is not null then
    item_id:=coalesce(new.metadata->>'adleLearningItemRef',
      new.metadata->>'learningItemId')::uuid;
  end if;
  if exists (
    select 1 from public.adle_learning_items item
    join public.adle_learning_item_sources source on source.learning_item_id=item.id
      and source.row_status='active'
    join public.adle_resolver_change_reconciliations change
      on change.old_mapping_id=source.canonical_mapping_id
    join public.spelling_canonical_mappings replacement on replacement.id=change.new_mapping_id
    where item.child_id=new.child_id and item.micro_skill_key=skill_key
      and item.row_status='active' and (item_id is null or item.id=item_id)
      and replacement.mapping_status='active'
      and replacement.resolver_visibility_status='visible'
      and replacement.micro_skill_key<>item.micro_skill_key
  ) then raise exception 'ADLE_RESOLVER_RECONCILIATION_REQUIRED'; end if;
  return new;
end $$;

commit;
