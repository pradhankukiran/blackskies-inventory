import { FileState } from '@/types/stock';
import { ParsedData } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';

const DB_NAME = 'stockParserDB';
const FILES_STORE = 'files';
const DATA_STORE = 'parsedData';
const DB_VERSION = 2;

// Use separate keys for ZFS and FBA data
const ZFS_FILES_KEY = 'currentZfsFiles';
const FBA_FILES_KEY = 'currentFbaFiles';
const ZFS_DATA_KEY = 'currentZfsData';
const FBA_DATA_KEY = 'currentFbaData';

let dbInstance: IDBDatabase | null = null;

interface StoredData {
  parsedData: ParsedData;
  recommendations: ArticleRecommendation[];
  timeline?: 'none' | '30days' | '6months';
  coverageDays?: number;
  rawReturnsData?: any[] | null; // Store raw returns data for recalculation when coverage period changes
  blacklist?: string[];
}

interface SerializedFile {
  name: string;
  type: string;
  data: ArrayBuffer;
}

const getDB = async (): Promise<IDBDatabase> => {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      // Close any existing connection before storing the new one
      if (dbInstance) {
        dbInstance.close();
      }
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Handle store creation and upgrades
      const stores = [FILES_STORE, DATA_STORE];
      for (const storeName of stores) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
  });
};

const serializeFile = async (file: File): Promise<SerializedFile> => {
  const arrayBuffer = await file.arrayBuffer();
  return {
    name: file.name,
    type: file.type,
    data: arrayBuffer,
  };
};

const deserializeToFile = (serialized: SerializedFile): File => {
  return new File([serialized.data], serialized.name, { type: serialized.type });
};

const createEmptyParsedData = (): ParsedData => ({
  internal: [],
  zfs: [],
  zfsShipments: [],
  zfsShipmentsReceived: [],
  skuEanMapper: [],
  zfsSales: [],
  integrated: [],
  sellerboardStock: []
});

const createDefaultStoredData = (): StoredData => ({
  parsedData: createEmptyParsedData(),
  recommendations: [],
  blacklist: []
});

const serializeFiles = async (files: FileState): Promise<Record<string, SerializedFile | SerializedFile[] | null | string>> => {
  const serialized: Record<string, SerializedFile | SerializedFile[] | null | string> = {};

  for (const [key, value] of Object.entries(files)) {
    if (key === 'storeType') {
      serialized[key] = value as string;
      continue;
    }
    
    if (Array.isArray(value)) {
      serialized[key] = await Promise.all(value.map(serializeFile));
    } else if (value instanceof File) {
      serialized[key] = await serializeFile(value);
    } else {
      serialized[key] = null;
    }
  }

  return serialized;
};

const deserializeFiles = (serialized: Record<string, SerializedFile | SerializedFile[] | null | string>): FileState => {
  const deserialized: FileState = {
    internal: null,
    fba: null,
    zfs: [],
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: null,
    zfsSales: null,
    sellerboardExport: null,
    sellerboardReturns: null,
    fbaSales: null,
    storeType: serialized.storeType && typeof serialized.storeType === 'string' ?
      (serialized.storeType as 'zfs' | 'fba') : undefined
  };

  for (const [key, value] of Object.entries(serialized)) {
    if (key === 'storeType') continue; // Skip storeType as we've already handled it

    if (Array.isArray(value)) {
      deserialized[key as keyof FileState] = value.map(deserializeToFile) as any;
    } else if (value && typeof value !== 'string') {
      // Handle migration: if zfs was a single file in old data, convert it to an array
      if (key === 'zfs') {
        deserialized.zfs = [deserializeToFile(value)];
      } else {
        deserialized[key as keyof FileState] = deserializeToFile(value) as any;
      }
    }
  }

  return deserialized;
};

export const storeFiles = async (files: FileState): Promise<void> => {
  const db = await getDB();
  const serializedFiles = await serializeFiles(files);
  
  // Determine which key to use based on storeType
  const storageKey = files.storeType === 'fba' ? FBA_FILES_KEY : ZFS_FILES_KEY;
  
  console.log(`Storing ${files.storeType} files with key: ${storageKey}`);
  console.log("Files being stored:", {
    hasInternal: !!files.internal,
    hasFba: !!files.fba,
    zfsCount: files.zfs.length,
    zfsShipmentsCount: files.zfsShipments.length,
    zfsShipmentsReceivedCount: files.zfsShipmentsReceived.length,
    hasSkuEanMapper: !!files.skuEanMapper,
    hasZfsSales: !!files.zfsSales,
    hasSellerboardExport: !!files.sellerboardExport,
    hasSellerboardReturns: !!files.sellerboardReturns,
    hasFbaSales: !!files.fbaSales,
  });

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES_STORE, 'readwrite');
    const store = transaction.objectStore(FILES_STORE);

    const request = store.put(serializedFiles, storageKey);

    request.onsuccess = () => {
      console.log(`Files stored successfully in IndexedDB with key: ${storageKey}`);
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      console.error("Error storing files:", request.error);
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const getFiles = async (storeType?: 'zfs' | 'fba'): Promise<FileState | null> => {
  const db = await getDB();
  
  // If storeType is provided, only get that type of files
  // Otherwise, try to get both and return the first one found
  const keysToTry = storeType 
    ? [storeType === 'fba' ? FBA_FILES_KEY : ZFS_FILES_KEY]
    : [ZFS_FILES_KEY, FBA_FILES_KEY];
    
  let result: FileState | null = null;
  
  for (const key of keysToTry) {
    try {
      const files = await getFilesByKey(db, key);
      if (files) {
        console.log(`Retrieved files with key: ${key}`);
        result = files;
        if (storeType || keysToTry.length === 1) {
          break;
        }
      }
    } catch (err) {
      console.error(`Error retrieving files with key ${key}:`, err);
    }
  }
  
  return result;
};

const getFilesByKey = async (db: IDBDatabase, key: string): Promise<FileState | null> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES_STORE, 'readonly');
    const store = transaction.objectStore(FILES_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const serializedFiles = request.result;
      if (!serializedFiles) {
        console.log(`No files found in IndexedDB with key: ${key}`);
        resolve(null);
        return;
      }

      const files = deserializeFiles(serializedFiles);
      console.log(`Retrieved files with key ${key}, storeType:`, files.storeType);
      console.log("Files retrieved:", {
        hasInternal: !!files.internal,
        hasFba: !!files.fba,
        zfsCount: files.zfs.length,
        zfsShipmentsCount: files.zfsShipments.length,
        zfsShipmentsReceivedCount: files.zfsShipmentsReceived.length,
        hasSkuEanMapper: !!files.skuEanMapper,
        hasZfsSales: !!files.zfsSales,
        hasSellerboardExport: !!files.sellerboardExport,
        hasSellerboardReturns: !!files.sellerboardReturns,
        hasFbaSales: !!files.fbaSales,
      });
      resolve(files);
    };

    request.onerror = () => {
      console.error(`Error retrieving files with key ${key}:`, request.error);
      reject(request.error);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const clearFiles = async (storeType?: 'zfs' | 'fba'): Promise<void> => {
  const db = await getDB();
  
  // Determine which keys to clear based on storeType
  const keysToClear = storeType 
    ? [storeType === 'fba' ? FBA_FILES_KEY : ZFS_FILES_KEY]
    : [ZFS_FILES_KEY, FBA_FILES_KEY];

  const promises = keysToClear.map(key => clearFilesByKey(db, key));
  await Promise.all(promises);
};

const clearFilesByKey = async (db: IDBDatabase, key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES_STORE, 'readwrite');
    const store = transaction.objectStore(FILES_STORE);
    const request = store.delete(key);

    request.onsuccess = () => {
      console.log(`Files cleared with key: ${key}`);
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      console.error(`Error clearing files with key ${key}:`, request.error);
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const storeData = async (data: StoredData, storeType: 'zfs' | 'fba' = 'zfs'): Promise<void> => {
  const db = await getDB();
  
  // Use different keys for ZFS and FBA data
  const dataKey = storeType === 'fba' ? FBA_DATA_KEY : ZFS_DATA_KEY;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readwrite');
    const store = transaction.objectStore(DATA_STORE);
    
    console.log(`Storing data with key: ${dataKey}`);
    const request = store.put(data, dataKey);

    request.onsuccess = () => {
      console.log(`Data stored successfully with key: ${dataKey}`);
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      console.error(`Error storing data with key ${dataKey}:`, request.error);
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const storeBlacklist = async (blacklist: string[], storeType: 'zfs' | 'fba' = 'zfs'): Promise<void> => {
  const existing = await getStoredData(storeType);
  const data = existing ? { ...existing } : createDefaultStoredData();
  data.blacklist = [...blacklist];
  if (!data.parsedData) {
    data.parsedData = createEmptyParsedData();
  }
  if (!data.recommendations) {
    data.recommendations = [];
  }
  await storeData(data, storeType);
};

export const getBlacklist = async (storeType: 'zfs' | 'fba' = 'zfs'): Promise<string[]> => {
  const existing = await getStoredData(storeType);
  return existing?.blacklist ? [...existing.blacklist] : [];
};

export const getStoredData = async (storeType?: 'zfs' | 'fba'): Promise<StoredData | null> => {
  const db = await getDB();
  
  // If storeType is provided, only get that type of data
  // Otherwise, try to get both and return the first one found
  const keysToTry = storeType 
    ? [storeType === 'fba' ? FBA_DATA_KEY : ZFS_DATA_KEY]
    : [ZFS_DATA_KEY, FBA_DATA_KEY];
    
  let result: StoredData | null = null;
  
  for (const key of keysToTry) {
    try {
      const data = await getStoredDataByKey(db, key);
      if (data) {
        console.log(`Retrieved data with key: ${key}`);
        result = data;
        if (storeType || keysToTry.length === 1) {
          break;
        }
      }
    } catch (err) {
      console.error(`Error retrieving data with key ${key}:`, err);
    }
  }
  
  return result;
};

const getStoredDataByKey = async (db: IDBDatabase, key: string): Promise<StoredData | null> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readonly');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const data = request.result;
      if (!data) {
        console.log(`No data found with key: ${key}`);
      } else {
        console.log(`Data retrieved with key: ${key}`);
      }
      resolve(data || null);
    };

    request.onerror = () => {
      console.error(`Error retrieving data with key ${key}:`, request.error);
      reject(request.error);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const clearStoredData = async (storeType?: 'zfs' | 'fba'): Promise<void> => {
  const db = await getDB();
  
  // Determine which keys to clear based on storeType
  const keysToClear = storeType 
    ? [storeType === 'fba' ? FBA_DATA_KEY : ZFS_DATA_KEY]
    : [ZFS_DATA_KEY, FBA_DATA_KEY];

  const promises = keysToClear.map(key => clearStoredDataByKey(db, key));
  await Promise.all(promises);
};

const clearStoredDataByKey = async (db: IDBDatabase, key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readwrite');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.delete(key);

    request.onsuccess = () => {
      console.log(`Stored data cleared successfully for key: ${key}`);
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      console.error(`Error clearing stored data for key ${key}:`, request.error);
      transaction.abort();
      reject(request.error);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

// --- Generic Data Storage Functions --- 

// Helper structure to mark serialized files
interface StoredFileWrapper {
  _isFile: true;
  data: SerializedFile;
}

/**
 * Stores generic data (including Files) in IndexedDB under a specific key.
 * Files are automatically serialized.
 */
export const storeGenericData = async (key: string, value: any): Promise<void> => {
  const db = await getDB();
  let dataToStore = value;

  if (value instanceof File) {
    try {
      const serialized = await serializeFile(value);
      dataToStore = { _isFile: true, data: serialized } as StoredFileWrapper;
      console.log(`Serialized file for generic storage under key: ${key}`);
    } catch (error) {
      console.error(`Error serializing file for key ${key}:`, error);
      throw error; // Re-throw to indicate failure
    }
  } else {
     console.log(`Storing generic non-file data under key: ${key}`);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readwrite');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.put(dataToStore, key);

    request.onsuccess = () => {
      console.log(`Generic data stored successfully for key: ${key}`);
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      console.error(`Error storing generic data for key ${key}:`, request.error);
      transaction.abort();
      reject(request.error);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

/**
 * Retrieves generic data from IndexedDB by key.
 * Automatically deserializes Files.
 */
export const getGenericData = async (key: string): Promise<any | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readonly');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const storedValue = request.result;
      if (!storedValue) {
        console.log(`No generic data found for key: ${key}`);
        resolve(null);
        return;
      }
      
      // Check if it's a wrapped file
      if (storedValue && typeof storedValue === 'object' && storedValue._isFile === true && storedValue.data) {
         try {
           const file = deserializeToFile(storedValue.data as SerializedFile);
           console.log(`Deserialized file retrieved for generic key: ${key}`);
           resolve(file);
         } catch (error) {
            console.error(`Error deserializing file for key ${key}:`, error);
            reject(error); // Indicate failure
         }
      } else {
        console.log(`Retrieved generic non-file data for key: ${key}`);
        resolve(storedValue);
      }
    };

    request.onerror = () => {
      console.error(`Error retrieving generic data for key ${key}:`, request.error);
      reject(request.error);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

/**
 * Clears generic data from IndexedDB by key.
 */
export const clearGenericData = async (key: string): Promise<void> => {
  const db = await getDB();
  // Use the same underlying implementation as clearStoredDataByKey
  return clearStoredDataByKey(db, key);
};
