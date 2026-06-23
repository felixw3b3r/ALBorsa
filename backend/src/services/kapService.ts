import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import path from 'path';

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

export interface KapFinancialReport {
  disclosureIndex: number;
  symbol: string;
  stockCodes: string[];
  companyTitle: string;
  subject: string;
  summary: string;
  disclosureClass: string;
  disclosureType: string;
  publishDate: Date | null;
  periodYear: number | null;
  periodQuarter: number | null;
  attachmentCount: number;
  detailUrl: string;
  attachments?: KapFinancialAttachment[];
  attachmentFetchedAt?: Date;
  raw: KapDisclosure;
}

export interface KapFinancialAttachment {
  title: string;
  fileName: string;
  url: string;
  kind: 'pdf' | 'excel' | 'xbrl' | 'html' | 'other';
  extension: string | null;
}

export interface KapDownloadedAttachmentFile extends KapFinancialAttachment {
  disclosureIndex: number;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storagePath: string;
  downloadedAt: Date;
  parseStatus: 'downloaded' | 'skipped' | 'failed';
}

let disclosuresCache: KapDisclosure[] = [];
let lastFetchTime = 0;
let fetchPromise: Promise<void> | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 dakika (Playwright olmadığından daha hızlı)

const MAX_ATTACHMENT_BYTES = Number(process.env.KAP_ATTACHMENT_MAX_BYTES || 25 * 1024 * 1024);

function attachmentStorageRoot(): string {
  return path.resolve(process.env.KAP_ATTACHMENT_DIR || path.join(process.cwd(), 'storage', 'kap-attachments'));
}

function isKapUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.kap.org.tr' || parsed.hostname === 'kap.org.tr';
  } catch {
    return false;
  }
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 140);
  return cleaned || 'kap-attachment';
}

function isPathInside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeText(value: string | undefined | null): string {
  return (value || '')
    .toString()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isFinancialReportDisclosure(disclosure: KapDisclosure): boolean {
  const text = normalizeText([
    disclosure.subject,
    disclosure.summary,
    disclosure.disclosureClass,
    disclosure.disclosureType
  ].join(' '));

  return [
    'finansal rapor',
    'finansal tablo',
    'faaliyet raporu',
    'bagimsiz denetim',
    'sorumluluk beyani',
    'gelir tablosu',
    'bilanco'
  ].some(keyword => text.includes(keyword));
}

function parsePublishDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferPeriod(text: string): { periodYear: number | null; periodQuarter: number | null } {
  const normalized = normalizeText(text);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const periodMatch = normalized.match(/\b(20\d{2})\s*[/-]\s*(3|6|9|12)\b/);
  const month = periodMatch ? Number(periodMatch[2]) : null;

  return {
    periodYear: yearMatch ? Number(yearMatch[1]) : null,
    periodQuarter: month ? Math.ceil(month / 3) : null
  };
}

function toFinancialReport(disclosure: KapDisclosure, requestedSymbol: string): KapFinancialReport {
  const stockCodes = (disclosure.stockCodes || '')
    .split(/[,\s;]+/)
    .map(code => code.trim().toUpperCase())
    .filter(Boolean);
  const period = inferPeriod(`${disclosure.subject || ''} ${disclosure.summary || ''}`);

  return {
    disclosureIndex: disclosure.disclosureIndex,
    symbol: requestedSymbol,
    stockCodes,
    companyTitle: disclosure.kapTitle,
    subject: disclosure.subject,
    summary: disclosure.summary,
    disclosureClass: disclosure.disclosureClass,
    disclosureType: disclosure.disclosureType,
    publishDate: parsePublishDate(disclosure.publishDate),
    periodYear: period.periodYear,
    periodQuarter: period.periodQuarter,
    attachmentCount: disclosure.attachmentCount || 0,
    detailUrl: `https://www.kap.org.tr/tr/Bildirim/${disclosure.disclosureIndex}`,
    raw: disclosure
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteKapUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return `https://www.kap.org.tr${href}`;
  return `https://www.kap.org.tr/${href}`;
}

function attachmentKind(url: string, text: string): KapFinancialAttachment['kind'] {
  const source = normalizeText(`${url} ${text}`);
  if (source.includes('.pdf') || source.includes('pdf')) return 'pdf';
  if (source.includes('.xlsx') || source.includes('.xls') || source.includes('excel')) return 'excel';
  if (source.includes('.xml') || source.includes('xbrl')) return 'xbrl';
  if (source.includes('.html') || source.includes('html')) return 'html';
  return 'other';
}

function fileExtension(url: string): string | null {
  const cleanUrl = url.split('?')[0].split('#')[0];
  const match = cleanUrl.match(/\.([a-zA-Z0-9]{2,6})$/);
  return match ? match[1].toLowerCase() : null;
}

function fileNameFromUrl(url: string, fallback: string): string {
  const cleanUrl = decodeURIComponent(url.split('?')[0].split('#')[0]);
  const name = cleanUrl.split('/').filter(Boolean).pop();
  return name || fallback;
}

function extractAttachmentLinks(html: string): KapFinancialAttachment[] {
  const links = new Map<string, KapFinancialAttachment>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = decodeHtml(match[1]);
    const label = decodeHtml(match[2].replace(/<[^>]*>/g, ''));
    const url = absoluteKapUrl(href);
    const searchable = normalizeText(`${href} ${label}`);
    const looksLikeAttachment = [
      'ek-indir',
      'download',
      'attachment',
      'bildirimpdf',
      'bildirimpdf',
      'xbrl',
      '.pdf',
      '.xls',
      '.xlsx',
      '.xml',
      '.html'
    ].some(token => searchable.includes(token));

    if (!looksLikeAttachment) continue;
    if (links.has(url)) continue;

    const extension = fileExtension(url);
    links.set(url, {
      title: label || 'KAP Eki',
      fileName: fileNameFromUrl(url, label || 'kap-attachment'),
      url,
      kind: attachmentKind(url, label),
      extension
    });
  }

  return Array.from(links.values());
}

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

export async function fetchFinancialReportsBySymbol(symbol: string, options: {
  pageSize?: number;
  maxPages?: number;
  refresh?: boolean;
} = {}): Promise<KapFinancialReport[]> {
  const requestedSymbol = symbol.toUpperCase().replace('.IS', '').trim();
  const pageSize = Math.max(25, Math.min(options.pageSize || 100, 200));
  const maxPages = Math.max(1, Math.min(options.maxPages || 3, 10));
  const KapFinancialReportModel = mongoose.model('KapFinancialReport');

  if (!options.refresh) {
    const cached = await KapFinancialReportModel
      .find({ stockCodes: requestedSymbol })
      .sort({ publishDate: -1, disclosureIndex: -1 })
      .limit(pageSize)
      .lean();

    if (cached.length > 0) {
      return cached as unknown as KapFinancialReport[];
    }
  }

  const reports: KapFinancialReport[] = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const response = await axios.post(
      'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
      {
        pageSize,
        pageIndex,
        disclosureClass: 'ALL',
        disclosureType: 'ALL',
        stockCodes: requestedSymbol,
        memberType: 'ALL',
        subject: '',
        orderByField: 'publishDate',
        orderByType: 'desc'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
          'Origin': 'https://www.kap.org.tr',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': 'lang=tr'
        },
        timeout: 20000
      }
    );

    const pageData: KapDisclosure[] = Array.isArray(response.data) ? response.data : [];
    if (pageData.length === 0) break;

    for (const disclosure of pageData) {
      const codes = (disclosure.stockCodes || '').split(/[,\s;]+/).map(code => code.trim().toUpperCase());
      if (!codes.includes(requestedSymbol)) continue;
      if (!isFinancialReportDisclosure(disclosure)) continue;

      const report = toFinancialReport(disclosure, requestedSymbol);
      reports.push(report);

      await KapFinancialReportModel.findOneAndUpdate(
        { disclosureIndex: report.disclosureIndex },
        report,
        { upsert: true, returnDocument: 'after' }
      );
    }

    if (pageData.length < pageSize) break;
  }

  if (reports.length === 0) {
    const cached = await KapFinancialReportModel
      .find({ stockCodes: requestedSymbol })
      .sort({ publishDate: -1, disclosureIndex: -1 })
      .limit(pageSize)
      .lean();
    return cached as unknown as KapFinancialReport[];
  }

  return reports.sort((a, b) => {
    const aTime = a.publishDate ? a.publishDate.getTime() : 0;
    const bTime = b.publishDate ? b.publishDate.getTime() : 0;
    return bTime - aTime;
  });
}

export async function fetchFinancialReportAttachments(disclosureIndex: number, options: {
  refresh?: boolean;
} = {}): Promise<KapFinancialAttachment[]> {
  const KapFinancialReportModel = mongoose.model('KapFinancialReport');
  const existing: any = await KapFinancialReportModel.findOne({ disclosureIndex }).lean();

  if (!options.refresh && existing?.attachments?.length > 0) {
    return existing.attachments as KapFinancialAttachment[];
  }

  const detailUrl = existing?.detailUrl || `https://www.kap.org.tr/tr/Bildirim/${disclosureIndex}`;
  const response = await axios.get(detailUrl, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
      'Cookie': 'lang=tr'
    },
    timeout: 20000
  });

  const attachments = extractAttachmentLinks(String(response.data || ''));
  await KapFinancialReportModel.findOneAndUpdate(
    { disclosureIndex },
    {
      $set: {
        detailUrl,
        attachments,
        attachmentFetchedAt: new Date(),
        parseStatus: attachments.length > 0 ? 'attachments_found' : 'no_attachments_found'
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  return attachments;
}

export async function downloadFinancialReportAttachment(
  disclosureIndex: number,
  attachment: KapFinancialAttachment,
  options: { refresh?: boolean } = {}
): Promise<KapDownloadedAttachmentFile> {
  if (!isKapUrl(attachment.url)) {
    throw new Error('KAP disi attachment URL reddedildi.');
  }

  const KapAttachmentFileModel = mongoose.model('KapAttachmentFile');
  const existing: any = await KapAttachmentFileModel.findOne({
    disclosureIndex,
    attachmentUrl: attachment.url
  }).lean();

  if (!options.refresh && existing?.storagePath) {
    return existing as KapDownloadedAttachmentFile;
  }

  const response = await axios.get<ArrayBuffer>(attachment.url, {
    responseType: 'arraybuffer',
    headers: {
      'Accept': '*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `https://www.kap.org.tr/tr/Bildirim/${disclosureIndex}`,
      'Cookie': 'lang=tr'
    },
    timeout: 30000,
    maxContentLength: MAX_ATTACHMENT_BYTES,
    maxBodyLength: MAX_ATTACHMENT_BYTES,
    validateStatus: status => status >= 200 && status < 300
  });

  const buffer = Buffer.from(response.data);
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment boyutu limit asimi: ${buffer.length} bytes`);
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const root = attachmentStorageRoot();
  const reportDir = path.resolve(root, String(disclosureIndex));
  const safeName = sanitizeFileName(attachment.fileName || attachment.title || 'kap-attachment');
  const finalName = `${sha256.slice(0, 16)}-${safeName}`;
  const storagePath = path.resolve(reportDir, finalName);

  if (!isPathInside(root, storagePath)) {
    throw new Error('Attachment storage path guvenlik kontrolunu gecemedi.');
  }

  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(storagePath, buffer);

  const record = {
    disclosureIndex,
    attachmentUrl: attachment.url,
    url: attachment.url,
    title: attachment.title,
    fileName: attachment.fileName,
    kind: attachment.kind,
    extension: attachment.extension,
    contentType: String(response.headers['content-type'] || 'application/octet-stream'),
    sizeBytes: buffer.length,
    sha256,
    storagePath,
    downloadedAt: new Date(),
    parseStatus: 'downloaded' as const
  };

  await KapAttachmentFileModel.findOneAndUpdate(
    { disclosureIndex, attachmentUrl: attachment.url },
    record,
    { upsert: true, returnDocument: 'after' }
  );

  return record as KapDownloadedAttachmentFile;
}

export async function downloadFinancialReportAttachments(disclosureIndex: number, options: {
  refresh?: boolean;
} = {}) {
  const attachments = await fetchFinancialReportAttachments(disclosureIndex, {
    refresh: options.refresh
  });

  const files = [];
  const failed = [];

  for (const attachment of attachments) {
    try {
      const file = await downloadFinancialReportAttachment(disclosureIndex, attachment, options);
      files.push(file);
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (error: any) {
      failed.push({
        attachment,
        error: error?.message || String(error)
      });
    }
  }

  const KapFinancialReportModel = mongoose.model('KapFinancialReport');
  await KapFinancialReportModel.findOneAndUpdate(
    { disclosureIndex },
    {
      $set: {
        parseStatus: files.length > 0 ? 'downloaded' : 'download_failed',
        attachmentDownloadedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );

  return {
    disclosureIndex,
    attachments: attachments.length,
    downloaded: files.length,
    failed: failed.length,
    files,
    errors: failed
  };
}

export async function downloadFinancialReportAttachmentsBySymbol(symbol: string, options: {
  limit?: number;
  refresh?: boolean;
} = {}) {
  const syncResult = await syncFinancialReportAttachmentsBySymbol(symbol, {
    limit: options.limit || 10,
    refresh: options.refresh
  });

  const results = [];
  for (const report of syncResult.results) {
    if (!('disclosureIndex' in report)) continue;
    try {
      const result = await downloadFinancialReportAttachments(report.disclosureIndex, {
        refresh: options.refresh
      });
      results.push(result);
    } catch (error: any) {
      results.push({
        disclosureIndex: report.disclosureIndex,
        attachments: 0,
        downloaded: 0,
        failed: 1,
        error: error?.message || String(error)
      });
    }
  }

  return {
    symbol: symbol.toUpperCase().replace('.IS', ''),
    reports: results.length,
    downloaded: results.reduce((sum, item: any) => sum + (item.downloaded || 0), 0),
    failed: results.reduce((sum, item: any) => sum + (item.failed || 0), 0),
    results
  };
}

export async function syncFinancialReportAttachmentsBySymbol(symbol: string, options: {
  limit?: number;
  refresh?: boolean;
} = {}) {
  const requestedSymbol = symbol.toUpperCase().replace('.IS', '').trim();
  const limit = Math.max(1, Math.min(options.limit || 10, 50));
  const reports = await fetchFinancialReportsBySymbol(requestedSymbol, {
    pageSize: Math.max(100, limit),
    maxPages: 3,
    refresh: options.refresh
  });

  const selected = reports.slice(0, limit);
  let found = 0;
  const results = [];

  for (const report of selected) {
    try {
      const attachments = await fetchFinancialReportAttachments(report.disclosureIndex, {
        refresh: options.refresh
      });
      found += attachments.length;
      results.push({
        disclosureIndex: report.disclosureIndex,
        attachmentCount: attachments.length,
        attachments
      });
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error: any) {
      results.push({
        disclosureIndex: report.disclosureIndex,
        attachmentCount: 0,
        error: error?.message || String(error)
      });
    }
  }

  return {
    symbol: requestedSymbol,
    reports: selected.length,
    attachments: found,
    results
  };
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
