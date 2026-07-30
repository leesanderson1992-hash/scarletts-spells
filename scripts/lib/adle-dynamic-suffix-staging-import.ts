/* Reviewed package JSON is validated before any guarded staging write. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

type ImportConfig = {
  profileKey: string;
  packagePath: string;
  sourceFolder: string;
  validatorVersion: string;
  stagingProjectRef: string;
  displayName: string;
  /** An explicit seed remains immutable; roster imports may omit this. */
  expectedWords?: readonly string[];
  /** Reviewed roster imports may contain more than the four lesson words. */
  minimumMemberCount?: number;
  expectedMeaningStatement?: string;
  requireReviewedFacts?: boolean;
  expectedIncludeMeaningSort?: boolean;
  expectedMeaningBinCount?: number;
};

const tokenAt = (sentence: string, index: number) =>
  sentence.trim().split(/\s+/).map((token) => token.toLowerCase().replace(/[^a-z'-]/g, "")).filter(Boolean)[index] ?? "";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function sameFact(actual: unknown, expected: unknown) {
  return actual === expected || String(actual) === String(expected);
}

export async function runDynamicSuffixStagingImport(config: ImportConfig) {
  const fail = (message: string): never => {
    throw new Error(`Dynamic suffix ${config.displayName} staging import refused: ${message}`);
  };
  const packageFile = resolve(process.cwd(), config.packagePath);
  const raw = readFileSync(packageFile, "utf8");
  const pkg = JSON.parse(raw);
  if (
    pkg?.schemaVersion !== 1
    || pkg.profile?.microSkillKey !== config.profileKey
    || pkg.profile?.includeMeaningSort !== (config.expectedIncludeMeaningSort ?? false)
    || pkg.profile?.meaningBins?.length !== (config.expectedMeaningBinCount ?? 1)
    || !Array.isArray(pkg.profile?.suffixChoices)
    || !Array.isArray(pkg.words)
    || pkg.words.length < (config.minimumMemberCount ?? 4)
  ) fail("invalid profile envelope");
  if (config.expectedMeaningStatement !== undefined && pkg.profile?.introContent?.meaningStatement !== config.expectedMeaningStatement) {
    fail("the reviewed meaning statement does not match the approved wording");
  }
  const packageWords = pkg.words.map((word: any) => word.word);
  if (new Set(packageWords).size !== packageWords.length) fail("reviewed roster contains a duplicate word");
  if (config.expectedWords && [...packageWords].sort().join("|") !== [...config.expectedWords].sort().join("|")) {
    fail("the reviewed word set changed");
  }
  const targetForms = new Set(
    pkg.profile.suffixChoices.filter((choice: any) => choice.status === "target").map((choice: any) => choice.text),
  );
  const lessonForms = new Set(pkg.words.map((word: any) => word.suffixVariant));
  if (!lessonForms.size || [...lessonForms].some((form) => !targetForms.has(form))) fail("every selected suffix form needs a target tile");
  for (const word of pkg.words) {
    const teaching = word.teaching?.parts ?? [];
    const trueParts = word.trueMorphology?.parts ?? [];
    const suffix = teaching.filter((part: any) => part.kind === "suffix");
    const facts = word.reviewedFacts;
    if (
      suffix.length !== 1
      || suffix[0].surfaceText !== word.suffixVariant
      || teaching.map((part: any) => part.surfaceText).join("") !== word.word
      || (word.teaching?.joins ?? []).length !== teaching.length - 1
      || trueParts.map((part: any) => part.surfaceText).join("") !== word.word
      || (word.trueMorphology?.joins ?? []).length !== trueParts.length - 1
      || !Array.isArray(word.trueMorphology?.transformations)
      || typeof word.trueMorphology?.notes !== "string"
      || !word.trueMorphology?.provenance
      || Object.keys(word.trueMorphology.provenance).length === 0
      || !word.semanticBaseText
      || !["base", "root"].includes(word.semanticBaseKind)
      || !word.baseMeaning
      || !word.newWordMeaning
      || tokenAt(word.dictation?.sentence ?? "", word.dictation?.targetTokenIndex) !== word.word
      || word.dictation?.audioText !== word.dictation?.sentence
      || (config.requireReviewedFacts && (!facts?.frequencyBand || !facts?.ageBand || !facts?.complexityBand
        || !facts?.syllables || !facts?.phonemeHint || !facts?.stressPattern || typeof facts?.hasSchwa !== "boolean"))
    ) fail(`invalid reviewed facts for ${word.word ?? "unknown word"}`);
  }
  if (process.argv.includes("--validate")) {
    console.log(`Dynamic suffix ${config.displayName} package validation passed.`);
    return;
  }
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  if (arg("--environment") !== "staging") fail("pass --environment staging");
  if (process.env.ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING !== "disposable-data-only") {
    fail("set ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING=disposable-data-only");
  }
  const connectionString = process.env.ADLE_DYNAMIC_SUFFIX_STAGING_DATABASE_URL;
  const stagingUrl = connectionString ? new URL(connectionString) : null;
  if (
    !stagingUrl
    || !stagingUrl.hostname.endsWith("pooler.supabase.com")
    || !stagingUrl.username.includes(config.stagingProjectRef)
  ) fail("a valid staging database URL is required");

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const protectedBefore = await client.query(
      "select (select count(*) from adle_learning_items) learning_items,"
      + "(select count(*) from daily_assignments) assignments,"
      + "(select count(*) from adle_assignment_attempt_events) evidence,"
      + "(select count(*) from adle_review_schedule_words) scheduling",
    );
    const existing = await client.query(
      "select id,production_enabled from canonical_teaching_dictionary_suffix_profiles where micro_skill_key=$1 and row_status='active' for update",
      [config.profileKey],
    );
    if (existing.rowCount) {
      if (existing.rows.some((row) => row.production_enabled === true)) fail("an active production-enabled profile cannot be replaced");
      for (const row of existing.rows) {
        await client.query("update canonical_teaching_dictionary_suffix_members set row_status='superseded' where suffix_profile_id=$1 and row_status='active'", [row.id]);
        await client.query("update canonical_teaching_dictionary_suffix_profiles set row_status='superseded' where id=$1 and row_status='active'", [row.id]);
      }
    }
    const words = await client.query(
      "select id,normalised_word from canonical_teaching_dictionary_words "
      + "where normalised_word=any($1) and row_status='active' and review_status='approved_for_first_exposure'",
      [packageWords],
    );
    if (words.rowCount !== 4) fail("every reviewed word must already be active and approved");
    const ids = new Map(words.rows.map((row) => [row.normalised_word, row.id]));
    for (const word of pkg.words) {
      const dictionary = await client.query(
        "select w.frequency_band,w.age_band,w.complexity_band,m.syllables,m.phoneme_hint,m.stress_pattern,m.has_schwa,"
        + "d.dictation_sentence,d.dictation_target_token_index,d.audio_text "
        + "from canonical_teaching_dictionary_words w "
        + "join canonical_teaching_dictionary_word_metadata m on m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure' "
        + "join canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id and d.row_status='active' and d.review_status='approved_for_first_exposure' "
        + "where w.id=$1",
        [ids.get(word.word)],
      );
      const fact = dictionary.rows[0];
      if (
        dictionary.rowCount !== 1
        || !fact.frequency_band
        || !fact.age_band
        || !fact.complexity_band
        || !fact.syllables
        || !fact.phoneme_hint
        || !fact.stress_pattern
        || typeof fact.has_schwa !== "boolean"
        || fact.dictation_sentence !== word.dictation.sentence
        || fact.audio_text !== word.dictation.audioText
        || fact.dictation_target_token_index !== word.dictation.targetTokenIndex
      ) fail(`${word.word} does not match complete reviewed dictionary facts`);
      if (word.reviewedFacts) {
        const expected = word.reviewedFacts;
        const matches = sameFact(fact.frequency_band, expected.frequencyBand)
          && sameFact(fact.age_band, expected.ageBand)
          && sameFact(fact.complexity_band, expected.complexityBand)
          && sameFact(fact.syllables, expected.syllables)
          && sameFact(fact.phoneme_hint, expected.phonemeHint)
          && sameFact(fact.stress_pattern, expected.stressPattern)
          && sameFact(fact.has_schwa, expected.hasSchwa);
        if (!matches) fail(`${word.word} reviewed band or pronunciation facts changed`);
      }
    }
    const packageHash = hash(raw);
    const batch = await client.query(
      "insert into canonical_teaching_dictionary_import_batches "
      + "(source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,"
      + "import_mode,batch_status,source_metadata,imported_by,imported_at) "
      + "values ($1,$2,$3,$4,$5,$6,'admin_import','validated',$7,$8,now()) returning id",
      [
        config.sourceFolder,
        packageHash,
        config.validatorVersion,
        { errors: 0 },
        { profiles: 1, members: pkg.words.length },
        { production_enabled: false, learner_writes: 0 },
        { package_sha256: packageHash, prohibited_writes: { production: 0, learner: 0, assignment: 0, evidence: 0, scheduling: 0 } },
        `ADLE guarded Dynamic Suffix ${config.displayName} staging importer`,
      ],
    );
    const profile = pkg.profile;
    const insertedProfile = await client.query(
      "insert into canonical_teaching_dictionary_suffix_profiles "
      + "(import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,"
      + "suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,"
      + "source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,"
      + "confidence,reviewed_by,reviewed_at) "
      + "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'active','approved_for_first_exposure',"
      + "'reviewed-staging-package.json',1,$12,$13,'internal_reviewed_seed',$14,'internal',"
      + "'Staging-only suffix profile configuration.','high','Katie Sanderson',now()) returning id",
      [
        batch.rows[0].id,
        profile.microSkillKey,
        profile.suffixLabel,
        profile.suffixText,
        profile.suffixMeaning,
        JSON.stringify(profile.meaningBins),
        profile.includeMeaningSort,
        JSON.stringify(profile.suffixChoices),
        JSON.stringify(profile.introContent),
        profile.reflection.promptKey,
        profile.reflection.promptText,
        packageHash,
        { package_sha256: packageHash },
        `Dynamic Suffix ${config.displayName} reviewed staging package`,
      ],
    );
    for (let index = 0; index < pkg.words.length; index += 1) {
      const word = pkg.words[index];
      await client.query(
        "insert into canonical_teaching_dictionary_suffix_members "
        + "(import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,"
        + "base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,"
        + "true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,"
        + "assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,"
        + "source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) "
        + "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,'active','approved_for_first_exposure',"
        + "'reviewed-staging-package.json',$18,$19,$20,'internal_reviewed_seed',$21,'internal',"
        + "'Teaching split and true morphology are independently retained.','high','Katie Sanderson',now())",
        [
          batch.rows[0].id,
          insertedProfile.rows[0].id,
          ids.get(word.word),
          word.memberRole,
          word.suffixVariant,
          word.semanticBaseText,
          word.semanticBaseKind,
          word.baseMeaning,
          word.newWordMeaning,
          word.meaningBinKey,
          JSON.stringify(word.teaching.parts),
          JSON.stringify(word.teaching.joins),
          JSON.stringify(word.trueMorphology.parts),
          JSON.stringify(word.trueMorphology.joins),
          JSON.stringify(word.trueMorphology.transformations),
          word.trueMorphology.notes,
          JSON.stringify(word.trueMorphology.provenance),
          index + 2,
          hash(JSON.stringify(word)),
          { package_sha256: packageHash, reviewed_facts: word.reviewedFacts ?? null },
          `Dynamic Suffix ${config.displayName} reviewed staging package`,
        ],
      );
    }
    const protectedAfter = await client.query(
      "select (select count(*) from adle_learning_items) learning_items,"
      + "(select count(*) from daily_assignments) assignments,"
      + "(select count(*) from adle_assignment_attempt_events) evidence,"
      + "(select count(*) from adle_review_schedule_words) scheduling",
    );
    if (JSON.stringify(protectedBefore.rows[0]) !== JSON.stringify(protectedAfter.rows[0])) {
      fail("protected learner data changed");
    }
    await client.query("commit");
    console.log(JSON.stringify({
      status: "imported_and_verified",
      profileKey: config.profileKey,
      packageSha256: packageHash,
      productionEnabled: false,
      profiles: 1,
      members: pkg.words.length,
    }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
