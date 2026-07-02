export type CacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
  maxBytes?: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessedAt: number;
  sizeBytes: number;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours (Persistent session cache)
const DEFAULT_MAX_ENTRIES = Infinity;
const DEFAULT_MAX_BYTES = Infinity;

const cacheStore = new Map<string, CacheEntry<unknown>>();
let totalBytes = 0;
const textEncoder = new TextEncoder();

function estimateSize(value: unknown): number {
  try {
    return textEncoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

function getNow(): number {
  return Date.now();
}

function normalizeOptions(options?: CacheOptions) {
  return {
    ttlMs: options?.ttlMs ?? DEFAULT_TTL_MS,
    maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxBytes: options?.maxBytes ?? DEFAULT_MAX_BYTES
  };
}

function removeEntry(key: string): void {
  const entry = cacheStore.get(key);
  if (!entry) return;
  totalBytes = Math.max(0, totalBytes - entry.sizeBytes);
  cacheStore.delete(key);
}

function pruneExpired(now: number): void {
  for (const [key, entry] of cacheStore.entries()) {
    if (entry.expiresAt <= now) {
      removeEntry(key);
    }
  }
}

function pruneToLimits(maxEntries: number, maxBytes: number): void {
  if (cacheStore.size <= maxEntries && totalBytes <= maxBytes) return;

  const sorted = Array.from(cacheStore.entries()).sort(
    ([, a], [, b]) => a.accessedAt - b.accessedAt
  );

  while (
    cacheStore.size > maxEntries ||
    totalBytes > maxBytes
  ) {
    const oldest = sorted.shift();
    if (!oldest) break;
    removeEntry(oldest[0]);
  }
}

export function clearExpiredCache(): void {
  pruneExpired(getNow());
}

export function clearAllCache(): void {
  cacheStore.clear();
  totalBytes = 0;
}

export function getCachedValue<T>(key: string): T | undefined {
  const now = getNow();
  pruneExpired(now);

  const entry = cacheStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    removeEntry(key);
    return undefined;
  }

  entry.accessedAt = now;
  return entry.value;
}

export function setCachedValue<T>(key: string, value: T, options?: CacheOptions): void {
  const now = getNow();
  const { ttlMs, maxEntries, maxBytes } = normalizeOptions(options);
  const boundedEntries = Math.max(maxEntries, DEFAULT_MAX_ENTRIES);
  const boundedBytes = Math.max(maxBytes, DEFAULT_MAX_BYTES);

  if (value === undefined) return;
  const sizeBytes = estimateSize(value);
  if (sizeBytes > boundedBytes) return;

  pruneExpired(now);

  const prev = cacheStore.get(key);
  if (prev) {
    totalBytes = Math.max(0, totalBytes - prev.sizeBytes);
  }

  const entry: CacheEntry<T> = {
    value,
    createdAt: now,
    accessedAt: now,
    sizeBytes,
    expiresAt: now + ttlMs
  };

  cacheStore.set(key, entry);
  totalBytes += sizeBytes;
  pruneToLimits(boundedEntries, boundedBytes);
}

export function clearByPrefix(prefix: string): void {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      removeEntry(key);
    }
  }
}

export async function getOrSetCachedJson<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions & { forceRefresh?: boolean }
): Promise<T> {
  const { forceRefresh, ...cacheOptions } = options ?? {};
  if (!forceRefresh) {
    const cached = getCachedValue<T>(key);
    if (cached !== undefined) return cached;
  }

  const fresh = await fetcher();
  setCachedValue(key, fresh, cacheOptions);
  return fresh;
}

export function getCacheSizeBytes(): number {
  return totalBytes;
}
