export const calculateZFSPendingShipments = (
  zfsShipments: any[],
  zfsShipmentsReceived: any[]
): Map<string, number> => {
  const shipmentsByEAN = new Map();
  zfsShipments.forEach((shipment) => {
    const ean = shipment.EAN;
    const quantity = parseInt(shipment.Quantity) || 0;
    shipmentsByEAN.set(ean, (shipmentsByEAN.get(ean) || 0) + quantity);
  });

  const receivedByEAN = new Map();
  zfsShipmentsReceived.forEach((received) => {
    const ean = received.EAN;
    const quantity = parseInt(received.Quantity) || 0;
    receivedByEAN.set(ean, (receivedByEAN.get(ean) || 0) + quantity);
  });

  const pendingShipments = new Map();
  shipmentsByEAN.forEach((shipped, ean) => {
    const received = receivedByEAN.get(ean) || 0;
    pendingShipments.set(ean, Math.max(0, shipped - received));
  });

  return pendingShipments;
};