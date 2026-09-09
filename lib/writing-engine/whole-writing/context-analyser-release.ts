import {
  analyseDeterministicContext, CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION, WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
} from "./context";
import { analyseThereContextV2, THERE_V2_MANIFEST, THERE_V2_MANIFEST_FINGERPRINT } from "./context-there-v2";

/** Resolve the explicitly selected persisted release; never upgrade V1 implicitly. */
export function contextAnalyserForRelease(release: {
  id: string; family_key: string; analyser_version: string; registry_version: string;
  corpus_version: string; manifest_fingerprint: string;
}) {
  if (release.id === THERE_V2_MANIFEST.releaseId &&
    release.family_key === THERE_V2_MANIFEST.familyKey &&
    release.analyser_version === THERE_V2_MANIFEST.analyserVersion &&
    release.registry_version === THERE_V2_MANIFEST.registryVersion &&
    release.corpus_version === THERE_V2_MANIFEST.corpusVersion &&
    release.manifest_fingerprint === THERE_V2_MANIFEST_FINGERPRINT) {
    return {
      manifest: { ...THERE_V2_MANIFEST, fingerprint: THERE_V2_MANIFEST_FINGERPRINT },
      analyse: analyseThereContextV2,
    };
  }
  const manifest = CONTEXT_FAMILY_MANIFESTS.find((m) => m.familyKey === release.family_key);
  if (!manifest || release.analyser_version !== WHOLE_WRITING_CONTEXT_ANALYSER_VERSION ||
    release.registry_version !== WHOLE_WRITING_CONTEXT_REGISTRY_VERSION ||
    release.corpus_version !== WHOLE_WRITING_CONTEXT_CORPUS_VERSION ||
    release.manifest_fingerprint !== manifest.fingerprint) return null;
  return { manifest, analyse: analyseDeterministicContext };
}
