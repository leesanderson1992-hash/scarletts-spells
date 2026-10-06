export const SEED_IMPORT_HIDDEN_CANONICAL_ADOPTION_ACTION_SOURCE =
  "seed_import_4f_hidden_canonical_adoption";

export const SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE =
  "Adopted from the seed import review queue for hidden canonical review. Resolver visibility remains disabled.";

export type SeedImportHiddenCanonicalAdoptionInput = {
  rowId: string;
};

export type SeedImportHiddenCanonicalAdoptionValidationResult =
  | {
      ok: true;
      rowId: string;
    }
  | {
      ok: false;
      message: string;
    };

export function validateSeedImportHiddenCanonicalAdoptionInput(
  input: SeedImportHiddenCanonicalAdoptionInput,
): SeedImportHiddenCanonicalAdoptionValidationResult {
  const rowId = input.rowId.trim();

  if (!rowId) {
    return {
      ok: false,
      message: "Choose a seed import row before adopting for canonical review.",
    };
  }

  return {
    ok: true,
    rowId,
  };
}
