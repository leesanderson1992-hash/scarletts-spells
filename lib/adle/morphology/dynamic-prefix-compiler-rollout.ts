import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import {
  DYNAMIC_PREFIX_WORD_LAB_PROFILE,
  validateDynamicPrefixWordLabPayload,
  type DynamicPrefixLessonPayloadV2,
  type DynamicPrefixSelection,
} from "./dynamic-prefix-contracts";
import { compileDynamicPrefixWordLabPayloadLegacy } from "./dynamic-prefix-legacy-compiler";
import {
  compareSharedAffixPayloadParity,
  compileDynamicPrefixSelectionThroughSharedCompiler,
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

export const DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS = [
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
] as const;

export const DYNAMIC_PREFIX_COMPILER_AUTHORITIES = [
  { microSkillKey: "D4_MOR_PREFIXES_UN", authority: "legacy_pending_exact_source" },
  ...DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS.map((microSkillKey) => ({
    microSkillKey,
    authority: "shared_migration" as const,
  })),
] as const;

export type DynamicPrefixCompilerMode =
  | "shadow"
  | "enforced_parity"
  | "shared_authoritative";

export type DynamicPrefixCompilerAuthority =
  | "legacy_pending_exact_source"
  | "shared_migration";

export const DYNAMIC_PREFIX_COMPILER_BLOCKER_CODES = [
  "missing_profile_mapping",
  "legacy_payload_invalid",
  "selected_word_not_in_profile",
  "shared_compiler_blocked",
  "source_fingerprint_mismatch",
  "lesson_fingerprint_mismatch",
  "adapter_payload_invalid",
  "semantic_parity_mismatch",
  "assignment_plan_mismatch",
  "assignment_binding_mismatch",
  "assignment_item_count_mismatch",
  "unsupported_rollout_state",
] as const;

export type DynamicPrefixCompilerBlockerCode =
  (typeof DYNAMIC_PREFIX_COMPILER_BLOCKER_CODES)[number];

export type DynamicPrefixCompilerParity =
  | "matched"
  | "not_run"
  | "shared_blocked"
  | "mismatched"
  | "legacy_deferred";

export interface DynamicPrefixCompilerMetrics {
  legacyMs: number;
  sharedMs: number;
  compareMs: number;
  totalMs: number;
  legacyInvoked: boolean;
}

interface DynamicPrefixCompilerDecisionBase {
  profileKey: string;
  profileVersion: typeof DYNAMIC_PREFIX_WORD_LAB_PROFILE;
  compilerVersion: typeof SHARED_AFFIX_COMPILER_VERSION;
  mode: DynamicPrefixCompilerMode;
  authority: DynamicPrefixCompilerAuthority | null;
  parity: DynamicPrefixCompilerParity;
  blockerCode?: DynamicPrefixCompilerBlockerCode;
  sharedBlockerCodes?: readonly SharedAffixBlockerCode[];
  sourceFingerprint?: string;
  outputFingerprint?: string;
  metrics: DynamicPrefixCompilerMetrics;
}

export type DynamicPrefixCompilerDecision =
  | (DynamicPrefixCompilerDecisionBase & {
      ok: true;
      payload: DynamicPrefixLessonPayloadV2;
      sharedLesson: CompiledAffixLessonV1 | null;
    })
  | (DynamicPrefixCompilerDecisionBase & {
      ok: false;
    });

export interface DynamicPrefixCompilerDecisionOptions {
  mode?: DynamicPrefixCompilerMode;
  sourceKind?: AffixLessonCompilationInputV1["provenance"]["sourceKind"];
  /** Deterministic regression hooks; production callers never supply these. */
  legacyCompiler?: typeof compileDynamicPrefixWordLabPayloadLegacy;
  /** Deterministic regression hooks; production callers never supply these. */
  sharedCompiler?: typeof compileDynamicPrefixSelectionThroughSharedCompiler;
}

const VALID_MODES = new Set<DynamicPrefixCompilerMode>([
  "shadow",
  "enforced_parity",
  "shared_authoritative",
]);

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}

function payloadFingerprint(payload: DynamicPrefixLessonPayloadV2): string {
  return fingerprintSnapshotValue(JSON.parse(JSON.stringify(payload)) as unknown);
}

export function resolveDynamicPrefixCompilerMode(
  value = process.env.ADLE_DYNAMIC_PREFIX_COMPILER_MODE,
): DynamicPrefixCompilerMode {
  return VALID_MODES.has(value as DynamicPrefixCompilerMode)
    ? value as DynamicPrefixCompilerMode
    : "shadow";
}

export function getDynamicPrefixCompilerAuthority(
  microSkillKey: string,
): DynamicPrefixCompilerAuthority | null {
  return DYNAMIC_PREFIX_COMPILER_AUTHORITIES.find(
    (entry) => entry.microSkillKey === microSkillKey,
  )?.authority ?? null;
}

function baseDecision(
  selection: DynamicPrefixSelection,
  mode: DynamicPrefixCompilerMode,
  authority: DynamicPrefixCompilerAuthority | null,
  metrics: DynamicPrefixCompilerMetrics,
): DynamicPrefixCompilerDecisionBase {
  return {
    profileKey: selection.profile.microSkillKey,
    profileVersion: DYNAMIC_PREFIX_WORD_LAB_PROFILE,
    compilerVersion: SHARED_AFFIX_COMPILER_VERSION,
    mode,
    authority,
    parity: "not_run",
    metrics,
  };
}

export function validateDynamicPrefixSharedResultIntegrity(
  result: SharedAffixShadowResult<DynamicPrefixLessonPayloadV2>,
): DynamicPrefixCompilerBlockerCode | null {
  if (!result.ok) return "shared_compiler_blocked";
  if (result.lesson.provenance.sourceFingerprint !== fingerprintSharedAffixInput(result.input)) {
    return "source_fingerprint_mismatch";
  }
  const { fingerprint, ...draft } = result.lesson;
  if (fingerprint !== fingerprintCompiledSharedAffixLesson(draft)) {
    return "lesson_fingerprint_mismatch";
  }
  if (!validateDynamicPrefixWordLabPayload(result.payload)) {
    return "adapter_payload_invalid";
  }
  return null;
}

export function compileDynamicPrefixWordLabDecision(
  selection: DynamicPrefixSelection,
  options: DynamicPrefixCompilerDecisionOptions = {},
): DynamicPrefixCompilerDecision {
  const startedAt = performance.now();
  const metrics: DynamicPrefixCompilerMetrics = {
    legacyMs: 0,
    sharedMs: 0,
    compareMs: 0,
    totalMs: 0,
    legacyInvoked: false,
  };
  const mode = options.mode ?? resolveDynamicPrefixCompilerMode();
  const authority = getDynamicPrefixCompilerAuthority(selection.profile.microSkillKey);
  const legacyCompiler = options.legacyCompiler ?? compileDynamicPrefixWordLabPayloadLegacy;
  const sharedCompiler = options.sharedCompiler ?? compileDynamicPrefixSelectionThroughSharedCompiler;
  const finish = <T extends DynamicPrefixCompilerDecision>(decision: T): T => {
    decision.metrics.totalMs = elapsed(startedAt);
    return decision;
  };
  if (!authority) {
    return finish({
      ...baseDecision(selection, mode, null, metrics),
      ok: false,
      blockerCode: "missing_profile_mapping",
    });
  }
  if (!VALID_MODES.has(mode)) {
    return finish({
      ...baseDecision(selection, "shadow", authority, metrics),
      ok: false,
      blockerCode: "unsupported_rollout_state",
    });
  }

  if (authority === "legacy_pending_exact_source") {
    const legacyStartedAt = performance.now();
    metrics.legacyInvoked = true;
    const payload = legacyCompiler(selection);
    metrics.legacyMs = elapsed(legacyStartedAt);
    if (!payload || !validateDynamicPrefixWordLabPayload(payload)) {
      return finish({
        ...baseDecision(selection, mode, authority, metrics),
        ok: false,
        parity: "legacy_deferred",
        blockerCode: "legacy_payload_invalid",
      });
    }
    return finish({
      ...baseDecision(selection, mode, authority, metrics),
      ok: true,
      payload,
      sharedLesson: null,
      parity: "legacy_deferred",
      outputFingerprint: payloadFingerprint(payload),
    });
  }

  let legacyPayload: DynamicPrefixLessonPayloadV2 | null = null;
  if (mode !== "shared_authoritative") {
    const legacyStartedAt = performance.now();
    metrics.legacyInvoked = true;
    legacyPayload = legacyCompiler(selection);
    metrics.legacyMs = elapsed(legacyStartedAt);
    if (!legacyPayload || !validateDynamicPrefixWordLabPayload(legacyPayload)) {
      return finish({
        ...baseDecision(selection, mode, authority, metrics),
        ok: false,
        blockerCode: "legacy_payload_invalid",
      });
    }
  }

  const sharedStartedAt = performance.now();
  const shared = sharedCompiler(
    selection,
    options.sourceKind ?? "teaching_dictionary",
  );
  metrics.sharedMs = elapsed(sharedStartedAt);
  const sharedBlocker = !shared.ok && shared.blockers.some(
    (entry) => entry.code === "selected_word_not_in_profile",
  )
    ? "selected_word_not_in_profile"
    : validateDynamicPrefixSharedResultIntegrity(shared);
  if (sharedBlocker || !shared.ok) {
    const sharedBlockerCodes = shared.ok
      ? undefined
      : shared.blockers.map((entry) => entry.code);
    if (mode === "shadow" && legacyPayload) {
      return finish({
        ...baseDecision(selection, mode, authority, metrics),
        ok: true,
        payload: legacyPayload,
        sharedLesson: null,
        parity: "shared_blocked",
        blockerCode: sharedBlocker ?? "shared_compiler_blocked",
        sharedBlockerCodes,
        outputFingerprint: payloadFingerprint(legacyPayload),
      });
    }
    return finish({
      ...baseDecision(selection, mode, authority, metrics),
      ok: false,
      blockerCode: sharedBlocker ?? "shared_compiler_blocked",
      sharedBlockerCodes,
    });
  }

  if (mode !== "shared_authoritative" && legacyPayload) {
    const compareStartedAt = performance.now();
    const parity = compareSharedAffixPayloadParity(legacyPayload, shared.payload);
    metrics.compareMs = elapsed(compareStartedAt);
    if (!parity.ok) {
      if (mode === "shadow") {
        return finish({
          ...baseDecision(selection, mode, authority, metrics),
          ok: true,
          payload: legacyPayload,
          sharedLesson: shared.lesson,
          parity: "mismatched",
          blockerCode: "semantic_parity_mismatch",
          sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
          outputFingerprint: payloadFingerprint(legacyPayload),
        });
      }
      return finish({
        ...baseDecision(selection, mode, authority, metrics),
        ok: false,
        parity: "mismatched",
        blockerCode: "semantic_parity_mismatch",
        sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
        outputFingerprint: shared.lesson.fingerprint,
      });
    }
  }

  const payload = mode === "shadow" && legacyPayload ? legacyPayload : shared.payload;
  return finish({
    ...baseDecision(selection, mode, authority, metrics),
    ok: true,
    payload,
    sharedLesson: shared.lesson,
    parity: mode === "shared_authoritative" ? "not_run" : "matched",
    sourceFingerprint: shared.lesson.provenance.sourceFingerprint,
    outputFingerprint: shared.lesson.fingerprint,
  });
}

/** Single gate used immediately before the assignment persistence boundary. */
export function canPersistDynamicPrefixCompilerDecision(
  decision: DynamicPrefixCompilerDecision,
  planBlockerCode?: DynamicPrefixCompilerBlockerCode,
): boolean {
  if (!decision.ok) return false;
  return !planBlockerCode || decision.mode === "shadow";
}

export function emitDynamicPrefixCompilerDecision(
  decision: DynamicPrefixCompilerDecision,
  override: {
    blockerCode?: DynamicPrefixCompilerBlockerCode;
    parity?: DynamicPrefixCompilerParity;
  } = {},
): void {
  const blockerCode = override.blockerCode ?? decision.blockerCode;
  const parity = override.parity ?? decision.parity;
  const event = {
    event: blockerCode
      ? "adle_dynamic_prefix_compiler_blocker"
      : "adle_dynamic_prefix_compiler_decision",
    routeId: "dynamic_prefix_word_lab",
    routeVersion: "v2",
    profileKey: decision.profileKey,
    profileVersion: decision.profileVersion,
    compilerVersion: decision.compilerVersion,
    rolloutMode: decision.mode,
    parityOutcome: parity,
    ...(blockerCode ? { blockerCode } : {}),
    ...(decision.sourceFingerprint
      ? { sourceFingerprint: decision.sourceFingerprint.slice(0, 12) }
      : {}),
    ...(decision.outputFingerprint
      ? { outputFingerprint: decision.outputFingerprint.slice(0, 12) }
      : {}),
    legacyMs: decision.metrics.legacyMs,
    sharedMs: decision.metrics.sharedMs,
    compareMs: decision.metrics.compareMs,
    totalMs: decision.metrics.totalMs,
  };
  if (blockerCode || parity === "mismatched" || parity === "shared_blocked") {
    console.warn(JSON.stringify(event));
    return;
  }
  if (process.env.VERCEL_ENV !== "production" || Math.random() < 0.01) {
    console.info(JSON.stringify(event));
  }
}
