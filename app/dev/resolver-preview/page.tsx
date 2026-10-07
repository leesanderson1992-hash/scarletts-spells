import { notFound } from "next/navigation";

import { ResolutionWorkspace } from "@/app/admin/canonical-mappings/resolution-workspace";
import { parseResolutionFilters, type ResolutionRow, type SkillOption } from "@/app/admin/canonical-mappings/resolution-read-model";
import "@/app/admin/adle-canonical-intake-readiness/readiness.css";
import "@/app/admin/canonical-mappings/resolution.css";

export const dynamic = "force-dynamic";

const skills: SkillOption[] = [
  { micro_skill_key: "D4_DEMO_COMMON_WORDS", display_name: "Common spelling pattern",
    skill_family_key: "spelling_patterns", skill_cluster_key: "frequent_words" },
  { micro_skill_key: "D4_DEMO_VOWELS", display_name: "Vowel order",
    skill_family_key: "word_structure", skill_cluster_key: "vowels" },
];

const families = [
  { skill_family_key: "spelling_patterns", display_name: "Spelling patterns" },
  { skill_family_key: "word_structure", display_name: "Word structure" },
];
const clusters = [
  { skill_family_key: "spelling_patterns", skill_cluster_key: "frequent_words", display_name: "Frequent words" },
  { skill_family_key: "word_structure", skill_cluster_key: "vowels", display_name: "Vowels" },
];

const rows: ResolutionRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    misspelling: "buisness",
    correction: "business",
    dialect: "en-GB",
    skillKey: skills[0].micro_skill_key,
    skillName: skills[0].display_name,
    familyKey: "spelling_patterns",
    familyName: "Spelling patterns",
    clusterKey: "frequent_words",
    clusterName: "Frequent words",
    status: "pending",
    resolverEnabled: false,
    mappingId: null,
    mappingStatus: null,
    visibilityStatus: null,
    updatedAt: "2026-10-03T09:00:00Z",
    sources: [{
      type: "seed",
      id: "00000000-0000-0000-0000-000000000011",
      status: "pending_candidate_review",
      createdAt: "2026-10-03T09:00:00Z",
      note: "Sample import evidence",
      originalMisspelling: "buisness",
      originalCorrection: "business",
      details: { source: "Local preview", note: "Sample data only" },
    }, {
      type: "recommendation",
      id: "00000000-0000-0000-0000-000000000012",
      status: "pending_admin_review",
      createdAt: "2026-10-03T09:00:00Z",
      note: "Sample parent recommendation",
      originalMisspelling: "buisness",
      originalCorrection: "business",
      details: { source: "Local preview", note: "Sample data only" },
    }],
    audit: [],
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    misspelling: "recieve",
    correction: "receive",
    dialect: "en-GB",
    skillKey: skills[0].micro_skill_key,
    skillName: skills[0].display_name,
    familyKey: "spelling_patterns",
    familyName: "Spelling patterns",
    clusterKey: "frequent_words",
    clusterName: "Frequent words",
    status: "confirmed",
    resolverEnabled: true,
    mappingId: "00000000-0000-0000-0000-000000000022",
    mappingStatus: "active",
    visibilityStatus: "visible",
    updatedAt: "2026-10-02T09:00:00Z",
    sources: [],
    audit: [{ event_type: "resolver_visibility_enabled", created_at: "2026-10-02T09:00:00Z", note: "Sample event" }],
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    misspelling: "definately",
    correction: "definitely",
    dialect: "en-GB",
    skillKey: skills[1].micro_skill_key,
    skillName: skills[1].display_name,
    familyKey: "word_structure",
    familyName: "Word structure",
    clusterKey: "vowels",
    clusterName: "Vowels",
    status: "pending",
    resolverEnabled: false,
    mappingId: null,
    mappingStatus: null,
    visibilityStatus: null,
    updatedAt: "2026-10-01T09:00:00Z",
    sources: [{ type: "catalog", id: "00000000-0000-0000-0000-000000000013",
      status: "open", createdAt: "2026-10-01T09:00:00Z", note: "Sample catalog review",
      originalMisspelling: "definately", originalCorrection: "definitely",
      details: { source: "Preview fixture" } }],
    audit: [],
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    misspelling: "seperate",
    correction: "separate",
    dialect: "en-GB",
    skillKey: skills[1].micro_skill_key,
    skillName: skills[1].display_name,
    familyKey: "word_structure",
    familyName: "Word structure",
    clusterKey: "vowels",
    clusterName: "Vowels",
    status: "confirmed",
    resolverEnabled: false,
    mappingId: "00000000-0000-0000-0000-000000000024",
    mappingStatus: "active",
    visibilityStatus: "hidden",
    updatedAt: "2026-10-02T10:00:00Z",
    sources: [],
    audit: [],
  },
];

function sortGroup(row: ResolutionRow) {
  if (row.status === "pending") return 0;
  if (row.status === "confirmed") return row.resolverEnabled ? 2 : 1;
  return 3;
}

export default async function ResolverPreviewPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  const filters = parseResolutionFilters((await searchParams) ?? {});
  const filteredRows = rows.filter((row) =>
    (!filters.q || `${row.misspelling} ${row.correction}`.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.family || row.familyKey === filters.family) &&
    (!filters.cluster || row.clusterKey === filters.cluster) &&
    (!filters.skill || row.skillKey === filters.skill) &&
    (filters.status === "all" || filters.status === "open" && row.status !== "closed" || row.status === filters.status) &&
    (filters.resolver === "all" || row.resolverEnabled === (filters.resolver === "yes")))
    .sort((left, right) => sortGroup(left) - sortGroup(right) || right.updatedAt.localeCompare(left.updatedAt));
  return <main className="adle-admin-page resolution-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-7">
        <p className="adle-admin-eyebrow">Admin / Spelling</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Canonical Misspelling Resolver</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59616b]">Design preview with sample spelling evidence.</p>
      </header>
      <p role="status" className="adle-admin-alert mb-5">Sample data only. Review filters and try confirmation here; changes reset when this page reloads.</p>
      <div className="adle-admin-toolbar">
        <form className="adle-admin-filter-form" action="/dev/resolver-preview" method="get">
          <input className="adle-admin-search" name="q" aria-label="Search" defaultValue={filters.q} placeholder="Search misspelling or correction" />
          <select className="adle-admin-select" name="family" aria-label="Family" defaultValue={filters.family}>
            <option value="">All families</option>{families.map((family) =>
              <option key={family.skill_family_key} value={family.skill_family_key}>{family.display_name}</option>)}
          </select>
          <select className="adle-admin-select" name="cluster" aria-label="Cluster" defaultValue={filters.cluster}>
            <option value="">All clusters</option>{clusters.map((cluster) =>
              <option key={cluster.skill_cluster_key} value={cluster.skill_cluster_key}>{cluster.display_name}</option>)}
          </select>
          <select className="adle-admin-select" name="skill" aria-label="Skill" defaultValue={filters.skill}>
            <option value="">All skills</option>{skills.map((skill) =>
              <option key={skill.micro_skill_key} value={skill.micro_skill_key}>{skill.display_name}</option>)}
          </select>
          <select className="adle-admin-select" name="status" aria-label="Status" defaultValue={filters.status}>
            <option value="open">Unresolved and confirmed</option><option value="pending">Unresolved only</option>
            <option value="confirmed">Confirmed only</option><option value="closed">Closed history</option>
          </select>
          <select className="adle-admin-select" name="resolver" aria-label="Resolver enabled" defaultValue={filters.resolver}>
            <option value="all">Resolver: all</option><option value="yes">Resolver enabled</option><option value="no">Resolver off</option>
          </select>
          <select className="adle-admin-select" name="size" aria-label="Rows per page" defaultValue={filters.size}>
            <option value="25">25 per page</option><option value="50">50 per page</option>
          </select>
          <button className="adle-admin-primary" type="submit">Apply</button>
        </form>
      </div>
      <ResolutionWorkspace key={JSON.stringify(filters)} rows={filteredRows} skills={skills} families={families} clusters={clusters}
        total={filteredRows.length} readOnlyPreview previewFilters={filters} />
    </div>
  </main>;
}
