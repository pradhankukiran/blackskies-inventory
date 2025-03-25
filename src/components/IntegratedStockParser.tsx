import React, { useState, useRef, useEffect } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileUploadGrid } from "./FileUploadGrid";
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
            if (files.zfsSales && timeline === 'none') {
              setError('Please select a timeline for the sales file');
              return;
            }
            processFiles(timeline);
          }}
          disabled={isProcessing || (files.zfsSales && timeline === 'none')}
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
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">FBA functionality coming soon...</p>
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
        behavior: 'smooth', 
        block: 'center'
      });
      setShouldScroll(false);
    }, 300);
  }, [shouldScroll, hasProcessed]);

  return { tabsRef, setShouldScroll, setHasProcessed };
}

const IntegratedStockParser: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'zfs' | 'fba'>('zfs');
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
              <nav className="-mb-px flex space-x-8 justify-center" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('zfs')}
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-bold text-lg ${
                    activeTab === 'zfs'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  ZFS
                </button>
                <button
                  onClick={() => setActiveTab('fba')}
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-bold text-lg ${
                    activeTab === 'fba'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  FBA
                </button>
              </nav>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'zfs' ? (
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
}

export default IntegratedStockParser;