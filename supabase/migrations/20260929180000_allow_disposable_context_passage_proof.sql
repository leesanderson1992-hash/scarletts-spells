-- Select the adult passage pathway for a registered disposable proof only.
-- Default preserves existing four-family Stage 1B proof behavior.
begin;

alter table public.writing_context_shadow_policy
  add column proof_scan_kind text not null default 'FOUR_FAMILY',
  add constraint context_proof_passage_scope check (
    proof_scan_kind in ('FOUR_FAMILY','PASSAGE') and
    (proof_scan_kind='FOUR_FAMILY' or
      (execution_policy_kind='DISPOSABLE_BOOTSTRAP' and dispatch_scope='DISPOSABLE_PROVIDER_PROOF')));

commit;
