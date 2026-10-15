-- Every immutable structure authority owns a fresh import batch. Reusing the
-- canonical word's batch collides with an earlier version of the same member.
begin;
do $patch$
declare body text;
begin
  select pg_get_functiondef('public.publish_adle_compound_word_structure_authority_v1(jsonb,text,text)'::regprocedure) into body;
  if position('v_word public.canonical_teaching_dictionary_words%rowtype; v_ordinal integer;' in body)=0
    or position('values(v_word.import_batch_id,v_word.id,' in body)=0 then
    raise exception 'TEACHING_COMPOUND_PUBLISHER_SHAPE_CHANGED';
  end if;
  body:=replace(body,'v_word public.canonical_teaching_dictionary_words%rowtype; v_ordinal integer;',
    'v_word public.canonical_teaching_dictionary_words%rowtype; v_ordinal integer; v_structure_batch uuid;');
  body:=replace(body,E'  v_ordinal:=0;\n  for v_structure', $new$
  insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
     import_mode,batch_status,source_metadata,imported_by,imported_at)
  values('teaching-dictionary-manager/compound/'||v_id::text,p_manifest_file_sha256,'reviewed_compound_authority_v1',
    jsonb_build_object('errors',0),jsonb_build_object('compoundStructures',jsonb_array_length(p_manifest->'structures')),
    jsonb_build_object('authorityKey',p_manifest->>'authorityKey'),'admin_import','applied',
    jsonb_build_object('dependencyAuthorityId',v_id,'manifestSha256',v_manifest_sha),p_published_by,now())
  returning id into v_structure_batch;
  v_ordinal:=0;
  for v_structure$new$);
  body:=replace(body,'values(v_word.import_batch_id,v_word.id,','values(v_structure_batch,v_word.id,');
  execute body;
end $patch$;
notify pgrst, 'reload schema';
commit;
