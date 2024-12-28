export function calculateDaysBetween(startDate: string, endDate: string): number {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays); // Ensure we never return 0 days
  } catch {
    return 1; // Default to 1 day if date calculation fails
  }
}

export function extractDate(dateTimeString: string): string {
  try {
    return dateTimeString.split(' ')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}