import { ParsedData } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';

const STORAGE_KEY = 'stockParserData';

interface StoredData {
  parsedData: ParsedData;
  recommendations: ArticleRecommendation[];
}

export const storeData = async (data: StoredData): Promise<void> => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Silently handle storage errors
  }
};

export const getStoredData = async (): Promise<StoredData | null> => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    // Silently handle retrieval errors
    return null;
  }
};

export const clearStoredData = async (): Promise<void> => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Silently handle clear errors
  }
};