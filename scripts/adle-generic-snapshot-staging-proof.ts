/**
 * Disposable staging-only proof fixture for the generic V2 snapshot reader.
 *
 * The hosted staging project intentionally has no service-role API key in its
 * Preview environment. This harness therefore uses the separately guarded
 * staging database connection to create the same compiler output and invoke
 * the service-only atomic writer inside one transaction. Browser reads remain
 * ordinary authenticated application requests.
 *
 * Commands: setup | verify | diverge | restore | cleanup
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import { compileGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-compiler";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import type {
  ActivityTemplateFact,
  ComposedDailyPlan,
  DailyPlanFacts,
  PlanItemCandidate,
} from "../lib/adle/daily-assignment-composer";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const STAGING_POOLER = "aws-1-eu-central-1.pooler.supabase.com";
const CONFIRM = "ADLE-GENERIC-SNAPSHOT-STAGING-FIXTURE-V2";
const STATE = resolve(".tmp/adle-generic-snapshot-staging-proof.json");
const PLAN_DATE = "2026-07-31";
const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const FAMILY = "D4_MOR";

type State = {
  parentId: string;
  childId: string;
  assignmentId: string;
  bundleId: string;
  learningItemId: string;
  reviewWordIds: string[];
  lessonWordId: string;
  email: string;
  password: string;
  originalFirstTemplate: string;
  compatibility?: Array<{
    childId: string;
    assignmentId: string;
    kind: "explicit_snapshot_absent" | "metadata_free_legacy";
  }>;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function guardedConnectionString(): string {
  const raw = required("ADLE_GENERIC_SNAPSHOT_STAGING_DATABASE_URL");
  const url = new URL(raw);
  if (
    url.hostname !== STAGING_POOLER ||
    !url.username.includes(STAGING_REF) ||
    raw.includes(PRODUCTION_REF)
  ) throw new Error("Refusing any database except the pinned Scarlett's Spells staging project");
  return raw;
}

function mutating(): void {
  if (!process.argv.includes("--apply") || !process.argv.includes(CONFIRM)) {
    throw new Error(`Mutating commands require --apply ${CONFIRM}`);
  }
}

function loadState(): State {
  if (!existsSync(STATE)) throw new Error("Generic snapshot staging proof state is missing");
  return JSON.parse(readFileSync(STATE, "utf8")) as State;
}

function saveState(value: State): void {
  mkdirSync(resolve(".tmp"), { recursive: true });
  writeFileSync(STATE, JSON.stringify(value));
}

function candidate(
  position: number,
  sectionKey: string,
  templateKey: string,
  canonicalWordId: string | null,
  targetWord: string | null,
  microSkillKey: string | null,
  payload: Record<string, unknown>,
  learningItemId: string | null = null,
): PlanItemCandidate {
  return {
    position,
    sectionKey,
    templateKey,
    canonicalWordId,
    targetWord,
    microSkillKey,
    payload,
    learningItemId,
    expectedEvidenceKind: null,
    provenance: sectionKey.startsWith("review_") ? "review_session" : "lesson_composer",
  };
}

async function setup(): Promise<void> {
  mutating();
  if (existsSync(STATE)) throw new Error("Existing proof state must be cleaned up first");
  const client = new pg.Client({ connectionString: guardedConnectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  const parentId = randomUUID();
  const childId = randomUUID();
  const bundleId = randomUUID();
  const learningItemId = randomUUID();
  const tag = randomUUID();
  const email = `adle-generic-${tag}@example.test`;
  const password = `Snapshot-${tag}!`;
  try {
    await client.query("begin");
    const policy = await client.query<{ schedule_policy_version: string }>(
      "select schedule_policy_version from public.adle_review_policy_versions where is_active = true",
    );
    if (policy.rowCount !== 1) throw new Error("Expected exactly one active review policy");
    const words = await client.query<{ id: string; display_word: string }>(
      `select w.id, w.display_word
       from public.canonical_teaching_dictionary_word_support s
       join public.canonical_teaching_dictionary_words w on w.id = s.canonical_word_id
       where s.micro_skill_key = $1 and s.row_status = 'active'
         and s.review_status = 'approved_for_first_exposure'
         and w.row_status = 'active' and w.review_status = 'approved_for_first_exposure'
       order by w.word_key limit 3`,
      [SKILL],
    );
    if (words.rowCount !== 3) throw new Error("Expected three reviewed staging words");
    const reviewWords = words.rows.slice(0, 2);
    const lessonWord = words.rows[2];
    const teaching = await client.query<{ content_version: string; source_row_hash: string | null }>(
      "select content_version, source_row_hash from public.canonical_teaching_dictionary_content_versions where micro_skill_key = $1 and is_active = true limit 1",
      [SKILL],
    );
    const banding = await client.query<{ banding_version: string }>(
      "select banding_version from public.canonical_teaching_dictionary_banding_versions where is_active = true",
    );
    if (teaching.rowCount !== 1 || banding.rowCount !== 1) {
      throw new Error("Required staging content provenance is incomplete");
    }
    const dictation = await client.query<{ dictation_sentence: string; dictation_target_token_index: number; audio_text: string }>(
      "select dictation_sentence, dictation_target_token_index, audio_text from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id = $1 and row_status = 'active' and review_status = 'approved_for_first_exposure' limit 1",
      [lessonWord.id],
    );
    if (dictation.rowCount !== 1) throw new Error("The staging lesson word has no approved Sentence Dictation contract");
    const templateKeys = [
      "REVIEW_QUICK_SORT",
      "REVIEW_DICTATION",
      "ERROR_REFLECTION_CUE",
      "MICRO_READ_ONLY_INTRO",
      "MOR_STRIP_BUILD",
      "CONTROLLED_SPELLING",
      "DICTATION_NO_IMAGE",
    ];
    const templates: ActivityTemplateFact[] = templateKeys.map((templateKey) => ({
      templateKey,
      phase: "staging_proof",
      minWordsRequired: templateKey === "REVIEW_QUICK_SORT" ? 2 : 1,
      requiresSentenceContext: false,
      requiresContrastWords: false,
      evidenceKind: "staging_proof",
      childFacingCopy: "",
      purpose: "",
      childResponse: "",
      contentVersion: "staging-proof-registry-v1",
      importBatchId: "staging-proof",
      rowStatus: "active",
    }));

    const items = [
      candidate(1, "review_quick_sort", "REVIEW_QUICK_SORT", null, null, null, {
        words: reviewWords.map((word) => ({ canonicalWordId: word.id, targetWord: word.display_word })),
        sortBins: null,
      }),
      ...reviewWords.flatMap((word, index) => [
        candidate(2 + index * 2, "review_production", "REVIEW_DICTATION", word.id, word.display_word, SKILL, {
          bundleId,
          dueKind: "bundle_review",
          microSkillKeys: [SKILL],
          requiresSentenceContext: false,
        }),
        candidate(3 + index * 2, "review_reflection", "ERROR_REFLECTION_CUE", word.id, word.display_word, SKILL, {
          conditional: "on_misspelling",
          misconceptionHint: "Look closely at the base word.",
        }),
      ]),
      candidate(6, "lesson_intro", "MICRO_READ_ONLY_INTRO", null, null, SKILL, {}),
      candidate(7, "guided_practice", "MOR_STRIP_BUILD", lessonWord.id, lessonWord.display_word, SKILL, {}, learningItemId),
      candidate(8, "lesson_production", "CONTROLLED_SPELLING", lessonWord.id, lessonWord.display_word, SKILL, {}, learningItemId),
      candidate(9, "lesson_dictation", "DICTATION_NO_IMAGE", lessonWord.id, lessonWord.display_word, SKILL, {
        sentence: dictation.rows[0].dictation_sentence,
        audioText: dictation.rows[0].audio_text,
        targetTokenIndex: dictation.rows[0].dictation_target_token_index,
      }, learningItemId),
    ];
    const plan: ComposedDailyPlan = {
      childId,
      planDate: PLAN_DATE,
      lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
      composerPolicyVersion: "adle_composer_policy_v1",
      schedulePolicyVersion: policy.rows[0].schedule_policy_version,
      throttle: {} as ComposedDailyPlan["throttle"],
      partOne: {
        dueQueue: [],
        presentationOrder: reviewWords.map((word) => word.id),
        sections: [
          { sectionKey: "review_quick_sort", purpose: "staging proof", items: [items[0]] },
          { sectionKey: "review_production", purpose: "staging proof", items: [items[1], items[3]] },
          { sectionKey: "review_reflection", purpose: "staging proof", items: [items[2], items[4]] },
        ],
        skips: [],
      },
      partTwo: {
        composed: true,
        microSkillKey: SKILL,
        selectionAudit: [],
        lessonWords: [{ canonicalWordId: lessonWord.id, provenance: "learning_item", learningItemId, complexityLevel: 1 }],
        probePlan: null,
        stretchItemIntakes: [],
        sections: [
          { sectionKey: "lesson_intro", purpose: "staging proof", items: [items[5]] },
          { sectionKey: "guided_practice", purpose: "staging proof", items: [items[6]] },
          { sectionKey: "lesson_production", purpose: "staging proof", items: [items[7]] },
          { sectionKey: "lesson_dictation", purpose: "staging proof", items: [items[8]] },
        ],
        skips: [],
      },
      budget: { budgetResponses: 20, estimatedResponses: 6, guidedWordCount: 1, introTrimmed: false, trims: [] },
    };
    const facts = {
      childId,
      reviewPolicy: { schedulePolicyVersion: policy.rows[0].schedule_policy_version },
      composerPolicy: { composerPolicyVersion: "adle_composer_policy_v1" },
      bundles: [], scheduleWords: [], reviewWordFacts: new Map(),
      familyMethods: [{ familyKey: FAMILY, familyName: "Morphology", guidedQuestionSequence: ["MOR_STRIP_BUILD"], reviewSortDimension: "REVIEW_QUICK_SORT(base word)", productionTask: "DICTATION_OR_WRITING", contentVersion: "staging-proof-family-v1", importBatchId: "staging-proof", rowStatus: "active" }],
      activityTemplates: templates,
      teachingContent: new Map([[SKILL, { microSkillKey: SKILL, teachingObjective: "Preserve the base word", childFriendlyExplanation: "Find the base word.", ruleExplanation: "Keep the base spelling visible.", commonMisconceptions: "Check the join.", contentVersion: teaching.rows[0].content_version, sourceRowHash: teaching.rows[0].source_row_hash, importBatchId: "staging-proof" }]]),
      skillFamilyKeyBySkill: new Map([[SKILL, FAMILY]]),
      learningItems: [], prerequisiteKeysBySkill: new Map(), frequencyBandByWordId: new Map(), previousLessonFamilyKey: null,
      dictionary: {
        words: [{ canonicalWordId: lessonWord.id, wordKey: "staging-proof", normalisedWord: lessonWord.display_word.toLowerCase(), displayWord: lessonWord.display_word, rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "high", ageBand: "middle_primary" }],
        supports: [], bandings: [], overrides: [],
        activeBandingVersion: { bandingVersion: banding.rows[0].banding_version, isActive: true, levelCount: 3 },
        activeTeachingSkillKeys: new Set([SKILL]),
      },
      childBand: { allowedFrequencyBands: ["high"], allowedAgeBands: ["middle_primary"] },
      taughtHistory: { wasTaught: () => false }, probeRuns: [], probeMissWordIdsToday: [],
    } as unknown as DailyPlanFacts;
    const persistence = planAssignmentPersistence(plan, { parentUserId: parentId, existingHeaders: [] });
    if (persistence.action !== "insert" || !persistence.header) throw new Error("Staging proof plan did not produce an insert");
    const compiled = compileGenericLessonSnapshot({ facts, plan, persistence: persistence as typeof persistence & { action: "insert"; header: NonNullable<typeof persistence.header> } });
    if (!compiled.ok) throw new Error(`Staging proof compilation blocked: ${JSON.stringify(compiled.blockers)}`);

    await client.query(
      `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
       values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,crypt($3,gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`,
      [parentId, email, password],
    );
    await client.query(
      `insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
       values ($1::uuid,$1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true,'phone_verified',false),'email',now(),now(),now())`,
      [parentId, email],
    );
    await client.query("insert into public.children (id,parent_user_id,first_name) values ($1,$2,'ADLE Snapshot Proof')", [childId, parentId]);
    await client.query(
      "insert into public.adle_review_bundles (id,child_id,source_ref,interval_index,next_due_on,schedule_policy_version,bundle_status,row_status) values ($1,$2,$3,0,$4,$5,'active','active')",
      [bundleId, childId, `generic-snapshot-proof:${tag}`, PLAN_DATE, policy.rows[0].schedule_policy_version],
    );
    for (const word of reviewWords) {
      await client.query(
        "insert into public.adle_review_schedule_words (child_id,canonical_word_id,bundle_id,membership_status,taught_on,row_status) values ($1,$2,$3,'scheduled',$4,'active')",
        [childId, word.id, bundleId, PLAN_DATE],
      );
    }
    await client.query(
      "insert into public.adle_learning_items (id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,intake_on,row_status) values ($1,$2,$3,$4,'pending','verified_misspelling',$5,$6,'active')",
      [learningItemId, childId, lessonWord.id, SKILL, `generic-snapshot-proof:${tag}`, PLAN_DATE],
    );
    const inserted = await client.query<{ assignment_id: string }>(
      "select public.persist_adle_generic_daily_plan_v2($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) as assignment_id",
      [parentId, childId, PLAN_DATE, JSON.stringify(persistence.header), JSON.stringify(persistence.items), JSON.stringify(persistence.learningItemIntakes), JSON.stringify(compiled.snapshot)],
    );
    const assignmentId = inserted.rows[0]?.assignment_id;
    if (!assignmentId) throw new Error("Atomic generic writer returned no assignment ID");
    await client.query("commit");
    saveState({ parentId, childId, assignmentId, bundleId, learningItemId, reviewWordIds: reviewWords.map((word) => word.id), lessonWordId: lessonWord.id, email, password, originalFirstTemplate: persistence.items[0].templateKey });
    console.log(JSON.stringify({ status: "fixture_ready", parentId, childId, assignmentId, itemCount: persistence.items.length, snapshotFingerprintVerified: true }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function verify(): Promise<void> {
  const state = loadState();
  const client = new pg.Client({ connectionString: guardedConnectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(
      `select da.id, da.compiled_lesson_snapshot is not null as snapshot_present,
              da.compiled_lesson_snapshot->>'snapshotSchemaVersion' as schema_version,
              count(ai.id)::int as item_count,
              bool_and(ai.source_entity_id = da.compiled_lesson_snapshot->'activities'->(ai.position - 1)#>>'{itemBinding,sourceEntityId}') as bindings_match
       from public.daily_assignments da
       join public.assignment_items ai on ai.daily_assignment_id = da.id
       where da.id = $1 group by da.id`,
      [state.assignmentId],
    );
    const row = result.rows[0];
    if (!row || !row.snapshot_present || row.schema_version !== "2" || row.item_count !== 9 || row.bindings_match !== true) {
      throw new Error("Persisted snapshot/item parity verification failed");
    }
    console.log(JSON.stringify({ status: "fixture_verified", assignmentId: state.assignmentId, snapshotSchemaVersion: 2, itemCount: 9, bindingsMatch: true }));
  } finally {
    await client.end();
  }
}

async function setDivergence(diverged: boolean): Promise<void> {
  mutating();
  const state = loadState();
  const client = new pg.Client({ connectionString: guardedConnectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      "update public.assignment_items set template_key = $1 where daily_assignment_id = $2 and position = 1",
      [diverged ? "LESSON_WORDS_INTRO" : state.originalFirstTemplate, state.assignmentId],
    );
    console.log(JSON.stringify({ status: diverged ? "fixture_diverged" : "fixture_restored", assignmentId: state.assignmentId }));
  } finally {
    await client.end();
  }
}

async function setupCompatibility(): Promise<void> {
  mutating();
  const state = loadState();
  if (state.compatibility?.length) throw new Error("Compatibility fixtures already exist");
  const client = new pg.Client({ connectionString: guardedConnectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const route = await client.query<{ lesson_route_metadata: unknown }>(
      "select lesson_route_metadata from public.daily_assignments where id = $1",
      [state.assignmentId],
    );
    if (route.rowCount !== 1) throw new Error("Primary fixture route metadata is missing");
    const compatibility: NonNullable<State["compatibility"]> = [];
    for (const kind of ["explicit_snapshot_absent", "metadata_free_legacy"] as const) {
      const childId = randomUUID();
      await client.query(
        "insert into public.children (id,parent_user_id,first_name) values ($1,$2,$3)",
        [childId, state.parentId, kind === "explicit_snapshot_absent" ? "ADLE Explicit Legacy Proof" : "ADLE Metadata-free Proof"],
      );
      const assignment = await client.query<{ id: string }>(
        `insert into public.daily_assignments (
           child_id,parent_user_id,assignment_date,title,status,target_words,review_words,
           assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot
         ) values ($1,$2,$3,'ADLE Daily Plan','pending',array[]::text[],array[]::text[],'adle_composer_v1',$4::jsonb,null)
         returning id`,
        [childId, state.parentId, PLAN_DATE, kind === "explicit_snapshot_absent" ? JSON.stringify(route.rows[0].lesson_route_metadata) : null],
      );
      const assignmentId = assignment.rows[0].id;
      await client.query(
        `insert into public.assignment_items (
           daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,
           source_entity_id,template_key,target_word,position,status,prompt_data,metadata
         ) values ($1,$2,$3,'spelling','instruction','adle_composer',$4,'MICRO_READ_ONLY_INTRO',null,1,'ready','{}',$5::jsonb)`,
        [assignmentId, childId, state.parentId, `adle:${childId}:${PLAN_DATE}:1`, JSON.stringify({ planDate: PLAN_DATE, sectionKey: "lesson_intro", microSkillKey: SKILL, canonicalWordId: null, adleLearningItemRef: null })],
      );
      compatibility.push({ childId, assignmentId, kind });
    }
    await client.query("commit");
    saveState({ ...state, compatibility });
    console.log(JSON.stringify({ status: "compatibility_fixtures_ready", fixtures: compatibility }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function cleanup(): Promise<void> {
  mutating();
  const state = loadState();
  const client = new pg.Client({ connectionString: guardedConnectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    for (const fixture of state.compatibility ?? []) {
      await client.query("delete from public.children where id = $1 and parent_user_id = $2", [fixture.childId, state.parentId]);
    }
    await client.query("delete from public.children where id = $1 and parent_user_id = $2", [state.childId, state.parentId]);
    await client.query("delete from auth.identities where user_id = $1", [state.parentId]);
    await client.query("delete from auth.users where id = $1", [state.parentId]);
    const residue = await client.query(
      `select
        (select count(*) from public.children where id = $1)::int as children,
        (select count(*) from public.daily_assignments where id = $2)::int as assignments,
        (select count(*) from public.assignment_items where daily_assignment_id = $2)::int as items,
        (select count(*) from public.adle_learning_items where child_id = $1)::int as learning_items,
        (select count(*) from public.adle_review_bundles where child_id = $1)::int as bundles,
        (select count(*) from public.adle_review_schedule_words where child_id = $1)::int as schedule_words,
        (select count(*) from auth.users where id = $3)::int as auth_users`,
      [state.childId, state.assignmentId, state.parentId],
    );
    if (Object.values(residue.rows[0]).some((value) => value !== 0)) throw new Error(`Fixture residue remains: ${JSON.stringify(residue.rows[0])}`);
    for (const fixture of state.compatibility ?? []) {
      const compatibilityResidue = await client.query(
        "select (select count(*) from public.children where id=$1)::int as children, (select count(*) from public.daily_assignments where id=$2)::int as assignments, (select count(*) from public.assignment_items where daily_assignment_id=$2)::int as items",
        [fixture.childId, fixture.assignmentId],
      );
      if (Object.values(compatibilityResidue.rows[0]).some((value) => value !== 0)) {
        throw new Error(`Compatibility fixture residue remains: ${JSON.stringify(compatibilityResidue.rows[0])}`);
      }
    }
    await client.query("commit");
    rmSync(STATE, { force: true });
    console.log(JSON.stringify({ status: "cleanup_verified", exactFixtureResidue: 0 }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "setup") await setup();
  else if (command === "verify") await verify();
  else if (command === "diverge") await setDivergence(true);
  else if (command === "restore") await setDivergence(false);
  else if (command === "compatibility") await setupCompatibility();
  else if (command === "cleanup") await cleanup();
  else throw new Error("Use setup, verify, diverge, restore, compatibility, or cleanup");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
