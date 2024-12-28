import React from 'react';
import { FileUploadSection } from './FileUploadSection';
import { FileState } from '@/types/stock';

interface FileUploadGridProps {
  files: FileState;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>, type: keyof FileState) => void;
  onFileRemove: (fileName: string, type: keyof FileState) => void;
}

export const FileUploadGrid: React.FC<FileUploadGridProps> = ({
  files,
  onFileChange,
  onFileRemove,
}) => {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileUploadSection
          title="Internal Stock File"
          onChange={(e) => onFileChange(e, "internal")}
          onRemove={(name) => onFileRemove(name, "internal")}
          files={files.internal ? [files.internal] : []}
        />
        <FileUploadSection
          title="ZFS Stock File"
          onChange={(e) => onFileChange(e, "zfs")}
          onRemove={(name) => onFileRemove(name, "zfs")}
          files={files.zfs ? [files.zfs] : []}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileUploadSection
          title="ZFS Shipment Files"
          onChange={(e) => onFileChange(e, "zfsShipments")}
          onRemove={(name) => onFileRemove(name, "zfsShipments")}
          files={files.zfsShipments}
          multiple
        />
        <FileUploadSection
          title="ZFS Received Shipment Files"
          onChange={(e) => onFileChange(e, "zfsShipmentsReceived")}
          onRemove={(name) => onFileRemove(name, "zfsShipmentsReceived")}
          files={files.zfsShipmentsReceived}
          multiple
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileUploadSection
          title="SKU-EAN Mapping File"
          onChange={(e) => onFileChange(e, "skuEanMapper")}
          onRemove={(name) => onFileRemove(name, "skuEanMapper")}
          files={files.skuEanMapper ? [files.skuEanMapper] : []}
        />
        <FileUploadSection
          title="ZFS Sales Data File"
          onChange={(e) => onFileChange(e, "zfsSales")}
          onRemove={(name) => onFileRemove(name, "zfsSales")}
          files={files.zfsSales ? [files.zfsSales] : []}
        />
      </div>
    </>
  );
};