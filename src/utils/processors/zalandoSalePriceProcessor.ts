import {
  RawSalePriceRow,
  ZalandoSalePriceResult,
  ZalandoSalePriceRow,
  ZalandoSalePriceRowStatus,
  ZalandoSalePriceSummary,
} from "@/types/zalandoSalePrice";

const TARGET_STATUS = "ZABLO_01";
const SALE_PRICE_MULTIPLIER = 0.8;

const STATUS_ALIASES = ["status_detail", "status detail", "status code", "zalando status code"];
const PRIMARY_SKU_ALIASES = ["partner_variant_size", "partner variant size"];
const SKU_ALIASES = [
  "sku",
  "merchant_sku",
  "seller_sku",
  "article_sku",
  "variant_sku",
  "product_sku",
  "article_number",
  "partner_article_variant",
  "partner_article",
  "article_variant",
];
const EAN_ALIASES = ["ean", "gtin", "barcode", "product_barcode", "ean_upc", "upc"];
const ARTICLE_NAME_ALIASES = ["article_name", "article name", "product_name", "product name", "title", "name"];
const REGULAR_PRICE_ALIASES = [
  "regular_price",
  "regular price",
  "original_price",
  "original price",
  "retail_price",
  "retail price",
  "price",
];
const CURRENCY_ALIASES = ["currency", "price_currency", "currency_code"];

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const isPresent = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";

const readValue = (row: RawSalePriceRow, aliases: string[]): unknown => {
  const valuesByHeader = new Map<string, unknown>();

  Object.entries(row).forEach(([header, value]) => {
    const normalizedHeader = normalizeHeader(header);
    if (!valuesByHeader.has(normalizedHeader)) {
      valuesByHeader.set(normalizedHeader, value);
    }
  });

  for (const alias of aliases) {
    const value = valuesByHeader.get(normalizeHeader(alias));
    if (isPresent(value)) return value;
  }

  return undefined;
};

const readText = (row: RawSalePriceRow, aliases: string[]) => {
  const value = readValue(row, aliases);
  return value === undefined ? "" : String(value).trim();
};

/** Normalizes identifiers for case-insensitive Shopify SKU/EAN matching. */
export const normalizeZalandoSalePriceId = (value: unknown): string =>
  String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();

/**
 * Parses common Zalando/European price values, including 33,99 and 1.234,56.
 * Dot-decimal values such as 33.99 are also supported.
 */
export const parseZalandoPrice = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToTwoDecimals = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateZalandoSalePrice = (regularPrice: number) =>
  roundToTwoDecimals(regularPrice * SALE_PRICE_MULTIPLIER);

const sourceRowId = (sourceRowNumber: number) => `zablo-sale-price-row-${sourceRowNumber}`;

const makeRow = ({
  sourceRowNumber,
  status,
  statusDetail,
  sku,
  ean,
  articleName,
  currency,
  regularPrice,
  salePrice = null,
  message,
}: Omit<ZalandoSalePriceRow, "sourceRowId" | "salePrice"> & { salePrice?: number | null }): ZalandoSalePriceRow => ({
  sourceRowNumber,
  sourceRowId: sourceRowId(sourceRowNumber),
  status,
  statusDetail,
  sku,
  ean,
  articleName,
  currency,
  regularPrice,
  salePrice,
  message,
});

const createSummary = (rows: ZalandoSalePriceRow[]): ZalandoSalePriceSummary => {
  const count = (status: ZalandoSalePriceRowStatus) => rows.filter((row) => row.status === status).length;
  const skippedNonZablo01Rows = count("skipped_non_zablo_01");
  const missingIdentifierRows = count("error_missing_identifier");
  const missingRegularPriceRows = count("error_missing_regular_price");
  const invalidRegularPriceRows = count("error_invalid_regular_price");

  return {
    totalRows: rows.length,
    readyRows: count("ready"),
    skippedRows: skippedNonZablo01Rows,
    invalidRows: missingIdentifierRows + missingRegularPriceRows + invalidRegularPriceRows,
    skippedNonZablo01Rows,
    missingIdentifierRows,
    missingRegularPriceRows,
    invalidRegularPriceRows,
  };
};

const createWarnings = (summary: ZalandoSalePriceSummary): string[] => {
  const warnings: string[] = [];

  if (summary.totalRows === 0) warnings.push("No rows were provided.");
  if (summary.skippedNonZablo01Rows > 0) {
    warnings.push(`${summary.skippedNonZablo01Rows} row(s) were skipped because status_detail is not ${TARGET_STATUS}.`);
  }
  if (summary.invalidRows > 0) {
    warnings.push(`${summary.invalidRows} ${TARGET_STATUS} row(s) need correction before Shopify matching.`);
  }

  return warnings;
};

/**
 * Builds a complete preview from parsed Zalando CSV rows. It never matches or
 * writes Shopify data; ready rows are the only rows safe to pass to that step.
 */
export const processZalandoSalePrices = (rawRows: RawSalePriceRow[]): ZalandoSalePriceResult => {
  const rows = rawRows.map((rawRow, index) => {
    const sourceRowNumber = index + 1;
    const statusDetail = readText(rawRow, STATUS_ALIASES);
    const sku = normalizeZalandoSalePriceId(readValue(rawRow, PRIMARY_SKU_ALIASES))
      || normalizeZalandoSalePriceId(readValue(rawRow, SKU_ALIASES));
    const ean = normalizeZalandoSalePriceId(readValue(rawRow, EAN_ALIASES));
    const articleName = readText(rawRow, ARTICLE_NAME_ALIASES);
    const currency = readText(rawRow, CURRENCY_ALIASES).toUpperCase();
    const regularPriceValue = readValue(rawRow, REGULAR_PRICE_ALIASES);
    const regularPrice = parseZalandoPrice(regularPriceValue);

    if (statusDetail.toUpperCase() !== TARGET_STATUS) {
      return makeRow({
        sourceRowNumber,
        status: "skipped_non_zablo_01",
        statusDetail,
        sku,
        ean,
        articleName,
        currency,
        regularPrice,
        message: `Skipped: status_detail is ${statusDetail || "empty"}, not ${TARGET_STATUS}.`,
      });
    }

    if (!sku && !ean) {
      return makeRow({
        sourceRowNumber,
        status: "error_missing_identifier",
        statusDetail,
        sku,
        ean,
        articleName,
        currency,
        regularPrice,
        message: "Cannot match Shopify: both SKU and EAN are missing.",
      });
    }

    if (!isPresent(regularPriceValue)) {
      return makeRow({
        sourceRowNumber,
        status: "error_missing_regular_price",
        statusDetail,
        sku,
        ean,
        articleName,
        currency,
        regularPrice: null,
        message: "Cannot calculate sale price: regular price is missing.",
      });
    }

    if (regularPrice === null || regularPrice <= 0) {
      return makeRow({
        sourceRowNumber,
        status: "error_invalid_regular_price",
        statusDetail,
        sku,
        ean,
        articleName,
        currency,
        regularPrice,
        message: "Cannot calculate sale price: regular price must be a positive number.",
      });
    }

    return makeRow({
      sourceRowNumber,
      status: "ready",
      statusDetail,
      sku,
      ean,
      articleName,
      currency,
      regularPrice,
      salePrice: calculateZalandoSalePrice(regularPrice),
      message: "Ready to match Shopify by SKU or EAN.",
    });
  });

  const summary = createSummary(rows);
  return { rows, summary, warnings: createWarnings(summary) };
};
