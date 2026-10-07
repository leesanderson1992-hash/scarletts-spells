import assert from "node:assert/strict";
import path from "node:path";

import { loadTsModule } from "./review-work-vm-loader";

const id = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
const rows = [
  { id: id(1), misspelling: "buisness", correction: "business", review_status: "pending",
    resolver_enabled: false, mapping_id: null, micro_skill_key: "D4_VALID" },
  { id: id(2), misspelling: "recieve", correction: "receive", review_status: "pending",
    resolver_enabled: false, mapping_id: null, micro_skill_key: "D4_VALID" },
  { id: id(3), misspelling: "seperate", correction: "separate", review_status: "confirmed",
    resolver_enabled: false, mapping_id: id(30), micro_skill_key: "D4_VALID" },
  { id: id(4), misspelling: "definately", correction: "definitely", review_status: "pending",
    resolver_enabled: false, mapping_id: null, micro_skill_key: null },
  { id: id(5), misspelling: "existance", correction: "existence", review_status: "confirmed",
    resolver_enabled: false, mapping_id: id(50), micro_skill_key: "D4_VALID" },
];
const calls = { rpc: [] as Array<{ name: string; itemId: string }>, followup: [] as string[], visibility: [] as string[] };

function query(table: string) {
  let selectedIds: string[] | null = null;
  let itemId: string | null = null;
  const builder = {
    select() { return builder; },
    in(column: string, values: string[]) { if (column === "id") selectedIds = values; return builder; },
    eq(column: string, value: string) { if (column === "id" || column === "item_id") itemId = value; return builder; },
    async maybeSingle() { return { data: rows.find((row) => row.id === itemId) ?? null, error: null }; },
    then(resolve: (result: { data: unknown[]; error: null }) => void) {
      const data = table === "spelling_resolution_items" ? rows.filter((row) => selectedIds?.includes(row.id)) :
        table === "spelling_canonical_mappings" ? [
          { id: id(30), mapping_status: "active", resolver_visibility_status: "hidden" },
          { id: id(50), mapping_status: "active", resolver_visibility_status: "hidden" },
        ].filter((row) => selectedIds?.includes(row.id)) :
        table === "micro_skill_catalog" ? [{ micro_skill_key: "D4_VALID" }] :
        table === "spelling_resolution_item_sources" && itemId === id(1) ? [{ source_id: id(10) }] :
        table === "spelling_catalog_review_cases" ? [{ id: id(10), source_provenance: "parent" }] : [];
      resolve({ data, error: null });
    },
  };
  return builder;
}

const db = {
  from: query,
  async rpc(name: string, args: Record<string, string>) {
    const itemId = args.p_item_id;
    calls.rpc.push({ name, itemId });
    return { error: name === "confirm_spelling_resolution_admin" && itemId === id(2) ?
      { message: "Concurrent change" } : null };
  },
};

const actions = loadTsModule<{ applyBulkResolution: (action: string, ids: string[]) => Promise<{
  succeeded: number; skipped: number; failures: Array<{ id: string }>; warnings: unknown[];
}> }>(path.resolve("app/(authenticated)/admin/canonical-mappings/resolution-actions.ts"), {
  stubModules: {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect() { throw new Error("Unexpected redirect"); } },
    "@/lib/admin/access": { async requireAdminUser() { return { id: id(99), email: "admin@example.test" }; } },
    "@/lib/supabase/service-role": { createServiceRoleClient() { return db; } },
    "@/lib/adle/review-work/admin-catalog-route": { async applyAdleCatalogReviewDecision() { calls.followup.push("catalog"); } },
    "@/lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply": {
      async surfaceReturnedCorrectionReplayRecommendations() { calls.followup.push("replay"); },
    },
    "@/lib/writing-engine/whole-writing/unknown-error-continuation": {
      async continueUnknownErrorAfterAdminDecision() { calls.followup.push("continue"); },
    },
    "@/lib/writing-engine/persistence/spelling-canonical-mappings": {
      async enableResolverVisibilityForCanonicalMappingAdmin(input: { mapping: { mappingId: string } }) {
        calls.visibility.push(input.mapping.mappingId);
      },
      async disableResolverVisibilityForCanonicalMappingAdmin() {},
    },
  },
});

async function main() {
  const confirmed = await actions.applyBulkResolution("confirm", [id(1), id(2), id(5)]);
  assert.equal(confirmed.succeeded, 1);
  assert.equal(confirmed.skipped, 1);
  assert.equal(confirmed.failures.length, 1);
  assert.deepEqual(calls.followup, ["catalog", "replay", "continue"]);

  const moved = await actions.applyBulkResolution("noSkill", [id(4), id(3)]);
  assert.equal(moved.succeeded, 1);
  assert.equal(moved.skipped, 1);
  assert.ok(calls.rpc.some((call) => call.name === "move_spelling_resolution_to_no_matching_skill_admin" && call.itemId === id(4)));

  const activated = await actions.applyBulkResolution("activate", [id(3), id(1)]);
  assert.equal(activated.succeeded, 1);
  assert.equal(activated.skipped, 1);
  assert.deepEqual(calls.visibility, [id(30)]);

  await assert.rejects(actions.applyBulkResolution("confirm", Array.from({ length: 51 }, (_, index) => id(index + 1))));
  console.log("canonical-resolver-bulk-actions-regression: ok");
}

void main();
