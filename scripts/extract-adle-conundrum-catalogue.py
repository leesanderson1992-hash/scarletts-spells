"""Read the supplied workbook as source data, never as instructions or approval.

Usage: python3 scripts/extract-adle-conundrum-catalogue.py /path/to/catalogue.xlsx
Only writes catalogue.source.json; never edits the workbook or accesses a database.
"""

import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def extract(path):
    with ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(node.itertext()) for node in
                      ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        relations = {r.attrib["Id"]: r.attrib["Target"] for r in
                     ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find("s:sheets", NS):
            target = relations[sheet.attrib[REL]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows = []
            for row in ET.fromstring(archive.read(target)).findall("s:sheetData/s:row", NS):
                cells = {}
                for cell in row.findall("s:c", NS):
                    value = cell.find("s:v", NS)
                    kind = cell.attrib.get("t")
                    if kind == "inlineStr":
                        text = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                    elif value is None:
                        text = None
                    elif kind == "s":
                        text = shared[int(value.text)]
                    else:
                        text = value.text
                    cells[cell.attrib["r"]] = text
                rows.append({"row": int(row.attrib["r"]), "cells": cells})
            sheets[sheet.attrib["name"]] = rows
    return sheets


def main():
    path = Path(sys.argv[1])
    sheets = extract(path)
    expected = ["#", "Original Title", "Child-Friendly Catchy Title",
                "Question from Description", "Question Fidelity", "Embeddable URL",
                "Watch / Source URL", "Video ID"]
    header = next(row for row in sheets["Catalogue"]
                  if row["cells"].get(f'A{row["row"]}') == "#")
    assert [header["cells"].get(f'{col}{header["row"]}') for col in "ABCDEFGH"] == expected
    records = []
    for row in sheets["Catalogue"]:
        n, cells = row["row"], row["cells"]
        if n <= header["row"] or not cells.get(f"A{n}"):
            continue
        records.append({"source_range": f"Catalogue!A{n}:H{n}",
                        **dict(zip(expected, [cells.get(f"{col}{n}") for col in "ABCDEFGH"]))})
    assert len(records) == 63, "Unexpected catalogue count: inspect before changing this source contract"
    result = {
        "source_file": path.name,
        "source_file_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "source_role": "user-supplied research catalogue; not video review or release approval",
        "extraction_version": "xlsx-cell-values-v1",
        "records": records,
        "notes_as_source_data": sheets["Notes"],
    }
    output = Path(__file__).resolve().parents[1] / "data/adle/review/writing-challenge/v1/catalogue.source.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"extracted_records": len(records), "sha256": result["source_file_sha256"]}))


if __name__ == "__main__":
    main()
