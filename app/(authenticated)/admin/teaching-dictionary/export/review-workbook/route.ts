import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { ING_RULE_FOR_SKILL, ingStem } from "@/lib/adle/ing/contracts";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { canUpdateIngLesson, isStagingIngSkill, loadActiveIngRelease, loadStagingIngUpdate, STAGING_ING_LESSONS } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import type { MultiSenseCsvBundle } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { ING_REVIEW_BATCH_SIZE, ingReviewExportRows } from "@/lib/teaching-dictionary-manager/ing-review-export";
import { buildLessonPoolWorkbook, buildReviewWorkbook } from "@/lib/teaching-dictionary-manager/review-workbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdminUser();
  const params = new URL(request.url).searchParams;
  const skill = params.get("skill");
  const scope = params.get("scope") ?? "review";
  const batch = Number(params.get("batch") ?? "1");
  if (!canUpdateIngLesson() || !isStagingIngSkill(skill))
    return new Response("Workbook review is available for the four -ing lessons.", { status: 404 });
  if (scope !== "review" && scope !== "pool")
    return new Response("This workbook export is unavailable.", { status: 404 });
  if (!Number.isSafeInteger(batch) || batch < 1)
    return new Response("Choose a valid workbook batch.", { status: 400 });

  const db = createServiceRoleClient();
  if (scope === "pool") {
    const { released } = await loadActiveIngRelease(db, skill);
    const bytes = await buildLessonPoolWorkbook(STAGING_ING_LESSONS[skill], released.filter(word => word.microSkillKey === skill));
    return downloadWorkbook(bytes, `teaching-dictionary-active-pool-${skill}.xlsx`);
  }

  const rule = ING_RULE_FOR_SKILL[skill];
  const spellingChange = {
    regular: "",
    drop_e: "Drop the final e before adding -ing.",
    double_final_consonant: "Double the final consonant before adding -ing.",
    ie_to_y: "Change the final ie to y before adding -ing.",
  }[rule];
  const update = await loadStagingIngUpdate(db, skill);
  const rows = ingReviewExportRows(update)
    .slice((batch - 1) * ING_REVIEW_BATCH_SIZE, batch * ING_REVIEW_BATCH_SIZE);
  const ids = rows.map(row => row.wordId);
  if (!ids.length) return new Response("No words need review in this batch.", { status: 404 });

  const [reviewed, wordRows, metadata] = await Promise.all([
    loadReviewedMeaningBundles(db, ids),
    db.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", ids),
    db.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,phoneme_hint,syllables,stress_pattern")
      .in("canonical_word_id", ids).eq("row_status", "active").order("created_at", { ascending: false }),
  ]);
  if (wordRows.error || metadata.error) throw new Error("Could not load the review workbook facts.");
  const baseForms = [...new Set([...rows.flatMap(row => row.active ? [row.active.base] : []),
    ...reviewed.flatMap(bundle => bundle.analyses.flatMap(analysis =>
      analysis.parts.filter(part => part.kind === "base").map(part => part.sourceText)))])];
  const familyRows = baseForms.length ? await db.from("teaching_dictionary_families_with_current_meaning")
    .select("family_key,base_lemma,base_meaning").eq("review_status", "approved").in("base_lemma", baseForms)
    .order("revision", { ascending: false }) : null;
  if (familyRows?.error) throw new Error("Could not load approved word families.");
  const families = new Map<string, string[]>();
  for (const row of familyRows?.data ?? []) {
    const keys = families.get(row.base_lemma) ?? [];
    const label = `${row.base_lemma} · ${row.base_meaning} | ${row.family_key}`;
    if (!keys.some(option => option.endsWith(` | ${row.family_key}`))) keys.push(label);
    families.set(row.base_lemma, keys);
  }

  const bundles: MultiSenseCsvBundle[] = [];
  const notes = new Map<string, string>();
  for (const { wordId: id, active: old, note } of rows) {
    const word = wordRows.data.find(row => row.id === id);
    if (!word) continue;
    const current = reviewed.find(bundle => bundle.wordId === id);
    notes.set(id, current ? note : `${note} Existing lesson facts are suggestions.`);
    if (current) {
      bundles.push(current);
      continue;
    }

    const facts = metadata.data.find(row => row.canonical_word_id === id);
    const senseId = `${word.display_word}-review`;
    const base = old?.base ?? "";
    const visible = ingStem(base, rule);
    const gloss = familyRows?.data.find(row => row.base_lemma === base)?.base_meaning ?? "";
    const sentence = old?.dictationSentence ?? "";
    const tokens = sentence.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
    const index = tokens.findIndex(token => token.toLowerCase() === word.display_word.toLowerCase());
    bundles.push({ wordId: id, displayWord: word.display_word, sourceSenseReviewedAt: "",
      senseSet: { pronunciations: [{ id: "standard", ipa: old?.pronunciationIpa || facts?.phoneme_hint || "",
        spokenSyllableCount: Number(facts?.syllables) || 0, stressPattern: facts?.stress_pattern ?? "" }],
        senses: [{ id: senseId, definition: old?.meaning ?? "", partOfSpeech: old ? "verb" : "",
          pronunciationId: "standard", ...(index >= 0 ? { dictationSentence: sentence, dictationTargetTokenIndex: index } : {}) }] },
      analyses: old ? [{ senseId, parts: [
        { id: "base", kind: "base", sourceText: base, surfaceText: visible, gloss, displayRange: { start: 0, end: visible.length } },
        { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "action in progress",
          displayRange: { start: visible.length, end: visible.length + 3 } },
      ], joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
      transformations: base === visible ? [] : [{ type: "base_spelling_change", sourcePartId: "base",
        sourceText: base, surfaceText: visible, explanation: spellingChange }],
      wordSum: `${base} + ing → ${word.display_word}`, familyKey: "", componentPartId: "base",
      relationshipKind: "regular_inflection", requestedSkillKeys: [] }] : [],
    });
  }
  return workbookResponse(skill, batch, { bundles, notes, families });
}

async function workbookResponse(skill: keyof typeof STAGING_ING_LESSONS, batch: number,
  data: Pick<Parameters<typeof buildReviewWorkbook>[0], "bundles" | "notes" | "families">) {
  const bytes = await buildReviewWorkbook({ skill, title: STAGING_ING_LESSONS[skill], ...data });
  return downloadWorkbook(bytes, `teaching-dictionary-review-${skill}-${batch}.xlsx`);
}

function downloadWorkbook(bytes: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  } });
}
