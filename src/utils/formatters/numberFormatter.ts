export function formatNumber(num: number): string {
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

export function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}