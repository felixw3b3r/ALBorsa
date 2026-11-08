"use client";
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './turnusol.module.css';
import SymbolSuggestions from './SymbolSuggestions';

type Draft = { category: string; symbol: string; date: string; amount: string };
type Result = { symbol: string; date: string; amount: number; tlReturn: number; usdReturn: number; realReturn: number; currency?: "TL" | "USD"; purchaseUsd?: number; purchaseTl?: number; currentUsd?: number; currentTl?: number; purchaseRate?: number; currentRate?: number; purchaseUnitPrice?: number; currentUnitPrice?: number; unitCurrency?: 'TL' | 'USD'; priceDate?: string };
type Saved = { _id: string; createdAt: string; assets: Result[] };
const empty = (): Draft => ({ category: 'BIST', symbol: '', date: '', amount: '' });
const api = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

export default function TurnusolCompare({ warm, onOpenChange }: { warm: boolean; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = useState<'new' | 'history' | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([empty(), empty()]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [closing, setClosing] = useState(false);
  useEffect(() => { onOpenChange(view !== null); return () => onOpenChange(false); }, [view, onOpenChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  const update = (index: number, patch: Partial<Draft>) => { setResults(null); setDrafts(items => items.map((item, i) => i === index ? { ...item, ...patch } : item)); };
  const request = async (path: string) => { const r = await fetch(`${api}${path}`, { headers: { ...headers(), 'X-Bypass-API-Cache': '1' } }); if (!r.ok) throw Error('Veriler alınamadı. Sembolleri kontrol edip tekrar deneyin.'); return r.json(); };
  const calculate = async () => {
    setError('');
    if (drafts.some(d => !d.symbol.trim() || !d.date || d.date > new Date().toLocaleDateString('en-CA') || !(Number(d.amount) > 0))) { setError('Her varlık için sembol, geçerli alış tarihi ve pozitif tutar girin.'); return; }
    setBusy(true);
    try {
      const normalized = drafts.map(d => ({ ...d, symbol: d.category === 'ALTIN' ? d.symbol : d.category === 'KRİPTO' && !d.symbol.toUpperCase().includes('-') ? `${d.symbol.toUpperCase()}-USD` : d.symbol.trim().toUpperCase() }));
      const symbols = normalized.map(d => d.category === 'ALTIN' ? 'GC=F' : d.category === 'BIST' && !d.symbol.endsWith('.IS') ? `${d.symbol}.IS` : d.symbol);
      const [quotes, rates] = await Promise.all([request(`/stocks?symbols=${encodeURIComponent([...new Set(symbols)].join(','))}`), request('/exchange-rate')]);
      const usdNow = Number(rates.result?.find((r: { code: string; selling: number }) => r.code === 'USD')?.selling);
      if (!(usdNow > 0) || !quotes.success) throw Error('Güncel fiyatlar alınamadı.');
      const next = await Promise.all(normalized.map(async (d, i) => {
        const query = (symbol: string, market: string) => `/historical?${new URLSearchParams({ symbol, date: d.date, market })}`;
        const [past, usdPast] = await Promise.all([request(query(d.category === 'ALTIN' ? 'GC=F' : d.symbol, d.category === 'BIST' ? 'BIST 100' : 'GLOBAL')), request(query('USDTRY=X', 'GLOBAL'))]);
        const quote = quotes.result?.find((q: { code: string; price: number }) => q.code?.toUpperCase() === symbols[i]);
        const current = Number(quote?.price); const pastUsd = Number(usdPast.price);
        const usdAsset = d.category !== 'BIST';
        const pastPrice = Number(usdAsset ? past.rawPrice : past.price);
        if (!(current > 0 && pastPrice > 0 && pastUsd > 0)) throw Error(`${d.symbol} için karşılaştırma verisi eksik.`);
        const ratio = current / pastPrice;
        const tlRatio = usdAsset ? ratio * usdNow / pastUsd : ratio;
        const usdRatio = usdAsset ? ratio : ratio * pastUsd / usdNow;
        const amount = Number(d.amount);
        const currency: 'TL' | 'USD' = d.category === 'NASDAQ' || d.category === 'KRİPTO' ? 'USD' : 'TL';
        const purchaseTl = currency === 'USD' ? amount * pastUsd : amount;
        const purchaseUsd = purchaseTl / pastUsd;
        const currentTl = purchaseTl * tlRatio;
        const currentUsd = currentTl / usdNow;
        const isLocalGold = d.symbol === 'GRAM_ALTIN' || d.symbol === 'CEYREK_ALTIN';
        const goldFactor = (d.symbol === 'CEYREK_ALTIN' ? 1.6065 : 1) / 31.1035;
        const purchaseUnitPrice = isLocalGold ? pastPrice * goldFactor * pastUsd : pastPrice;
        const currentUnitPrice = isLocalGold ? current * goldFactor * usdNow : current;
        const unitCurrency: 'TL' | 'USD' = isLocalGold || d.category === 'BIST' ? 'TL' : 'USD';
        const priceDate = past.date && !Number.isNaN(new Date(past.date).getTime()) ? new Date(past.date).toISOString().slice(0, 10) : undefined;
        return { symbol: d.symbol, date: d.date, amount, currency, purchaseTl, purchaseUsd, currentTl, currentUsd, purchaseRate: pastUsd, currentRate: usdNow, purchaseUnitPrice, currentUnitPrice, unitCurrency, priceDate, tlReturn: (tlRatio - 1) * 100, usdReturn: (usdRatio - 1) * 100, realReturn: (usdRatio - 1) * 100 };
      }));
      setResults(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Veriler alınamadı.'); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!results) { setError('Kaydetmeden önce karşılaştırmayı hesaplayın.'); setClosing(false); return; }
    setBusy(true); setError('');
    try { const r = await fetch(`${api}/turnusols`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ assets: results }) }); if (!r.ok) throw Error('Kayıt başarısız.'); setClosing(false); setView(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Kayıt başarısız.'); setClosing(false); } finally { setBusy(false); }
  };
  const history = async () => { setView('history'); setBusy(true); setError(''); try { setSaved(await request('/turnusols')); } catch { setError('Geçmiş turnusollar alınamadı.'); } finally { setBusy(false); } };
  const equalizeDates = () => {
    const earliest = drafts.map(d => d.date).filter(Boolean).sort()[0];
    if (!earliest) { setError('Önce en az bir varlık için alış tarihi girin.'); return; }
    setDrafts(items => items.map(item => ({ ...item, date: earliest })));
    setResults(null); setError('');
  };
  const open = () => { setDrafts([empty(), empty()]); setResults(null); setError(''); setView('new'); };
  const money = (value: number | undefined, symbol: string) => value == null ? '—' : symbol + value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const unitPrice = (value: number | undefined, currency?: 'TL' | 'USD') => value == null ? '—' : (currency === 'USD' ? '$' : '₺') + value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 8 : 2 });
  const table = (items: Result[]) => <div className={styles.tableWrap}><table><thead><tr><th>Kriter</th>{items.map((a, i) => <th key={i}>{a.symbol}<small>{a.date}</small></th>)}</tr></thead><tbody>
    <tr><th>Alış tarihindeki birim fiyat</th>{items.map((a, i) => <td key={i}>{unitPrice(a.purchaseUnitPrice, a.unitCurrency)}{a.priceDate && <small>Fiyat tarihi: {a.priceDate}</small>}</td>)}</tr>
    <tr><th>Hesaplama anındaki birim fiyat</th>{items.map((a, i) => <td key={i}>{unitPrice(a.currentUnitPrice, a.unitCurrency)}{(a.symbol === 'GRAM_ALTIN' || a.symbol === 'CEYREK_ALTIN') && <small>Ons ve kurdan yaklaşık hesaplanır</small>}</td>)}</tr>
    <tr><th>Yatırılan tutar</th>{items.map((a, i) => <td key={i}>{money(a.amount, a.currency === 'USD' ? '$' : '₺')}<small>Alış kuru: {money(a.purchaseRate, '₺')} / USD</small></td>)}</tr>
    <tr><th>Alış değeri (TL)</th>{items.map((a, i) => <td key={i}>{money(a.purchaseTl, '₺')}</td>)}</tr>
    <tr><th>Alış değeri (USD)</th>{items.map((a, i) => <td key={i}>{money(a.purchaseUsd, '$')}</td>)}</tr>
    <tr><th>Güncel değer (TL)</th>{items.map((a, i) => <td key={i}>{money(a.currentTl, '₺')}<small>Güncel kur: {money(a.currentRate, '₺')} / USD</small></td>)}</tr>
    <tr><th>Güncel değer (USD)</th>{items.map((a, i) => <td key={i}>{money(a.currentUsd, '$')}</td>)}</tr>
    {([['TL nominal getiri', 'tlReturn'], ['Dolar bazlı reel getiri', 'usdReturn']] as const).map(([label, key]) => <tr key={key}><th>{label}</th>{items.map((a, i) => { const v = a[key]; return <td key={i} className={v >= 0 ? styles.positive : styles.negative}>%{v.toFixed(2)}</td>; })}</tr>)}
  </tbody></table></div>;
  return <><div className={`${styles.actions} ${warm ? styles.warmActions : ''}`}><button onClick={open}>＋ Yeni turnusol başlat</button><button onClick={history}>Geçmiş turnusol sonuçları</button></div>{view && createPortal(<div className={`${styles.overlay} ${warm ? styles.warm : ''}`}><section role="dialog" aria-modal="true" aria-label={view === 'new' ? 'Yeni turnusol' : 'Geçmiş turnusollar'} className={styles.panel}><header><div><span>ALBORSA / TURNUSOL</span><h2>{view === 'new' ? 'Yeni turnusol' : 'Geçmiş turnusollar'}</h2>{view !== 'new' && <p>Kaydettiğiniz karşılaştırmalar</p>}</div><button onClick={() => view === 'new' ? setClosing(true) : setView(null)} aria-label="Kapat">✕</button></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {view === 'new' ? <><div className={styles.dateTools}><button type="button" onClick={equalizeDates}>Tarihleri eşitle</button><span>Girilen en eski tarih tüm varlıklara uygulanır.</span></div><div className={styles.grid}>{drafts.map((d, i) => <div className={styles.card} key={i}><div className={styles.cardTitle}><strong>Varlık {i + 1}</strong>{drafts.length > 2 && <button onClick={() => { setDrafts(x => x.filter((_, n) => n !== i)); setResults(null); }}>Kaldır</button>}</div><label>Piyasa<select value={d.category} onChange={e => update(i, { category: e.target.value, symbol: e.target.value === 'ALTIN' ? 'GC=F' : '', amount: '' })}><option>BIST</option><option>NASDAQ</option><option>ALTIN</option><option>KRİPTO</option></select></label><label>Sembol{d.category === 'ALTIN' ? <select value={d.symbol} onChange={e => update(i, { symbol: e.target.value })}><option value="GC=F">Ons altın</option><option value="GRAM_ALTIN">Gram altın</option><option value="CEYREK_ALTIN">Çeyrek altın</option></select> : <SymbolSuggestions category={d.category} value={d.symbol} onChange={symbol => update(i, { symbol })} />}</label><label>Alış tarihi<input type="date" value={d.date} onChange={e => update(i, { date: e.target.value })} /></label><label>Yatırılan tutar ({d.category === 'NASDAQ' || d.category === 'KRİPTO' ? '$' : '₺'})<input type="number" min="0" step="any" value={d.amount} onChange={e => update(i, { amount: e.target.value })} /></label></div>)}</div><div className={styles.controls}>{drafts.length < 5 && <button onClick={() => setDrafts(x => [...x, empty()])}>＋ Varlık ekle</button>}<button onClick={calculate} disabled={busy}>{busy ? 'Hesaplanıyor...' : 'Karşılaştır'}</button></div>{results && <><h3>Karşılaştırma sonuçları</h3>{table(results)}<p className={styles.note}>Dolar getirisi, alış değerinin alış tarihindeki kurla ve güncel değerin güncel kurla dolara çevrilmesiyle hesaplanır. Eski kayıtlarda kur ve değer ayrıntıları bulunmayabilir.</p></>}</> : <div className={styles.history}>{busy ? 'Yükleniyor...' : saved.length === 0 ? 'Henüz kayıtlı turnusol yok.' : saved.map(item => <details key={item._id}><summary>{item.assets.slice(0, 2).map(a => a.symbol).join(' / ')} <span>{new Date(item.createdAt).toLocaleDateString('tr-TR')}</span></summary>{table(item.assets)}</details>)}</div>}
    {closing && <div className={styles.confirm}><div><h3>Turnusolu kapat</h3><p>Sonuçları hesabınıza kaydetmek ister misiniz?</p><div className={styles.controls}><button onClick={() => setClosing(false)}>Vazgeç</button><button onClick={() => { setClosing(false); setView(null); }}>Kaydetmeden çık</button><button disabled={busy} onClick={save}>Turnusolu kaydet</button></div></div></div>}
  </section></div>, document.body)}</>;
}
