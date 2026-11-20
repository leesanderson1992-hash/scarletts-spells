import {fingerprintSnapshotValue} from "@/lib/adle/composable-lesson/canonical-fingerprint";
import type {DictionarySense, DictionaryPronunciation} from "./senses";

export function homophoneBindingIsCurrent(sense: DictionarySense | undefined, pronunciation: DictionaryPronunciation | null,
  binding: {sense_id: string; sense_snapshot: unknown; pronunciation_snapshot: unknown}) {
  return Boolean(sense && binding.sense_snapshot !== undefined && binding.sense_id === sense.id
    && fingerprintSnapshotValue(binding.sense_snapshot) === fingerprintSnapshotValue(sense)
    && fingerprintSnapshotValue(binding.pronunciation_snapshot ?? null) === fingerprintSnapshotValue(pronunciation));
}

export function homophoneReadyNote(partnersNeedingReview: readonly string[]) {
  return partnersNeedingReview.length
    ? `Ready — waiting for ${partnersNeedingReview.join(" and ")} to be reviewed before this pair can be published. This word’s approved facts do not need re-entering.`
    : "Ready to publish. Use Publish lesson update to make this pair Active with the approved Dictionary facts.";
}
