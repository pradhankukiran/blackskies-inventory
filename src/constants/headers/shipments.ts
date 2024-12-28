export const fbaShipmentHeaders = [
  "Händler-SKU",
  "Titel",
  "ASIN",
  "FNSKU",
  "externe-id",
  "Zustand",
  "Wer übernimmt die Vorbereitung?",
  "Art der Vorbereitung",
  "Wer etikettiert?",
  "Versendete Einheiten",
] as const;

export const zfsShipmentHeaders = [
  "EAN",
  "Quantity",
] as const;

export const zfsShipmentReceivedHeaders = [
  "Shipping notice ID",
  "EAN",
  "Received date",
  "Quantity",
] as const;