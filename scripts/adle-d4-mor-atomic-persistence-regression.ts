import { createClient } from "@supabase/supabase-js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function requireLocal(url: string): void {
  const hostname = new URL(url).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") throw new Error("Refusing to run atomic persistence regression outside local Supabase.");
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing local Supabase URL or service role key.");
  requireLocal(url);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `adle-ui-g-${suffix}@example.test`;
  const { data: authData, error: authError } = await client.auth.admin.createUser({ email, password: `Local-${suffix}!`, email_confirm: true });
  if (authError || !authData.user) throw new Error(`seed auth user: ${authError?.message}`);
  const parentUserId = authData.user.id;
  let childId: string | null = null;

  try {
    const { data: child, error: childError } = await client.from("children").insert({ parent_user_id: parentUserId, first_name: "ADLE UI-G Atomic" }).select("id").single();
    if (childError || !child) throw new Error(`seed child: ${childError?.message}`);
    childId = (child as { id: string }).id;
    const { data: words, error: wordsError } = await client.from("canonical_teaching_dictionary_words").select("id, display_word").in("display_word", ["unfair", "unhappy", "unkind", "unlock"]).eq("row_status", "active");
    if (wordsError) throw new Error(`load words: ${wordsError.message}`);
    assert((words ?? []).length === 4, "four pilot lesson words exist locally");
    const wordRows = words as Array<{ id: string; display_word: string }>;

    const makePayload = (date: string) => {
      const header = { childId, parentUserId, assignmentDate: date, title: "ADLE Daily Plan", status: "pending", targetWords: wordRows.map((word) => word.display_word), reviewWords: [], assignmentGenerationSource: "adle_composer_v1" };
      const items = Array.from({ length: 16 }, (_, index) => ({ childId, parentUserId, domainModule: "spelling", itemType: index < 2 ? "adle_lesson_intro" : "adle_guided_practice", sourceType: "adle_composer", sourceEntityId: `adle:${childId}:${date}:${index + 1}`, templateKey: index === 0 ? "MICRO_READ_ONLY_INTRO" : "MOR_STRIP_BUILD", targetWord: null, position: index + 1, status: "ready", promptData: { pilotActivityId: `atomic-${index + 1}` }, metadata: { planDate: date, sectionKey: index < 2 ? "lesson_intro" : "guided_practice", provenance: "atomic_regression", microSkillKey: "D4_MOR_PREFIXES_UN", canonicalWordId: null, expectedEvidenceKind: "guided_task", adleLearningItemRef: null, composerPolicyVersion: "regression", schedulePolicyVersion: "regression" } }));
      const intakes = wordRows.map((word) => ({ learningItemId: `regression:${date}:${word.id}`, childId, canonicalWordId: word.id, microSkillKey: "D4_MOR_PREFIXES_UN", itemStatus: "pending", sourceKind: "stretch_selection", sourceRef: `atomic-regression:${childId}:${date}:${word.display_word}`, sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active" }));
      return { header, items, intakes };
    };
    const call = (date: string, payload: ReturnType<typeof makePayload>) => client.rpc("persist_adle_composed_daily_plan_v1", { p_parent_user_id: parentUserId, p_child_id: childId, p_plan_date: date, p_header: payload.header, p_items: payload.items, p_intakes: payload.intakes });
    const countRows = async (date: string) => {
      const { data: headers, error } = await client.from("daily_assignments").select("id").eq("child_id", childId).eq("assignment_date", date).eq("title", "ADLE Daily Plan");
      if (error) throw error;
      const headerIds = (headers ?? []).map((row) => (row as { id: string }).id);
      const { count: itemCount, error: itemError } = await client.from("assignment_items").select("id", { count: "exact", head: true }).in("daily_assignment_id", headerIds.length > 0 ? headerIds : ["00000000-0000-0000-0000-000000000000"]);
      if (itemError) throw itemError;
      return { headerCount: headerIds.length, itemCount: itemCount ?? 0 };
    };

    const successDate = "2099-01-01";
    const successPayload = makePayload(successDate);
    const first = await call(successDate, successPayload);
    assert(!first.error && typeof first.data === "string", "atomic RPC returns assignment id");
    assert(JSON.stringify(await countRows(successDate)) === JSON.stringify({ headerCount: 1, itemCount: 16 }), "success writes one header and 16 items");
    const duplicate = await call(successDate, successPayload);
    assert(duplicate.error !== null, "duplicate invocation is refused");
    assert(JSON.stringify(await countRows(successDate)) === JSON.stringify({ headerCount: 1, itemCount: 16 }), "duplicate invocation writes nothing");

    const itemFailureDate = "2099-01-02";
    const itemFailure = makePayload(itemFailureDate);
    itemFailure.items[15].position = 99;
    assert((await call(itemFailureDate, itemFailure)).error !== null, "invalid final item forces rollback");
    assert(JSON.stringify(await countRows(itemFailureDate)) === JSON.stringify({ headerCount: 0, itemCount: 0 }), "item failure rolls back header and prior items");

    const intakeFailureDate = "2099-01-03";
    const intakeFailure = makePayload(intakeFailureDate);
    intakeFailure.intakes[3].canonicalWordId = "not-a-uuid";
    assert((await call(intakeFailureDate, intakeFailure)).error !== null, "invalid final intake forces rollback");
    assert(JSON.stringify(await countRows(intakeFailureDate)) === JSON.stringify({ headerCount: 0, itemCount: 0 }), "intake failure rolls back header and items");

    const concurrentDate = "2099-01-04";
    const concurrentPayload = makePayload(concurrentDate);
    const concurrent = await Promise.all([call(concurrentDate, concurrentPayload), call(concurrentDate, concurrentPayload)]);
    assert(concurrent.filter((result) => result.error === null).length === 1 && concurrent.filter((result) => result.error !== null).length === 1, "concurrent invocation has one winner");
    assert(JSON.stringify(await countRows(concurrentDate)) === JSON.stringify({ headerCount: 1, itemCount: 16 }), "concurrent invocation persists one complete plan");

    console.log("ADLE D4_MOR atomic persistence regression passed");
  } finally {
    if (childId) await client.from("children").delete().eq("id", childId);
    await client.auth.admin.deleteUser(parentUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
