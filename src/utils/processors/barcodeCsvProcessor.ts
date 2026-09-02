import Papa from "papaparse";
import { BarcodeCsvResult, BarcodeLabelRow } from "@/types/barcode";

type RawRow = Record<string, unknown>;

interface ParsedBarcodeCsv {
  fields: string[];
  rows: RawRow[];
  warnings: string[];
}

const REQUIRED_FIELDS = [
  { label: "SKU", aliases: ["sku"] },
  { label: "EAN", aliases: ["ean", "ean13", "barcode"] },
  {
    label: "ARTICLE_NAME",
    aliases: ["articlename", "productname", "producttitle", "title"],
  },
  { label: "COLOR", aliases: ["color", "colour"] },
  { label: "SIZE", aliases: ["size", "variantsize"] },
] as const;

const normalizeKey = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const getValue = (row: RawRow, aliases: readonly string[]) => {
  const normalizedAliases = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeKey(key))) return normalizeValue(value);
  }

  return "";
};

const parserErrorMessage = (message: string, row?: number) =>
  row === undefined ? message : `CSV row ${row + 2}: ${message}`;

export const parseBarcodeCsvText = (csvText: string): ParsedBarcodeCsv => {
  if (!csvText.trim()) throw new Error("The CSV file is empty.");

  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    transform: (value) => value.trim(),
  });

  const fatalError = parsed.errors.find(
    (error) => error.type === "Quotes" || error.code === "UndetectableDelimiter"
  );
  if (fatalError) {
    throw new Error(`Could not parse the CSV. ${parserErrorMessage(fatalError.message, fatalError.row)}`);
  }

  return {
    fields: parsed.meta.fields ?? [],
    rows: parsed.data,
    warnings: parsed.errors.map((error) => parserErrorMessage(error.message, error.row)),
  };
};

export const isValidEan13 = (ean: string): boolean => {
  if (!/^\d{13}$/.test(ean)) return false;

  const checksumTotal = ean
    .slice(0, 12)
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  const expectedCheckDigit = (10 - (checksumTotal % 10)) % 10;

  return expectedCheckDigit === Number(ean[12]);
};

const normalizedHeaderSet = (fields: string[]) => new Set(fields.map(normalizeKey));

const getMissingFields = (fields: string[]) => {
  const headers = normalizedHeaderSet(fields);
  return REQUIRED_FIELDS.filter(
    (field) => !field.aliases.some((alias) => headers.has(normalizeKey(alias)))
  );
};

const normalizeRow = (row: RawRow, index: number): BarcodeLabelRow => {
  const sku = getValue(row, REQUIRED_FIELDS[0].aliases);
  const ean = getValue(row, REQUIRED_FIELDS[1].aliases);
  const articleName = getValue(row, REQUIRED_FIELDS[2].aliases);
  const color = getValue(row, REQUIRED_FIELDS[3].aliases);
  const size = getValue(row, REQUIRED_FIELDS[4].aliases);
  const missingValues = [
    ["SKU", sku],
    ["EAN", ean],
    ["article name", articleName],
    ["color", color],
    ["size", size],
  ].filter(([, value]) => !value);
  const issues: string[] = [];

  if (missingValues.length) {
    issues.push(`Missing ${missingValues.map(([label]) => label).join(", ")}.`);
  }
  if (ean && !isValidEan13(ean)) {
    issues.push("EAN must be a valid 13-digit EAN-13 number.");
  }

  return {
    sourceRowNumber: index + 2,
    sku,
    articleName,
    color,
    size,
    ean,
    status: issues.length ? "invalid" : "ready",
    issues,
  };
};

const rowSignature = (row: BarcodeLabelRow) =>
  [row.sku, row.articleName, row.color, row.size, row.ean]
    .map((value) => value.toLowerCase())
    .join("\u0000");

const applyDuplicateRules = (rows: BarcodeLabelRow[]) => {
  const rowsByEan = new Map<string, BarcodeLabelRow[]>();

  rows.forEach((row) => {
    if (!row.ean) return;
    const matchingRows = rowsByEan.get(row.ean) ?? [];
    matchingRows.push(row);
    rowsByEan.set(row.ean, matchingRows);
  });

  rowsByEan.forEach((matchingRows) => {
    if (matchingRows.length < 2) return;

    const signatures = new Set(matchingRows.map(rowSignature));
    const everyRowIsReady = matchingRows.every((row) => row.status === "ready");
    if (everyRowIsReady && signatures.size === 1) {
      matchingRows.slice(1).forEach((row) => {
        row.status = "duplicate";
        row.issues = ["Exact duplicate; one label will be generated for this EAN."];
      });
      return;
    }

    matchingRows.forEach((row) => {
      row.status = "invalid";
      if (!row.issues.includes("This EAN is used by conflicting product data.")) {
        row.issues.push("This EAN is used by conflicting product data.");
      }
    });
  });
};

export const processBarcodeCsvRows = (
  rawRows: RawRow[],
  fields: string[],
  parserWarnings: string[] = []
): BarcodeCsvResult => {
  const missingFields = getMissingFields(fields);
  if (missingFields.length) {
    throw new Error(
      `CSV is missing required columns: ${missingFields.map((field) => field.label).join(", ")}.`
    );
  }
  if (!rawRows.length) throw new Error("The CSV does not contain any product rows.");

  const rows = rawRows.map(normalizeRow);
  applyDuplicateRules(rows);

  const summary = {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.status === "ready").length,
    invalidRows: rows.filter((row) => row.status === "invalid").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
  };
  const warnings = Array.from(new Set(parserWarnings));

  if (summary.invalidRows) {
    warnings.push(
      `${summary.invalidRows} ${summary.invalidRows === 1 ? "row needs" : "rows need"} correction before label generation.`
    );
  }
  if (summary.duplicateRows) {
    warnings.push(
      `${summary.duplicateRows} exact ${summary.duplicateRows === 1 ? "duplicate was" : "duplicates were"} ignored.`
    );
  }

  return { rows, summary, warnings };
};

export const processBarcodeCsvText = (csvText: string): BarcodeCsvResult => {
  const parsed = parseBarcodeCsvText(csvText);
  return processBarcodeCsvRows(parsed.rows, parsed.fields, parsed.warnings);
};

export const processBarcodeCsvFile = async (file: File): Promise<BarcodeCsvResult> =>
  processBarcodeCsvText(await file.text());
