import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsx", "scripts/adle-shared-affix-compiler-regression.ts"], {
  cwd: process.cwd(),
  env: {
    NODE_ENV: "test",
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    npm_config_cache: process.env.npm_config_cache,
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Shared affix all-profile/all-target parity regression failed");
console.log("Shared affix all-profile/all-target production parity regression passed.");
