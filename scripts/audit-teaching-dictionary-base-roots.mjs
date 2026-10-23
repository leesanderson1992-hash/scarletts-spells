/** Read-only production audit of lexical bases, roots, and family coverage. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "data/adle/homophone/convergence-v1");
const line = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(value => value.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!line) throw new Error("Production database connection unavailable");
let connectionString = line.slice(line.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"'))
  || (connectionString.startsWith("'") && connectionString.endsWith("'"))) connectionString = connectionString.slice(1, -1);
const destination = new URL(connectionString);
if (!destination.hostname.includes("wwohrqtunajrbwxyssjf")
  && !destination.username.includes("wwohrqtunajrbwxyssjf")) throw new Error("Unexpected database project");

const csv = (fields, rows) => [fields.join(","), ...rows.map(row => fields.map(field => {
  const value = String(row[field] ?? "");
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}).join(","))].join("\n") + "\n";
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  await client.connect();
  await client.query("begin read only");
  const words = (await client.query(`select id,word_key,normalised_word,display_word
    from public.canonical_teaching_dictionary_words where row_status='active'
      and review_status='approved_for_first_exposure' and dialect_code='en-GB'
    order by normalised_word,word_key`)).rows;
  const morphology = (await client.query(`select m.canonical_word_id,m.analysis_status,m.morphology_parts,m.word_sum,
      m.raw_morpholex_pos,m.source_row_hash
    from public.canonical_teaching_dictionary_word_morphology m
    join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
    where m.row_status='active' and m.review_status='approved_for_first_exposure'
      and w.row_status='active' and w.dialect_code='en-GB'`)).rows;
  const families = (await client.query(`select f.base_family_key,f.base_word_id,f.etymology_route,w.normalised_word base_word
    from public.canonical_teaching_dictionary_base_word_families f
    join public.canonical_teaching_dictionary_words w on w.id=f.base_word_id
    where f.row_status='active' and f.review_status='approved_for_first_exposure'`)).rows;
  const members = (await client.query(`select m.canonical_word_id,f.base_family_key
    from public.canonical_teaching_dictionary_base_word_family_members m
    join public.canonical_teaching_dictionary_base_word_families f on f.id=m.base_word_family_id
    where m.row_status='active' and m.review_status='approved_for_first_exposure'
      and f.row_status='active' and f.review_status='approved_for_first_exposure'`)).rows;
  await client.query("rollback");

  const byText = new Map(words.map(word => [word.normalised_word.replaceAll("’", "'"), word]));
  const byId = new Map(words.map(word => [word.id, word]));
  const morphByWord = new Map(morphology.map(row => [row.canonical_word_id, row]));
  const familyByBase = new Map();
  for (const family of families) familyByBase.set(family.base_word_id,
    [...(familyByBase.get(family.base_word_id) ?? []), family.base_family_key]);
  const familyByMember = new Map();
  for (const member of members) familyByMember.set(member.canonical_word_id,
    [...(familyByMember.get(member.canonical_word_id) ?? []), member.base_family_key]);
  writeFileSync(resolve(out, "full-dictionary-canonical-base-index.csv"), csv(
    ["word", "word_key", "base_family_keys", "member_family_keys"],
    words.map(word => ({ word: word.normalised_word, word_key: word.word_key,
      base_family_keys: [...new Set(familyByBase.get(word.id) ?? [])].sort().join(" | "),
      member_family_keys: [...new Set(familyByMember.get(word.id) ?? [])].sort().join(" | ") }))));
  const components = new Map();
  const malformed = [];
  for (const row of morphology) {
    if (row.analysis_status !== "approved") continue;
    const source = byId.get(row.canonical_word_id);
    if (!source) continue;
    for (const part of row.morphology_parts ?? []) {
      const kind = part.kind ?? part.type ?? part.partType;
      if (kind !== "base" && kind !== "root") continue;
      const text = String(part.sourceText || part.text || part.surfaceText || "").toLowerCase().replaceAll("’", "'").trim();
      if (!text) { malformed.push({ word: source.normalised_word, kind, source_row_hash: row.source_row_hash }); continue; }
      const key = `${kind}:${text}`;
      const entry = components.get(key) ?? { kind, text, sourceWords: new Set() };
      entry.sourceWords.add(source.normalised_word);
      components.set(key, entry);
    }
  }
  const gapRows = [...components.values()].map(entry => {
    const baseWord = byText.get(entry.text);
    const directFamilies = baseWord ? familyByBase.get(baseWord.id) ?? [] : [];
    const rootFamilies = entry.kind === "root" ? families.filter(family =>
      family.base_family_key.startsWith(`${entry.text}_`) || family.base_word === entry.text
      || String(family.etymology_route?.origin_form ?? "").toLowerCase() === entry.text)
      .map(family => family.base_family_key) : [];
    const matches = [...new Set([...directFamilies, ...rootFamilies])].sort();
    return { component: entry.text, component_kind: entry.kind,
      canonical_word_key: baseWord?.word_key ?? "", canonical_word_present: baseWord ? "TRUE" : "FALSE",
      matching_family_keys: matches.join(" | "), source_word_count: entry.sourceWords.size,
      source_word_examples: [...entry.sourceWords].sort().slice(0, 12).join(" | "),
      proposed_action: matches.length ? "review_existing_family_membership"
        : entry.kind === "root" ? "review_bound_root_and_create_family"
          : baseWord ? "create_or_review_base_family" : "add_canonical_base_then_family",
      review_status: "draft" };
  }).filter(row => !row.matching_family_keys).sort((a, b) => a.component.localeCompare(b.component)
    || a.component_kind.localeCompare(b.component_kind));
  const unanalysed = words.filter(word => morphByWord.get(word.id)?.analysis_status !== "approved")
    .map(word => ({ word_key: word.word_key, word: word.normalised_word,
      morphology_status: morphByWord.get(word.id)?.analysis_status ?? "missing",
      existing_family_keys: (familyByMember.get(word.id) ?? []).join(" | "),
      proposed_action: "review_morphology_then_reaudit_base_root", review_status: "draft" }));
  const unlinked = words.filter(word => morphByWord.get(word.id)?.analysis_status === "approved"
    && !(familyByMember.get(word.id)?.length))
    .map(word => ({ word_key: word.word_key, word: word.normalised_word,
      word_sum: morphByWord.get(word.id).word_sum ?? "",
      morphology_part_count: (morphByWord.get(word.id).morphology_parts ?? []).length,
      proposed_action: "review_and_assign_family", review_status: "draft" }));
  writeFileSync(resolve(out, "full-dictionary-missing-base-root-review.csv"), csv(
    ["component", "component_kind", "canonical_word_key", "canonical_word_present",
      "matching_family_keys", "source_word_count", "source_word_examples", "proposed_action", "review_status"], gapRows));
  writeFileSync(resolve(out, "full-dictionary-unanalysed-words-review.csv"), csv(
    ["word_key", "word", "morphology_status", "existing_family_keys", "proposed_action", "review_status"], unanalysed));
  writeFileSync(resolve(out, "full-dictionary-family-link-review.csv"), csv(
    ["word_key", "word", "word_sum", "morphology_part_count", "proposed_action", "review_status"], unlinked));
  const summary = { source: "read_only_production_en_GB_approved_words", wordCount: words.length,
    activeApprovedMorphologyCount: morphology.filter(row => row.analysis_status === "approved").length,
    activeFamilyRows: families.length, activeFamilyMemberRows: members.length,
    distinctBaseRootComponents: components.size, missingBaseRootCandidates: gapRows.length,
    unanalysedWords: unanalysed.length, reviewedMorphologyWithoutFamilyLink: unlinked.length,
    malformedBaseRootParts: malformed.length,
    sourceFingerprint: createHash("sha256").update(JSON.stringify({
      words: words.map(word => [word.word_key, word.normalised_word]),
      morphology: morphology.map(row => [row.canonical_word_id, row.source_row_hash]).sort(),
      families: families.map(family => [family.base_family_key, family.base_word_id]).sort(),
    })).digest("hex") };
  writeFileSync(resolve(out, "full-dictionary-base-root-audit-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
} finally { await client.end().catch(() => {}); }
