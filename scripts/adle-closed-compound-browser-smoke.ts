import { createClient } from "@supabase/supabase-js";
import { getDateOnly } from "../lib/courses/progress";
import { validateClosedCompoundLessonPayload } from "../lib/adle/morphology/closed-compound-word-lab";
import { resolveClosedCompoundBrowserSmokeConfig } from "./lib/adle-closed-compound-browser-smoke-config";

const sourceAssignmentId = "e0b1272e-1fd5-4c9d-b741-0f8d320e4c37";
const { mode, password, serviceRoleKey, url } =
  resolveClosedCompoundBrowserSmokeConfig(process.env, process.argv[2]);

const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function setup() {
  const planDate = getDateOnly();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `adle-closed-browser-${suffix}@example.test`;
  const { data: user, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError || !user.user) throw new Error(`Create browser-smoke parent: ${userError?.message}`);
  const parentId = user.user.id;
  try {
    const { data: child, error: childError } = await db.from("children").insert({ parent_user_id: parentId, first_name: "Closed Compound QA" }).select("id").single();
    if (childError || !child) throw new Error(`Create browser-smoke child: ${childError?.message}`);
    const childId = child.id as string;
    const { data: source, error: sourceError } = await db.from("daily_assignments").select("assignment_date,title,instructions,target_words,word_family_id,review_words,focus_word,selected_family_slug,assignment_generation_source,source_learning_item_ids").eq("id", sourceAssignmentId).single();
    if (sourceError || !source) throw new Error(`Load approved closed-compound assignment: ${sourceError?.message}`);
    const { data: assignment, error: assignmentError } = await db.from("daily_assignments").insert({
      ...source,
      assignment_date: planDate,
      assignment_generation_source: "adle_composer_v1",
      child_id: childId,
      parent_user_id: parentId,
      status: "pending",
      title: "ADLE Daily Plan",
    }).select("id").single();
    if (assignmentError || !assignment) throw new Error(`Clone browser-smoke assignment: ${assignmentError?.message}`);
    const { data: items, error: itemsError } = await db.from("assignment_items").select("domain_module,item_type,source_type,source_entity_id,learning_item_id,template_key,target_word,prompt_data,expected_answer,position,metadata").eq("daily_assignment_id", sourceAssignmentId).order("position");
    if (itemsError || !items?.length) throw new Error(`Load closed-compound items: ${itemsError?.message ?? "none"}`);
    const roots = items.filter((item) => item.prompt_data?.closedCompoundActivityId === "intro-root");
    if (
      roots.length !== 1 ||
      !validateClosedCompoundLessonPayload(roots[0]?.prompt_data?.closedCompoundLesson)
    ) {
      throw new Error("Approved closed-compound browser-smoke source payload is invalid.");
    }
    const { error: cloneError } = await db.from("assignment_items").insert(items.map((item) => ({
      ...item,
      daily_assignment_id: assignment.id,
      child_id: childId,
      parent_user_id: parentId,
      source_entity_id: `adle-closed-compound-browser-smoke:${assignment.id}:${item.position}`,
      status: "ready",
      metadata: { ...(item.metadata ?? {}), planDate },
    })));
    if (cloneError) throw new Error(`Clone browser-smoke items: ${cloneError.message}`);
    console.log(JSON.stringify({ parentId, childId, assignmentId: assignment.id, email }));
  } catch (error) { await db.from("children").delete().eq("parent_user_id", parentId); await db.auth.admin.deleteUser(parentId); throw error; }
}

async function cleanup() {
  const parentId = process.env.ADLE_BROWSER_SMOKE_PARENT_ID; const childId = process.env.ADLE_BROWSER_SMOKE_CHILD_ID;
  if (!parentId || !childId) throw new Error("Set ADLE_BROWSER_SMOKE_PARENT_ID and ADLE_BROWSER_SMOKE_CHILD_ID for cleanup.");
  const { error: childError } = await db.from("children").delete().eq("id", childId); if (childError) throw childError;
  const { error: userError } = await db.auth.admin.deleteUser(parentId); if (userError) throw userError;
  console.log("closed compound browser smoke cleanup passed");
}

(mode === "setup" ? setup() : cleanup()).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
