import { isSchwaWorkbookSkill } from "@/lib/teaching-dictionary-manager/weak-vowel-workbook";
import { loadSchwaWorkbookFacts } from "@/lib/teaching-dictionary-manager/schwa-bulk-review";
import { isHomophoneReviewSkill } from "@/lib/teaching-dictionary-manager/homophone-review-contract";
import { isCompoundWorkbookSkill, compoundWorkbookTitle } from "@/lib/teaching-dictionary-manager/compound-workbook";
import { prefillCompoundWorkbook } from "@/lib/teaching-dictionary-manager/compound-review";
import { prefillComparativeWorkbook } from "@/lib/teaching-dictionary-manager/comparative-review";
import { isComparativeReviewSkill } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { loadSpecialistBulkReview } from "@/lib/teaching-dictionary-manager/specialist-bulk-review";
import { loadLessonReviewRequests } from "@/lib/teaching-dictionary-manager/lesson-review-requests";
import { suffixReviewTitle } from "@/lib/teaching-dictionary-manager/able-ible-workbook";
import { loadIdentifyBaseReview } from "@/lib/teaching-dictionary-manager/base-word-review";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { ING_RULE_FOR_SKILL, ingStem } from "@/lib/adle/ing/contracts";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { canUpdateIngLesson, isStagingIngSkill, loadStagingIngUpdate, STAGING_ING_LESSONS } from "@/lib/teaching-dictionary-manager/ing-staging-release";
import type { MultiSenseCsvBundle } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { loadReviewedMeaningBundles, prefillReviewWorkbookMeanings } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { ING_REVIEW_BATCH_SIZE, ingReviewExportRows } from "@/lib/teaching-dictionary-manager/ing-review-export";
import { isSuffixWorkbookPilot, isIdentifyBaseReview, specialistWorkbookRoute, supportsReviewWorkbook } from "@/lib/teaching-dictionary-manager/bulk-review-scope";
import { loadAbleIbleActivePool, loadAbleIbleReview, loadAbleIbleWorkbook } from "@/lib/teaching-dictionary-manager/able-ible-review";
import { prefillReviewWorkbookFacts } from "@/lib/teaching-dictionary-manager/review-workbook-facts";
import { includeActiveWorkbookReview } from "@/lib/teaching-dictionary-manager/active-workbook-review";
import { prefixWorkbookEnabled, prefixWorkbooks } from "@/lib/teaching-dictionary-manager/prefix-workbook";
import { buildLessonPoolWorkbook, buildReviewWorkbook } from "@/lib/teaching-dictionary-manager/review-workbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdminUser();
  const params = new URL(request.url).searchParams;
  const skill = params.get("skill");
  const scope = params.get("scope") ?? "review";
  const batch = Number(params.get("batch") ?? "1");
  if (!canUpdateIngLesson() || !supportsReviewWorkbook(skill))
    return new Response("Workbook review is unavailable for this lesson.", { status: 404 });
  if (scope === "blank" && isSchwaWorkbookSkill(skill)) return downloadWorkbook(await buildReviewWorkbook({skill, title: "Schwa and weak vowels", bundles: [], notes: new Map(), families: new Map()}), `teaching-dictionary-blank-${skill}.xlsx`);
  if (scope === "blank" && isHomophoneReviewSkill(skill)) return downloadWorkbook(await buildReviewWorkbook({skill, title: "Homophones and confusable words", bundles: [], notes: new Map(), families: new Map()}), `teaching-dictionary-blank-${skill}.xlsx`);
  if (scope === "blank" && isCompoundWorkbookSkill(skill)) return downloadWorkbook(await buildReviewWorkbook({ skill, title: compoundWorkbookTitle(skill), bundles: [], notes: new Map(), families: new Map() }), `teaching-dictionary-blank-${skill}.xlsx`);
  if (scope === "blank" && isComparativeReviewSkill(skill)) {
    return downloadWorkbook(await buildReviewWorkbook({skill, title: "Comparative and superlative", bundles: [], notes: new Map(), families: new Map()}),
      `teaching-dictionary-blank-${skill}.xlsx`);
  }
  if (scope === "blank" && prefixWorkbookEnabled(skill)) return blankPrefixWorkbook(skill);
  if (scope === "blank" && isSuffixWorkbookPilot(skill)) {
    const bytes = await buildReviewWorkbook({ skill, title: suffixReviewTitle(skill), bundles: [], notes: new Map(), families: new Map() });
    return downloadWorkbook(bytes, `teaching-dictionary-blank-${skill}.xlsx`);
  }
  if (scope !== "review" && scope !== "pool")
    return new Response("This workbook export is unavailable.", { status: 404 });
  if (!Number.isSafeInteger(batch) || batch < 1)
    return new Response("Choose a valid workbook batch.", { status: 400 });

  const db = createServiceRoleClient();
  const requestedSenses = scope === "review"
    ? new Map([...await loadLessonReviewRequests(db, skill)].map(([id, row]) => [id, row.sense_id]))
    : undefined;
  if (isSuffixWorkbookPilot(skill)) {
    if (scope === "pool") {
      const { current } = await loadAbleIbleActivePool(db, skill);
      return downloadWorkbook(await buildLessonPoolWorkbook(suffixReviewTitle(skill), current),
        `teaching-dictionary-active-pool-${skill}.xlsx`);
    }
    const { rows, current } = await loadAbleIbleReview(db, skill);
    const review = await includeActiveWorkbookReview(db, skill, current, rows.map(row => ({ ...row, href: "" })));
    const batchRows = review.slice((batch - 1) * ING_REVIEW_BATCH_SIZE, batch * ING_REVIEW_BATCH_SIZE);
    if (!batchRows.length && batch !== 1) return new Response("No words need review in this batch.", { status: 404 });
    const data = await loadAbleIbleWorkbook(db, batchRows.map(row => row.id));
    const notes = new Map(batchRows.map(row => [row.id, row.note]));
    const bundles = await prefillReviewWorkbookMeanings(db, data.bundles, notes);
    const facts = await prefillReviewWorkbookFacts(db, bundles, skill);
    const bytes = await buildReviewWorkbook({ skill, title: suffixReviewTitle(skill), ...facts,
      suffixFacts: data.suffixFacts, notes, requestedSenses });
    return downloadWorkbook(bytes, `teaching-dictionary-review-${skill}-${batch}.xlsx`);
  }
  if (isIdentifyBaseReview(skill)) {
    const { rows, current } = await loadIdentifyBaseReview(db, scope === "review");
    if (scope === "pool") return downloadWorkbook(await buildLessonPoolWorkbook("Identify the Base", current),
      `teaching-dictionary-active-pool-${skill}.xlsx`);
    const review = await includeActiveWorkbookReview(db, skill, current, rows.map(row => ({ ...row, href: "" })));
    const selected = review.slice((batch - 1) * ING_REVIEW_BATCH_SIZE, batch * ING_REVIEW_BATCH_SIZE);
    if (!selected.length) return new Response("No words need review in this batch.", { status: 404 });
    const notes = new Map(selected.map(row => [row.id, row.note]));
    const bundles = await reviewBundles(db, selected, rows.flatMap(row => row.bundle ? [row.bundle] : []));
    const facts = await prefillReviewWorkbookFacts(db, await prefillReviewWorkbookMeanings(db, bundles, notes), skill);
    return downloadWorkbook(await buildReviewWorkbook({ skill, title: "Identify the Base", ...facts,
      notes, requestedSenses }),
    `teaching-dictionary-review-${skill}-${batch}.xlsx`);
  }
  if (isHomophoneReviewSkill(skill)) {
    const {rows,current,bundles,title} = await loadSpecialistBulkReview(db,skill,specialistWorkbookRoute(skill)!,scope === "review");
    if (scope === "pool") return downloadWorkbook(await buildLessonPoolWorkbook(title,current),`teaching-dictionary-active-pool-${skill}.xlsx`);
    const selected=rows.slice((batch-1)*ING_REVIEW_BATCH_SIZE,batch*ING_REVIEW_BATCH_SIZE);
    if (!selected.length && batch !== 1) return new Response("No words need review in this batch.",{status:404});
    const facts=await prefillReviewWorkbookFacts(db,bundles.filter(bundle=>selected.some(row=>row.id===bundle.wordId)),skill);
    return downloadWorkbook(await buildReviewWorkbook({skill,title,...facts,notes:new Map(selected.map(row=>[row.id,row.note])),requestedSenses}),`teaching-dictionary-review-${skill}-${batch}.xlsx`);
  }
  const specialistRoute = specialistWorkbookRoute(skill);
  if (specialistRoute) {
    const { rows, current, bundles, title } = await loadSpecialistBulkReview(db, skill, specialistRoute, scope === "review");
    if (scope === "pool") return downloadWorkbook(await buildLessonPoolWorkbook(title, current),
      `teaching-dictionary-active-pool-${skill}.xlsx`);
    const review = await includeActiveWorkbookReview(db, skill, current, rows, specialistRoute !== "weak_vowel_word_lab");
    const selected = review.slice((batch - 1) * ING_REVIEW_BATCH_SIZE, batch * ING_REVIEW_BATCH_SIZE);
    if (!selected.length) {
      if (isSchwaWorkbookSkill(skill) && batch === 1) return downloadWorkbook(await buildReviewWorkbook({skill,title,bundles:[],notes:new Map(),families:new Map()}), `teaching-dictionary-blank-${skill}.xlsx`);
      if (prefixWorkbookEnabled(skill) && batch === 1) return blankPrefixWorkbook(skill);
      return new Response("No words need review in this batch.", { status: 404 });
    }
    const notes = new Map(selected.map(row => [row.id, row.note]));
    const reviewed = await prefillReviewWorkbookMeanings(db, await reviewBundles(db, selected, bundles), notes);
    const compound = isCompoundWorkbookSkill(skill) ? await prefillCompoundWorkbook(db, skill, reviewed) : null;
    const prepared = compound?.bundles ?? (isComparativeReviewSkill(skill) ? await prefillComparativeWorkbook(db, skill, reviewed) : reviewed);
    const facts = await prefillReviewWorkbookFacts(db, prepared, skill,
      new Map(current.map(word => [word.canonicalWordId, word.base])));
    return downloadWorkbook(await buildReviewWorkbook({ skill, title, ...facts, notes, requestedSenses, schwaFacts: isSchwaWorkbookSkill(skill) ? await loadSchwaWorkbookFacts(db, skill, selected.map(row => row.id)) : undefined, compoundFacts: compound?.compoundFacts }),
    `teaching-dictionary-review-${skill}-${batch}.xlsx`);
  }
  if (!isStagingIngSkill(skill)) return new Response("Workbook review is unavailable for this lesson.", { status: 404 });
  if (scope === "pool") {
    const { current } = await loadStagingIngUpdate(db, skill, "pool");
    const bytes = await buildLessonPoolWorkbook(STAGING_ING_LESSONS[skill], current);
    return downloadWorkbook(bytes, `teaching-dictionary-active-pool-${skill}.xlsx`);
  }

  const rule = ING_RULE_FOR_SKILL[skill];
  const spellingChange = {
    regular: "",
    drop_e: "Drop the final e before adding -ing.",
    double_final_consonant: "Double the final consonant before adding -ing.",
    ie_to_y: "Change the final ie to y before adding -ing.",
  }[rule];
  const update = await loadStagingIngUpdate(db, skill, "pool");
  const active = new Map(update.current.map(word => [word.canonicalWordId, word]));
  const review = await includeActiveWorkbookReview(db, skill, update.current, ingReviewExportRows(update)
    .map(row => ({ id: row.wordId, word: row.displayWord, note: row.note, href: "" })));
  const rows = review.slice((batch - 1) * ING_REVIEW_BATCH_SIZE, batch * ING_REVIEW_BATCH_SIZE)
    .map(row => ({ wordId: row.id, active: active.get(row.id), note: row.note }));
  const ids = rows.map(row => row.wordId);
  if (!ids.length) return new Response("No words need review in this batch.", { status: 404 });

  const [reviewed, wordRows] = await Promise.all([
    loadReviewedMeaningBundles(db, ids),
    db.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", ids),
  ]);
  if (wordRows.error) throw new Error("Could not load the review workbook facts.");

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

    const senseId = `${word.display_word}-review`;
    const base = old?.base ?? "";
    const visible = ingStem(base, rule);
    const sentence = old?.dictationSentence ?? "";
    const tokens = sentence.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
    const index = tokens.findIndex(token => token.toLowerCase() === word.display_word.toLowerCase());
    bundles.push({ wordId: id, displayWord: word.display_word, sourceSenseReviewedAt: "",
      senseSet: { pronunciations: [{ id: "standard", ipa: old?.pronunciationIpa || "",
        spokenSyllableCount: null, stressPattern: "" }],
        senses: [{ id: senseId, definition: old?.meaning ?? "", partOfSpeech: old ? "verb" : "",
          pronunciationId: "standard", ...(index >= 0 ? { dictationSentence: sentence, dictationTargetTokenIndex: index } : {}) }] },
      analyses: old ? [{ senseId, parts: [
        { id: "base", kind: "base", sourceText: base, surfaceText: visible, gloss: "", displayRange: { start: 0, end: visible.length } },
        { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "action in progress",
          displayRange: { start: visible.length, end: visible.length + 3 } },
      ], joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
      transformations: base === visible ? [] : [{ type: "base_spelling_change", sourcePartId: "base",
        sourceText: base, surfaceText: visible, explanation: spellingChange }],
      wordSum: `${base} + ing → ${word.display_word}`, familyKey: "", componentPartId: "base",
      relationshipKind: "regular_inflection", requestedSkillKeys: [] }] : [],
    });
  }
  const facts = await prefillReviewWorkbookFacts(db, await prefillReviewWorkbookMeanings(db, bundles, notes), skill);
  return workbookResponse(skill, batch, { ...facts, notes, requestedSenses });
}

async function reviewBundles(db: ReturnType<typeof createServiceRoleClient>, rows: { id: string; word: string }[],
  existing: MultiSenseCsvBundle[]) {
  const byId = new Map(existing.map(bundle => [bundle.wordId, bundle]));
  const additional = await loadReviewedMeaningBundles(db, rows.filter(row => !byId.has(row.id)).map(row => row.id));
  for (const bundle of additional) byId.set(bundle.wordId, bundle);
  return rows.map((row): MultiSenseCsvBundle => byId.get(row.id) ?? {
    wordId: row.id, displayWord: row.word, sourceSenseReviewedAt: "", analyses: [],
    senseSet: { pronunciations: [], senses: [{ id: "review", definition: "", partOfSpeech: "", pronunciationId: null }] },
  });
}

async function workbookResponse(skill: keyof typeof STAGING_ING_LESSONS, batch: number,
  data: Pick<Parameters<typeof buildReviewWorkbook>[0], "bundles" | "notes" | "families" | "requestedSenses" | "wordPartPrefills">) {
  const bytes = await buildReviewWorkbook({ skill, title: STAGING_ING_LESSONS[skill], ...data });
  return downloadWorkbook(bytes, `teaching-dictionary-review-${skill}-${batch}.xlsx`);
}

async function blankPrefixWorkbook(skill: keyof typeof prefixWorkbooks) {
  const bytes = await buildReviewWorkbook({ skill, title: prefixWorkbooks[skill].title, bundles: [], notes: new Map(), families: new Map() });
  return downloadWorkbook(bytes, `teaching-dictionary-blank-${skill}.xlsx`);
}

function downloadWorkbook(bytes: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  } });
}
