import {
  RawSalePriceRow,
  ZalandoSalePriceResult,
  ZalandoSalePriceRow,
  ZalandoSalePriceRowStatus,
  ZalandoSalePriceSummary,
} from "@/types/zalandoSalePrice";

const TARGET_STATUS = "ZABLO_646";
const TARGET_COUNTRY = "DE";
const TARGET_CURRENCY = "EUR";
const SALE_PRICE_MULTIPLIER = 0.8;
export const MINIMUM_ZALANDO_SALE_PRICE = 15;

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
const COUNTRY_ALIASES = ["country", "market", "country_code", "market_code"];

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
  Math.max(
    MINIMUM_ZALANDO_SALE_PRICE,
    roundToTwoDecimals(regularPrice * SALE_PRICE_MULTIPLIER)
  );

const containsTargetStatus = (statusDetail: string) =>
  statusDetail
    .split(",")
    .map((status) => status.trim().toUpperCase())
    .includes(TARGET_STATUS);

const sourceRowId = (sourceRowNumber: number) => `zablo-sale-price-row-${sourceRowNumber}`;

const makeRow = ({
  sourceRowNumber,
  status,
  statusDetail,
  sku,
  ean,
  articleName,
  country,
  currency,
  regularPrice,
  salePrice = null,
  minimumPriceApplied = false,
  message,
}: Omit<ZalandoSalePriceRow, "sourceRowId" | "salePrice" | "minimumPriceApplied"> & {
  salePrice?: number | null;
  minimumPriceApplied?: boolean;
}): ZalandoSalePriceRow => ({
  sourceRowNumber,
  sourceRowId: sourceRowId(sourceRowNumber),
  status,
  statusDetail,
  sku,
  ean,
  articleName,
  country,
  currency,
  regularPrice,
  salePrice,
  minimumPriceApplied,
  message,
});

const createSummary = (rows: ZalandoSalePriceRow[]): ZalandoSalePriceSummary => {
  const count = (status: ZalandoSalePriceRowStatus) => rows.filter((row) => row.status === status).length;
  const outsideTargetStatusRows = count("outside_target_status");
  const outsideTargetMarketRows = count("outside_target_market");
  const invalidCurrencyRows = count("invalid_currency");
  const missingIdentifierRows = count("error_missing_identifier");
  const missingRegularPriceRows = count("error_missing_regular_price");
  const invalidRegularPriceRows = count("error_invalid_regular_price");

  return {
    totalRows: rows.length,
    readyRows: count("ready"),
    skippedRows: outsideTargetStatusRows + outsideTargetMarketRows,
    invalidRows:
      invalidCurrencyRows + missingIdentifierRows + missingRegularPriceRows + invalidRegularPriceRows,
    outsideTargetStatusRows,
    outsideTargetMarketRows,
    invalidCurrencyRows,
    missingIdentifierRows,
    missingRegularPriceRows,
    invalidRegularPriceRows,
    minimumPriceAppliedRows: rows.filter((row) => row.minimumPriceApplied).length,
  };
};

const createWarnings = (summary: ZalandoSalePriceSummary): string[] => {
  const warnings: string[] = [];

  if (summary.totalRows === 0) warnings.push("No rows were provided.");
  if (summary.outsideTargetStatusRows > 0) {
    warnings.push(`${summary.outsideTargetStatusRows} row(s) were skipped because status_detail does not contain ${TARGET_STATUS}.`);
  }
  if (summary.outsideTargetMarketRows > 0) {
    warnings.push(`${summary.outsideTargetMarketRows} row(s) were skipped because country is not ${TARGET_COUNTRY.toLowerCase()}.`);
  }
  if (summary.invalidCurrencyRows > 0) {
    warnings.push(`${summary.invalidCurrencyRows} German-market row(s) were blocked because currency is not ${TARGET_CURRENCY}.`);
  }
  if (summary.invalidRows > 0) {
    warnings.push(`${summary.invalidRows} ${TARGET_STATUS} row(s) need correction before Shopify matching.`);
  }
  if (summary.minimumPriceAppliedRows > 0) {
    warnings.push(
      `${summary.minimumPriceAppliedRows} row(s) were raised to the minimum Zalando sale price of €15.00.`
    );
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
    const country = readText(rawRow, COUNTRY_ALIASES).toUpperCase();
    const currency = readText(rawRow, CURRENCY_ALIASES).toUpperCase();
    const regularPriceValue = readValue(rawRow, REGULAR_PRICE_ALIASES);
    const regularPrice = parseZalandoPrice(regularPriceValue);

    if (!containsTargetStatus(statusDetail)) {
      return makeRow({
        sourceRowNumber,
        status: "outside_target_status",
        statusDetail,
        sku,
        ean,
        articleName,
        country,
        currency,
        regularPrice,
        message: `Skipped: status_detail does not contain ${TARGET_STATUS}.`,
      });
    }

    if (country !== TARGET_COUNTRY) {
      return makeRow({
        sourceRowNumber,
        status: "outside_target_market",
        statusDetail,
        sku,
        ean,
        articleName,
        country,
        currency,
        regularPrice,
        message: `Skipped: country must be ${TARGET_COUNTRY.toLowerCase()} for this operation.`,
      });
    }

    if (currency !== TARGET_CURRENCY) {
      return makeRow({
        sourceRowNumber,
        status: "invalid_currency",
        statusDetail,
        sku,
        ean,
        articleName,
        country,
        currency,
        regularPrice,
        message: `Cannot calculate sale price: German-market currency must be ${TARGET_CURRENCY}.`,
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
        country,
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
        country,
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
        country,
        currency,
        regularPrice,
        message: "Cannot calculate sale price: regular price must be a positive number.",
      });
    }

    const discountedSalePrice = roundToTwoDecimals(regularPrice * SALE_PRICE_MULTIPLIER);
    const minimumPriceApplied = discountedSalePrice < MINIMUM_ZALANDO_SALE_PRICE;

    return makeRow({
      sourceRowNumber,
      status: "ready",
      statusDetail,
      sku,
      ean,
      articleName,
      country,
      currency,
      regularPrice,
      salePrice: calculateZalandoSalePrice(regularPrice),
      minimumPriceApplied,
      message: minimumPriceApplied
        ? `Warning: discounted price ${discountedSalePrice.toFixed(2)} was raised to the €15.00 minimum.`
        : "Ready to match Shopify by SKU or EAN.",
    });
  });

  const summary = createSummary(rows);
  return { rows, summary, warnings: createWarnings(summary) };
};
