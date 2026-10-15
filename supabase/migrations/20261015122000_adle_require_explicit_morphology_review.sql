-- Only an explicit reviewed status can be signed off for a suffix lesson.
-- The content version and its dictionary fingerprint remain immutable.
create function public.require_reviewed_suffix_morphology()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists (
    select 1 from public.teaching_dictionary_route_content_versions content
    where content.id=new.content_version_id
      and content.route_id='dynamic_affix_word_lab'
      and content.content->'content'->'trueMorphologyProvenance'->>'status' is distinct from 'reviewed'
  ) then
    raise exception 'TEACHING_ROUTE_MORPHOLOGY_REVIEW_REQUIRED';
  end if;
  return new;
end $$;

create trigger require_reviewed_suffix_morphology_before_signoff
before insert on public.teaching_dictionary_route_content_reviews
for each row execute function public.require_reviewed_suffix_morphology();

revoke all on function public.require_reviewed_suffix_morphology() from public,anon,authenticated;
