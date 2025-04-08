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
import { storeFiles, getFiles, storeData, getStoredData, clearFiles, clearStoredData } from '@/lib/indexedDB';
import { FileState, ParsedData } from "@/types/stock";

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
        }
        
        const processedSellerboardData = processSellerboardStock(sellerboardData, salesReturnsData);
        
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
            recommendations: [] 
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

const IntegratedStockParser: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"zfs" | "fba">(() => {
    // Load the saved tab from localStorage, default to "zfs" if not found
    return (localStorage.getItem("activeTab") as "zfs" | "fba") || "zfs";
  });
  const { tabsRef, setShouldScroll, setHasProcessed } = useScrollToResults();
  
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
      await clearStoredData('fba');
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

  return (
    <>
      <LoadingOverlay isLoading={isProcessing} message={processingStatus} />
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
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
