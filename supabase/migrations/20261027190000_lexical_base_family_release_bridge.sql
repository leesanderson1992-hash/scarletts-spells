-- The existing immutable Base Word publisher also accepts an exact approved
-- lexical family revision. A base is structural support; only a derived word
-- with a reviewed demonstrates pair and current lesson content is a target.
begin;
do $bridge$
declare
  body text;
  old_declarations text := $old$  v_definition public.teaching_dictionary_base_family_definitions%rowtype;$old$;
  new_declarations text := $new$  v_definition public.teaching_dictionary_base_family_definitions%rowtype;
  v_lexical public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_lexical_member public.canonical_teaching_dictionary_lexical_base_family_members%rowtype;
  v_lexical_source_key text;
  v_lexical_environment text;$new$;
  old_family text := $old$      if v_definition.id is not null then$old$;
  new_family text := $new$      select * into v_lexical from public.canonical_teaching_dictionary_lexical_base_families lexical
        where lexical.family_key=v_family->>'baseFamilyKey' and lexical.review_status='approved'
          and lexical.base_kind='free_base' and lexical.canonical_base_word_id is not null
          and lexical.revision=(select max(revision) from public.canonical_teaching_dictionary_lexical_base_families
            where family_key=lexical.family_key and review_status='approved') for share;
      if v_lexical.family_key is not null and
          v_family->>'familyId'=md5('lexical-family:'||v_lexical.family_key||':'||v_lexical.revision)::uuid::text then
        v_lexical_environment:=split_part((v_family->'members'->0)#>>'{morphologySource,sourceAuthorityKey}',':',2);
        v_lexical_source_key:='lexical-family:'||v_lexical_environment||':'||v_lexical.family_key||':'||v_lexical.revision;
        if v_lexical_environment not in ('local','staging','production')
          or v_family->>'baseWordId' is distinct from v_lexical.canonical_base_word_id::text
          or v_family->>'baseMeaning' is distinct from v_lexical.base_meaning
          or v_family->>'sourceFingerprint' is distinct from v_lexical.semantic_fingerprint
          or v_family->'etymologyRoute' is distinct from jsonb_build_object(
            'relation_type','visible_free_base','child_facing_meaning',v_lexical.base_meaning,
            'semantic_connection','Words share the base '||v_lexical.base_lemma||'.',
            'evidence',jsonb_build_object('source_name','Approved lexical family',
              'family_key',v_lexical.family_key,'revision',v_lexical.revision))
          or not exists (select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
            where source->>'authorityKey'=v_lexical_source_key
              and source->>'sourceKind'='approved_repository_artifact'
              and source->>'sourceId'=v_lexical_source_key
              and source->>'sourceFingerprint'=v_lexical.semantic_fingerprint)
          then raise exception 'BASE_FAMILY_LEXICAL_SOURCE_DRIFT'; end if;
      elsif v_definition.id is not null then$new$;
  old_member text := $old$      if v_member#>>'{morphologySource,sourceKind}'='approved_manager_review' then$old$;
  new_member text := $new$      if v_member#>>'{morphologySource,sourceKind}'='approved_lexical_family_member' then
        select * into v_lexical from public.canonical_teaching_dictionary_lexical_base_families lexical
          where lexical.family_key=v_family->>'baseFamilyKey' and lexical.review_status='approved'
            and lexical.revision=(select max(revision) from public.canonical_teaching_dictionary_lexical_base_families
              where family_key=lexical.family_key and review_status='approved') for share;
        v_lexical_environment:=split_part(v_member#>>'{morphologySource,sourceAuthorityKey}',':',2);
        v_lexical_source_key:='lexical-family:'||v_lexical_environment||':'||v_lexical.family_key||':'||v_lexical.revision;
        if v_lexical.family_key is null or v_lexical_source_key is null
          or v_member#>>'{morphologySource,sourceAuthorityKey}' is distinct from v_lexical_source_key
          or v_member#>>'{morphologySource,sourceFingerprint}' is distinct from v_lexical.semantic_fingerprint
          then raise exception 'BASE_FAMILY_LEXICAL_MEMBER_SOURCE_INVALID'; end if;
        select * into v_lexical_member from public.canonical_teaching_dictionary_lexical_base_family_members member
          where member.family_key=v_lexical.family_key and member.revision=v_lexical.revision
            and member.canonical_word_id=(v_member->>'canonicalWordId')::uuid
            and v_member#>>'{morphologySource,sourceId}'=
              member.family_key||':'||member.revision||':'||member.canonical_word_id||':'||member.word_part_of_speech
          for share;
        if v_lexical_member.family_key is null
          or v_member->>'memberId' is distinct from md5(v_lexical_source_key||':'||
              v_lexical_member.canonical_word_id||':'||v_lexical_member.word_part_of_speech)::uuid::text
          or v_member->>'assignmentEligible'<>'true'
          or v_member->>'wordSum' is distinct from v_lexical_member.word_sum
          or v_member->'morphologyParts' is distinct from v_lexical_member.morphology_parts
          or v_member->'morphologyJoins' is distinct from v_lexical_member.morphology_joins
          or v_member->'morphologyTransformations' is distinct from v_lexical_member.morphology_transformations
          or v_member->>'childFriendlyMeaning' is distinct from v_lexical_member.intended_meaning
          or not exists (select 1 from public.canonical_teaching_dictionary_words word
            join public.canonical_teaching_dictionary_word_morphology morphology
              on morphology.id=v_lexical_member.canonical_morphology_id
            where word.id=v_lexical_member.canonical_word_id and word.row_status='active'
              and word.review_status='approved_for_first_exposure'
              and morphology.canonical_word_id=word.id
              and morphology.analysis_status='approved'
              and morphology.review_status='approved_for_first_exposure'
              and morphology.word_sum=v_lexical_member.word_sum
              and morphology.morphology_parts=v_lexical_member.morphology_parts
              and morphology.morphology_joins=v_lexical_member.morphology_joins
              and morphology.morphology_transformations=v_lexical_member.morphology_transformations)
          or not exists (select 1 from public.canonical_teaching_dictionary_word_morphology current_morphology
            where current_morphology.canonical_word_id=v_lexical_member.canonical_word_id
              and current_morphology.row_status='active'
              and current_morphology.analysis_status='approved'
              and current_morphology.review_status='approved_for_first_exposure'
              and current_morphology.word_sum=v_lexical_member.word_sum
              and current_morphology.morphology_parts=v_lexical_member.morphology_parts
              and current_morphology.morphology_joins=v_lexical_member.morphology_joins
              and current_morphology.morphology_transformations=v_lexical_member.morphology_transformations)
          then raise exception 'BASE_FAMILY_LEXICAL_MEMBER_DRIFT'; end if;
        if v_member->>'canonicalWordId'=v_family->>'baseWordId' then
          if v_member->>'authenticTargetEligible'<>'false'
            or v_lexical_member.relationship_kind<>'free_base' then
            raise exception 'BASE_FAMILY_LEXICAL_BASE_CANNOT_DEMONSTRATE'; end if;
        else
          if v_member->>'authenticTargetEligible'<>'true'
            or not exists (select 1 from public.adle_reviewed_word_skill_pairs pair
              join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
              where pair.canonical_word_id=v_lexical_member.canonical_word_id
                and pair.micro_skill_key=v_skill and pair.relationship_role='demonstrates'
                and release.environment_key=v_lexical_environment
                and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals withdrawn
                  where withdrawn.release_id=release.id))
            or not exists (select 1 from public.teaching_dictionary_route_content_versions content
              join public.teaching_dictionary_route_content_reviews review
                on review.content_version_id=content.id
              where content.canonical_word_id=v_lexical_member.canonical_word_id
                and content.route_id='base_word_lab' and content.micro_skill_key=v_skill
                and content.content->'content'->>'familyKey'=v_lexical.family_key
                and review.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(content.canonical_word_id)
                and review.content_sha256=encode(extensions.digest(convert_to(content.content::text,'UTF8'),'sha256'),'hex')
                and not exists (select 1 from public.teaching_dictionary_route_content_versions newer
                  where newer.canonical_word_id=content.canonical_word_id
                    and newer.route_id=content.route_id and newer.route_version=content.route_version
                    and newer.micro_skill_key=content.micro_skill_key
                    and (newer.published_at,newer.id)>(content.published_at,content.id)))
            then raise exception 'BASE_FAMILY_LEXICAL_TARGET_NOT_REVIEWED'; end if;
        end if;
      elsif v_member#>>'{morphologySource,sourceKind}'='approved_manager_review' then$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)'::regprocedure) into body;
  if position('BASE_FAMILY_LEXICAL_MEMBER_SOURCE_INVALID' in body)>0 then return; end if;
  if position(old_declarations in body)=0 or position(old_family in body)=0 or position(old_member in body)=0
    then raise exception 'BASE_FAMILY_PUBLISHER_SHAPE_CHANGED'; end if;
  body:=replace(body,old_declarations,new_declarations);
  body:=replace(body,old_family,new_family);
  body:=replace(body,old_member,new_member);
  execute body;
end $bridge$;
notify pgrst,'reload schema';
commit;
