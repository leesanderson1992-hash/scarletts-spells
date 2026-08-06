import {
  DYNAMIC_AFFIX_WORD_LAB_PROFILE,
  type DynamicAffixLessonPayloadV3,
  type DynamicAffixSelection,
} from "./affix-word-lab";
import { compileDynamicAffixWordLabPayloadLegacy } from "./dynamic-affix-legacy-compiler";
import {
  validateDynamicAffixV3ForNewWrite,
  type DynamicAffixV3CompatibilityBlockerCode,
} from "./dynamic-affix-v3-compatibility";
import {
  compileDynamicAffixSelectionThroughSharedCompiler,
  type SharedAffixShadowResult,
} from "./shared-affix-compatibility";
import {
  SHARED_AFFIX_COMPILER_VERSION,
  type AffixLessonCompilationInputV1,
  type CompiledAffixLessonV1,
  type SharedAffixBlockerCode,
} from "./shared-affix-contracts";
import {
  fingerprintCompiledSharedAffixLesson,
  fingerprintSharedAffixInput,
} from "./shared-affix-compiler";

export const DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS = [
  "D4_MOR_SUFFIXES_NESS",
  "D4_MOR_SUFFIXES_ABLE_IBLE",
  "D4_MOR_SUFFIXES_MENT",
  "D4_MOR_SUFFIXES_FUL_LESS",
  "D4_MOR_SUFFIXES_AL",
  "D4_MOR_SUFFIXES_ITY",
  "D4_MOR_SUFFIXES_OUS",
  "D4_MOR_SUFFIXES_LY",
  "D4_MOR_SUFFIXES_TION",
  "D4_MOR_SUFFIXES_SION",
] as const;

export const DYNAMIC_AFFIX_COMPILER_AUTHORITIES =
  DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS.map((microSkillKey) => ({
    microSkillKey,
    authority: "shared_migration" as const,
  }));

export type DynamicAffixCompilerMode =
  | "legacy_authoritative"
  | "shadow"
  | "enforced_parity"
  | "shared_authoritative";

export const DYNAMIC_AFFIX_COMPILER_BLOCKER_CODES = [
  "missing_profile_mapping",
  "profile_validation_failed",
  "member_validation_failed",
  "legacy_payload_invalid",
  "selected_word_not_in_profile",
  "shared_compiler_blocked",
  "source_fingerprint_mismatch",
  "lesson_fingerprint_mismatch",
  "adapter_payload_invalid",
  "public_payload_byte_mismatch",
  "semantic_parity_mismatch",
  "assignment_plan_mismatch",
  "assignment_binding_mismatch",
  "assignment_item_count_mismatch",
  "completion_role_mismatch",
  "unsupported_rollout_state",
] as const;

export type DynamicAffixCompilerBlockerCode =
  (typeof DYNAMIC_AFFIX_COMPILER_BLOCKER_CODES)[number];
export type DynamicAffixCompilerParity =
  | "matched"
  | "not_run"
  | "shared_blocked"
  | "mismatched";

export interface DynamicAffixCompilerMetrics {
  legacyMs: number;
  sharedMs: number;
  compareMs: number;
  totalMs: number;
  legacyInvoked: boolean;
}

interface DecisionBase {
  profileKey: string;
  profileVersion: typeof DYNAMIC_AFFIX_WORD_LAB_PROFILE;
  compilerVersion: typeof SHARED_AFFIX_COMPILER_VERSION;
  mode: DynamicAffixCompilerMode | "unsupported";
  authority: "shared_migration" | null;
  parity: DynamicAffixCompilerParity;
  blockerCode?: DynamicAffixCompilerBlockerCode;
  sharedBlockerCodes?: readonly SharedAffixBlockerCode[];
  sourceFingerprint?: string;
  lessonFingerprint?: string;
  publicFingerprint?: string;
  metrics: DynamicAffixCompilerMetrics;
}

export type DynamicAffixCompilerDecision =
  | (DecisionBase & {
      ok: true;
      payload: DynamicAffixLessonPayloadV3;
      sharedLesson: CompiledAffixLessonV1 | null;
    })
  | (DecisionBase & { ok: false });

export interface DynamicAffixCompilerDecisionOptions {
  mode?: DynamicAffixCompilerMode | string;
  sourceKind?: AffixLessonCompilationInputV1["provenance"]["sourceKind"];
  purpose?: "readiness_preview" | "writer";
  legacyCompiler?: typeof compileDynamicAffixWordLabPayloadLegacy;
  sharedCompiler?: typeof compileDynamicAffixSelectionThroughSharedCompiler;
}

const VALID_MODES = new Set<DynamicAffixCompilerMode>([
  "legacy_authoritative",
  "shadow",
  "enforced_parity",
  "shared_authoritative",
]);

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}

export function resolveDynamicAffixCompilerMode(
  value = process.env.ADLE_DYNAMIC_AFFIX_COMPILER_MODE,
): DynamicAffixCompilerMode | null {
  if (value === undefined || value.trim() === "") return "legacy_authoritative";
  return VALID_MODES.has(value as DynamicAffixCompilerMode)
    ? value as DynamicAffixCompilerMode
    : null;
}

export function getDynamicAffixCompilerAuthority(
  microSkillKey: string,
): "shared_migration" | null {
  return DYNAMIC_AFFIX_COMPILER_AUTHORITIES.find(
    (entry) => entry.microSkillKey === microSkillKey,
  )?.authority ?? null;
}

function base(
  selection: DynamicAffixSelection,
  mode: DecisionBase["mode"],
  authority: DecisionBase["authority"],
  metrics: DynamicAffixCompilerMetrics,
): DecisionBase {
  return {
    profileKey: selection.profile.microSkillKey,
    profileVersion: DYNAMIC_AFFIX_WORD_LAB_PROFILE,
    compilerVersion: SHARED_AFFIX_COMPILER_VERSION,
    mode,
    authority,
    parity: "not_run",
    metrics,
  };
}

export function validateDynamicAffixSharedResultIntegrity(
  result: SharedAffixShadowResult<DynamicAffixLessonPayloadV3>,
): DynamicAffixCompilerBlockerCode | null {
  if (!result.ok) return "shared_compiler_blocked";
  if (result.lesson.provenance.sourceFingerprint !== fingerprintSharedAffixInput(result.input)) {
    return "source_fingerprint_mismatch";
  }
  const { fingerprint, ...draft } = result.lesson;
  if (fingerprint !== fingerprintCompiledSharedAffixLesson(draft)) {
    return "lesson_fingerprint_mismatch";
  }
  return null;
}

function compatibilityBlocker(
  code: DynamicAffixV3CompatibilityBlockerCode,
): DynamicAffixCompilerBlockerCode {
  return code;
}

export function compileDynamicAffixWordLabDecision(
  selection: DynamicAffixSelection,
  options: DynamicAffixCompilerDecisionOptions = {},
): DynamicAffixCompilerDecision {
  const startedAt = performance.now();
  const metrics: DynamicAffixCompilerMetrics = {
    legacyMs: 0,
    sharedMs: 0,
    compareMs: 0,
    totalMs: 0,
    legacyInvoked: false,
  };
  const requestedMode = options.mode ?? process.env.ADLE_DYNAMIC_AFFIX_COMPILER_MODE;
  const mode = resolveDynamicAffixCompilerMode(requestedMode);
  const authority = getDynamicAffixCompilerAuthority(selection.profile.microSkillKey);
  const legacyCompiler = options.legacyCompiler ?? compileDynamicAffixWordLabPayloadLegacy;
  const sharedCompiler = options.sharedCompiler ?? compileDynamicAffixSelectionThroughSharedCompiler;
  const finish = <T extends DynamicAffixCompilerDecision>(decision: T): T => {
    decision.metrics.totalMs = elapsed(startedAt);
    return decision;
  };
  if (!mode) {
    return finish({
      ...base(selection, "unsupported", authority, metrics),
      ok: false,
      blockerCode: "unsupported_rollout_state",
    });
  }
  if (!authority) {
    return finish({
      ...base(selection, mode, null, metrics),
      ok: false,
      blockerCode: "missing_profile_mapping",
    });
  }

  let legacyPayload: DynamicAffixLessonPayloadV3 | null = null;
  let legacyPublicBytes: string | null = null;
  let legacyPublicFingerprint: string | undefined;
  if (mode !== "shared_authoritative") {
    const legacyStartedAt = performance.now();
    metrics.legacyInvoked = true;
    legacyPayload = legacyCompiler(selection);
    metrics.legacyMs = elapsed(legacyStartedAt);
    if (!legacyPayload) {
      return finish({
        ...base(selection, mode, authority, metrics),
        ok: false,
        blockerCode: "legacy_payload_invalid",
      });
    }
    const legacyCompatibility = validateDynamicAffixV3ForNewWrite({
      payload: legacyPayload,
      selection,
    });
    if (!legacyCompatibility.ok) {
      return finish({
        ...base(selection, mode, authority, metrics),
        ok: false,
        blockerCode: legacyCompatibility.blockerCode === "adapter_payload_invalid"
          ? "legacy_payload_invalid"
          : compatibilityBlocker(legacyCompatibility.blockerCode),
      });
    }
    legacyPublicBytes = legacyCompatibility.publicBytes;
    legacyPublicFingerprint = legacyCompatibility.publicFingerprint;
    if (mode === "legacy_authoritative") {
      return finish({
        ...base(selection, mode, authority, metrics),
        ok: true,
        payload: legacyPayload,
        sharedLesson: null,
        publicFingerprint: legacyPublicFingerprint,
        parity: "not_run",
      });
    }
  }

  const sharedStartedAt = performance.now();
  const shared = sharedCompiler(
    selection,
    options.sourceKind ?? "teaching_dictionary",
  );
  metrics.sharedMs = elapsed(sharedStartedAt);
  const selectedWordBlocker = !shared.ok && shared.blockers.some(
    (entry) => entry.code === "selected_word_not_in_profile",
  );
  const integrityBlocker = validateDynamicAffixSharedResultIntegrity(shared);
  if (!shared.ok || integrityBlocker) {
    const blockerCode = selectedWordBlocker
      ? "selected_word_not_in_profile"
      : integrityBlocker ?? "shared_compiler_blocked";
    if (mode === "shadow" && legacyPayload) {
      return finish({
        ...base(selection, mode, authority, metrics),
        ok: true,
        payload: legacyPayload,
        sharedLesson: null,
        parity: "shared_blocked",
        blockerCode,
        sharedBlockerCodes: shared.ok ? undefined : shared.blockers.map((entry) => entry.code),
        publicFingerprint: legacyPublicFingerprint,
      });
    }
    return finish({
      ...base(selection, mode, authority, metrics),
      ok: false,
      blockerCode,
      sharedBlockerCodes: shared.ok ? undefined : shared.blockers.map((entry) => entry.code),
    });
  }

  const sharedCompatibility = validateDynamicAffixV3ForNewWrite({
    payload: shared.payload,
    selection,
    sharedLesson: shared.lesson,
    parityPublicBytes: legacyPublicBytes,
  });
  if (!sharedCompatibility.ok) {
    const blockerCode = compatibilityBlocker(sharedCompatibility.blockerCode);
    if (mode === "shadow" && legacyPayload) {
      return finish({
        ...base(selection, mode, authority, metrics),
        ok: true,
        payload: legacyPayload,
        sharedLesson: shared.lesson,
        parity: "mismatched",
        blockerCode,
        sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
        lessonFingerprint: shared.lesson.fingerprint,
        publicFingerprint: legacyPublicFingerprint,
      });
    }
    return finish({
      ...base(selection, mode, authority, metrics),
      ok: false,
      parity: "mismatched",
      blockerCode,
      sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
      lessonFingerprint: shared.lesson.fingerprint,
    });
  }

  if (legacyPayload) {
    const compareStartedAt = performance.now();
    const canonicalMatches = legacyPublicBytes === sharedCompatibility.publicBytes;
    metrics.compareMs = elapsed(compareStartedAt);
    if (!canonicalMatches) {
      if (mode === "shadow") {
        return finish({
          ...base(selection, mode, authority, metrics),
          ok: true,
          payload: legacyPayload,
          sharedLesson: shared.lesson,
          parity: "mismatched",
          blockerCode: "public_payload_byte_mismatch",
          sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
          lessonFingerprint: shared.lesson.fingerprint,
          publicFingerprint: sharedCompatibility.publicFingerprint,
        });
      }
      return finish({
        ...base(selection, mode, authority, metrics),
        ok: false,
        parity: "mismatched",
        blockerCode: "public_payload_byte_mismatch",
        sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
        lessonFingerprint: shared.lesson.fingerprint,
        publicFingerprint: sharedCompatibility.publicFingerprint,
      });
    }
  }

  return finish({
    ...base(selection, mode, authority, metrics),
    ok: true,
    payload: mode === "shadow" && legacyPayload ? legacyPayload : shared.payload,
    sharedLesson: shared.lesson,
    parity: mode === "shared_authoritative" ? "not_run" : "matched",
    sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
    lessonFingerprint: shared.lesson.fingerprint,
    publicFingerprint: sharedCompatibility.publicFingerprint,
  });
}

export function canPersistDynamicAffixCompilerDecision(
  decision: DynamicAffixCompilerDecision,
  planBlockerCode?: DynamicAffixCompilerBlockerCode,
): boolean {
  if (!decision.ok) return false;
  return !planBlockerCode || decision.mode === "shadow";
}

export function emitDynamicAffixCompilerDecision(
  decision: DynamicAffixCompilerDecision,
  input: {
    purpose: "readiness_preview" | "writer";
    blockerCode?: DynamicAffixCompilerBlockerCode;
    parity?: DynamicAffixCompilerParity;
  },
): void {
  const blockerCode = input.blockerCode ?? decision.blockerCode;
  const parity = input.parity ?? decision.parity;
  const event = {
    event: blockerCode
      ? "adle_dynamic_affix_compiler_blocker"
      : "adle_dynamic_affix_compiler_decision",
    purpose: input.purpose,
    routeId: "dynamic_affix_word_lab",
    routeVersion: "v3",
    profileKey: decision.profileKey,
    profileVersion: decision.profileVersion,
    compilerVersion: decision.compilerVersion,
    rolloutMode: decision.mode,
    authority: decision.authority,
    parityOutcome: parity,
    legacyInvoked: decision.metrics.legacyInvoked,
    ...(blockerCode ? { blockerCode } : {}),
    ...(decision.sourceFingerprint ? { sourceFingerprint: decision.sourceFingerprint.slice(0, 12) } : {}),
    ...(decision.lessonFingerprint ? { lessonFingerprint: decision.lessonFingerprint.slice(0, 12) } : {}),
    ...(decision.publicFingerprint ? { publicFingerprint: decision.publicFingerprint.slice(0, 12) } : {}),
    legacyMs: decision.metrics.legacyMs,
    sharedMs: decision.metrics.sharedMs,
    compareMs: decision.metrics.compareMs,
    totalMs: decision.metrics.totalMs,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };
  if (blockerCode || parity === "mismatched" || parity === "shared_blocked") {
    console.warn(JSON.stringify(event));
    return;
  }
  if (
    input.purpose === "writer"
    || process.env.VERCEL_ENV !== "production"
    || Math.random() < 0.01
  ) {
    console.info(JSON.stringify(event));
  }
}
