import {
  StockReturnConfig,
  StockReturnResult,
  StockReturnReviewRow,
} from "@/types/stockReturn";

type RawRow = Record<string, unknown>;

interface InventoryItem {
  ean: string;
  articleVariant: string;
  sku: string;
  articleName: string;
  country: string;
  zfsStock: number;
}

interface SalesItem {
  articleVariant: string;
  ean: string;
  unitsSold: number;
  daysOnline: number | null;
}

interface ShopifyStockItem {
  sku: string;
  articleName: string;
}

interface ShopifySkuEanItem {
  sku: string;
  ean: string;
}

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

const normalizeId = (value: string) => value.trim().toUpperCase();

const firstNonEmpty = (...values: string[]) => values.find((value) => value.trim())?.trim() || "";

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

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

const sameMarket = (row: RawRow, aliases: string[], market: string) => {
  const country = getValue(row, aliases);
  return !country || country.toUpperCase() === market;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

const mergeDaysOnline = (current: number | null, next: number | null) => {
  if (next === null || next <= 0) return current;
  if (current === null || current <= 0) return next;
  return Math.max(current, next);
};

const effectiveSalesDays = (configuredDays: number, daysOnline: number | null) => {
  const fallbackDays = Math.max(configuredDays, 1);
  if (daysOnline === null || daysOnline <= 0) return fallbackDays;
  return Math.max(1, Math.min(fallbackDays, daysOnline));
};

const normalizeInventoryRows = (rows: RawRow[], config: StockReturnConfig): InventoryItem[] => {
  return rows
    .filter((row) => sameMarket(row, ["country", "Country"], config.market))
    .filter((row) => {
      const fulfilledBy = getValue(row, ["Fulfilled by", "fulfilled_by"]);
      return !fulfilledBy || fulfilledBy.toUpperCase().includes("ZFS");
    })
    .map((row) => {
      const sku = firstNonEmpty(
        getValue(row, ["partner_variant_size", "Partner Variant Size"]),
        getValue(row, ["Variant size", "variant_size"]),
        getValue(row, ["sku", "SKU"]),
        getValue(row, ["partner_article_variant", "Partner Article Variant"]),
        getValue(row, ["partner_article", "Partner Article"]),
        getValue(row, ["Article variant", "article_variant"])
      );
      const zfsStock = parseNumber(firstNonEmpty(
        getValue(row, ["sellable_zfs_stock", "ZFS stock", "ZFS Quantity"]),
        getValue(row, ["Offerable ZFS stock", "offerable_zfs_stock"]),
        getValue(row, ["Total sellable stock", "total_sellable_stock"])
      )) ?? 0;

      return {
        ean: normalizeId(getValue(row, ["ean", "EAN", "barcode", "Barcode"])),
        articleVariant: normalizeId(getValue(row, ["zalando_article_variant", "Zalando article variant"])),
        sku: normalizeId(sku),
        articleName: firstNonEmpty(
          getValue(row, ["article_name", "Article name", "Product Name"]),
          getValue(row, ["Article type", "article_type"])
        ),
        country: getValue(row, ["country", "Country"]).toUpperCase(),
        zfsStock,
      };
    })
    .filter((item) => item.ean && item.zfsStock > 0);
};

const normalizeSalesRows = (rows: RawRow[], config: StockReturnConfig): SalesItem[] => {
  const byKey = new Map<string, SalesItem>();

  rows
    .filter((row) => sameMarket(row, ["Country"], config.market))
    .forEach((row) => {
      const articleVariant = normalizeId(firstNonEmpty(
        getValue(row, ["Zalando article variant", "zalando_article_variant", "zalando article variant"]),
        getValue(row, ["Article variant", "article_variant"])
      ));
      if (!articleVariant) return;

      const ean = normalizeId(getValue(row, ["EAN", "ean", "barcode", "Barcode"]));
      const key = `${articleVariant}|${ean}`;
      const daysOnline = parseNumber(getValue(row, ["Days online", "days_online"]));
      const existing = byKey.get(key) || {
        articleVariant,
        ean,
        unitsSold: 0,
        daysOnline: null,
      };
      existing.unitsSold += parseNumber(getValue(row, ["Sold articles", "Units sold", "Sold units"])) ?? 0;
      existing.daysOnline = mergeDaysOnline(existing.daysOnline, daysOnline);
      byKey.set(key, existing);
    });

  return Array.from(byKey.values());
};

const normalizeShopifyRows = (rows: RawRow[]): ShopifyStockItem[] => {
  return rows
    .map((row) => ({
      sku: normalizeId(firstNonEmpty(
        getValue(row, ["SKU", "sku"]),
        getValue(row, ["Article Number", "articleNumber"])
      )),
      articleName: firstNonEmpty(
        getValue(row, ["Title", "title"]),
        getValue(row, ["Product Name", "product_name"]),
        getValue(row, ["Article name", "article_name"])
      ),
    }))
    .filter((item) => item.sku);
};

const normalizeShopifySkuEanRows = (rows: RawRow[]): ShopifySkuEanItem[] => {
  return rows
    .map((row) => ({
      sku: normalizeId(getValue(row, ["SKU", "sku", "Article Number"])),
      ean: normalizeId(getValue(row, ["EAN", "ean", "barcode", "Barcode"])),
    }))
    .filter((item) => item.sku && item.ean);
};

const buildShopifyMaps = (stockRows: ShopifyStockItem[], skuEanRows: ShopifySkuEanItem[]) => {
  const bySku = new Map(stockRows.map((item) => [item.sku, item]));
  const byEan = new Map<string, ShopifyStockItem>();

  skuEanRows.forEach((item) => {
    const stock = bySku.get(item.sku);
    if (stock) {
      byEan.set(item.ean, stock);
    }
  });

  return { bySku, byEan };
};

const distributeKeepStock = (items: InventoryItem[], totalStockToKeep: number) => {
  const totalStock = items.reduce((sum, item) => sum + item.zfsStock, 0);
  if (totalStock <= 0 || totalStockToKeep <= 0) {
    return new Map(items.map((item) => [item.ean, 0]));
  }

  const rawAllocations = items.map((item) => {
    const raw = (item.zfsStock / totalStock) * totalStockToKeep;
    return {
      ean: item.ean,
      keep: Math.min(item.zfsStock, Math.floor(raw)),
      remainder: raw - Math.floor(raw),
      maxKeep: item.zfsStock,
    };
  });

  let assigned = rawAllocations.reduce((sum, item) => sum + item.keep, 0);
  const target = Math.min(totalStock, Math.ceil(totalStockToKeep));

  rawAllocations
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (assigned >= target || item.keep >= item.maxKeep) return;
      item.keep += 1;
      assigned += 1;
    });

  return new Map(rawAllocations.map((item) => [item.ean, item.keep]));
};

export const processStockReturns = ({
  inventoryRows,
  salesRows,
  shopifyStockRows = [],
  shopifySkuEanRows = [],
  config,
}: {
  inventoryRows: RawRow[];
  salesRows: RawRow[];
  shopifyStockRows?: RawRow[];
  shopifySkuEanRows?: RawRow[];
  config: StockReturnConfig;
}): StockReturnResult => {
  const warnings: string[] = [];
  const inventory = normalizeInventoryRows(inventoryRows, config);
  const sales = normalizeSalesRows(salesRows, config);
  const shopifyStock = normalizeShopifyRows(shopifyStockRows);
  const shopifySkuEan = normalizeShopifySkuEanRows(shopifySkuEanRows);
  const salesByEan = new Map<string, SalesItem>();
  const salesByVariant = new Map<string, SalesItem>();

  sales.forEach((item) => {
    if (item.ean) {
      const existingByEan = salesByEan.get(item.ean) || {
        articleVariant: item.articleVariant,
        ean: item.ean,
        unitsSold: 0,
        daysOnline: null,
      };
      existingByEan.unitsSold += item.unitsSold;
      existingByEan.daysOnline = mergeDaysOnline(existingByEan.daysOnline, item.daysOnline);
      salesByEan.set(item.ean, existingByEan);
    }

    const existingByVariant = salesByVariant.get(item.articleVariant) || {
      articleVariant: item.articleVariant,
      ean: "",
      unitsSold: 0,
      daysOnline: null,
    };
    existingByVariant.unitsSold += item.unitsSold;
    existingByVariant.daysOnline = mergeDaysOnline(existingByVariant.daysOnline, item.daysOnline);
    salesByVariant.set(item.articleVariant, existingByVariant);
  });

  const { bySku: shopifyBySku, byEan: shopifyByEan } = buildShopifyMaps(shopifyStock, shopifySkuEan);

  if (!inventory.length) warnings.push("No DE ZFS inventory rows with sellable stock were found.");
  if (!sales.length) warnings.push("No matching DE stock performance rows were found.");
  if (!shopifyStock.length) warnings.push("No Shopify stock rows were provided. SKU and article name will fall back to ZFS Inventory data.");

  const inventoryByVariant = new Map<string, InventoryItem[]>();
  inventory.forEach((item) => {
    const key = item.articleVariant || item.ean;
    inventoryByVariant.set(key, [...(inventoryByVariant.get(key) || []), item]);
  });

  const rows: StockReturnReviewRow[] = [];

  inventoryByVariant.forEach((items, articleVariant) => {
    const hasEanSales = items.some((item) => item.ean && salesByEan.has(item.ean));

    if (hasEanSales) {
      items.forEach((item) => {
        const salesItem = item.ean ? salesByEan.get(item.ean) : undefined;
        const unitsSold = salesItem?.unitsSold ?? 0;
        const daysOnline = salesItem?.daysOnline ?? null;
        const salesDaysUsed = effectiveSalesDays(config.salesHistoryDays, daysOnline);
        const averageDailySales = unitsSold / salesDaysUsed;
        const expectedDemand = averageDailySales * config.forecastPeriodDays;
        const stockToKeep = Math.min(item.zfsStock, Math.ceil(expectedDemand * (1 + config.safetyBufferPercent / 100)));
        const suggestedReturnQty = Math.max(0, Math.floor(item.zfsStock - stockToKeep));
        const estimatedSavings = suggestedReturnQty * config.storageFeePerUnitPerDay * config.forecastPeriodDays;
        const shopifyMatch = (item.ean ? shopifyByEan.get(item.ean) : undefined) || (item.sku ? shopifyBySku.get(item.sku) : undefined);
        const displaySku = shopifyMatch?.sku || item.sku || item.articleVariant || "N/A";
        const displayArticleName = shopifyMatch?.articleName || item.articleName || "N/A";

        rows.push({
          "EAN": item.ean,
          "SKU": displaySku,
          "Article name": displayArticleName,
          "Zalando article variant": item.articleVariant || "N/A",
          "Current ZFS stock": Math.round(item.zfsStock),
          "Units sold in selected period": Math.round(unitsSold),
          "Days online": daysOnline ? Math.round(daysOnline) : "N/A",
          "Sales days used": salesDaysUsed,
          "Average daily sales": round4(averageDailySales),
          "Stock to keep": stockToKeep,
          "Suggested return qty": suggestedReturnQty,
          "Estimated savings": round2(estimatedSavings),
        });
      });
      return;
    }

    const variantSales = salesByVariant.get(articleVariant);
    const unitsSold = variantSales?.unitsSold ?? 0;
    const daysOnline = variantSales?.daysOnline ?? null;
    const salesDaysUsed = effectiveSalesDays(config.salesHistoryDays, daysOnline);
    const averageDailySales = unitsSold / salesDaysUsed;
    const expectedDemand = averageDailySales * config.forecastPeriodDays;
    const totalStockToKeep = Math.ceil(expectedDemand * (1 + config.safetyBufferPercent / 100));
    const keepByEan = distributeKeepStock(items, totalStockToKeep);

    items.forEach((item) => {
      const shopifyMatch = (item.ean ? shopifyByEan.get(item.ean) : undefined) || (item.sku ? shopifyBySku.get(item.sku) : undefined);
      const stockToKeep = keepByEan.get(item.ean) ?? 0;
      const suggestedReturnQty = Math.max(0, Math.floor(item.zfsStock - stockToKeep));
      const estimatedSavings = suggestedReturnQty * config.storageFeePerUnitPerDay * config.forecastPeriodDays;
      const displaySku = shopifyMatch?.sku || item.sku || item.articleVariant || "N/A";
      const displayArticleName = shopifyMatch?.articleName || item.articleName || "N/A";

      rows.push({
        "EAN": item.ean,
        "SKU": displaySku,
        "Article name": displayArticleName,
        "Zalando article variant": item.articleVariant || "N/A",
        "Current ZFS stock": Math.round(item.zfsStock),
        "Units sold in selected period": Math.round(unitsSold),
        "Days online": daysOnline ? Math.round(daysOnline) : "N/A",
        "Sales days used": salesDaysUsed,
        "Average daily sales": round4(averageDailySales),
        "Stock to keep": stockToKeep,
        "Suggested return qty": suggestedReturnQty,
        "Estimated savings": round2(estimatedSavings),
      });
    });
  });

  rows.sort((a, b) => {
    if (b["Estimated savings"] !== a["Estimated savings"]) return b["Estimated savings"] - a["Estimated savings"];
    if (b["Suggested return qty"] !== a["Suggested return qty"]) return b["Suggested return qty"] - a["Suggested return qty"];
    return a.EAN.localeCompare(b.EAN);
  });

  const exportRows = rows
    .filter((row) => row["Suggested return qty"] > 0)
    .map((row) => ({
      "EAN": row.EAN,
      "SKU": row.SKU,
      "Article name": row["Article name"],
      "Current ZFS stock": row["Current ZFS stock"],
      "Units sold in selected period": row["Units sold in selected period"],
      "Days online": row["Days online"],
      "Sales days used": row["Sales days used"],
      "Stock to keep": row["Stock to keep"],
      "Estimated savings": row["Estimated savings"],
      "return qty": row["Suggested return qty"],
    }));

  return {
    rows,
    exportRows,
    summary: {
      totalArticles: rows.length,
      returnCandidates: exportRows.length,
      totalReturnQty: exportRows.reduce((sum, row) => sum + row["return qty"], 0),
      estimatedSavings: round2(rows.reduce((sum, row) => sum + row["Estimated savings"], 0)),
    },
    warnings,
  };
};
