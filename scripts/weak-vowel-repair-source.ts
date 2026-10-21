import pg from "pg";
import { adaptExplicitReviewedAssociations, adaptGenericSupport, adaptResolverMappings } from "../lib/adle/word-skill-relationships/adapters";
import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import type { RawWordSkillRelationshipFact } from "../lib/adle/word-skill-relationships/contracts";
import { publishedAssociationsToPhaseB, type PublishedAssociation } from "../lib/writing-engine/whole-writing/knowledge";
import { WEAK_VOWEL_SKILLS, buildWeakVowelRepairRows, type RepairSource, type SourceRow } from "../lib/teaching-dictionary-manager/weak-vowel-repair";

function str(value: unknown): string { return value == null ? "" : String(value); }

/** No learner data, RPCs, locks, migrations or write statements are permitted here. */
export async function loadWeakVowelRepairInventory(connectionString: string, environment: "local" | "staging" | "production") {
  const db = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
  await db.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const keys = Object.keys(WEAK_VOWEL_SKILLS);
    const read = async (query: string, values: unknown[] = []) => (await db.query<SourceRow>(query, values)).rows;
    const skills = await read("SELECT micro_skill_key,is_active FROM public.micro_skill_catalog WHERE micro_skill_key=ANY($1) ORDER BY micro_skill_key", [keys]);
    if (skills.length !== keys.length) throw new Error("WEAK_VOWEL_SKILL_CATALOG_INCOMPLETE");
    const words = await read("SELECT id,word_key,normalised_word,display_word,dialect_code,row_status,review_status,source_row_hash,frequency_band,age_band,complexity_band FROM public.canonical_teaching_dictionary_words ORDER BY id");
    const supports = await read("SELECT id,canonical_word_id,micro_skill_key,support_role,row_status,review_status,import_batch_id,source_row_hash FROM public.canonical_teaching_dictionary_word_support WHERE micro_skill_key=ANY($1) ORDER BY id", [keys]);
    const mappings = await read("SELECT id,correct_spelling_normalized,misspelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status,normalization_version FROM public.spelling_canonical_mappings WHERE micro_skill_key=ANY($1) ORDER BY id", [keys]);
    const mappingEvents = await read("SELECT id,mapping_id FROM public.spelling_canonical_mapping_events WHERE mapping_id=ANY($1::uuid[]) AND event_type='resolver_visibility_enabled' AND new_resolver_visibility_status='visible' ORDER BY id", [mappings.map(row => row.id)]);
    const batches = await read("SELECT id,batch_status,source_commit,source_folder_sha256 FROM public.canonical_teaching_dictionary_import_batches WHERE id=ANY($1::uuid[]) ORDER BY id", [[...new Set(supports.map(row => row.import_batch_id))]]);
    const pairs = await read("SELECT p.* FROM public.adle_reviewed_word_skill_pairs p JOIN public.adle_reviewed_word_skill_releases r ON r.id=p.release_id WHERE p.micro_skill_key=ANY($1) AND r.environment_key=$2 ORDER BY p.id", [keys, environment]);
    const releases = await read("SELECT id,release_key,reviewed_by FROM public.adle_reviewed_word_skill_releases WHERE id=ANY($1::uuid[]) ORDER BY id", [[...new Set(pairs.map(row => row.release_id))]]);
    const withdrawals = await read("SELECT release_id FROM public.adle_reviewed_word_skill_withdrawals WHERE release_id=ANY($1::uuid[]) ORDER BY release_id", [releases.map(row => row.id)]);
    const decisions = await read("SELECT id,canonical_word_id,micro_skill_key,action FROM public.teaching_dictionary_pair_latest_decisions WHERE environment_key=$1 AND micro_skill_key=ANY($2) ORDER BY id", [environment, keys]);
    const batchById = new Map(batches.map(row => [str(row.id), row]));
    const wordById = new Map(words.map(row => [str(row.id), row]));
    const activeWordBySpelling = new Map<string, SourceRow[]>();
    for (const word of words.filter(word => word.row_status === "active")) {
      const spelling = str(word.normalised_word);
      activeWordBySpelling.set(spelling, [...(activeWordBySpelling.get(spelling) ?? []), word]);
    }
    const facts: RawWordSkillRelationshipFact[] = [
      ...adaptGenericSupport(supports.map(row => {
        const batch = batchById.get(str(row.import_batch_id));
        return { id: str(row.id), canonicalWordId: str(row.canonical_word_id), microSkillKey: str(row.micro_skill_key), supportRole: str(row.support_role),
          rowStatus: str(row.row_status), reviewStatus: str(row.review_status), importBatchId: str(row.import_batch_id),
          importBatchStatus: str(batch?.batch_status), sourceRowHash: str(row.source_row_hash),
          sourceCommit: batch?.source_commit == null ? null : str(batch.source_commit), sourceFolderSha256: batch?.source_folder_sha256 == null ? null : str(batch.source_folder_sha256) };
      })),
      ...adaptResolverMappings(mappings.map(row => {
        const matches = activeWordBySpelling.get(str(row.correct_spelling_normalized)) ?? [];
        return { id: str(row.id), canonicalWordId: matches.length ? str(matches[0].id) : `unresolved-word:${str(row.correct_spelling_normalized)}`,
          microSkillKey: str(row.micro_skill_key), misspellingNormalized: str(row.misspelling_normalized), correctSpellingNormalized: str(row.correct_spelling_normalized),
          mappingStatus: str(row.mapping_status), resolverVisibilityStatus: str(row.resolver_visibility_status), normalizationVersion: str(row.normalization_version),
          visibilityEnableEventIds: mappingEvents.filter(event => event.mapping_id === row.id).map(event => str(event.id)) };
      })),
      ...adaptExplicitReviewedAssociations(publishedAssociationsToPhaseB(pairs as PublishedAssociation[],
        new Map(releases.map(row => [str(row.id), { release_key: str(row.release_key), reviewed_by: str(row.reviewed_by) }])),
        new Set(withdrawals.map(row => str(row.release_id))))),
    ];
    const authority = readCanonicalWordSkillRelationships({
      words: words.map(word => ({ canonicalWordId: str(word.id), normalisedWord: str(word.normalised_word),
        state: word.row_status === "active" ? "active" : "inactive",
        identityStable: word.row_status !== "active" || activeWordBySpelling.get(str(word.normalised_word))?.length === 1 })),
      microSkills: skills.map(skill => ({ microSkillKey: str(skill.micro_skill_key), state: skill.is_active === true ? "active" : "inactive", identityStable: true })),
      facts, pairDecisions: decisions.map(row => ({ id: str(row.id), canonicalWordId: str(row.canonical_word_id), microSkillKey: str(row.micro_skill_key), action: row.action as "deassign" | "restore" })),
      adapterAuthorityEstablished: true,
    });
    const allPairs = new Map<string, { wordId: string; skill: string }>();
    for (const row of [...facts.map(fact => ({ wordId: fact.canonicalWordId, skill: fact.microSkillKey })), ...decisions.map(row => ({ wordId: str(row.canonical_word_id), skill: str(row.micro_skill_key) }))]) {
      if (!row.wordId || !row.skill) throw new Error("REPAIR_SOURCE_PAIR_IDENTITY_MISSING");
      allPairs.set(`${row.wordId}:${row.skill}`, { wordId: row.wordId, skill: row.skill });
    }
    const ids = [...new Set([...allPairs.values()].map(pair => pair.wordId).filter(id => !id.startsWith("unresolved-word:")))];
    const metadata = await read("SELECT * FROM public.canonical_teaching_dictionary_word_metadata WHERE canonical_word_id=ANY($1::uuid[]) AND row_status='active' ORDER BY canonical_word_id,created_at DESC,id", [ids]);
    const dictations = await read("SELECT id,canonical_word_id,dictation_sentence,dictation_target_token_index,dictation_target_end_exclusive,exact_governed_answer,audio_text,review_status,source_row_hash FROM public.canonical_teaching_dictionary_dictation_sentences WHERE canonical_word_id=ANY($1::uuid[]) AND row_status='active' ORDER BY id", [ids]);
    const morphology = await read("SELECT id,canonical_word_id,raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,morphology_joins,morphology_transformations,word_sum,analysis_status,review_status,source_row_hash FROM public.canonical_teaching_dictionary_word_morphology WHERE canonical_word_id=ANY($1::uuid[]) AND row_status='active' ORDER BY id", [ids]);
    const publicationTable = (await read("SELECT to_regclass('public.adle_weak_vowel_content_publications') AS name"))[0]?.name;
    const routes = publicationTable
      ? await read("SELECT v.id,v.canonical_word_id,v.route_id,v.route_version,v.micro_skill_key,v.content,v.runtime_status,v.published_at,(p.content_version_id IS NOT NULL) weak_vowel_published FROM public.teaching_dictionary_route_content_versions v LEFT JOIN public.adle_weak_vowel_content_publications p ON p.content_version_id=v.id WHERE v.route_id='weak_vowel_word_lab' AND v.micro_skill_key=ANY($1) ORDER BY v.published_at DESC,v.id", [keys])
      : await read("SELECT id,canonical_word_id,route_id,route_version,micro_skill_key,content,runtime_status,published_at,false weak_vowel_published FROM public.teaching_dictionary_route_content_versions WHERE route_id='weak_vowel_word_lab' AND micro_skill_key=ANY($1) ORDER BY published_at DESC,id", [keys]);
    const sources: RepairSource[] = [...allPairs.values()].map(pair => {
      const decision = decisions.find(row => row.canonical_word_id === pair.wordId && row.micro_skill_key === pair.skill);
      const admitted = authority.relationships.find(row => row.canonicalWordId === pair.wordId && row.microSkillKey === pair.skill);
      const rawWord = wordById.get(pair.wordId);
      if (!rawWord && !pair.wordId.startsWith("unresolved-word:")) throw new Error(`REPAIR_CANONICAL_WORD_MISSING:${pair.wordId}`);
      return {
        word: rawWord ?? { id: "", normalised_word: pair.wordId.slice("unresolved-word:".length), display_word: pair.wordId.slice("unresolved-word:".length), review_status: "missing" },
        microSkillKey: pair.skill,
        assignmentStatus: admitted ? "assigned" : decision?.action === "deassign" ? "deassigned" : authority.decisions.some(row => row.canonicalWordId === pair.wordId && row.microSkillKey === pair.skill && row.disposition === "EXCLUDED") ? "excluded" : "legacy_only",
        authority: { admitted: admitted ?? null, decisions: authority.decisions.filter(row => row.canonicalWordId === pair.wordId && row.microSkillKey === pair.skill),
          pairDecision: decision ?? null, sources: facts.filter(fact => fact.canonicalWordId === pair.wordId && fact.microSkillKey === pair.skill) },
        metadata: metadata.filter(row => row.canonical_word_id === pair.wordId), dictations: dictations.filter(row => row.canonical_word_id === pair.wordId),
        morphology: morphology.filter(row => row.canonical_word_id === pair.wordId),
        routes: routes.filter(row => row.canonical_word_id === pair.wordId && row.micro_skill_key === pair.skill),
      };
    });
    const exportedAt = new Date().toISOString();
    const rows = buildWeakVowelRepairRows(sources, exportedAt);
    const exportedPairs = new Set(rows.map(row => `${row.canonical_word_id || `unresolved-word:${row.word}`}:${row.micro_skill_key}`));
    if (exportedPairs.size !== allPairs.size || authority.relationships.some(pair => !exportedPairs.has(`${pair.canonicalWordId}:${pair.microSkillKey}`))) throw new Error("REPAIR_EXPORT_COVERAGE_MISMATCH");
    await db.query("ROLLBACK");
    return { rows, sources, manifest: { exportVersion: "weak_vowel_repair_v1", exportedAt, environment, databaseAccess: "read_only_repeatable_read",
      effectivePairCount: authority.relationships.length, inventoryPairCount: allPairs.size, csvRowCount: rows.length,
      distinctWordCount: new Set(rows.map(row => row.canonical_word_id || row.word)).size,
      skillCounts: Object.fromEntries(keys.map(key => [key, { assignedPairs: authority.relationships.filter(row => row.microSkillKey === key).length, inventoryPairs: sources.filter(row => row.microSkillKey === key).length }])),
      assignmentCounts: Object.fromEntries([...new Set(rows.map(row => row.assignment_status))].map(status => [status, rows.filter(row => row.assignment_status === status).length])),
      issueCounts: Object.fromEntries([...new Set(rows.flatMap(row => row.issue_codes.split("; ")))].filter(Boolean).sort().map(code => [code, rows.filter(row => row.issue_codes.split("; ").includes(code)).length])),
      reconciliation: authority.reconciliation, databaseWrites: 0, learnerDataRead: false, publicationReady: false } };
  } finally {
    await db.end();
  }
}

export function repairDatabaseConnection(): string {
  if (!process.env.WEAK_VOWEL_DATABASE_URL && !process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED) process.loadEnvFile(".env.local");
  const value = process.env.WEAK_VOWEL_DATABASE_URL || process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!value) throw new Error("Set WEAK_VOWEL_DATABASE_URL or the existing production read connection.");
  return value;
}
