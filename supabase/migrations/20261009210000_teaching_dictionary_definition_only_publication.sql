-- A definition edit must not rewrite a word, dictation, morphology or released
-- route member. The service validates equality of the other draft facts before
-- calling this RPC; these identities prevent a concurrent fact change.
create function public.publish_teaching_dictionary_definition_only(
  p_draft uuid,
  p_actor uuid,
  p_word_source_hash text,
  p_metadata_id uuid,
  p_dictation_id uuid,
  p_morphology_id uuid
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  v_definition text;
  v_published uuid;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.canonical_word_id is null then
    raise exception 'TEACHING_DEFINITION_DRAFT_NOT_FOUND';
  end if;
  select canonical_word_id into v_published from public.teaching_dictionary_manager_publications where draft_id=p_draft;
  if v_published is not null then return v_published; end if;
  select * into w from public.canonical_teaching_dictionary_words where id=d.canonical_word_id for update;
  if w.id is null or w.row_status <> 'active' or w.normalised_word <> d.normalised_word
    or w.dialect_code <> d.dialect_code or w.source_row_hash <> p_word_source_hash then
    raise exception 'TEACHING_DEFINITION_WORD_CHANGED';
  end if;
  if coalesce(d.payload->'routeContents','[]'::jsonb) <> '[]'::jsonb then
    raise exception 'TEACHING_DEFINITION_ROUTE_CONTENT_PRESENT';
  end if;
  v_definition := btrim(coalesce(d.payload->>'definition',''));
  if v_definition = '' then raise exception 'TEACHING_DEFINITION_MISSING'; end if;
  if (select id from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id=w.id and row_status='active') is distinct from p_metadata_id
    or (select id from public.canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id=w.id and row_status='active') is distinct from p_dictation_id
    or (select id from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id=w.id and row_status='active') is distinct from p_morphology_id then
    raise exception 'TEACHING_DEFINITION_FACTS_CHANGED';
  end if;
  insert into public.teaching_dictionary_definition_versions(canonical_word_id,definition,draft_id)
    values(w.id,v_definition,p_draft);
  insert into public.teaching_dictionary_manager_publications(draft_id,canonical_word_id,published_by)
    values(p_draft,w.id,p_actor);
  return w.id;
end $$;
revoke all on function public.publish_teaching_dictionary_definition_only(uuid,uuid,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_definition_only(uuid,uuid,text,uuid,uuid,uuid) to service_role;
