import type { AdleRouteActivationEnvironment } from './route-activation-environment';

/** Deployment-time opt-in. Preparing a release never changes a live pool. */
export function canonicalBaseWordWorkflowEnabled(environment: AdleRouteActivationEnvironment | null): boolean {
  return (environment === 'staging' || environment === 'production') &&
    process.env.ADLE_BASE_WORD_DICTIONARY_ONLY === 'enabled';
}
