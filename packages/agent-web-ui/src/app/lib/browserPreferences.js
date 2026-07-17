export const AGENT_WEB_UI_PREFERENCE_KEYS = Object.freeze({
  projectionVerbosity: 'narada:agent-web-ui:projection-verbosity.v1',
  projectionViews: 'narada:agent-web-ui:projection-views.v1',
  headerItems: 'narada:agent-web-ui:header-items.v2',
  statusBoxes: 'narada:agent-web-ui:status-boxes.v3',
  statusRowOpen: 'narada:agent-web-ui:status-row-open.v1',
  operatorFooterItems: 'narada:agent-web-ui:operator-footer-items.v1',
  operatorQueueOpen: 'narada:agent-web-ui:operator-queue-open.v1',
  operatorSnippets: 'narada:agent-web-ui:operator-snippets.v1',
});

export function readJsonPreference(key, fallback, storage = browserStorage()) {
  const raw = safeGetItem(storage, key);
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJsonPreference(key, value, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readStringPreference(key, fallback, storage = browserStorage()) {
  return safeGetItem(storage, key) ?? fallback;
}

export function writeStringPreference(key, value, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readBooleanPreference(key, fallback, storage = browserStorage()) {
  const stored = safeGetItem(storage, key);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

export function writeBooleanPreference(key, value, storage = browserStorage()) {
  return writeStringPreference(key, String(value), storage);
}

function browserStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGetItem(storage, key) {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
