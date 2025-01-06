import React, { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FileUploadGrid } from "./FileUploadGrid";
import { StockTable } from "./StockTable";
import { RecommendationsTable } from "./RecommendationsTable";
import { useFileProcessing } from "@/hooks/useFileProcessing";
import { Tabs } from "./ui/tabs";
import { RotateCcw } from "lucide-react";

const IntegratedStockParser: React.FC = () => {
  const {
    files,
    parsedData,
    recommendations,
    error,
    isProcessing,
    handleFileChange,
    handleRemoveFile,
    processFiles,
    resetAll,
  } = useFileProcessing();

  const tabs = [
    {
      id: "stock",
      label: "Stock Overview",
      content: parsedData.integrated.length > 0 ? (
        <StockTable data={parsedData.integrated} />
      ) : null,
    },
    {
      id: "recommendations",
      label: "Stock Recommendations",
      content: recommendations.length > 0 ? (
        <RecommendationsTable recommendations={recommendations} />
      ) : null,
    },
  ];

  const showTabs = parsedData.integrated.length > 0 || recommendations.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Integrated Stock Parser</CardTitle>
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
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <RotateCcw className="w-4 h-4" />
                Reset All
              </button>
              <button
                onClick={processFiles}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Process Files
              </button>
            </div>

            {showTabs && <Tabs tabs={tabs} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegratedStockParser;