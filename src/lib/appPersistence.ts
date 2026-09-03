import { TimelineType } from '@/types/common';
import {
  BarcodeBrand,
  BarcodeCsvResult,
  BarcodeLabelStatusFilter,
  BarcodePdfOutputMode,
} from '@/types/barcode';
import { ParsedData } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';
import { ProcessedSellerboardStock } from '@/types/processors';
import { RetaggingDecisionResult } from '@/types/retagging';
import { ShopifySalePriceApiResponse } from '@/types/shopifySalePrice';
import { StockReturnResult } from '@/types/stockReturn';
import { ZalandoSalePriceResult } from '@/types/zalandoSalePrice';
import { DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE } from '@/utils/processors/zalandoSalePriceProcessor';
import { clearGenericData, getGenericData, getStoredData, storeData, storeGenericData, StoredData } from './indexedDB';

export interface RecommendationSettings {
  coverageDays: number;
  safetyFactor: number;
  trendFactor: number;
}

export interface ZfsSettings extends RecommendationSettings {
  timeline: TimelineType;
}

const DEFAULT_COVERAGE_DAYS = 14;
const DEFAULT_RECOMMENDATION_SETTINGS: RecommendationSettings = {
  coverageDays: DEFAULT_COVERAGE_DAYS,
  safetyFactor: 0,
  trendFactor: 0,
};

const ZFS_TIMELINE_KEY = 'zfsTimeline';
const ZFS_SAFETY_FACTOR_KEY = 'zfsSafetyFactor';
const ZFS_TREND_FACTOR_KEY = 'zfsTrendFactor';
const FBA_SAFETY_FACTOR_KEY = 'fbaSafetyFactor';
const FBA_TREND_FACTOR_KEY = 'fbaTrendFactor';
const RETAGGING_SALES_FILE_KEY = 'retaggingSalesPerformanceFile';
const RETAGGING_SALES_ARTICLE_LEVEL_FILE_KEY = 'retaggingSalesArticleLevelFile';
const RETAGGING_INVENTORY_FILE_KEY = 'retaggingZfsInventoryFile';
const RETAGGING_SHOPIFY_STOCK_FILE_KEY = 'retaggingShopifyStockFile';
const RETAGGING_SHOPIFY_SKU_EAN_FILE_KEY = 'retaggingShopifySkuEanFile';
const RETAGGING_STATE_KEY = 'retaggingDecisionState';
const STOCK_RETURN_INVENTORY_FILE_KEY = 'stockReturnInventoryFile';
const STOCK_RETURN_SALES_FILE_KEY = 'stockReturnSalesFile';
const STOCK_RETURN_SHOPIFY_STOCK_FILE_KEY = 'stockReturnShopifyStockFile';
const STOCK_RETURN_SHOPIFY_SKU_EAN_FILE_KEY = 'stockReturnShopifySkuEanFile';
const STOCK_RETURN_STATE_KEY = 'stockReturnState';
const ZALANDO_SALE_PRICE_FILE_KEY = 'zalandoSalePriceFile';
const ZALANDO_SALE_PRICE_STATE_KEY = 'zalandoSalePriceState';
const BARCODE_PDF_FILE_KEY = 'barcodePdfCsvFile';
const BARCODE_PDF_STATE_KEY = 'barcodePdfState';
const BARCODE_SHOPIFY_STATE_KEY = 'barcodeShopifyState';

export interface RetaggingUiState {
  sarThreshold: number;
  nmvThreshold: number;
  currentSeasonCode: string;
  requiredDiscountThreshold: number;
  searchTerm: string;
  actionFilter: string;
  eligibilityFilter: string;
  showMissingOnly: boolean;
  hasProcessed: boolean;
  result: RetaggingDecisionResult | null;
}

export interface RetaggingPersistedState extends RetaggingUiState {
  salesPerformanceFile: File | null;
  salesArticleLevelFile: File | null;
  zfsInventoryFile: File | null;
  shopifyStockFile: File | null;
  shopifySkuEanFile: File | null;
}

export interface StockReturnUiState {
  salesHistoryDays: number;
  forecastPeriodDays: number;
  safetyBufferPercent: number;
  storageFeePerUnitPerDay: number;
  searchTerm: string;
  showReturnOnly: boolean;
  hasProcessed: boolean;
  result: StockReturnResult | null;
}

export interface StockReturnPersistedState extends StockReturnUiState {
  inventoryFile: File | null;
  salesFile: File | null;
  shopifyStockFile: File | null;
  shopifySkuEanFile: File | null;
}

export interface ZalandoSalePriceUiState {
  localResult: ZalandoSalePriceResult | null;
  shopifyResult: ShopifySalePriceApiResponse | null;
  discountPercentage: number;
  productSearchTerm: string;
  productStatusFilter: string;
  searchTerm: string;
  statusFilter: string;
}

export interface ZalandoSalePricePersistedState extends ZalandoSalePriceUiState {
  file: File | null;
}

export interface BarcodePdfUiState {
  brand: BarcodeBrand;
  outputMode: BarcodePdfOutputMode;
  searchTerm: string;
  statusFilter: BarcodeLabelStatusFilter;
  csvResult: BarcodeCsvResult | null;
}

export interface BarcodePdfPersistedState extends BarcodePdfUiState {
  csvFile: File | null;
}

export interface BarcodeShopifyPersistedState {
  result: BarcodeCsvResult;
  brand: BarcodeBrand;
  syncedAt: string;
}

const DEFAULT_RETAGGING_STATE: RetaggingUiState = {
  sarThreshold: 85,
  nmvThreshold: 1000,
  currentSeasonCode: 'FS_26',
  requiredDiscountThreshold: 20,
  searchTerm: '',
  actionFilter: 'all',
  eligibilityFilter: 'all',
  showMissingOnly: false,
  hasProcessed: false,
  result: null,
};

const DEFAULT_STOCK_RETURN_STATE: StockReturnUiState = {
  salesHistoryDays: 30,
  forecastPeriodDays: 30,
  safetyBufferPercent: 20,
  storageFeePerUnitPerDay: 0.0128,
  searchTerm: '',
  showReturnOnly: false,
  hasProcessed: false,
  result: null,
};

const DEFAULT_ZALANDO_SALE_PRICE_STATE: ZalandoSalePriceUiState = {
  localResult: null,
  shopifyResult: null,
  discountPercentage: DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE,
  productSearchTerm: '',
  productStatusFilter: 'all',
  searchTerm: '',
  statusFilter: 'all',
};

const DEFAULT_BARCODE_PDF_STATE: BarcodePdfUiState = {
  brand: 'blackskies',
  outputMode: 'combined',
  searchTerm: '',
  statusFilter: 'all',
  csvResult: null,
};

const isBarcodeBrand = (value: unknown): value is BarcodeBrand =>
  value === 'blackskies' || value === 'akitsune';

const isBarcodeOutputMode = (value: unknown): value is BarcodePdfOutputMode =>
  value === 'combined' || value === 'individual';

const isBarcodeStatusFilter = (value: unknown): value is BarcodeLabelStatusFilter =>
  value === 'all' || value === 'ready' || value === 'invalid' || value === 'duplicate';

const isBarcodeLabelRow = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.sourceRowNumber === 'number'
    && typeof row.sku === 'string'
    && typeof row.articleName === 'string'
    && typeof row.color === 'string'
    && typeof row.size === 'string'
    && typeof row.ean === 'string'
    && (row.status === 'ready' || row.status === 'invalid' || row.status === 'duplicate')
    && Array.isArray(row.issues)
    && row.issues.every((issue) => typeof issue === 'string');
};

const isBarcodeCsvResult = (value: unknown): value is BarcodeCsvResult => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BarcodeCsvResult>;
  const summary = candidate.summary as Record<string, unknown> | undefined;
  return Array.isArray(candidate.rows)
    && candidate.rows.every(isBarcodeLabelRow)
    && Array.isArray(candidate.warnings)
    && candidate.warnings.every((warning) => typeof warning === 'string')
    && Boolean(summary)
    && typeof summary?.totalRows === 'number'
    && typeof summary?.readyRows === 'number'
    && typeof summary?.invalidRows === 'number'
    && typeof summary?.duplicateRows === 'number';
};

const createEmptyParsedData = (): ParsedData => ({
  internal: [],
  zfs: [],
  zfsShipments: [],
  zfsShipmentsReceived: [],
  skuEanMapper: [],
  zfsSales: [],
  integrated: [],
  sellerboardStock: [],
});

const readNumberSetting = (key: string, fallback = 0): number => {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
};

const writeNumberSetting = (key: string, value: number) => {
  localStorage.setItem(key, String(value));
};

const removeSettings = (...keys: string[]) => {
  keys.forEach((key) => localStorage.removeItem(key));
};

const mergeStoredData = async (
  storeType: 'zfs' | 'fba',
  patch: Partial<StoredData>
) => {
  const existing = await getStoredData(storeType);
  await storeData({
    parsedData: existing?.parsedData || createEmptyParsedData(),
    recommendations: existing?.recommendations || [],
    ...existing,
    ...patch,
  }, storeType);
};

export const readZfsTimelineFallback = (): TimelineType => {
  const savedTimeline = localStorage.getItem(ZFS_TIMELINE_KEY);
  return (savedTimeline as TimelineType) || 'none';
};

export const loadZfsSettings = async (): Promise<ZfsSettings> => {
  const savedData = await getStoredData('zfs');
  return {
    timeline: savedData?.timeline || readZfsTimelineFallback(),
    coverageDays: savedData?.coverageDays || DEFAULT_COVERAGE_DAYS,
    safetyFactor: readNumberSetting(ZFS_SAFETY_FACTOR_KEY),
    trendFactor: readNumberSetting(ZFS_TREND_FACTOR_KEY),
  };
};

export const saveZfsTimeline = async (
  timeline: TimelineType,
  blacklist: string[]
) => {
  localStorage.setItem(ZFS_TIMELINE_KEY, timeline);
  await mergeStoredData('zfs', {
    timeline,
    blacklist,
  });
};

export const saveZfsCoverageDays = async (coverageDays: number) => {
  await mergeStoredData('zfs', { coverageDays });
};

export const saveZfsSafetyFactor = (safetyFactor: number) => {
  writeNumberSetting(ZFS_SAFETY_FACTOR_KEY, safetyFactor);
};

export const saveZfsTrendFactor = (trendFactor: number) => {
  writeNumberSetting(ZFS_TREND_FACTOR_KEY, trendFactor);
};

export const clearZfsSettings = () => {
  removeSettings(ZFS_TIMELINE_KEY, ZFS_SAFETY_FACTOR_KEY, ZFS_TREND_FACTOR_KEY);
};

export const saveZfsProcessingResult = async ({
  parsedData,
  recommendations,
  timeline,
  blacklist,
}: {
  parsedData: ParsedData;
  recommendations: ArticleRecommendation[];
  timeline: TimelineType;
  blacklist: string[];
}) => {
  const existing = await getStoredData('zfs');
  await storeData({
    ...existing,
    parsedData,
    recommendations,
    timeline,
    coverageDays: existing?.coverageDays ?? DEFAULT_COVERAGE_DAYS,
    blacklist,
  }, 'zfs');
};

export const clearZfsTablesData = async () => {
  await mergeStoredData('zfs', {
    parsedData: createEmptyParsedData(),
    recommendations: [],
  });
};

export const loadFbaSettings = async (): Promise<RecommendationSettings> => {
  const savedData = await getStoredData('fba');
  return {
    ...DEFAULT_RECOMMENDATION_SETTINGS,
    coverageDays: savedData?.coverageDays || DEFAULT_COVERAGE_DAYS,
    safetyFactor: readNumberSetting(FBA_SAFETY_FACTOR_KEY),
    trendFactor: readNumberSetting(FBA_TREND_FACTOR_KEY),
  };
};

export const saveFbaSafetyFactor = (safetyFactor: number) => {
  writeNumberSetting(FBA_SAFETY_FACTOR_KEY, safetyFactor);
};

export const saveFbaTrendFactor = (trendFactor: number) => {
  writeNumberSetting(FBA_TREND_FACTOR_KEY, trendFactor);
};

export const clearFbaSettings = () => {
  removeSettings(FBA_SAFETY_FACTOR_KEY, FBA_TREND_FACTOR_KEY);
};

export const saveFbaSellerboardStock = async (
  sellerboardStock: ProcessedSellerboardStock[],
  coverageDays: number
) => {
  const existing = await getStoredData('fba');
  await storeData({
    ...existing,
    parsedData: {
      ...(existing?.parsedData || createEmptyParsedData()),
      sellerboardStock,
    },
    recommendations: existing?.recommendations || [],
    coverageDays,
    blacklist: existing?.blacklist || [],
  }, 'fba');
};

export const saveFbaProcessedData = async ({
  parsedData,
  coverageDays,
  rawReturnsData,
  blacklist,
}: {
  parsedData: ParsedData;
  coverageDays: number;
  rawReturnsData: any[] | null;
  blacklist: string[];
}) => {
  await storeData({
    parsedData,
    recommendations: [],
    coverageDays,
    rawReturnsData,
    blacklist,
  }, 'fba');
};

export const resetFbaData = async (blacklist: string[]) => {
  await storeData({
    parsedData: createEmptyParsedData(),
    recommendations: [],
    coverageDays: DEFAULT_COVERAGE_DAYS,
    blacklist,
  }, 'fba');
};

export const clearFbaTablesData = async (blacklist: string[]) => {
  const existing = await getStoredData('fba');
  await storeData({
    ...existing,
    parsedData: createEmptyParsedData(),
    recommendations: existing?.recommendations || [],
    blacklist,
  }, 'fba');
};

export const loadRetaggingState = async (): Promise<RetaggingPersistedState> => {
  const [salesPerformanceFile, salesArticleLevelFile, zfsInventoryFile, shopifyStockFile, shopifySkuEanFile, state] = await Promise.all([
    getGenericData(RETAGGING_SALES_FILE_KEY),
    getGenericData(RETAGGING_SALES_ARTICLE_LEVEL_FILE_KEY),
    getGenericData(RETAGGING_INVENTORY_FILE_KEY),
    getGenericData(RETAGGING_SHOPIFY_STOCK_FILE_KEY),
    getGenericData(RETAGGING_SHOPIFY_SKU_EAN_FILE_KEY),
    getGenericData(RETAGGING_STATE_KEY),
  ]);

  return {
    ...DEFAULT_RETAGGING_STATE,
    ...(state || {}),
    salesPerformanceFile: salesPerformanceFile instanceof File ? salesPerformanceFile : null,
    salesArticleLevelFile: salesArticleLevelFile instanceof File ? salesArticleLevelFile : null,
    zfsInventoryFile: zfsInventoryFile instanceof File ? zfsInventoryFile : null,
    shopifyStockFile: shopifyStockFile instanceof File ? shopifyStockFile : null,
    shopifySkuEanFile: shopifySkuEanFile instanceof File ? shopifySkuEanFile : null,
  };
};

export const saveRetaggingSalesPerformanceFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(RETAGGING_SALES_FILE_KEY, file);
    return;
  }
  await clearGenericData(RETAGGING_SALES_FILE_KEY);
};

export const saveRetaggingSalesArticleLevelFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(RETAGGING_SALES_ARTICLE_LEVEL_FILE_KEY, file);
    return;
  }
  await clearGenericData(RETAGGING_SALES_ARTICLE_LEVEL_FILE_KEY);
};

export const saveRetaggingZfsInventoryFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(RETAGGING_INVENTORY_FILE_KEY, file);
    return;
  }
  await clearGenericData(RETAGGING_INVENTORY_FILE_KEY);
};

export const saveRetaggingShopifyStockFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(RETAGGING_SHOPIFY_STOCK_FILE_KEY, file);
    return;
  }
  await clearGenericData(RETAGGING_SHOPIFY_STOCK_FILE_KEY);
};

export const saveRetaggingShopifySkuEanFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(RETAGGING_SHOPIFY_SKU_EAN_FILE_KEY, file);
    return;
  }
  await clearGenericData(RETAGGING_SHOPIFY_SKU_EAN_FILE_KEY);
};

export const saveRetaggingUiState = async (state: Partial<RetaggingUiState>) => {
  const existing = await getGenericData(RETAGGING_STATE_KEY);
  await storeGenericData(RETAGGING_STATE_KEY, {
    ...DEFAULT_RETAGGING_STATE,
    ...(existing || {}),
    ...state,
  });
};

export const clearRetaggingResult = async () => {
  const existing = await getGenericData(RETAGGING_STATE_KEY);
  await storeGenericData(RETAGGING_STATE_KEY, {
    ...DEFAULT_RETAGGING_STATE,
    ...(existing || {}),
    result: null,
    hasProcessed: false,
    searchTerm: '',
    actionFilter: 'all',
    eligibilityFilter: 'all',
    showMissingOnly: false,
  });
};

export const resetRetaggingState = async () => {
  await Promise.all([
    clearGenericData(RETAGGING_SALES_FILE_KEY),
    clearGenericData(RETAGGING_SALES_ARTICLE_LEVEL_FILE_KEY),
    clearGenericData(RETAGGING_INVENTORY_FILE_KEY),
    clearGenericData(RETAGGING_SHOPIFY_STOCK_FILE_KEY),
    clearGenericData(RETAGGING_SHOPIFY_SKU_EAN_FILE_KEY),
    clearGenericData(RETAGGING_STATE_KEY),
  ]);
};

export const loadStockReturnState = async (): Promise<StockReturnPersistedState> => {
  const [inventoryFile, salesFile, shopifyStockFile, shopifySkuEanFile, state] = await Promise.all([
    getGenericData(STOCK_RETURN_INVENTORY_FILE_KEY),
    getGenericData(STOCK_RETURN_SALES_FILE_KEY),
    getGenericData(STOCK_RETURN_SHOPIFY_STOCK_FILE_KEY),
    getGenericData(STOCK_RETURN_SHOPIFY_SKU_EAN_FILE_KEY),
    getGenericData(STOCK_RETURN_STATE_KEY),
  ]);

  return {
    ...DEFAULT_STOCK_RETURN_STATE,
    ...(state || {}),
    inventoryFile: inventoryFile instanceof File ? inventoryFile : null,
    salesFile: salesFile instanceof File ? salesFile : null,
    shopifyStockFile: shopifyStockFile instanceof File ? shopifyStockFile : null,
    shopifySkuEanFile: shopifySkuEanFile instanceof File ? shopifySkuEanFile : null,
  };
};

export const saveStockReturnInventoryFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(STOCK_RETURN_INVENTORY_FILE_KEY, file);
    return;
  }
  await clearGenericData(STOCK_RETURN_INVENTORY_FILE_KEY);
};

export const saveStockReturnSalesFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(STOCK_RETURN_SALES_FILE_KEY, file);
    return;
  }
  await clearGenericData(STOCK_RETURN_SALES_FILE_KEY);
};

export const saveStockReturnShopifyStockFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(STOCK_RETURN_SHOPIFY_STOCK_FILE_KEY, file);
    return;
  }
  await clearGenericData(STOCK_RETURN_SHOPIFY_STOCK_FILE_KEY);
};

export const saveStockReturnShopifySkuEanFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(STOCK_RETURN_SHOPIFY_SKU_EAN_FILE_KEY, file);
    return;
  }
  await clearGenericData(STOCK_RETURN_SHOPIFY_SKU_EAN_FILE_KEY);
};

export const saveStockReturnUiState = async (state: Partial<StockReturnUiState>) => {
  const existing = await getGenericData(STOCK_RETURN_STATE_KEY);
  await storeGenericData(STOCK_RETURN_STATE_KEY, {
    ...DEFAULT_STOCK_RETURN_STATE,
    ...(existing || {}),
    ...state,
  });
};

export const clearStockReturnResult = async () => {
  const existing = await getGenericData(STOCK_RETURN_STATE_KEY);
  await storeGenericData(STOCK_RETURN_STATE_KEY, {
    ...DEFAULT_STOCK_RETURN_STATE,
    ...(existing || {}),
    result: null,
    hasProcessed: false,
    searchTerm: '',
    showReturnOnly: false,
  });
};

export const resetStockReturnState = async () => {
  await Promise.all([
    clearGenericData(STOCK_RETURN_INVENTORY_FILE_KEY),
    clearGenericData(STOCK_RETURN_SALES_FILE_KEY),
    clearGenericData(STOCK_RETURN_SHOPIFY_STOCK_FILE_KEY),
    clearGenericData(STOCK_RETURN_SHOPIFY_SKU_EAN_FILE_KEY),
    clearGenericData(STOCK_RETURN_STATE_KEY),
  ]);
};

export const loadZalandoSalePriceFile = async (): Promise<File | null> => {
  const file = await getGenericData(ZALANDO_SALE_PRICE_FILE_KEY);
  return file instanceof File ? file : null;
};

export const loadZalandoSalePriceState = async (): Promise<ZalandoSalePricePersistedState> => {
  const [file, state] = await Promise.all([
    loadZalandoSalePriceFile(),
    getGenericData(ZALANDO_SALE_PRICE_STATE_KEY),
  ]);

  return {
    ...DEFAULT_ZALANDO_SALE_PRICE_STATE,
    ...(state || {}),
    file,
  };
};

export const saveZalandoSalePriceFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(ZALANDO_SALE_PRICE_FILE_KEY, file);
    return;
  }
  await clearGenericData(ZALANDO_SALE_PRICE_FILE_KEY);
};

export const saveZalandoSalePriceUiState = async (
  state: ZalandoSalePriceUiState
) => {
  await storeGenericData(ZALANDO_SALE_PRICE_STATE_KEY, state);
};

export const loadBarcodePdfState = async (): Promise<BarcodePdfPersistedState> => {
  const [csvFile, storedState] = await Promise.all([
    getGenericData(BARCODE_PDF_FILE_KEY),
    getGenericData(BARCODE_PDF_STATE_KEY),
  ]);
  const state = storedState && typeof storedState === 'object'
    ? storedState as Partial<BarcodePdfUiState>
    : {};

  return {
    brand: isBarcodeBrand(state.brand) ? state.brand : DEFAULT_BARCODE_PDF_STATE.brand,
    outputMode: isBarcodeOutputMode(state.outputMode)
      ? state.outputMode
      : DEFAULT_BARCODE_PDF_STATE.outputMode,
    searchTerm: typeof state.searchTerm === 'string' ? state.searchTerm : '',
    statusFilter: isBarcodeStatusFilter(state.statusFilter) ? state.statusFilter : 'all',
    csvResult: isBarcodeCsvResult(state.csvResult) ? state.csvResult : null,
    csvFile: csvFile instanceof File ? csvFile : null,
  };
};

export const saveBarcodePdfCsvFile = async (file: File | null) => {
  if (file) {
    await storeGenericData(BARCODE_PDF_FILE_KEY, file);
    return;
  }
  await clearGenericData(BARCODE_PDF_FILE_KEY);
};

export const saveBarcodePdfUiState = async (state: BarcodePdfUiState) => {
  await storeGenericData(BARCODE_PDF_STATE_KEY, state);
};

export const loadBarcodeShopifyState = async (): Promise<BarcodeShopifyPersistedState | null> => {
  const storedState = await getGenericData(BARCODE_SHOPIFY_STATE_KEY);
  if (!storedState || typeof storedState !== 'object') return null;

  const candidate = storedState as Partial<BarcodeShopifyPersistedState>;
  if (
    !isBarcodeCsvResult(candidate.result)
    || !isBarcodeBrand(candidate.brand)
    || typeof candidate.syncedAt !== 'string'
    || !Number.isFinite(Date.parse(candidate.syncedAt))
  ) {
    return null;
  }

  return {
    result: candidate.result,
    brand: candidate.brand,
    syncedAt: candidate.syncedAt,
  };
};

export const saveBarcodeShopifyState = async (state: BarcodeShopifyPersistedState) => {
  await storeGenericData(BARCODE_SHOPIFY_STATE_KEY, state);
};

export const clearBarcodeShopifyState = async () => {
  await clearGenericData(BARCODE_SHOPIFY_STATE_KEY);
};
