import assert from "node:assert/strict";

import type {
  DynamicAffixLessonPayloadV3,
  DynamicAffixSelection,
} from "../../lib/adle/morphology/affix-word-lab";
import type {
  DynamicPrefixLessonPayloadV2,
  DynamicPrefixSelection,
} from "../../lib/adle/morphology/dynamic-prefix-word-lab";
import {
  compareSharedAffixPayloadParity,
  compileDynamicAffixSelectionThroughSharedCompiler,
  compileDynamicPrefixSelectionThroughSharedCompiler,
} from "../../lib/adle/morphology/shared-affix-compatibility";

export function assertDynamicPrefixSharedParity(
  selection: DynamicPrefixSelection,
  authoritativePayload: DynamicPrefixLessonPayloadV2,
  label: string,
) {
  const shadow = compileDynamicPrefixSelectionThroughSharedCompiler(selection);
  assert(shadow.ok, `${label}: shared Prefix compilation blocked: ${shadow.ok ? "" : JSON.stringify(shadow.blockers)}`);
  const parity = compareSharedAffixPayloadParity(authoritativePayload, shadow.payload);
  assert(parity.ok, `${label}: shared Prefix V2 adapter drifted`);
  assert.equal(shadow.lesson.provenance.contentVersion, authoritativePayload.contentVersion, `${label}: Prefix content version`);
  assert.equal(shadow.payload.schemaVersion, 2, `${label}: Prefix payload remains V2`);
  return shadow;
}

export function assertDynamicAffixSharedParity(
  selection: DynamicAffixSelection,
  authoritativePayload: DynamicAffixLessonPayloadV3,
  label: string,
) {
  const shadow = compileDynamicAffixSelectionThroughSharedCompiler(selection);
  assert(shadow.ok, `${label}: shared Affix compilation blocked: ${shadow.ok ? "" : JSON.stringify(shadow.blockers)}`);
  const parity = compareSharedAffixPayloadParity(authoritativePayload, shadow.payload);
  assert(parity.ok, `${label}: shared Affix V3 adapter drifted`);
  assert.equal(shadow.lesson.provenance.contentVersion, authoritativePayload.contentVersion, `${label}: Affix content version`);
  assert.equal(shadow.payload.schemaVersion, 3, `${label}: Affix payload remains V3`);
  return shadow;
}
