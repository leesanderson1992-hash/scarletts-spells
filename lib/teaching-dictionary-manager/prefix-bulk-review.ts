import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { publicationBlockers, routeBlockers, type WordDraftPayload } from "./contracts";
import { PREFIX_WORKBOOK_ROUTE, prefixWorkbooks, type PrefixWorkbookSkill } from "./prefix-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;

export function prefixWorkbookBlockers(payload: WordDraftPayload, skill: PrefixWorkbookSkill) {
  const route = payload.routeContents.find(row => row.microSkillKey === skill && row.routeId === PREFIX_WORKBOOK_ROUTE);
  if (!route) return ["The prefix lesson draft is missing."];
  return [...new Set([...publicationBlockers(payload, payload.displayWord.toLocaleLowerCase("en-GB")), ...routeBlockers(route, payload)])];
}

export async function loadPrefixWorkbookQueue(db: Db, skill: PrefixWorkbookSkill, wordIds: string[]) {
  if (!wordIds.length) return [];
  const { data, error } = await db.from("teaching_dictionary_manager_drafts").select("id,canonical_word_id,payload,source_reference")
    .in("canonical_word_id", wordIds).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (error) throw new Error("Could not load the prefix workbook drafts.");
  const latest = new Map<string, typeof data[number]>();
  for (const row of data) if (row.canonical_word_id && !latest.has(row.canonical_word_id)) latest.set(row.canonical_word_id, row);
  return [...latest.values()].filter(row => row.source_reference === prefixWorkbooks[skill].source).map(row => {
    const payload = row.payload as WordDraftPayload;
    return { id: row.id, wordId: row.canonical_word_id!, payload, blockers: prefixWorkbookBlockers(payload, skill) };
  });
}

export async function loadPendingPrefixWorkbookQueue(db: Db, skill: PrefixWorkbookSkill) {
  const candidates = await db.from("teaching_dictionary_manager_drafts").select("canonical_word_id")
    .eq("source_reference", prefixWorkbooks[skill].source).order("created_at", { ascending: false }).limit(300);
  if (candidates.error) throw new Error("Could not load the prefix workbook queue.");
  const ids = [...new Set(candidates.data.flatMap(row => row.canonical_word_id ? [row.canonical_word_id] : []))];
  const rows = await loadPrefixWorkbookQueue(db, skill, ids);
  if (!rows.length) return [];
  const versions = await db.from("teaching_dictionary_route_content_versions").select("id,draft_id")
    .in("draft_id", rows.map(row => row.id)).eq("route_id", PREFIX_WORKBOOK_ROUTE).eq("micro_skill_key", skill);
  if (versions.error) throw new Error("Could not check the prefix workbook publications.");
  if (!versions.data.length) return rows;
  const versionIds = versions.data.map(row => row.id);
  const [published, rolledBack] = await Promise.all([
    db.from("teaching_dictionary_route_content_publications").select("content_version_id").in("content_version_id", versionIds),
    db.from("teaching_dictionary_route_content_rollbacks").select("content_version_id").in("content_version_id", versionIds),
  ]);
  if (published.error || rolledBack.error) throw new Error("Could not check the published prefix drafts.");
  const rolledBackIds = new Set(rolledBack.data.map(row => row.content_version_id));
  const publishedIds = new Set(published.data.filter(row => !rolledBackIds.has(row.content_version_id)).map(row => row.content_version_id));
  const completed = new Set(versions.data.filter(row => publishedIds.has(row.id)).map(row => row.draft_id));
  return rows.filter(row => !completed.has(row.id));
}
