import { TimelineType } from '@/types/common';
import { ParsedData } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';
import { ProcessedSellerboardStock } from '@/types/processors';
import { getStoredData, storeData, StoredData } from './indexedDB';

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
