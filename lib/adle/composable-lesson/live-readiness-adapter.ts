/* Read-only live adapter. It never reads learner tables or exposes mutation APIs. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  type CurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";
import {
  assertLiveReadinessSelectAllowed,
  type LiveReadinessAuditConfig,
  type LiveReadinessTable,
} from "./live-audit-config";
import type {
  ProductionMicroSkillAuditInput,
  ReadinessAuditMode,
} from "./readiness-audit";

type Row = Record<string, any>;

async function selectAll(
  client: SupabaseClient,
  table: LiveReadinessTable,
): Promise<Row[]> {
  assertLiveReadinessSelectAllowed("select", table);
  const { data, error } = await client.from(table).select("*").limit(10_000);
  if (error) throw new Error(`Live readiness select ${table}: ${error.message}`);
  return (data ?? []) as Row[];
}

function approved(row: Row): boolean {
  return (
    row.row_status === "active" &&
    row.review_status === "approved_for_first_exposure"
  );
}

function profileFor(
  route: CurriculumRouteDefinition,
  microSkillKey: string,
  tables: Record<LiveReadinessTable, Row[]>,
): { declared: boolean; enabled: boolean; authentic: number; transfer: number } {
  if (route.routeId === "dynamic_prefix_word_lab") {
    const profile = tables.canonical_teaching_dictionary_prefix_profiles.find(
      (row) => row.micro_skill_key === microSkillKey && approved(row),
    );
    const members = profile
      ? tables.canonical_teaching_dictionary_prefix_members.filter(
          (row) =>
            row.prefix_profile_id === profile.id &&
            approved(row) &&
            row.assignment_eligible === true,
        )
      : [];
    return {
      declared: Boolean(profile),
      enabled: profile?.production_enabled === true,
      authentic: members.length,
      transfer: members.filter((row) => row.member_role === "transfer").length,
    };
  }
  if (route.routeId === "dynamic_affix_word_lab") {
    const profile = tables.canonical_teaching_dictionary_suffix_profiles.find(
      (row) => row.micro_skill_key === microSkillKey && approved(row),
    );
    const members = profile
      ? tables.canonical_teaching_dictionary_suffix_members.filter(
          (row) =>
            row.suffix_profile_id === profile.id &&
            approved(row) &&
            row.assignment_eligible === true,
        )
      : [];
    return {
      declared: Boolean(profile),
      enabled: profile?.production_enabled === true,
      authentic: members.length,
      transfer: members.filter((row) => row.member_role === "transfer").length,
    };
  }
  if (route.routeId === "closed_compound_word_lab") {
    const profile = tables.canonical_teaching_dictionary_compound_profiles.find(
      (row) => row.micro_skill_key === microSkillKey && approved(row),
    );
    const facts = tables.canonical_teaching_dictionary_compound_facts.filter(
      (row) =>
        row.micro_skill_key === microSkillKey &&
        approved(row) &&
        row.assignment_eligible === true,
    );
    return {
      declared: Boolean(profile),
      enabled: profile?.production_enabled === true,
      authentic: facts.length,
      transfer: facts.filter((row) => row.transfer_eligible === true).length,
    };
  }
  const families =
    tables.canonical_teaching_dictionary_base_word_families.filter(
      (row) => row.micro_skill_key === microSkillKey && approved(row),
    );
  const familyIds = new Set(families.map((row) => row.id));
  const members =
    tables.canonical_teaching_dictionary_base_word_family_members.filter(
      (row) =>
        familyIds.has(row.base_word_family_id) &&
        approved(row) &&
        row.assignment_eligible === true,
    );
  return {
    declared: families.length > 0,
    enabled: families.length > 0,
    authentic: members.filter((row) => row.member_role === "authentic_target")
      .length,
    transfer: members.filter((row) =>
      ["base", "transfer"].includes(row.member_role),
    ).length,
  };
}

export async function buildLiveReadinessInput(input: {
  config: LiveReadinessAuditConfig;
  serviceRoleKey: string;
  mode: Extract<ReadinessAuditMode, "live/report" | "live/strict">;
}): Promise<{
  mode: ReadinessAuditMode;
  routes: readonly CurriculumRouteDefinition[];
  microSkills: ProductionMicroSkillAuditInput[];
}> {
  const client = createClient(input.config.supabaseUrl, input.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const entries = await Promise.all(
    LIVE_TABLES.map(async (table) => [table, await selectAll(client, table)] as const),
  );
  const tables = Object.fromEntries(entries) as Record<LiveReadinessTable, Row[]>;
  const catalog = new Map(
    tables.micro_skill_catalog.map((row) => [row.micro_skill_key, row]),
  );
  const productionRoutes = ADLE_CURRICULUM_ROUTE_REGISTRY.filter(
    (route) =>
      route.implementationState === "registered" &&
      route.compatibilityScope.kind === "declared_micro_skills",
  );
  return {
    mode: input.mode,
    routes: ADLE_CURRICULUM_ROUTE_REGISTRY,
    microSkills: productionRoutes.flatMap((route) =>
      route.supportedMicroSkillKeys.map((microSkillKey) => {
        const profile = profileFor(route, microSkillKey, tables);
        const catalogRow = catalog.get(microSkillKey);
        const minimumCompanions = Math.max(
          0,
          route.wordCounts.lesson[0] - route.wordCounts.authentic[0],
        );
        return {
          microSkillKey,
          route,
          taxonomyActive: Boolean(
            catalogRow?.is_active && catalogRow?.is_assignable,
          ),
          profileDeclared: profile.declared,
          profileProductionEnabled: profile.enabled,
          // Exact canonical facts are not inferred from profile membership.
          wordAssessments: null,
          eligibleAuthenticWordCount: profile.authentic,
          eligibleTransferWordCount: profile.transfer,
          groupCompositionValid:
            profile.authentic >= route.wordCounts.authentic[0] &&
            profile.transfer >= minimumCompanions,
          assignmentConstructionValid: null,
          persistedPayloadValid: null,
          runtimeReconstructionValid: null,
          activityBindingsValid: true,
          dependencyFingerprint: createHash("sha256")
            .update(
              JSON.stringify({
                route: `${route.routeId}:${route.routeVersion}`,
                microSkillKey,
                taxonomyActive: Boolean(
                  catalogRow?.is_active && catalogRow?.is_assignable,
                ),
                profile,
              }),
            )
            .digest("hex"),
        };
      }),
    ),
  };
}

const LIVE_TABLES = [
  "micro_skill_catalog",
  "canonical_teaching_dictionary_prefix_profiles",
  "canonical_teaching_dictionary_prefix_members",
  "canonical_teaching_dictionary_suffix_profiles",
  "canonical_teaching_dictionary_suffix_members",
  "canonical_teaching_dictionary_compound_profiles",
  "canonical_teaching_dictionary_compound_facts",
  "canonical_teaching_dictionary_base_word_families",
  "canonical_teaching_dictionary_base_word_family_members",
] as const satisfies readonly LiveReadinessTable[];
