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
      label: "Stock Overview",
      content:
        parsedData.integrated.length > 0 ? (
          <StockTable data={parsedData.integrated} />
        ) : null,
    },
    {
      id: "recommendations",
      label: "Stock Recommendations",
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
        {showTabs && <Tabs tabs={tabs} />}
      </div>
    </div>
  );
};

const FBAContent: React.FC = () => {
  const [files, setFiles] = useState({
    fbaSales: null,
    sellerboardExport: null,
    sellerboardReturns: null,
  });
  const [timeline] = useState<TimelineType>("30days");

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: string
  ) => {
    const newFiles = event.target.files;
    if (!newFiles) return;
    setFiles((prev) => ({
      ...prev,
      [type]: newFiles[0],
    }));
  };

  const handleRemoveFile = (fileName: string, type: string) => {
    setFiles((prev) => ({
      ...prev,
      [type]: null,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileUploadSection
          title="Sellerboard Export"
          onChange={(e) => handleFileChange(e, "sellerboardExport")}
          onRemove={(name) => handleRemoveFile(name, "sellerboardExport")}
          files={files.sellerboardExport ? [files.sellerboardExport] : []}
        />
        <FileUploadSection
          title="Sellerboard Returns Export"
          onChange={(e) => handleFileChange(e, "sellerboardReturns")}
          onRemove={(name) => handleRemoveFile(name, "sellerboardReturns")}
          files={files.sellerboardReturns ? [files.sellerboardReturns] : []}
        />
      </div>
      <div className="flex justify-center">
        <div className="w-full md:w-1/2">
          <FileUploadSection
            title="FBA Sales"
            onChange={(e) => handleFileChange(e, "fbaSales")}
            onRemove={(name) => handleRemoveFile(name, "fbaSales")}
            files={files.fbaSales ? [files.fbaSales] : []}
            additionalControls={
              <div className="text-sm text-gray-500">30 Days Timeline</div>
            }
          />
        </div>
      </div>
      <div className="flex justify-between">
        <button
          onClick={() =>
            setFiles({
              fbaSales: null,
              sellerboardExport: null,
              sellerboardReturns: null,
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Files
        </button>
        <button
          onClick={() => processFiles(timeline)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Process Files
        </button>
      </div>
    </div>
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
  const [activeTab, setActiveTab] = useState<"zfs" | "fba">("zfs");
  const { tabsRef, setShouldScroll, setHasProcessed } = useScrollToResults();

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

  useEffect(() => {
    if (isProcessing) {
      setShouldScroll(true);
      setHasProcessed(false);
    } else if (showTabs) {
      setHasProcessed(true);
    }
  }, [isProcessing, showTabs, setShouldScroll, setHasProcessed]);

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
                  onClick={() => setActiveTab("zfs")}
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-bold text-lg ${
                    activeTab === "zfs"
                      ? "border-green-500 text-green-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  ZFS
                </button>
                <button
                  onClick={() => setActiveTab("fba")}
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
                resetFiles={resetFiles}
                clearTables={clearTables}
                setError={setError}
                showTabs={showTabs}
                tabsRef={tabsRef}
              />
            ) : (
              <FBAContent />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default IntegratedStockParser;
