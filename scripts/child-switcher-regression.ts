import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { replaceChildInScopedPath } from "../lib/children";

assert.equal(
  replaceChildInScopedPath("/dashboard?child=old-child", "new-child"),
  "/dashboard?child=new-child",
  "the selected child replaces the stale child in the redirect URL",
);

assert.equal(
  replaceChildInScopedPath(
    "/learn/week?child=old-child&mode=child#today",
    "new child",
  ),
  "/learn/week?child=new+child&mode=child#today",
  "other scope parameters and fragments survive the child switch",
);

assert.equal(
  replaceChildInScopedPath("/insights", "new-child"),
  "/insights?child=new-child",
  "an unscoped redirect becomes scoped to the selected child",
);

const childActionsSource = readFileSync(
  new URL("../app/children/actions.ts", import.meta.url),
  "utf8",
);

assert.match(
  childActionsSource,
  /redirect\(replaceChildInScopedPath\(redirectPath, child\.id\)\)/,
  "the switch action must redirect with the newly selected child",
);

console.log("Child switcher redirect regression passed.");
