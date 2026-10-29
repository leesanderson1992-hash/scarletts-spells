begin;

create table public.teaching_dictionary_base_family_supersessions (
  old_family_id uuid primary key references public.canonical_teaching_dictionary_base_word_families(id) on delete restrict,
  new_family_id uuid not null references public.canonical_teaching_dictionary_base_word_families(id) on delete restrict,
  base_family_key text not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc',now()),
  constraint base_family_supersession_distinct check (old_family_id<>new_family_id)
);
alter table public.teaching_dictionary_base_family_supersessions enable row level security;
revoke all on public.teaching_dictionary_base_family_supersessions from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_base_family_supersessions to service_role;

-- Recompute equivalence at migration time.  A family with changed meaning or
-- membership remains active for explicit review.  Existing IDs remain valid
-- for historical snapshots; no member or child record is deleted.
do $audit$
declare
  family_key text;
  newest record;
  older record;
  newest_members jsonb;
  older_members jsonb;
begin
  for family_key in
    select base_family_key from public.canonical_teaching_dictionary_base_word_families
    where row_status='active' and review_status='approved_for_first_exposure'
    group by base_family_key having count(*)>1
  loop
    select id,base_word_id,base_meaning into newest
      from public.canonical_teaching_dictionary_base_word_families
      where base_family_key=family_key and row_status='active'
        and review_status='approved_for_first_exposure'
      order by created_at desc,id desc limit 1;
    select jsonb_agg(jsonb_build_array(member.canonical_word_id,member.member_role,
      member.assignment_eligible,member.row_status,member.review_status) order by member.canonical_word_id)
      into newest_members from public.canonical_teaching_dictionary_base_word_family_members member
      where member.base_word_family_id=newest.id;
    for older in select id,base_word_id,base_meaning from public.canonical_teaching_dictionary_base_word_families
      where base_family_key=family_key and row_status='active'
        and review_status='approved_for_first_exposure' and id<>newest.id
      order by created_at,id
    loop
      select jsonb_agg(jsonb_build_array(member.canonical_word_id,member.member_role,
        member.assignment_eligible,member.row_status,member.review_status) order by member.canonical_word_id)
        into older_members from public.canonical_teaching_dictionary_base_word_family_members member
        where member.base_word_family_id=older.id;
      if older.base_word_id is distinct from newest.base_word_id
        or older.base_meaning is distinct from newest.base_meaning
        or older_members is distinct from newest_members then continue; end if;
      if exists(select 1 from public.teaching_dictionary_route_content_versions version
          where version.content::text like '%'||older.id::text||'%')
        or exists(select 1 from public.adle_curriculum_dependency_authorities authority
          where authority.semantic_projection::text like '%'||older.id::text||'%')
        then continue; end if;
      insert into public.teaching_dictionary_base_family_supersessions
        (old_family_id,new_family_id,base_family_key,reason)
      values(older.id,newest.id,family_key,'Equivalent reviewed base, meaning and active eligible members; newest approved authority retained')
      on conflict (old_family_id) do nothing;
      update public.canonical_teaching_dictionary_base_word_families
        set row_status='superseded',updated_at=timezone('utc',now())
        where id=older.id and row_status='active' and review_status='approved_for_first_exposure';
    end loop;
  end loop;
end $audit$;
commit;
