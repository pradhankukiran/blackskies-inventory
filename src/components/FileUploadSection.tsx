import React, { useState } from "react";
import { X, Upload } from "lucide-react";

interface FileUploadSectionProps {
  title: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (fileName: string) => void;
  files?: File[];
  multiple?: boolean;
  additionalControls?: React.ReactNode;
  acceptedFileTypes?: string;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  title,
  onChange,
  onRemove,
  files = [],
  multiple = false,
  additionalControls,
  acceptedFileTypes = ".csv,.tsv,.txt",
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

  // Get file extensions for display
  const fileExtensions = acceptedFileTypes
    .split(',')
    .map(ext => ext.replace('.', '').toUpperCase())
    .join(', ');

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {additionalControls}
        </div>
      </div>
      <div className="p-4">
        <div className="flex justify-center items-center w-full">
          <label
            className={`flex flex-col items-center justify-center w-full h-32 border-2 rounded-lg cursor-pointer transition-all duration-300 ease-in-out ${
              isDragging
                ? "border-green-500 bg-green-50 scale-105 border-solid"
                : "border-gray-300 bg-gray-50 border-dashed"
            } hover:bg-gray-100`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload
                className={`w-8 h-8 mb-3 transition-colors duration-300 ${
                  isDragging ? "text-green-500" : "text-gray-400"
                }`}
              />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> or drag
                and drop
              </p>
              <p className="text-xs text-gray-500">
                {fileExtensions} files {multiple ? "(multiple allowed)" : ""}
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
          <div className="mt-4 space-y-2">
            {files.map((file: File, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 text-sm rounded-md bg-green-50 border border-green-200"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-green-700">
                    {file.name}
                  </span>
                  <span className="text-green-600 text-xs">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  onClick={() => onRemove(file.name)}
                  className="p-1 hover:bg-green-100 rounded-full transition-colors"
                >
                  <X size={16} className="text-green-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
