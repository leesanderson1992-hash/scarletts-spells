begin;

create index if not exists learning_item_issue_links_parent_learning_item_idx
  on public.learning_item_issue_links (parent_user_id, learning_item_id, created_at desc);

create index if not exists learning_item_evidence_parent_learning_item_idx
  on public.learning_item_evidence (parent_user_id, learning_item_id, created_at desc);

commit;
