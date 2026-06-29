export type IPOSummary = {
  name: string;
  symbol: string;
  status?: string;
  date: string;
  logo: string;
  details?: Record<string, string>;
};

export type IPODetail = Record<string, unknown> & {
  symbol: string;
  title: string;
  logo: string;
  date: string;
  price: string;
  distribution: string;
  lots: string;
  manager: string;
  market: string;
  size: string;
  method: {
    capitalIncrease: string;
    partnerSale: string;
  };
  balanceSheet?: Array<{
    year: string;
    revenue: string;
    profit: string;
  }>;
  estimates?: Array<{
    participants: string;
    lots: string;
    amount: string;
  }>;
  fundUsage: Array<{
    area: string;
    ratio: number;
  }>;
  allocation: Array<{
    group: string;
    ratio: number;
    lot: string;
    description?: string;
  }>;
  t1t2: string;
  stability: string;
  index: string;
  extra: {
    float: string;
    discount: string;
    highThreshold?: string;
  };
  error?: string;
};

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const IPO_TTL_MS = 10 * 60_000;

let listCache: CacheEntry<IPOSummary[]> | null = null;
let listRequest: Promise<IPOSummary[]> | null = null;

const detailCache = new Map<string, CacheEntry<IPODetail>>();
const detailRequests = new Map<string, Promise<IPODetail>>();

function now() {
  return Date.now();
}

function isFresh<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > now();
}

function normalizeApiUrl(apiUrl: string) {
  return apiUrl.replace(/\/$/, '');
}

function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Halka arz verisi alinamadi: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getCachedIpoListSnapshot(): IPOSummary[] | null {
  return isFresh(listCache) ? listCache.data : null;
}

export function getCachedIpoDetailSnapshot(symbol: string): IPODetail | null {
  const entry = detailCache.get(normalizeSymbol(symbol));
  return isFresh(entry) ? entry.data : null;
}

export async function fetchIpoList(apiUrl: string): Promise<IPOSummary[]> {
  const cached = getCachedIpoListSnapshot();
  if (cached) return cached;

  if (!listRequest) {
    listRequest = fetchJson<IPOSummary[]>(`${normalizeApiUrl(apiUrl)}/halkaarz`)
      .then((data) => {
        listCache = {
          data,
          expiresAt: now() + IPO_TTL_MS
        };
        return data;
      })
      .finally(() => {
        listRequest = null;
      });
  }

  return listRequest;
}

export async function fetchIpoDetail(apiUrl: string, symbol: string): Promise<IPODetail> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const cached = getCachedIpoDetailSnapshot(normalizedSymbol);
  if (cached) return cached;

  const existingRequest = detailRequests.get(normalizedSymbol);
  if (existingRequest) return existingRequest;

  const request = fetchJson<IPODetail>(`${normalizeApiUrl(apiUrl)}/halkaarz/${normalizedSymbol}`)
    .then((data) => {
      detailCache.set(normalizedSymbol, {
        data,
        expiresAt: now() + IPO_TTL_MS
      });
      return data;
    })
    .finally(() => {
      detailRequests.delete(normalizedSymbol);
    });

  detailRequests.set(normalizedSymbol, request);
  return request;
}
