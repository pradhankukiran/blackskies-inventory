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
      chunk: (chunk, _parser) => {
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
    
    // Show progress for file reading
    if (onProgress) onProgress(5); // Start at 5%
    
    // Track reading progress
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        // Calculate reading progress (0-50%)
        const readingProgress = (event.loaded / event.total) * 50;
        onProgress(Math.min(Math.round(readingProgress), 50)); 
      }
    };
    
    reader.onload = (e) => {
      try {
        if (onProgress) onProgress(50); // Reading completed
        
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        if (onProgress) onProgress(70); // Workbook parsed
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        if (onProgress) onProgress(80); // Worksheet selected

        // Start converting to JSON
        if (onProgress) onProgress(85);
        // Use raw: true to preserve large numbers (like EANs) as strings instead of converting to scientific notation
        const results = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: '' });
        
        // Calculate processing progress based on data size
        const rowCount = results.length;
        if (rowCount > 1000 && onProgress) {
          // Process in chunks for large datasets to show incremental progress
          const processedResults = [];
          const chunkSize = CHUNK_SIZE / 20; // Using a smaller chunk size for processing display
          const totalChunks = Math.ceil(rowCount / chunkSize);
          
          for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, rowCount);
            const chunk = results.slice(start, end);
            processedResults.push(...chunk);
            
            // Update progress (85-99%)
            const processingProgress = 85 + ((i + 1) / totalChunks) * 14;
            if (onProgress) onProgress(Math.min(Math.round(processingProgress), 99));
          }
          
          if (onProgress) onProgress(100); // Processing completed
          resolve(processedResults);
        } else {
          // Small dataset, just complete
          if (onProgress) onProgress(100); // Processing completed
          resolve(results);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
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