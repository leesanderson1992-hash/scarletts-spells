#!/usr/bin/env node
/** Publish exact Identify relationships for approved English free-base + affix words.
 * The candidate manifest is reproducible; --apply commits, otherwise rolls back. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const KEYS = [SKILL, "D4_MOR_BASE_WORDS_PRESERVE_BASE", "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX"];
const RELEASE_KEY = "identify-base-affixed-dictionary-words-production-2026-10-31-v1";
const irregularBaseReference = JSON.parse(readFileSync(resolve("data/adle/candidates/d4-mor/irregular-verb-bases-cambridge-2026-10-31.json"), "utf8"));
const irregularVerbBases = new Set(irregularBaseReference.baseForms);
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url) throw new Error("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED is required");
const apply = process.argv.includes("--apply");
const out = resolve(process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "docs/implementation/qa/base-word-affixed-dictionary-assignment-2026-10-31");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const hasAffix = (parts) => Array.isArray(parts) && parts.some((part) => part?.kind === "base") && parts.some((part) => part?.kind === "prefix" || part?.kind === "suffix");
const irregular = (member) => member.relationship_kind === "irregular_inflection" ||
  member.morphology_transformations?.some((transform) => transform?.kind === "irregular_form");
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

try {
  await db.connect();
  await db.query("begin transaction isolation level repeatable read");
  const activation = (await db.query(`select r.release_manifest_id,r.release_manifest_sha256,a.semantic_projection
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    join public.adle_curriculum_release_dependencies d on d.release_manifest_id=r.release_manifest_id
      and d.micro_skill_key=h.micro_skill_key and d.authority_type='family_membership'
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where h.environment_key='production' and h.route_id='base_word_lab' and h.route_version='v2'
      and h.micro_skill_key=$1 and r.activation_status='enabled'`, [SKILL])).rows[0];
  assert(activation, "active Identify family release required");
  const release = activation.semantic_projection;
  assert.equal(release.selectionPolicyVersion, "base_word_regularity_v1");
  const closureBinding = (await db.query(`select authority_id from public.adle_curriculum_release_dependencies
    where release_manifest_id=$1 and micro_skill_key=$2 and authority_type='teaching_dictionary_closure'`,
  [activation.release_manifest_id, SKILL])).rows[0];
  assert(closureBinding, "active Identify dictionary closure required");

  const lexical = (await db.query(`with latest as (
      select distinct on (family_key) * from public.canonical_teaching_dictionary_lexical_base_families
      where review_status='approved' order by family_key,revision desc)
    select f.family_key,f.revision,f.base_lemma,f.base_part_of_speech,f.canonical_base_word_id,f.semantic_fingerprint,
      b.normalised_word base_word,b.row_status base_status,b.review_status base_review,
      m.canonical_word_id,m.relationship_kind,m.word_sum,m.morphology_parts,m.morphology_joins,
      m.morphology_transformations,m.canonical_morphology_id,m.source_reference,
      w.normalised_word,w.display_word,w.row_status,w.review_status,
      exists(select 1 from public.canonical_teaching_dictionary_word_morphology cm
        where cm.id=m.canonical_morphology_id and cm.canonical_word_id=m.canonical_word_id
          and cm.row_status='active' and cm.review_status='approved_for_first_exposure'
          and cm.analysis_status='approved' and cm.word_sum=m.word_sum
          and cm.morphology_parts=m.morphology_parts and cm.morphology_joins=m.morphology_joins
          and cm.morphology_transformations=m.morphology_transformations) exact_morphology
    from latest f join public.canonical_teaching_dictionary_lexical_base_family_members m using(family_key,revision)
    join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
    join public.canonical_teaching_dictionary_words b on b.id=f.canonical_base_word_id
    where f.base_kind='free_base' and f.canonical_base_word_id is not null
    order by f.family_key,m.canonical_word_id`)).rows;
  const lexicalFamilies = new Map();
  for (const row of lexical) {
    const rows = lexicalFamilies.get(row.family_key) ?? [];
    rows.push(row);
    lexicalFamilies.set(row.family_key, rows);
  }
  const authorizations = (await db.query(`select family_key,revision,semantic_fingerprint
    from public.adle_base_word_lexical_family_authorizations where withdrawn_at is null`)).rows;
  const authorizedLexicalFamilies = new Set(authorizations.map((row) =>
    `${row.family_key}:${row.revision}:${row.semantic_fingerprint}`));
  // The lesson authority and the lexical registry were reviewed separately.
  // A recorded irregular lexical member vetoes every family using that exact
  // canonical base word, including older released lesson families.
  const irregularBaseIds = new Set([...lexicalFamilies.values()]
    .filter((rows) => rows.some(irregular) ||
      ((rows[0].base_part_of_speech === "verb" || rows[0].base_part_of_speech === "modal_verb") &&
        irregularVerbBases.has(rows[0].base_lemma)))
    .map((rows) => rows[0].canonical_base_word_id));
  const lexicalAudit = [];
  for (const [familyKey, rows] of lexicalFamilies) {
    if (new Set(rows.map((row) => row.canonical_word_id)).size < 2) continue;
    for (const row of rows) {
      const reason = irregularBaseIds.has(row.canonical_base_word_id) ? "irregular_family"
        : row.canonical_word_id === row.canonical_base_word_id ? "base_word_only"
          : row.relationship_kind === "contraction" || /['’]/u.test(row.normalised_word) ? "contraction"
            : !["derived", "regular_inflection"].includes(row.relationship_kind) ? "not_reviewed_affix_relationship"
              : !hasAffix(row.morphology_parts) ? "not_base_plus_affix"
                : !row.exact_morphology ? "current_morphology_not_approved_exact"
                  : row.row_status !== "active" || row.review_status !== "approved_for_first_exposure"
                    ? "dictionary_word_not_approved" : "eligible_lexical_source";
      lexicalAudit.push({ word: row.display_word, canonicalWordId: row.canonical_word_id,
        baseWord: row.base_word, familyKey, relationshipKind: row.relationship_kind, reason });
    }
  }
  const candidates = new Map();
  const add = (id, source) => {
    const sources = candidates.get(id) ?? [];
    sources.push(source);
    candidates.set(id, sources);
  };
  const excludedIrregularFamilies = [];
  for (const [familyKey, rows] of lexicalFamilies) {
    if (new Set(rows.map((row) => row.canonical_word_id)).size < 2) continue;
    if (irregularBaseIds.has(rows[0].canonical_base_word_id)) { excludedIrregularFamilies.push(familyKey); continue; }
    if (rows[0].base_word !== rows[0].base_lemma.toLowerCase() ||
      rows[0].base_status !== "active" || rows[0].base_review !== "approved_for_first_exposure") continue;
    for (const row of rows) {
      if (row.canonical_word_id === row.canonical_base_word_id ||
        !["derived", "regular_inflection"].includes(row.relationship_kind) ||
        !hasAffix(row.morphology_parts) || !row.exact_morphology ||
        row.row_status !== "active" || row.review_status !== "approved_for_first_exposure" ||
        /['’]/u.test(row.normalised_word)) continue;
      add(row.canonical_word_id, { kind: "lexical", familyKey, revision: row.revision,
        baseWord: row.base_word, word: row.normalised_word, wordSum: row.word_sum,
        fingerprint: row.semantic_fingerprint });
    }
  }
  const releasedIds = new Set();
  for (const family of release.families) {
    if (new Set(family.members.map((member) => member.canonicalWordId)).size < 2) continue;
    if (irregularBaseIds.has(family.baseWordId) ||
      family.members.some((member) => member.lessonRegularity?.status !== "regular")) {
      excludedIrregularFamilies.push(family.baseFamilyKey);
      continue;
    }
    for (const member of family.members) {
      if (member.structuralRole === "base" || !member.assignmentEligible || !hasAffix(member.morphologyParts)) continue;
      releasedIds.add(member.canonicalWordId);
      add(member.canonicalWordId, { kind: "released", familyKey: family.baseFamilyKey,
        baseWord: family.baseFamilyKey.replace(/_base_family$/, ""), wordSum: member.wordSum,
        fingerprint: activation.release_manifest_sha256 });
    }
  }
  const ids = [...candidates.keys()].sort();
  const words = await db.query("select id,normalised_word,display_word,row_status,review_status from public.canonical_teaching_dictionary_words where id=any($1::uuid[])", [ids]);
  const decisions = await db.query("select canonical_word_id,micro_skill_key,action from public.teaching_dictionary_pair_latest_decisions where environment_key='production' and micro_skill_key=any($1::text[]) and canonical_word_id=any($2::uuid[])", [KEYS, ids]);
  const existingPairs = await db.query(`select distinct p.canonical_word_id from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      where r.environment_key='production' and r.release_key<>$3
        and p.micro_skill_key=$1 and p.relationship_role='demonstrates'
        and p.canonical_word_id=any($2::uuid[])
        and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)`, [SKILL, ids, RELEASE_KEY]);
  const wordById = new Map(words.rows.map((row) => [row.id, row]));
  const closure = await db.query(`select canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text
    from public.adle_teaching_dictionary_closure_words where authority_id=$1 and canonical_word_id=any($2::uuid[])`,
  [closureBinding.authority_id, ids]);
  const closureById = new Map(closure.rows.map((row) => [row.canonical_word_id, row]));
  const routeContent = await db.query(`select distinct canonical_word_id
    from public.teaching_dictionary_route_content_versions
    where route_id='base_word_lab' and micro_skill_key=$1 and canonical_word_id=any($2::uuid[])`,
  [SKILL, ids]);
  const routeContentIds = new Set(routeContent.rows.map((row) => row.canonical_word_id));
  const veto = new Map(decisions.rows.filter((row) => row.action === "deassign").map((row) => [row.canonical_word_id, row.micro_skill_key]));
  const existing = new Set(existingPairs.rows.map((row) => row.canonical_word_id));
  const audit = ids.map((id) => {
    const word = wordById.get(id);
    const sources = candidates.get(id);
    const status = !word || word.row_status !== "active" || word.review_status !== "approved_for_first_exposure"
      ? "dictionary_not_approved" : veto.has(id) ? "deassigned_veto" : existing.has(id)
        ? "already_explicitly_assigned" : "publish_identify_pair";
    return { word: word?.display_word ?? sources[0].word ?? "", canonicalWordId: id,
      familySources: sources.map((source) => `${source.kind}:${source.familyKey}`).sort(),
      wordSums: [...new Set(sources.map((source) => source.wordSum))].sort(),
      activeRouteMember: releasedIds.has(id), dictionaryApproved: status !== "dictionary_not_approved",
      authorizedLexicalFamily: sources.some((source) => source.kind === "lexical" &&
        authorizedLexicalFamilies.has(`${source.familyKey}:${source.revision}:${source.fingerprint}`)),
      routeContentVersionPresent: routeContentIds.has(id),
      dictionaryClosurePresent: closureById.has(id),
      dictationComplete: Boolean(closureById.get(id)?.dictation_sentence?.trim() &&
        closureById.get(id)?.dictation_target_token_index !== null && closureById.get(id)?.audio_text?.trim()),
      vetoSourceSkill: veto.get(id) ?? "", status };
  });
  const publish = audit.filter((row) => row.status === "publish_identify_pair");
  const manifest = { schemaVersion: 1, policy: "approved_english_free_base_plus_affix_family_min_two_no_irregular_family_v1",
    activeFamilyReleaseSha256: activation.release_manifest_sha256,
    irregularVerbReference: { sourceUrl: irregularBaseReference.sourceUrl,
      sourceTableSha256: irregularBaseReference.sourceTableSha256 },
    approvedPairs: publish.map((row) => ({ canonicalWordId: row.canonicalWordId, microSkillKey: SKILL,
      relationshipRole: "demonstrates", decision: "approved",
      sourceReference: `Reviewed Base Word family + affix: ${row.familySources.join(" | ")}`,
      licenceReference: "internal_authored" })) };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "candidate-manifest.json"), manifestJson);
  const headers = ["word", "canonical_word_id", "family_sources", "word_sums", "active_route_member", "authorized_lexical_family", "route_content_version_present", "dictionary_closure_present", "dictation_complete", "dictionary_approved", "veto_source_skill", "assignment_status", "route_readiness_next_step"];
  writeFileSync(resolve(out, "word-audit.csv"), [headers.join(","), ...audit.map((row) => [row.word,row.canonicalWordId,row.familySources.join(" | "),row.wordSums.join(" | "),row.activeRouteMember,row.authorizedLexicalFamily,row.routeContentVersionPresent,row.dictionaryClosurePresent,row.dictationComplete,row.dictionaryApproved,row.vetoSourceSkill,row.status,row.activeRouteMember && row.dictationComplete ? "native_preflight_and_child_selection" : row.activeRouteMember ? "complete_dictation_closure" : row.authorizedLexicalFamily ? "publish_reviewed_family_and_dictionary_closure" : "authorize_family_then_publish_lesson_content"].map(csv).join(","))].join("\n") + "\n");
  writeFileSync(resolve(out, "excluded-irregular-families.txt"), `${[...new Set(excludedIrregularFamilies)].sort().join("\n")}\n`);
  writeFileSync(resolve(out, "lexical-source-review.csv"), [
    "word,canonical_word_id,base_word,family_key,relationship_kind,selection_decision",
    ...lexicalAudit.sort((left, right) => left.word.localeCompare(right.word) || left.familyKey.localeCompare(right.familyKey))
      .map((row) => [row.word,row.canonicalWordId,row.baseWord,row.familyKey,row.relationshipKind,row.reason]
        .map(csv).join(",")),
  ].join("\n") + "\n");
  assert(publish.length > 0 && publish.length <= 1000, "unexpected publication size");
  const actor = (await db.query("select approved_by from public.writing_context_shadow_policy where singleton")).rows[0].approved_by;
  assert(actor, "owner identity missing");
  const receipt = (await db.query("select public.publish_reviewed_word_skill_release($1,'production',$2::jsonb,$3,$4) id",
    [RELEASE_KEY, JSON.stringify(manifest), actor,
      "Katie Sanderson approved all reviewed English free-base + affix words in families of at least two, excluding irregular families and contractions on 2026-10-31"])).rows[0];
  const count = (await db.query("select count(*)::int n from public.adle_reviewed_word_skill_pairs where release_id=$1", [receipt.id])).rows[0].n;
  assert.equal(count, publish.length);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ applied: apply, releaseId: receipt.id, releaseKey: RELEASE_KEY,
    manifestSha256: hash(manifestJson), candidateWords: audit.length, newPairs: publish.length,
    alreadyExplicitlyAssigned: audit.filter((row) => row.status === "already_explicitly_assigned").length,
    deassignedVeto: audit.filter((row) => row.status === "deassigned_veto").length,
    dictionaryNotApproved: audit.filter((row) => row.status === "dictionary_not_approved").length,
    activeRouteMembers: audit.filter((row) => row.activeRouteMember).length,
    routeMembersWithDictation: audit.filter((row) => row.activeRouteMember && row.dictationComplete).length,
    otherAuthorizedLexicalFamilies: audit.filter((row) => !row.activeRouteMember && row.authorizedLexicalFamily).length,
    excludedIrregularFamilies: new Set(excludedIrregularFamilies).size, out }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end().catch(() => undefined);
}
