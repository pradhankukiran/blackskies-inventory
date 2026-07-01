import React, { useState } from "react";
import { X, Upload, Download, CheckCircle2 } from "lucide-react";

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
    <div className="ops-surface rounded-[8px] transition-shadow duration-200 hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
      <div className="px-5 py-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950">{title}</h3>
            {files.length > 0 && !syncedFromShopify && (
              <span className="inline-flex items-center gap-1 rounded-[999px] bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Uploaded
              </span>
            )}
            {syncedFromShopify && (
              <span className="inline-flex items-center gap-1 rounded-[999px] bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                from Shopify
              </span>
            )}
            {additionalControls}
          </div>
        </div>

        <div className="flex justify-center items-center w-full">
          <label
            className={`flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-[8px] border transition-all duration-200 ${
              isDragging
                ? "border-slate-950 bg-slate-50 border-solid"
                : "border-slate-200 bg-slate-50/80 border-dashed"
            } hover:border-slate-300 hover:bg-slate-100/70`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center">
              <Upload
                className={`mb-3 h-9 w-9 transition-colors duration-200 ${
                  isDragging ? "text-slate-950" : "text-slate-400"
                }`}
              />
              <p className="px-2 text-center text-base text-slate-600">
                <span className="font-semibold text-slate-950">Click to upload</span> or drag and drop
              </p>
              <p className="mt-1 text-sm text-slate-400">CSV, TSV, TXT, XLSX</p>
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
          <div className="mt-4 space-y-2">
            {files.map((file: File, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-[6px] border border-slate-200 bg-slate-50 px-4 py-3 transition-colors duration-200 hover:bg-slate-100"
              >
                <div className="flex min-w-0 items-center space-x-2">
                  <span className="truncate text-base font-medium text-slate-900">
                    {file.name}
                  </span>
                  <span className="flex-shrink-0 text-base text-slate-500">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                  {syncedFromShopify && (
                    <button
                      onClick={() => handleDownload(file)}
                      className="flex-shrink-0 rounded-[4px] p-1 transition-colors hover:bg-slate-200"
                      title="Download CSV"
                    >
                      <Download size={16} className="text-slate-600" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onRemove(file.name)}
                  className="ml-2 flex-shrink-0 rounded-[4px] p-1.5 transition-colors hover:bg-slate-200"
                  title="Remove"
                >
                  <X size={16} className="text-slate-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
