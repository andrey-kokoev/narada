// Node 26's experimental web-storage global can leave jsdom without a
// usable localStorage unless Node is started with --localstorage-file. Keep
// the unit environment deterministic without changing browser behavior.
if (typeof window !== 'undefined') {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  if (!storage) {
    const storageValues = new WeakMap<object, Map<string, string>>();
    const valuesFor = (owner: object) => {
      let values = storageValues.get(owner);
      if (!values) {
        values = new Map<string, string>();
        storageValues.set(owner, values);
      }
      return values;
    };
    // Keep the fallback on Storage.prototype so tests that deliberately spy
    // on the browser storage contract observe the same calls as in jsdom.
    if (typeof Storage === 'function') {
      Object.defineProperties(Storage.prototype, {
        length: { configurable: true, get() { return valuesFor(this).size; } },
        clear: { configurable: true, value() { valuesFor(this).clear(); } },
        getItem: { configurable: true, value(key: string) { return valuesFor(this).get(String(key)) ?? null; } },
        key: { configurable: true, value(index: number) { return [...valuesFor(this).keys()][index] ?? null; } },
        removeItem: { configurable: true, value(key: string) { valuesFor(this).delete(String(key)); } },
        setItem: { configurable: true, value(key: string, value: string) { valuesFor(this).set(String(key), String(value)); } },
      });
    }
    const fallbackStorage = typeof Storage === 'function' ? Object.create(Storage.prototype) : {
      get length() { return 0; },
      clear() {},
      getItem() { return null; },
      key() { return null; },
      removeItem() {},
      setItem() {},
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: fallbackStorage });
  }
}
