import { analyseThereContextV4, analyseThereContextsV4Detailed, THERE_V4_MANIFEST, THERE_V4_MANIFEST_FINGERPRINT } from "./context-there-v4";
import { analyseToContextV4, analyseToContextsV4Detailed, TO_V4_MANIFEST, TO_V4_MANIFEST_FINGERPRINT } from "./context-to-v4";
import { analyseYourContextV4, analyseYourContextsV4Detailed, YOUR_V4_MANIFEST, YOUR_V4_MANIFEST_FINGERPRINT } from "./context-your-v4";
import { analyseItsContextV4, analyseItsContextsV4Detailed, ITS_V4_MANIFEST, ITS_V4_MANIFEST_FINGERPRINT } from "./context-its-v4";

/**
 * Development candidates are intentionally isolated from contextAnalyserForRelease.
 * Importing this registry cannot publish, select, approve, or activate a release.
 */
export const CONTEXT_V4_DEVELOPMENT_CANDIDATES = [
  { manifest: THERE_V4_MANIFEST, fingerprint: THERE_V4_MANIFEST_FINGERPRINT, analyse: analyseThereContextV4, analyseBatch: analyseThereContextsV4Detailed },
  { manifest: TO_V4_MANIFEST, fingerprint: TO_V4_MANIFEST_FINGERPRINT, analyse: analyseToContextV4, analyseBatch: analyseToContextsV4Detailed },
  { manifest: YOUR_V4_MANIFEST, fingerprint: YOUR_V4_MANIFEST_FINGERPRINT, analyse: analyseYourContextV4, analyseBatch: analyseYourContextsV4Detailed },
  { manifest: ITS_V4_MANIFEST, fingerprint: ITS_V4_MANIFEST_FINGERPRINT, analyse: analyseItsContextV4, analyseBatch: analyseItsContextsV4Detailed },
] as const;
