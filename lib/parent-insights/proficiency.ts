import "server-only";

import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type InsightLevel = {
  level: number;
  populated: boolean;
  allocation: number;
  badge: string;
  target: number | null;
  credit: number;
  progress: number | null;
  limitedAllocation: boolean;
  words: { id: string; word: string; state: string; credit: number }[];
};

export type InsightSkill = {
  key: string;
  label: string;
  familyKey: string;
  familyLabel: string;
  clusterKey: string;
  clusterLabel: string;
  achievedLevel: number | null;
  developingLevel: number | null;
  firstPopulatedLevel: number | null;
  levels: InsightLevel[];
  policyVersion: string;
  bandingVersion: string;
};

export type InsightFamily = {
  key: string;
  label: string;
  clusters: { key: string; label: string; skills: InsightSkill[] }[];
};

export function groupInsightSkills(skills: InsightSkill[]): InsightFamily[] {
  const families = new Map<string, InsightFamily>();
  for (const skill of skills) {
    let family = families.get(skill.familyKey);
    if (!family) {
      family = { key: skill.familyKey, label: skill.familyLabel, clusters: [] };
      families.set(skill.familyKey, family);
    }
    let cluster = family.clusters.find((item) => item.key === skill.clusterKey);
    if (!cluster) {
      cluster = { key: skill.clusterKey, label: skill.clusterLabel, skills: [] };
      family.clusters.push(cluster);
    }
    cluster.skills.push(skill);
  }
  return [...families.values()]
    .map((family) => ({
      ...family,
      clusters: family.clusters
        .map((cluster) => ({ ...cluster, skills: cluster.skills.sort((a, b) => a.label.localeCompare(b.label)) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadParentInsightSkills(childId: string): Promise<InsightSkill[]> {
  const service = createServiceRoleClient();
  // Without allocated words there are no ADLE level targets to report. This
  // also lets fresh local accounts render their real empty state without
  // loading unrelated composer facts from newer review-schema migrations.
  const allocationResult = await service.from("canonical_teaching_dictionary_skill_level_allocation")
    .select("micro_skill_key", { count: "exact", head: true })
    .eq("row_status", "active");
  if (allocationResult.error) throw allocationResult.error;
  if (!allocationResult.count) return [];
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value ?? "";
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const { proficiencyReports, displayWordByWordId } = await loadDailyPlanFacts(service, { childId, today });
  const keys = proficiencyReports.map((report) => report.microSkillKey);
  if (keys.length === 0) return [];
  const catalogResult = await service.from("micro_skill_catalog")
    .select("micro_skill_key,display_name,skill_family_key,skill_cluster_key")
    .in("micro_skill_key", keys);
  if (catalogResult.error) throw catalogResult.error;
  const catalog = catalogResult.data ?? [];
  const familyKeys = [...new Set(catalog.map((row) => row.skill_family_key).filter(Boolean))];
  const clusterKeys = [...new Set(catalog.map((row) => row.skill_cluster_key).filter(Boolean))];
  const [familyResult, clusterResult] = await Promise.all([
    familyKeys.length ? service.from("micro_skill_families").select("skill_family_key,display_name").in("skill_family_key", familyKeys) : Promise.resolve({ data: [], error: null }),
    clusterKeys.length ? service.from("micro_skill_clusters").select("skill_cluster_key,display_name").in("skill_cluster_key", clusterKeys) : Promise.resolve({ data: [], error: null }),
  ]);
  if (familyResult.error) throw familyResult.error;
  if (clusterResult.error) throw clusterResult.error;
  const catalogByKey = new Map(catalog.map((row) => [row.micro_skill_key, row]));
  const familyByKey = new Map((familyResult.data ?? []).map((row) => [row.skill_family_key, row.display_name]));
  const clusterByKey = new Map((clusterResult.data ?? []).map((row) => [row.skill_cluster_key, row.display_name]));

  return proficiencyReports.map((report) => {
    const entry = catalogByKey.get(report.microSkillKey);
    const familyKey = entry?.skill_family_key ?? "unmapped";
    const clusterKey = entry?.skill_cluster_key ?? "unclustered";
    return {
      key: report.microSkillKey,
      label: entry?.display_name ?? report.microSkillKey,
      familyKey,
      familyLabel: familyByKey.get(familyKey) ?? "Other skills",
      clusterKey,
      clusterLabel: clusterByKey.get(clusterKey) ?? "Other skills",
      achievedLevel: report.highestSecureLevel,
      developingLevel: report.developingLevel,
      firstPopulatedLevel: report.firstPopulatedLevel,
      policyVersion: report.proficiencyPolicyVersion,
      bandingVersion: report.bandingVersion,
      levels: report.levels.map((level) => ({
        level: level.level,
        populated: level.populated,
        allocation: level.allocation,
        badge: level.badge,
        target: level.target,
        credit: level.creditSum,
        progress: level.progress,
        limitedAllocation: level.limitedAllocation,
        words: level.creditedWords.map((word) => ({
          id: word.canonicalWordId,
          word: displayWordByWordId.get(word.canonicalWordId) ?? "Word unavailable",
          state: word.state,
          credit: word.credit,
        })),
      })),
    } satisfies InsightSkill;
  });
}
