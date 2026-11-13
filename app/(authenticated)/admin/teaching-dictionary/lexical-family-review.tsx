import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normaliseWord } from "@/lib/teaching-dictionary-manager/contracts";
import { approvedLexicalBaseTexts, lexicalMorphologyReady } from "@/lib/teaching-dictionary-manager/lexical-family-candidates";
import { partOfSpeechOptions } from "@/lib/teaching-dictionary-manager/part-of-speech-options";
import { createLexicalFreeBaseFamily, reviewLexicalFamilyMember, reviewSenseFamilyLink } from "./lexical-family-actions";

type Word = { id: string; normalisedWord: string; displayWord: string; dialectCode: string; rowStatus: string; reviewStatus: string };
type Morphology = { id: string; rawPartOfSpeech: string; analysisStatus: string; reviewStatus: string; parts: unknown; joins: unknown[];
  transformations: unknown[]; wordSum: string | null };
type Props = { word: Word; morphology: Morphology | null; error?: string; lexicalFamilyKey?: string;
  senses: { id: string; definition: string; partOfSpeech: string }[];
  senseLinks: { sense_id: string; family_key: string; component_part_id: string }[] };
const input = "w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
const label = "grid gap-1 text-sm";

function Info({ text }: { text: string }) {
  return <span className="group relative inline-flex align-middle" tabIndex={0} aria-label={text}>
    <span aria-hidden="true" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-xs">i</span>
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-10 hidden w-60 rounded bg-white p-2 text-xs shadow group-hover:block group-focus:block">{text}</span>
  </span>;
}

export async function BaseFamilyReview({ word, morphology, error, lexicalFamilyKey, senses, senseLinks }: Props) {
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
  const [familiesResult, baseMorphologyResult, baseSensesResult] = await Promise.all([
    db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,revision,base_lemma,base_kind,base_meaning,review_status")
      .in("base_lemma", [...new Set([...baseTexts, ...candidateBases.map((base) => base.normalised_word)])])
      .order("revision", { ascending: false }),
    candidateBases.length ? db.from("canonical_teaching_dictionary_word_morphology")
      .select("id,canonical_word_id,raw_morpholex_pos,morphology_parts,morphology_joins,morphology_transformations,word_sum,analysis_status,review_status")
      .in("canonical_word_id", candidateBases.map((base) => base.id)).eq("row_status", "active")
      .eq("analysis_status", "approved").eq("review_status", "approved_for_first_exposure")
      : Promise.resolve({ data: [], error: null }),
    candidateBases.length ? db.from("teaching_dictionary_reviewed_sense_sets")
      .select("canonical_word_id,sense_set")
      .in("canonical_word_id", candidateBases.map((base) => base.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (familiesResult.error || baseMorphologyResult.error || baseSensesResult.error)
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
    .select("family_key,revision,word_part_of_speech").eq("canonical_word_id", word.id)
    .in("family_key", families.map((family) => family.family_key)) : { data: [], error: null };
  if (memberships.error) throw new Error("LEXICAL_FAMILY_MEMBERSHIP_READ_FAILED");
  const memberKeys = new Set((memberships.data ?? []).filter((member) =>
    latest.get(member.family_key)?.revision === member.revision).map((member) => member.family_key));
  const memberPos = new Map((memberships.data ?? []).filter((member) =>
    latest.get(member.family_key)?.revision === member.revision)
    .map(member => [member.family_key, member.word_part_of_speech]));
  const baseMorphology = new Map((baseMorphologyResult.data ?? []).map((row) => [row.canonical_word_id, row]));
  const baseSenses = new Map((baseSensesResult.data ?? []).map(row => [row.canonical_word_id,
    (row.sense_set as { senses?: Props["senses"] } | null)?.senses ?? []]));
  const currentPos = morphology?.rawPartOfSpeech ?? "";
  return <section id="base-family-review" className="order-2 grid gap-4 rounded-lg border border-[var(--border)] bg-white p-4 scroll-mt-6">
    <div><h2 className="text-lg font-semibold">Dictionary word family</h2>
      <p className="text-sm">Choose a reviewed base or root family. Lesson skills and activities are set in the lesson sections.</p></div>
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-900">{error.replaceAll("_", " ")}</p>}
    {families.map((family) => {
      const member = memberKeys.has(family.family_key);
      const ready = lexicalMorphologyReady(morphology, word.displayWord, family.base_lemma,
        family.base_kind === "bound_root" ? "bound_root" : "free_base");
      const componentParts = parts.filter(part => part.kind === (family.base_kind === "bound_root" ? "root" : "base")
        && normaliseWord(String(part.sourceText ?? "")) === family.base_lemma
        && part.gloss === family.base_meaning && typeof part.id === "string" && part.id);
      const currentLinks = senseLinks.filter(link => link.family_key === family.family_key);
      const eligibleSenses = senses.filter(sense => sense.partOfSpeech === memberPos.get(family.family_key));
      return <div key={family.family_key} className="grid gap-2 rounded border p-3 text-sm">
        <strong>{family.family_key} · {family.base_kind === "bound_root" ? "root" : "base"} · {family.base_meaning}</strong>
        <p>{member ? "This word is a member." : ready ? "Reviewed morphology supports this family." :
          "Review the matching base or root and word parts in Overview before joining."}</p>
        {!member && ready && (!senses.length || !componentParts.length) &&
          <p>Approve a meaning and its matching typed base or root part in Overview before joining.</p>}
        {member && <div className="grid gap-2 border-t pt-2">
          <h3 className="font-semibold">Meanings linked to this family <Info text="Choose the reviewed meaning and the base or root component it uses. A word may link different meanings or components to different families." /></h3>
          {currentLinks.length ? <ul className="grid gap-1">{currentLinks.map(link =>
            <li key={`${link.sense_id}:${link.component_part_id}`} className="flex flex-wrap items-center gap-2">
              <span>{senses.find(sense => sense.id === link.sense_id)?.definition ?? link.sense_id} · {link.component_part_id}</span>
              <form action={reviewSenseFamilyLink}>
                <input type="hidden" name="word_id" value={word.id} />
                <input type="hidden" name="family_key" value={family.family_key} />
                <input type="hidden" name="sense_id" value={link.sense_id} />
                <input type="hidden" name="component_part_id" value={link.component_part_id} />
                <input type="hidden" name="link_action" value="withdraw" />
                <button className="underline">Remove link</button>
              </form>
            </li>)}</ul> : <p>No reviewed meaning is linked yet.</p>}
          {eligibleSenses.length && componentParts.length ? <form action={reviewSenseFamilyLink} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="word_id" value={word.id} />
            <input type="hidden" name="family_key" value={family.family_key} />
            <input type="hidden" name="link_action" value="approve" />
            <label className={label}>Reviewed meaning <Info text="Select the meaning to which this family applies." />
              <select name="sense_id" className={input} required><option value="">Choose meaning</option>
                {eligibleSenses.map(sense => <option key={sense.id} value={sense.id}>{sense.definition} · {sense.partOfSpeech}</option>)}</select></label>
            <label className={label}>Base or root part <Info text="Select the reviewed part of this word supplied by the family." />
              <select name="component_part_id" className={input} required><option value="">Choose part</option>
                {componentParts.map(part => <option key={String(part.id)} value={String(part.id)}>
                  {String(part.sourceText)} · {String(part.gloss)}</option>)}</select></label>
            <button className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white sm:col-span-2">
              Approve meaning link</button>
          </form> : <p>Approve a meaning and matching typed word parts in Overview to link this family.</p>}
        </div>}
        {!member && ready && family.review_status === "approved" && senses.length > 0 && componentParts.length > 0 &&
          <form action={reviewLexicalFamilyMember} className="grid gap-2">
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
          <label className={label}>Reviewed meaning <Info text="Choose the meaning this family link will teach. Its definition supplies the family member meaning." />
            <select name="sense_id" className={input} required><option value="">Choose meaning</option>
              {senses.map(sense => <option key={sense.id} value={sense.id}>{sense.definition} · {sense.partOfSpeech}</option>)}</select></label>
          <label className={label}>Base or root part <Info text="Choose the reviewed part this family contributes to the word." />
            <select name="component_part_id" className={input} required><option value="">Choose part</option>
              {componentParts.map(part => <option key={String(part.id)} value={String(part.id)}>
                {String(part.sourceText)} · {String(part.gloss)}</option>)}</select></label>
          <button className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white">Approve membership and meaning link</button>
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
        const reviewedBaseSenses = baseSenses.get(base.id) ?? [];
        const componentParts = parts.filter(part => part.kind === "base"
          && normaliseWord(String(part.sourceText ?? "")) === base.normalised_word
          && typeof part.id === "string" && part.id);
        const usableBaseSenses = reviewedBaseSenses.filter(sense =>
          (!baseMorph?.raw_morpholex_pos || sense.partOfSpeech === baseMorph.raw_morpholex_pos)
          && componentParts.some(part => part.gloss === sense.definition)
          && Array.isArray(baseMorph?.morphology_parts)
          && baseMorph.morphology_parts.some((part: Record<string, unknown>) =>
            part.kind === "base" && part.gloss === sense.definition));
        const usableWordSenses = senses.filter(sense => !currentPos || sense.partOfSpeech === currentPos);
        return <div key={base.id} className="rounded border p-3 text-sm"><strong>{base.display_word}</strong>
          {!baseReady || !memberReady || !usableBaseSenses.length || !usableWordSenses.length || !componentParts.length
            ? <p>Review both meanings and the matching base parts in Overview before creating this family.</p> :
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
              <label className={label}>Base meaning <Info text="Choose the reviewed Overview meaning that supplies this family's base and part meaning." />
                <select name="base_sense_id" className={input} required><option value="">Choose meaning</option>
                  {usableBaseSenses.map(sense => <option key={sense.id} value={sense.id}>{sense.definition} · {sense.partOfSpeech}</option>)}</select></label>
              <label className={label}>Word meaning <Info text="Choose the reviewed Overview meaning this family membership teaches." />
                <select name="word_sense_id" className={input} required><option value="">Choose meaning</option>
                  {usableWordSenses.map(sense => <option key={sense.id} value={sense.id}>{sense.definition} · {sense.partOfSpeech}</option>)}</select></label>
              <label className={label}>Base part <Info text="Choose the reviewed base component of this word; its meaning must match the selected base meaning." />
                <select name="component_part_id" className={input} required><option value="">Choose part</option>
                  {componentParts.map(part => <option key={String(part.id)} value={String(part.id)}>
                    {String(part.sourceText)} · {String(part.gloss)}</option>)}</select></label>
              <button className="w-fit rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white">Create and approve family</button>
            </form>}
        </div>;
      })}
      {!candidateBases.length && <p className="text-sm">No approved free base is identified. <Link href="#td-canonical-parts" className="underline">Review the word parts in Overview</Link>.</p>}
    </div>
  </section>;
}
