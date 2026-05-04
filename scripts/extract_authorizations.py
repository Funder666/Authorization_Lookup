#!/usr/bin/env python3

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

DEFAULT_INPUT = "authorization.xlsx"
DEFAULT_OUTPUT = "data/authorizations.json"


def column_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref or "")
    if not match:
        return 0
    value = 0
    for char in match.group(1):
        value = value * 26 + (ord(char) - 64)
    return value


def clean_text(value):
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def read_shared_strings(archive: zipfile.ZipFile):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    shared = []
    for item in root.findall("a:si", NS):
        parts = [node.text or "" for node in item.iterfind(".//a:t", NS)]
        shared.append("".join(parts))
    return shared


def cell_value(cell, shared_strings):
    inline_string = cell.find("a:is", NS)
    if inline_string is not None:
        return "".join(node.text or "" for node in inline_string.iterfind(".//a:t", NS))

    raw = cell.findtext("a:v", default="", namespaces=NS)
    if cell.attrib.get("t") == "s" and raw != "":
        return shared_strings[int(raw)]
    return raw


def parse_rows(sheet_root, shared_strings):
    rows = []
    sheet_data = sheet_root.find("a:sheetData", NS)
    if sheet_data is None:
        return rows

    for row in sheet_data.findall("a:row", NS):
        values = {}
        for cell in row.findall("a:c", NS):
            values[column_index(cell.attrib.get("r", ""))] = clean_text(cell_value(cell, shared_strings))
        if values:
            rows.append((int(row.attrib.get("r", "0")), values))
    return rows


def find_header_row(parsed_rows):
    for row_number, values in parsed_rows:
        row_values = list(values.values())
        if "姓名" in row_values and "工号" in row_values:
            return row_number, values
    return None, None


def build_headers(header_values):
    headers = {}
    for index, title in header_values.items():
        normalized = clean_text(title)
        if normalized:
            headers[index] = normalized
    return headers


def inherit_row(previous_record, current_record):
    if not previous_record:
        return current_record

    if current_record.get("姓名") or current_record.get("工号"):
        return current_record

    merged = dict(current_record)
    for key, value in previous_record.items():
        if not merged.get(key):
            merged[key] = value
    return merged


def parse_workbook(input_path: Path):
    with zipfile.ZipFile(input_path) as archive:
        shared_strings = read_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in relationships
            if rel.attrib.get("Type", "").endswith("/worksheet")
        }

        records = []
        people = defaultdict(set)

        for sheet in workbook.find("a:sheets", NS):
            sheet_name = sheet.attrib["name"]
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = "xl/" + rel_map[rel_id]
            sheet_root = ET.fromstring(archive.read(target))
            parsed_rows = parse_rows(sheet_root, shared_strings)
            header_row_number, header_values = find_header_row(parsed_rows)
            if not header_values:
                continue

            headers = build_headers(header_values)
            previous = None

            for row_number, values in parsed_rows:
                if row_number <= header_row_number:
                    continue

                record = {}
                for index, header in headers.items():
                    record[header] = clean_text(values.get(index, ""))

                record = inherit_row(previous, record)
                if not clean_text(record.get("姓名")) or not clean_text(record.get("工号")):
                    continue

                if all(not value for key, value in record.items() if key not in {"姓名", "工号", "部门"}):
                    continue

                source_row = {
                    "sheet": sheet_name,
                    "rowNumber": row_number,
                    "fields": record,
                }
                records.append(source_row)
                people[record["工号"]].add(record["姓名"])
                previous = record

        metadata = {
            "sourceFile": input_path.name,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "recordCount": len(records),
            "personCount": len(people),
        }
        return {"metadata": metadata, "records": records}


def main():
    input_path = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT)
    output_path = Path(sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT)
    payload = parse_workbook(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {payload['metadata']['recordCount']} records to {output_path}")


if __name__ == "__main__":
    main()
