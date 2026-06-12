import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import { resolveStage2d1WordMapAssignmentContent } from "../lib/writing-engine/assignments/stage2d1-word-map-content";
import { createStage2d1SupabaseWordMapContentRepository } from "../lib/writing-engine/persistence/stage2d1-word-map-content";

const FIXTURE = {
  parentUserId: "00000000-0000-4000-8000-00000002d200",
  childId: "00000000-0000-4000-8000-00000002d201",
  learningItemId: "00000000-0000-4000-8000-00000002d202",
  microSkillKey: "D4_PAT_SPLIT_DIGRAPHS_A_E",
  practiceRoute: "word_practice",
} as const;

const WRITE_GUARD_TABLES = [
  "learning_items",
  "learning_item_evidence",
  "assignment_items",
] as const;

type SupabaseFromClient = {
  from(table: string): any;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function readLocalSupabaseConfig() {
  const url =
    readEnv("STAGE_2D2_SUPABASE_URL") ??
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ??
    "http://127.0.0.1:54321";
  const serviceRoleKey =
    readEnv("STAGE_2D2_SERVICE_ROLE_KEY") ??
    readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    throw new Error(
      "Missing STAGE_2D2_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY for local read-only smoke.",
    );
  }

  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local Supabase URL for Stage 2D.2 smoke: ${url}`);
  }

  if (parsed.port !== "54321") {
    throw new Error(`Refusing non-local Supabase port for Stage 2D.2 smoke: ${url}`);
  }

  return { url, serviceRoleKey };
}

function createReadLoggedSupabase(input: {
  url: string;
  serviceRoleKey: string;
  tableReads: string[];
}) {
  const client = createClient(input.url, input.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) => {
          input.tableReads.push(table);
          return target.from(table);
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

async function countRows(input: {
  supabase: SupabaseFromClient;
  table: string;
}) {
  const { count, error } = await input.supabase
    .from(input.table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Unable to count ${input.table}: ${error.message}`);
  }

  return count ?? 0;
}

async function writeGuardCounts(supabase: SupabaseFromClient) {
  const entries = await Promise.all(
    WRITE_GUARD_TABLES.map(async (table) => [
      table,
      await countRows({ supabase, table }),
    ] as const),
  );

  return Object.fromEntries(entries) as Record<(typeof WRITE_GUARD_TABLES)[number], number>;
}

async function main() {
  const { url, serviceRoleKey } = readLocalSupabaseConfig();
  const tableReads: string[] = [];
  const guardSupabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const resolverSupabase = createReadLoggedSupabase({
    url,
    serviceRoleKey,
    tableReads,
  }) as unknown as ReturnType<typeof createClient>;

  const protectedBefore = await writeGuardCounts(guardSupabase);
  const repository = createStage2d1SupabaseWordMapContentRepository(resolverSupabase as never);
  const result = await resolveStage2d1WordMapAssignmentContent({
    learningItemId: FIXTURE.learningItemId,
    childId: FIXTURE.childId,
    parentUserId: FIXTURE.parentUserId,
    repository,
  });
  const protectedAfter = await writeGuardCounts(guardSupabase);

  assert.deepEqual(
    protectedAfter,
    protectedBefore,
    "Stage 2D.2 smoke must not change protected table counts.",
  );

  assert.equal(result.status, "available");
  assert.equal(result.content.learningItemId, FIXTURE.learningItemId);
  assert.equal(result.content.childId, FIXTURE.childId);
  assert.equal(result.content.parentUserId, FIXTURE.parentUserId);
  assert.equal(result.content.microSkillKey, FIXTURE.microSkillKey);
  assert.equal(result.content.practiceRoute, FIXTURE.practiceRoute);
  assert.equal(result.content.routeSupport.minimumWordsRequired, 3);
  assert.equal(result.content.routeSupport.requiresContrastWords, false);
  assert.equal(result.content.targetWords.length, 3);
  assert.deepEqual(
    result.content.targetWords.map((word) => word.normalisedWord),
    ["make", "cake", "same"],
  );
  assert.equal(result.content.contrastPairs.length, 0);

  assert.ok(
    tableReads.includes("canonical_spelling_word_map_import_batches"),
    "Smoke must verify active import-batch status through the repository.",
  );
  assert.ok(
    tableReads.includes("canonical_spelling_word_map_route_support"),
    "Smoke must read route support.",
  );
  assert.ok(
    tableReads.includes("canonical_spelling_word_map_words"),
    "Smoke must read approved word-map words.",
  );
  assert.ok(
    !tableReads.includes("canonical_spelling_word_map_diagnostic_examples"),
    "Smoke must not query diagnostic examples.",
  );
  assert.ok(
    !tableReads.includes("assignment_items"),
    "Smoke resolver path must not query assignment_items.",
  );
  assert.ok(
    !tableReads.includes("spelling_canonical_mappings"),
    "Smoke resolver path must not query canonical resolver mappings.",
  );
  assert.ok(
    !tableReads.includes("spelling_canonical_mapping_recommendations"),
    "Smoke resolver path must not query PCRM recommendations.",
  );

  console.log(
    JSON.stringify(
      {
        status: "writing-engine-stage2d2-local-word-map-smoke: ok",
        target: "local_dev_only",
        learningItemId: FIXTURE.learningItemId,
        microSkillKey: result.content.microSkillKey,
        practiceRoute: result.content.practiceRoute,
        targetWords: result.content.targetWords.map((word) => word.normalisedWord),
        tableReads: Array.from(new Set(tableReads)).sort(),
        writeGuardCountsUnchanged: true,
      },
      null,
      2,
    ),
  );
}

void main();
