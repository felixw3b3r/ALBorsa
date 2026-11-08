"use client";
import { useEffect, useId, useState } from 'react';
import { ALL_BIST_STOCKS, BIST_STOCK_NAMES, NASDAQ500_STOCKS, normalizeSearchText } from '@/lib/stockCatalog';
import styles from './turnusol.module.css';

type Suggestion = { symbol: string; name: string };
const crypto: Suggestion[] = [
  { symbol: 'BTC-USD', name: 'Bitcoin' }, { symbol: 'ETH-USD', name: 'Ethereum' },
  { symbol: 'SOL-USD', name: 'Solana' }, { symbol: 'XRP-USD', name: 'XRP' },
  { symbol: 'DOGE-USD', name: 'Dogecoin' }, { symbol: 'ADA-USD', name: 'Cardano' },
  { symbol: 'AVAX-USD', name: 'Avalanche' }, { symbol: 'BNB-USD', name: 'BNB' }
];
const api = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

export default function SymbolSuggestions({ category, value, onChange }: { category: string; value: string; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const id = useId();
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || !focused) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, market: category });
        const response = await fetch(`${api}/symbol-search?${params}`, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'X-Bypass-API-Cache': '1' } });
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted && Array.isArray(data)) setRemote(data);
        }
      } catch { /* Local suggestions remain available. */ }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, value, focused]);
  const query = normalizeSearchText(value.trim());
  const catalog = category === 'BIST' ? ALL_BIST_STOCKS.map(symbol => ({ symbol, name: BIST_STOCK_NAMES[symbol] || symbol })) : category === 'NASDAQ' ? NASDAQ500_STOCKS.map(symbol => ({ symbol, name: symbol })) : crypto;
  const matches = query ? catalog.filter(item => normalizeSearchText(item.symbol).includes(query) || normalizeSearchText(item.name).includes(query)) : [];
  const combined = [...matches, ...remote.filter(item => normalizeSearchText(item.symbol).includes(query) || normalizeSearchText(item.name).includes(query))];
  const suggestions = combined.filter((item, index) => combined.findIndex(other => other.symbol === item.symbol) === index).slice(0, 8);
  const select = (symbol: string) => { onChange(symbol); setFocused(false); setRemote([]); setActive(-1); };
  return <div className={styles.symbolField}><input role="combobox" aria-label="Varlık kodu veya adı" aria-autocomplete="list" aria-expanded={focused && suggestions.length > 0} aria-controls={id} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} value={value} placeholder={category === 'BIST' ? 'Kod veya şirket adı' : category === 'KRİPTO' ? 'Kod veya coin adı' : 'Kod veya şirket adı'} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setActive(-1); }} onChange={e => { setRemote([]); setActive(-1); onChange(e.target.value.toUpperCase()); }} onKeyDown={e => { if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActive(i => Math.min(i + 1, suggestions.length - 1)); } else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); } else if (e.key === 'Enter' && focused && suggestions[active]) { e.preventDefault(); select(suggestions[active].symbol); } else if (e.key === 'Escape') { setFocused(false); setActive(-1); } }} />{focused && suggestions.length > 0 && <ul id={id} role="listbox" className={styles.suggestions}>{suggestions.map((item, index) => <li key={item.symbol} id={`${id}-${index}`} role="option" aria-selected={index === active}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => select(item.symbol)}><strong>{item.symbol}</strong><span>{item.name}</span></button></li>)}</ul>}</div>;
}
