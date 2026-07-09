import { resolveAdlePlanDateOverride } from "../lib/adle/session-date-override";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ADLE date override regression failed: ${message}`);
  }
}

assert(
  resolveAdlePlanDateOverride({
    requestedDate: undefined,
    fallbackDate: "2026-07-09",
    isAdmin: false,
  }) === "2026-07-09",
  "absent override falls back to today",
);

assert(
  resolveAdlePlanDateOverride({
    requestedDate: "2026-07-10",
    fallbackDate: "2026-07-09",
    isAdmin: true,
  }) === "2026-07-10",
  "admin can use strict date override",
);

assert(
  resolveAdlePlanDateOverride({
    requestedDate: "2026-7-10",
    fallbackDate: "2026-07-09",
    isAdmin: true,
  }) === null,
  "malformed date override fails closed",
);

assert(
  resolveAdlePlanDateOverride({
    requestedDate: "2026-07-10",
    fallbackDate: "2026-07-09",
    isAdmin: false,
  }) === null,
  "non-admin date override fails closed",
);

console.log("ADLE date override regression passed.");
