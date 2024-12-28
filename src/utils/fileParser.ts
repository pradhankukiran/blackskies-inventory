import Papa from 'papaparse';

export const parseCSVFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
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
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    });
  });
};