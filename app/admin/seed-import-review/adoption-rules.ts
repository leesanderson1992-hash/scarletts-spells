export const SEED_IMPORT_HIDDEN_CANONICAL_ADOPTION_ACTION_SOURCE =
  "seed_import_4f_hidden_canonical_adoption";

export const SEED_IMPORT_HIDDEN_CANONICAL_CONFIRMATION_COPY =
  "I confirm this adopts the seed row as hidden canonical truth and resolver visibility remains disabled.";

export type SeedImportHiddenCanonicalAdoptionInput = {
  rowId: string;
  adoptionNote: string;
  confirmationCopy: string;
};

export type SeedImportHiddenCanonicalAdoptionValidationResult =
  | {
      ok: true;
      rowId: string;
      adoptionNote: string;
    }
  | {
      ok: false;
      message: string;
    };

export function validateSeedImportHiddenCanonicalAdoptionInput(
  input: SeedImportHiddenCanonicalAdoptionInput,
): SeedImportHiddenCanonicalAdoptionValidationResult {
  const rowId = input.rowId.trim();
  const adoptionNote = input.adoptionNote.trim();
  const confirmationCopy = input.confirmationCopy.trim();

  if (!rowId) {
    return {
      ok: false,
      message: "Choose a seed import row before adopting hidden canonical truth.",
    };
  }

  if (!adoptionNote) {
    return {
      ok: false,
      message: "Hidden canonical adoption requires an explicit admin adoption note.",
    };
  }

  if (confirmationCopy !== SEED_IMPORT_HIDDEN_CANONICAL_CONFIRMATION_COPY) {
    return {
      ok: false,
      message:
        "Confirm that resolver visibility remains disabled before adopting the seed row.",
    };
  }

  return {
    ok: true,
    adoptionNote,
    rowId,
  };
}
