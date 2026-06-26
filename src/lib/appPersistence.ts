import { TimelineType } from '@/types/common';
import { ParsedData } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';
import { ProcessedSellerboardStock } from '@/types/processors';
import { RetaggingDecisionResult } from '@/types/retagging';
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
