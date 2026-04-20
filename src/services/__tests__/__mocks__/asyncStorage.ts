// Test-only mock of @react-native-async-storage/async-storage.
// Simple in-memory Map; reset between tests via clearMocks + the reset() helper.

const store = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return store.has(key) ? (store.get(key) as string) : null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    store.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    store.delete(key);
  },
  getAllKeys: async (): Promise<string[]> => {
    return Array.from(store.keys());
  },
  clear: async (): Promise<void> => {
    store.clear();
  },
  // Test helper — not part of the real API; used in beforeEach to reset state.
  __reset: (): void => {
    store.clear();
  },
};

export default AsyncStorage;
