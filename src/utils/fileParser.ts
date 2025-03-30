import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const CHUNK_SIZE = 10000; // Process 10,000 rows at a time

export const parseCSVFile = (file: File, onProgress?: (progress: number) => void): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    let processedChunks = 0;
    let totalChunks = 0;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8', // Add explicit UTF-8 encoding
      transformHeader: (header) => header.trim(), // Trim whitespace from headers
      transform: (value) => {
        if (typeof value === 'string') {
          // Clean up any invalid characters and normalize the string
          return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
            .replace(/[^\x20-\x7E]/g, ''); // Remove non-printable characters
        }
        return value;
      },
      chunk: (chunk, parser) => {
        results.push(...chunk.data);
        processedChunks++;
        
        if (onProgress) {
          const progress = totalChunks > 0 ? (processedChunks / totalChunks) * 100 : 0;
          onProgress(Math.min(progress, 99)); // Cap at 99% until complete
        }
      },
      complete: () => {
        if (onProgress) {
          onProgress(100);
        }
        resolve(results);
      },
      error: (error) => reject(error),
      beforeFirstChunk: (chunk) => {
        // Estimate total chunks based on file size and first chunk size
        const firstChunkSize = chunk.length;
        totalChunks = Math.ceil(file.size / firstChunkSize);
      }
    });
  });
};

export const parseXLSXFile = (file: File, onProgress?: (progress: number) => void): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        if (onProgress) onProgress(50); // Reading completed
        
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const results = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        
        if (onProgress) onProgress(100); // Processing completed
        resolve(results);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    if (onProgress) onProgress(10); // Starting to read
    reader.readAsBinaryString(file);
  });
};

// General file parser that automatically detects file type and uses the appropriate parser
export const parseFile = async (file: File, onProgress?: (progress: number) => void): Promise<any[]> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  
  if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    return parseXLSXFile(file, onProgress);
  } else if (fileExtension === 'csv' || fileExtension === 'txt') {
    return parseCSVFile(file, onProgress);
  } else {
    throw new Error(`Unsupported file type: ${fileExtension}. Please upload a CSV, TXT, XLSX, or XLS file.`);
  }
};