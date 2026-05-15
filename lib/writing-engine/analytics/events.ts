import type {
  ParentVerificationRecord,
  WritingEngineAnalyticsEvent,
} from "../types";

export function buildParentVerificationRecordedEvent(
  verification: ParentVerificationRecord,
): WritingEngineAnalyticsEvent {
  return {
    eventType: "parent_verification_recorded",
    domainModule: verification.domainModule,
    childId: verification.childId,
    parentUserId: verification.parentUserId,
    sourceRef: verification.sourceRef,
    metadata: {
      decision: verification.decision,
      verifiedCategoryCode: verification.verifiedCategoryCode,
      verifiedMicroSkillKey: verification.verifiedMicroSkillKey,
      verifiedTemplateKey: verification.verifiedTemplateKey,
    },
  };
}
