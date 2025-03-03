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

const IntegratedStockParser: React.FC = () => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  const {
    files,
    parsedData,
    recommendations,
    error,
    isProcessing,
    processingStatus,
    handleFileChange,
    handleRemoveFile,
    processFiles,
    resetFiles,
    clearTables,
    resetAll,
  } = useFileProcessing();

  useEffect(() => {
    if (isProcessing) {
      setShouldScroll(true);
    }
  }, [isProcessing]);

  useEffect(() => {
    if (!isProcessing && shouldScroll && tabsRef.current) {
      setTimeout(() => {
        tabsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
        setShouldScroll(false);
      }, 100);
    }
  }, [isProcessing, shouldScroll]);

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
          />
        ) : null,
    },
  ];

  const showTabs =
    parsedData.integrated.length > 0 || recommendations.length > 0;

  return (
    <>
      <LoadingOverlay isLoading={isProcessing} message={processingStatus} />
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-center font-bold">
              Inventory Management
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                  onClick={processFiles}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Process Files
                </button>
              </div>

              <div ref={tabsRef} id="results-section">
                {showTabs && <Tabs tabs={tabs} />}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default IntegratedStockParser