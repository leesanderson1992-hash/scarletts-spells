begin;

drop index if exists public.child_word_treasure_events_source_uidx;
drop index if exists public.child_word_treasure_events_source_idx;

alter table public.child_word_treasure_events
  alter column source_entity_id type text using source_entity_id::text;

create index if not exists child_word_treasure_events_source_idx
  on public.child_word_treasure_events (source_type, source_entity_id)
  where source_entity_id is not null;

create unique index if not exists child_word_treasure_events_source_uidx
  on public.child_word_treasure_events (treasure_id, event_type, source_type, source_entity_id)
  where source_entity_id is not null;

commit;
