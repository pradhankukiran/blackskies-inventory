export function calculateZFSPendingShipments(
  shipped: { EAN: string; "ZFS Shipped Quantity": number }[],
  received: { EAN: string; "ZFS Received Quantity": number }[]
): Map<string, number> {
  const pendingByEAN = new Map<string, number>();
  
  // Aggregate shipped quantities by EAN
  shipped.forEach(item => {
    const current = pendingByEAN.get(item.EAN) || 0;
    pendingByEAN.set(item.EAN, current + item["ZFS Shipped Quantity"]);
  });
  
  // Subtract received quantities
  received.forEach(item => {
    if (pendingByEAN.has(item.EAN)) {
      const pending = pendingByEAN.get(item.EAN)! - item["ZFS Received Quantity"];
      pendingByEAN.set(item.EAN, Math.max(0, pending));
    }
  });
  
  return pendingByEAN;
}