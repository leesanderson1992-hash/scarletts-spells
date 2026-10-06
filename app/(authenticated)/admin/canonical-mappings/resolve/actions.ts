"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createSpellingCanonicalMappingAdmin, enableResolverVisibilityForCanonicalMappingAdmin } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

const PATH = "/admin/canonical-mappings/resolve";
const value = (form: FormData, key: string, length = 200) => String(form.get(key) ?? "").trim().slice(0, length);
const target = (word: string, skill: string, kind?: "saved" | "error", message?: string) => {
  const params = new URLSearchParams({ word, skill });
  if (kind && message) params.set(kind, message);
  return `${PATH}?${params}`;
};

async function validateSource(word: string, skill: string, sourceId: string) {
  const db = createServiceRoleClient();
  const [source, candidate, dictionary] = await Promise.all([
    db.from("parent_verified_spelling_candidate_mappings")
      .select("id,misspelling_normalized,correct_spelling_normalized,micro_skill_key")
      .eq("id", sourceId).maybeSingle(),
    db.from("adle_canonical_intake_candidates").select("id").eq("source_candidate_mapping_id", sourceId)
      .eq("normalized_target_token", word).eq("micro_skill_key", skill).limit(1),
    db.from("canonical_teaching_dictionary_words").select("id").eq("normalised_word", word)
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").limit(2),
  ]);
  if (source.error || candidate.error || dictionary.error || !source.data || !candidate.data?.length ||
    dictionary.data?.length !== 1 || source.data.correct_spelling_normalized !== word || source.data.micro_skill_key !== skill)
    throw new Error("This intake source or approved dictionary word is no longer available.");
  return source.data;
}

export async function createIntakeResolverMapping(form: FormData) {
  const admin = await requireAdminUser();
  const word = value(form, "word").toLowerCase();
  const skill = value(form, "skill");
  const sourceId = value(form, "source_id", 80);
  const note = value(form, "note", 600);
  if (!word || !skill || !sourceId || !note) redirect(target(word, skill, "error", "A source and review note are required."));
  try {
    const source = await validateSource(word, skill, sourceId);
    await createSpellingCanonicalMappingAdmin({ mapping: {
      misspellingNormalized: source.misspelling_normalized, correctSpellingNormalized: word,
      microSkillKey: skill, adminUserId: admin.id, adminEmail: admin.email,
      decisionNote: note, metadata: { action_source: "adle_readiness_resolver" },
    } });
  } catch (error) {
    redirect(target(word, skill, "error", error instanceof Error ? error.message : "Mapping could not be created."));
  }
  revalidatePath(PATH);
  revalidatePath("/admin/adle-canonical-intake-readiness");
  redirect(target(word, skill, "saved", "Mapping created hidden. Enable resolver visibility after review."));
}

export async function enableIntakeResolverMapping(form: FormData) {
  const admin = await requireAdminUser();
  const word = value(form, "word").toLowerCase();
  const skill = value(form, "skill");
  const mappingId = value(form, "mapping_id", 80);
  const note = value(form, "note", 600);
  if (!word || !skill || !mappingId || !note) redirect(target(word, skill, "error", "A mapping and review note are required."));
  const db = createServiceRoleClient();
  const mapping = await db.from("spelling_canonical_mappings")
    .select("id,correct_spelling_normalized,micro_skill_key,mapping_status")
    .eq("id", mappingId).maybeSingle();
  if (mapping.error || !mapping.data || mapping.data.correct_spelling_normalized !== word ||
    mapping.data.micro_skill_key !== skill || mapping.data.mapping_status !== "active")
    redirect(target(word, skill, "error", "The active exact-pair mapping changed. Reload and review it."));
  try {
    await enableResolverVisibilityForCanonicalMappingAdmin({ mapping: { mappingId, adminUserId: admin.id,
      adminEmail: admin.email, note, metadata: { action_source: "adle_readiness_resolver" } } });
  } catch (error) {
    redirect(target(word, skill, "error", error instanceof Error ? error.message : "Visibility could not be enabled."));
  }
  revalidatePath(PATH);
  revalidatePath("/admin/adle-canonical-intake-readiness");
  redirect(target(word, skill, "saved", "Resolver visibility enabled. Recheck the intake row."));
}
