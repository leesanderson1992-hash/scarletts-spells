#!/usr/bin/env node

export const RETIRED_OPERATIONAL_ENTRYPOINT =
  "Phase E7B retired this historical route-metadata staging harness because it requires removed legacy persistence RPCs.";

throw new Error(RETIRED_OPERATIONAL_ENTRYPOINT);
