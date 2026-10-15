// Node 25+ ships a global `localStorage` that shadows jsdom's and lacks the Storage
// methods unless started with --localstorage-file. Install an in-memory Storage
// for tests when that happens, so they behave the same on every Node version.
if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
}
