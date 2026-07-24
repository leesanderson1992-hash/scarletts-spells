#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [inputPath, outputPath, previewDir] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node build-next-teaching-dictionary-review-workbook.mjs <workbook-data.json> <output.xlsx>");
}

const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
const workbook = Workbook.create();
const headerFill = "#243B53";
const headerText = "#FFFFFF";
const accentFill = "#E8F1F8";
const warningFill = "#FFF4CC";
const borderColor = "#CBD5E1";

for (const [sheetName, matrix] of Object.entries(data)) {
  const sheet = workbook.worksheets.add(sheetName.slice(0, 31));
  sheet.showGridLines = false;
  if (!Array.isArray(matrix) || matrix.length === 0) continue;
  const width = Math.max(...matrix.map((row) => row.length));
  const normalized = matrix.map((row) => [...row, ...Array(width - row.length).fill(null)]);
  const range = sheet.getRangeByIndexes(0, 0, normalized.length, width);
  range.values = normalized;
  range.format.font = { name: "Aptos", size: 10, color: "#102A43" };
  range.format.verticalAlignment = "top";

  const header = sheet.getRangeByIndexes(0, 0, 1, width);
  header.format.fill = headerFill;
  header.format.font = { name: "Aptos Display", size: 10, bold: true, color: headerText };
  header.format.wrapText = true;
  header.format.rowHeight = 36;
  header.format.borders = { preset: "outside", style: "thin", color: borderColor };
  sheet.freezePanes.freezeRows(1);

  if (sheetName === "Summary") {
    sheet.getRange(`A1:B${normalized.length}`).format.borders = {
      insideHorizontal: { style: "thin", color: borderColor },
      bottom: { style: "thin", color: borderColor },
    };
    sheet.getRange(`A2:A${normalized.length}`).format.fill = accentFill;
    sheet.getRange(`A2:A${normalized.length}`).format.font = { bold: true, color: "#102A43" };
    sheet.getRange(`A2:A${normalized.length}`).format.columnWidth = 42;
    sheet.getRange(`B2:B${normalized.length}`).format.columnWidth = 24;
    const statusCell = sheet.getRange(`B${normalized.length}`);
    statusCell.format.fill = warningFill;
    statusCell.format.font = { bold: true, color: "#8A4B08" };
  } else {
    sheet.getRangeByIndexes(0, 0, normalized.length, width).format.borders = {
      insideHorizontal: { style: "thin", color: "#E2E8F0" },
      bottom: { style: "thin", color: borderColor },
    };
    sheet.freezePanes.freezeColumns(sheetName === "Selection register" ? 3 : 1);
    range.format.autofitColumns();
    for (let col = 0; col < width; col += 1) {
      const column = sheet.getRangeByIndexes(0, col, normalized.length, 1);
      const headerValue = String(normalized[0][col] ?? "");
      if (/notes|source|segmentation|micro_skill|cmudict|ipa|sentence|audio_text/i.test(headerValue)) {
        column.format.columnWidth = Math.min(38, Math.max(18, column.format.columnWidth ?? 18));
        column.format.wrapText = true;
      } else {
        column.format.columnWidth = Math.min(22, Math.max(11, column.format.columnWidth ?? 11));
      }
    }

    const headers = normalized[0].map(String);
    for (const field of headers.filter((field) => field.endsWith("_review") || field === "final_decision" || field === "review_status")) {
      const index = headers.indexOf(field);
      if (index < 0 || normalized.length < 2) continue;
      const editable = sheet.getRangeByIndexes(1, index, normalized.length - 1, 1);
      editable.dataValidation = { rule: { type: "list", values: ["in_review", "approved", "changes_requested", "rejected"] } };
      editable.format.fill = warningFill;
      editable.conditionalFormats.add("containsText", { text: "approved", format: { fill: "#DCFCE7", font: { color: "#166534" } } });
      editable.conditionalFormats.add("containsText", { text: "rejected", format: { fill: "#FEE2E2", font: { color: "#991B1B" } } });
    }
  }
}

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const selectionCheck = await workbook.inspect({
  kind: "table",
  range: "Selection register!A1:H8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 8,
});
const errorCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
});
const previews = [];
if (previewDir) {
  await fs.mkdir(previewDir, { recursive: true });
  for (const sheetName of Object.keys(data)) {
    const matrix = data[sheetName];
    const previewRows = Math.min(matrix.length, sheetName === "Selection register" ? 25 : 40);
    const previewCols = Math.min(Math.max(...matrix.map((row) => row.length)), sheetName === "Selection register" ? 12 : 20);
    const endColumn = (() => {
      let value = previewCols;
      let label = "";
      while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
      }
      return label;
    })();
    const preview = await workbook.render({ sheetName: sheetName.slice(0, 31), range: `A1:${endColumn}${previewRows}`, scale: 1, format: "png" });
    const previewPath = path.join(previewDir, `${sheetName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
    await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
    previews.push(previewPath);
  }
}
console.log(JSON.stringify({ outputPath, previews, selectionCheck: selectionCheck.ndjson, errorCheck: errorCheck.ndjson }));
