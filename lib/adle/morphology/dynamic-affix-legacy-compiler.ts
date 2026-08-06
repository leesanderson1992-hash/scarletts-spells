import {
  compileDynamicAffixWordLabPayload,
} from "./affix-word-lab";

/**
 * Explicitly retained Dynamic Affix V3 rollback/parity oracle.
 *
 * The implementation deliberately remains owned by affix-word-lab.ts so the
 * historical compiler and selector cannot diverge through a copied fork.
 */
export const compileDynamicAffixWordLabPayloadLegacy =
  compileDynamicAffixWordLabPayload;
