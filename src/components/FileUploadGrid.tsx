import React from "react";
import { FileUploadSection } from "./FileUploadSection";
import { TimelineSelector } from "./TimelineSelector";
import { FileState } from "@/types/stock";

interface FileUploadGridProps {
  files: FileState;
  onFileChange: (
    event: React.ChangeEvent<HTMLInputElement>,
    type: keyof FileState
  ) => void;
  onFileRemove: (fileName: string, type: keyof FileState) => void;
  timeline: 'none' | '30days' | '6months';
  onTimelineChange: (value: 'none' | '30days' | '6months') => void;
}

export const FileUploadGrid: React.FC<FileUploadGridProps> = ({
  files,
  onFileChange,
  onFileRemove,
  timeline,
  onTimelineChange,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileUploadSection
          title="Internal Stocks"
          onChange={(e) => onFileChange(e, "internal")}
          onRemove={(name) => onFileRemove(name, "internal")}
          files={files.internal ? [files.internal] : []}
        />
        <FileUploadSection
          title="ZFS Stocks"
          onChange={(e) => onFileChange(e, "zfs")}
          onRemove={(name) => onFileRemove(name, "zfs")}
          files={files.zfs ? [files.zfs] : []}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileUploadSection
          title="ZFS Shipment"
          onChange={(e) => onFileChange(e, "zfsShipments")}
          onRemove={(name) => onFileRemove(name, "zfsShipments")}
          files={files.zfsShipments}
          multiple
        />
        <FileUploadSection
          title="ZFS Shipment Received"
          onChange={(e) => onFileChange(e, "zfsShipmentsReceived")}
          onRemove={(name) => onFileRemove(name, "zfsShipmentsReceived")}
          files={files.zfsShipmentsReceived}
          multiple
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileUploadSection
          title="SKU-EAN Mapper"
          onChange={(e) => onFileChange(e, "skuEanMapper")}
          onRemove={(name) => onFileRemove(name, "skuEanMapper")}
          files={files.skuEanMapper ? [files.skuEanMapper] : []}
        />
        <FileUploadSection
          title="ZFS Sales"
          onChange={(e) => onFileChange(e, "zfsSales")}
          onRemove={(name) => onFileRemove(name, "zfsSales")}
          files={files.zfsSales ? [files.zfsSales] : []}
          additionalControls={
            <TimelineSelector
              value={timeline}
              onChange={onTimelineChange}
            />
          }
        />
      </div>
    </div>
  );
};
