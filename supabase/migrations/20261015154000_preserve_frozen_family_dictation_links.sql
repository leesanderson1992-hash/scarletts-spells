-- New word sentences must not rewrite references frozen in an applied family
-- release. Native assignments resolve their exact immutable dictionary closure;
-- a future family release publishes its own reviewed references.
begin;
create or replace function public.link_base_word_members_to_canonical_dictation_sentence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.row_status = 'active' and new.review_status = 'approved_for_first_exposure' then
    update public.canonical_teaching_dictionary_base_word_family_members member
      set dictation_sentence_id = new.id,
          updated_at = timezone('utc', now())
    where member.canonical_word_id = new.canonical_word_id
      and member.row_status = 'active'
      and member.review_status = 'approved_for_first_exposure'
      and not exists (
        select 1 from public.canonical_teaching_dictionary_import_batches batch
        where batch.id = member.import_batch_id
          and batch.package_type = 'base_word_family_batch_v1'
          and batch.batch_status = 'applied'
      );
  end if;
  return new;
end;
$$;
notify pgrst, 'reload schema';
commit;
