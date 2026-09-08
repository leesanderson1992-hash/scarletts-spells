import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  CONTEXT_FAMILY_MANIFESTS,
  normaliseContextMember,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
  WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
  type ContextFamilyKey,
} from "../lib/writing-engine/whole-writing/context";
import {
  FAMILY_RELEASES,
  G2_PACKAGE_VERSION,
  G2_POLICY_VERSION,
  corpusVariety,
  manifestFor,
  recordFingerprint,
  runtimeFingerprints,
  validateCandidate,
  type AuthorProposal,
  type CandidateCase,
  type GoldClassification,
  type ProtectedTag,
  type SupportedConstructionStatus,
} from "./lib/whole-writing-g2-corpus";

const repositoryRoot = resolve(import.meta.dirname, "..");
const root = join(repositoryRoot, "data/whole-writing/g2-context-family-corpora");
const authoredReference = "Scarlett's Spells G2 contextual-family corpus workstream, 2026-09-08";

const names = ["Maya", "Leo", "Nia", "Sam", "Ari", "Zoe", "Iris", "Noah", "Luca", "Ruby", "Omar", "Esme"];
const knownNouns = ["book", "coat", "dog", "bag", "team", "house", "garden", "friend", "teacher", "toy", "tail", "answer"];
const broadNouns = ["lantern", "rucksack", "pencils", "bicycles", "sandwiches", "notebook", "hamster", "project", "blanket", "tickets", "helmets", "shells"];
const knownAdjectives = ["happy", "ready", "kind", "tired", "cold", "wet", "heavy", "right", "wrong", "friendly", "small", "fast"];
const broadAdjectives = ["patient", "careful", "excited", "enormous", "fragile", "curious", "silent", "brilliant", "nervous", "delighted", "awake", "useful"];
const knownVerbs = ["read", "write", "play", "walk", "run", "help", "learn", "finish", "make", "find", "see", "eat"];
const beforeSentences = [
  "At sunrise, the class checked its plan.", "After lunch, everyone returned quietly.",
  "The rain stopped before the gate opened.", "During art club, the tables stayed busy.",
  "A bell sounded across the empty yard.", "The note arrived on a windy Tuesday.",
  "Before rehearsal, the group counted slowly.", "In the kitchen, a timer clicked twice.",
  "The youngest pupil reread the instructions.", "By the window, three plants leaned toward the light.",
  "After the long journey, nobody hurried.", "The caretaker unlocked the side entrance.",
  "A robin landed beside the chalk line.", "The morning began with an unexpected puzzle.",
  "Once the music ended, the hall became still.", "The coach placed a clipboard on the bench.",
  "Just before dusk, the clouds turned orange.", "The science group compared yesterday's notes.",
  "A small crowd waited near the noticeboard.", "The final clue appeared beneath a blue card.",
];
const afterSentences = [
  "Nobody changed the original wording.", "The detail mattered to the whole story.",
  "A partner checked the line once more.", "The next page contained a different example.",
  "Everyone understood the surrounding scene.", "The writer left the punctuation exactly as shown.",
  "No answer choices were visible.", "The sentence stood on its own in the draft.",
  "A later paragraph changed the subject.", "The class discussed why context mattered.",
  "The notebook also contained two unrelated spelling slips.", "Weather and whether were discussed as an unrelated near-homophone pair.",
  "The author was describing a real event.", "The teacher preserved the learner's original phrasing.",
  "A second reader interpreted the passage independently.", "The surrounding paragraph remained available for review.",
  "The short line came from an imperfect first draft.", "The focus occurrence was not copied from a heading.",
  "A picture on the task page was intentionally withheld.", "The writer had not yet revised the response.",
];

type Frame = { text: string; construction: string; intended: string; template: string };

function pick<T>(items: readonly T[], index: number, stride = 1): T {
  return items[(index * stride + Math.floor(index / Math.max(1, items.length))) % items.length];
}

function contextWrap(sentence: string, index: number, learnerLike = false): string {
  const before = beforeSentences[(index - 1) % beforeSentences.length];
  const after = afterSentences[Math.floor((index - 1) / beforeSentences.length) % afterSentences.length];
  if (learnerLike) return `${sentence} ${after}`;
  return `${before} ${sentence} ${after}`;
}

function focusVariant(member: string, index: number): string {
  let value = index % 11 === 0 ? member.replace(/'/g, "’") : index % 17 === 0 ? member.replace(/'/g, "ʼ") : member;
  if (index % 7 === 0) value = value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function thereFrame(index: number): Frame {
  const construction = ["existential", "locative", "possessive", "they_are_contraction"][index % 4];
  if (construction === "existential") {
    const noun = index % 3 === 0 ? pick(knownNouns, index) : pick(broadNouns, index, 5);
    return { text: `[[there]] is a ${noun} beside the gate.`, construction, intended: "there", template: `there-existential-${index % 10}` };
  }
  if (construction === "locative") return { text: `${pick(names, index)} left the ${pick(broadNouns, index, 5)} over [[there]].`, construction, intended: "there", template: `there-locative-${index % 10}` };
  if (construction === "possessive") {
    const noun = index % 2 ? pick(knownNouns, index, 5) : pick(broadNouns, index, 7);
    return { text: `[[their]] ${noun} looked ${pick([...knownAdjectives, ...broadAdjectives], index, 5)} after the journey.`, construction, intended: "their", template: `their-possessive-${index % 10}` };
  }
  const adjective = index % 2 ? pick(knownAdjectives, index, 5) : pick(broadAdjectives, index, 7);
  return { text: `[[they're]] ${adjective} about tomorrow's visit.`, construction, intended: "they're", template: `theyre-contraction-${index % 10}` };
}

function toFrame(index: number): Frame {
  const construction = ["preposition", "infinitive", "additive", "degree", "numeral"][index % 5];
  const name = pick(names, index, 5);
  if (construction === "preposition") return { text: `${name} walked [[to]] the ${pick(["school", "garden", "house", "library", "harbour", "museum"], index, 3)} after lunch.`, construction, intended: "to", template: `to-preposition-${index % 10}` };
  if (construction === "infinitive") return { text: `${name} wants [[to]] ${pick(knownVerbs, index, 5)} before tea.`, construction, intended: "to", template: `to-infinitive-${index % 10}` };
  if (construction === "additive") return { text: `${name} wants a ${pick(["turn", "copy", "ticket", "sandwich", "badge", "blanket"], index, 5)} [[too]].`, construction, intended: "too", template: `too-additive-${index % 10}` };
  if (construction === "degree") return { text: `The ${pick(broadNouns, index, 5)} is [[too]] ${index % 2 ? pick(knownAdjectives, index, 7) : pick(broadAdjectives, index, 7)} for this task.`, construction, intended: "too", template: `too-degree-${index % 10}` };
  return { text: `${name} has [[two]] ${pick(["books", "bags", "cats", "coats", "toys", "tickets", "pencils", "helmets"], index, 3)} in the cupboard.`, construction, intended: "two", template: `two-numeral-${index % 10}` };
}

function yourFrame(index: number): Frame {
  const construction = index % 2 === 0 ? "possessive" : "you_are_contraction";
  if (construction === "possessive") {
    const noun = index % 4 === 0 ? pick(knownNouns, index, 5) : pick(broadNouns, index, 7);
    return { text: `[[your]] ${noun} seems ${pick([...knownAdjectives, ...broadAdjectives], index, 5)} in this light.`, construction, intended: "your", template: `your-possessive-${index % 12}` };
  }
  const adjective = index % 3 ? pick(knownAdjectives, index, 5) : pick(broadAdjectives, index, 7);
  return { text: `[[you're]] ${adjective} enough to explain the choice.`, construction, intended: "you're", template: `youre-contraction-${index % 12}` };
}

function itsFrame(index: number): Frame {
  const construction = ["possessive", "it_is_contraction", "it_has_contraction"][index % 3];
  if (construction === "possessive") return { text: `The ${pick(["fox", "dog", "machine", "boat", "school", "museum"], index, 5)} kept [[its]] ${pick([...knownNouns, ...broadNouns], index, 7)} near the entrance.`, construction, intended: "its", template: `its-possessive-${index % 12}` };
  if (construction === "it_is_contraction") return { text: `[[it's]] ${index % 2 ? pick(knownAdjectives, index, 5) : pick(broadAdjectives, index, 7)} beside the open window.`, construction, intended: "it's", template: `its-is-contraction-${index % 12}` };
  return { text: `[[it's]] been ${pick([...knownAdjectives, ...broadAdjectives], index, 5)} since early morning.`, construction, intended: "it's", template: `its-has-contraction-${index % 12}` };
}

const frameBuilders: Record<ContextFamilyKey, (index: number) => Frame> = {
  THERE_THEIR_THEYRE: thereFrame,
  TO_TOO_TWO: toFrame,
  YOUR_YOURE: yourFrame,
  ITS_ITS: itsFrame,
};

function replaceFocus(frame: Frame, member: string, index: number): Frame {
  return { ...frame, text: frame.text.replace(/\[\[[^\]]+\]\]/, `[[${focusVariant(member, index)}]]`) };
}

function ambiguousFrame(family: ContextFamilyKey, tag: ProtectedTag, index: number): Frame {
  const members = manifestFor(family).members;
  const member = members[index % members.length];
  const focus = focusVariant(member, index);
  if (tag === "quotation") return { text: `${pick(names, index)} copied “[[${focus}]]” onto a vocabulary card.`, construction: "quoted_or_reported_intent", intended: member, template: `protected-quotation-${index % 10}` };
  if (tag === "fragment") return { text: `Maybe [[${focus}]] ... because the next page is missing.`, construction: "fragment", intended: member, template: `protected-fragment-${index % 10}` };
  if (tag === "task_dependent") return { text: `In the unseen picture, the label beside the arrow might be [[${focus}]].`, construction: "unsupported_or_ambiguous", intended: member, template: `protected-task-dependent-${index % 10}` };
  if (tag === "run_on") return { text: `${pick(names, index)} wrote quickly the lights went out [[${focus}]] the meaning changes if a full stop is added`, construction: "unsupported_or_ambiguous", intended: member, template: `protected-run-on-${index % 10}` };
  if (family === "THERE_THEIR_THEYRE") return { text: `The editor debated whether [[${focus}]] running was a noun phrase or an unfinished clause.`, construction: "ambiguous_gerund", intended: member, template: `protected-gerund-${index % 10}` };
  if (family === "YOUR_YOURE") return { text: `Without the missing ending, [[${focus}]] running could introduce more than one structure.`, construction: "ambiguous_gerund", intended: member, template: `protected-gerund-${index % 10}` };
  if (family === "TO_TOO_TWO") return { text: `The partial line “running [[${focus}]]” does not reveal the intended lexical category.`, construction: "unresolved_lexical_category", intended: member, template: `protected-gerund-${index % 10}` };
  return { text: `The unfinished note about [[${focus}]] running leaves possession and contraction unresolved.`, construction: "unsupported_or_ambiguous", intended: member, template: `protected-gerund-${index % 10}` };
}

function markerToSpan(textWithMarker: string) {
  const startMarker = textWithMarker.indexOf("[[");
  const endMarker = textWithMarker.indexOf("]]", startMarker + 2);
  if (startMarker < 0 || endMarker < 0 || textWithMarker.indexOf("[[", startMarker + 2) >= 0) throw new Error(`Expected exactly one marker: ${textWithMarker}`);
  const focusSurface = textWithMarker.slice(startMarker + 2, endMarker);
  const sourceText = textWithMarker.slice(0, startMarker) + focusSurface + textWithMarker.slice(endMarker + 2);
  return { sourceText, focusSurface, startUtf16: startMarker, endUtf16: startMarker + focusSurface.length };
}

function makeRecords(input: {
  family: ContextFamilyKey;
  sequence: number;
  frame: Frame;
  proposedClassification: GoldClassification;
  proposedIntendedMember: string | null;
  proposedExpectedAlternative: string | null;
  proposedSupportedConstructionStatus: SupportedConstructionStatus;
  proposedAmbiguityOrExclusionReason: string | null;
  protectedSetTags?: ProtectedTag[];
  coverageRationale: string;
}): { candidate: CandidateCase; proposal: AuthorProposal } {
  const caseId = `g2-${input.family.toLowerCase().replaceAll("_", "-")}-${String(input.sequence).padStart(4, "0")}`;
  const learnerLike = input.sequence % 13 === 0;
  let markedText = contextWrap(input.frame.text, input.sequence, learnerLike);
  if (input.sequence % 29 === 0) markedText = `📝 ${markedText}`;
  if (input.sequence % 31 === 0) markedText = markedText.replace("Nobody", "Nobdy").replace("The writer", "The writter");
  if (input.sequence % 37 === 0) {
    const marked = markerToSpan(markedText);
    markedText = `A margin note mentioned “${marked.focusSurface}” as a word form. ${markedText}`;
  }
  const span = markerToSpan(markedText);
  const observedMember = normaliseContextMember(span.focusSurface);
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    caseId,
    family: input.family,
    sourceText: span.sourceText,
    focusSurface: span.focusSurface,
    startUtf16: span.startUtf16,
    endUtf16: span.endUtf16,
    observedMember,
    declaredConstruction: input.frame.construction,
    protectedSetTags: input.protectedSetTags ?? [],
    dialect: "en-GB" as const,
    languageAssumptions: ["Contemporary British English", "Focus span is evaluated in the complete authored source text", "No hidden task context unless stated in source text"],
    candidateGeneration: {
      method: "deterministic_authored_template" as const,
      generatorVersion: G2_PACKAGE_VERSION,
      templateId: input.frame.template,
      slotFingerprint: recordFingerprint([input.family, input.sequence, input.frame]),
      authoringAuthority: "CORPUS_AUTHOR_PROPOSAL_NOT_GOLD" as const,
    },
    provenance: { sourceType: "AUTHORED_EXAMPLE" as const, sourceReference: authoredReference, licence: "PROJECT_AUTHORED" as const },
    evaluationSplit: "release" as const,
    releaseId: FAMILY_RELEASES[input.family].releaseId,
    familyManifestFingerprint: manifestFor(input.family).fingerprint,
    analyserVersion: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
    registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
    packageVersion: G2_PACKAGE_VERSION,
  };
  const candidate: CandidateCase = { ...withoutFingerprint, candidateFingerprint: recordFingerprint(withoutFingerprint) };
  const proposalWithoutFingerprint = {
    schemaVersion: 1 as const,
    caseId,
    family: input.family,
    proposedClassification: input.proposedClassification,
    proposedIntendedMember: input.proposedIntendedMember,
    proposedExpectedAlternative: input.proposedExpectedAlternative,
    proposedSupportedConstructionStatus: input.proposedSupportedConstructionStatus,
    proposedAmbiguityOrExclusionReason: input.proposedAmbiguityOrExclusionReason,
    coverageRationale: input.coverageRationale,
    candidateFingerprint: candidate.candidateFingerprint,
    authority: "CORPUS_AUTHOR_PROPOSAL_NOT_GOLD" as const,
  };
  const proposal: AuthorProposal = { ...proposalWithoutFingerprint, proposalFingerprint: recordFingerprint(proposalWithoutFingerprint) };
  return { candidate, proposal };
}

function buildFamily(family: ContextFamilyKey) {
  const manifest = manifestFor(family);
  const rows: Array<{ candidate: CandidateCase; proposal: AuthorProposal }> = [];
  let sequence = 1;
  for (let index = 0; index < 150; index += 1) {
    const base = frameBuilders[family](index);
    rows.push(makeRecords({ family, sequence: sequence++, frame: replaceFocus(base, base.intended, index), proposedClassification: "VALID", proposedIntendedMember: base.intended, proposedExpectedAlternative: null, proposedSupportedConstructionStatus: "SUPPORTED", proposedAmbiguityOrExclusionReason: null, coverageRationale: `Authored valid coverage for ${base.construction}; independent labels control gold truth.` }));
  }
  for (let index = 0; index < 150; index += 1) {
    const base = frameBuilders[family](index + 150);
    const alternatives = manifest.members.filter((member) => member !== base.intended);
    const observed = alternatives[index % alternatives.length];
    rows.push(makeRecords({ family, sequence: sequence++, frame: replaceFocus(base, observed, index + 150), proposedClassification: "INVALID", proposedIntendedMember: base.intended, proposedExpectedAlternative: base.intended, proposedSupportedConstructionStatus: "SUPPORTED", proposedAmbiguityOrExclusionReason: null, coverageRationale: `Authored substitution coverage for ${base.construction}; independent labels control gold truth.` }));
  }
  for (let index = 0; index < 100; index += 1) {
    const tag = (["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const)[Math.floor(index / 20)];
    const frame = ambiguousFrame(family, tag, index);
    rows.push(makeRecords({ family, sequence: sequence++, frame, proposedClassification: "UNCERTAIN", proposedIntendedMember: null, proposedExpectedAlternative: null, proposedSupportedConstructionStatus: "UNSUPPORTED", proposedAmbiguityOrExclusionReason: tag, protectedSetTags: [tag], coverageRationale: `Authored protected ${tag} counterexample; independent labels control gold truth.` }));
  }
  return rows;
}

function jsonl(records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function deterministicPacketOrder<T extends { caseId: string }>(records: T[], packet: "A" | "B") {
  return [...records].sort((left, right) => recordFingerprint([packet, left.caseId]).localeCompare(recordFingerprint([packet, right.caseId])));
}

function packetRecord(candidate: CandidateCase, packetId: string) {
  return {
    packetId,
    caseId: candidate.caseId,
    family: candidate.family,
    sourceText: candidate.sourceText,
    focusSurface: candidate.focusSurface,
    startUtf16: candidate.startUtf16,
    endUtf16: candidate.endUtf16,
    observedMember: candidate.observedMember,
    declaredConstruction: candidate.declaredConstruction,
    protectedSetTags: candidate.protectedSetTags,
    dialect: candidate.dialect,
    languageAssumptions: candidate.languageAssumptions,
    releaseId: candidate.releaseId,
    familyManifestFingerprint: candidate.familyManifestFingerprint,
    analyserVersion: candidate.analyserVersion,
    registryVersion: candidate.registryVersion,
    corpusVersion: candidate.corpusVersion,
    candidateFingerprint: candidate.candidateFingerprint,
    classification: "",
    intendedAlternative: "",
    supportedConstructionStatus: "",
    ambiguityOrExclusionReason: "",
    confidence: "",
    rationale: "",
  };
}

mkdirSync(root, { recursive: true });
for (const directory of ["candidates", "author-proposals", "packets", "labels", "reviews", "adjudication-packets", "adjudications", "gold", "release-artifacts", "reports"]) mkdirSync(join(root, directory), { recursive: true });

const runtime = runtimeFingerprints(repositoryRoot);
const packageFamilies: Record<string, unknown> = {};
for (const manifest of CONTEXT_FAMILY_MANIFESTS) {
  const family = manifest.familyKey;
  const rows = buildFamily(family);
  const candidates = rows.map((row) => row.candidate);
  const proposals = rows.map((row) => row.proposal);
  const issues = candidates.flatMap(validateCandidate);
  const variety = corpusVariety(candidates);
  if (issues.length) throw new Error(`${family} candidate validation failed: ${JSON.stringify(issues.slice(0, 5))}`);
  if (variety.exactDuplicates.length) throw new Error(`${family} exact duplicates: ${JSON.stringify(variety.exactDuplicates.slice(0, 5))}`);
  const corpusFingerprint = recordFingerprint(candidates.map((candidate) => candidate.candidateFingerprint));
  writeFileSync(join(root, "candidates", `${family}.jsonl`), jsonl(candidates));
  writeFileSync(join(root, "author-proposals", `${family}.jsonl`), jsonl(proposals));
  for (const packet of ["A", "B"] as const) {
    const packetId = `${G2_PACKAGE_VERSION}:${family}:LABEL_PACKET_${packet}`;
    const packetRows = deterministicPacketOrder(candidates, packet).map((candidate) => packetRecord(candidate, packetId));
    writeFileSync(join(root, "packets", `${family}.label-packet-${packet.toLowerCase()}.jsonl`), jsonl(packetRows));
  }
  writeFileSync(join(root, "labels", `${family}.README.md`), `# ${family} primary human-label imports\n\nStore one append-only governed packet import from one real identified human labeler in this directory. Do not copy author proposals into label records.\n`);
  writeFileSync(join(root, "reviews", `${family}.README.md`), `# ${family} non-gold secondary reviews\n\nStore one append-only, completely attributed review in this directory. It may flag disagreements but cannot supply gold truth or approval authority.\n`);
  writeFileSync(join(root, "adjudications", `${family}.README.md`), `# ${family} adjudications\n\nStore one append-only decision from a second identified human for every disagreement flagged by the non-gold review.\n`);
  writeFileSync(join(root, "gold", `${family}.README.md`), `# ${family} final gold\n\nGenerated only after one complete primary human label, one complete non-gold review and adjudication of every flagged disagreement. Author proposals and secondary review outputs are not gold truth.\n`);
  const plannedCounts = proposals.reduce((counts, proposal) => ({ ...counts, [proposal.proposedClassification]: counts[proposal.proposedClassification] + 1 }), { VALID: 0, INVALID: 0, UNCERTAIN: 0 });
  packageFamilies[family] = {
    ...FAMILY_RELEASES[family],
    members: manifest.members,
    supportedConstructions: manifest.supportedConstructions,
    exclusions: manifest.exclusions,
    manifestFingerprint: manifest.fingerprint,
    corpusFingerprint,
    candidateCount: candidates.length,
    authorProposalCounts: plannedCounts,
    authorProposalFingerprint: recordFingerprint(proposals.map((proposal) => proposal.proposalFingerprint)),
    authorProposalsAreGold: false,
    packetFingerprints: {
      A: recordFingerprint(deterministicPacketOrder(candidates, "A").map((candidate) => candidate.candidateFingerprint)),
      B: recordFingerprint(deterministicPacketOrder(candidates, "B").map((candidate) => candidate.candidateFingerprint)),
    },
    variety,
  };
}

const packageManifestWithoutFingerprint = {
  schemaVersion: 1,
  packageVersion: G2_PACKAGE_VERSION,
  policyVersion: G2_POLICY_VERSION,
  documentationAuthorityBaseline: "f7865ab9edab410a3a6f5aba6965457705319b5f",
  corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  runtime,
  families: packageFamilies,
  goldAuthority: "ONE_PRIMARY_HUMAN_LABEL_WITH_NON_GOLD_REVIEW_AND_HUMAN_DISAGREEMENT_ADJUDICATION",
  operationalApproval: false,
};
const packageManifest = { ...packageManifestWithoutFingerprint, packageFingerprint: recordFingerprint(packageManifestWithoutFingerprint) };
writeFileSync(join(root, "manifest.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);
console.log(`Built ${Object.keys(packageFamilies).length} G2 family packages with 400 candidates and two blinded packets per family.`);
