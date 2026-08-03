export interface SelectedPrefixTeachingFact {
  label: string;
  meaning: string;
  rules: readonly string[];
}

export function selectedPrefixFeedbackText(fact: SelectedPrefixTeachingFact): string {
  if (!fact.label.trim() || !fact.meaning.trim() || !fact.rules.length || fact.rules.some((rule) => !rule.trim())) {
    throw new Error("Selected Prefix feedback requires a reviewed label, meaning, and rule.");
  }
  return [
    `${fact.label} means “${fact.meaning}”.`,
    fact.rules.length === 1 ? "Rule:" : "Rules:",
    ...fact.rules,
    "Try again.",
  ].join("\n");
}
