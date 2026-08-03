import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { extractAuthoredTargetToken } from "./payload";
import {
  SHARED_AFFIX_COMPILER_VERSION,
  SHARED_AFFIX_FINGERPRINT_VERSION,
  SHARED_AFFIX_SUPPORTED_TRANSFORMATION_TYPES,
  type AffixLessonCompilationInputV1,
  type CompiledAffixLessonV1,
  type CompiledSharedAffixBuildV1,
  type CompiledSharedAffixWordV1,
  type SharedAffixAssignmentBindingV1,
  type SharedAffixBlocker,
  type SharedAffixBlockerCode,
  type SharedAffixChoiceV1,
  type SharedAffixCompileResult,
  type SharedAffixWordInputV1,
} from "./shared-affix-contracts";

const SUPPORTED_TRANSFORMATIONS = new Set<string>(SHARED_AFFIX_SUPPORTED_TRANSFORMATION_TYPES);

function blocker(
  code: SharedAffixBlockerCode,
  detail?: string,
): SharedAffixBlocker {
  return detail ? { code, detail } : { code };
}

function uniqueBlockers(blockers: readonly SharedAffixBlocker[]): SharedAffixBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((entry) => {
    const key = `${entry.code}:${entry.detail ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalFingerprintInput(input: AffixLessonCompilationInputV1) {
  return {
    ...input,
    words: [...input.words].sort((left, right) =>
      left.canonicalWordId.localeCompare(right.canonicalWordId),
    ),
  };
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefined(entry)]),
    );
  }
  return value;
}

export function fingerprintSharedAffixInput(
  input: AffixLessonCompilationInputV1,
): string {
  return fingerprintSnapshotValue(omitUndefined(canonicalFingerprintInput(input)));
}

export function fingerprintCompiledSharedAffixLesson(
  lesson: Omit<CompiledAffixLessonV1, "fingerprint">,
): string {
  return fingerprintSnapshotValue(omitUndefined(lesson));
}

function validText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateProfile(input: AffixLessonCompilationInputV1): SharedAffixBlocker[] {
  const blockers: SharedAffixBlocker[] = [];
  const { profile, taxonomy } = input;
  if (profile.position !== "before" && profile.position !== "after") {
    blockers.push(blocker("invalid_position", String(profile.position)));
  }
  if (
    !validText(profile.profileKey)
    || !validText(profile.header.text)
    || !validText(profile.header.label)
    || !validText(profile.header.meaning)
    || !validText(profile.reflection.promptKey)
    || !validText(profile.reflection.promptText)
    || !validText(profile.introduction.title)
    || profile.introduction.paragraphs.length === 0
    || profile.introduction.paragraphs.some((paragraph) => !validText(paragraph))
  ) {
    blockers.push(blocker("missing_profile_copy"));
  }
  if (profile.profileKey !== taxonomy.microSkillKey) {
    blockers.push(blocker("selected_word_not_in_profile", taxonomy.microSkillKey));
  }
  if (profile.forms.length === 0 || new Set(profile.forms).size !== profile.forms.length) {
    blockers.push(blocker("missing_affix_form", profile.profileKey));
  }
  if (
    profile.meaningGroups.length === 0
    || new Set(profile.meaningGroups.map((group) => group.id)).size !== profile.meaningGroups.length
    || profile.meaningGroups.some((group) =>
      !validText(group.id) || !validText(group.label) || typeof group.description !== "string",
    )
  ) {
    blockers.push(blocker("missing_meaning_facts", profile.profileKey));
  }
  if (profile.choices.length === 0) {
    blockers.push(blocker("invalid_choice_policy", profile.profileKey));
  }
  if (profile.prefixPresentation) {
    const cards = profile.introduction.kind === "prefix_v2" ? profile.introduction.teachingCards : undefined;
    if (
      profile.prefixPresentation.version !== "dynamic_prefix_pedagogy_v1"
      || profile.prefixPresentation.meaningResultsPresentation !== "none"
      || profile.prefixPresentation.coverClosePolicy.kind !== "track_ratio"
      || profile.prefixPresentation.coverClosePolicy.threshold !== 0.8
      || !cards
      || cards.map((card) => card.text).join("|") !== profile.forms.join("|")
      || cards.some((card) => !validText(card.label) || !validText(card.meaning) || !card.rules.length || card.rules.some((rule) => !validText(rule)))
    ) blockers.push(blocker("missing_profile_copy", `${profile.profileKey}:pedagogy`));
    if (
      profile.choices.length < 3
      || new Set(profile.choices.map((choice) => choice.text)).size !== profile.choices.length
      || profile.forms.some((form) => !profile.choices.some((choice) => choice.text === form))
      || profile.choices.some((choice) => !validText(choice.text) || !validText(choice.label) || !validText(choice.meaning ?? undefined) || !choice.rules?.length || choice.rules.some((rule) => !validText(rule)) || !validText(choice.reviewedSource))
    ) blockers.push(blocker("invalid_choice_policy", `${profile.profileKey}:reviewed_choices`));
    const choiceForms = profile.choices.map((choice) => choice.text);
    const sortedChoiceForms = [...choiceForms].sort();
    const audits = profile.prefixPresentation.validChoiceAudit;
    if (
      audits.length === 0
      || new Set(audits.map((audit) => audit.word)).size !== audits.length
      || audits.some((audit) =>
        !validText(audit.word)
        || Object.keys(audit.choiceVerdicts).sort().join("|") !== sortedChoiceForms.join("|")
        || Object.values(audit.choiceVerdicts).filter(Boolean).length !== 1
      )
    ) blockers.push(blocker("invalid_choice_policy", `${profile.profileKey}:member_choice_audit`));
    if (
      profile.meaningGroups.some((group) => !validText(group.prefixText))
      || (profile.prefixPresentation.meaningCheckKind === "prefix_form"
        && profile.forms.some((form) => !profile.meaningGroups.some((group) => group.id === form && group.prefixText === form)))
    ) blockers.push(blocker("missing_meaning_facts", `${profile.profileKey}:selected_feedback`));
  }
  return blockers;
}

function validateWord(
  word: SharedAffixWordInputV1,
  input: AffixLessonCompilationInputV1,
): SharedAffixBlocker[] {
  const blockers: SharedAffixBlocker[] = [];
  const detail = word.canonicalWordId;
  if (!input.profile.forms.includes(word.affixForm) || !validText(word.affixLabel)) {
    blockers.push(blocker("missing_affix_form", detail));
  }
  if (!validText(word.semanticBaseText)) blockers.push(blocker("missing_semantic_base", detail));
  if (!validText(word.teachingSurfaceText)) blockers.push(blocker("missing_teaching_surface", detail));
  if (
    word.parts.length < 2
    || word.joins.length !== word.parts.length - 1
    || word.morphology.parts.length < 2
    || word.morphology.joins.length !== word.morphology.parts.length - 1
  ) blockers.push(blocker("missing_decomposition", detail));

  const expected = input.profile.position === "before"
    ? `${word.affixForm}${word.teachingSurfaceText}`
    : `${word.teachingSurfaceText}${word.affixForm}`;
  const expectedSplit = input.profile.position === "before"
    ? word.affixForm.length
    : word.teachingSurfaceText.length;
  if (
    expected !== word.displayWord
    || word.parts.map((part) => part.text).join("") !== word.displayWord
    || word.morphology.parts.map((part) => part.text).join("") !== word.displayWord
    || word.splitPoints.length !== 1
    || word.splitPoints[0] !== expectedSplit
    || expectedSplit <= 0
    || expectedSplit >= word.displayWord.length
  ) blockers.push(blocker("reconstruction_mismatch", detail));

  if (
    !validText(word.baseMeaning)
    || !validText(word.derivedMeaning)
    || !validText(word.meaningGroupId)
    || !input.profile.meaningGroups.some((group) => group.id === word.meaningGroupId)
  ) blockers.push(blocker("missing_meaning_facts", detail));

  if (
    !validText(word.dictation.sentence)
    || word.audioText !== word.dictation.sentence
    || extractAuthoredTargetToken(
      word.dictation.sentence,
      word.dictation.targetTokenIndex,
    ) !== word.displayWord
  ) blockers.push(blocker("missing_reviewed_dictation", detail));

  if (!validText(word.morphology.notes) || Object.keys(word.morphology.provenance).length === 0) {
    blockers.push(blocker("missing_decomposition", detail));
  }
  const unsupported = word.morphology.transformations.find(
    (transformation) => !SUPPORTED_TRANSFORMATIONS.has(transformation.type),
  );
  if (unsupported) blockers.push(blocker("unsupported_transformation", `${detail}:${unsupported.type}`));
  const surfaceChanged = word.morphology.parts.some(
    (part) => part.sourceText !== part.text,
  );
  if (surfaceChanged && word.morphology.transformations.length === 0) {
    blockers.push(blocker("missing_transformation", detail));
  }
  if (
    word.morphology.kind === "legacy_prefix_projection"
    && (
      word.morphology.transformations.length !== 1
      || word.morphology.transformations[0]?.type !== "legacy_prefix_projection"
    )
  ) blockers.push(blocker("missing_transformation", detail));
  return blockers;
}

function selectedWords(
  input: AffixLessonCompilationInputV1,
): { words: CompiledSharedAffixWordV1[]; blockers: SharedAffixBlocker[] } {
  const blockers: SharedAffixBlocker[] = [];
  const allIds = input.selection.lessonWordIds;
  const authentic = new Set(input.selection.authenticTargetIds);
  const transfer = new Set(input.selection.transferWordIds);
  if (allIds.length !== input.policy.lessonWordCount) {
    blockers.push(blocker("wrong_lesson_count", String(allIds.length)));
  }
  if (
    input.selection.authenticTargetIds.length < input.policy.authenticTargetCount.min
    || input.selection.authenticTargetIds.length > input.policy.authenticTargetCount.max
  ) blockers.push(blocker("wrong_authentic_count", String(input.selection.authenticTargetIds.length)));
  if (
    input.selection.transferWordIds.length < input.policy.transferCount.min
    || input.selection.transferWordIds.length > input.policy.transferCount.max
    || input.selection.authenticTargetIds.length + input.selection.transferWordIds.length !== allIds.length
  ) blockers.push(blocker("wrong_transfer_count", String(input.selection.transferWordIds.length)));
  if (
    new Set(allIds).size !== allIds.length
    || new Set(input.selection.authenticTargetIds).size !== input.selection.authenticTargetIds.length
    || new Set(input.selection.transferWordIds).size !== input.selection.transferWordIds.length
    || input.selection.authenticTargetIds.some((id) => transfer.has(id))
  ) blockers.push(blocker("duplicate_word"));

  const byId = new Map(input.words.map((word) => [word.canonicalWordId, word]));
  if (byId.size !== input.words.length) blockers.push(blocker("duplicate_word", "reviewed_facts"));
  const words: CompiledSharedAffixWordV1[] = [];
  for (const id of allIds) {
    const word = byId.get(id);
    if (!word || (!authentic.has(id) && !transfer.has(id))) {
      blockers.push(blocker("selected_word_not_in_profile", id));
      continue;
    }
    blockers.push(...validateWord(word, input));
    if (input.profile.prefixPresentation) {
      const audit = input.profile.prefixPresentation.validChoiceAudit.find(
        (entry) => entry.word === word.displayWord,
      );
      if (
        !audit
        || audit.choiceVerdicts[word.affixForm] !== true
        || Object.entries(audit.choiceVerdicts).some(
          ([form, valid]) => form !== word.affixForm && valid,
        )
      ) blockers.push(blocker("invalid_choice_policy", `${word.displayWord}:member_choice_audit`));
    }
    words.push({ ...word, role: authentic.has(id) ? "authentic_target" : "transfer" });
  }
  const distinctForms = new Set(words.map((word) => word.affixForm)).size;
  if (distinctForms < input.policy.requiredFormCoverage.count) {
    blockers.push(blocker("insufficient_form_coverage", String(distinctForms)));
  }
  const distinctMeanings = new Set(words.map((word) => word.meaningGroupId)).size;
  if (distinctMeanings < input.policy.requiredMeaningCoverage.count) {
    blockers.push(blocker("insufficient_meaning_group_coverage", String(distinctMeanings)));
  }
  return { words, blockers };
}

function wordsByDistinctForm(words: readonly CompiledSharedAffixWordV1[]) {
  const forms = new Set<string>();
  return words.filter((word) => {
    if (forms.has(word.affixForm)) return false;
    forms.add(word.affixForm);
    return true;
  });
}

function selectBuildWords(
  input: AffixLessonCompilationInputV1,
  words: readonly CompiledSharedAffixWordV1[],
  splitIds: ReadonlySet<string>,
): CompiledSharedAffixWordV1[] {
  switch (input.policy.build.kind) {
    case "different_form_from_first_or_first":
      return [words.find((word) => word.affixForm !== words[0]?.affixForm) ?? words[0]!];
    case "one_per_represented_form":
      return input.policy.build.formOrder
        .map((form) => words.find((word) => word.affixForm === form))
        .filter((word): word is CompiledSharedAffixWordV1 => Boolean(word));
    case "every_lesson_word":
      return [...words];
    case "one_per_represented_form_prefer_non_split":
      return wordsByDistinctForm(words).map((first) =>
        words.find((word) => word.affixForm === first.affixForm && !splitIds.has(word.canonicalWordId))
        ?? first,
      );
  }
}

function selectSplitWords(
  input: AffixLessonCompilationInputV1,
  words: readonly CompiledSharedAffixWordV1[],
  formBuildCount: number,
): CompiledSharedAffixWordV1[] {
  switch (input.policy.split.kind) {
    case "first_words": return words.slice(0, input.policy.split.count);
    case "distinct_forms_then_fill": {
      const distinct = wordsByDistinctForm(words);
      const distinctIds = new Set(distinct.map((word) => word.canonicalWordId));
      return [
        ...distinct,
        ...words.filter((word) => !distinctIds.has(word.canonicalWordId)),
      ].slice(0, input.policy.split.count);
    }
    case "guided_budget_after_form_builds":
      return words.slice(0, input.policy.split.guidedSlotCount - formBuildCount);
    case "one_per_form_else_direct_and_changed": {
      const forms = wordsByDistinctForm(words);
      if (forms.length > 1) return forms;
      const direct = words.find((word) => word.teachingSurfaceText === word.semanticBaseText) ?? words[0]!;
      const changed = words.find((word) =>
        word.teachingSurfaceText !== word.semanticBaseText
        && word.canonicalWordId !== direct.canonicalWordId,
      ) ?? words.find((word) => word.canonicalWordId !== direct.canonicalWordId) ?? direct;
      return [direct, changed];
    }
  }
}

function targetChoices(
  choices: readonly SharedAffixChoiceV1[],
  word: CompiledSharedAffixWordV1,
  buildIndex: number,
  input: AffixLessonCompilationInputV1,
): SharedAffixChoiceV1[] | null {
  const targeted = choices.map((choice) =>
    choice.text === word.affixForm
      ? { ...choice, status: "target" as const }
      : choice.status === "target"
        ? { ...choice, status: "valid_alternative" as const }
        : { ...choice },
  );
  if (targeted.filter((choice) => choice.status === "target").length !== 1) return null;
  if (input.policy.choiceOrder.kind === "declared" || targeted.length < 2) return targeted;
  const wordSeed = [...word.displayWord].reduce(
    (total, letter) => total + letter.charCodeAt(0),
    0,
  );
  const offset = input.profile.position === "after"
    ? (wordSeed + (buildIndex * 2) + 1) % targeted.length
    : 0;
  return targeted.map((_, index) => targeted[(index + offset) % targeted.length]!);
}

function compileBuild(
  input: AffixLessonCompilationInputV1,
  word: CompiledSharedAffixWordV1,
  buildIndex: number,
): CompiledSharedAffixBuildV1 | null {
  const choices = targetChoices(input.profile.choices, word, buildIndex, input);
  return choices ? {
    canonicalWordId: word.canonicalWordId,
    baseWord: word.teachingSurfaceText,
    targetMeaning: word.derivedMeaning,
    choices,
  } : null;
}

function binding(
  activityId: string,
  sectionKey: SharedAffixAssignmentBindingV1["sectionKey"],
  templateKey: SharedAffixAssignmentBindingV1["templateKey"],
  canonicalWordId: string | null,
  expectedEvidenceKind: SharedAffixAssignmentBindingV1["expectedEvidenceKind"],
): SharedAffixAssignmentBindingV1 {
  return { activityId, sectionKey, templateKey, canonicalWordId, expectedEvidenceKind };
}

function assignmentBindings(
  words: readonly CompiledSharedAffixWordV1[],
  splitIds: readonly string[],
  builds: readonly CompiledSharedAffixBuildV1[],
  includeMeaningSort: boolean,
): SharedAffixAssignmentBindingV1[] {
  return [
    binding("intro-root", "lesson_intro", "MICRO_READ_ONLY_INTRO", null, "read_only"),
    binding("intro-words", "lesson_intro", "LESSON_WORDS_INTRO", null, "read_only"),
    ...splitIds.map((id) => binding(`guided-strip-${id}`, "guided_practice", "MOR_STRIP_BUILD", id, "guided_task")),
    ...(includeMeaningSort ? words.map((word) => binding(`guided-meaning-${word.canonicalWordId}`, "guided_practice", "MOR_MEANING_MATCH", word.canonicalWordId, "guided_task")) : []),
    ...builds.map((build) => binding(`guided-build-${build.canonicalWordId}`, "guided_practice", "MOR_BUILD_WORD", build.canonicalWordId, "guided_task")),
    ...words.map((word) => binding(`controlled-${word.canonicalWordId}`, "lesson_production", "CONTROLLED_SPELLING", word.canonicalWordId, "controlled_spelling")),
    ...words.map((word) => binding(`dictation-${word.canonicalWordId}`, "lesson_dictation", "DICTATION_NO_IMAGE", word.canonicalWordId, "dictation")),
  ];
}

/** Pure shadow compiler. It never selects a microskill or word and never reads persistence. */
export function compileSharedAffixLesson(
  input: AffixLessonCompilationInputV1,
): SharedAffixCompileResult {
  const blockers = validateProfile(input);
  const selected = selectedWords(input);
  blockers.push(...selected.blockers);
  if (blockers.length > 0) return { ok: false, blockers: uniqueBlockers(blockers) };

  const { words } = selected;
  const representedFormCount = new Set(words.map((word) => word.affixForm)).size;
  const preliminaryBuildCount = input.policy.build.kind === "one_per_represented_form"
    ? representedFormCount
    : 0;
  const splitWords = selectSplitWords(input, words, preliminaryBuildCount);
  const splitIds = splitWords.map((word) => word.canonicalWordId);
  if (splitIds.length === 0 || new Set(splitIds).size !== splitIds.length) {
    blockers.push(blocker("unresolved_activity_binding", "split"));
  }
  const buildWords = selectBuildWords(input, words, new Set(splitIds));
  const builds = buildWords.map((word, index) => compileBuild(input, word, index));
  if (builds.some((build) => build === null)) {
    blockers.push(blocker("invalid_choice_policy"));
  }
  const completeBuilds = builds.filter(
    (build): build is CompiledSharedAffixBuildV1 => build !== null,
  );
  const primaryWord = input.policy.primaryBuild.kind === "different_form_from_first_or_first"
    ? words.find((word) => word.affixForm !== words[0]?.affixForm) ?? words[0]
    : words.find((word) => word.canonicalWordId === completeBuilds[0]?.canonicalWordId);
  const primaryBuild = primaryWord ? compileBuild(input, primaryWord, 0) : null;
  if (!primaryBuild) blockers.push(blocker("invalid_choice_policy", "primary_build"));

  const includeMeaningSort = input.policy.meaning.kind === "sort_all_words";
  const bindings = assignmentBindings(words, splitIds, completeBuilds, includeMeaningSort);
  if (bindings.length !== input.policy.expectedAssignmentItemCount) {
    blockers.push(blocker("assignment_item_count_mismatch", `${bindings.length}:${input.policy.expectedAssignmentItemCount}`));
  }
  if (new Set(bindings.map((entry) => entry.activityId)).size !== bindings.length) {
    blockers.push(blocker("unresolved_activity_binding", "duplicate_activity_id"));
  }
  if (blockers.length > 0 || !primaryBuild) {
    return { ok: false, blockers: uniqueBlockers(blockers) };
  }

  const scheduleWordIds = input.policy.schedule.kind === "authentic_targets"
    ? words.filter((word) => word.role === "authentic_target").map((word) => word.canonicalWordId)
    : words.map((word) => word.canonicalWordId);
  const independentActivityIds = bindings
    .filter((entry) => entry.expectedEvidenceKind === "controlled_spelling" || entry.expectedEvidenceKind === "dictation")
    .map((entry) => entry.activityId);
  const sourceFingerprint = fingerprintSharedAffixInput(input);
  const draft: Omit<CompiledAffixLessonV1, "fingerprint"> = {
    compilerKey: "shared_affix_compiler",
    compilerVersion: SHARED_AFFIX_COMPILER_VERSION,
    taxonomy: input.taxonomy,
    route: input.route,
    recipe: input.recipe,
    position: input.profile.position,
    header: input.profile.header,
    introduction: input.profile.introduction,
    meaningGroups: input.profile.meaningGroups,
    reflection: input.profile.reflection,
    words,
    activities: {
      discoveryWordIds: words.map((word) => word.canonicalWordId),
      splitCanonicalWordIds: splitIds,
      primaryBuild,
      builds: completeBuilds,
      includeMeaningSort,
      ...(input.profile.prefixPresentation ? {
        meaningCheckKind: input.profile.prefixPresentation.meaningCheckKind,
        meaningResultsPresentation: input.profile.prefixPresentation.meaningResultsPresentation,
        coverClosePolicy: input.profile.prefixPresentation.coverClosePolicy,
      } : {}),
      dictationWordIds: words.map((word) => word.canonicalWordId),
    },
    assignmentBindings: bindings,
    completion: {
      requiredActivityIds: bindings.map((entry) => entry.activityId),
      independentActivityIds,
      scheduleWordIds,
      rewardWordIds: words.map((word) => word.canonicalWordId),
    },
    provenance: {
      profileVersion: input.provenance.profileVersion,
      contentVersion: input.provenance.contentVersion,
      fingerprintAlgorithm: "sha256",
      fingerprintVersion: SHARED_AFFIX_FINGERPRINT_VERSION,
      sourceFingerprint,
    },
  };
  return {
    ok: true,
    lesson: { ...draft, fingerprint: fingerprintCompiledSharedAffixLesson(draft) },
  };
}
