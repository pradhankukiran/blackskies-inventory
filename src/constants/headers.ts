import { internalHeaders } from './headers/internal';
import { fbaHeaders } from './headers/fba';
import { zfsHeaders } from './headers/zfs';
import { fbaShipmentHeaders, zfsShipmentHeaders, zfsShipmentReceivedHeaders } from './headers/shipments';
import { skuEanMappingHeaders } from './headers/mapping';

export const expectedHeaders = {
  internal: internalHeaders,
  fba: fbaHeaders,
  zfs: zfsHeaders,
  fbaShipment: fbaShipmentHeaders,
  zfsShipment: zfsShipmentHeaders,
  zfsShipmentReceived: zfsShipmentReceivedHeaders,
  skuEanMapping: skuEanMappingHeaders,
} as const;

export type HeaderTypes = keyof typeof expectedHeaders;