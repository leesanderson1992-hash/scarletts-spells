/** Small, read-only authority check. No learner rows or full dictionary export. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import approved from "../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import { buildApprovedContextualContent, type PublishedContrastAuthority } from "../lib/adle/homophone/approved-contextual-content";
import { buildConvergenceReleasePackage } from "../lib/adle/homophone/convergence-release";

const line = readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)
  .find(value => value.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!line) throw new Error("homophone_production_readonly_connection_missing");
const connectionString = line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("homophone_production_target_mismatch");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
await client.connect();
try {
  await client.query("begin transaction read only");
  await client.query("set local statement_timeout = '15s'");
  const keys = approved.lessons.map(lesson => lesson.microSkillKey);
  const sets = (await client.query<{ set_key: string; revision: number; micro_skill_key: string;
    relation_kind: PublishedContrastAuthority["relationKind"]; semantic_fingerprint: string }>(`
      select set_key,revision,micro_skill_key,relation_kind,semantic_fingerprint
      from homophone_contrast_sets where micro_skill_key=any($1::text[]) and review_status='approved'
      order by set_key,revision desc`, [keys])).rows;
  const latest = new Map<string, typeof sets[number]>();
  for (const set of sets) if (!latest.has(set.set_key)) latest.set(set.set_key, set);
  const members = (await client.query<{ set_key: string; revision: number; member_ordinal: number;
    canonical_word_id: string; normalised_word: string; intended_sense: string; grammatical_role: string; target_sentence: string }>(`
      select m.set_key,m.revision,m.member_ordinal,m.canonical_word_id,w.normalised_word,
        m.intended_sense,m.grammatical_role,m.target_sentence
      from homophone_contrast_set_members m join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
      where m.set_key=any($1::text[]) and w.dialect_code='en-GB' and w.row_status='active'
        and w.review_status='approved_for_first_exposure'
      order by m.set_key,m.member_ordinal`, [[...latest.keys()]])).rows;
  let questions = 0;
  const contents = [];
  for (const lesson of approved.lessons) {
    const authorities: PublishedContrastAuthority[] = [...latest.values()]
      .filter(set => set.micro_skill_key === lesson.microSkillKey)
      .map(set => ({ setId: `${set.set_key}@${set.revision}`, setKey: set.set_key,
        microSkillKey: set.micro_skill_key, revision: set.revision,
        semanticFingerprint: set.semantic_fingerprint, reviewStatus: "approved",
        relationKind: set.relation_kind,
        members: members.filter(member => member.set_key === set.set_key && member.revision === set.revision)
          .map(member => ({ canonicalWordId: member.canonical_word_id, word: member.normalised_word.replaceAll("’", "'"),
            intendedSense: member.intended_sense, grammaticalRole: member.grammatical_role,
            teachingSentence: member.target_sentence })),
      }));
    const content = buildApprovedContextualContent(lesson.microSkillKey, authorities);
    questions += content.questions.length;
    contents.push(content);
  }
  const pkg = buildConvergenceReleasePackage({ releaseKey: "homophone-convergence-v1-approved-2026-10-24",
    approvalRefs: ["Owner approval in Codex chat, 2026-10-24: all 58 new homophone lessons"], contents });
  if (process.argv.includes("--write-package")) {
    const output = resolve("data/adle/releases/homophone-convergence-v1/package.json");
    mkdirSync(resolve("data/adle/releases/homophone-convergence-v1"), { recursive: true });
    writeFileSync(output, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  console.log(JSON.stringify({ valid: true, environment: "production", approvedLessons: keys.length,
    approvedSets: latest.size, independentQuestions: questions, packageSha256: pkg.packageSha256,
    localPackageWritten: process.argv.includes("--write-package"), mutationPerformed: false }));
  await client.query("rollback");
} finally { await client.end(); }
