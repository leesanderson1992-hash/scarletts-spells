import type { DeterministicContextDecision } from "./context";
import { normaliseContextMember, type ContextFamilyKey } from "./context";
import {
  CONTEXT_V3_SYNTAX_LIMITS,
  parseContextV3,
  type ContextInputV3,
  type ContextSyntaxTraceV3,
  type ParsedContextV3,
} from "./context-syntax-v3";

export type ContextCandidateV3 = Readonly<{
  member: string;
  scope: string;
  witness: readonly string[];
}>;

export type ContextManifestV3 = Readonly<{
  releaseId: string;
  releaseKey: string;
  familyKey: ContextFamilyKey;
  analyserVersion: string;
  registryVersion: string;
  corpusVersion: string;
  members: readonly string[];
  supportedConstructions: readonly string[];
  supportedSubtypes: readonly string[];
  supportedScope: readonly string[];
  exclusions: readonly string[];
  syntaxVersion: string;
  syntaxFingerprint: string;
  lexiconVersion: string;
  lexiconFingerprint: string;
  sourceFingerprints: Readonly<Record<string, string>>;
}>;

export type ContextDecisionV3 = Omit<DeterministicContextDecision, "analyserVersion"> & {
  analyserVersion: string;
};

export type ContextAnalysisTraceV3 = Readonly<{
  syntax: ContextSyntaxTraceV3 | null;
  candidates: readonly ContextCandidateV3[];
  rejectedAlternatives: readonly string[];
}>;

export type DetailedContextDecisionV3 = Readonly<{
  decision: ContextDecisionV3 | null;
  trace: ContextAnalysisTraceV3;
}>;

type Evaluator = (context: ParsedContextV3) => Readonly<{
  candidates: readonly ContextCandidateV3[];
  blockedReason?: string;
  rejectedAlternatives?: readonly string[];
}>;

export function analyseFamilyContextV3Detailed(
  input: ContextInputV3,
  manifest: ContextManifestV3,
  manifestFingerprint: string,
  evaluate: Evaluator,
): DetailedContextDecisionV3 {
  const observedMember = normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16));
  if (!manifest.members.includes(observedMember)) {
    return { decision: null, trace: { syntax: null, candidates: [], rejectedAlternatives: [] } };
  }
  const make = (status: ContextDecisionV3["status"], reasonCode: string, assessedScope = "ordinary_writing_bounded_context", alternativeMember: string | null = null): ContextDecisionV3 => ({
    status,
    familyKey: manifest.familyKey,
    observedMember,
    alternativeMember,
    assessedScope,
    reasonCode,
    ruleId: `${manifest.analyserVersion}:${manifest.familyKey}:${reasonCode}`,
    analyserVersion: manifest.analyserVersion,
    manifestFingerprint,
  });

  const parsed = parseContextV3(input);
  if (parsed.status === "blocked") {
    return {
      decision: make("UNCERTAIN", parsed.reason),
      trace: { syntax: null, candidates: [], rejectedAlternatives: [] },
    };
  }
  const evaluated = evaluate(parsed.context);
  const trace = {
    syntax: parsed.context.trace,
    candidates: evaluated.candidates,
    rejectedAlternatives: evaluated.rejectedAlternatives ?? [],
  } as const;
  if (evaluated.candidates.length > CONTEXT_V3_SYNTAX_LIMITS.maxCompetingAnalyses) {
    return { decision: make("UNCERTAIN", "RESOURCE_LIMIT"), trace };
  }
  if (evaluated.blockedReason) {
    return { decision: make("UNCERTAIN", evaluated.blockedReason), trace };
  }
  const candidates = [...new Map(evaluated.candidates.map((candidate) => [`${candidate.member}:${candidate.scope}`, candidate])).values()];
  const members = new Set(candidates.map((candidate) => candidate.member));
  if (candidates.length === 0) return { decision: make("UNCERTAIN", "UNSUPPORTED_OR_UNRESOLVED_CONSTRUCTION"), trace };
  if (members.size !== 1) return { decision: make("UNCERTAIN", "COMPETING_CONSTRUCTIONS"), trace };
  const selectedMember = candidates[0].member;
  const scopes = [...new Set(candidates.map((candidate) => candidate.scope))].sort();
  const scope = scopes.join("+");
  const valid = observedMember === selectedMember;
  return {
    decision: make(
      valid ? "VALID" : "INVALID",
      valid ? "SUPPORTED_FAMILY_USE_V3" : "UNIQUE_FAMILY_SUBSTITUTION_V3",
      scope,
      valid ? null : selectedMember,
    ),
    trace,
  };
}

export function publicDecisionV3(details: DetailedContextDecisionV3) {
  return details.decision;
}
