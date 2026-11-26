begin;
-- Preserve immutable reviewed family facts; classify non-spelling relationships separately.
create table public.teaching_dictionary_grammatical_family_links (
 family_key text not null, canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 relation_kind text not null check (relation_kind in ('grammatical_form','contraction')),
 source_memberships jsonb not null check (jsonb_array_length(source_memberships)>0),
 approval_reference text not null, reviewed_at timestamptz not null default now(),
 primary key(family_key,canonical_word_id)
);
create index teaching_grammatical_links_word on public.teaching_dictionary_grammatical_family_links(canonical_word_id);
alter table public.teaching_dictionary_grammatical_family_links enable row level security;
revoke all on public.teaching_dictionary_grammatical_family_links from public,anon,authenticated;
grant select on public.teaching_dictionary_grammatical_family_links to service_role;
comment on table public.teaching_dictionary_grammatical_family_links is 'Owner-reviewed grammatical links excluded from spelling-family reasoning. Original membership snapshots are preserved. No word or lesson assignment is removed.';
with decisions(base,word,kind) as (values
('bad','worse','grammatical_form'),
('bad','worst','grammatical_form'),
('be','are','grammatical_form'),
('be','was','grammatical_form'),
('be','were','grammatical_form'),
('blow','blew','grammatical_form'),
('can','could','grammatical_form'),
('come','came','grammatical_form'),
('do','did','grammatical_form'),
('find','found','grammatical_form'),
('fly','flew','grammatical_form'),
('foot','feet','grammatical_form'),
('go','went','grammatical_form'),
('good','best','grammatical_form'),
('have','had','grammatical_form'),
('have','has','grammatical_form'),
('keep','kept','grammatical_form'),
('make','made','grammatical_form'),
('mouse','mice','grammatical_form'),
('much','more','grammatical_form'),
('ride','rode','grammatical_form'),
('rise','rose','grammatical_form'),
('say','said','grammatical_form'),
('see','saw','grammatical_form'),
('send','sent','grammatical_form'),
('sit','sat','grammatical_form'),
('throw','threw','grammatical_form'),
('tooth','teeth','grammatical_form'),
('win','won','grammatical_form'),
('lead','led','grammatical_form'),
('little','least','grammatical_form'),
('shall','shan''t','contraction')
), families as (
 select distinct on (family_key) * from public.teaching_dictionary_families_with_current_meaning order by family_key,revision desc
), candidates as (
 select f.family_key,w.id,d.kind from decisions d join families f on f.base_lemma=d.base and f.review_status='approved'
 join public.canonical_teaching_dictionary_words w on lower(w.display_word)=d.word and w.row_status='active'
), snapshots as (
 select c.*, coalesce((select jsonb_agg(to_jsonb(m)) from public.canonical_teaching_dictionary_lexical_base_family_members m where m.family_key=c.family_key and m.canonical_word_id=c.id),'[]'::jsonb)
 || coalesce((select jsonb_agg(to_jsonb(m)) from public.teaching_dictionary_sense_family_membership_events m where m.family_key=c.family_key and m.canonical_word_id=c.id),'[]'::jsonb) as facts from candidates c
)
insert into public.teaching_dictionary_grammatical_family_links(family_key,canonical_word_id,relation_kind,source_memberships,approval_reference)
select family_key,id,kind,facts,'owner-reviewed-spelling-versus-grammar-2026-11-26' from snapshots where jsonb_array_length(facts)>0;

create view public.teaching_dictionary_spelling_lexical_members as
select m.* from public.canonical_teaching_dictionary_lexical_base_family_members m
where not exists(select 1 from public.teaching_dictionary_grammatical_family_links g where g.family_key=m.family_key and g.canonical_word_id=m.canonical_word_id);
create view public.teaching_dictionary_spelling_registry_members as
select m.* from public.canonical_teaching_dictionary_base_family_registry_members m
where not exists(select 1 from public.teaching_dictionary_grammatical_family_links g
 join public.canonical_teaching_dictionary_base_family_registry_aliases a on a.source_key=g.family_key
 where a.canonical_family_id=m.canonical_family_id and g.canonical_word_id=m.canonical_word_id);
create view public.teaching_dictionary_spelling_legacy_members as
select m.* from public.canonical_teaching_dictionary_base_word_family_members m
join public.canonical_teaching_dictionary_base_word_families f on f.id=m.base_word_family_id
where not exists(select 1 from public.teaching_dictionary_grammatical_family_links g where g.family_key=f.base_family_key and g.canonical_word_id=m.canonical_word_id);

create or replace view public.teaching_dictionary_current_sense_family_memberships as
WITH latest AS (
         SELECT DISTINCT ON (teaching_dictionary_sense_family_membership_events.canonical_word_id, teaching_dictionary_sense_family_membership_events.sense_id, teaching_dictionary_sense_family_membership_events.family_key, teaching_dictionary_sense_family_membership_events.component_part_id) teaching_dictionary_sense_family_membership_events.id,
            teaching_dictionary_sense_family_membership_events.event_sequence,
            teaching_dictionary_sense_family_membership_events.request_id,
            teaching_dictionary_sense_family_membership_events.canonical_word_id,
            teaching_dictionary_sense_family_membership_events.sense_id,
            teaching_dictionary_sense_family_membership_events.sense_morphology_id,
            teaching_dictionary_sense_family_membership_events.family_key,
            teaching_dictionary_sense_family_membership_events.family_revision,
            teaching_dictionary_sense_family_membership_events.component_part_id,
            teaching_dictionary_sense_family_membership_events.base_meaning,
            teaching_dictionary_sense_family_membership_events.relationship_kind,
            teaching_dictionary_sense_family_membership_events.action,
            teaching_dictionary_sense_family_membership_events.reviewed_by,
            teaching_dictionary_sense_family_membership_events.source_reference,
            teaching_dictionary_sense_family_membership_events.reviewed_at
           FROM teaching_dictionary_sense_family_membership_events
          ORDER BY teaching_dictionary_sense_family_membership_events.canonical_word_id, teaching_dictionary_sense_family_membership_events.sense_id, teaching_dictionary_sense_family_membership_events.family_key, teaching_dictionary_sense_family_membership_events.component_part_id, teaching_dictionary_sense_family_membership_events.event_sequence DESC
        ), current_families AS (
         SELECT DISTINCT ON (teaching_dictionary_families_with_current_meaning.family_key) teaching_dictionary_families_with_current_meaning.family_key,
            teaching_dictionary_families_with_current_meaning.revision,
            teaching_dictionary_families_with_current_meaning.base_lemma,
            teaching_dictionary_families_with_current_meaning.base_part_of_speech,
            teaching_dictionary_families_with_current_meaning.base_kind,
            teaching_dictionary_families_with_current_meaning.canonical_base_word_id,
            teaching_dictionary_families_with_current_meaning.canonical_base_sense_id,
            teaching_dictionary_families_with_current_meaning.review_status,
            teaching_dictionary_families_with_current_meaning.base_meaning
           FROM teaching_dictionary_families_with_current_meaning
          ORDER BY teaching_dictionary_families_with_current_meaning.family_key, teaching_dictionary_families_with_current_meaning.revision DESC
        )
 SELECT e.id,
    e.canonical_word_id,
    e.sense_id,
    e.sense_morphology_id,
    e.family_key,
    f.revision AS current_family_revision,
    e.component_part_id,
    f.base_meaning,
    e.relationship_kind,
    e.reviewed_by,
    e.reviewed_at
   FROM latest e
     JOIN teaching_dictionary_current_sense_morphology analysis ON analysis.id = e.sense_morphology_id AND analysis.canonical_word_id = e.canonical_word_id AND analysis.sense_id = e.sense_id
     JOIN current_families f ON f.family_key = e.family_key AND f.review_status = 'approved'::text
     LEFT JOIN teaching_dictionary_family_meaning_changes change ON change.canonical_word_id = f.canonical_base_word_id AND change.sense_id = f.canonical_base_sense_id
  WHERE e.action = 'approve'::text AND (change.changed_at IS NULL OR change.changed_at < e.reviewed_at) AND (f.canonical_base_sense_id IS NOT NULL OR f.base_meaning = e.base_meaning)
 AND NOT EXISTS (select 1 from public.teaching_dictionary_grammatical_family_links g where g.family_key=e.family_key and g.canonical_word_id=e.canonical_word_id);

create view public.teaching_dictionary_grammatical_relationships as
with families as (select distinct on (family_key) * from public.teaching_dictionary_families_with_current_meaning order by family_key,revision desc)
select g.family_key,g.canonical_word_id,w.display_word,f.canonical_base_word_id,f.base_lemma,f.base_part_of_speech,f.base_meaning,g.relation_kind,g.approval_reference
from public.teaching_dictionary_grammatical_family_links g join families f on f.family_key=g.family_key
join public.canonical_teaching_dictionary_words w on w.id=g.canonical_word_id;
revoke all on public.teaching_dictionary_spelling_lexical_members,public.teaching_dictionary_spelling_registry_members,public.teaching_dictionary_spelling_legacy_members,public.teaching_dictionary_grammatical_relationships from public,anon,authenticated;
grant select on public.teaching_dictionary_spelling_lexical_members,public.teaching_dictionary_spelling_registry_members,public.teaching_dictionary_spelling_legacy_members,public.teaching_dictionary_grammatical_relationships to service_role;
create or replace function public.teaching_dictionary_lexical_preflight_read(
  p_candidate_words uuid[], p_micro_skill_key text, p_environment text
)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp as $$
  with touching as (
    select distinct m.family_key, m.revision
    from public.teaching_dictionary_spelling_lexical_members m
    where m.canonical_word_id = any (p_candidate_words)
  ), latest as (
    select distinct on (f.family_key)
      f.family_key, f.revision, f.base_lemma, f.base_kind, f.canonical_base_word_id,
      f.base_meaning, f.semantic_fingerprint
    from public.canonical_teaching_dictionary_lexical_base_families f
    where f.review_status = 'approved'
      and exists (select 1 from touching t where t.family_key = f.family_key)
    order by f.family_key, f.revision desc
  ), families as (
    select f.*
    from latest f
    where f.base_kind = 'free_base' and f.canonical_base_word_id is not null
      and exists (select 1 from touching t where t.family_key = f.family_key and t.revision = f.revision)
      and exists (
        select 1 from public.adle_base_word_lexical_family_authorizations a
        where a.family_key = f.family_key and a.revision = f.revision
          and a.semantic_fingerprint = f.semantic_fingerprint and a.withdrawn_at is null
      )
  ), members as (
    select m.family_key, m.canonical_word_id, m.word_part_of_speech, m.relationship_kind,
      m.canonical_morphology_id, m.word_sum, m.morphology_parts, m.morphology_joins,
      m.morphology_transformations, m.intended_meaning
    from public.teaching_dictionary_spelling_lexical_members m
    join families f on f.family_key = m.family_key and f.revision = m.revision
  ), member_words as (
    select distinct canonical_word_id from members
  ), approved_targets as (
    select distinct p.canonical_word_id
    from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id = p.release_id
    where p.canonical_word_id = any (p_candidate_words)
      and p.micro_skill_key = p_micro_skill_key
      and p.relationship_role = 'demonstrates'
      and r.environment_key = p_environment
      and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals w where w.release_id = p.release_id)
  ), bands as (
    select b.canonical_word_id, b.complexity_level
    from member_words w
    join public.canonical_teaching_dictionary_word_banding b on b.canonical_word_id = w.canonical_word_id
    join public.canonical_teaching_dictionary_banding_versions v on v.banding_version = b.banding_version
    where b.row_status = 'active' and v.is_active
  ), morphology as (
    select m.id, m.canonical_word_id, m.row_status, m.review_status, m.analysis_status,
      m.word_sum, m.morphology_parts, m.morphology_joins, m.morphology_transformations
    from member_words w
    join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id = w.canonical_word_id
  )
  select jsonb_build_object(
    'families', coalesce((select jsonb_agg(f order by f.revision desc, f.family_key) from families f), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(m order by m.family_key, m.canonical_word_id, m.word_part_of_speech) from members m), '[]'::jsonb),
    'approved_targets', coalesce((select jsonb_agg(t.canonical_word_id) from approved_targets t), '[]'::jsonb),
    'bands', coalesce((select jsonb_agg(b) from bands b), '[]'::jsonb),
    'morphology', coalesce((select jsonb_agg(m) from morphology m), '[]'::jsonb)
  );
$$;


create or replace view public.teaching_dictionary_current_sense_family_links as
 WITH latest AS (
         SELECT DISTINCT ON (teaching_dictionary_sense_family_link_events.canonical_word_id, teaching_dictionary_sense_family_link_events.sense_id, teaching_dictionary_sense_family_link_events.family_key, teaching_dictionary_sense_family_link_events.component_part_id) teaching_dictionary_sense_family_link_events.id,
            teaching_dictionary_sense_family_link_events.event_sequence,
            teaching_dictionary_sense_family_link_events.request_id,
            teaching_dictionary_sense_family_link_events.canonical_word_id,
            teaching_dictionary_sense_family_link_events.sense_id,
            teaching_dictionary_sense_family_link_events.family_key,
            teaching_dictionary_sense_family_link_events.family_revision,
            teaching_dictionary_sense_family_link_events.component_part_id,
            teaching_dictionary_sense_family_link_events.canonical_morphology_id,
            teaching_dictionary_sense_family_link_events.base_meaning,
            teaching_dictionary_sense_family_link_events.sense_set_fingerprint,
            teaching_dictionary_sense_family_link_events.action,
            teaching_dictionary_sense_family_link_events.reviewed_by,
            teaching_dictionary_sense_family_link_events.source_reference,
            teaching_dictionary_sense_family_link_events.reviewed_at
           FROM teaching_dictionary_sense_family_link_events
          ORDER BY teaching_dictionary_sense_family_link_events.canonical_word_id, teaching_dictionary_sense_family_link_events.sense_id, teaching_dictionary_sense_family_link_events.family_key, teaching_dictionary_sense_family_link_events.component_part_id, teaching_dictionary_sense_family_link_events.event_sequence DESC
        ), current_families AS (
         SELECT DISTINCT ON (canonical_teaching_dictionary_lexical_base_families.family_key) canonical_teaching_dictionary_lexical_base_families.family_key,
            canonical_teaching_dictionary_lexical_base_families.revision,
            canonical_teaching_dictionary_lexical_base_families.base_lemma,
            canonical_teaching_dictionary_lexical_base_families.base_part_of_speech,
            canonical_teaching_dictionary_lexical_base_families.base_kind,
            canonical_teaching_dictionary_lexical_base_families.canonical_base_word_id,
            canonical_teaching_dictionary_lexical_base_families.base_meaning,
            canonical_teaching_dictionary_lexical_base_families.source_reference,
            canonical_teaching_dictionary_lexical_base_families.review_status,
            canonical_teaching_dictionary_lexical_base_families.reviewed_by,
            canonical_teaching_dictionary_lexical_base_families.reviewed_at,
            canonical_teaching_dictionary_lexical_base_families.approval_reference,
            canonical_teaching_dictionary_lexical_base_families.semantic_fingerprint,
            canonical_teaching_dictionary_lexical_base_families.created_at
           FROM canonical_teaching_dictionary_lexical_base_families
          ORDER BY canonical_teaching_dictionary_lexical_base_families.family_key, canonical_teaching_dictionary_lexical_base_families.revision DESC
        )
 SELECT e.id,
    e.canonical_word_id,
    e.sense_id,
    e.family_key,
    f.revision AS current_family_revision,
    e.component_part_id,
    e.canonical_morphology_id,
    e.base_meaning,
    e.reviewed_by,
    e.reviewed_at,
    m.relationship_kind
   FROM latest e
     JOIN current_families f ON f.family_key = e.family_key AND f.review_status = 'approved'::text
     JOIN teaching_dictionary_spelling_lexical_members m ON m.family_key = f.family_key AND m.revision = f.revision AND m.canonical_word_id = e.canonical_word_id AND m.canonical_morphology_id = e.canonical_morphology_id
     JOIN canonical_teaching_dictionary_word_morphology morph ON morph.id = e.canonical_morphology_id AND morph.row_status = 'active'::text
     JOIN teaching_dictionary_reviewed_sense_sets s ON s.canonical_word_id = e.canonical_word_id
     JOIN LATERAL ( SELECT jsonb_array_elements.value
           FROM jsonb_array_elements(s.sense_set -> 'senses'::text) jsonb_array_elements(value)
          WHERE (jsonb_array_elements.value ->> 'id'::text) = e.sense_id) selected ON true
     LEFT JOIN teaching_dictionary_sense_family_selected_facts selected_fact ON selected_fact.event_id = e.id
  WHERE e.action = 'approve'::text AND f.base_meaning = e.base_meaning AND (selected_fact.event_id IS NOT NULL AND adle_generic_snapshot_json_sha256_v1(selected.value) = selected_fact.sense_fingerprint OR selected_fact.event_id IS NULL AND adle_generic_snapshot_json_sha256_v1(s.sense_set) = e.sense_set_fingerprint);
notify pgrst,'reload schema';
commit;
