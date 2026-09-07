-- Inventory records blocked source facts as observed. An unknown micro-skill key
-- must remain reportable without becoming a valid candidate or catalog identity.
alter table public.writing_enrichment_inventory_entries
  drop constraint writing_enrichment_inventory_entries_micro_skill_key_fkey;
alter table public.writing_enrichment_inventory_entries
  add constraint writing_enrichment_inventory_entries_micro_skill_key_shape
  check(micro_skill_key is null or length(btrim(micro_skill_key)) between 1 and 240);
