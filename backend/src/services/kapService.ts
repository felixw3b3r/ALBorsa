import axios from 'axios';

export interface KapDisclosure {
  publishDate: string;
  kapTitle: string;
  summary: string;
  subject: string;
  disclosureIndex: number;
  stockCodes: string;
  disclosureClass: string;
  disclosureType: string;
  attachmentCount: number;
}

let disclosuresCache: KapDisclosure[] = [];
let lastFetchTime = 0;
let fetchPromise: Promise<void> | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 dakika (Playwright olmadığından daha hızlı)

async function fetchDisclosures(): Promise<void> {
  const now = Date.now();
  const age = now - lastFetchTime;

  if (lastFetchTime > 0) {
    console.log(`[KAP] fetchDisclosures() — cache: ${disclosuresCache.length} kayit, yas: ${Math.round(age / 1000)}s`);
  }
  if (age < CACHE_TTL && disclosuresCache.length > 0) {
    console.log('[KAP] Cache gecerli, fetch atlanıyor');
    return;
  }
  if (fetchPromise) {
    console.log('[KAP] Devam eden fetch var, bekleniyor...');
    return fetchPromise;
  }

  fetchPromise = (async () => {
    const start = Date.now();
    console.log('[KAP] KAP API\'sine direkt istek atılıyor...');
    try {
      // KAP'ın güncel API endpoint'i
      const response = await axios.post(
        'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
        {
          pageSize: 100,
          pageIndex: 0,
          disclosureClass: "ALL",
          disclosureType: "ALL",
          stockCodes: "",
          memberType: "ALL",
          subject: "",
          orderByField: "publishDate",
          orderByType: "desc"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
            'Origin': 'https://www.kap.org.tr',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': 'lang=tr'
          },
          timeout: 20000
        }
      );

      const apiData: KapDisclosure[] = Array.isArray(response.data) ? response.data : [];

      if (apiData.length > 0) {
        const seen = new Set<number>();
        disclosuresCache = apiData.filter(d => {
          if (seen.has(d.disclosureIndex)) return false;
          seen.add(d.disclosureIndex);
          return true;
        });
        lastFetchTime = Date.now();
        const elapsed = Date.now() - start;
        const stockCodes = [...new Set(disclosuresCache.map(d => d.stockCodes).filter(Boolean))];
        console.log(`✅ [KAP] ${disclosuresCache.length} bildirim yüklendi (${elapsed}ms) — ${stockCodes.length} hisse kodu`);
      } else {
        // API boş döndüyse fallback: GET isteği ile dene
        console.warn('[KAP] POST boş döndü, GET fallback deneniyor...');
        const getRes = await axios.get(
          'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
          {
            params: { pageSize: 200, pageIndex: 0 },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
            },
            timeout: 15000
          }
        );
        const fallbackData: KapDisclosure[] = Array.isArray(getRes.data) ? getRes.data : [];
        if (fallbackData.length > 0) {
          disclosuresCache = fallbackData;
          lastFetchTime = Date.now();
          console.log(`✅ [KAP] GET fallback: ${disclosuresCache.length} bildirim yüklendi`);
        } else {
          console.warn('[KAP] Her iki yöntem de veri döndürmedi');
        }
      }
    } catch (error: any) {
      console.error(`❌ [KAP] API fetch hatası: ${error.message}`);
      // Eski cache'i koru — crash yerine eski veri göster
      if (disclosuresCache.length > 0) {
        console.log(`[KAP] Eski cache korunuyor (${disclosuresCache.length} kayit)`);
        lastFetchTime = Date.now() - CACHE_TTL + 60000; // 1 dakika sonra tekrar dene
      }
    } finally {
      fetchPromise = null;
      console.log(`[KAP] Fetch tamamlandı (${Date.now() - start}ms) — cache: ${disclosuresCache.length} kayit`);
    }
  })();

  return fetchPromise;
}

export function getCachedDisclosures(): KapDisclosure[] {
  return disclosuresCache;
}

export function getDisclosuresByStock(stockCode: string): KapDisclosure[] {
  const upper = stockCode.toUpperCase().replace('.IS', '');
  if (disclosuresCache.length === 0) {
    console.log(`[KAP] getDisclosuresByStock("${upper}") — cache boş`);
    return [];
  }
  const matched = disclosuresCache.filter(d =>
    d.stockCodes && d.stockCodes.split(',').some((code: string) => code.trim() === upper)
  );
  console.log(`[KAP] "${upper}" için ${matched.length} eşleşme bulundu (toplam: ${disclosuresCache.length})`);
  return matched;
}

export async function ensureDisclosuresLoaded(): Promise<void> {
  const cacheAge = lastFetchTime > 0 ? Date.now() - lastFetchTime : -1;
  const needsFetch = disclosuresCache.length === 0 || cacheAge > CACHE_TTL;
  console.log(`[KAP] ensureDisclosuresLoaded() — cache: ${disclosuresCache.length}, yenile: ${needsFetch}`);
  if (needsFetch) {
    await fetchDisclosures();
  }
}

export function getLastFetchTime(): number {
  return lastFetchTime;
}
