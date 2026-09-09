import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
  WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
} from "./context";
import { analyseItsContextV2, ITS_V2_MANIFEST, ITS_V2_MANIFEST_FINGERPRINT } from "./context-its-v2";

/** Resolve only exact persisted release dependencies; never upgrade V1 implicitly. */
export function contextAnalyserForRelease(release: {
  id: string;
  release_key: string;
  family_key: string;
  analyser_version: string;
  registry_version: string;
  corpus_version: string;
  manifest_fingerprint: string;
}) {
  if (
    release.id === ITS_V2_MANIFEST.releaseId &&
    release.release_key === ITS_V2_MANIFEST.releaseKey &&
    release.family_key === ITS_V2_MANIFEST.familyKey &&
    release.analyser_version === ITS_V2_MANIFEST.analyserVersion &&
    release.registry_version === ITS_V2_MANIFEST.registryVersion &&
    release.corpus_version === ITS_V2_MANIFEST.corpusVersion &&
    release.manifest_fingerprint === ITS_V2_MANIFEST_FINGERPRINT
  ) {
    return {
      manifest: { ...ITS_V2_MANIFEST, fingerprint: ITS_V2_MANIFEST_FINGERPRINT },
      analyse: analyseItsContextV2,
    };
  }

  const manifest = CONTEXT_FAMILY_MANIFESTS.find((candidate) => candidate.familyKey === release.family_key);
  const index = CONTEXT_FAMILY_MANIFESTS.findIndex((candidate) => candidate.familyKey === release.family_key);
  const releaseKey = manifest ? `s8-v1-${manifest.familyKey.toLowerCase().replaceAll("_", "-")}` : null;
  const releaseId = index >= 0 ? `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` : null;
  if (
    !manifest || release.release_key !== releaseKey || release.id !== releaseId ||
    release.analyser_version !== WHOLE_WRITING_CONTEXT_ANALYSER_VERSION ||
    release.registry_version !== WHOLE_WRITING_CONTEXT_REGISTRY_VERSION ||
    release.corpus_version !== WHOLE_WRITING_CONTEXT_CORPUS_VERSION ||
    release.manifest_fingerprint !== manifest.fingerprint
  ) return null;
  return { manifest, analyse: analyseDeterministicContext };
}
