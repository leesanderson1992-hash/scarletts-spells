begin;

-- The historical member-revision function copied root IPA but omitted the
-- applicability flag. A not-applicable root has null IPA, so its next family
-- revision would fail the root metadata check. A missing root entry also used
-- to copy zero rows silently.
do $$
declare
  body text;
  old_pair text := 'pronunciation_ipa,syllables_applicability';
  new_pair text := 'pronunciation_ipa,pronunciation_applicability,syllables_applicability';
  old_tail text := E'where family_key=p_family_key and revision=v_family.revision;\n  end if;';
  new_tail text := E'where family_key=p_family_key and revision=v_family.revision;\n    if not found then raise exception ''LEXICAL_ROOT_METADATA_REQUIRED''; end if;\n  end if;';
begin
  select pg_get_functiondef(
    'public.review_lexical_base_family_member_revision(text,integer,uuid,uuid,text,text,text,text,text,text)'::regprocedure)
    into body;
  if position(new_pair in body)>0 and position('LEXICAL_ROOT_METADATA_REQUIRED' in body)>0 then
    return;
  end if;
  if (length(body)-length(replace(body,old_pair,'')))/length(old_pair)<>2
    or position(old_tail in body)=0 then
    raise exception 'LEXICAL_ROOT_REVISION_FUNCTION_CHANGED';
  end if;
  body:=replace(body,old_pair,new_pair);
  body:=replace(body,old_tail,new_tail);
  execute body;
end $$;

notify pgrst,'reload schema';
commit;
