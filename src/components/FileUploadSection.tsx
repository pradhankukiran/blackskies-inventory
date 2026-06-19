import React, { useState } from "react";
import { X, Upload, Download } from "lucide-react";

interface FileUploadSectionProps {
  title: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (fileName: string) => void;
  files?: File[];
  multiple?: boolean;
  additionalControls?: React.ReactNode;
  acceptedFileTypes?: string;
  syncedFromShopify?: boolean;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  title,
  onChange,
  onRemove,
  files = [],
  multiple = false,
  additionalControls,
  acceptedFileTypes = ".csv,.tsv,.txt",
  syncedFromShopify = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDownload = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (!droppedFiles.length) return;

    const syntheticEvent = {
      target: {
        files: multiple ? droppedFiles : [droppedFiles[0]],
      },
      preventDefault: () => {},
      stopPropagation: () => {},
      nativeEvent: new Event("change"),
      currentTarget: null,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: true,
      timeStamp: Date.now(),
      type: "change",
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    onChange(syntheticEvent);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {syncedFromShopify && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-sm font-medium text-emerald-800 bg-emerald-100 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                from Shopify
              </span>
            )}
            {additionalControls}
          </div>
        </div>

        <div className="flex justify-center items-center w-full">
          <label
            className={`flex flex-col items-center justify-center w-full h-32 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
              isDragging
                ? "border-black bg-gray-50 border-solid"
                : "border-gray-200 bg-gray-50 border-dashed"
            } hover:bg-gray-100 hover:border-gray-300`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center">
              <Upload
                className={`w-9 h-9 mb-2 transition-colors duration-200 ${
                  isDragging ? "text-black" : "text-gray-400"
                }`}
              />
              <p className="px-2 text-center text-sm text-gray-600">
                <span className="font-semibold text-gray-900">Click to upload</span> or drag and drop
              </p>
            </div>
            <input
              type="file"
              accept={acceptedFileTypes}
              onChange={onChange}
              multiple={multiple}
              className="hidden"
            />
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {files.map((file: File, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="font-medium text-gray-900 truncate text-sm">
                    {file.name}
                  </span>
                  <span className="text-gray-500 text-sm flex-shrink-0">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                  {syncedFromShopify && (
                    <button
                      onClick={() => handleDownload(file)}
                      className="p-1 hover:bg-gray-200 transition-colors flex-shrink-0"
                      title="Download CSV"
                    >
                      <Download size={16} className="text-gray-600" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onRemove(file.name)}
                  className="p-1.5 hover:bg-gray-200 transition-colors flex-shrink-0 ml-2"
                  title="Remove"
                >
                  <X size={16} className="text-gray-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
