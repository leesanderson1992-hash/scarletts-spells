export type BulkResolutionAction = "confirm" | "noSkill" | "activate";

export type BulkEligibleRow = {
  status: string;
  resolverEnabled: boolean;
  mappingId: string | null;
  mappingStatus: string | null;
  visibilityStatus: string | null;
  skillReady: boolean;
};

export function isBulkResolutionEligible(action: BulkResolutionAction, row: BulkEligibleRow) {
  if (action === "confirm") return row.status === "pending" && row.skillReady;
  if (action === "noSkill") return row.status === "pending" && !row.resolverEnabled &&
    (!row.mappingId || row.mappingStatus === "disabled" && row.visibilityStatus === "disabled");
  return row.status === "confirmed" && Boolean(row.mappingId) && row.mappingStatus === "active" &&
    !row.resolverEnabled;
}
