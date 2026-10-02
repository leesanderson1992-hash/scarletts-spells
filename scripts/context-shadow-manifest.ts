/** Prints only public configuration fingerprints. No environment or credential readback. */
import { AI_CONTEXT_MODEL, AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT,
  AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION } from '../lib/writing-engine/whole-writing/context-ai-gate';
import { CONTEXT_SHADOW_RUNTIME_FINGERPRINT, CONTEXT_SHADOW_RUNTIME_VERSION,
  CONTEXT_SHADOW_TIMEOUT_MS, CONTEXT_SHADOW_WORKER_BUDGET_MS, CONTEXT_SHADOW_MAX_REQUEST_BYTES } from '../lib/writing-engine/whole-writing/context-shadow-policy';
import { PASSAGE_CONTEXT_MAX_WINDOWS } from '../lib/writing-engine/whole-writing/context-passage-scan';
console.log(JSON.stringify({ model:AI_CONTEXT_MODEL,promptFingerprint:AI_CONTEXT_PROMPT_FINGERPRINT,
  schemaFingerprint:AI_CONTEXT_SCHEMA_FINGERPRINT,configFingerprint:AI_CONTEXT_CONFIG_FINGERPRINT,
  gateVersion:AI_CONTEXT_GATE_VERSION,runtimeVersion:CONTEXT_SHADOW_RUNTIME_VERSION,
  runtimeFingerprint:CONTEXT_SHADOW_RUNTIME_FINGERPRINT,timeoutMs:CONTEXT_SHADOW_TIMEOUT_MS,workerBudgetMs:CONTEXT_SHADOW_WORKER_BUDGET_MS,retries:0,
  passageMaxWindows:PASSAGE_CONTEXT_MAX_WINDOWS,maxRequestBytes:CONTEXT_SHADOW_MAX_REQUEST_BYTES,
  executionPolicies:['MEASURED','DISPOSABLE_BOOTSTRAP','ADULT_RELEASE'],defaultExecutionPolicy:'MEASURED',
  bootstrap:'DISPOSABLE_BOOTSTRAP_FAIL_STOP_V1',faults:'REGISTERED_ONE_SHOT_PROOF_FAULTS_V1',
  proofPassage:'REGISTERED_PROOF_POLICY_PASSAGE_V1',
  defaultControl:{enabled:false,ai_mode:'disabled'} },null,2));
