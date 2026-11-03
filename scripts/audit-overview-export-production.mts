/** Read-only size and review-shape audit before full-dictionary CSV rollout. */
import pg from "pg";
import { emptyMetadata, emptyMorphology, publicationBlockers, WORD_METADATA_FIELDS,
  type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { MAX_DICTIONARY_CSV_BYTES } from "../lib/teaching-dictionary-manager/csv";
import { OVERVIEW_EXPORT_BATCH_SIZE, projectOverviewCsvRows, renderOverviewCsv } from
  "../lib/teaching-dictionary-manager/overview-csv";
import { selectOverviewFamilies, type OverviewFamily, type OverviewRoot } from
  "../lib/teaching-dictionary-manager/overview-family-selection";

delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_READ_ONLY_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await db.connect();
  await db.query("begin read only");
  const facts = await db.query(`select to_jsonb(w) word,to_jsonb(md) metadata,
    to_jsonb(ds) dictation,to_jsonb(m) morphology,d.definition
    from canonical_teaching_dictionary_words w
    left join lateral (select * from canonical_teaching_dictionary_word_metadata
      where canonical_word_id=w.id and row_status='active'
      order by created_at desc,id desc limit 1) md on true
    left join lateral (select * from canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id=w.id and row_status='active'
      order by created_at desc,id desc limit 1) ds on true
    left join lateral (select * from canonical_teaching_dictionary_word_morphology
      where canonical_word_id=w.id and row_status='active'
      order by created_at desc,id desc limit 1) m on true
    left join lateral (select definition from teaching_dictionary_definition_versions
      where canonical_word_id=w.id and route_id is null
      order by published_at desc,id desc limit 1) d on true
    where w.row_status='active' and w.dialect_code='en-GB' order by w.id`);
  const memberships = await db.query(`select m.canonical_word_id,f.family_key,f.revision,
    f.base_kind,f.base_part_of_speech,f.base_lemma,f.base_meaning,
    to_jsonb(r) root_metadata
    from canonical_teaching_dictionary_lexical_base_family_members m
    join canonical_teaching_dictionary_lexical_base_families f
      on f.family_key=m.family_key and f.revision=m.revision
    left join canonical_teaching_dictionary_lexical_root_metadata r
      on r.family_key=f.family_key and r.revision=f.revision
    where f.review_status='approved' and not exists (
      select 1 from canonical_teaching_dictionary_lexical_base_families newer
      where newer.family_key=f.family_key and newer.revision>f.revision)`);
  const pairs = await db.query(`select distinct p.canonical_word_id,p.micro_skill_key
    from adle_reviewed_word_skill_pairs p
    join adle_reviewed_word_skill_releases release on release.id=p.release_id
      and release.environment_key='production'
    where not exists(select 1 from adle_reviewed_word_skill_withdrawals x
      where x.release_id=release.id)
      and not exists(select 1 from teaching_dictionary_pair_latest_decisions d
        where d.environment_key='production' and d.canonical_word_id=p.canonical_word_id
          and d.micro_skill_key=p.micro_skill_key and d.action='deassign')`);
  const latest = new Map<string, OverviewFamily>();
  const roots = new Map<string, OverviewRoot>();
  const familyCount = new Map<string, number>();
  for (const item of memberships.rows) {
    const id = String(item.canonical_word_id);
    familyCount.set(id, (familyCount.get(id) ?? 0) + 1);
    latest.set(item.family_key, { family_key: item.family_key, revision: item.revision,
      base_kind: item.base_kind, base_part_of_speech: item.base_part_of_speech,
      base_lemma: item.base_lemma, base_meaning: item.base_meaning, review_status: "approved" });
    if (item.root_metadata) roots.set(`${item.family_key}:${item.revision}`, item.root_metadata);
  }
  const familyByWord = selectOverviewFamilies(facts.rows.map((item) => String(item.word?.id ?? "")),
    memberships.rows, latest, roots, new Set());
  const skills = new Map<string, string[]>();
  for (const pair of pairs.rows) skills.set(pair.canonical_word_id,
    [...(skills.get(pair.canonical_word_id) ?? []), pair.micro_skill_key]);
  const source = facts.rows.map((item) => {
    const w = item.word ?? {};
    const md = item.metadata ?? {};
    const ds = item.dictation ?? {};
    const m = item.morphology ?? {};
    const common: Record<string, unknown> = {
      ...w, canonical_word_id: w.id, definition: item.definition ?? "",
      affected_micro_skills: (skills.get(w.id) ?? []).sort().join("; "),
      dictation_sentence: ds.dictation_sentence ?? "",
      dictation_target_token_index: ds.dictation_target_token_index ?? 0,
      ...Object.fromEntries(WORD_METADATA_FIELDS.map((key) => [key, md[key] ?? ""])),
      written_syllable_breakdown: md.written_syllable_breakdown ?? "",
      has_schwa: md.has_schwa == null ? "" : String(md.has_schwa),
      raw_morpholex_segmentation: m.raw_morpholex_segmentation ?? "",
      raw_morpholex_pos: m.raw_morpholex_pos ?? "",
      morphology_parts: m.morphology_parts ?? [], feature_keys: m.feature_keys ?? [],
      morphology_joins: m.morphology_joins ?? [],
      __morphology_transformations: m.morphology_transformations ?? [],
      transformation_notes: m.transformation_notes ?? "", word_sum: m.word_sum ?? "",
      analysis_status: m.analysis_status ?? "in_review", morphology_review_notes: m.review_notes ?? "",
      missing_facts: "",
    };
    const payload: WordDraftPayload = {
      displayWord: String(common.display_word ?? ""), definition: String(common.definition),
      dictationSentence: String(common.dictation_sentence),
      dictationTargetTokenIndex: Number(common.dictation_target_token_index),
      ageBand: String(common.age_band ?? ""), frequencyBand: String(common.frequency_band ?? ""),
      complexityBand: String(common.complexity_band ?? ""),
      metadata: { ...emptyMetadata(),
        ...Object.fromEntries(WORD_METADATA_FIELDS.map((key) => [key, String(common[key] ?? "")])),
        has_schwa: md.has_schwa === true ? true : md.has_schwa === false ? false : null },
      canonicalMorphology: { ...emptyMorphology(), rawSegmentation: String(common.raw_morpholex_segmentation),
        rawPartOfSpeech: String(common.raw_morpholex_pos), parts: m.morphology_parts ?? [],
        featureKeys: m.feature_keys ?? [], joins: m.morphology_joins ?? [],
        transformationNotes: String(common.transformation_notes), wordSum: String(common.word_sum),
        analysisStatus: common.analysis_status as WordDraftPayload["canonicalMorphology"]["analysisStatus"],
        reviewNotes: String(common.morphology_review_notes) },
      provenance: { sourceCategory: w.source_category, sourceName: w.source_name ?? "",
        sourceUrl: w.source_url ?? "", sourceLicence: w.source_licence ?? "",
        sourceUseNote: w.source_use_note ?? "", confidence: w.confidence },
      skillKeys: skills.get(w.id) ?? [], routeContents: [],
    };
    common.__overview_missing_facts = publicationBlockers(payload, w.normalised_word).join("; ");
    return common;
  });
  const rows = projectOverviewCsvRows(source, familyByWord);
  const bytes = Buffer.byteLength(renderOverviewCsv(rows), "utf8");
  const batchBytes = Array.from({ length: Math.ceil(rows.length / OVERVIEW_EXPORT_BATCH_SIZE) },
    (_, index) => Buffer.byteLength(renderOverviewCsv(rows.slice(index * OVERVIEW_EXPORT_BATCH_SIZE,
      (index + 1) * OVERVIEW_EXPORT_BATCH_SIZE)), "utf8"));
  console.log(JSON.stringify({ activeWords: facts.rows.length, overviewRows: rows.length,
    csvBytes: bytes, importLimitBytes: MAX_DICTIONARY_CSV_BYTES,
    marginBytes: MAX_DICTIONARY_CSV_BYTES - bytes,
    batchBytes,
    canonicalMorphologyRows: rows.filter((row) => row.analysis_status === "approved").length,
    reviewNeededRows: rows.filter((row) => row.analysis_status === "in_review").length,
    ambiguousCurrentFamilies: [...familyCount.values()].filter((count) => count > 1).length,
    currentFamilyMembershipRows: memberships.rows.length, effectiveWordSkillPairs: pairs.rows.length }, null, 2));
  if (bytes > MAX_DICTIONARY_CSV_BYTES || batchBytes.some((count) => count > MAX_DICTIONARY_CSV_BYTES))
    throw new Error("OVERVIEW_CSV_EXCEEDS_IMPORT_LIMIT");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
