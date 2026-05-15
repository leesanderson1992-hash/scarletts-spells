import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../../..");
export const authStateDir = path.resolve(repoRoot, ".playwright/.auth");
export const authStatePath = path.resolve(authStateDir, "e2e-parent.json");
