import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normaliseWord } from "@/lib/teaching-dictionary-manager/contracts";
import { approvedLexicalBaseTexts, lexicalMorphologyReady } from "@/lib/teaching-dictionary-manager/lexical-family-candidates";
import { partOfSpeechOptions } from "@/lib/teaching-dictionary-manager/part-of-speech-options";
import { createLexicalFreeBaseFamily, reviewLexicalFamilyMember } from "./lexical-family-actions";

type Word = { id: string; normalisedWord: string; displayWord: string; dialectCode: string; rowStatus: string; reviewStatus: string };
type Morphology = { id: string; analysisStatus: string; reviewStatus: string; parts: unknown; joins: unknown[];
  transformations: unknown[]; wordSum: string | null };
type Props = { word: Word; morphology: Morphology | null; meaning: string; error?: string; lexicalFamilyKey?: string };
const input = "w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
const label = "grid gap-1 text-sm";

function Info({ text }: { text: string }) {
  return <span className="group relative inline-flex align-middle" tabIndex={0} aria-label={text}>
    <span aria-hidden="true" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-xs">i</span>
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-10 hidden w-60 rounded bg-white p-2 text-xs shadow group-hover:block group-focus:block">{text}</span>
  </span>;
}

export async function BaseFamilyReview({ word, morphology, meaning, error, lexicalFamilyKey }: Props) {
  const db = createServiceRoleClient();
  const parts = Array.isArray(morphology?.parts) ? morphology.parts as Record<string, unknown>[] : [];
  const baseTexts = approvedLexicalBaseTexts(morphology);
  const baseWordsResult = await db.from("canonical_teaching_dictionary_words")
    .select("id,normalised_word,display_word,review_status,row_status")
    .in("normalised_word", [...new Set([word.normalisedWord, ...baseTexts])])
    .eq("dialect_code", word.dialectCode).eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure");
  if (baseWordsResult.error) throw new Error("LEXICAL_FAMILY_BASE_WORDS_READ_FAILED");
  const baseWords = baseWordsResult.data ?? [];
  const candidateBases = baseWords.filter((base) =>
    parts.some((part) => ["base", "free_base"].includes(String(part.kind ?? part.type ?? part.partType)) &&
      normaliseWord(String(part.sourceText ?? part.text ?? "")) === base.normalised_word));
  const [familiesResult, baseMorphologyResult, definitionsResult] = await Promise.all([
    db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,revision,base_lemma,base_kind,base_meaning,review_status")
      .in("base_lemma", [...new Set([...baseTexts, ...candidateBases.map((base) => base.normalised_word)])])
      .order("revision", { ascending: false }),
    candidateBases.length ? db.from("canonical_teaching_dictionary_word_morphology")
      .select("id,canonical_word_id,raw_morpholex_pos,morphology_parts,morphology_joins,morphology_transformations,word_sum,analysis_status,review_status")
      .in("canonical_word_id", candidateBases.map((base) => base.id)).eq("row_status", "active")
      .eq("analysis_status", "approved").eq("review_status", "approved_for_first_exposure")
      : Promise.resolve({ data: [], error: null }),
    candidateBases.length ? db.from("teaching_dictionary_definition_versions")
      .select("canonical_word_id,definition,published_at")
      .in("canonical_word_id", candidateBases.map((base) => base.id))
      .is("route_id", null).order("published_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (familiesResult.error || baseMorphologyResult.error || definitionsResult.error)
    throw new Error("LEXICAL_FAMILY_REVIEW_READ_FAILED");
  const latest = new Map<string, NonNullable<typeof familiesResult.data>[number]>();
  for (const family of familiesResult.data ?? []) if (!latest.has(family.family_key)) latest.set(family.family_key, family);
  if (lexicalFamilyKey && !latest.has(lexicalFamilyKey)) {
    const selected = await db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,revision,base_lemma,base_kind,base_meaning,review_status")
      .eq("family_key", lexicalFamilyKey).order("revision", { ascending: false }).limit(1).maybeSingle();
    if (selected.error) throw new Error("LEXICAL_FAMILY_SELECTED_READ_FAILED");
    if (selected.data) latest.set(selected.data.family_key, selected.data);
  }
  const families = [...latest.values()];
  const memberships = families.length ? await db.from("canonical_teaching_dictionary_lexical_base_family_members")
    .select("family_key,revision").eq("canonical_word_id", word.id)
    .in("family_key", families.map((family) => family.family_key)) : { data: [], error: null };
  if (memberships.error) throw new Error("LEXICAL_FAMILY_MEMBERSHIP_READ_FAILED");
  const memberKeys = new Set((memberships.data ?? []).filter((member) =>
    latest.get(member.family_key)?.revision === member.revision).map((member) => member.family_key));
  const baseMorphology = new Map((baseMorphologyResult.data ?? []).map((row) => [row.canonical_word_id, row]));
  const baseMeaning = new Map<string, string>();
  for (const row of definitionsResult.data ?? []) if (!baseMeaning.has(row.canonical_word_id))
    baseMeaning.set(row.canonical_word_id, row.definition);
  const currentPos = baseMorphology.get(word.id)?.raw_morpholex_pos ?? "";
  return <section id="base-family-review" className="order-2 grid gap-4 rounded-lg border border-[var(--border)] bg-white p-4 scroll-mt-6">
    <div><h2 className="text-lg font-semibold">Dictionary word family</h2>
      <p className="text-sm">Choose a reviewed base or root family. Lesson skills and activities are set in the lesson sections.</p></div>
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-900">{error.replaceAll("_", " ")}</p>}
    {families.map((family) => {
      const member = memberKeys.has(family.family_key);
      const ready = lexicalMorphologyReady(morphology, word.displayWord, family.base_lemma,
        family.base_kind === "bound_root" ? "bound_root" : "free_base");
      return <div key={family.family_key} className="grid gap-2 rounded border p-3 text-sm">
        <strong>{family.family_key} · {family.base_kind === "bound_root" ? "root" : "base"} · {family.base_meaning}</strong>
        <p>{member ? "This word is a member." : ready ? "Reviewed morphology supports this family." :
          "Review the matching base or root and word parts in Overview before joining."}</p>
        {!member && ready && family.review_status === "approved" && <form action={reviewLexicalFamilyMember} className="grid gap-2">
          <input type="hidden" name="word_id" value={word.id} /><input type="hidden" name="family_key" value={family.family_key} />
          <input type="hidden" name="expected_revision" value={family.revision} /><input type="hidden" name="morphology_id" value={morphology?.id ?? ""} />
          <label className={label}>Relationship <Info text="Choose how this word is related to the selected base or root." />
            <select name="relationship_kind" className={input} required><option value="regular_inflection">Regular inflection</option>
              <option value="irregular_inflection">Irregular inflection</option><option value="derived">Derived word</option>
              <option value="contraction">Contraction</option><option value="historical_relative">Historical relative</option></select></label>
          <label className={label}>Part of speech <Info text="Choose the grammatical role of this word in the family." />
            <select name="word_part_of_speech" className={input} defaultValue={currentPos} required>
              <option value="">Choose part of speech</option>{partOfSpeechOptions(currentPos).map((option) =>
                <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className={label}>Meaning in this family <Info text="Use the reviewed dictionary meaning, or clarify this word’s sense in the selected family." />
            <input name="intended_meaning" className={input} defaultValue={meaning} required /></label>
          <button className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white">Approve family membership</button>
        </form>}
      </div>;
    })}
    <div className="grid gap-3"><h3 className="font-semibold">Create a free-base family</h3>
      {candidateBases.map((base) => {
        const baseMorph = baseMorphology.get(base.id);
        const baseReady = baseMorph && lexicalMorphologyReady({ analysisStatus: baseMorph.analysis_status,
          reviewStatus: baseMorph.review_status, parts: baseMorph.morphology_parts, joins: baseMorph.morphology_joins,
          transformations: baseMorph.morphology_transformations, wordSum: baseMorph.word_sum }, base.display_word, base.normalised_word);
        const memberReady = lexicalMorphologyReady(morphology, word.displayWord, base.normalised_word);
        return <div key={base.id} className="rounded border p-3 text-sm"><strong>{base.display_word}</strong>
          {!baseReady || !memberReady ? <p>Review this base and the word’s matching parts in Overview before creating its family.</p> :
            <form action={createLexicalFreeBaseFamily} className="mt-2 grid gap-2">
              <input type="hidden" name="word_id" value={word.id} /><input type="hidden" name="base_word_id" value={base.id} />
              <input type="hidden" name="base_morphology_id" value={baseMorph.id} />
              <input type="hidden" name="word_morphology_id" value={morphology?.id ?? ""} />
              {base.id === word.id ? <input type="hidden" name="relationship_kind" value="free_base" /> :
                <label className={label}>Relationship <Info text="Choose how this word is formed from the base." />
                  <select name="relationship_kind" className={input} defaultValue="derived" required>
                    <option value="regular_inflection">Regular inflection</option><option value="irregular_inflection">Irregular inflection</option>
                    <option value="derived">Derived word</option><option value="contraction">Contraction</option>
                    <option value="historical_relative">Historical relative</option></select></label>}
              <label className={label}>Base part of speech <Info text="Choose the base word's grammatical role. This becomes part of the family identity." />
                <select name="base_part_of_speech" className={input} defaultValue={baseMorph.raw_morpholex_pos ?? ""} required>
                  <option value="">Choose part of speech</option>{partOfSpeechOptions(baseMorph.raw_morpholex_pos ?? "").map((option) =>
                    <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className={label}>Word part of speech <Info text="Choose this word's grammatical role in the family." />
                <select name="word_part_of_speech" className={input} defaultValue={currentPos} required>
                  <option value="">Choose part of speech</option>{partOfSpeechOptions(currentPos).map((option) =>
                    <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className={label}>Base meaning <Info text="Use the reviewed meaning of the independent base word." />
                <input name="base_meaning" className={input} defaultValue={baseMeaning.get(base.id) ?? (base.id === word.id ? meaning : "")} required /></label>
              <label className={label}>Word meaning <Info text="Use the reviewed dictionary meaning for this word." />
                <input name="word_meaning" className={input} defaultValue={meaning} required /></label>
              <button className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white">Create and approve family</button>
            </form>}
        </div>;
      })}
      {!candidateBases.length && <p className="text-sm">No approved free base is identified. <Link href="#td-canonical-parts" className="underline">Review the word parts in Overview</Link>.</p>}
    </div>
  </section>;
}
