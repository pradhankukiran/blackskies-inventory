import React from 'react';
import { X, Upload } from 'lucide-react';

interface FileUploadSectionProps {
  title: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (fileName: string) => void;
  files?: File[];
  multiple?: boolean;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  title,
  onChange,
  onRemove,
  files = [],
  multiple = false,
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      </div>
      <div className="p-4">
        <div className="flex justify-center items-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-3 text-gray-400" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">CSV, TSV, or TXT files {multiple ? "(multiple allowed)" : ""}</p>
            </div>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={onChange}
              multiple={multiple}
              className="hidden"
            />
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 text-sm rounded-md bg-green-50 border border-green-200"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-green-700">{file.name}</span>
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