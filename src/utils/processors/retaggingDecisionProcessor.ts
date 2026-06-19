import {
  RetaggingDecisionConfig,
  RetaggingDecisionResult,
  RetaggingDecisionRow,
  RetaggingEligibility,
  RetaggingSuggestedAction,
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
  if (normalized.includes("yearround") || normalized.includes("yrb") || normalized.includes("basic")) {
    return "Year-Round Basic";
  }
  if (normalized.includes("springsummer") || normalized.includes("summer") || normalized.includes("ss")) {
    return "SS_Basics";
  }
  if (
    normalized.includes("autumnwinter") ||
    normalized.includes("fallwinter") ||
    normalized.includes("winter") ||
    normalized.includes("aw")
  ) {
    return "AW_Basics";
  }
  return "Regular";
};

const seasonGroup = (season: string) => {
  const classification = classifySeason(season);
  if (classification === "Year-Round Basic") return "yrb";
  if (classification === "SS_Basics") return "ss";
  if (classification === "AW_Basics") return "aw";
  return "regular";
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

const currentDiscount = (regularPrice: number | null, discountedPrice: number | null, salesDiscount: number | null) => {
  if (regularPrice && discountedPrice && regularPrice > 0 && discountedPrice < regularPrice) {
    return Math.max(0, Math.round(((regularPrice - discountedPrice) / regularPrice) * 1000) / 10);
  }
  return salesDiscount;
};

const averageNullable = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
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
    sar: averageNullable(item.sarValues),
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

const buildShopifyMaps = (items: ShopifyStockItem[]) => {
  const bySku = new Map<string, ShopifyStockItem>();
  const byEan = new Map<string, ShopifyStockItem>();
  items.forEach((item) => {
    if (item.sku) bySku.set(item.sku, item);
    if (item.ean) byEan.set(item.ean, item);
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

const determineAction = ({
  sales,
  inventory,
  yrbEligibility,
  ssEligibility,
  awEligibility,
  retaggingEligibility,
  score,
  shopifyStock,
  discount,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  yrbEligibility: RetaggingEligibility;
  ssEligibility: RetaggingEligibility;
  awEligibility: RetaggingEligibility;
  retaggingEligibility: RetaggingEligibility;
  score: number;
  shopifyStock: number;
  discount: number | null;
  config: RetaggingDecisionConfig;
}): RetaggingSuggestedAction => {
  if (!sales || !inventory) return "Manual review";
  if (isBlockingStatus(inventory.status, inventory.statusCode) && inventory.zfsStock <= 0 && sales.nmv >= config.nmvThreshold) {
    return "Replenish ZFS first";
  }
  if (isBlockingStatus(inventory.status, inventory.statusCode)) return "Manual review";
  if (inventory.zfsStock <= 0 && shopifyStock > 0 && sales.nmv >= config.nmvThreshold) return "Replenish ZFS first";

  const weakSales = sales.nmv < config.nmvThreshold * 0.5 && sales.unitsSold < 5;
  const year = yearFromSeason(inventory.season || sales.season);
  const oldSeason = Boolean(year && year < (config.currentDate || new Date()).getFullYear());
  if (weakSales && oldSeason) return "Clearance / phase out";
  if (sales.nmv < config.nmvThreshold && sales.unitsSold > 0 && (discount === null || discount < 20)) return "Add required discount";

  if (yrbEligibility === "Eligible" && score >= 75 && (sales.returnRate === null || sales.returnRate <= 35) && (discount === null || discount <= 25)) {
    return "Apply for Year-Round Basic";
  }
  if (ssEligibility === "Eligible") return "Apply for SS_Basics";
  if (awEligibility === "Eligible") return "Apply for AW_Basics";
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
  action,
  config,
}: {
  sales?: SalesAggregate;
  inventory?: InventoryItem;
  shopifyStock: number;
  discount: number | null;
  score: number;
  action: RetaggingSuggestedAction;
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
  reasons.push(`Suggested action: ${action}`);
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
  if (row["YRB eligibility"] === UNKNOWN_ELIGIBILITY || row["Retagging eligibility"] === UNKNOWN_ELIGIBILITY) {
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
  const group = seasonGroup(inventory?.season || sales?.season || "");
  const yrbEligibility = baseEligibility;
  const ssEligibility: RetaggingEligibility = baseEligibility === "Eligible" && (group === "ss" || group === "regular")
    ? "Eligible"
    : baseEligibility === "Eligible" ? "Not eligible" : baseEligibility;
  const awEligibility: RetaggingEligibility = baseEligibility === "Eligible" && (group === "aw" || group === "regular")
    ? "Eligible"
    : baseEligibility === "Eligible" ? "Not eligible" : baseEligibility;
  const retaggingEligibility = baseEligibility;
  const score = calculateScore({ sales, inventory, shopifyStock, discount, config });
  const action = determineAction({
    sales,
    inventory,
    yrbEligibility,
    ssEligibility,
    awEligibility,
    retaggingEligibility,
    score,
    shopifyStock,
    discount,
    config,
  });

  const row: RetaggingDecisionRow = {
    "SKU": inventory?.sku || "N/A",
    "EAN": inventory?.ean || "N/A",
    "Article name": inventory?.articleName || "N/A",
    "Category": inventory?.category || sales?.category || "N/A",
    "Current season": inventory?.season || sales?.season || "N/A",
    "Current classification": inventory?.classification || classifySeason(sales?.season || "") || "N/A",
    "Article status": inventory?.status || "N/A",
    "Zalando issue/status code": inventory?.statusCode || "N/A",
    "ZFS stock": inventory?.zfsStock ?? 0,
    "Internal Shopify stock": shopifyStock,
    "NMV used as GMV proxy": sales ? Math.round(sales.nmv * 100) / 100 : "",
    "Units sold last 12 months": sales ? Math.round(sales.unitsSold) : "",
    "Return rate, if available": sales?.returnRate !== null && sales?.returnRate !== undefined ? Math.round(sales.returnRate * 10) / 10 : "",
    "Size Availability Rate / SAR": sales?.sar !== null && sales?.sar !== undefined ? Math.round(sales.sar * 10) / 10 : "",
    "Current discount %": discount !== null ? Math.round(discount * 10) / 10 : "",
    "YRB eligibility": yrbEligibility,
    "SS_Basics eligibility": ssEligibility,
    "AW_Basics eligibility": awEligibility,
    "Retagging eligibility": retaggingEligibility,
    "Retagging score": score,
    "Suggested action": action,
    "Reason / explanation": "",
    "Missing data / manual review note": "",
  };

  row["Reason / explanation"] = buildReason({ sales, inventory, shopifyStock, discount, score, action, config });
  row["Missing data / manual review note"] = buildMissingNote(row);
  return row;
};

const summarize = (rows: RetaggingDecisionRow[]) => ({
  totalArticles: rows.length,
  retagCandidates: rows.filter((row) => row["Suggested action"] === "Retag to next season").length,
  basicsCandidates: rows.filter((row) =>
    row["Suggested action"] === "Apply for Year-Round Basic" ||
    row["Suggested action"] === "Apply for SS_Basics" ||
    row["Suggested action"] === "Apply for AW_Basics"
  ).length,
  manualReview: rows.filter((row) => row["Suggested action"] === "Manual review").length,
  clearance: rows.filter((row) => row["Suggested action"] === "Clearance / phase out").length,
});

export const processRetaggingDecisions = ({
  salesRows,
  inventoryRows,
  shopifyStockRows,
  config,
}: {
  salesRows: RawRow[];
  inventoryRows: RawRow[];
  shopifyStockRows: RawRow[];
  config: RetaggingDecisionConfig;
}): RetaggingDecisionResult => {
  const warnings: string[] = [];
  const sales = normalizeSalesRows(salesRows, config);
  const inventory = normalizeInventoryRows(inventoryRows, config);
  const shopifyStock = normalizeShopifyRows(shopifyStockRows);
  const salesByVariant = new Map(sales.map((item) => [item.articleVariant, item]));
  const { bySku: shopifyBySku, byEan: shopifyByEan } = buildShopifyMaps(shopifyStock);
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
