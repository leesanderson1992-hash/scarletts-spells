import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readArchivedMigrationOrActiveBaseline } from "./migration-sql-contract-source";

const migration = readArchivedMigrationOrActiveBaseline(
  "20260522_zzz_add_task_submission_payloads.sql",
);
const compactMigration = migration.replace(/\s+/g, " ").toLowerCase();

const approvalFlowPaths = ["app/courses/review/actions/review-completion-actions.ts"];

function assertMigrationIncludes(value: string, message: string) {
  assert.ok(
    compactMigration.includes(value.toLowerCase()),
    `${message}\nMissing: ${value}`,
  );
}

assertMigrationIncludes(
  "create table if not exists public.task_submission_payloads",
  "Expected durable structured payload table to be created.",
);

for (const column of [
  "id uuid primary key default gen_random_uuid()",
  "submission_id uuid not null references public.task_submissions(id) on delete cascade",
  "parent_user_id uuid not null references auth.users(id) on delete cascade",
  "course_id uuid not null references public.courses(id) on delete cascade",
  "task_id uuid not null references public.course_tasks(id) on delete cascade",
  "child_id uuid not null references public.children(id) on delete cascade",
  "payload_type text not null",
  "payload_version integer not null default 1",
  "payload_json jsonb not null",
  "created_at timestamptz not null default timezone('utc', now())",
  "updated_at timestamptz not null default timezone('utc', now())",
]) {
  assertMigrationIncludes(
    column,
    `Expected task_submission_payloads column/foreign key contract: ${column}.`,
  );
}

assert.match(
  migration,
  /constraint task_submission_payloads_payload_type_check[\s\S]*payload_type in \('structured_lesson_response', 'structured_test_response'\)/,
  "Expected payload type check to allow only structured lesson/test payloads.",
);
assertMigrationIncludes(
  "create unique index if not exists task_submission_payloads_submission_type_idx on public.task_submission_payloads (submission_id, payload_type)",
  "Expected unique submitted-attempt payload index.",
);
assertMigrationIncludes(
  "create index if not exists task_submission_payloads_task_child_created_idx on public.task_submission_payloads (task_id, child_id, created_at desc)",
  "Expected child/task latest-payload lookup index.",
);
assertMigrationIncludes(
  "create index if not exists task_submission_payloads_parent_child_task_created_idx on public.task_submission_payloads (parent_user_id, child_id, task_id, created_at desc)",
  "Expected parent-scoped child/task latest-payload lookup index.",
);
assertMigrationIncludes(
  "grant select on public.task_submission_payloads to authenticated",
  "Expected authenticated users to have scoped read access only.",
);
assert.doesNotMatch(
  migration,
  /grant\s+[^;]*(insert|update|delete)[^;]*on public\.task_submission_payloads to authenticated/i,
  "Authenticated users must not receive direct insert/update/delete privileges for immutable submitted evidence.",
);
assertMigrationIncludes(
  "alter table public.task_submission_payloads enable row level security",
  "Expected RLS to be enabled.",
);
assert.match(
  migration,
  /create policy task_submission_payloads_parent_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(auth\.uid\(\) = parent_user_id\)/,
  "Expected parent-scoped select policy using auth.uid() = parent_user_id.",
);
assert.doesNotMatch(
  migration,
  /create policy [\s\S]*?on public\.task_submission_payloads[\s\S]*?for all/i,
  "Durable submitted payload storage must not use a broad for all policy.",
);
assert.doesNotMatch(
  migration,
  /create policy [\s\S]*?on public\.task_submission_payloads[\s\S]*?for (insert|update|delete)/i,
  "Authenticated users must not receive direct insert/update/delete policies for immutable submitted evidence.",
);

for (const approvalFlowPath of approvalFlowPaths) {
  const source = readFileSync(approvalFlowPath, "utf8");
  assert.doesNotMatch(
    source,
    /from\("task_submission_payloads"\)(?:(?!\n\s*\.maybeSingle\(\);)[\s\S])*\.(insert|upsert|update|delete)\(/,
    `${approvalFlowPath} must not mutate immutable durable payload rows during approval cleanup.`,
  );
  assert.match(
    source,
    /from\("task_submission_payloads"\)[\s\S]*\.select\("id"\)/,
    `${approvalFlowPath} may only read durable payload existence for approval draft cleanup safety.`,
  );
}

console.log(
  "writing-engine-structured-submission-payload-storage-regression: ok",
);
