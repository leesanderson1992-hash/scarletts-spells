import { createClient } from "@supabase/supabase-js";
import { resolveClosedCompoundBrowserSmokeConfig } from "./lib/adle-closed-compound-browser-smoke-config";

const sourceAssignmentId = "c2313ee8-5da2-4bea-bc24-798c2ad5c5cf";
const { mode, password, serviceRoleKey, url } =
  resolveClosedCompoundBrowserSmokeConfig(process.env, process.argv[2]);

const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function setup() {
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
    const { data: assignment, error: assignmentError } = await db.from("daily_assignments").insert({ ...source, child_id: childId, parent_user_id: parentId, status: "pending" }).select("id").single();
    if (assignmentError || !assignment) throw new Error(`Clone browser-smoke assignment: ${assignmentError?.message}`);
    const { data: items, error: itemsError } = await db.from("assignment_items").select("domain_module,item_type,source_type,source_entity_id,learning_item_id,template_key,target_word,prompt_data,expected_answer,position,metadata").eq("daily_assignment_id", sourceAssignmentId).order("position");
    if (itemsError || !items?.length) throw new Error(`Load closed-compound items: ${itemsError?.message ?? "none"}`);
    const { error: cloneError } = await db.from("assignment_items").insert(items.map((item) => ({ ...item, daily_assignment_id: assignment.id, child_id: childId, parent_user_id: parentId, status: "ready" })));
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
