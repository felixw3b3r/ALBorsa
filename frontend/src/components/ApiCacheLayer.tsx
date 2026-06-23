"use client";

import { useEffect } from 'react';
import {
  clearByPrefix,
  clearExpiredCache,
  getCachedValue,
  setCachedValue
} from '@/lib/inMemoryTTLCache';

type CachedResponsePayload = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

type GlobalCacheOptions = {
  ttlMs: number;
  maxEntries: number;
  maxBytes: number;
};

const GLOBAL_CACHE_PREFIX = 'api-cache:';
const GLOBAL_CACHE_OPTIONS: GlobalCacheOptions = {
  ttlMs: 60_000,
  maxEntries: 180,
  maxBytes: 24 * 1024 * 1024
};

let isPatched = false;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const NO_CACHE_PATHS = ['/auth/login', '/auth/register', '/halkaarz'];

function normalizePath(prefix: string) {
  if (!prefix.endsWith('/')) return prefix;
  return prefix.slice(0, -1);
}

function safeBodyText(value: string): string {
  return typeof value === 'string' ? value : '';
}

function buildApiBase() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';
  try {
    const parsed = new URL(apiUrl);
    return {
      origin: parsed.origin,
      pathname: parsed.pathname === '/' ? '/api' : parsed.pathname.replace(/\/$/, '')
    };
  } catch {
    return {
      origin: '',
      pathname: '/api'
    };
  }
}

function isNoCachePath(path: string): boolean {
  return NO_CACHE_PATHS.some((pathPrefix) => path.includes(pathPrefix));
}

function cacheKeyForRequest(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  return `${GLOBAL_CACHE_PREFIX}${request.url}:auth=${authorization}`;
}

function isCacheableRequest(request: Request): boolean {
  if (request.method.toUpperCase() !== 'GET') return false;

  const { origin, pathname } = buildApiBase();
  const requestUrl = new URL(request.url);

  if (origin && requestUrl.origin !== origin) return false;

  if (!requestUrl.pathname.startsWith(`${pathname}/`)) {
    if (requestUrl.pathname !== pathname) return false;
  }

  if (isNoCachePath(requestUrl.pathname)) return false;

  const accept = request.headers.get('accept');
  if (accept && !accept.includes('application/json') && accept !== '*/*') return false;

  return true;
}

function toPayload(response: Response): Promise<CachedResponsePayload> {
  return response.clone().text().then((bodyText) => ({
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body: safeBodyText(bodyText)
  }));
}

function fromPayload(payload: CachedResponsePayload): Response {
  const headers = new Headers();
  payload.headers.forEach(([name, value]) => {
    headers.set(name, value);
  });

  return new Response(payload.body, {
    status: payload.status,
    statusText: payload.statusText,
    headers
  });
}

function shouldInvalidateAfter(request: Request): string | null {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname.includes('/portfolio') || requestUrl.pathname.includes('/halkaarz') || requestUrl.pathname.includes('/auth')) {
    const { pathname } = buildApiBase();
    const normalizedPath = normalizePath(pathname);
    const relativePath = requestUrl.pathname.startsWith(normalizedPath)
      ? requestUrl.pathname.slice(normalizedPath.length)
      : requestUrl.pathname;
    const firstSegment = relativePath.split('/').find((segment) => !!segment) || '';
    return `${GLOBAL_CACHE_PREFIX}${requestUrl.origin}${normalizedPath}/${firstSegment}`;
  }

  return null;
}

export default function ApiCacheLayer() {
  useEffect(() => {
    if (typeof window === 'undefined' || isPatched) {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    const inFlight = new Map<string, Promise<Response>>();

    const wrappedFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);

      if (!isCacheableRequest(request)) {
        const response = originalFetch(request);
        const invalidatePrefix = shouldInvalidateAfter(request);
        if (invalidatePrefix && request.method.toUpperCase() !== 'GET') {
          response.finally(() => {
            clearByPrefix(invalidatePrefix);
          });
        }
        return response;
      }

      const key = cacheKeyForRequest(request);
      const cachedResponse = getCachedValue<CachedResponsePayload>(key);
      if (cachedResponse) {
        return Promise.resolve(fromPayload(cachedResponse));
      }

      if (inFlight.has(key)) {
        return inFlight.get(key)!;
      }

      const fetchPromise = originalFetch(request)
        .then(async (response) => {
          if (response.ok) {
            const payload = await toPayload(response);
            setCachedValue(key, payload, GLOBAL_CACHE_OPTIONS);
          }
          return response;
        })
        .catch((error) => {
          throw error;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, fetchPromise);
      return fetchPromise;
    };

    window.fetch = wrappedFetch;
    isPatched = true;

    if (!cleanupInterval) {
      cleanupInterval = setInterval(() => {
        clearExpiredCache();
      }, 30_000);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearExpiredCache();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
      isPatched = false;
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
