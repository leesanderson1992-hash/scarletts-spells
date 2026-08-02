const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function resolveAdlePlanDateOverride(params: {
  requestedDate: string | undefined;
  fallbackDate: string;
  isAdmin: boolean;
  isStagingQa?: boolean;
}): string | null {
  const requested = params.requestedDate?.trim();
  if (!requested) {
    return params.fallbackDate;
  }
  if (!ISO_DATE_ONLY.test(requested)) {
    return null;
  }
  if (!params.isAdmin && !params.isStagingQa) {
    return null;
  }
  return requested;
}
