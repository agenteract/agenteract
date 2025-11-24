// Mock @react-native-async-storage/async-storage for web builds
// Use localStorage as a simple web alternative

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
  clear: async (): Promise<void> => {
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
  },
};

export default AsyncStorage;
