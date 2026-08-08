begin;

-- The application resolves the specialist route first; this boundary repeats
-- the governed suffix certification so a requested Affix lesson can never be
-- silently stored as a generic word-level need.
drop function if exists public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date);
create function public.adle_persist_canonical_intake(
  p_child_id uuid, p_canonical_word_id uuid, p_micro_skill_key text,
  p_candidate_mapping_id uuid, p_canonical_mapping_id uuid,
  p_misspelling_normalized text, p_correct_spelling_normalized text,
  p_source_ref text, p_verified_on date, p_route_id text, p_route_version text
) returns table (learning_item_id uuid, inserted boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_learning_item_id uuid; v_inserted boolean := false; v_route_id text; v_route_version text;
  v_is_affix boolean := p_micro_skill_key in (
    'D4_MOR_SUFFIXES_AL','D4_MOR_SUFFIXES_ABLE_IBLE','D4_MOR_SUFFIXES_FUL_LESS',
    'D4_MOR_SUFFIXES_ITY','D4_MOR_SUFFIXES_LY','D4_MOR_SUFFIXES_MENT',
    'D4_MOR_SUFFIXES_NESS','D4_MOR_SUFFIXES_OUS','D4_MOR_SUFFIXES_SION','D4_MOR_SUFFIXES_TION');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text || ':' || p_canonical_word_id::text || ':' || p_micro_skill_key, 0));
  if not exists (select 1 from public.parent_verified_spelling_candidate_mappings c where c.id=p_candidate_mapping_id and c.child_id=p_child_id and c.misspelling_normalized=p_misspelling_normalized and c.correct_spelling_normalized=p_correct_spelling_normalized and c.micro_skill_key=p_micro_skill_key and c.candidate_status = any(array['parent_local_promoted','global_canonical_promoted'])) then raise exception 'canonical intake candidate identity is no longer approved'; end if;
  if not exists (select 1 from public.canonical_teaching_dictionary_words w where w.id=p_canonical_word_id and w.normalised_word=p_correct_spelling_normalized and w.row_status='active' and w.review_status='approved_for_first_exposure') then raise exception 'canonical intake target identity is no longer assignment-approved'; end if;

  if v_is_affix then
    if p_route_id <> 'dynamic_affix_word_lab' or p_route_version <> 'v3' then raise exception 'Dynamic Affix candidate must request dynamic_affix_word_lab:v3'; end if;
    if not exists (
      select 1 from public.canonical_teaching_dictionary_suffix_profiles p
      join public.canonical_teaching_dictionary_suffix_members m on m.suffix_profile_id=p.id
      join public.micro_skill_catalog s on s.micro_skill_key=p.micro_skill_key
      where p.micro_skill_key=p_micro_skill_key and p.production_enabled=true
        and p.row_status='active' and p.review_status='approved_for_first_exposure'
        and s.mastery_domain_key='D4' and s.is_active=true and s.is_assignable=true
        and m.canonical_word_id=p_canonical_word_id and m.assignment_eligible=true
        and m.row_status='active' and m.review_status='approved_for_first_exposure'
    ) then raise exception 'Dynamic Affix candidate is not an exact production-ready profile member'; end if;
    v_route_id := 'dynamic_affix_word_lab'; v_route_version := 'v3';
  elsif p_micro_skill_key like 'D4_MOR_PREFIXES_%' then
    if p_route_id <> 'dynamic_prefix_word_lab' or p_route_version <> 'v2' then raise exception 'Dynamic Prefix candidate requested an invalid route'; end if;
    v_route_id := 'dynamic_prefix_word_lab'; v_route_version := 'v2';
  else
    if p_route_id <> 'adle_word_level' or p_route_version <> 'v1' then raise exception 'generic candidate requested an invalid route'; end if;
    v_route_id := 'adle_word_level'; v_route_version := 'v1';
  end if;
  select li.id into v_learning_item_id from public.adle_learning_items li where li.child_id=p_child_id and li.canonical_word_id=p_canonical_word_id and li.micro_skill_key=p_micro_skill_key and li.row_status='active' order by li.intake_on desc,li.id limit 1;
  if v_learning_item_id is null then insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status) values(p_child_id,p_canonical_word_id,p_micro_skill_key,'pending','verified_misspelling',p_source_ref,p_misspelling_normalized,false,null,p_verified_on,'active') returning id into v_learning_item_id; v_inserted:=true; end if;
  insert into public.adle_learning_item_sources(learning_item_id,parent_verified_candidate_mapping_id,canonical_mapping_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,source_ref,row_status) values(v_learning_item_id,p_candidate_mapping_id,p_canonical_mapping_id,p_misspelling_normalized,p_correct_spelling_normalized,p_micro_skill_key,p_source_ref,'active') on conflict do nothing;
  insert into public.adle_canonical_intake_candidates(source_candidate_mapping_id,source_submission_id,child_id,normalized_target_token,canonical_word_id,target_identity_status,route_id,route_version,micro_skill_key,candidate_state,blockers,readiness_fingerprint,last_evaluated_at,learning_item_id,activated_at,resolved_at)
  select p_candidate_mapping_id,c.task_submission_id,p_child_id,lower(btrim(p_correct_spelling_normalized)),p_canonical_word_id,'established',v_route_id,v_route_version,p_micro_skill_key,'activated','[]'::jsonb,encode(extensions.digest(concat_ws(E'\x1f',p_candidate_mapping_id::text,p_canonical_mapping_id::text,p_canonical_word_id::text,p_micro_skill_key,v_route_id,v_route_version),'sha256'),'hex'),timezone('utc',now()),v_learning_item_id,timezone('utc',now()),timezone('utc',now()) from public.parent_verified_spelling_candidate_mappings c where c.id=p_candidate_mapping_id
  on conflict(source_candidate_mapping_id) do update set canonical_word_id=excluded.canonical_word_id,target_identity_status='established',route_id=excluded.route_id,route_version=excluded.route_version,micro_skill_key=excluded.micro_skill_key,candidate_state='activated',blockers='[]'::jsonb,readiness_fingerprint=excluded.readiness_fingerprint,last_evaluated_at=excluded.last_evaluated_at,next_retry_at=null,learning_item_id=excluded.learning_item_id,resolved_at=excluded.resolved_at,lock_version=public.adle_canonical_intake_candidates.lock_version+1,updated_at=timezone('utc',now());
  return query select v_learning_item_id,v_inserted;
end; $$;
revoke all on function public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text) from public,anon,authenticated;
grant execute on function public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text) to service_role;

-- Atomic correction preserves the superseded authority and makes retry safe.
create or replace function public.supersede_spelling_canonical_mapping_admin(
  p_expected_mapping_id uuid, p_expected_micro_skill_key text, p_replacement_micro_skill_key text,
  p_admin_user_id uuid, p_admin_email text default null, p_note text default null, p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_old public.spelling_canonical_mappings%rowtype; v_new_id uuid; v_note text;
begin
  if p_admin_user_id is null or nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Canonical mapping supersession requires admin provenance and note'; end if;
  select * into v_old from public.spelling_canonical_mappings where id=p_expected_mapping_id for update;
  if not found then raise exception 'Expected canonical mapping not found'; end if;
  if v_old.mapping_status='superseded' and v_old.replacement_mapping_id is not null then
    select id into v_new_id from public.spelling_canonical_mappings where id=v_old.replacement_mapping_id and micro_skill_key=p_replacement_micro_skill_key;
    if found then return v_new_id; end if;
  end if;
  if v_old.mapping_status <> 'active' or v_old.micro_skill_key <> p_expected_micro_skill_key then raise exception 'Stale canonical mapping supersession request'; end if;
  if not exists(select 1 from public.micro_skill_catalog where micro_skill_key=p_replacement_micro_skill_key and mastery_domain_key='D4' and is_active=true and is_assignable=true) then raise exception 'Replacement canonical micro-skill is not active and assignable D4'; end if;
  v_note:=nullif(btrim(p_note),'');
  update public.spelling_canonical_mappings set mapping_status='superseded',resolver_visibility_status='hidden',deactivated_at=timezone('utc',now()),deactivated_by_admin_user_id=p_admin_user_id,deactivated_by_admin_email=nullif(btrim(coalesce(p_admin_email,'')),''),deactivation_note=v_note,updated_at=timezone('utc',now()) where id=v_old.id;
  insert into public.spelling_canonical_mappings(misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,dialect_code,normalization_version,created_by_admin_user_id,created_by_admin_email,decision_note,metadata) values(v_old.misspelling_normalized,v_old.correct_spelling_normalized,p_replacement_micro_skill_key,'active',v_old.dialect_code,v_old.normalization_version,p_admin_user_id,nullif(btrim(coalesce(p_admin_email,'')),''),v_note,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('supersedes_mapping_id',v_old.id::text,'action_source','canonical_mapping_supersession_v1','resolver_visible',false)) returning id into v_new_id;
  update public.spelling_canonical_mappings set replacement_mapping_id=v_new_id where id=v_old.id;
  insert into public.spelling_canonical_mapping_events(mapping_id,event_type,previous_status,new_status,previous_micro_skill_key,new_micro_skill_key,admin_user_id,admin_email,note,metadata) values(v_old.id,'superseded','active','superseded',v_old.micro_skill_key,p_replacement_micro_skill_key,p_admin_user_id,nullif(btrim(coalesce(p_admin_email,'')),''),v_note,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('replacement_mapping_id',v_new_id::text));
  insert into public.spelling_canonical_mapping_events(mapping_id,event_type,previous_status,new_status,previous_micro_skill_key,new_micro_skill_key,admin_user_id,admin_email,note,metadata) values(v_new_id,'created',null,'active',null,p_replacement_micro_skill_key,p_admin_user_id,nullif(btrim(coalesce(p_admin_email,'')),''),v_note,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('supersedes_mapping_id',v_old.id::text));
  return v_new_id;
end; $$;
revoke all on function public.supersede_spelling_canonical_mapping_admin(uuid,text,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.supersede_spelling_canonical_mapping_admin(uuid,text,text,uuid,text,text,jsonb) to service_role;
commit;
