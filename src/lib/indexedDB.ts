import { FileState } from '@/types/stock';

const DB_NAME = 'stockParserDB';
const STORE_NAME = 'files';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

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
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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
    fbaShipments: [],
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: null,
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
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

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
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
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
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
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