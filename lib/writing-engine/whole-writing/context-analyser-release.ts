import { analyseDeterministicContext, CONTEXT_FAMILY_MANIFESTS, WHOLE_WRITING_CONTEXT_ANALYSER_VERSION, WHOLE_WRITING_CONTEXT_REGISTRY_VERSION, WHOLE_WRITING_CONTEXT_CORPUS_VERSION } from "./context";
import { analyseItsContextV2, ITS_V2_MANIFEST, ITS_V2_MANIFEST_FINGERPRINT } from "./context-its-v2";
import { analyseThereContextV2, THERE_V2_MANIFEST, THERE_V2_MANIFEST_FINGERPRINT } from "./context-there-v2";
import { analyseYourContextV2, YOUR_V2_MANIFEST, YOUR_V2_MANIFEST_FINGERPRINT } from "./context-your-v2";
import { analyseToContextV2, TO_V2_MANIFEST, TO_V2_MANIFEST_FINGERPRINT } from "./context-to-v2";
import { analyseItsContextV3, ITS_V3_MANIFEST, ITS_V3_MANIFEST_FINGERPRINT } from "./context-its-v3";
import { analyseThereContextV3, THERE_V3_MANIFEST, THERE_V3_MANIFEST_FINGERPRINT } from "./context-there-v3";
import { analyseToContextV3, TO_V3_MANIFEST, TO_V3_MANIFEST_FINGERPRINT } from "./context-to-v3";
import { analyseYourContextV3, YOUR_V3_MANIFEST, YOUR_V3_MANIFEST_FINGERPRINT } from "./context-your-v3";

export const CONTEXT_YOUR_TO_CANDIDATES_V2 = [
  { manifest: YOUR_V2_MANIFEST, fingerprint: YOUR_V2_MANIFEST_FINGERPRINT, analyse: analyseYourContextV2 },
  { manifest: TO_V2_MANIFEST, fingerprint: TO_V2_MANIFEST_FINGERPRINT, analyse: analyseToContextV2 },
] as const;
export const CONTEXT_V2_CANDIDATES = [
  { manifest: THERE_V2_MANIFEST, fingerprint: THERE_V2_MANIFEST_FINGERPRINT, analyse: analyseThereContextV2 },
  ...CONTEXT_YOUR_TO_CANDIDATES_V2,
  { manifest: ITS_V2_MANIFEST, fingerprint: ITS_V2_MANIFEST_FINGERPRINT, analyse: analyseItsContextV2 },
] as const;
export const CONTEXT_V3_CANDIDATES = [
  { manifest: THERE_V3_MANIFEST, fingerprint: THERE_V3_MANIFEST_FINGERPRINT, analyse: analyseThereContextV3 },
  { manifest: YOUR_V3_MANIFEST, fingerprint: YOUR_V3_MANIFEST_FINGERPRINT, analyse: analyseYourContextV3 },
  { manifest: TO_V3_MANIFEST, fingerprint: TO_V3_MANIFEST_FINGERPRINT, analyse: analyseToContextV3 },
  { manifest: ITS_V3_MANIFEST, fingerprint: ITS_V3_MANIFEST_FINGERPRINT, analyse: analyseItsContextV3 },
] as const;

/** Exact persisted dependencies choose execution. No selection/publication occurs here. */
export function contextAnalyserForRelease(release: {
  id: string; release_key: string; family_key: string; analyser_version: string; registry_version: string;
  corpus_version: string; manifest_fingerprint: string;
}) {
  for (const candidate of CONTEXT_V3_CANDIDATES) {
    const m = candidate.manifest;
    if (release.id === m.releaseId && release.release_key === m.releaseKey && release.family_key === m.familyKey &&
      release.analyser_version === m.analyserVersion && release.registry_version === m.registryVersion &&
      release.corpus_version === m.corpusVersion && release.manifest_fingerprint === candidate.fingerprint) {
      return { manifest: { ...m, fingerprint: candidate.fingerprint }, analyse: candidate.analyse };
    }
  }
  for (const candidate of CONTEXT_V2_CANDIDATES) {
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
