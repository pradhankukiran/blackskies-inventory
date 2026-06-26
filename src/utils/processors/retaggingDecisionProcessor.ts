import {
  BasicRetaggingEligible,
  RetaggingDecisionConfig,
  RetaggingDecisionResult,
  RetaggingDecisionRow,
  RetaggingEligibility,
  RetaggingSeasonRecommendation,
} from "@/types/retagging";

type RawRow = Record<string, unknown>;

interface SalesAggregate {
  articleVariant: string;
  category: string;
  season: string;
  nmv: number;
  unitsSold: number;
  sar: number | null;
  returnRate: number | null;
  discountRate: number | null;
  daysOnline: number | null;
  rowCount: number;
}

interface ArticleLevelMetric {
  articleVariant: string;
  sar: number | null;
}

interface InventoryItem {
  articleVariant: string;
  ean: string;
  sku: string;
  articleName: string;
  category: string;
  season: string;
  classification: string;
  status: string;
  statusCode: string;
  zfsStock: number;
  regularPrice: number | null;
  discountedPrice: number | null;
}

interface ShopifyStockItem {
  sku: string;
  ean: string;
  stock: number;
}

interface ShopifySkuEanItem {
  sku: string;
  ean: string;
}

const UNKNOWN_ELIGIBILITY: RetaggingEligibility = "Unknown / missing data";

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const getValue = (row: RawRow, aliases: string[]): string => {
  const normalizedAliases = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeKey(key))) {
      return String(value ?? "").trim();
    }
  }

  return "";
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/%/g, "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (commaIndex > -1 && dotIndex > -1) {
    normalized = commaIndex > dotIndex
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (commaIndex > -1) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePercent = (value: unknown): number | null => parseNumber(value);

const normalizeId = (value: string) => value.trim().toUpperCase();

const sameMarket = (row: RawRow, aliases: string[], market: string) => {
  const country = getValue(row, aliases);
  return !country || country.toUpperCase() === market;
};

const firstNonEmpty = (...values: string[]) => values.find((value) => value.trim())?.trim() || "";

const classifySeason = (season: string): string => {
  const normalized = normalizeKey(season);
  if (!normalized) return "";
  if (
    normalized.includes("springsummerbasics") ||
    normalized.includes("ssbasics") ||
    normalized.includes("summerbasics")
  ) {
    return "SS_Basics";
  }
  if (
    normalized.includes("autumnwinterbasics") ||
    normalized.includes("fallwinterbasics") ||
    normalized.includes("awbasics") ||
    normalized.includes("winterbasics")
  ) {
    return "AW_Basics";
  }
  if (normalized.includes("yearround") || normalized.includes("yearroundbasic") || normalized.includes("yrb")) {
    return "Year-Round Basic";
  }
  return "Regular";
};

const alreadyBasicRecommendation = (classification: string): RetaggingSeasonRecommendation | null => {
  if (
    classification === "Year-Round Basic" ||
    classification === "SS_Basics" ||
    classification === "AW_Basics"
  ) {
    return "Already Basic / no action required";
  }
  return null;
};

const seasonCodeParts = (season: string): { year: number; half: number } | null => {
  const normalized = season.toUpperCase();
  const shortYear = normalized.match(/\b(?:FS|SS|AW|HW)[_-]?(\d{2})\b/);
  const fullYear = normalized.match(/\b(20\d{2})\b/);
  const year = shortYear ? 2000 + Number(shortYear[1]) : fullYear ? Number(fullYear[1]) : null;
  if (!year) return null;

  let half = 0;
  if (/\b(?:FS|SS)[_-]?\d{2}\b/.test(normalized) || /SPRING|SUMMER/.test(normalized)) half = 1;
  if (/\b(?:AW|HW)[_-]?\d{2}\b/.test(normalized) || /AUTUMN|WINTER|FALL/.test(normalized)) half = 2;
  return half ? { year, half } : { year, half: 1 };
};

const isOldSeason = (season: string, sales: SalesAggregate | undefined, config: RetaggingDecisionConfig) => {
  const current = seasonCodeParts(config.currentSeasonCode || "");
  const article = seasonCodeParts(season);
  if (current && article) {
    return article.year < current.year || (article.year === current.year && article.half < current.half);
  }
  const year = yearFromSeason(season);
  const currentYear = (config.currentDate || new Date()).getFullYear();
  return Boolean(year && year < currentYear) || (sales?.daysOnline ?? 0) > 365;
};

const operationalNotes = ({
  sales,
  inventory,
  shopifyStock,
  discount,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  shopifyStock: number;
  discount: number | null;
  config: RetaggingDecisionConfig;
}) => {
  const notes: string[] = [];
  const requiredDiscount = config.requiredDiscountThreshold ?? 20;

  if (!sales || !inventory) notes.push("Missing data");
  if (inventory && isBlockingStatus(inventory.status, inventory.statusCode)) notes.push("Blocking issue code");
  if (inventory && inventory.zfsStock <= 0 && shopifyStock > 0) notes.push("Replenish ZFS first");
  if (shopifyStock > 0 && shopifyStock <= 5) notes.push("Low internal stock");
  if (sales?.sar !== null && sales?.sar !== undefined && sales.sar < config.sarThreshold) notes.push("Low size availability");
  if (sales?.returnRate !== null && sales?.returnRate !== undefined && sales.returnRate > 35) notes.push("High return rate");

  const oldSeason = inventory ? isOldSeason(inventory.season || sales?.season || "", sales, config) : false;
  const alreadyBasic = alreadyBasicRecommendation(inventory?.classification || "");
  if (oldSeason && !alreadyBasic) {
    if (discount === null || discount < requiredDiscount) {
      notes.push(`Discount required: below ${requiredDiscount}%`);
    } else {
      notes.push("Already discounted / no discount action required");
    }
  }

  return Array.from(new Set(notes)).join("; ");
};

const firstNullable = (values: Array<number | null>) => {
  return values.find((value): value is number => value !== null) ?? null;
};

const currentDiscount = (regularPrice: number | null, discountedPrice: number | null, salesDiscount: number | null) => {
  if (regularPrice && discountedPrice && regularPrice > 0 && discountedPrice < regularPrice) {
    return Math.max(0, Math.round(((regularPrice - discountedPrice) / regularPrice) * 1000) / 10);
  }
  return salesDiscount;
};

const yearFromSeason = (season: string): number | null => {
  const match = season.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
};

const isBlockingStatus = (status: string, statusCode: string) => {
  const combined = `${status} ${statusCode}`.toLowerCase();
  return (
    combined.includes("blocked") ||
    combined.includes("rejected") ||
    combined.includes("not live") ||
    combined.includes("not visible")
  );
};

const isActiveSellableStatus = (status: string, statusCode: string) => {
  if (isBlockingStatus(status, statusCode)) return false;
  const combined = `${status} ${statusCode}`.toLowerCase();
  if (!combined.trim()) return false;
  return (
    combined.includes("live") ||
    combined.includes("active") ||
    combined.includes("sellable") ||
    combined.includes("visible") ||
    combined.includes("online")
  );
};

const averageNullable = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
};

const normalizeArticleLevelRows = (rows: RawRow[], config: RetaggingDecisionConfig): ArticleLevelMetric[] => {
  const metrics = new Map<string, ArticleLevelMetric>();

  rows
    .filter((row) => sameMarket(row, ["Country"], config.market))
    .forEach((row) => {
      const articleVariant = normalizeId(firstNonEmpty(
        getValue(row, ["Zalando article variant", "zalando_article_variant", "zalando article variant"]),
        getValue(row, ["Article variant", "article_variant"])
      ));
      if (!articleVariant || metrics.has(articleVariant)) return;

      metrics.set(articleVariant, {
        articleVariant,
        sar: parsePercent(getValue(row, ["Avg. size availability rate", "Size Availability Rate", "SAR"])),
      });
    });

  return Array.from(metrics.values());
};

const normalizeSalesRows = (rows: RawRow[], config: RetaggingDecisionConfig): SalesAggregate[] => {
  const grouped = new Map<string, SalesAggregate & {
    sarValues: Array<number | null>;
    returnValues: Array<number | null>;
    discountValues: Array<number | null>;
  }>();

  rows
    .filter((row) => sameMarket(row, ["Country"], config.market))
    .forEach((row) => {
      const articleVariant = normalizeId(firstNonEmpty(
        getValue(row, ["Zalando article variant", "zalando_article_variant", "zalando article variant"]),
        getValue(row, ["Article variant", "article_variant"])
      ));
      if (!articleVariant) return;

      const existing = grouped.get(articleVariant);
      const nmv = parseNumber(getValue(row, ["NMV", "GMV"])) ?? 0;
      const unitsSold = parseNumber(getValue(row, ["Sold articles", "Units sold", "Sold units"])) ?? 0;
      const sar = parsePercent(getValue(row, ["Avg. size availability rate", "Size Availability Rate", "SAR"]));
      const returnRate = parsePercent(getValue(row, ["Estimated return rate", "Return rate", "Return rate (%)"]));
      const discountRate = parsePercent(getValue(row, ["Sold discount rate", "Current discount %", "Discount"]));
      const daysOnline = parseNumber(getValue(row, ["Days online"]));
      const base = existing || {
        articleVariant,
        category: getValue(row, ["Category"]),
        season: getValue(row, ["Season"]),
        nmv: 0,
        unitsSold: 0,
        sar: null,
        returnRate: null,
        discountRate: null,
        daysOnline: null,
        rowCount: 0,
        sarValues: [],
        returnValues: [],
        discountValues: [],
      };

      base.category = base.category || getValue(row, ["Category"]);
      base.season = base.season || getValue(row, ["Season"]);
      base.nmv += nmv;
      base.unitsSold += unitsSold;
      base.daysOnline = Math.max(base.daysOnline ?? 0, daysOnline ?? 0) || null;
      base.rowCount += 1;
      base.sarValues.push(sar);
      base.returnValues.push(returnRate);
      base.discountValues.push(discountRate);
      grouped.set(articleVariant, base);
    });

  return Array.from(grouped.values()).map((item) => ({
    articleVariant: item.articleVariant,
    category: item.category,
    season: item.season,
    nmv: item.nmv,
    unitsSold: item.unitsSold,
    sar: firstNullable(item.sarValues),
    returnRate: averageNullable(item.returnValues),
    discountRate: averageNullable(item.discountValues),
    daysOnline: item.daysOnline,
    rowCount: item.rowCount,
  }));
};

const normalizeInventoryRows = (rows: RawRow[], config: RetaggingDecisionConfig): InventoryItem[] => {
  return rows
    .filter((row) => sameMarket(row, ["country", "Country"], config.market))
    .map((row) => {
      const season = getValue(row, ["season", "Season"]);
      const sku = firstNonEmpty(
        getValue(row, ["sku", "SKU"]),
        getValue(row, ["partner_variant_size", "Partner Variant Size"]),
        getValue(row, ["partner_article_variant", "Partner Article Variant"]),
        getValue(row, ["partner_article", "Partner Article"])
      );

      return {
        articleVariant: normalizeId(getValue(row, ["zalando_article_variant", "Zalando article variant"])),
        ean: normalizeId(getValue(row, ["ean", "EAN", "barcode", "Barcode"])),
        sku: normalizeId(sku),
        articleName: getValue(row, ["article_name", "Article name", "Product Name"]),
        category: getValue(row, ["category", "Category"]),
        season,
        classification: classifySeason(season),
        status: firstNonEmpty(getValue(row, ["status_cluster"]), getValue(row, ["status_description"])),
        statusCode: getValue(row, ["status_detail", "Zalando issue/status code"]),
        zfsStock: parseNumber(getValue(row, ["sellable_zfs_stock", "ZFS stock", "ZFS Quantity"])) ?? 0,
        regularPrice: parseNumber(getValue(row, ["regular_price", "Regular price"])),
        discountedPrice: parseNumber(getValue(row, ["discounted_price", "Discounted price"])),
      };
    })
    .filter((item) => item.articleVariant || item.ean || item.sku);
};

const normalizeShopifyRows = (rows: RawRow[]): ShopifyStockItem[] => {
  return rows
    .map((row) => ({
      sku: normalizeId(getValue(row, ["SKU", "sku"])),
      ean: normalizeId(getValue(row, ["EAN", "ean", "Barcode", "barcode"])),
      stock: parseNumber(getValue(row, ["Lager", "Internal Stock", "Internal Stock Quantity", "Available Stock", "stock"])) ?? 0,
    }))
    .filter((item) => item.sku || item.ean);
};

const normalizeShopifySkuEanRows = (rows: RawRow[]): ShopifySkuEanItem[] => {
  return rows
    .map((row) => ({
      sku: normalizeId(getValue(row, ["SKU", "sku"])),
      ean: normalizeId(getValue(row, ["EAN", "ean", "Barcode", "barcode"])),
    }))
    .filter((item) => item.sku && item.ean);
};

const buildShopifyMaps = (items: ShopifyStockItem[], skuEanItems: ShopifySkuEanItem[] = []) => {
  const bySku = new Map<string, ShopifyStockItem>();
  const byEan = new Map<string, ShopifyStockItem>();
  items.forEach((item) => {
    if (item.sku) bySku.set(item.sku, item);
    if (item.ean) byEan.set(item.ean, item);
  });

  skuEanItems.forEach((mapping) => {
    if (!mapping.ean || byEan.has(mapping.ean)) return;
    const stockItem = bySku.get(mapping.sku);
    if (stockItem) {
      byEan.set(mapping.ean, {
        ...stockItem,
        ean: mapping.ean,
      });
    }
  });

  return { bySku, byEan };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const calculateEligibility = ({
  sales,
  inventory,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  config: RetaggingDecisionConfig;
}): RetaggingEligibility => {
  if (!sales || !inventory || sales.sar === null || sales.nmv === null) return UNKNOWN_ELIGIBILITY;
  if (sales.sar < config.sarThreshold) return "Not eligible";
  if (sales.nmv < config.nmvThreshold) return "Not eligible";
  if (isBlockingStatus(inventory.status, inventory.statusCode)) return "Not eligible";
  if (!isActiveSellableStatus(inventory.status, inventory.statusCode)) return "Not eligible";
  return "Eligible";
};

const toBasicRetaggingEligible = (eligibility: RetaggingEligibility): BasicRetaggingEligible =>
  eligibility === "Eligible" ? "Yes" : "No";

const calculateRetaggingEligibility = ({
  sales,
  inventory,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
}): RetaggingEligibility => {
  if (!sales || !inventory) return UNKNOWN_ELIGIBILITY;
  if (isBlockingStatus(inventory.status, inventory.statusCode)) return "Not eligible";
  return "Eligible";
};

const calculateScore = ({
  sales,
  inventory,
  shopifyStock,
  discount,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  shopifyStock: number;
  discount: number | null;
  config: RetaggingDecisionConfig;
}) => {
  let score = 0;
  const nmv = sales?.nmv ?? 0;
  const units = sales?.unitsSold ?? 0;
  const sar = sales?.sar ?? 0;
  const returnRate = sales?.returnRate ?? null;
  const zfsStock = inventory?.zfsStock ?? 0;

  score += clamp(config.nmvThreshold > 0 ? (nmv / (config.nmvThreshold * 2)) * 25 : 0, 0, 25);
  score += clamp((units / 100) * 15, 0, 15);
  score += clamp((sar / 100) * 15, 0, 15);
  score += zfsStock > 20 ? 15 : zfsStock > 0 ? 10 : 0;
  score += shopifyStock > 20 ? 10 : shopifyStock > 0 ? 7 : 0;
  score += returnRate === null ? 5 : clamp(((60 - returnRate) / 60) * 10, 0, 10);

  const year = yearFromSeason(inventory?.season || sales?.season || "");
  const currentYear = (config.currentDate || new Date()).getFullYear();
  const isOldSeason = Boolean(year && year < currentYear) || (sales?.daysOnline ?? 0) > 365;
  score += isOldSeason ? 10 : 5;

  if (discount !== null && discount > 50) score -= 10;
  if (!sales) score -= 20;
  if (!inventory) score -= 20;
  if (isBlockingStatus(inventory?.status || "", inventory?.statusCode || "")) score -= 20;

  return Math.round(clamp(score, 0, 100));
};

const determineSeasonRecommendation = ({
  sales,
  inventory,
  basicEligibility,
  retaggingEligibility,
  shopifyStock,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  basicEligibility: RetaggingEligibility;
  retaggingEligibility: RetaggingEligibility;
  shopifyStock: number;
  config: RetaggingDecisionConfig;
}): RetaggingSeasonRecommendation => {
  if (!sales || !inventory) return "Manual review";

  const noStockAvailable = inventory.zfsStock <= 0 && shopifyStock <= 0;
  const weakSales = sales.nmv < config.nmvThreshold * 0.25 && sales.unitsSold <= 0;
  const oldSeason = isOldSeason(inventory.season || sales.season, sales, config);
  if (noStockAvailable && (isBlockingStatus(inventory.status, inventory.statusCode) || (weakSales && oldSeason))) {
    return "Clearance / phase out";
  }

  if (isBlockingStatus(inventory.status, inventory.statusCode)) return "Manual review";

  const alreadyBasic = alreadyBasicRecommendation(inventory.classification);
  if (alreadyBasic) return alreadyBasic;

  if (basicEligibility === "Eligible") return "Basic retagging eligible - choose department manually";

  if (retaggingEligibility === "Eligible") return "Retag to next season";
  return "Manual review";
};

const hasMissingData = (value: string | number | "") => value === "" || value === "N/A";

const buildReason = ({
  sales,
  inventory,
  shopifyStock,
  discount,
  score,
  seasonRecommendation,
  operationalNote,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  shopifyStock: number;
  discount: number | null;
  score: number;
  seasonRecommendation: RetaggingSeasonRecommendation;
  operationalNote: string;
  config: RetaggingDecisionConfig;
}) => {
  const reasons: string[] = [];
  if (sales?.sar !== null && sales?.sar !== undefined) {
    reasons.push(`SAR ${sales.sar.toFixed(1)}% ${sales.sar >= config.sarThreshold ? "meets" : "is below"} ${config.sarThreshold}% threshold`);
  }
  if (sales) {
    reasons.push(`NMV EUR ${Math.round(sales.nmv).toLocaleString()} used as GMV proxy`);
    reasons.push(`${Math.round(sales.unitsSold).toLocaleString()} units sold in last 12 months`);
  }
  if (inventory) reasons.push(`ZFS stock ${inventory.zfsStock.toLocaleString()}`);
  if (shopifyStock > 0) reasons.push(`Shopify stock ${shopifyStock.toLocaleString()}`);
  if (discount !== null) reasons.push(`Current discount ${discount.toFixed(1)}%`);
  reasons.push(`Score ${score}/100`);
  reasons.push(`Season recommendation: ${seasonRecommendation}`);
  if (operationalNote) reasons.push(`Operational note: ${operationalNote}`);
  return reasons.join("; ");
};

const buildMissingNote = (row: RetaggingDecisionRow) => {
  const missing: string[] = [];
  if (hasMissingData(row.SKU)) missing.push("SKU");
  if (hasMissingData(row.EAN)) missing.push("EAN");
  if (hasMissingData(row["Article name"])) missing.push("article name");
  if (row["NMV used as GMV proxy"] === "") missing.push("NMV");
  if (row["Units sold last 12 months"] === "") missing.push("units sold");
  if (row["Size Availability Rate / SAR"] === "") missing.push("SAR");
  if (row["Internal Shopify stock"] === 0) missing.push("Shopify stock");
  if (row["Retagging eligibility"] === UNKNOWN_ELIGIBILITY) {
    missing.push("eligibility input");
  }
  return missing.length ? `Missing or weak data: ${Array.from(new Set(missing)).join(", ")}` : "";
};

const createDecisionRow = ({
  sales,
  inventory,
  shopifyStock,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  shopifyStock: number;
  config: RetaggingDecisionConfig;
}): RetaggingDecisionRow => {
  const discount = currentDiscount(inventory?.regularPrice ?? null, inventory?.discountedPrice ?? null, sales?.discountRate ?? null);
  const baseEligibility = calculateEligibility({ sales, inventory, config });
  const retaggingEligibility = alreadyBasicRecommendation(inventory?.classification || "")
    ? "Not eligible"
    : calculateRetaggingEligibility({ sales, inventory });
  const score = calculateScore({ sales, inventory, shopifyStock, discount, config });
  const seasonRecommendation = determineSeasonRecommendation({
    sales,
    inventory,
    basicEligibility: baseEligibility,
    retaggingEligibility,
    shopifyStock,
    config,
  });
  const operationalNote = operationalNotes({ sales, inventory, shopifyStock, discount, config });

  const row: RetaggingDecisionRow = {
    "SKU": inventory?.sku || "N/A",
    "Zalando SKU": inventory?.articleVariant || sales?.articleVariant || "N/A",
    "EAN": inventory?.ean || "N/A",
    "Article name": inventory?.articleName || "N/A",
    "Category": inventory?.category || sales?.category || "N/A",
    "Current season": inventory?.season || sales?.season || "N/A",
    "Article status": inventory?.status || "N/A",
    "Zalando issue/status code": inventory?.statusCode || "N/A",
    "ZFS stock": inventory?.zfsStock ?? 0,
    "Internal Shopify stock": shopifyStock,
    "NMV used as GMV proxy": sales ? Math.round(sales.nmv * 100) / 100 : "",
    "Units sold last 12 months": sales ? Math.round(sales.unitsSold) : "",
    "Return rate, if available": sales?.returnRate !== null && sales?.returnRate !== undefined ? Math.round(sales.returnRate * 10) / 10 : "",
    "Size Availability Rate / SAR": sales?.sar !== null && sales?.sar !== undefined ? Math.round(sales.sar * 10) / 10 : "",
    "Current discount %": discount !== null ? Math.round(discount * 10) / 10 : "",
    "Basic Retagging Eligible": toBasicRetaggingEligible(baseEligibility),
    "Retagging eligibility": retaggingEligibility,
    "Retagging score": score,
    "Season recommendation": seasonRecommendation,
    "Operational note": operationalNote,
    "Suggested action": seasonRecommendation,
    "Reason / explanation": "",
    "Missing data / manual review note": "",
  };

  row["Reason / explanation"] = buildReason({
    sales,
    inventory,
    shopifyStock,
    discount,
    score,
    seasonRecommendation,
    operationalNote,
    config,
  });
  row["Missing data / manual review note"] = buildMissingNote(row);
  return row;
};

const summarize = (rows: RetaggingDecisionRow[]) => ({
  totalArticles: rows.length,
  retagCandidates: rows.filter((row) => row["Suggested action"] === "Retag to next season").length,
  basicsCandidates: rows.filter((row) => row["Basic Retagging Eligible"] === "Yes").length,
  manualReview: rows.filter((row) => row["Suggested action"] === "Manual review").length,
  clearance: rows.filter((row) => row["Suggested action"] === "Clearance / phase out").length,
});

export const processRetaggingDecisions = ({
  salesRows,
  salesArticleLevelRows = [],
  inventoryRows,
  shopifyStockRows,
  shopifySkuEanRows = [],
  config,
}: {
  salesRows: RawRow[];
  salesArticleLevelRows?: RawRow[];
  inventoryRows: RawRow[];
  shopifyStockRows: RawRow[];
  shopifySkuEanRows?: RawRow[];
  config: RetaggingDecisionConfig;
}): RetaggingDecisionResult => {
  const warnings: string[] = [];
  const sales = normalizeSalesRows(salesRows, config);
  const articleLevelMetrics = normalizeArticleLevelRows(salesArticleLevelRows, config);
  const articleLevelSarByVariant = new Map(
    articleLevelMetrics
      .filter((item) => item.sar !== null)
      .map((item) => [item.articleVariant, item.sar as number])
  );
  if (articleLevelSarByVariant.size) {
    sales.forEach((item) => {
      const articleLevelSar = articleLevelSarByVariant.get(item.articleVariant);
      if (articleLevelSar !== undefined) {
        item.sar = articleLevelSar;
      }
    });
  }
  const inventory = normalizeInventoryRows(inventoryRows, config);
  const shopifyStock = normalizeShopifyRows(shopifyStockRows);
  const shopifySkuEan = normalizeShopifySkuEanRows(shopifySkuEanRows);
  const salesByVariant = new Map(sales.map((item) => [item.articleVariant, item]));
  const { bySku: shopifyBySku, byEan: shopifyByEan } = buildShopifyMaps(shopifyStock, shopifySkuEan);
  const usedSalesKeys = new Set<string>();

  if (!sales.length) warnings.push("No DE sales rows were found in the Sales Performance detail-breakdown file.");
  if (!inventory.length) warnings.push("No DE inventory rows were found in the ZFS Inventory file.");
  if (!shopifyStock.length) warnings.push("No Shopify stock rows were provided. Internal stock will be 0 and affected rows may need manual review.");

  const rows = inventory.map((item) => {
    const matchedSales = item.articleVariant ? salesByVariant.get(item.articleVariant) : undefined;
    if (matchedSales) usedSalesKeys.add(matchedSales.articleVariant);
    const shopifyMatch = (item.sku ? shopifyBySku.get(item.sku) : undefined) || (item.ean ? shopifyByEan.get(item.ean) : undefined);
    return createDecisionRow({
      sales: matchedSales,
      inventory: item,
      shopifyStock: shopifyMatch?.stock ?? 0,
      config,
    });
  });

  sales.forEach((salesItem) => {
    if (usedSalesKeys.has(salesItem.articleVariant)) return;
    rows.push(createDecisionRow({
      sales: salesItem,
      inventory: undefined,
      shopifyStock: 0,
      config,
    }));
  });

  rows.sort((a, b) => {
    if (b["Retagging score"] !== a["Retagging score"]) return b["Retagging score"] - a["Retagging score"];
    return String(a.SKU).localeCompare(String(b.SKU));
  });

  return {
    rows,
    summary: summarize(rows),
    warnings,
  };
};
