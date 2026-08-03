import { getDynamicPrefixCompilerAuthority } from "./dynamic-prefix-compiler-rollout";
import type { DynamicPrefixQaProfileKey } from "./dynamic-prefix-assignment-writer";

export const DYNAMIC_PREFIX_QA_PROFILES: ReadonlyArray<{
  key: DynamicPrefixQaProfileKey;
  label: string;
  expectedItemCount: 16 | 18 | 20;
  meaningEvidenceLabel: "Meaning Sort" | "Prefix Form Sort (equivalent)";
}> = [
  { key: "D4_MOR_PREFIXES_UN", label: "un-", expectedItemCount: 16, meaningEvidenceLabel: "Meaning Sort" },
  { key: "D4_MOR_PREFIXES_DIS_MIS", label: "dis- / mis-", expectedItemCount: 16, meaningEvidenceLabel: "Meaning Sort" },
  { key: "D4_MOR_PREFIXES_IN_IM_IL_IR", label: "in- / im- / il- / ir-", expectedItemCount: 20, meaningEvidenceLabel: "Prefix Form Sort (equivalent)" },
  { key: "D4_MOR_PREFIXES_RE_PRE", label: "re- / pre-", expectedItemCount: 16, meaningEvidenceLabel: "Meaning Sort" },
  { key: "D4_MOR_PREFIXES_SUB_INTER_SUPER", label: "sub- / inter- / super-", expectedItemCount: 18, meaningEvidenceLabel: "Meaning Sort" },
];

export function dynamicPrefixQaProfile(key: string) {
  return DYNAMIC_PREFIX_QA_PROFILES.find((profile) => profile.key === key) ?? null;
}

export function dynamicPrefixQaAuthority(key: string) {
  return getDynamicPrefixCompilerAuthority(key);
}
