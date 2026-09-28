/** Prints only public configuration fingerprints. No environment or credential readback. */
import { AI_CONTEXT_MODEL, AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT,
  AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION } from '../lib/writing-engine/whole-writing/context-ai-gate';
import { CONTEXT_SHADOW_RUNTIME_FINGERPRINT, CONTEXT_SHADOW_RUNTIME_VERSION } from '../lib/writing-engine/whole-writing/context-shadow-policy';
console.log(JSON.stringify({ model:AI_CONTEXT_MODEL,promptFingerprint:AI_CONTEXT_PROMPT_FINGERPRINT,
  schemaFingerprint:AI_CONTEXT_SCHEMA_FINGERPRINT,configFingerprint:AI_CONTEXT_CONFIG_FINGERPRINT,
  gateVersion:AI_CONTEXT_GATE_VERSION,runtimeVersion:CONTEXT_SHADOW_RUNTIME_VERSION,
  runtimeFingerprint:CONTEXT_SHADOW_RUNTIME_FINGERPRINT,timeoutMs:8000,retries:0,
  defaultControl:{enabled:false,ai_mode:'disabled'} },null,2));
