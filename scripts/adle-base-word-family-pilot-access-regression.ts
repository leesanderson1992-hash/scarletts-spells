import { isBaseWordFamilyPilotEnabledForChild } from "../lib/adle/morphology/base-word-family-pilot-access";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const saved = {
  enabled: process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED,
  emergency: process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED,
  scope: process.env.ADLE_BASE_WORD_FAMILY_PILOT_SCOPE,
  children: process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS,
};
try {
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED = "enabled";
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED = "false";
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_SCOPE = "allowlist";
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS = "approved-child";
  assert(isBaseWordFamilyPilotEnabledForChild("approved-child"), "allowlist must admit its named child");
  assert(!isBaseWordFamilyPilotEnabledForChild("other-child"), "allowlist must exclude children outside the rollout scope");
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_SCOPE = "all_eligible";
  assert(isBaseWordFamilyPilotEnabledForChild("other-child"), "all_eligible must admit a child once genuine readiness is met");
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED = "true";
  assert(!isBaseWordFamilyPilotEnabledForChild("approved-child"), "emergency stop must override every rollout scope");
} finally {
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED = saved.enabled;
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED = saved.emergency;
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_SCOPE = saved.scope;
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS = saved.children;
}

console.log("adle-base-word-family-pilot-access-regression: ok");
