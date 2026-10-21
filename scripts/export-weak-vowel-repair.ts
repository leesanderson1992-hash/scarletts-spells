import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { renderWeakVowelRepairCsv } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { loadWeakVowelRepairInventory, repairDatabaseConnection } from "./weak-vowel-repair-source";

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && !["--output", "--environment"].includes(arg))) throw new Error("Supply values for --output and --environment only; this exporter has no apply mode.");
  const environment = value("--environment") ?? "production";
  if (!["local", "staging", "production"].includes(environment)) throw new Error("Invalid environment.");
  const output = resolve(value("--output") ?? "outputs/secret-life-of-vowels");
  const names = ["secret-life-of-vowels-repair.csv", "secret-life-of-vowels-repair.baseline.json", "secret-life-of-vowels-repair.manifest.json"];
  for (const name of names) {
    const exists = await access(resolve(output, name)).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return false;
    });
    if (exists) throw new Error("REPAIR_EXPORT_ALREADY_EXISTS: choose a new --output directory to preserve the original baseline and any human review.");
  }
  const inventory = await loadWeakVowelRepairInventory(repairDatabaseConnection(), environment as "local" | "staging" | "production");
  const csv = renderWeakVowelRepairCsv(inventory.rows);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, names[0]), csv, { flag: "wx" });
  await writeFile(resolve(output, names[1]), JSON.stringify({ ...inventory.manifest, rows: inventory.rows }, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(output, names[2]), JSON.stringify({ ...inventory.manifest, csvSha256: createHash("sha256").update(csv).digest("hex") }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, ...inventory.manifest }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Weak-vowel export failed."); process.exitCode = 1; });
