import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { FileUploadGrid } from "./FileUploadGrid";
import { FileUploadSection } from "./FileUploadSection";
import { StockTable } from "./StockTable";
import { RecommendationsTable } from "./RecommendationsTable";
import { useFileProcessing } from "@/hooks/useFileProcessing";
import { Tabs } from "./ui/tabs";
import { RotateCcw } from "lucide-react";
import { LoadingOverlay } from "./ui/loading-overlay";
import { TimelineType } from "@/types/common";
import { FBAStockTable } from "./FBAStockTable";
import { parseFile } from "@/utils/fileParser";
import { processSellerboardStock } from "@/utils/processors/sellerboardStockProcessor";
import { calculateStockRecommendations } from "@/utils/calculators/stockRecommendations";
import { ProcessedSellerboardStock } from "@/types/processors";
import { ArticleRecommendation } from "@/types/sales";
import { storeFiles, getFiles, getStoredData, clearFiles, storeGenericData, getGenericData, clearGenericData, storeBlacklist, getBlacklist } from '@/lib/indexedDB';
import {
  clearRetaggingResult,
  clearZfsSettings,
  clearFbaTablesData,
  loadRetaggingState,
  loadFbaSettings,
  loadZfsSettings,
  resetFbaData,
  saveRetaggingShopifyStockFile,
  saveFbaProcessedData,
  saveZfsCoverageDays,
  saveZfsSafetyFactor,
  saveZfsTrendFactor
} from '@/lib/appPersistence';
import { FileState, ParsedData } from "@/types/stock";
import RelativeStockTable from "./RelativeStockTable";
import BlacklistModal from "./BlacklistModal";
import { RetaggingDecisionTool } from "./RetaggingDecisionTool";

interface TabContentProps {
  files: any;
  parsedData: any;
  recommendations: any;
  timeline: TimelineType;
  error: string | null;
  isProcessing: boolean;
  handleFileChange: any;
  handleRemoveFile: any;
  processFiles: any;
  setTimeline: any;
  resetFiles: any;
  clearTables: any;
  setError: any;
  showTabs: boolean;
  tabsRef: any;
  onOpenBlacklist: () => void;
  blacklistCount: number;
  zfsRecommendationSettingsLoaded: boolean;
  zfsCoverageDays: number;
  zfsSafetyFactor: number;
  zfsTrendFactor: number;
  onZfsCoverageDaysChange: (days: number) => void;
  onZfsSafetyFactorChange: (value: number) => void;
  onZfsTrendFactorChange: (value: number) => void;
}

const ZFSContent: React.FC<TabContentProps> = ({
  files,
  parsedData,
  recommendations,
  timeline,
  error,
  isProcessing,
  handleFileChange,
  handleRemoveFile,
  processFiles,
  setTimeline,
  resetFiles,
  clearTables,
  setError,
  showTabs,
  tabsRef,
  onOpenBlacklist,
  blacklistCount,
  zfsRecommendationSettingsLoaded,
  zfsCoverageDays,
  zfsSafetyFactor,
  zfsTrendFactor,
  onZfsCoverageDaysChange,
  onZfsSafetyFactorChange,
  onZfsTrendFactorChange,
}) => {
  const hasAnyZfsInput =
    Boolean(files.internal) ||
    Boolean(files.skuEanMapper) ||
    Boolean(files.zfsSales) ||
    (Array.isArray(files.zfs) && files.zfs.length > 0) ||
    (Array.isArray(files.zfsShipments) && files.zfsShipments.length > 0) ||
    (Array.isArray(files.zfsShipmentsReceived) && files.zfsShipmentsReceived.length > 0);
  const isTimelineMissing = Boolean(files.zfsSales) && timeline === "none";
  const isProcessDisabled = isProcessing || !hasAnyZfsInput || isTimelineMissing;
  const processButtonLabel = !hasAnyZfsInput
    ? "Upload Files"
    : isTimelineMissing
      ? "Select Timeline"
      : "Process Files";

  const tabs = [
    {
      id: "stock",
      label: "ZFS Stock Overview",
      content:
        parsedData.integrated.length > 0 ? (
          <StockTable data={parsedData.integrated} />
        ) : null,
    },
    {
      id: "recommendations",
      label: "ZFS Stock Recommendation",
      content:
        zfsRecommendationSettingsLoaded && recommendations.length > 0 ? (
          <RecommendationsTable
            recommendations={recommendations}
            stockData={parsedData.integrated}
            timeline={timeline}
            coverageDays={zfsCoverageDays}
            safetyFactor={zfsSafetyFactor}
            trendFactor={zfsTrendFactor}
            onCoverageDaysChange={onZfsCoverageDaysChange}
            onSafetyFactorChange={onZfsSafetyFactorChange}
            onTrendFactorChange={onZfsTrendFactorChange}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      <FileUploadGrid
        files={files}
        onFileChange={handleFileChange}
        onFileRemove={handleRemoveFile}
        timeline={timeline}
        onTimelineChange={setTimeline}
      />

      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          <button
            onClick={resetFiles}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Files
          </button>
          <button
            onClick={onOpenBlacklist}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
          >
            Manage Blacklist
            {blacklistCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-black px-2 py-0.5 text-sm font-semibold text-white min-w-[20px]">
                {blacklistCount}
              </span>
            )}
          </button>
          {showTabs && (
            <button
              onClick={clearTables}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-red-700 bg-white border-2 border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all duration-200"
            >
              Clear Tables
            </button>
          )}
        </div>
        <button
          onClick={() => {
            if (!hasAnyZfsInput) {
              setError("Please upload at least one ZFS file before processing");
              return;
            }
            if (files.zfsSales && timeline === "none") {
              setError("Please select a timeline for the sales file");
              return;
            }
            processFiles(timeline);
          }}
          disabled={isProcessDisabled}
          title={
            !hasAnyZfsInput
              ? "Upload at least one file before processing"
              : isTimelineMissing
                ? "Select a timeline for the ZFS Sales file"
                : "Process uploaded ZFS files"
          }
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black disabled:hover:shadow-md"
        >
          {processButtonLabel}
        </button>
      </div>

      <div ref={tabsRef} id="results-section">
        {showTabs && (
          <Tabs tabs={tabs} id="zfs-tabs" />
        )}
      </div>
    </div>
  );
};

interface FBAContentProps {
  fbaFiles: {
    sellerboardExport: File | null;
    sellerboardReturns: File | null;
  };
  setFbaFiles: React.Dispatch<React.SetStateAction<{
    sellerboardExport: File | null;
    sellerboardReturns: File | null;
  }>>;
  fbaData: {
    sellerboardStock: ProcessedSellerboardStock[];
  };
  setFbaData: React.Dispatch<React.SetStateAction<{
    sellerboardStock: ProcessedSellerboardStock[];
  }>>;
  resetFiles: () => void;
  clearTables: () => void;
  blacklist: string[];
  onOpenBlacklist: () => void;
}

const FBAContent: React.FC<FBAContentProps> = ({
  fbaFiles,
  setFbaFiles,
  fbaData,
  setFbaData,
  resetFiles,
  clearTables,
  blacklist,
  onOpenBlacklist
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const blacklistSet = useMemo(() => new Set(blacklist.map((sku) => sku.trim().toUpperCase())), [blacklist]);
  const filteredSellerboardStock = useMemo(() => (
    fbaData.sellerboardStock.filter((item) => !blacklistSet.has((item.SKU || '').trim().toUpperCase()))
  ), [fbaData.sellerboardStock, blacklistSet]);

  // Update showTabs when fbaData changes
  const showTabs = filteredSellerboardStock.length > 0;

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: string
  ) => {
    const newFiles = event.target.files;
    if (!newFiles) return;

    const updatedFiles = {
      ...fbaFiles,
      [type]: newFiles[0],
    };

    setFbaFiles(updatedFiles);

    // Store in IndexedDB
    try {
      // Create a FileState object with fba store type
      const fileState: FileState = {
        internal: null,
        fba: null,
        zfs: [],
        zfsShipments: [],
        zfsShipmentsReceived: [],
        skuEanMapper: null,
        zfsSales: null,
        sellerboardExport: updatedFiles.sellerboardExport,
        sellerboardReturns: updatedFiles.sellerboardReturns,
        fbaSales: null,
        storeType: 'fba'
      };

      await storeFiles(fileState);
    } catch (err) {
      console.error("Error storing files:", err);
    }
  };

  const handleRemoveFile = async (_fileName: string, type: string) => {
    const updatedFiles = {
      ...fbaFiles,
      [type]: null,
    };

    setFbaFiles(updatedFiles);

    // Update in IndexedDB
    try {
      const fileState: FileState = {
        internal: null,
        fba: null,
        zfs: [],
        zfsShipments: [],
        zfsShipmentsReceived: [],
        skuEanMapper: null,
        zfsSales: null,
        sellerboardExport: updatedFiles.sellerboardExport,
        sellerboardReturns: updatedFiles.sellerboardReturns,
        fbaSales: null,
        storeType: 'fba'
      };

      await storeFiles(fileState);
    } catch (err) {
      console.error("Error updating files:", err);
    }
  };

  const processFiles = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      setProcessingStatus("Processing Sellerboard export...");

      // Process Sellerboard export
      if (fbaFiles.sellerboardExport) {
        const sellerboardData = await parseFile(fbaFiles.sellerboardExport, (progress) => {
          setProcessingStatus(`Processing Sellerboard export (${Math.round(progress)}%)...`);
        });

        // Process Sellerboard Sales + Returns if available
        let salesReturnsData = null;
        if (fbaFiles.sellerboardReturns) {
          setProcessingStatus("Processing Sellerboard Sales + Returns...");
          salesReturnsData = await parseFile(fbaFiles.sellerboardReturns, (progress) => {
            setProcessingStatus(`Processing Sellerboard Sales + Returns (${Math.round(progress)}%)...`);
          });

          // Log sellerboard returns data for debugging
          console.log("Parsed sellerboard returns data:", salesReturnsData);

          // Log specific fields for debugging sales and returns values
          if (salesReturnsData && salesReturnsData.length > 0) {
            // Find an entry with SKU for better logging
            const sampleItem = salesReturnsData.find(item => item.SKU) || salesReturnsData[0];
            console.log("Sample returns data fields:", {
              SKU: sampleItem.SKU,
              // Sales fields
              Totals: sampleItem.Totals,
              EMPTY_22: sampleItem.__EMPTY_22,
              undefined_22: sampleItem.undefined_22,
              // Keys that might contain sales data
              allKeys: Object.keys(sampleItem).filter(key =>
                key.includes('22') || key.includes('Totals') || key.includes('Sales')
              ),
              // Return rate fields
              EMPTY_24: sampleItem.__EMPTY_24,
              undefined_24: sampleItem.undefined_24,
              PercentRefunds: sampleItem["% Refunds"]
            });
          }
        }

        const normalizeSkuValue = (value: any) =>
          typeof value === 'string' ? value.trim().toUpperCase() : '';
        const filteredSellerboardData = Array.isArray(sellerboardData)
          ? sellerboardData.filter((row: Record<string, any>) => {
              const sku = normalizeSkuValue(row?.SKU ?? row?.sku);
              return !blacklistSet.has(sku);
            })
          : [];
        const filteredSalesReturnsData = Array.isArray(salesReturnsData)
          ? salesReturnsData.filter((row: Record<string, any>) => {
              const sku = normalizeSkuValue(row?.SKU ?? row?.sku);
              return !blacklistSet.has(sku);
            })
          : null;

        const {
          coverageDays,
          safetyFactor,
          trendFactor,
        } = await loadFbaSettings();

        const processedSellerboardData = processSellerboardStock(filteredSellerboardData, filteredSalesReturnsData, coverageDays, safetyFactor, trendFactor)
          .filter((item) => !blacklistSet.has((item.SKU || '').trim().toUpperCase()));

        // Update local state
        setFbaData({
          sellerboardStock: processedSellerboardData,
        });

        // Store in IndexedDB with 'fba' storeType
        try {
          // Create a ParsedData object
          const parsedDataObj: ParsedData = {
            internal: [],
            zfs: [],
            zfsShipments: [],
            zfsShipmentsReceived: [],
            skuEanMapper: [],
            zfsSales: [],
            integrated: [],
            sellerboardStock: processedSellerboardData,
          };

          await saveFbaProcessedData({
            parsedData: parsedDataObj,
            coverageDays,
            rawReturnsData: filteredSalesReturnsData,
            blacklist: Array.from(blacklistSet)
          });
        } catch (err) {
          console.error("Error storing parsed data:", err);
        }

        // Scroll to results after processing
        setTimeout(() => {
          tabsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 300);
      }

      setProcessingStatus("");
      setIsProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing files");
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const tabs = [
    {
      id: "stock",
      label: "FBA Stock Overview & Recommendation",
      content:
        filteredSellerboardStock.length > 0 ? (
          <FBAStockTable data={filteredSellerboardStock} />
        ) : null,
    },
    // Add more tabs here in the future like recommendations if needed
  ];

  return (
    <>
      <LoadingOverlay isLoading={isProcessing} message={processingStatus} />
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 p-4 rounded-md border border-red-100">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileUploadSection
            title="Sellerboard Export"
            onChange={(e) => handleFileChange(e, "sellerboardExport")}
            onRemove={(name) => handleRemoveFile(name, "sellerboardExport")}
            files={fbaFiles.sellerboardExport ? [fbaFiles.sellerboardExport] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
          />
          <FileUploadSection
            title="Sellerboard Sales + Returns"
            onChange={(e) => handleFileChange(e, "sellerboardReturns")}
            onRemove={(name) => handleRemoveFile(name, "sellerboardReturns")}
            files={fbaFiles.sellerboardReturns ? [fbaFiles.sellerboardReturns] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
          />
        </div>
        <div className="flex justify-between items-center">
          <div className="flex gap-3">
            <button
              onClick={resetFiles}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Files
            </button>
            <button
              onClick={onOpenBlacklist}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
            >
              Manage Blacklist
              {blacklist.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-black px-2 py-0.5 text-sm font-semibold text-white min-w-[20px]">
                  {blacklist.length}
                </span>
              )}
            </button>
            {showTabs && (
              <button
                onClick={clearTables}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-red-700 bg-white border-2 border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all duration-200"
              >
                Clear Tables
              </button>
            )}
          </div>
          <button
            onClick={() => processFiles()}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-all duration-200 shadow-md hover:shadow-lg"
          >
            Process Files
          </button>
        </div>

        <div ref={tabsRef} id="fba-results-section">
          {showTabs && <Tabs tabs={tabs} id="fba-tabs" />}
        </div>
      </div>
    </>
  );
};

// Custom hook to handle scrolling logic
function useScrollToResults() {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);

  useEffect(() => {
    if (!shouldScroll || !tabsRef.current || !hasProcessed) return;

    setTimeout(() => {
      tabsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setShouldScroll(false);
    }, 300);
  }, [shouldScroll, hasProcessed]);

  return { tabsRef, setShouldScroll, setHasProcessed };
}

// Define keys for persistence
const RELATIVE_STOCK_FILE_KEY = 'relativeStockFile';
const RELATIVE_STOCK_TABLE_KEY = 'relativeStockTable';
const LEGACY_SHOPIFY_SYNC_META_KEY = 'shopifySyncMeta';
const ZFS_SHOPIFY_SYNC_META_KEY = 'zfsShopifySyncMeta';
const RETAGGING_SHOPIFY_SYNC_META_KEY = 'retaggingShopifySyncMeta';

type ShopifySyncMeta = {
  lastSyncedAt: string;
  internalCount: number;
  mapperCount: number;
  locationName: string;
};

const readShopifySyncMeta = (...keys: string[]): ShopifySyncMeta | null => {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as ShopifySyncMeta;
    } catch {
      /* ignore malformed persisted metadata */
    }
  }
  return null;
};

function timeAgo(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

const IntegratedStockParser: React.FC = () => {
  const location = useLocation();
  const onZfsRoute = location.pathname === '/zfs' || location.pathname === '/';
  const onRetaggingRoute = location.pathname === '/retagging';
  const canSyncShopify = onZfsRoute || onRetaggingRoute;
  const { tabsRef, setShouldScroll, setHasProcessed } = useScrollToResults();
  const [showZfsBlacklistModal, setShowZfsBlacklistModal] = useState(false);
  const [showFbaBlacklistModal, setShowFbaBlacklistModal] = useState(false);

  // Add state for export overlay
  const [showExportOverlay, setShowExportOverlay] = useState(false);
  const [exportFile, setExportFile] = useState<File | null>(null);
  // State for overlay content
  const [relativeStockData, setRelativeStockData] = useState<{
     articleNumber: string;
     warehouse?: string;
     binLocation?: string;
     isDefaultBinLocation?: boolean;
     physicalStock: number;
  }[]>([]);
  const [processingExport, setProcessingExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isLoadingPersistedData, setIsLoadingPersistedData] = useState(true); // Loading state

  // Add state for FBA tab
  const [fbaFiles, setFbaFiles] = useState<{
    sellerboardExport: File | null;
    sellerboardReturns: File | null;
  }>({
    sellerboardExport: null,
    sellerboardReturns: null,
  });

  const [fbaData, setFbaData] = useState<{
    sellerboardStock: ProcessedSellerboardStock[];
  }>({
    sellerboardStock: [],
  });
  const [retaggingShopifyStockFile, setRetaggingShopifyStockFile] = useState<File | null>(null);
  const [isRetaggingShopifyStockLoading, setIsRetaggingShopifyStockLoading] = useState(true);
  const [retaggingShopifySyncError, setRetaggingShopifySyncError] = useState<string | null>(null);
  const [fbaBlacklist, setFbaBlacklist] = useState<string[]>([]);
  const fbaBlacklistRef = useRef<string[]>([]);
  useEffect(() => {
    fbaBlacklistRef.current = fbaBlacklist;
  }, [fbaBlacklist]);

  const addFbaToBlacklist = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    setFbaBlacklist((prev) => {
      if (prev.includes(normalized)) {
        return prev;
      }
      const updated = [...prev, normalized];
      storeBlacklist(updated, 'fba').catch(() => {});
      return updated;
    });
  };

  const removeFbaFromBlacklist = (value: string) => {
    const normalized = value.trim().toUpperCase();
    setFbaBlacklist((prev) => {
      const updated = prev.filter((sku) => sku !== normalized);
      storeBlacklist(updated, 'fba').catch(() => {});
      return updated;
    });
  };

  const {
    files,
    parsedData,
    recommendations,
    timeline,
    error,
    isProcessing,
    processingStatus,
    handleFileChange,
    handleRemoveFile,
    setFile,
    processFiles,
    setTimeline,
    resetFiles,
    clearTables,
    setError,
    blacklist: zfsBlacklist,
    addToBlacklist: addZfsToBlacklist,
    removeFromBlacklist: removeZfsFromBlacklist,
  } = useFileProcessing();

  const [zfsRecommendationSettingsLoaded, setZfsRecommendationSettingsLoaded] = useState(false);
  const [zfsCoverageDays, setZfsCoverageDays] = useState(14);
  const [zfsSafetyFactor, setZfsSafetyFactor] = useState(0);
  const [zfsTrendFactor, setZfsTrendFactor] = useState(0);

  const [isShopifySyncing, setIsShopifySyncing] = useState(false);
  const [zfsShopifySyncMeta, setZfsShopifySyncMeta] = useState<ShopifySyncMeta | null>(() =>
    readShopifySyncMeta(ZFS_SHOPIFY_SYNC_META_KEY, LEGACY_SHOPIFY_SYNC_META_KEY)
  );
  const [retaggingShopifySyncMeta, setRetaggingShopifySyncMeta] = useState<ShopifySyncMeta | null>(() =>
    readShopifySyncMeta(RETAGGING_SHOPIFY_SYNC_META_KEY)
  );
  const activeShopifySyncMeta = onRetaggingRoute ? retaggingShopifySyncMeta : zfsShopifySyncMeta;

  const clearZfsShopifySyncMeta = () => {
    setZfsShopifySyncMeta(null);
    localStorage.removeItem(ZFS_SHOPIFY_SYNC_META_KEY);
    localStorage.removeItem(LEGACY_SHOPIFY_SYNC_META_KEY);
  };

  const clearRetaggingShopifySyncMeta = () => {
    setRetaggingShopifySyncMeta(null);
    localStorage.removeItem(RETAGGING_SHOPIFY_SYNC_META_KEY);
  };

  const handleShopifySync = async () => {
    setIsShopifySyncing(true);
    if (onRetaggingRoute) {
      setRetaggingShopifySyncError(null);
    } else {
      setError(null);
    }
    try {
      const res = await fetch('/api/shopify/sync');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Sync failed (${res.status})`);
      }
      const data = await res.json();

      const csvEscape = (val: unknown) => {
        const s = String(val ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const internalCsv = ['SKU,Title,Lager']
        .concat(
          (data.internal as Array<{ SKU: string; Title: string; Lager: number }>).map(
            (r) => `${csvEscape(r.SKU)},${csvEscape(r.Title)},${r.Lager}`
          )
        )
        .join('\n');

      const mapperCsv = ['SKU,EAN']
        .concat(
          (data.skuEanMapper as Array<{ SKU: string; EAN: string }>).map(
            (r) => `${csvEscape(r.SKU)},${csvEscape(r.EAN)}`
          )
        )
        .join('\n');

      const internalFile = new File([internalCsv], 'shopify-internal-stocks.csv', { type: 'text/csv' });
      const mapperFile = new File([mapperCsv], 'shopify-sku-ean.csv', { type: 'text/csv' });

      const meta: ShopifySyncMeta = {
        lastSyncedAt: typeof data.syncedAt === 'string' ? data.syncedAt : new Date().toISOString(),
        internalCount: data.counts?.internal ?? (Array.isArray(data.internal) ? data.internal.length : 0),
        mapperCount: data.counts?.skuEanMapper ?? (Array.isArray(data.skuEanMapper) ? data.skuEanMapper.length : 0),
        locationName: typeof data.locationName === 'string' ? data.locationName : 'Lager',
      };

      if (onRetaggingRoute) {
        setRetaggingShopifyStockFile(internalFile);
        await saveRetaggingShopifyStockFile(internalFile);
        await clearRetaggingResult();
        setRetaggingShopifySyncMeta(meta);
        try {
          localStorage.setItem(RETAGGING_SHOPIFY_SYNC_META_KEY, JSON.stringify(meta));
        } catch {
          /* ignore quota errors */
        }
      } else {
        setFile('internal', internalFile);
        setFile('skuEanMapper', mapperFile);
        setZfsShopifySyncMeta(meta);
        try {
          localStorage.setItem(ZFS_SHOPIFY_SYNC_META_KEY, JSON.stringify(meta));
        } catch {
          /* ignore quota errors */
        }
      }
    } catch (err) {
      if (onRetaggingRoute) {
        setRetaggingShopifySyncError(err instanceof Error ? err.message : 'Shopify sync failed');
      } else {
        setError(err instanceof Error ? err.message : 'Shopify sync failed');
      }
    } finally {
      setIsShopifySyncing(false);
    }
  };

  const zfsBlacklistSet = useMemo(() => new Set(zfsBlacklist.map((sku) => sku.trim().toUpperCase())), [zfsBlacklist]);

  const filteredParsedData = useMemo(() => ({
    ...parsedData,
    integrated: parsedData.integrated.filter((item) => {
      const sku = typeof item?.SKU === 'string' ? item.SKU.trim().toUpperCase() : '';
      const ean = typeof item?.EAN === 'string' ? item.EAN.trim().toUpperCase() : '';
      return !zfsBlacklistSet.has(sku) && !zfsBlacklistSet.has(ean);
    }),
    zfs: parsedData.zfs.filter((item: any) => {
      const ean = typeof item?.EAN === 'string' ? item.EAN.trim().toUpperCase() : (typeof item?.ean === 'string' ? item.ean.trim().toUpperCase() : '');
      return !zfsBlacklistSet.has(ean);
    }),
    zfsShipments: parsedData.zfsShipments.filter((item: any) => {
      const ean = typeof item?.EAN === 'string' ? item.EAN.trim().toUpperCase() : '';
      return !zfsBlacklistSet.has(ean);
    }),
    zfsShipmentsReceived: parsedData.zfsShipmentsReceived.filter((item: any) => {
      const ean = typeof item?.EAN === 'string' ? item.EAN.trim().toUpperCase() : '';
      return !zfsBlacklistSet.has(ean);
    }),
    skuEanMapper: parsedData.skuEanMapper.filter((item: any) => {
      const sku = typeof item?.SKU === 'string' ? item.SKU.trim().toUpperCase() : '';
      const ean = typeof item?.EAN === 'string' ? item.EAN.trim().toUpperCase() : '';
      return !zfsBlacklistSet.has(sku) && !zfsBlacklistSet.has(ean);
    }),
    zfsSales: parsedData.zfsSales.filter((item: any) => {
      const ean = typeof item?.EAN === 'string' ? item.EAN.trim().toUpperCase() : '';
      return !zfsBlacklistSet.has(ean);
    })
  }), [parsedData, zfsBlacklistSet]);

  const filteredRecommendations = useMemo(
    () => recommendations.filter((item) => {
      const sku = typeof item?.articleId === 'string' ? item.articleId.trim().toUpperCase() : '';
      const ean = typeof item?.ean === 'string' ? item.ean.trim().toUpperCase() : '';
      return !zfsBlacklistSet.has(sku) && !zfsBlacklistSet.has(ean);
    }),
    [recommendations, zfsBlacklistSet]
  );

  useEffect(() => {
    let cancelled = false;

    const loadZfsRecommendationSettings = async () => {
      try {
        const settings = await loadZfsSettings();
        if (!cancelled) {
          setZfsCoverageDays(settings.coverageDays);
          setZfsSafetyFactor(settings.safetyFactor);
          setZfsTrendFactor(settings.trendFactor);
        }
      } catch (err) {
        console.error("Error loading ZFS recommendation settings:", err);
      } finally {
        if (!cancelled) {
          setZfsRecommendationSettingsLoaded(true);
        }
      }
    };

    loadZfsRecommendationSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (zfsRecommendationSettingsLoaded) {
      saveZfsSafetyFactor(zfsSafetyFactor);
    }
  }, [zfsSafetyFactor, zfsRecommendationSettingsLoaded]);

  useEffect(() => {
    if (zfsRecommendationSettingsLoaded) {
      saveZfsTrendFactor(zfsTrendFactor);
    }
  }, [zfsTrendFactor, zfsRecommendationSettingsLoaded]);

  const persistZfsCoverageDays = useCallback(async (days: number) => {
    try {
      await saveZfsCoverageDays(days);
    } catch (err) {
      console.error("Error saving ZFS coverage days:", err);
    }
  }, []);

  const handleZfsCoverageDaysChange = useCallback((days: number) => {
    setZfsCoverageDays(days);
    void persistZfsCoverageDays(days);
  }, [persistZfsCoverageDays]);

  const handleZfsSafetyFactorChange = useCallback((value: number) => {
    setZfsSafetyFactor(value);
  }, []);

  const handleZfsTrendFactorChange = useCallback((value: number) => {
    setZfsTrendFactor(value);
  }, []);

  const zfsRecommendationsForDisplay = useMemo<ArticleRecommendation[]>(() => {
    if (!zfsRecommendationSettingsLoaded || filteredRecommendations.length === 0) {
      return [];
    }

    if (timeline === 'none') {
      return filteredRecommendations;
    }

    try {
      return calculateStockRecommendations(
        filteredParsedData.zfsSales,
        filteredParsedData.integrated,
        Math.max(Number(zfsCoverageDays), 1),
        timeline,
        zfsSafetyFactor,
        zfsTrendFactor
      );
    } catch (err) {
      console.error("Error recalculating ZFS recommendations:", err);
      return filteredRecommendations;
    }
  }, [
    zfsRecommendationSettingsLoaded,
    filteredRecommendations,
    filteredParsedData.zfsSales,
    filteredParsedData.integrated,
    timeline,
    zfsCoverageDays,
    zfsSafetyFactor,
    zfsTrendFactor,
  ]);

  const showTabs =
    filteredParsedData.integrated.length > 0 || filteredRecommendations.length > 0;

  // Load data for both tabs on component mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        // Load FBA data with explicit storeType
        const savedFbaFiles = await getFiles('fba');
        if (savedFbaFiles) {
          setFbaFiles({
            sellerboardExport: savedFbaFiles.sellerboardExport,
            sellerboardReturns: savedFbaFiles.sellerboardReturns,
          });
        }

        const savedFbaData = await getStoredData('fba');
        if (savedFbaData?.parsedData) {
          if (savedFbaData.parsedData.sellerboardStock?.length > 0) {
            setFbaData({
              sellerboardStock: savedFbaData.parsedData.sellerboardStock,
            });
          }
          if (Array.isArray(savedFbaData.blacklist)) {
            const normalized = savedFbaData.blacklist.map((sku) => sku.trim().toUpperCase()).filter(Boolean);
            setFbaBlacklist(normalized);
          }
        } else {
          const storedBlacklist = await getBlacklist('fba');
          if (storedBlacklist.length > 0) {
            setFbaBlacklist(storedBlacklist.map((sku) => sku.trim().toUpperCase()).filter(Boolean));
          }
        }
      } catch (err) {
        console.error("Error loading saved FBA data:", err);
      }
    };

    loadSavedData();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRetaggingShopifyStock = async () => {
      try {
        const savedRetaggingState = await loadRetaggingState();
        if (!cancelled) {
          setRetaggingShopifyStockFile(savedRetaggingState.shopifyStockFile);
        }
      } catch (err) {
        console.error("Error loading Retagging Shopify stock file:", err);
      } finally {
        if (!cancelled) {
          setIsRetaggingShopifyStockLoading(false);
        }
      }
    };

    loadRetaggingShopifyStock();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetaggingShopifyStockFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRetaggingShopifyStockFile(file);
    setRetaggingShopifySyncError(null);
    clearRetaggingShopifySyncMeta();
    try {
      await saveRetaggingShopifyStockFile(file);
      await clearRetaggingResult();
    } catch (err) {
      console.error("Error saving Retagging Shopify stock file:", err);
      setRetaggingShopifySyncError("Could not save Retagging Shopify stock file");
    }
  };

  const handleRetaggingShopifyStockFileRemove = async () => {
    setRetaggingShopifyStockFile(null);
    setRetaggingShopifySyncError(null);
    clearRetaggingShopifySyncMeta();
    try {
      await saveRetaggingShopifyStockFile(null);
      await clearRetaggingResult();
    } catch (err) {
      console.error("Error removing Retagging Shopify stock file:", err);
      setRetaggingShopifySyncError("Could not remove Retagging Shopify stock file");
    }
  };

  const handleZfsFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: keyof FileState
  ) => {
    if (type === "internal" || type === "skuEanMapper") {
      clearZfsShopifySyncMeta();
    }
    handleFileChange(event, type);
  };

  const handleZfsRemoveFile = (fileName: string, type: keyof FileState) => {
    if (type === "internal" || type === "skuEanMapper") {
      clearZfsShopifySyncMeta();
    }
    handleRemoveFile(fileName, type);
  };

  useEffect(() => {
    if (isProcessing) {
      setShouldScroll(true);
      setHasProcessed(false);
    } else if (showTabs) {
      setHasProcessed(true);
    }
  }, [isProcessing, showTabs, setShouldScroll, setHasProcessed]);

  // Update resetFiles to only clear ZFS data
  const resetZFSFiles = async () => {
    await resetFiles();
    setZfsCoverageDays(14);
    setZfsSafetyFactor(0);
    setZfsTrendFactor(0);
    clearZfsShopifySyncMeta();
    clearZfsSettings();
  };

  // Update FBA reset to only clear FBA data
  const resetFBAFiles = async () => {
    // Clear FBA state
    setFbaFiles({
      sellerboardExport: null,
      sellerboardReturns: null,
    });
    setFbaData({
      sellerboardStock: [],
    });

    // Clear only FBA data from IndexedDB
    try {
      await clearFiles('fba');

      await resetFbaData(Array.from(fbaBlacklistRef.current));

      console.log("FBA data cleared from IndexedDB");
    } catch (err) {
      console.error("Error clearing FBA data:", err);
    }
  };

  // Function to clear only FBA tables while preserving uploaded files
  const clearFBATables = async () => {
    // Clear FBA state (only tables data)
    setFbaData({
      sellerboardStock: [],
    });

    // Clear only FBA data from storage while preserving files
    try {
      await clearFbaTablesData(Array.from(fbaBlacklistRef.current));
      console.log("FBA tables cleared from IndexedDB");
    } catch (err) {
      console.error("Error clearing FBA tables:", err);
    }
  };

  // Load persisted data on mount - Update type check
  useEffect(() => {
    const loadPersistedExportData = async () => {
      setIsLoadingPersistedData(true);
      try {
        const storedFile = await getGenericData(RELATIVE_STOCK_FILE_KEY);
        if (storedFile instanceof File) {
          console.log("Loaded persisted export file:", storedFile.name);
          setExportFile(storedFile);
        }

        const storedTableData = await getGenericData(RELATIVE_STOCK_TABLE_KEY);
        // Update check for new structure
        if (
          Array.isArray(storedTableData) &&
          storedTableData.every(
            (item) =>
              item &&
              typeof item.articleNumber === 'string' &&
              typeof item.physicalStock === 'number' &&
              // Check optional fields exist or are undefined/null (adjust if they become mandatory)
              (item.warehouse === undefined || item.warehouse === null || typeof item.warehouse === 'string') &&
              (item.binLocation === undefined || item.binLocation === null || typeof item.binLocation === 'string') &&
              (item.isDefaultBinLocation === undefined || item.isDefaultBinLocation === null || typeof item.isDefaultBinLocation === 'boolean')
          )
        ) {
          console.log(`Loaded persisted relative stock table data with ${storedTableData.length} items.`);
          // Cast to the new type
          setRelativeStockData(storedTableData as {
             articleNumber: string;
             warehouse?: string;
             binLocation?: string;
             isDefaultBinLocation?: boolean;
             physicalStock: number;
          }[]);
        } else if (storedTableData) {
          console.warn("Persisted table data has incorrect structure. Clearing.");
          await clearGenericData(RELATIVE_STOCK_TABLE_KEY);
        }
      } catch (err) {
         console.error("Error loading persisted relative stock data:", err);
         await clearGenericData(RELATIVE_STOCK_FILE_KEY);
         await clearGenericData(RELATIVE_STOCK_TABLE_KEY);
      } finally {
        setIsLoadingPersistedData(false);
      }
    };
    loadPersistedExportData();
  }, []);

  // Handle file selection for export using generic functions
  const handleExportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setExportFile(file);
      setRelativeStockData([]);
      setExportError(null);
      try {
        await storeGenericData(RELATIVE_STOCK_FILE_KEY, file);
        console.log("Stored export file in IndexedDB");
        await clearGenericData(RELATIVE_STOCK_TABLE_KEY);
      } catch (err) {
        console.error("Error storing export file:", err);
      }
    }
  };

  // Handle file removal for export using generic functions
  const handleExportFileRemove = async () => {
    setExportFile(null);
    setRelativeStockData([]);
    setExportError(null);
    try {
      await clearGenericData(RELATIVE_STOCK_FILE_KEY);
      await clearGenericData(RELATIVE_STOCK_TABLE_KEY);
      console.log("Cleared persisted relative stock file and table data.");
    } catch (err) {
      console.error("Error clearing persisted relative stock data:", err);
    }
  };

  // Process the export file - Apply hardcoded values
  const processExportFile = async () => {
    if (!exportFile) return;

    setProcessingExport(true);
    setExportError(null);
    setRelativeStockData([]);

    try {
      const parsedData = await parseFile(exportFile, (progress) => {
        // Optional: update status if needed, though it might be quick
        console.log(`Parsing progress: ${progress}%`);
      });

      if (!parsedData || parsedData.length === 0) {
        throw new Error("File is empty or could not be parsed.");
      }

      const headers = Object.keys(parsedData[0]);

      // --- Define expected column headers (Only required ones now) ---
      const expectedHeaders = {
          sku: ["Partner Variant Size", "SKU"],
          stock: ["Recommended Stock", "Recommended Quantity"],
      };

      // --- Find actual column names used in the file ---
      const findHeader = (possibleNames: string[]): string | null => {
          for (const name of possibleNames) {
              if (headers.includes(name)) return name;
          }
          return null;
      };

      const skuColumn = findHeader(expectedHeaders.sku);
      const stockColumn = findHeader(expectedHeaders.stock);
      // No longer need to find warehouse, binLocation, isDefault columns

      // --- Validate required columns ---
      if (!skuColumn || !stockColumn) {
           const missing = [!skuColumn ? "SKU/Partner Variant Size" : null, !stockColumn ? "Recommended Stock/Quantity" : null].filter(Boolean).join(' and ');
           throw new Error(`Required columns (${missing}) not found in the file.`);
      }
      console.log("Found required columns:", { skuColumn, stockColumn });

      // --- Process rows, handling SET SKUs and aggregating ---
      const processedItems: {
        articleNumber: string;
        warehouse?: string;
        binLocation?: string;
        isDefaultBinLocation?: boolean;
        physicalStock: number;
      }[] = [];
      const baseSkuStock: Record<string, {
          warehouse?: string;
          binLocation?: string;
          isDefaultBinLocation?: boolean;
          physicalStock: number;
      }> = {};

      for (const row of parsedData) {
        const sku = row[skuColumn!];
        const stockVal = row[stockColumn!];

        if (typeof sku !== 'string' || sku.trim() === '') continue;
        const stockNum = Number(stockVal);
        if (isNaN(stockNum)) continue;

        const trimmedSku = sku.trim();
        const warehouse = "HL"; // Always HL
        const binLocation = undefined; // Always empty
        const isDefaultBinLocation = false; // Always false

        if (trimmedSku.includes("-SET-")) {
          const parts = trimmedSku.split("-SET-");
          if (parts.length === 2) {
            const prefix = parts[0];
            const suffix = parts[1];

            // Generate Variant SKU
            const variantSku = `${prefix}-${suffix}`;
            processedItems.push({
              articleNumber: variantSku,
              warehouse,
              binLocation,
              isDefaultBinLocation,
              physicalStock: stockNum
            });

            // Generate Base SKU and aggregate stock
            const lastHyphenIndex = suffix.lastIndexOf('-');
            const baseSuffix = lastHyphenIndex !== -1 ? suffix.substring(0, lastHyphenIndex) : suffix;
            const baseSku = `${prefix}-${baseSuffix}`;

            if (!baseSkuStock[baseSku]) {
              baseSkuStock[baseSku] = {
                warehouse,
                binLocation,
                isDefaultBinLocation,
                physicalStock: 0
              };
            }
            baseSkuStock[baseSku].physicalStock += stockNum;

          } else {
            // Handle malformed SET SKU (e.g., multiple -SET-) - treat as standard for now
             processedItems.push({
               articleNumber: trimmedSku,
               warehouse,
               binLocation,
               isDefaultBinLocation,
               physicalStock: stockNum
             });
          }
        } else {
          // Standard SKU
          processedItems.push({
            articleNumber: trimmedSku,
            warehouse,
            binLocation,
            isDefaultBinLocation,
            physicalStock: stockNum
          });
        }
      }

      // Add aggregated Base SKUs to the list
      for (const baseSku in baseSkuStock) {
        processedItems.push({
          articleNumber: baseSku,
          ...baseSkuStock[baseSku]
        });
      }

      console.log(`Processed ${parsedData.length} rows into ${processedItems.length} items (incl. generated SKUs).`);


      if (processedItems.length === 0) {
        throw new Error("No valid data rows found after processing.");
      }

      // --- Sort by articleNumber ---
      processedItems.sort((a, b) => a.articleNumber.localeCompare(b.articleNumber));
      console.log("Sorted data (first 10):", processedItems.slice(0, 10));

      // Set state and persist
      setRelativeStockData(processedItems);
      await storeGenericData(RELATIVE_STOCK_TABLE_KEY, processedItems);
      console.log("Stored updated table data in IndexedDB");

    } catch (err) {
      console.error("Error processing export file:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during processing.";
      setExportError(errorMessage);
      setRelativeStockData([]);
      await clearGenericData(RELATIVE_STOCK_TABLE_KEY);
    } finally {
      setProcessingExport(false);
    }
  };

  // Function to close and reset the overlay state using generic functions
  const handleCloseOverlay = async () => {
    setShowExportOverlay(false);
    // Don't clear state immediately, just hide overlay.
    // Let the removal functions handle state and persistence if needed.
    // Clear persisted data on close
    try {
      // Clear the specific keys used by this feature
      await clearGenericData(RELATIVE_STOCK_FILE_KEY);
      await clearGenericData(RELATIVE_STOCK_TABLE_KEY);
      console.log("Cleared persisted relative stock data on overlay close.");
       // Also reset the state now that persistence is cleared
       setExportFile(null);
       setRelativeStockData([]);
       setProcessingExport(false);
       setExportError(null);
    } catch (err) {
      console.error("Error clearing persisted relative stock data on close:", err);
       // Still attempt to reset state even if clearing fails
       setExportFile(null);
       setRelativeStockData([]);
       setProcessingExport(false);
       setExportError(null);
    }
  };

  // Open Overlay function
  const handleOpenOverlay = () => {
    // Reset transient states
    setProcessingExport(false);
    setExportError(null);
    // Data (exportFile, relativeStockData) will be loaded from IndexedDB by useEffect
    setShowExportOverlay(true);
  };

  return (
    <>
      <LoadingOverlay isLoading={isProcessing || isLoadingPersistedData} message={processingStatus || (isLoadingPersistedData ? 'Loading data...' : '')} />
      <BlacklistModal
        isOpen={showZfsBlacklistModal}
        title="ZFS Blacklisted SKUs"
        items={zfsBlacklist}
        onClose={() => setShowZfsBlacklistModal(false)}
        onAdd={addZfsToBlacklist}
        onRemove={removeZfsFromBlacklist}
        description="Blacklisted SKUs or EANs are ignored during ZFS processing and hidden from all tables and exports."
      />
      <BlacklistModal
        isOpen={showFbaBlacklistModal}
        title="FBA Blacklisted SKUs"
        items={fbaBlacklist}
        onClose={() => setShowFbaBlacklistModal(false)}
        onAdd={addFbaToBlacklist}
        onRemove={removeFbaFromBlacklist}
        description="Blacklisted SKUs are removed from FBA calculations and will not appear in the recommendations."
      />

      {/* Modern Header */}
      <div className="bg-white py-6 mb-6 border-b border-gray-200">
        <div className="container mx-auto flex flex-col items-center gap-4 px-4 lg:px-10 xl:flex-row xl:justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/Blackskies-Logo.png"
              alt="Blackskies Logo"
              className="h-14 sm:h-16"
            />
            <h1 className="text-xl font-normal tracking-tight text-gray-900 sm:text-2xl">Inventory Management</h1>
          </div>

          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1 sm:gap-x-8" aria-label="Primary">
            <NavLink
              to="/zfs"
              className={({ isActive }) =>
                `px-2 py-3 text-base font-semibold transition-colors border-b-2 sm:px-3 ${
                  isActive
                    ? "text-gray-900 border-gray-900"
                    : "text-gray-500 hover:text-gray-900 border-transparent"
                }`
              }
            >
              ZFS
            </NavLink>
            <NavLink
              to="/fba"
              className={({ isActive }) =>
                `px-2 py-3 text-base font-semibold transition-colors border-b-2 sm:px-3 ${
                  isActive
                    ? "text-gray-900 border-gray-900"
                    : "text-gray-500 hover:text-gray-900 border-transparent"
                }`
              }
            >
              FBA
            </NavLink>
            <NavLink
              to="/retagging"
              className={({ isActive }) =>
                `px-2 py-3 text-base font-semibold transition-colors border-b-2 sm:px-3 ${
                  isActive
                    ? "text-gray-900 border-gray-900"
                    : "text-gray-500 hover:text-gray-900 border-transparent"
                }`
              }
            >
              Retagging
            </NavLink>
          </nav>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="relative">
              <button
                onClick={canSyncShopify ? handleShopifySync : undefined}
                disabled={isShopifySyncing || !canSyncShopify}
                className="inline-flex items-center gap-2 whitespace-nowrap bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-600 sm:px-5 sm:text-base"
                title={
                  canSyncShopify
                    ? "Pull Internal Stocks and SKU/EAN data directly from Shopify"
                    : "Shopify sync is used by ZFS and Retagging"
                }
              >
                {isShopifySyncing ? 'Syncing…' : 'Sync from Shopify'}
              </button>
              {canSyncShopify && activeShopifySyncMeta && (
                <span className="absolute right-0 top-full mt-1 text-sm text-gray-500 whitespace-nowrap">
                  Last synced {timeAgo(activeShopifySyncMeta.lastSyncedAt)}
                </span>
              )}
            </div>
            <button
              className="whitespace-nowrap rounded-full bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-gray-800 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
              onClick={handleOpenOverlay}
              title="Use this to export adjusted stock deductions for both ZFS & FBA shipments"
              disabled={isLoadingPersistedData}
            >
              Relative Stock Export
            </button>
          </div>
        </div>
      </div>

      {/* Relative Stock Export Overlay */}
      {showExportOverlay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-50 rounded-lg w-full max-w-4xl p-6 relative flex flex-col max-h-[90vh]">
            <button
              onClick={handleCloseOverlay}
              className="absolute top-6 right-6 text-gray-500 hover:text-gray-900 hover:bg-white rounded-full p-1.5 transition-colors z-10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-xl font-bold mb-6 flex-shrink-0 text-gray-900">Create Stock Deduction File for Shopware</h2>

            <div className="flex-grow overflow-y-auto space-y-4"> {/* Make content area scrollable */}
              {processingExport ? (
                <div className="flex justify-center items-center h-32">
                   <p>Processing...</p> {/* Basic loading indicator */}
                </div>
              ) : exportError ? (
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTitle>Error Processing File</AlertTitle>
                    <p>{exportError}</p>
                  </Alert>
                   <div className="flex justify-end mt-4">
                     <button
                      onClick={handleCloseOverlay}
                      className="inline-flex justify-center py-2.5 px-5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : relativeStockData.length > 0 ? (
                <div className="space-y-4">
                  <RelativeStockTable data={relativeStockData} />
                </div>
              ) : (
                <div className="space-y-4">
                  <FileUploadSection
                    title="Upload ZFS/FBA Recommended Stock File here" // Updated Title
                    onChange={handleExportFileChange}
                    onRemove={handleExportFileRemove}
                    files={exportFile ? [exportFile] : []}
                    acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
                  />
                  <div className="flex justify-end space-x-3 mt-4">
                    <button
                      onClick={handleCloseOverlay}
                      className="inline-flex justify-center py-2.5 px-5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={processExportFile}
                      disabled={!exportFile || processingExport}
                      className="inline-flex justify-center py-2.5 px-6 border border-transparent rounded-lg text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black disabled:hover:shadow-md"
                    >
                      Process
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 pb-6">
        {/* Main Card */}
        <div className="bg-gray-50 overflow-hidden">
          {/* Content Area */}
          <div className="p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/zfs" replace />} />
              <Route path="/zfs" element={
              <ZFSContent
                files={files}
                parsedData={filteredParsedData}
                recommendations={zfsRecommendationsForDisplay}
                timeline={timeline}
                error={error}
                isProcessing={isProcessing}
                handleFileChange={handleZfsFileChange}
                handleRemoveFile={handleZfsRemoveFile}
                processFiles={processFiles}
                setTimeline={setTimeline}
                resetFiles={resetZFSFiles}
                clearTables={clearTables}
                setError={setError}
                showTabs={showTabs && (zfsRecommendationSettingsLoaded || filteredRecommendations.length === 0)}
                tabsRef={tabsRef}
                onOpenBlacklist={() => setShowZfsBlacklistModal(true)}
                blacklistCount={zfsBlacklist.length}
                zfsRecommendationSettingsLoaded={zfsRecommendationSettingsLoaded}
                zfsCoverageDays={zfsCoverageDays}
                zfsSafetyFactor={zfsSafetyFactor}
                zfsTrendFactor={zfsTrendFactor}
                onZfsCoverageDaysChange={handleZfsCoverageDaysChange}
                onZfsSafetyFactorChange={handleZfsSafetyFactorChange}
                onZfsTrendFactorChange={handleZfsTrendFactorChange}
              />
              } />
              <Route path="/fba" element={
              <FBAContent
                fbaFiles={fbaFiles}
                setFbaFiles={setFbaFiles}
                fbaData={fbaData}
                setFbaData={setFbaData}
                resetFiles={resetFBAFiles}
                clearTables={clearFBATables}
                blacklist={fbaBlacklist}
                onOpenBlacklist={() => setShowFbaBlacklistModal(true)}
              />
              } />
              <Route path="/retagging" element={
              <RetaggingDecisionTool
                shopifyStockFile={retaggingShopifyStockFile}
                onShopifyStockFileChange={handleRetaggingShopifyStockFileChange}
                onShopifyStockFileRemove={handleRetaggingShopifyStockFileRemove}
                shopifySyncError={retaggingShopifySyncError}
                isShopifyStockLoading={isRetaggingShopifyStockLoading}
              />
              } />
              <Route path="*" element={<Navigate to="/zfs" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </>
  );
};

export default IntegratedStockParser;
