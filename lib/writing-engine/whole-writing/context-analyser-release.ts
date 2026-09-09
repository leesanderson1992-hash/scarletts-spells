import { analyseDeterministicContext, CONTEXT_FAMILY_MANIFESTS, WHOLE_WRITING_CONTEXT_ANALYSER_VERSION, WHOLE_WRITING_CONTEXT_REGISTRY_VERSION, WHOLE_WRITING_CONTEXT_CORPUS_VERSION } from "./context";
import { analyseYourContextV2, YOUR_V2_MANIFEST, YOUR_V2_MANIFEST_FINGERPRINT } from "./context-your-v2";
import { analyseToContextV2, TO_V2_MANIFEST, TO_V2_MANIFEST_FINGERPRINT } from "./context-to-v2";

export const CONTEXT_YOUR_TO_CANDIDATES_V2 = [
  { manifest: YOUR_V2_MANIFEST, fingerprint: YOUR_V2_MANIFEST_FINGERPRINT, analyse: analyseYourContextV2 },
  { manifest: TO_V2_MANIFEST, fingerprint: TO_V2_MANIFEST_FINGERPRINT, analyse: analyseToContextV2 },
] as const;

/** Exact persisted dependencies choose execution. No selection/publication occurs here. */
export function contextAnalyserForRelease(release: {
  id: string; release_key: string; family_key: string; analyser_version: string; registry_version: string;
  corpus_version: string; manifest_fingerprint: string;
}) {
  for (const candidate of CONTEXT_YOUR_TO_CANDIDATES_V2) {
    const m = candidate.manifest;
    if (release.id === m.releaseId && release.release_key === m.releaseKey && release.family_key === m.familyKey &&
      release.analyser_version === m.analyserVersion && release.registry_version === m.registryVersion &&
      release.corpus_version === m.corpusVersion && release.manifest_fingerprint === candidate.fingerprint) {
      return { manifest: { ...m, fingerprint: candidate.fingerprint }, analyse: candidate.analyse };
    }
  }
  const manifest = CONTEXT_FAMILY_MANIFESTS.find((m) => m.familyKey === release.family_key);
  const index = CONTEXT_FAMILY_MANIFESTS.findIndex((m) => m.familyKey === release.family_key);
  if (!manifest || release.release_key !== `s8-v1-${manifest.familyKey.toLowerCase().replaceAll("_", "-")}` || release.id !== `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` ||
    release.analyser_version !== WHOLE_WRITING_CONTEXT_ANALYSER_VERSION || release.registry_version !== WHOLE_WRITING_CONTEXT_REGISTRY_VERSION ||
    release.corpus_version !== WHOLE_WRITING_CONTEXT_CORPUS_VERSION || release.manifest_fingerprint !== manifest.fingerprint) return null;
  return { manifest, analyse: analyseDeterministicContext };
}
