/** Read-only evidence for the reviewed pilot's actual ADLE route memberships. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { routeBlockers, routeContentsForSelectedSkills, routeForSkill,
  routeWithSingleProfileDefaults } from "../lib/teaching-dictionary-manager/contracts";

delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_READ_ONLY_DATABASE_REQUIRED");
const rows = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"));
assert.equal(rows.length, 14);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin read only");
  const report = [];
  for (const row of rows) {
    assert(row.canonicalWordId && !row.error);
    for (const skill of row.payload.skillKeys) {
      const route = routeForSkill(skill);
      const suffix = route?.routeId === "dynamic_affix_word_lab" ? await db.query(`
        select p.id profile_id,p.production_enabled,p.review_status profile_review_status,
          m.id member_id,m.assignment_eligible,m.row_status member_row_status,
          m.review_status member_review_status,m.semantic_base_text,m.base_meaning,
          m.new_word_meaning,m.true_morphology_parts,m.teaching_split_parts
        from public.canonical_teaching_dictionary_suffix_profiles p
        left join public.canonical_teaching_dictionary_suffix_members m
          on m.suffix_profile_id=p.id and m.canonical_word_id=$1
        where p.micro_skill_key=$2 and p.row_status='active'
        order by p.reviewed_at desc,p.id`, [row.canonicalWordId, skill]) : { rows: [] };
      // Other lesson routes may publish through their own authority tables.
      const published = route?.routeId === "dynamic_affix_word_lab"
        ? await db.query(`select count(*)::int n
          from public.teaching_dictionary_route_content_versions v
          join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
          where v.canonical_word_id=$1 and v.micro_skill_key=$2`, [row.canonicalWordId, skill])
        : null;
      const candidate = route?.routeId === "dynamic_affix_word_lab"
        ? routeContentsForSelectedSkills(row.payload).find((item) => item.microSkillKey === skill)
        : null;
      const profileFacts = suffix.rows[0] ? await db.query(`select suffix_choices,meaning_bins
        from public.canonical_teaching_dictionary_suffix_profiles where id=$1`,
      [suffix.rows[0].profile_id]) : { rows: [] };
      const prepared = candidate && profileFacts.rows[0]
        ? routeWithSingleProfileDefaults(candidate, {
          choices: Array.isArray(profileFacts.rows[0].suffix_choices)
            ? profileFacts.rows[0].suffix_choices.map(String) : [],
          meaningBins: Array.isArray(profileFacts.rows[0].meaning_bins)
            ? profileFacts.rows[0].meaning_bins : [],
        }) : null;
      report.push({ word: row.normalisedWord, skill, route: route?.routeId ?? null,
        ...(published ? { managerPublishedRouteVersions: published.rows[0].n } : {}),
        ...(prepared && !suffix.rows[0]?.member_id ? { proposedLesson: {
          wordMeaning: prepared.wordMeaning,
          semanticBaseText: prepared.content.semanticBaseText,
          baseMeaning: prepared.content.baseMeaning,
          suffixVariant: prepared.content.suffixVariant,
          meaningBinKey: prepared.content.meaningBinKey,
          teachingSplit: Array.isArray(prepared.content.teachingSplitParts)
            ? prepared.content.teachingSplitParts.map((part) =>
              typeof part === "object" && part !== null
                ? `${(part as Record<string, unknown>).sourceText}→${(part as Record<string, unknown>).surfaceText}` : "") : [],
          blockers: routeBlockers(prepared, row.payload),
        } } : {}),
        suffixProfiles: suffix.rows.map((item) => ({ profileId: item.profile_id,
          productionEnabled: item.production_enabled, profileReview: item.profile_review_status,
          member: Boolean(item.member_id), eligible: item.assignment_eligible,
          memberStatus: item.member_row_status, memberReview: item.member_review_status,
          semanticBase: item.semantic_base_text, baseMeaning: item.base_meaning,
          newWordMeaning: item.new_word_meaning,
          trueParts: Array.isArray(item.true_morphology_parts) ? item.true_morphology_parts.length : 0,
          teachingParts: Array.isArray(item.teaching_split_parts) ? item.teaching_split_parts.length : 0 })),
      });
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
