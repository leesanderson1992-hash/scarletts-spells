import {
  dynamicAffixExpectedItemCount,
  validateDynamicAffixWordLabPayload,
  type DynamicAffixLessonPayloadV3,
  type DynamicAffixSelection,
} from "./affix-word-lab";
import { dynamicAffixRuntime } from "./dynamic-affix-runtime";
import {
  adaptSharedAffixLessonToDynamicAffixV3,
  canonicalDynamicAffixPublicV3Bytes,
  fingerprintDynamicAffixPublicV3Bytes,
} from "./shared-affix-compatibility";
import type { CompiledAffixLessonV1 } from "./shared-affix-contracts";

export type DynamicAffixV3CompatibilityBlockerCode =
  | "adapter_payload_invalid"
  | "public_payload_byte_mismatch"
  | "completion_role_mismatch";

export type DynamicAffixV3CompatibilityResult =
  | {
      ok: true;
      publicBytes: string;
      publicFingerprint: string;
      itemCount: number;
    }
  | { ok: false; blockerCode: DynamicAffixV3CompatibilityBlockerCode };

function exactIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * New-write-only V3 validation. Historical V3 readers continue to use the
 * unchanged permissive validator in affix-word-lab.ts.
 */
export function validateDynamicAffixV3ForNewWrite(params: {
  payload: DynamicAffixLessonPayloadV3;
  selection: DynamicAffixSelection;
  sharedLesson?: CompiledAffixLessonV1 | null;
  parityPayload?: DynamicAffixLessonPayloadV3 | null;
  parityPublicBytes?: string | null;
}): DynamicAffixV3CompatibilityResult {
  const { payload, selection, sharedLesson, parityPayload, parityPublicBytes } = params;
  if (!validateDynamicAffixWordLabPayload(payload) || !dynamicAffixRuntime(payload)) {
    return { ok: false, blockerCode: "adapter_payload_invalid" };
  }
  const authenticIds = selection.authenticTargets.map((item) => item.canonicalWordId);
  const transferIds = selection.transfers.map((word) => word.canonicalWordId);
  const lessonIds = payload.words.lesson.map((word) => word.canonicalWordId);
  const roleAuthenticIds = payload.words.lesson
    .filter((word) => word.source === "authentic")
    .map((word) => word.canonicalWordId);
  const roleTransferIds = payload.words.lesson
    .filter((word) => word.source === "transfer")
    .map((word) => word.canonicalWordId);
  if (
    !exactIds(payload.authenticCanonicalWordIds, authenticIds)
    || !exactIds(lessonIds, [...authenticIds, ...transferIds])
    || !exactIds(roleAuthenticIds, authenticIds)
    || !exactIds(roleTransferIds, transferIds)
    || new Set(lessonIds).size !== lessonIds.length
  ) {
    return { ok: false, blockerCode: "completion_role_mismatch" };
  }
  if (sharedLesson) {
    const sharedAuthentic = sharedLesson.words
      .filter((word) => word.role === "authentic_target")
      .map((word) => word.canonicalWordId);
    const sharedTransfers = sharedLesson.words
      .filter((word) => word.role === "transfer")
      .map((word) => word.canonicalWordId);
    if (
      !exactIds(sharedAuthentic, authenticIds)
      || !exactIds(sharedTransfers, transferIds)
      || !exactIds(sharedLesson.completion.scheduleWordIds, authenticIds)
      || !exactIds(sharedLesson.completion.rewardWordIds, lessonIds)
    ) {
      return { ok: false, blockerCode: "completion_role_mismatch" };
    }
    const expected = adaptSharedAffixLessonToDynamicAffixV3(sharedLesson);
    if (
      !expected.ok
      || canonicalDynamicAffixPublicV3Bytes(expected.payload)
        !== canonicalDynamicAffixPublicV3Bytes(payload)
    ) {
      return { ok: false, blockerCode: "public_payload_byte_mismatch" };
    }
  }
  const publicBytes = canonicalDynamicAffixPublicV3Bytes(payload);
  const expectedParityBytes = parityPublicBytes
    ?? (parityPayload ? canonicalDynamicAffixPublicV3Bytes(parityPayload) : null);
  if (expectedParityBytes && publicBytes !== expectedParityBytes) {
    return { ok: false, blockerCode: "public_payload_byte_mismatch" };
  }
  return {
    ok: true,
    publicBytes,
    publicFingerprint: fingerprintDynamicAffixPublicV3Bytes(publicBytes),
    itemCount: dynamicAffixExpectedItemCount(payload),
  };
}
