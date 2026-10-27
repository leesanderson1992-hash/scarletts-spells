import Link from "next/link";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  BASE_WORD_SKILLS, reviewedMorphologyFamilyCandidates, virtualFamilyCandidate,
  type FamilyCandidateWord, type FamilyCandidateMorphology,
} from "@/lib/teaching-dictionary-manager/base-family-candidates";
import { approvedLexicalBaseTexts, lexicalMorphologyReady } from "@/lib/teaching-dictionary-manager/lexical-family-candidates";
import { reviewBaseFamilyMember, withdrawBaseFamilyMember } from "./base-family-actions";
import { reviewLexicalFamilyMember } from "./lexical-family-actions";
import type { ReactNode } from "react";

// This editor is returned on demand by a Server Function. Native controls avoid
// introducing a client reference absent from the initial page's RSC manifest.
function FamilySubmitButton({ children, pendingLabel, className }: { children: ReactNode; pendingLabel: string; className: string }) {
  return <button type="submit" data-pending-label={pendingLabel} className={className}>{children}</button>;
}

type Word = FamilyCandidateWord;
type Morphology = FamilyCandidateMorphology & { id: string; joins: unknown[]; transformations: unknown[] };
type LegacyFamily = { id: string; base_family_key: string; base_word_id: string; base_meaning: string };
type Definition = { id: string; family_key: string; base_word_id: string; base_meaning: string };
type LexicalFamily = { family_key: string; revision: number; base_lemma: string; review_status: string };

const inputClass = "w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
const labelClass = "grid gap-1 text-sm";

function FormFields({ word, baseWordId, baseLabel, proposedKey, legacy, baseMeaning, morphology, meaning }: {
  word: Word; baseWordId: string; baseLabel: string; proposedKey: string; legacy: LegacyFamily | null; baseMeaning: string;
  morphology: Morphology | null; meaning: string;
}) {
  const isBase = word.id === baseWordId;
  const parts = isBase ? [{ id: "base", kind: "base", sourceText: word.normalisedWord,
      surfaceText: word.displayWord, gloss: baseMeaning, displayRange: { start: 0, end: word.displayWord.length } }]
    : morphology?.analysisStatus === "approved" && morphology.reviewStatus === "approved_for_first_exposure"
      ? morphology.parts : [];
  const joins = isBase ? [] : morphology?.analysisStatus === "approved" ? morphology.joins : [];
  const governedMorphology = !isBase && Boolean(morphology?.analysisStatus === "approved" && morphology.reviewStatus === "approved_for_first_exposure");
  return <form action={reviewBaseFamilyMember} className="grid gap-3 rounded border border-[var(--border)] p-3">
    <input type="hidden" name="request_id" value={randomUUID()} />
    <input type="hidden" name="word_id" value={word.id} />
    <input type="hidden" name="base_word_id" value={baseWordId} />
    <input type="hidden" name="legacy_family_id" value={legacy?.id ?? ""} />
    <input type="hidden" name="morphology_id" value={governedMorphology ? morphology?.id ?? "" : ""} />
    <p className="text-sm font-semibold">{legacy?.base_family_key ?? `${proposedKey} candidate`} · {word.displayWord}</p>
    <p className="text-xs">Proposed base: {baseLabel}</p>
    <p className="text-xs text-[color:var(--mid)]">{governedMorphology ? "Approved dictionary morphology" : isBase ? "Virtual standalone base" : "Manual relationship review"}. Approval adds a reviewed source; an ADLE release is still required.</p>
    <label className={labelClass}>Base meaning<input className={inputClass} name="base_meaning" defaultValue={baseMeaning} readOnly={Boolean(legacy)} required /></label>
    <label className={labelClass}>Micro skill<select className={inputClass} name="skill_key" required>{BASE_WORD_SKILLS.map((skill) => <option key={skill} value={skill}>{skill.replace("D4_MOR_BASE_WORDS_", "").replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
    <label className={labelClass}>Child-friendly word meaning<input className={inputClass} name="child_meaning" defaultValue={meaning} required /></label>
    <label className={labelClass}>Reviewed word sum<input className={inputClass} name="word_sum" defaultValue={isBase ? word.displayWord : morphology?.wordSum || ""} required /></label>
    <label className={labelClass}>Morphology parts JSON<textarea className={inputClass} name="parts_json" rows={4} defaultValue={JSON.stringify(parts, null, 2)} required /></label>
    <label className={labelClass}>Joins JSON<textarea className={inputClass} name="joins_json" rows={2} defaultValue={JSON.stringify(joins, null, 2)} required /></label>
    <input type="hidden" name="transformations_json" value="[]" />
    <label className={labelClass}>Why this base and skill fit<input className={inputClass} name="review_note" required /></label>
    <FamilySubmitButton pendingLabel="Recording review…" className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white">Approve relationship and skill</FamilySubmitButton>
  </form>;
}

async function BaseFamilyReviewContent({ word, morphology, meaning, error, manualFamilyId }: {
  word: Word; morphology: Morphology | null; meaning: string; error?: string; manualFamilyId?: string;
}) {
  const db = createServiceRoleClient();
  let familyMorphology = morphology?.analysisStatus === "approved" &&
    morphology.reviewStatus === "approved_for_first_exposure" ? morphology : null;
  if (!familyMorphology) {
    const approvedSource = await db.from("canonical_teaching_dictionary_word_morphology")
      .select("id,morphology_parts,morphology_joins,morphology_transformations,word_sum,analysis_status,review_status")
      .eq("canonical_word_id", word.id).eq("row_status", "active")
      .eq("analysis_status", "approved").eq("review_status", "approved_for_first_exposure")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (approvedSource.error) throw new Error("BASE_FAMILY_MORPHOLOGY_READ_FAILED");
    familyMorphology = approvedSource.data ? { id: approvedSource.data.id,
      parts: approvedSource.data.morphology_parts, joins: approvedSource.data.morphology_joins ?? [],
      transformations: approvedSource.data.morphology_transformations ?? [],
      wordSum: approvedSource.data.word_sum, analysisStatus: approvedSource.data.analysis_status,
      reviewStatus: approvedSource.data.review_status } : null;
  }
  const baseTexts = Array.isArray(familyMorphology?.parts) ? familyMorphology.parts.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const part = raw as Record<string, unknown>;
    return part.kind === "base" && typeof part.sourceText === "string" ? [part.sourceText.toLowerCase()] : [];
  }) : [];
  const lexicalBaseTexts = approvedLexicalBaseTexts(familyMorphology);
  const [baseWordsResult, legacyResult, definitionsResult, reviewedResult, derivedMorphologyResult, lexicalResult] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,normalised_word,display_word,dialect_code,row_status,review_status")
      .in("normalised_word", [...new Set([word.normalisedWord, ...baseTexts, ...lexicalBaseTexts])]).eq("dialect_code", word.dialectCode),
    db.from("canonical_teaching_dictionary_base_word_families")
      .select("id,base_family_key,base_word_id,base_meaning").eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure").order("base_family_key"),
    db.from("teaching_dictionary_base_family_definitions")
      .select("id,family_key,base_word_id,base_meaning").order("family_key"),
    db.from("teaching_dictionary_base_family_member_reviews")
      .select("id,canonical_word_id,micro_skill_key,legacy_family_id,definition_id,word_sum,child_friendly_meaning,reviewed_at")
      .eq("canonical_word_id", word.id).order("reviewed_at", { ascending: false }).limit(50),
    db.from("canonical_teaching_dictionary_word_morphology")
      .select("id,canonical_word_id,morphology_parts,morphology_joins,word_sum,analysis_status,review_status")
      .eq("row_status", "active").eq("analysis_status", "approved")
      .eq("review_status", "approved_for_first_exposure")
      .filter("morphology_parts", "cs", JSON.stringify([{ kind: "base", sourceText: word.normalisedWord }])).limit(100),
    lexicalBaseTexts.length ? db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,revision,base_lemma,review_status")
      .in("base_lemma", lexicalBaseTexts).eq("base_kind", "free_base")
      .order("revision", { ascending: false }) : Promise.resolve({ data: [] as LexicalFamily[], error: null }),
  ]);
  for (const [table, failure] of [
    ["canonical_teaching_dictionary_words", baseWordsResult.error],
    ["canonical_teaching_dictionary_base_word_families", legacyResult.error],
    ["teaching_dictionary_base_family_definitions", definitionsResult.error],
    ["teaching_dictionary_base_family_member_reviews", reviewedResult.error],
    ["canonical_teaching_dictionary_word_morphology", derivedMorphologyResult.error],
    ["canonical_teaching_dictionary_lexical_base_families", lexicalResult.error],
  ] as const) if (failure) {
    console.error("BASE_FAMILY_REVIEW_READ_FAILED", { wordId: word.id, table, code: failure.code, message: failure.message });
    throw new Error("BASE_FAMILY_REVIEW_READ_FAILED");
  }
  const baseWords: Word[] = (baseWordsResult.data ?? []).map((row) => ({ id: row.id, normalisedWord: row.normalised_word,
    displayWord: row.display_word, dialectCode: row.dialect_code, rowStatus: row.row_status, reviewStatus: row.review_status }));
  const latestLexical = new Map<string, LexicalFamily>();
  for (const family of lexicalResult.data ?? []) if (!latestLexical.has(family.family_key)) latestLexical.set(family.family_key, family);
  const lexicalFamilies = [...latestLexical.values()];
  const lexicalMemberships = lexicalFamilies.length ? await db.from("canonical_teaching_dictionary_lexical_base_family_members")
    .select("family_key,revision").eq("canonical_word_id", word.id)
    .in("family_key", lexicalFamilies.map((family) => family.family_key)) : { data: [], error: null };
  if (lexicalMemberships.error) throw new Error("LEXICAL_FAMILY_MEMBERSHIP_READ_FAILED");
  const lexicalMemberKeys = new Set((lexicalMemberships.data ?? [])
    .filter((member) => latestLexical.get(member.family_key)?.revision === member.revision)
    .map((member) => member.family_key));
  const virtual = virtualFamilyCandidate(word);
  const suggestions = reviewedMorphologyFamilyCandidates(word, familyMorphology, baseWords);
  const candidates = [...(virtual ? [virtual] : []), ...suggestions];
  const legacy = legacyResult.data as LegacyFamily[];
  const definitions = definitionsResult.data as Definition[];
  const baseDefinitions = candidates.length ? await db.from("teaching_dictionary_definition_versions")
    .select("canonical_word_id,definition,published_at").in("canonical_word_id", candidates.map((item) => item.baseWordId))
    .is("route_id", null).order("published_at", { ascending: false }) : { data: [], error: null };
  if (baseDefinitions.error) throw new Error("BASE_FAMILY_BASE_MEANING_READ_FAILED");
  const meaningByBase = new Map<string, string>();
  for (const row of baseDefinitions.data ?? []) if (!meaningByBase.has(row.canonical_word_id))
    meaningByBase.set(row.canonical_word_id, row.definition);
  const reviewed = reviewedResult.data ?? [];
  const withdrawals = reviewed.length ? await db.from("teaching_dictionary_base_family_member_withdrawals")
    .select("review_id").in("review_id", reviewed.map((row) => row.id)) : { data: [], error: null };
  if (withdrawals.error) throw new Error("BASE_FAMILY_WITHDRAWAL_READ_FAILED");
  const withdrawn = new Set((withdrawals.data ?? []).map((row) => row.review_id));
  const derivedMorphology = (derivedMorphologyResult.data ?? []).filter((row) => row.canonical_word_id !== word.id);
  const derivedIds = [...new Set(derivedMorphology.map((row) => row.canonical_word_id))];
  const derivedWords = derivedIds.length ? await db.from("canonical_teaching_dictionary_words")
    .select("id,display_word,dialect_code,row_status,review_status").in("id", derivedIds) : { data: [], error: null };
  if (derivedWords.error) throw new Error("BASE_FAMILY_DERIVED_WORD_READ_FAILED");
  const derivedById = new Map((derivedWords.data ?? [])
    .filter((row) => row.dialect_code === word.dialectCode && row.row_status === "active" && row.review_status === "approved_for_first_exposure")
    .map((row) => [row.id, row.display_word]));
  return <section id="base-family-review" className="order-2 grid gap-4 rounded-lg border border-[var(--border)] bg-white p-4 scroll-mt-6">
    <div><h2 className="text-lg font-semibold">Base-word family review</h2>
      <p className="text-sm">Dictionary lexical families and ADLE lesson families have separate approvals. A lexical membership does not assign a micro-skill or place the word in a lesson.</p>
      <p className="text-xs">{derivedById.size} approved words name this word as a base. <Link href="/admin/teaching-dictionary/base-families" className="underline">View released family counts</Link></p>
    </div>
    {lexicalFamilies.length > 0 && <div className="grid gap-3 rounded border border-[var(--border)] p-3 text-sm">
      <h3 className="font-semibold">Dictionary lexical family</h3>
      {lexicalFamilies.map((family) => {
        const member = lexicalMemberKeys.has(family.family_key);
        const morphologyReady = lexicalMorphologyReady(familyMorphology, word.displayWord, family.base_lemma);
        return <div key={family.family_key} className="grid gap-2 border-t border-[var(--border)] pt-2">
          <p><strong>{family.family_key}</strong> · revision {family.revision} · {family.review_status}
            {member ? " · this word is a member" : " · this word is not a member"}</p>
          {!member && family.review_status !== "approved" && <p>A family revision is awaiting review. Finish or withdraw it before another member can be added.</p>}
          {!member && family.review_status === "approved" && !morphologyReady && <p>
            This family is available, but the word&apos;s approved morphology lacks the exact base and surface parts required for a new lexical revision.
            Review the word sum and parts in <Link href="#td-overview" className="underline">Overview</Link> first.
          </p>}
          {!member && family.review_status === "approved" && morphologyReady && <form action={reviewLexicalFamilyMember} className="grid gap-2">
            <input type="hidden" name="word_id" value={word.id} />
            <input type="hidden" name="family_key" value={family.family_key} />
            <input type="hidden" name="expected_revision" value={family.revision} />
            <input type="hidden" name="morphology_id" value={familyMorphology?.id ?? ""} />
            <label className={labelClass}>Relationship<select name="relationship_kind" className={inputClass} required>
              <option value="regular_inflection">Regular inflection</option><option value="irregular_inflection">Irregular inflection</option>
              <option value="derived">Derived word</option><option value="contraction">Contraction</option>
              <option value="historical_relative">Historical relative</option>
            </select></label>
            <label className={labelClass}>Word part of speech<input name="word_part_of_speech" className={inputClass} defaultValue="noun" required /></label>
            <label className={labelClass}>Meaning in this family<input name="intended_meaning" className={inputClass} defaultValue={meaning} required /></label>
            <label className={labelClass}>Why this relationship is correct<input name="review_note" className={inputClass} required /></label>
            <FamilySubmitButton pendingLabel="Approving lexical family revision…" className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white">Approve lexical member in new revision</FamilySubmitButton>
          </form>}
        </div>;
      })}
    </div>}
    {derivedById.size > 0 && <div className="text-sm"><h3 className="font-semibold">Possible members from approved morphology</h3>
      <ul className="grid gap-1">{derivedMorphology.filter((row) => derivedById.has(row.canonical_word_id)).map((row) => <li key={row.id}>
        <Link href={`/admin/teaching-dictionary/${row.canonical_word_id}#base-family-review`} className="underline">{derivedById.get(row.canonical_word_id)}</Link>
        {" · "}{row.word_sum}{" · relationship and skill review needed"}
      </li>)}</ul></div>}
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-900">{error.replaceAll("_", " ")}</p>}
    {reviewed.length > 0 && <div className="text-sm"><h3 className="font-semibold">Recorded reviews</h3><ul className="grid gap-2">{reviewed.map((row) => <li key={row.id} className="rounded border border-[var(--border)] p-2">
      <strong>{legacy.find((family) => family.id === row.legacy_family_id)?.base_family_key ?? definitions.find((family) => family.id === row.definition_id)?.family_key ?? "Reviewed family"}</strong>
      {" · "}{row.micro_skill_key} · {row.word_sum} · {row.child_friendly_meaning} · {new Date(row.reviewed_at).toLocaleDateString("en-GB")} · {withdrawn.has(row.id) ? "withdrawn" : "reviewed source"}
      {!withdrawn.has(row.id) && <form action={withdrawBaseFamilyMember} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="word_id" value={word.id} /><input type="hidden" name="review_id" value={row.id} />
        <input className={inputClass} name="reason" aria-label="Reason for withdrawal" placeholder="Reason for withdrawal" required />
        <FamilySubmitButton pendingLabel="Withdrawing…" className="rounded border border-[var(--border)] px-2 py-1 text-sm">Withdraw for future releases</FamilySubmitButton>
      </form>}
    </li>)}</ul></div>}
    <div className="grid gap-3"><h3 className="font-semibold">ADLE Base Word lesson family suggestions</h3>
      {candidates.flatMap((candidate) => {
        const matches = legacy.filter((family) => family.base_word_id === candidate.baseWordId);
        const existing = definitions.filter((family) => family.base_word_id === candidate.baseWordId);
        const baseMeaning = matches[0]?.base_meaning ?? existing[0]?.base_meaning ?? meaningByBase.get(candidate.baseWordId) ?? "";
        const baseLabel = baseWords.find((base) => base.id === candidate.baseWordId)?.displayWord ?? candidate.proposedKey;
        return matches.length ? [...matches.map((family) => <FormFields key={`${candidate.baseWordId}:${family.id}`}
          word={word} baseWordId={candidate.baseWordId} baseLabel={baseLabel} proposedKey={candidate.proposedKey} legacy={family} baseMeaning={family.base_meaning}
          morphology={familyMorphology} meaning={meaning} />),
          <details key={`${candidate.baseWordId}:new-sense`}><summary className="cursor-pointer text-sm font-semibold">Create a separate meaning for this base</summary>
            <div className="mt-2"><FormFields word={word} baseWordId={candidate.baseWordId} baseLabel={baseLabel} proposedKey={candidate.proposedKey} legacy={null}
              baseMeaning="" morphology={familyMorphology} meaning={meaning} /></div></details>] : [<FormFields key={`${candidate.baseWordId}:new`}
          word={word} baseWordId={candidate.baseWordId} baseLabel={baseLabel} proposedKey={candidate.proposedKey} legacy={null} baseMeaning={baseMeaning}
          morphology={familyMorphology} meaning={meaning} />];
      })}
    </div>
    <details open={Boolean(manualFamilyId)}><summary className="cursor-pointer text-sm font-semibold">Link an ADLE lesson family manually when morphology has no suggestion</summary>
      <p className="mt-2 text-xs">This picker contains ADLE Base Word families. Dictionary lexical families appear above. Choose a reviewed lesson family, then supply the word sum and parts that show its base.</p>
      <form method="get" className="mt-2 flex flex-wrap gap-2"><select name="manual_family" className={inputClass} defaultValue={manualFamilyId ?? ""} required>
        <option value="">Choose a family</option>{legacy.map((family) => <option key={family.id} value={family.id}>{family.base_family_key} · {family.base_meaning}</option>)}
      </select><button className="rounded border border-[var(--border)] px-3 py-1 text-sm font-semibold">Open family</button></form>
      {legacy.filter((family) => family.id === manualFamilyId).map((family) => <div className="mt-3" key={`manual:${family.id}`}><FormFields
        word={word} baseWordId={family.base_word_id} baseLabel={family.base_family_key} proposedKey={family.base_family_key} legacy={family} baseMeaning={family.base_meaning}
        morphology={null} meaning={meaning} /></div>)}
    </details>
  </section>;
}

export async function BaseFamilyReview(props: Parameters<typeof BaseFamilyReviewContent>[0]) {
  try {
    return await BaseFamilyReviewContent(props);
  } catch (error) {
    console.error("BASE_FAMILY_REVIEW_UNAVAILABLE", { wordId: props.word.id, error });
    return <section id="base-family-review" className="order-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" role="alert">
      <h2 className="font-semibold">Base-word family review is temporarily unavailable</h2>
      <p>The dictionary facts are still available. Family review actions are paused until this section is restored.</p>
    </section>;
  }
}
