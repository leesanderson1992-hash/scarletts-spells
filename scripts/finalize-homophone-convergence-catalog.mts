/** Production-only catalog cutover after all 58 contextual route heads are live. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const apply = process.argv.includes("--apply");
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root,
  "data/adle/releases/homophone-convergence-v1/package.json"), "utf8")) as {
  manifest: { microSkills: Array<{ microSkillKey: string }> };
};
const targets = pkg.manifest.microSkills.map(skill => skill.microSkillKey);
const retired = [
  "D4_HOM_CONTENT_WORD_HOMOPHONES_COMMON_VERB_NOUN_PAIRS",
  "D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS",
  "D4_HOM_CONTRACTION_POSSESSIVE_WERE_WERE",
  "D4_HOM_CONTRACTION_POSSESSIVE_WHOS_WHOSE",
  "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF",
];
if (targets.length !== 58 || new Set(targets).size !== 58)
  throw new Error("Target catalog roster invalid");
const line = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(value => value.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!line) throw new Error("Production database connection missing");
const connectionString = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("Catalog cutover target mismatch");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000 });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout='30s'");
  const heads = await client.query<{ n: number }>(`
    select count(*)::integer n from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.route_id='homophone_contextual_choice'
      and h.route_version='v1' and h.micro_skill_key=any($1::text[])
      and r.activation_status='enabled'
      and r.readiness_report#>>'{scope,kind}'='all_eligible'`, [targets]);
  const learning = await client.query<{ n: number }>(`
    select count(*)::integer n from public.adle_learning_items
    where micro_skill_key=any($1::text[])`, [retired]);
  const catalog = await client.query<{ micro_skill_key: string; skill_cluster_key: string;
    is_active: boolean; is_assignable: boolean }>(`
    select micro_skill_key,skill_cluster_key,is_active,is_assignable
    from public.micro_skill_catalog where micro_skill_key=any($1::text[]) for update`, [targets]);
  const clusters = [...new Set(catalog.rows.map(row => row.skill_cluster_key))];
  const newClusters = ["D4_HOM_CONFUSABLE_WORDS", "D4_HOM_CONTRACTION_REAL_WORD_CONFUSABLES"];
  const uncovered = await client.query<{ n: number }>(`
    select count(*)::integer n from public.micro_skill_catalog
    where skill_cluster_key=any($1::text[]) and not (micro_skill_key=any($2::text[]))`,
    [newClusters, targets]);
  if (heads.rows[0].n !== 58 || catalog.rowCount !== 58 || learning.rows[0].n !== 0
    || uncovered.rows[0].n !== 0 || clusters.length !== 4)
    throw new Error("Catalog cutover preflight failed");
  const old = await client.query<{ micro_skill_key: string }>(`
    select micro_skill_key from public.micro_skill_catalog
    where micro_skill_key=any($1::text[]) for update`, [retired]);
  if (old.rowCount !== 5) throw new Error("Retirement roster mismatch");
  const redirects = await client.query<{ n: number }>(`
    select count(*)::integer n from public.homophone_skill_redirects
    where source_skill_key=any($1::text[]) or
      source_skill_key='D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE'`, [retired]);
  if (redirects.rows[0].n !== 8) throw new Error("Redirect roster mismatch");
  if (apply) {
    await client.query(`update public.micro_skill_clusters set is_active=true,is_assignable=true
      where skill_cluster_key=any($1::text[])`, [newClusters]);
    await client.query(`update public.micro_skill_catalog set is_active=true,is_assignable=true
      where micro_skill_key=any($1::text[])`, [targets]);
    await client.query(`update public.micro_skill_catalog set is_active=false,is_assignable=false
      where micro_skill_key=any($1::text[])`, [retired]);
    await client.query(`update public.homophone_skill_redirects
      set redirect_status='active',approved_by='Katie Sanderson',approved_at=clock_timestamp(),
        decision_reference='Owner approved homophone convergence and route launch 2026-10-24'
      where redirect_status='draft' and (source_skill_key=any($1::text[])
        or source_skill_key='D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE')`, [retired]);
    const readback = await client.query<{ targets: number; retired: number; redirects: number }>(`
      select (select count(*)::integer from public.micro_skill_catalog
        where micro_skill_key=any($1::text[]) and is_active and is_assignable) targets,
        (select count(*)::integer from public.micro_skill_catalog
        where micro_skill_key=any($2::text[]) and not is_active and not is_assignable) retired,
        (select count(*)::integer from public.homophone_skill_redirects
          where redirect_status='active' and (source_skill_key=any($2::text[])
            or source_skill_key='D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE')) redirects`,
      [targets, retired]);
    if (readback.rows[0].targets !== 58 || readback.rows[0].retired !== 5
      || readback.rows[0].redirects !== 8) throw new Error("Catalog cutover readback failed");
    await client.query("commit");
  } else await client.query("rollback");
  console.log(JSON.stringify({ environment: "production", mode: apply ? "apply" : "plan",
    activeRouteHeads: heads.rows[0].n, targetSkills: targets.length, clusters,
    retiredSkills: retired.length, oldLearningItems: learning.rows[0].n,
    redirectRows: redirects.rows[0].n }));
} catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
finally { await client.end(); }
