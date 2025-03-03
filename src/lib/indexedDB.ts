import { FileState } from '@/types/stock';
import { ParsedData } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';

const DB_NAME = 'stockParserDB';
const FILES_STORE = 'files';
const DATA_STORE = 'parsedData';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;

interface StoredData {
  parsedData: ParsedData;
  recommendations: ArticleRecommendation[];
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

const serializeFiles = async (files: FileState): Promise<Record<string, SerializedFile | SerializedFile[] | null>> => {
  const serialized: Record<string, SerializedFile | SerializedFile[] | null> = {};

  for (const [key, value] of Object.entries(files)) {
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

const deserializeFiles = (serialized: Record<string, SerializedFile | SerializedFile[] | null>): FileState => {
  const deserialized: FileState = {
    internal: null,
    fba: null,
    zfs: null,
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: null,
    zfsSales: null
  };

  for (const [key, value] of Object.entries(serialized)) {
    if (Array.isArray(value)) {
      deserialized[key as keyof FileState] = value.map(deserializeToFile) as any;
    } else if (value) {
      deserialized[key as keyof FileState] = deserializeToFile(value) as any;
    }
  }

  return deserialized;
};

export const storeFiles = async (files: FileState): Promise<void> => {
  const db = await getDB();
  const serializedFiles = await serializeFiles(files);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES_STORE, 'readwrite');
    const store = transaction.objectStore(FILES_STORE);

    const request = store.put(serializedFiles, 'currentFiles');

    request.onsuccess = () => {
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const getFiles = async (): Promise<FileState | null> => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES_STORE, 'readonly');
    const store = transaction.objectStore(FILES_STORE);
    const request = store.get('currentFiles');

    request.onsuccess = () => {
      const serializedFiles = request.result;
      if (!serializedFiles) {
        resolve(null);
        return;
      }

      resolve(deserializeFiles(serializedFiles));
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const clearFiles = async (): Promise<void> => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES_STORE, 'readwrite');
    const store = transaction.objectStore(FILES_STORE);
    const request = store.delete('currentFiles');

    request.onsuccess = () => {
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const storeData = async (data: StoredData): Promise<void> => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readwrite');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.put(data, 'currentData');

    request.onsuccess = () => {
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const getStoredData = async (): Promise<StoredData | null> => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readonly');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.get('currentData');

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};

export const clearStoredData = async (): Promise<void> => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATA_STORE, 'readwrite');
    const store = transaction.objectStore(DATA_STORE);
    const request = store.delete('currentData');

    request.onsuccess = () => {
      transaction.oncomplete = () => resolve();
    };

    request.onerror = () => {
      transaction.abort();
      reject(request.error);
    };

    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
};