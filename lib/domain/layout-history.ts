const LAYOUT_HISTORY_PREFIX = "blotori.layout-history.v1";
const MAX_LAYOUT_HISTORY = 6;

export interface LayoutHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function savedStyleLayoutHistoryKey(styleId: string) {
  return `${LAYOUT_HISTORY_PREFIX}:${styleId}`;
}

export function categoryPresetLayoutHistoryKey(presetId: string) {
  return `${LAYOUT_HISTORY_PREFIX}:category:${presetId}`;
}

export function loadLayoutHistory(storage: LayoutHistoryStorage | null, key: string) {
  try {
    if (!storage) return [];
    const parsed = JSON.parse(storage.getItem(key) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(-MAX_LAYOUT_HISTORY)
      : [];
  } catch {
    return [];
  }
}

export function rememberLayoutFingerprint(storage: LayoutHistoryStorage | null, key: string, fingerprint?: string) {
  if (!fingerprint?.trim()) return loadLayoutHistory(storage, key);
  const next = [...loadLayoutHistory(storage, key), fingerprint.trim()].slice(-MAX_LAYOUT_HISTORY);
  try { storage?.setItem(key, JSON.stringify(next)); } catch { return next; }
  return next;
}
