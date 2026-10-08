import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

// Refuse Next's automatic environment-file loading, even in an otherwise clean process.
const environmentFiles = [".env", ".env.local", ".env.development", ".env.development.local"];
if (environmentFiles.some((file) => existsSync(file))) {
  throw new Error("Run Review QA in the isolated checkout without .env files. No credentials are needed.");
}
const port = process.argv[2] ?? "3217";
if (!/^\d{4,5}$/.test(port) || Number(port) > 65535) throw new Error("Use a local port between 1000 and 65535.");
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "SystemRoot"].flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port], {
  stdio: "inherit", env: { ...env, NEXT_TELEMETRY_DISABLED: "1", ADLE_REVIEW_R6_QA: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
