begin;

revoke all on public.spelling_canonical_mapping_recommendations from anon;
revoke all on public.spelling_canonical_mapping_recommendations from authenticated;

grant select, insert on public.spelling_canonical_mapping_recommendations to authenticated;

commit;
