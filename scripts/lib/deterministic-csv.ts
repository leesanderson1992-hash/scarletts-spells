export type CsvTable = Readonly<{
  headers: string[];
  rows: Array<Record<string, string>>;
}>;

function encodeCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function serialiseCsv(headers: readonly string[], rows: readonly Record<string, string>[]): string {
  const lines = [
    headers.map(encodeCell).join(","),
    ...rows.map((row) => headers.map((header) => encodeCell(row[header] ?? "")).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function parseCsv(input: string): CsvTable {
  const source = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      if (cell.length) throw new Error(`Unexpected quote at CSV offset ${index}`);
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  if (cell.length || row.length) {
    row.push(cell);
    table.push(row);
  }
  while (table.length && table.at(-1)?.every((value) => value === "")) table.pop();
  const headers = table.shift() ?? [];
  if (!headers.length || headers.some((header) => !header)) throw new Error("CSV header is missing or blank");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique");
  const rows = table.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} cells; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex]]));
  });
  return { headers, rows };
}
