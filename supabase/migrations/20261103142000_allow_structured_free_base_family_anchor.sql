begin;

-- An approved free word can anchor a family while also having internal
-- morphology of its own (under + stand → understand). Derived members still
-- need a part whose source is the family base.
do $$
declare
  approval_body text;
  creation_body text;
  old_approval text := E'or not exists (select 1 from jsonb_array_elements(member.morphology_parts) part\n        where (part->>''kind''=''base'' or (f.base_kind=''bound_root'' and part->>''kind''=''root''))';
  new_approval text := E'or (not (f.base_kind=''free_base'' and member.canonical_word_id=f.canonical_base_word_id)\n        and not exists (select 1 from jsonb_array_elements(member.morphology_parts) part\n        where (part->>''kind''=''base'' or (f.base_kind=''bound_root'' and part->>''kind''=''root''))';
  old_creation text := E'or not exists (select 1 from jsonb_array_elements(v_base_morph.morphology_parts) part\n      where part->>''kind''=''base'' and lower(part->>''sourceText'')=v_base.normalised_word)\n    ';
begin
  select pg_get_functiondef('public.approve_canonical_lexical_base_family(text,integer,text,text)'::regprocedure)
    into approval_body;
  if position(new_approval in approval_body)=0 then
    if (length(approval_body)-length(replace(approval_body,old_approval,'')))/length(old_approval)<>1 then
      raise exception 'LEXICAL_FAMILY_APPROVAL_FUNCTION_CHANGED';
    end if;
    approval_body:=replace(approval_body,old_approval,new_approval);
    -- Close the added guard after the unchanged member-part predicate.
    approval_body:=replace(approval_body,
      E'and lower(v.source_base_text)=lower(part->>''sourceText''))))\n      or regexp_replace',
      E'and lower(v.source_base_text)=lower(part->>''sourceText'')))))\n      or regexp_replace');
    execute approval_body;
  end if;
  select pg_get_functiondef('public.create_reviewed_lexical_free_base_family(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text)'::regprocedure)
    into creation_body;
  if position(old_creation in creation_body)>0 then
    if (length(creation_body)-length(replace(creation_body,old_creation,'')))/length(old_creation)<>1 then
      raise exception 'LEXICAL_FAMILY_CREATE_FUNCTION_CHANGED';
    end if;
    execute replace(creation_body,old_creation,'');
  elsif position('v_base_morph.morphology_parts) part' in creation_body)>0 then
    raise exception 'LEXICAL_FAMILY_CREATE_FUNCTION_CHANGED';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
