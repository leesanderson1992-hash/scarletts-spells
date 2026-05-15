import fs from "node:fs";
import path from "node:path";

function parseLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function parseEnvFile(contents) {
  const parsed = {};

  for (const line of contents.split(/\r?\n/u)) {
    const entry = parseLine(line);

    if (!entry) {
      continue;
    }

    const [key, value] = entry;
    parsed[key] = value;
  }

  return parsed;
}

export function loadE2EEnvFiles(repoRoot) {
  const candidates = [
    ".env.local",
    ".env.test.local",
    "tests/e2e/.env.e2e",
    "tests/e2e/.env.e2e.local",
  ];
  const loadedFiles = [];

  for (const relativePath of candidates) {
    const absolutePath = path.join(repoRoot, relativePath);

    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const entries = parseEnvFile(fs.readFileSync(absolutePath, "utf8"));

    for (const [key, value] of Object.entries(entries)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    loadedFiles.push(relativePath);
  }

  return loadedFiles;
}
