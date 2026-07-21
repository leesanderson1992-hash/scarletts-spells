-- Reviewed, structured spelling changes for the base-word Cleaver. This does
-- not alter lesson selection, assignments, completion, scheduling, or rewards.

alter table public.canonical_teaching_dictionary_base_word_family_members
  add column if not exists morphology_transformations jsonb not null default '[]'::jsonb;

alter table public.canonical_teaching_dictionary_base_word_family_members
  drop constraint if exists canonical_teaching_dictionary_base_word_family_members_transformations_check;

alter table public.canonical_teaching_dictionary_base_word_family_members
  add constraint canonical_teaching_dictionary_base_word_family_members_transformations_check
  check (jsonb_typeof(morphology_transformations) = 'array');

do $$
declare
  updated_count integer;
begin
  with eligible as (
    select
      member.id,
      member.morphology_parts -> 0 as base_part
    from public.canonical_teaching_dictionary_base_word_family_members member
    where member.row_status = 'active'
      and member.review_status = 'approved_for_first_exposure'
      and member.transformation_notes = 'The final y changes to i before the ending is added.'
      and jsonb_array_length(member.morphology_parts) >= 2
      and member.morphology_parts -> 0 ->> 'kind' = 'base'
      and member.morphology_parts -> 0 ->> 'sourceText' like '%y'
      and member.morphology_parts -> 0 ->> 'surfaceText' like '%i'
      and length(member.morphology_parts -> 0 ->> 'sourceText') = length(member.morphology_parts -> 0 ->> 'surfaceText')
      and left(member.morphology_parts -> 0 ->> 'sourceText', -1) = left(member.morphology_parts -> 0 ->> 'surfaceText', -1)
  )
  update public.canonical_teaching_dictionary_base_word_family_members member
     set morphology_transformations = jsonb_build_array(jsonb_build_object(
       'transformationKey', 'change_final_y_to_i',
       'type', 'change_final_y_to_i',
       'sourcePartId', eligible.base_part ->> 'id',
       'sourceText', eligible.base_part ->> 'sourceText',
       'surfaceText', eligible.base_part ->> 'surfaceText',
       'explanation', 'Change the final i back to y before you add the ending.'
     ))
    from eligible
   where member.id = eligible.id;

  get diagnostics updated_count = row_count;
  if updated_count <> 14 then
    raise exception 'Expected to add reviewed y-to-i transformations to 14 base-word members; updated %.', updated_count;
  end if;
end $$;
