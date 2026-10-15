"use client";

import {
  activityTransformationText,
  lessonActivityQuestion,
} from "@/lib/teaching-dictionary-manager/activity-question";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { activityVariantsForRoute } from "@/lib/adle/composable-lesson/activity-variants";
import { ACTIVITY_LABELS } from "@/lib/teaching-dictionary-manager/activity-matrix";
import {
  publicationBlockers,
  routeContentsForSelectedSkills,
  routeForSkill,
  routeWithSharedFacts,
  type WordDraftPayload,
  type RouteContentDraft,
} from "@/lib/teaching-dictionary-manager/contracts";
import { workspaceErrorMessage } from "@/lib/teaching-dictionary-manager/workspace-errors";
import { reviewedWordCanLaunch } from "@/lib/teaching-dictionary-manager/editorial-review";
import { publicationBlockerTarget } from "@/lib/teaching-dictionary-manager/readiness";
import {
  routeRequirements,
  requirementActivities,
} from "@/lib/teaching-dictionary-manager/workspace-requirements";
import {
  withDerivedMorphologyMetadata,
  dictationVariants,
  generatedWordSum,
  targetOccurrences,
  type ReviewedTransformation,
} from "@/lib/teaching-dictionary-manager/authoring";
import type { LessonReadinessRow } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { saveTeachingDictionaryDraft } from "./actions";
import { launchReviewedAdleLesson } from "../adle-lesson-readiness/actions";
import { CompoundPartsEditor } from "./compound-parts-editor";
import {
  PairedDictationEditor,
  type PassageSet,
} from "./paired-dictation-editor";
import { PartSequenceEditor } from "./word-editor";
import { ActionSubmitButton } from "./action-submit-button";

const button =
  "rounded-lg bg-[var(--scarlett)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const input =
  "w-full min-w-24 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";
const section = "rounded-xl border border-[var(--border)] bg-white";
const actions = "mt-3 flex flex-wrap justify-end gap-2";
type Skill = {
  micro_skill_key: string;
  display_name: string;
  skill_family_key: string;
  skill_cluster_key: string;
};
type Family = { name: string; words: { id: string; word: string }[] };
type Field = {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
};

function Pencil({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit ${label}`}
      className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded text-[color:var(--scarlett)]"
    >
      ✎
    </button>
  );
}
function Prompt({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Show learner question"
        className="ml-2 inline-flex size-5 items-center justify-center rounded-full border border-[var(--border)] text-xs"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="absolute left-0 top-7 z-20 hidden w-72 max-w-[70vw] rounded-lg border border-[var(--border)] bg-white p-3 text-sm font-normal shadow-lg group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}
function Editable({
  label,
  value,
  id,
  onChange,
  options,
  hideLabel,
}: {
  hideLabel?: boolean;
  label: string;
  value: string;
  id: string;
  onChange: (value: string) => void;
  options?: Field["options"];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div id={id} className="min-w-0 scroll-mt-6">
      <label
        htmlFor={`${id}-input`}
        className={hideLabel ? "sr-only" : "text-xs text-[color:var(--mid)]"}
      >
        {label}
      </label>
      <div className="flex min-h-9 items-start justify-between gap-1">
        {editing ? (
          options ? (
            <select
              autoFocus
              id={`${id}-input`}
              className={input}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            >
              <option value="">Select</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              id={`${id}-input`}
              className={input}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : (
          <span className="break-words py-1 text-sm">
            {(options?.find((option) => option.value === value)?.label ??
              value) || <span className="text-amber-900">Missing</span>}
          </span>
        )}
        <Pencil label={label} onClick={() => setEditing(!editing)} />
      </div>
    </div>
  );
}

export function WordWorkspace(props: {
  wordId: string | null;
  draftId: string | null;
  normalisedWord: string;
  initial: WordDraftPayload;
  sourceReference: string;
  skills: Skill[];
  preflights: LessonReadinessRow[];
  affixMeanings: Record<string, string[]>;
  partSuggestions: {
    label: string;
    parts: unknown[];
    joins: unknown[];
    transformations: ReviewedTransformation[];
  }[];
  profileOptions: {
    microSkillKey: string;
    meaningBins: { id: string; label: string }[];
    choices: string[];
  }[];
  baseFamilies: Family[];
  familyReview: ReactNode;
  advanced: ReactNode;
  saved?: boolean;
  error?: string;
  overviewReviewed: boolean;
}) {
  const [payload, setPayload] = useState<WordDraftPayload>(() => ({
    ...props.initial,
    dictationVariants: dictationVariants(props.initial),
    writtenSyllableBreakdown: props.initial.writtenSyllableBreakdown ?? "",
  }));
  const [saveState, saveAction, saving] = useActionState(
    async (_previous: null, form: FormData) => {
      await saveTeachingDictionaryDraft(form);
      return null;
    },
    null,
  );
  void saveState;
  const [dirty, setDirty] = useState(false);
  const [joined, setJoined] = useState("");
  const [splitSkill, setSplitSkill] = useState<string | null>(null);
  const splitDialog = useRef<HTMLDialogElement>(null);
  const builder = useRef<HTMLDialogElement>(null);
  const family = useRef<HTMLDialogElement>(null);
  const formId = "word-workspace-save";
  function change(update: Partial<WordDraftPayload>) {
    setPayload((old) => withDerivedMorphologyMetadata({ ...old, ...update }));
    setDirty(true);
  }
  function metadata(
    key: keyof WordDraftPayload["metadata"],
    value: string | boolean | null,
  ) {
    change({ metadata: { ...payload.metadata, [key]: value } });
  }
  function routeContent(key: string): RouteContentDraft | undefined {
    return routeContentsForSelectedSkills(payload).find(
      (route) => route.microSkillKey === key,
    );
  }
  function updateRoute(key: string, values: Record<string, unknown>) {
    const current = routeContent(key);
    if (!current) return;
    change({
      routeContents: [
        ...payload.routeContents.filter((route) => route.microSkillKey !== key),
        { ...current, content: { ...current.content, ...values } },
      ],
    });
  }
  useEffect(() => {
    function reveal() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      if (
        [
          "td-canonical-parts",
          "td-canonical-word-sum",
          "td-written-syllables",
        ].includes(id) &&
        !builder.current?.open
      )
        builder.current?.showModal();
      const splitMatch =
        /^td-route-(.+)-(teachingSplitParts|teachingSplitJoins|trueMorphologyParts|trueMorphologyJoins)$/.exec(
          id,
        );
      if (splitMatch) {
        setSplitSkill(splitMatch[1]);
        if (!splitDialog.current?.open) splitDialog.current?.showModal();
      }
      const target = document.getElementById(id);
      let parent = target?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target?.scrollIntoView({ block: "center" });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const selectedRoutes = payload.skillKeys.flatMap((key) => {
    const route = routeForSkill(key);
    return route?.newAssignmentCapable ? [{ key, route }] : [];
  });
  const name = (key: string) =>
    props.skills.find((skill) => skill.micro_skill_key === key)?.display_name ??
    key;
  const checks = selectedRoutes.map(({ key, route }) => {
    const content = routeContent(key)!;
    const preflight = props.preflights.find(
      (row) => row.routeId === route.routeId && row.microSkillKey === key,
    );
    const requirements = [
      ...routeRequirements(content, payload),
      ...publicationBlockers(
        payload,
        props.normalisedWord || payload.displayWord.toLowerCase(),
      ).map((label) => ({
        label,
        status: "missing" as const,
        editTarget: publicationBlockerTarget(label),
      })),
    ];
    const word = preflight?.words.find((word) => word.id === props.wordId);
    return {
      key,
      route,
      content,
      preflight,
      requirements,
      word,
      ready:
        !dirty &&
        Boolean(
          preflight?.compilerReady &&
          reviewedWordCanLaunch(
            word,
            props.draftId,
            preflight.compilerWitnesses,
          ),
        ),
    };
  });
  const columns = [
    ...new Set(
      checks.flatMap((row) =>
        activityVariantsForRoute(row.route.routeId, row.key)
          .filter((item) => item.enabled)
          .map((item) => item.kind),
      ),
    ),
  ];
  const overview = [
    {
      key: "dictionary",
      label: "Dictionary word",
      value:
        props.normalisedWord || payload.displayWord.toLocaleLowerCase("en-GB"),
      change: (v: string) => change({ displayWord: v }),
      readOnly: Boolean(props.wordId),
    },
    {
      key: "display",
      label: "Display word",
      value: payload.displayWord,
      change: (v: string) => change({ displayWord: v }),
    },
    {
      key: "speech",
      label: "Part of speech",
      value: payload.canonicalMorphology.rawPartOfSpeech,
      change: (v: string) =>
        change({
          canonicalMorphology: {
            ...payload.canonicalMorphology,
            rawPartOfSpeech: v,
          },
        }),
    },
    {
      key: "definition",
      label: "Definition",
      value: payload.definition,
      change: (v: string) => change({ definition: v }),
    },
    {
      key: "syllables",
      label: "Spoken syllables",
      value: payload.metadata.syllables,
      change: (v: string) => metadata("syllables", v),
    },
    {
      key: "phoneme_hint",
      label: "Phonemes",
      value: payload.metadata.phoneme_hint,
      change: (v: string) => metadata("phoneme_hint", v),
    },
    {
      key: "has-schwa",
      label: "Schwa",
      value:
        payload.metadata.has_schwa === null
          ? ""
          : String(payload.metadata.has_schwa),
      change: (v: string) =>
        metadata("has_schwa", v === "" ? null : v === "true"),
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
  ];
  function saveButton(review: string, label = "Save and approve") {
    return (
      <ActionSubmitButton
        pending={saving}
        form={formId}
        name="review_section"
        value={review}
        pendingLabel="Saving…"
        className={button}
      >
        {label}
      </ActionSubmitButton>
    );
  }
  function sharedField(label: string, value: string, target: string) {
    return (
      <div className="min-w-0 rounded-md bg-[var(--paper)] p-2">
        <p className="text-xs text-[color:var(--mid)]">{label}</p>
        <div className="flex items-start justify-between">
          <span className="break-words text-sm">{value || "Missing"}</span>
          <a
            className="px-2 text-[color:var(--scarlett)]"
            href={`#${target}`}
            aria-label={`Edit ${label}`}
          >
            ✎
          </a>
        </div>
      </div>
    );
  }
  function fields(key: string, kind: string): Field[] {
    const route = routeForSkill(key);
    const profile = props.profileOptions.find(
      (profile) => profile.microSkillKey === key,
    );
    const meaning = {
      key: "meaningBinKey",
      label: "Meaning group",
      options: profile?.meaningBins.map((bin) => ({
        value: bin.id,
        label: bin.label,
      })),
    };
    if (kind === "meaning_sort") return profile ? [meaning] : [];
    if (kind === "discovery" || kind === "meaning_match")
      return [
        { key: "baseMeaning", label: "Base meaning" },
        ...(profile &&
        !activityVariantsForRoute(route?.routeId ?? "", key).some(
          (v) => v.kind === "meaning_sort" && v.enabled,
        )
          ? [meaning]
          : []),
        ...(route?.routeId === "dynamic_affix_word_lab"
          ? [
              { key: "semanticBaseText", label: "Semantic base / root" },
              {
                key: "semanticBaseKind",
                label: "Base or root",
                options: [
                  { value: "base", label: "Whole base" },
                  { value: "root", label: "Bound root" },
                ],
              },
            ]
          : []),
      ];
    if (kind === "cleaver")
      return route?.routeId === "dynamic_prefix_word_lab"
        ? [{ key: "baseWord", label: "Base word" }]
        : [];
    if (kind === "word_build")
      return route?.routeId === "dynamic_prefix_word_lab"
        ? [
            {
              key: "prefixVariant",
              label: "Prefix",
              options: profile?.choices.map((value) => ({
                value,
                label: `${value}-`,
              })),
            },
          ]
        : route?.routeId === "dynamic_affix_word_lab"
          ? [
              {
                key: "suffixVariant",
                label: "Suffix",
                options: profile?.choices.map((value) => ({
                  value,
                  label: `-${value}`,
                })),
              },
            ]
          : route?.routeId === "ing_endings_word_lab"
            ? [
                { key: "base", label: "Unchanged base" },
                ...(key.endsWith("DOUBLE_FINAL_CONSONANT")
                  ? [
                      {
                        key: "doublingPattern",
                        label: "Doubling pattern",
                        options: [
                          { value: "short_cvc", label: "Short CVC" },
                          {
                            value: "stressed_final_syllable",
                            label: "Stressed final syllable",
                          },
                        ],
                      },
                    ]
                  : []),
              ]
            : [];
    if (kind === "family_reveal")
      return [
        { key: "familyKey", label: "Family" },
        { key: "baseWord", label: "Base word" },
        { key: "baseMeaning", label: "Base meaning" },
      ];
    if (kind === "compound_jigsaw")
      return [
        { key: "componentToWholeRelationship", label: "Combined meaning" },
      ];
    return [];
  }
  return (
    <div className="grid gap-3">
      <form id={formId} action={saveAction}>
        <input type="hidden" name="word_id" value={props.wordId ?? ""} />
        <input
          type="hidden"
          name="normalised_word"
          value={
            props.normalisedWord ||
            payload.displayWord.toLocaleLowerCase("en-GB")
          }
        />
        <input
          type="hidden"
          name="source_reference"
          value={props.sourceReference}
        />
        <input
          type="hidden"
          name="payload_json"
          value={JSON.stringify(payload)}
        />
      </form>
      {props.saved && (
        <p role="status" className="text-sm text-emerald-800">
          Saved.{" "}
          {dirty
            ? "Unsaved edits need approval."
            : "Current release checks are shown below."}
        </p>
      )}
      {props.error && (
        <p
          role="alert"
          className="rounded bg-amber-50 p-3 text-sm text-amber-950"
        >
          {workspaceErrorMessage(props.error)}
        </p>
      )}
      <details id="td-overview" className={section} open>
        <summary className="cursor-pointer p-4 font-semibold">
          1 · Overview{" "}
          <span className="ml-2 text-xs font-normal text-[color:var(--mid)]">
            {dirty
              ? "Edited · needs approval"
              : props.overviewReviewed
                ? "Reviewed"
                : "Review required"}
          </span>
        </summary>
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] table-fixed text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs text-[color:var(--mid)]">
                <tr>
                  {overview.map((field) => (
                    <th key={field.key} className="p-2 font-medium">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {overview.map((field) => (
                    <td key={field.key} className="p-2 align-top">
                      {field.readOnly ? (
                        <span className="block py-1">{field.value}</span>
                      ) : (
                        <Editable
                          hideLabel
                          id={`td-${field.key}`}
                          label={field.label}
                          value={field.value}
                          onChange={field.change}
                          options={field.options}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 overflow-x-auto border-t border-[var(--border)] pt-3">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[color:var(--mid)]">
                <tr>
                  <th className="p-2 font-medium">Parts &amp; meanings</th>
                  <th className="p-2 font-medium">Canonical word sum</th>
                  <th className="p-2 font-medium">Written syllables</th>
                  <th className="p-2 font-medium">Transformations</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2">
                    {payload.canonicalMorphology.parts.map((raw, i) => {
                      const part = raw as Record<string, unknown>;
                      return (
                        <span
                          key={i}
                          className="mr-1 inline-block rounded bg-[var(--paper)] px-2 py-1"
                        >
                          {String(
                            part.sourceText ||
                              part.surfaceText ||
                              part.text ||
                              "",
                          )}{" "}
                          · {String(part.gloss || "meaning missing")}
                        </span>
                      );
                    })}
                  </td>
                  <td className="p-2">
                    {payload.canonicalMorphology.wordSum || "Missing"}
                  </td>
                  <td className="p-2">
                    {payload.writtenSyllableBreakdown || "Missing"}
                  </td>
                  <td className="p-2">
                    {payload.canonicalMorphology.transformations
                      ?.map(
                        (item) =>
                          item.explanation ||
                          `${item.sourceText} → ${item.surfaceText}`,
                      )
                      .join("; ") || "None recorded"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={actions}>
            <button
              type="button"
              className={button}
              onClick={() => builder.current?.showModal()}
            >
              Edit word parts
            </button>
          </div>
          <h3 id="td-dictation" className="mt-4 scroll-mt-6 font-semibold">
            Dictation sentences
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs text-[color:var(--mid)]">
                <tr>
                  <th className="p-2 font-medium">Use</th>
                  <th className="p-2 font-medium">Sentence</th>
                  <th className="p-2 font-medium">Target occurrence</th>
                  <th className="p-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {dictationVariants(payload).map((variant, index) => (
                  <tr
                    key={variant.id}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="p-2">
                      {index === 0 ? "Primary" : "Alternate"}
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Dictation sentence ${index + 1}`}
                        className={input}
                        value={variant.sentence}
                        onChange={(event) => {
                          const variants = dictationVariants(payload).map(
                            (old, at) =>
                              at === index
                                ? {
                                    ...old,
                                    sentence: event.target.value,
                                    audioText: event.target.value,
                                  }
                                : old,
                          );
                          const primary = variants[0];
                          change({
                            dictationVariants: variants,
                            dictationSentence: primary.sentence,
                            dictationTargetTokenIndex: primary.targetTokenIndex,
                          });
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Target in sentence ${index + 1}`}
                        className={input}
                        value={variant.targetTokenIndex}
                        onChange={(event) => {
                          const variants = dictationVariants(payload).map(
                            (old, at) =>
                              at === index
                                ? {
                                    ...old,
                                    targetTokenIndex: Number(
                                      event.target.value,
                                    ),
                                  }
                                : old,
                          );
                          change({
                            dictationVariants: variants,
                            dictationTargetTokenIndex:
                              variants[0].targetTokenIndex,
                          });
                        }}
                      >
                        <option value={-1}>Choose target</option>
                        {targetOccurrences(
                          variant.sentence,
                          payload.displayWord,
                        ).map((token, at) => (
                          <option key={token} value={token}>
                            {payload.displayWord} · occurrence {at + 1}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      {index > 0 && (
                        <button
                          type="button"
                          className="text-[color:var(--scarlett)] underline"
                          onClick={() =>
                            change({
                              dictationVariants: dictationVariants(
                                payload,
                              ).filter((_, at) => at !== index),
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={actions}>
            <button
              type="button"
              className={button}
              onClick={() =>
                change({
                  dictationVariants: [
                    ...dictationVariants(payload),
                    {
                      id: crypto.randomUUID(),
                      sentence: "",
                      targetTokenIndex: -1,
                      audioText: "",
                    },
                  ],
                })
              }
            >
              Add sentence
            </button>
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <h3 id="td-base-family" className="font-semibold">
              Base word family
            </h3>
            {props.baseFamilies.length ? (
              props.baseFamilies.map((item) => (
                <div
                  key={item.name}
                  className="mt-2 flex flex-wrap items-center gap-2 text-sm"
                >
                  <strong>Base Family: {item.name}</strong>
                  {item.words.map((word) => (
                    <Link
                      key={word.id}
                      href={`/admin/teaching-dictionary/${word.id}`}
                      className="rounded-full bg-[var(--paper)] px-3 py-1 hover:underline"
                    >
                      {word.word}
                    </Link>
                  ))}
                </div>
              ))
            ) : (
              <p className="mt-2 text-sm text-[color:var(--mid)]">
                No reviewed family joined
              </p>
            )}
            <div className={actions}>
              <button
                type="button"
                className={button}
                onClick={() => family.current?.showModal()}
              >
                Join or change family
              </button>
              {saveButton("overview")}
            </div>
          </div>
        </div>
      </details>
      <details id="td-skills" className={`${section} scroll-mt-6`}>
        <summary className="cursor-pointer p-4 font-semibold">
          2 · Micro-skills{" "}
          <span className="ml-2 text-xs font-normal">
            {payload.skillKeys.length} joined
          </span>
        </summary>
        <div className="px-4 pb-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Micro-skill</th>
                <th className="p-2">Route</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {payload.skillKeys.map((key) => {
                const route = routeForSkill(key);
                const preflight = props.preflights.find(
                  (row) => row.microSkillKey === key,
                );
                return (
                  <tr key={key} className="border-b last:border-0">
                    <td className="p-2">{name(key)}</td>
                    <td className="p-2">
                      {!route?.newAssignmentCapable
                        ? "No Route Available"
                        : preflight?.activationEnabled
                          ? "Active"
                          : "Built · inactive"}
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-[color:var(--scarlett)] underline"
                        onClick={() =>
                          change({
                            skillKeys: payload.skillKeys.filter(
                              (skill) => skill !== key,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <select
              aria-label="Micro-skill to join"
              className={`${input} max-w-sm`}
              value={joined}
              onChange={(event) => setJoined(event.target.value)}
            >
              <option value="">Choose micro-skill</option>
              {props.skills
                .filter(
                  (skill) => !payload.skillKeys.includes(skill.micro_skill_key),
                )
                .map((skill) => (
                  <option
                    key={skill.micro_skill_key}
                    value={skill.micro_skill_key}
                  >
                    {skill.display_name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className={button}
              disabled={!joined}
              onClick={() => {
                change({ skillKeys: [...payload.skillKeys, joined] });
                setJoined("");
              }}
            >
              Add micro-skill
            </button>
            {saveButton("skills", "Save micro-skills")}
          </div>
        </div>
      </details>
      <section id="td-lesson-checks" className={`${section} p-4`}>
        <h2 className="font-semibold">3 · Lesson checks</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Micro-skill</th>
                {columns.map((kind) => (
                  <th key={kind} className="p-2 text-center text-xs">
                    {ACTIVITY_LABELS[kind]}
                  </th>
                ))}
                <th className="p-2">Release</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <th className="p-2 text-left font-medium">{name(row.key)}</th>
                  {columns.map((kind) => {
                    const variant = activityVariantsForRoute(
                      row.route.routeId,
                      row.key,
                    ).find((item) => item.kind === kind && item.enabled);
                    const missing = row.requirements.filter(
                      (requirement) =>
                        requirement.status !== "present" &&
                        requirementActivities(
                          requirement,
                          row.route.routeId,
                        ).includes(kind),
                    );
                    return (
                      <td key={kind} className="p-2 text-center">
                        {!variant ? (
                          <span className="text-[color:var(--mid)]">—</span>
                        ) : missing.length ? (
                          <a
                            href={`#${missing[0].editTarget}`}
                            className="text-xs text-amber-900 underline"
                          >
                            ⚠ {missing[0].label}
                          </a>
                        ) : row.ready ? (
                          <span
                            aria-label={`${ACTIVITY_LABELS[kind]} passed`}
                            className="text-emerald-700"
                          >
                            ✓
                          </span>
                        ) : (
                          <a
                            href={`#td-route-${row.key}`}
                            className="text-xs text-amber-900 underline"
                          >
                            Review
                          </a>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 text-xs">
                    {row.preflight?.status.replaceAll("_", " ") ??
                      "Needs review"}
                  </td>
                </tr>
              ))}
              {payload.skillKeys
                .filter((key) => !routeForSkill(key)?.newAssignmentCapable)
                .map((key) => (
                  <tr key={key}>
                    <th className="p-2 text-left font-medium">{name(key)}</th>
                    <td
                      colSpan={columns.length + 1}
                      className="p-2 text-[color:var(--mid)]"
                    >
                      No Route Available
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      {checks.map((row, index) => {
        const route = routeWithSharedFacts(row.content, payload);
        const profile = props.profileOptions.find(
          (profile) => profile.microSkillKey === row.key,
        );
        return (
          <details
            id={`td-route-${row.key}`}
            key={row.key}
            className={`${section} scroll-mt-6`}
          >
            <summary className="cursor-pointer p-4 font-semibold">
              {index + 4} · {name(row.key)} lesson{" "}
              <span className="ml-2 text-xs font-normal">
                {row.preflight?.activationEnabled ? "Active" : "Inactive"} ·{" "}
                {row.preflight?.status.replaceAll("_", " ") ?? "Needs review"}
              </span>
            </summary>
            <div className="px-4 pb-4">
              {activityVariantsForRoute(row.route.routeId, row.key)
                .filter((variant) => variant.enabled)
                .map((variant) => (
                  <details
                    key={variant.kind}
                    className="border-t border-[var(--border)] py-3"
                  >
                    <summary className="mb-2 cursor-pointer font-semibold">
                      {ACTIVITY_LABELS[variant.kind]}
                      <Prompt
                        text={lessonActivityQuestion({
                          kind: variant.kind,
                          route,
                          word: payload.displayWord,
                          wordId: props.wordId,
                          compiled: row.preflight?.compiledPreview,
                          sources: row.preflight?.releaseContentPreview ?? [],
                        })}
                      />
                    </summary>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {variant.wordScope !== "no_word" &&
                        sharedField(
                          "Target word",
                          payload.displayWord,
                          "td-display",
                        )}
                      {[
                        "discovery",
                        "meaning_match",
                        "meaning_sort",
                        "word_build",
                      ].includes(variant.kind) && (
                        <div className="rounded-md bg-[var(--paper)] p-2">
                          <Editable
                            label="Word meaning in this lesson"
                            id={`td-route-${row.key}-${variant.kind}-wordMeaning`}
                            value={route.wordMeaning}
                            onChange={(wordMeaning) =>
                              change({
                                routeContents: [
                                  ...payload.routeContents.filter(
                                    (old) => old.microSkillKey !== row.key,
                                  ),
                                  { ...route, wordMeaning },
                                ],
                              })
                            }
                          />
                        </div>
                      )}
                      {["cleaver", "word_build"].includes(variant.kind) && (
                        <>
                          {sharedField(
                            variant.kind === "cleaver"
                              ? "Learner cut"
                              : "Parts and word sum",
                            (Array.isArray(route.content.teachingSplitParts)
                              ? route.content.teachingSplitParts
                              : payload.canonicalMorphology.parts
                            )
                              .map((raw) => {
                                const part = raw as Record<string, unknown>;
                                return String(
                                  part.surfaceText || part.text || "",
                                );
                              })
                              .join(" | "),
                            "td-canonical-parts",
                          )}
                          {activityTransformationText(
                            route,
                            variant.kind,
                            payload.displayWord,
                          ).length > 0 &&
                            sharedField(
                              "Transformations shown",
                              activityTransformationText(
                                route,
                                variant.kind,
                                payload.displayWord,
                              ).join("; "),
                              "td-canonical-parts",
                            )}
                        </>
                      )}
                      {variant.kind === "dictation" &&
                        sharedField(
                          "Approved sentences",
                          String(dictationVariants(payload).length),
                          "td-dictation",
                        )}
                      {fields(row.key, variant.kind).map((field) => (
                        <div
                          key={field.key}
                          className="rounded-md bg-[var(--paper)] p-2"
                        >
                          <Editable
                            id={`td-route-${row.key}-${field.key}`}
                            label={field.label}
                            value={String(route.content[field.key] ?? "")}
                            options={field.options}
                            onChange={(value) =>
                              updateRoute(row.key, { [field.key]: value })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    {variant.kind === "compound_jigsaw" && (
                      <div id={`td-route-${row.key}-components`}>
                        <CompoundPartsEditor
                          components={
                            (route.content.components ?? []) as Parameters<
                              typeof CompoundPartsEditor
                            >[0]["components"]
                          }
                          joins={(route.content.joins ?? []) as string[]}
                          onChange={(components, joins) =>
                            updateRoute(row.key, {
                              components,
                              joins,
                              morphologyProvenance: route.content
                                .morphologyProvenance ?? {
                                source: "Teaching Dictionary admin review",
                              },
                            })
                          }
                        />
                      </div>
                    )}
                    {variant.kind === "dictation" &&
                      [
                        "homophone_word_lab",
                        "comparative_superlative_word_lab",
                      ].includes(row.route.routeId) &&
                      (() => {
                        const preview = row.preflight?.releaseContentPreview as
                          | {
                              authorityType?: string;
                              content?: Record<string, unknown>;
                            }[]
                          | undefined;
                        const source = preview?.find(
                          (item) =>
                            item.authorityType ===
                            (row.route.routeId === "homophone_word_lab"
                              ? "homophone_lesson_content"
                              : "adjective_degree_families"),
                        )?.content;
                        if (row.route.routeId === "homophone_word_lab") {
                          const lesson = source?.lesson as
                            | { dictationPassages?: PassageSet["passages"] }
                            | undefined;
                          const sets = (route.content
                            .dictationPassageVariants ??
                            source?.dictationPassageVariants ??
                            (lesson?.dictationPassages
                              ? [
                                  {
                                    id: "primary",
                                    passages: lesson.dictationPassages,
                                  },
                                ]
                              : [])) as PassageSet[];
                          return sets.length ? (
                            <PairedDictationEditor
                              sets={sets}
                              onChange={(sets) =>
                                updateRoute(row.key, {
                                  dictationPassageVariants: sets,
                                })
                              }
                            />
                          ) : (
                            <p className="mt-2 text-sm text-amber-900">
                              The reviewed paired passage group is missing.
                            </p>
                          );
                        }
                        const families = source?.families as
                          | {
                              familyKey: string;
                              words: { canonicalWordId: string }[];
                              content: {
                                pairedSentence: PassageSet["passages"][number];
                                pairedSentenceVariants?: PassageSet["passages"];
                              };
                            }[]
                          | undefined;
                        const family = families?.find((f) =>
                          f.words.some(
                            (word) => word.canonicalWordId === props.wordId,
                          ),
                        );
                        const passages = (route.content
                          .pairedSentenceVariants ??
                          family?.content.pairedSentenceVariants ??
                          (family
                            ? [family.content.pairedSentence]
                            : [])) as PassageSet["passages"];
                        return passages.length ? (
                          <PairedDictationEditor
                            sets={passages.map((p) => ({
                              id: p.id,
                              passages: [p],
                            }))}
                            onChange={(sets) =>
                              updateRoute(row.key, {
                                pairedSentenceVariants: sets.flatMap(
                                  (set) => set.passages,
                                ),
                              })
                            }
                          />
                        ) : (
                          <p className="mt-2 text-sm text-amber-900">
                            A reviewed adjective family and paired passage are
                            required.
                          </p>
                        );
                      })()}
                    {variant.kind === "cleaver" &&
                      [
                        "dynamic_prefix_word_lab",
                        "dynamic_affix_word_lab",
                      ].includes(row.route.routeId) && (
                        <>
                          <p className="mt-2 text-xs text-[color:var(--mid)]">
                            Canonical morphology:{" "}
                            {payload.canonicalMorphology.wordSum || "Missing"}
                          </p>
                          {JSON.stringify(route.content.teachingSplitParts) !==
                            JSON.stringify(
                              payload.canonicalMorphology.parts,
                            ) && (
                            <p className="mt-1 text-xs text-amber-900">
                              The learner cut differs from the shared parts.
                              Review this activity analysis.
                            </p>
                          )}
                          <div className={actions}>
                            <button
                              type="button"
                              className={button}
                              onClick={() => {
                                setSplitSkill(row.key);
                                splitDialog.current?.showModal();
                              }}
                            >
                              Edit activity cut
                            </button>
                          </div>
                        </>
                      )}
                    {variant.kind === "word_build" &&
                      row.route.routeId === "dynamic_prefix_word_lab" && (
                        <fieldset
                          id={`td-route-${row.key}-choiceAudit`}
                          className="mt-2"
                        >
                          <legend className="text-xs">
                            Review the correct prefix choice
                          </legend>
                          <div className="mt-1 flex flex-wrap gap-3">
                            {profile?.choices.map((choice) => {
                              const audit = route.content.choiceAudit as
                                | { choiceVerdicts?: Record<string, boolean> }
                                | undefined;
                              return (
                                <label key={choice} className="text-sm">
                                  <input
                                    type="radio"
                                    name={`choice-${row.key}`}
                                    checked={
                                      audit?.choiceVerdicts?.[choice] === true
                                    }
                                    onChange={() =>
                                      updateRoute(row.key, {
                                        choiceAudit: {
                                          word: payload.displayWord,
                                          choiceVerdicts: Object.fromEntries(
                                            profile.choices.map((form) => [
                                              form,
                                              form === choice,
                                            ]),
                                          ),
                                        },
                                      })
                                    }
                                  />{" "}
                                  {choice}-
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                    {variant.kind === "cleaver" &&
                      row.route.routeId === "dynamic_affix_word_lab" && (
                        <label
                          id={`td-route-${row.key}-trueMorphologyProvenance`}
                          className="mt-2 flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={
                              (
                                route.content.trueMorphologyProvenance as
                                  { status?: string } | undefined
                              )?.status === "reviewed"
                            }
                            onChange={(event) =>
                              updateRoute(row.key, {
                                trueMorphologyProvenance: {
                                  status: event.target.checked
                                    ? "reviewed"
                                    : "draft_requires_editorial_review",
                                  source:
                                    "Teaching Dictionary editorial review",
                                  reviewNote:
                                    payload.canonicalMorphology.reviewNotes ||
                                    "Reviewed canonical parts and activity split",
                                },
                              })
                            }
                          />
                          I have checked the true morphology and the learner
                          cut.
                        </label>
                      )}
                  </details>
                ))}
              {row.preflight && (
                <div className="mt-2 space-y-1 text-sm">
                  {row.preflight.issues
                    .filter(
                      (issue) =>
                        issue.wordId === props.wordId ||
                        issue.category !== "word",
                    )
                    .map((issue, at) => (
                      <p key={at} className="text-amber-900">
                        <a className="underline" href={issue.editHref}>
                          {issue.message}
                        </a>
                      </p>
                    ))}
                </div>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer">
                  Compiled lesson preview
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--paper)] p-3 text-xs">
                  {JSON.stringify(
                    row.preflight?.compiledPreview ??
                      row.preflight?.releaseContentPreview ??
                      {},
                    null,
                    2,
                  )}
                </pre>
              </details>
              <div className={actions}>
                {saveButton(
                  `lesson:${row.key}`,
                  "Save and approve lesson details",
                )}
              </div>
              <form action={launchReviewedAdleLesson} className={actions}>
                <input
                  type="hidden"
                  name="draft_id"
                  value={props.draftId ?? ""}
                />
                <input
                  type="hidden"
                  name="word_id"
                  value={props.wordId ?? ""}
                />
                <input
                  type="hidden"
                  name="route_id"
                  value={row.route.routeId}
                />
                <input type="hidden" name="micro_skill_key" value={row.key} />
                <input
                  type="hidden"
                  name="preflight_fingerprint"
                  value={row.preflight?.preflightFingerprint ?? ""}
                />
                <ActionSubmitButton
                  pendingLabel="Launching…"
                  disabled={
                    !row.ready ||
                    row.preflight?.status !== "ready_to_launch" ||
                    !row.preflight.activationEnabled
                  }
                  className={button}
                >
                  Launch lesson
                </ActionSubmitButton>
              </form>
            </div>
          </details>
        );
      })}
      <details className={section}>
        <summary className="cursor-pointer p-4 font-semibold">Advanced</summary>
        <div className="grid gap-4 px-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["ageBand", "Age band"],
                ["frequencyBand", "Frequency band"],
                ["complexityBand", "Complexity band"],
              ] as const
            ).map(([key, label]) => (
              <Editable
                key={key}
                id={`td-${key.replace("Band", "-band")}`}
                label={label}
                value={payload[key]}
                onChange={(value) => change({ [key]: value })}
              />
            ))}
            <Editable
              id="td-stress_pattern"
              label="Stress pattern"
              value={payload.metadata.stress_pattern}
              onChange={(value) => metadata("stress_pattern", value)}
            />
            <Editable
              id="td-morphemes"
              label="Legacy morphemes"
              value={payload.metadata.morphemes}
              onChange={(value) => metadata("morphemes", value)}
            />
            <Editable
              id="td-morphology_notes"
              label="Morphology notes"
              value={payload.metadata.morphology_notes}
              onChange={(value) => metadata("morphology_notes", value)}
            />
          </div>
          {payload.routeContents.map((route) => (
            <label
              key={route.microSkillKey}
              id={`td-route-${route.microSkillKey}-advanced`}
              className="text-sm"
            >
              {name(route.microSkillKey)} · additional reviewed route facts
              <textarea
                className={`${input} mt-1 font-mono`}
                rows={4}
                defaultValue={JSON.stringify(route.content, null, 2)}
                onBlur={(event) => {
                  try {
                    const content: unknown = JSON.parse(event.target.value);
                    if (
                      content &&
                      typeof content === "object" &&
                      !Array.isArray(content)
                    )
                      updateRoute(
                        route.microSkillKey,
                        content as Record<string, unknown>,
                      );
                  } catch {
                    event.target.setCustomValidity("Enter a valid JSON object");
                    event.target.reportValidity();
                  }
                }}
              />
            </label>
          ))}
          <div id="td-source" className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["sourceCategory", "Source category"],
                ["sourceName", "Source name"],
                ["sourceUrl", "Source URL"],
                ["sourceLicence", "Source licence"],
                ["sourceUseNote", "Source use note"],
                ["confidence", "Confidence"],
              ] as const
            ).map(([key, label]) => (
              <Editable
                key={key}
                id={`td-source-${key}`}
                label={label}
                value={payload.provenance[key]}
                options={
                  key === "sourceCategory"
                    ? [
                        "internal_authored",
                        "internal_reviewed_seed",
                        "public_domain",
                        "open_licensed",
                        "licensed_vendor",
                        "reference_only",
                        "ai_assisted_draft",
                      ].map((value) => ({
                        value,
                        label: value.replaceAll("_", " "),
                      }))
                    : key === "confidence"
                      ? ["low", "medium", "high"].map((value) => ({
                          value,
                          label: value,
                        }))
                      : undefined
                }
                onChange={(value) =>
                  change({
                    provenance: { ...payload.provenance, [key]: value },
                  })
                }
              />
            ))}
          </div>
          {props.advanced}
          <div className={actions}>{saveButton("overview")}</div>
        </div>
      </details>
      <dialog
        ref={builder}
        className="w-[min(900px,95vw)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 text-[color:var(--ink)] backdrop:bg-black/40"
      >
        <h2 className="mb-3 text-lg font-semibold">Word parts and meanings</h2>
        {props.partSuggestions.length > 0 && (
          <details className="mb-3 rounded border p-3 text-sm">
            <summary className="cursor-pointer">
              Existing analyses to review
            </summary>
            {props.partSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="mt-2 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p>{suggestion.label}</p>
                  <p className="text-xs">
                    {generatedWordSum(suggestion.parts, payload.displayWord)}
                  </p>
                  {JSON.stringify(suggestion.parts) !==
                    JSON.stringify(payload.canonicalMorphology.parts) && (
                    <p className="text-xs text-amber-900">
                      Different from the current shared analysis
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        parts: structuredClone(suggestion.parts),
                        joins: structuredClone(suggestion.joins),
                        transformations: structuredClone(
                          suggestion.transformations,
                        ),
                        wordSum: generatedWordSum(
                          suggestion.parts,
                          payload.displayWord,
                        ),
                        analysisStatus: "approved",
                        reviewNotes: `Selected and reviewed: ${suggestion.label}`,
                      },
                    })
                  }
                >
                  Use for review
                </button>
              </div>
            ))}
          </details>
        )}
        <PartSequenceEditor
          id="td-canonical-parts"
          label="Morphology parts and cuts"
          word={payload.displayWord}
          parts={payload.canonicalMorphology.parts}
          joins={payload.canonicalMorphology.joins}
          affixMeanings={props.affixMeanings}
          onChange={(parts, joins) =>
            change({
              canonicalMorphology: {
                ...payload.canonicalMorphology,
                parts,
                joins,
                wordSum: generatedWordSum(parts, payload.displayWord),
                analysisStatus: "approved",
              },
            })
          }
        />
        <div id="td-canonical-word-sum" className="mt-2 text-sm">
          {payload.canonicalMorphology.wordSum}
        </div>
        <label id="td-written-syllables" className="mt-3 block text-sm">
          Written syllable breakdown
          <input
            className={`${input} mt-1`}
            value={payload.writtenSyllableBreakdown ?? ""}
            onChange={(event) =>
              change({ writtenSyllableBreakdown: event.target.value })
            }
          />
        </label>
        <h3 className="mt-4 font-semibold">Transformations</h3>
        {(payload.canonicalMorphology.transformations ?? []).map(
          (item, index) => (
            <div
              key={index}
              className="mt-2 grid gap-2 rounded bg-[var(--paper)] p-2 sm:grid-cols-3"
            >
              <label className="text-xs">
                Transformation
                <select
                  className={input}
                  value={item.type}
                  onChange={(event) =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.map(
                            (old, at) =>
                              at === index
                                ? { ...old, type: event.target.value }
                                : old,
                          ),
                      },
                    })
                  }
                >
                  {[
                    "change_final_y_to_i",
                    "drop_final_e",
                    "remove_letter",
                    "replace_final",
                    "base_spelling_change",
                  ].map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Word part
                <select
                  className={input}
                  value={item.sourcePartId}
                  onChange={(event) => {
                    const part = payload.canonicalMorphology.parts.find(
                      (raw) =>
                        (raw as { id: string }).id === event.target.value,
                    ) as Record<string, unknown> | undefined;
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.map(
                            (old, at) =>
                              at === index
                                ? {
                                    ...old,
                                    sourcePartId: event.target.value,
                                    sourceText: String(part?.sourceText ?? ""),
                                    surfaceText: String(
                                      part?.surfaceText ?? part?.text ?? "",
                                    ),
                                  }
                                : old,
                          ),
                      },
                    });
                  }}
                >
                  <option value="">Select part</option>
                  {payload.canonicalMorphology.parts.map((raw) => {
                    const part = raw as Record<string, unknown>;
                    return (
                      <option key={String(part.id)} value={String(part.id)}>
                        {String(part.sourceText ?? part.text)} →{" "}
                        {String(part.surfaceText ?? part.text)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-xs">
                Explanation
                <input
                  className={input}
                  value={item.explanation}
                  onChange={(event) =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.map(
                            (old, at) =>
                              at === index
                                ? { ...old, explanation: event.target.value }
                                : old,
                          ),
                      },
                    })
                  }
                />
              </label>
              {(
                [
                  ["sourceText", "Starting form"],
                  ["surfaceText", "Resulting form"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="text-xs">
                  {label}
                  <input
                    className={input}
                    value={item[field]}
                    onChange={(event) =>
                      change({
                        canonicalMorphology: {
                          ...payload.canonicalMorphology,
                          transformations:
                            payload.canonicalMorphology.transformations?.map(
                              (old, at) =>
                                at === index
                                  ? { ...old, [field]: event.target.value }
                                  : old,
                            ),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <div className="flex justify-end gap-3 sm:col-span-3">
                {index > 0 && (
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => {
                      const transformations = [
                        ...(payload.canonicalMorphology.transformations ?? []),
                      ];
                      [transformations[index - 1], transformations[index]] = [
                        transformations[index],
                        transformations[index - 1],
                      ];
                      change({
                        canonicalMorphology: {
                          ...payload.canonicalMorphology,
                          transformations,
                        },
                      });
                    }}
                  >
                    Move up
                  </button>
                )}
                <button
                  type="button"
                  className="text-sm text-[color:var(--scarlett)] underline"
                  onClick={() =>
                    change({
                      canonicalMorphology: {
                        ...payload.canonicalMorphology,
                        transformations:
                          payload.canonicalMorphology.transformations?.filter(
                            (_, at) => at !== index,
                          ),
                      },
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ),
        )}
        <div className={actions}>
          <button
            type="button"
            className={button}
            onClick={() =>
              change({
                canonicalMorphology: {
                  ...payload.canonicalMorphology,
                  transformations: [
                    ...(payload.canonicalMorphology.transformations ?? []),
                    {
                      type: "base_spelling_change",
                      sourcePartId: "",
                      sourceText: "",
                      surfaceText: "",
                      explanation: "",
                    },
                  ],
                },
              })
            }
          >
            Add transformation
          </button>
        </div>
        <label className="mt-3 block text-sm">
          Morphology source / review note
          <input
            className={`${input} mt-1`}
            value={payload.canonicalMorphology.reviewNotes}
            onChange={(event) =>
              change({
                canonicalMorphology: {
                  ...payload.canonicalMorphology,
                  reviewNotes: event.target.value,
                },
              })
            }
          />
        </label>
        <div className={actions}>
          <button
            type="button"
            className={button}
            onClick={() => builder.current?.close()}
          >
            Done
          </button>
          {saveButton("overview")}
        </div>
      </dialog>
      <dialog
        ref={splitDialog}
        className="w-[min(900px,95vw)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 text-[color:var(--ink)] backdrop:bg-black/40"
      >
        {splitSkill && (
          <>
            <h2 className="mb-3 text-lg font-semibold">
              {name(splitSkill)} · learner cut
            </h2>
            <PartSequenceEditor
              id={`td-route-${splitSkill}-teachingSplitParts`}
              label="Activity parts and boundary"
              word={payload.displayWord}
              parts={
                routeContent(splitSkill)?.content.teachingSplitParts ??
                payload.canonicalMorphology.parts
              }
              joins={
                routeContent(splitSkill)?.content.teachingSplitJoins ??
                payload.canonicalMorphology.joins
              }
              affixMeanings={props.affixMeanings}
              onChange={(parts, joins) =>
                updateRoute(splitSkill, {
                  teachingSplitParts: parts,
                  teachingSplitJoins: joins,
                })
              }
            />
            <p className="mt-2 text-xs">
              Reviewed true morphology stays in Overview unless this route has
              an explicit reviewed override.
            </p>
            <div className={actions}>
              <button
                type="button"
                className={button}
                onClick={() => splitDialog.current?.close()}
              >
                Done
              </button>
              {saveButton(
                `lesson:${splitSkill}`,
                "Save and approve lesson details",
              )}
            </div>
          </>
        )}
      </dialog>
      <dialog
        ref={family}
        className="w-[min(850px,95vw)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 text-[color:var(--ink)] backdrop:bg-black/40"
      >
        {props.familyReview}
        <div className={actions}>
          <button
            type="button"
            className={button}
            onClick={() => family.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
