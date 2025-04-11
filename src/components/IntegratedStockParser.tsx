import React, { useState, useRef, useEffect } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import { ProcessedSellerboardStock } from "@/types/processors";
import { storeFiles, getFiles, storeData, getStoredData, clearFiles, clearStoredData, storeGenericData, getGenericData, clearGenericData } from '@/lib/indexedDB';
import { FileState, ParsedData } from "@/types/stock";
import RelativeStockTable from "./RelativeStockTable";

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
}) => {
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
        recommendations.length > 0 ? (
          <RecommendationsTable
            recommendations={recommendations}
            stockData={parsedData.integrated}
            parsedData={parsedData}
            timeline={timeline}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
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

      <div className="flex justify-between">
        <div className="flex gap-2">
          <button
            onClick={resetFiles}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Files
          </button>
          {showTabs && (
            <button
              onClick={clearTables}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
            >
              Clear Tables
            </button>
          )}
        </div>
        <button
          onClick={() => {
            if (files.zfsSales && timeline === "none") {
              setError("Please select a timeline for the sales file");
              return;
            }
            processFiles(timeline);
          }}
          disabled={isProcessing || (files.zfsSales && timeline === "none")}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Process Files
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
}

const FBAContent: React.FC<FBAContentProps> = ({ 
  fbaFiles, 
  setFbaFiles, 
  fbaData, 
  setFbaData,
  resetFiles,
  clearTables
}) => {
  const [timeline] = useState<TimelineType>("30days");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTabs, setShowTabs] = useState(fbaData.sellerboardStock.length > 0);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Load saved files and data from IndexedDB on component mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        // Load saved files - specify 'fba' as the storeType
        const savedFiles = await getFiles('fba');
        if (savedFiles) {
          setFbaFiles({
            sellerboardExport: savedFiles.sellerboardExport,
            sellerboardReturns: savedFiles.sellerboardReturns,
          });
        }

        // Load saved parsed data - specify 'fba' as the storeType
        const savedData = await getStoredData('fba');
        if (savedData?.parsedData) {
          if (savedData.parsedData.sellerboardStock?.length > 0) {
            setFbaData({
              sellerboardStock: savedData.parsedData.sellerboardStock,
            });
            setShowTabs(savedData.parsedData.sellerboardStock.length > 0);
          }
        }
      } catch (err) {
        console.error("Error loading saved data:", err);
      }
    };

    loadSavedData();
  }, [setFbaFiles, setFbaData]);

  // Update showTabs when fbaData changes
  useEffect(() => {
    setShowTabs(fbaData.sellerboardStock.length > 0);
  }, [fbaData]);

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
        zfs: null,
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

  const handleRemoveFile = async (fileName: string, type: string) => {
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
        zfs: null,
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
        
        // Get coverage days from IndexedDB or use default
        let coverageDays = 14; // Default value
        try {
          const savedData = await getStoredData('fba');
          if (savedData?.coverageDays) {
            coverageDays = savedData.coverageDays;
          }
        } catch (err) {
          console.error("Error loading coverage days:", err);
        }
        
        const processedSellerboardData = processSellerboardStock(sellerboardData, salesReturnsData, coverageDays);
        
        // Update local state
        setFbaData({
          sellerboardStock: processedSellerboardData,
        });
        setShowTabs(processedSellerboardData.length > 0);
        
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
          
          await storeData({ 
            parsedData: parsedDataObj, 
            recommendations: [],
            coverageDays: coverageDays, // Save coverage days with the stored data
            rawReturnsData: salesReturnsData // Store the raw returns data for recalculations
          }, 'fba'); // Pass 'fba' as storeType
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
        fbaData.sellerboardStock.length > 0 ? (
          <FBAStockTable data={fbaData.sellerboardStock} />
        ) : null,
    },
    // Add more tabs here in the future like recommendations if needed
  ];

  return (
    <>
      <LoadingOverlay isLoading={isProcessing} message={processingStatus} />
      <div className="space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="flex justify-between">
          <div className="flex gap-2">
            <button
              onClick={resetFiles}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Files
            </button>
            {showTabs && (
              <button
                onClick={clearTables}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
              >
                Clear Tables
              </button>
            )}
          </div>
          <button
            onClick={() => processFiles()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
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

const IntegratedStockParser: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"zfs" | "fba">(() => {
    // Load the saved tab from localStorage, default to "zfs" if not found
    return (localStorage.getItem("activeTab") as "zfs" | "fba") || "zfs";
  });
  const { tabsRef, setShouldScroll, setHasProcessed } = useScrollToResults();
  
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
  
  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);
  
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
    processFiles,
    setTimeline,
    resetFiles,
    clearTables,
    resetAll,
    setError,
  } = useFileProcessing();

  const showTabs =
    parsedData.integrated.length > 0 || recommendations.length > 0;

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
        }
      } catch (err) {
        console.error("Error loading saved FBA data:", err);
      }
    };

    loadSavedData();
  }, []);

  useEffect(() => {
    if (isProcessing) {
      setShouldScroll(true);
      setHasProcessed(false);
    } else if (showTabs) {
      setHasProcessed(true);
    }
  }, [isProcessing, showTabs, setShouldScroll, setHasProcessed]);

  // Update reset functions to specify storeType
  const clearAllData = async () => {
    try {
      await clearFiles(); // This will now clear both ZFS and FBA files
      await clearStoredData(); // This will now clear both ZFS and FBA data
      console.log("All data cleared from IndexedDB");
    } catch (err) {
      console.error("Error clearing all data:", err);
    }
  };

  // Update resetFiles to only clear ZFS data
  const resetZFSFiles = async () => {
    resetFiles(); // Original ZFS reset logic - this already has storeType 'zfs'
    
    // Clear only ZFS data from IndexedDB
    try {
      await clearFiles('zfs');
      await clearStoredData('zfs');
      console.log("ZFS data cleared from IndexedDB");
    } catch (err) {
      console.error("Error clearing ZFS data:", err);
    }
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
      
      // Reset stored data but maintain default coverage days
      await storeData({
        parsedData: {
          internal: [],
          zfs: [],
          zfsShipments: [],
          zfsShipmentsReceived: [],
          skuEanMapper: [],
          zfsSales: [],
          integrated: [],
          sellerboardStock: []
        },
        recommendations: [],
        coverageDays: 14 // Reset to default value
      }, 'fba');
      
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
      const savedData = await getStoredData('fba');
      if (savedData) {
        await storeData({
          ...savedData,
          parsedData: {
            internal: [],
            zfs: [],
            zfsShipments: [],
            zfsShipmentsReceived: [],
            skuEanMapper: [],
            zfsSales: [],
            integrated: [],
            sellerboardStock: []
          }
        }, 'fba');
        console.log("FBA tables cleared from IndexedDB");
      }
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

      // --- Extract data rows, applying hardcoded values --- 
      const extractedData = parsedData
        .map((row: any) => {
          const sku = row[skuColumn!];
          const stockVal = row[stockColumn!];
          
          if (typeof sku !== 'string' || sku.trim() === '') return null;
          const stockNum = Number(stockVal);
          if (isNaN(stockNum)) return null;

          // Assign hardcoded values
          const warehouse = "HL"; 
          const binLocation = undefined; // Represent empty bin location
          const isDefaultBinLocation = false;
          
          return {
             articleNumber: sku.trim(),
             warehouse: warehouse, // Always HL
             binLocation: binLocation, // Always empty
             isDefaultBinLocation: isDefaultBinLocation, // Always false
             physicalStock: stockNum
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (extractedData.length === 0) {
        throw new Error("No valid data rows found after extraction.");
      }
      
      console.log(`Extracted ${extractedData.length} valid data rows.`);

      // --- Sort by articleNumber --- 
      extractedData.sort((a, b) => a.articleNumber.localeCompare(b.articleNumber));
      console.log("Sorted data (first 10):", extractedData.slice(0, 10));

      // Set state and persist
      setRelativeStockData(extractedData);
      await storeGenericData(RELATIVE_STOCK_TABLE_KEY, extractedData);
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
      
      {/* Relative Stock Export Overlay */}
      {showExportOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 relative flex flex-col max-h-[90vh]"> {/* Increased max-width for two columns */}
            <button
              onClick={handleCloseOverlay} // Use handler
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 z-10" // Ensure button is on top
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-lg font-medium mb-4 flex-shrink-0">Create Stock Deduction File for Shopware</h2>

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
                      onClick={handleCloseOverlay} // Use handler
                      className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
                      onClick={handleCloseOverlay} // Use handler
                      className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={processExportFile}
                      disabled={!exportFile || processingExport} // Disable during processing
                      className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex justify-center mb-4">
              <button
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                onClick={handleOpenOverlay} // Use new handler to open
                title="Use this to export adjusted stock deductions for both ZFS & FBA shipments"
                disabled={isLoadingPersistedData} // Disable while loading
              >
                Relative Stock Export
              </button>
            </div>
            <div className="border-b border-gray-200">
              <nav
                className="-mb-px flex space-x-8 justify-center"
                aria-label="Tabs"
              >
                <button
                  onClick={() => {
                    // Only update the active tab, don't reset any state
                    setActiveTab("zfs");
                  }}
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-bold text-lg ${
                    activeTab === "zfs"
                      ? "border-green-500 text-green-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  ZFS
                </button>
                <button
                  onClick={() => {
                    // Only update the active tab, don't reset any state
                    setActiveTab("fba");
                  }}
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-bold text-lg ${
                    activeTab === "fba"
                      ? "border-green-500 text-green-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  FBA
                </button>
              </nav>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === "zfs" ? (
              <ZFSContent
                files={files}
                parsedData={parsedData}
                recommendations={recommendations}
                timeline={timeline}
                error={error}
                isProcessing={isProcessing}
                handleFileChange={handleFileChange}
                handleRemoveFile={handleRemoveFile}
                processFiles={processFiles}
                setTimeline={setTimeline}
                resetFiles={resetZFSFiles}
                clearTables={clearTables}
                setError={setError}
                showTabs={showTabs}
                tabsRef={tabsRef}
              />
            ) : (
              <FBAContent 
                fbaFiles={fbaFiles}
                setFbaFiles={setFbaFiles}
                fbaData={fbaData}
                setFbaData={setFbaData}
                resetFiles={resetFBAFiles}
                clearTables={clearFBATables}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default IntegratedStockParser;
