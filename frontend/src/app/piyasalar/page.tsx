"use client";

import React, { useState, useEffect } from 'react';
import Navbar from "@/components/Navbar";
import SymbolLogo from "@/components/SymbolLogo";
import { TrendingUp, TrendingDown, RefreshCw, Activity, Search, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { getCachedValue, setCachedValue } from '@/lib/inMemoryTTLCache';

const MARKET_TICKERS = [
  { symbol: "XU100.IS", name: "BIST 100", category: "Borsa İstanbul" },
  { symbol: "XU050.IS", name: "BIST 50", category: "Borsa İstanbul" },
  { symbol: "XU030.IS", name: "BIST 30", category: "Borsa İstanbul" },
  { symbol: "XBANK.IS", name: "BIST Banka", category: "Borsa İstanbul" },
  { symbol: "XUTEK.IS", name: "BIST Teknoloji", category: "Borsa İstanbul" },
  { symbol: "GC=F", name: "ONS Altın ($)", category: "Altın Piyasaları" },
  { symbol: "GRAM_ALTIN", name: "Gram Altın (TL)", category: "Altın Piyasaları" },
  { symbol: "CEYREK_ALTIN", name: "Çeyrek Altın (TL)", category: "Altın Piyasaları" },
  { symbol: "^GSPC", name: "S&P 500", category: "Global Endeksler" },
  { symbol: "^NDX", name: "Nasdaq 100", category: "Global Endeksler" },
  { symbol: "^IXIC", name: "Nasdaq", category: "Global Endeksler" },
  { symbol: "BTC-USD", name: "Bitcoin", category: "Kripto Paralar" },
  { symbol: "ETH-USD", name: "Ethereum", category: "Kripto Paralar" }
];

// Küçük Grafik Motoru (Sparkline)
function Sparkline({ data, color, isHovered }: { data: number[], color: string, isHovered: boolean }) {
  if (!data || data.length < 2) return <div className="h-16" />;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const width = 200;
  const height = 60;
  
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full h-16 mt-4 opacity-40 group-hover:opacity-100 transition-opacity">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          key={isHovered ? 'active' : 'idle'}
          d={`M ${points}`}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: isHovered ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
        />
        <motion.path
          d={`M 0,${height} L ${points} L ${width},${height} Z`}
          fill={`url(#gradient-${color})`}
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.8 }}
        />
      </svg>
    </div>
  );
}

import Link from 'next/link';

// Piyasa Kartı Bileşeni (Hook hatasını önlemek için)
function MarketCard({ item, idx }: { item: any, idx: number }) {
  const [isHovered, setIsHovered] = React.useState(false);
  
  const isPortfolio = item.symbol === "PORTFOY";

  return (
    <Link href={isPortfolio ? `/portfolio` : `/piyasalar/${item.symbol}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.1 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="bg-white/5 border border-white/10 p-6 rounded-[2rem] hover:border-white/20 transition-all group relative overflow-hidden backdrop-blur-md flex flex-col h-full cursor-pointer"
      >
        <div className={`absolute top-0 right-0 w-24 h-24 blur-[60px] opacity-20 pointer-events-none rounded-full transition-colors ${item.changePercent >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />

        <div className="relative z-10 flex-grow">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{ backgroundColor: `${item.changePercent >= 0 ? '#4ade80' : '#f87171'}10` }}>
                {isPortfolio ? (
                  <span className="text-lg font-black" style={{ color: item.changePercent >= 0 ? '#4ade80' : '#f87171' }}>P</span>
                ) : (
                  <SymbolLogo symbol={item.symbol} color={item.changePercent >= 0 ? "#4ade80" : "#f87171"} />
                )}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{isPortfolio ? 'PORTFÖY' : item.symbol}</p>
                <h3 className={`text-lg font-bold transition-colors line-clamp-1 ${isPortfolio ? 'group-hover:text-cyan-400 text-cyan-300' : 'group-hover:text-neon-purple text-white'}`}>{item.name}</h3>
              </div>
            </div>
            <div className={`p-3 rounded-2xl ${item.changePercent >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {item.changePercent >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <h4 className="text-3xl font-black tracking-tighter mb-1 text-white">
                {(item.category === "Kripto Paralar" || item.symbol === "GC=F") ? "$" : (item.category === "Altın Piyasaları" || isPortfolio ? "₺" : "")}
                {item.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h4>
              <div className={`text-sm font-bold flex items-center gap-1 ${item.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                <span>{item.changePercent >= 0 ? '+' : ''}{item.change?.toFixed(2)}</span>
                <span>({item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%)</span>
              </div>
            </div>
          </div>
        </div>

        <Sparkline
          data={item.history}
          color={item.changePercent >= 0 ? "#4ade80" : "#f87171"}
          isHovered={isHovered}
        />
      </motion.div>
    </Link>
  );
}

// Interactive portfolio chart
function ChartDisplay({ history, timestamps, loading, dailyChange }: { history: number[], timestamps: number[], loading: boolean, dailyChange: number }) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!history || history.length < 2) return null;

  const chartColor = dailyChange >= 0 ? "#4ade80" : "#f87171";
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min === 0 ? 1 : max - min;
  const chartW = 800;
  const chartH = 200;

  const points = history.map((val: number, idx: number) => {
    const x = (idx / (history.length - 1)) * chartW;
    const y = chartH - ((val - min) / range) * chartH;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full h-[250px] relative bg-gradient-to-b from-white/[0.02] to-transparent rounded-2xl border border-white/5 p-6">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl z-10">
          <RefreshCw className="animate-spin text-cyan-400/50" size={32} />
        </div>
      )}
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="w-full h-full overflow-visible cursor-crosshair"
        onMouseMove={(e) => {
          if (history.length < 2) return;
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * chartW;
          const idx = Math.round((x / chartW) * (history.length - 1));
          if (idx >= 0 && idx < history.length) {
            setHoveredValue(history[idx]);
            setHoveredIdx(idx);
          }
        }}
        onMouseLeave={() => { setHoveredValue(null); setHoveredIdx(null); }}
      >
        {max !== min && [min, (min+max)/2, max].map((tick, i) => (
          <text
            key={i}
            x="-5"
            y={chartH - ((tick - min) / range) * chartH}
            className="fill-gray-600 text-[10px] font-bold"
            textAnchor="end"
            alignmentBaseline="middle"
          >
            ₺{tick.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </text>
        ))}
        <line x1="0" y1={chartH - ((history[0] - min) / range) * chartH} x2={chartW} y2={chartH - ((history[0] - min) / range) * chartH} className="stroke-white/10" strokeWidth="1" strokeDasharray="4" />
        <line x1="0" y1={chartH} x2={chartW} y2={chartH} className="stroke-white/5" strokeWidth="1" />
        <defs>
          <linearGradient id="portfolioChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M 0,${chartH} L ${points} L ${chartW},${chartH} Z`} fill="url(#portfolioChartGrad)" className="opacity-40" />
        <motion.path
          d={`M ${points}`}
          fill="none"
          stroke={chartColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="drop-shadow-[0_0_6px_rgba(0,0,0,0.3)]"
        />
        {hoveredIdx !== null && (
          <circle
            cx={(hoveredIdx / (history.length - 1)) * chartW}
            cy={chartH - ((history[hoveredIdx] - min) / range) * chartH}
            r="6"
            fill={chartColor}
            className="drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
          />
        )}
      </svg>

      {hoveredIdx !== null && timestamps[hoveredIdx] && (
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2">
          <p className="text-xs font-bold text-white">
            ₺{(hoveredValue ?? history[history.length-1]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-400">
            {new Date(timestamps[hoveredIdx]).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  );
}

// Portfolio Section Component for logged-in users
function PortfolioSection() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState({ id: '1d', label: '1G' });
  // Hisse bazlı rate'lerden hesaplanan günlük değişim (portföy sayfasındakiyle aynı mantık)
  const [dailyChangeTL, setDailyChangeTL] = useState(0);
  const [dailyChangePercent, setDailyChangePercent] = useState(0);
  const [liveTotalValue, setLiveTotalValue] = useState(0);
  const [liveTotalCost, setLiveTotalCost] = useState(0);

  const ranges = [
    { id: '1d', label: '1G' },
    { id: '2g', label: '2G' },
    { id: '3g', label: '3G' },
    { id: '1w', label: '1H' },
  ];

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  // Portföy sayfasındakiyle aynı yöntem: her hissenin rate'inden günlük değişim hesapla
  const computeDailyChangeFromRates = async (t: string, items: any[]) => {
    try {
      const symbols = items.map((p: any) => {
        const isBist = p.name && !p.name.includes('.') && !p.name.includes('-') && !p.name.startsWith('^') && p.name.length <= 5;
        return isBist ? `${p.name}.IS` : p.name;
      });
      // USD kurunu da çekelim
      if (!symbols.includes('USDTRY=X')) symbols.push('USDTRY=X');
      
      const res = await fetch(`${API_URL}/stocks?symbols=${symbols.join(',')}`, {
        headers: { 
          Authorization: `Bearer ${t}`,
          'X-Bypass-API-Cache': '1'
        }
      });
      if (!res.ok) return;
      const pricesData = await res.json();
      const usdRate = pricesData.result?.find((s: any) => s.code === 'USDTRY=X')?.price || 33;

      let totalValue = 0;
      let totalCost = 0;
      let prevCloseValue = 0;
      items.forEach((item: any) => {
        const amount = item.amount || 0;
        const cost = item.cost || 0;
        const live = pricesData.result?.find((s: any) => 
          s.code === item.name || s.code === `${item.name}.IS` || s.code === item.name?.replace('.IS', '')
        );
        let currentPrice = live?.price || cost;
        const rate = live?.rate;
        const isUSD = live?.currency === 'USD' || item.name?.includes('-USD') || item.name?.startsWith('^') || item.name === 'GC=F';
        
        // USD ise TL'ye çevir
        if (isUSD) currentPrice *= usdRate;

        totalValue += amount * currentPrice;
        totalCost += amount * cost; // Maliyeti de canlı datadan hesapla
        if (rate && rate !== 0) {
          prevCloseValue += amount * (currentPrice / (1 + rate / 100));
        } else {
          prevCloseValue += amount * currentPrice;
        }
      });
      // Portfolyo sayfasıyla aynı mantığa (Değer * Oran / 100) çekildi
      let totalDailyChange = 0;
      items.forEach((item: any) => {
        const amount = item.amount || 0;
        const cost = item.cost || 0;
        const live = pricesData.result?.find((s: any) => 
          s.code === item.name || s.code === `${item.name}.IS` || s.code === item.name?.replace('.IS', '')
        );
        let currentPrice = live?.price || cost;
        const rate = live?.rate || 0;
        const isUSD = live?.currency === 'USD' || item.name?.includes('-USD') || item.name?.startsWith('^') || item.name === 'GC=F';
        if (isUSD) currentPrice *= usdRate;

        totalDailyChange += (amount * currentPrice) * (rate / 100);
      });

      const changePct = totalValue > 0 ? (totalDailyChange / (totalValue - totalDailyChange)) * 100 : 0;
      setDailyChangeTL(totalDailyChange);
      setDailyChangePercent(changePct);
      setLiveTotalValue(totalValue);
      setLiveTotalCost(totalCost);
    } catch (err) {
      console.error('Daily change calculation error:', err);
    }
  };

  const fetchPortfolioHistory = async (t: string, range: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/portfolio/history?range=${range}`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      const data = await res.json();
      if (data.success) {
        setHistoryData(data);
      }
    } catch (err) {
      console.error('Portfolio history error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async (t: string) => {
    try {
      const res = await fetch(`${API_URL}/portfolio`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPortfolio(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          computeDailyChangeFromRates(t, data);
        }
      }
    } catch (err) {
      console.error('Portfolio fetch error:', err);
    }
  };

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem('token');
    setToken(t);
    if (t) {
      fetchPortfolio(t);
      fetchPortfolioHistory(t, timeRange.id);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchPortfolioHistory(token, timeRange.id);
    }
  }, [token, timeRange]);

  if (!mounted) return null;

  return null;
}



export default function PiyasalarPage() {
  const [mounted, setMounted] = useState(false);
  const [marketData, setMarketData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [portfolioIndex, setPortfolioIndex] = useState<any>(null);
  const [userToken, setUserToken] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  const CACHE_TTL_MS = 60_000;

  const fetchPortfolioIndex = async (token: string, forceRefresh = false, silent = false) => {
    const cacheKey = `piyasalar:portfolioIndex:${token}`;
    if (!forceRefresh) {
      const cachedPortfolioIndex = getCachedValue<any>(cacheKey);
      if (cachedPortfolioIndex !== undefined) {
        setPortfolioIndex(cachedPortfolioIndex);
        return;
      }
    }

    if (!silent) setLoading(true);
    try {
      const portRes = await fetch(`${API_URL}/portfolio`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!portRes.ok) { setPortfolioIndex(null); return; }
      const portfolio = await portRes.json();
      if (!Array.isArray(portfolio) || portfolio.length === 0) { setPortfolioIndex(null); return; }

      const symbols = portfolio.map((p: any) => {
        const isBist = p.name && !p.name.includes('.') && !p.name.includes('-') && !p.name.startsWith('^') && p.name.length <= 5;
        return isBist ? `${p.name}.IS` : p.name;
      });

      const [pricesRes, histRes] = await Promise.all([
        fetch(`${API_URL}/stocks?symbols=${symbols.join(',')}`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'X-Bypass-API-Cache': '1'
          }
        }),
        fetch(`${API_URL}/portfolio/history?range=1d`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'X-Bypass-API-Cache': '1'
          }
        })
      ]);

      const pricesData = pricesRes.ok ? await pricesRes.json() : { result: [] };
      const histData = histRes.ok ? await histRes.json() : null;
      const usdRate = pricesData.result?.find((s: any) => s.code === 'USDTRY=X')?.price || 33;

      let totalValue = 0;
      let prevCloseValue = 0;

      portfolio.forEach((item: any) => {
        const amount = item.amount || 0;
        const cost = item.cost || 0;
        const live = pricesData.result?.find((s: any) => 
          s.code === item.name || s.code === `${item.name}.IS` || s.code === item.name?.replace('.IS', '')
        );
        let currentPrice = live?.price || cost;
        const rate = live?.rate;
        const isUSD = live?.currency === 'USD' || item.name?.includes('-USD') || item.name?.startsWith('^') || item.name === 'GC=F';

        if (isUSD) currentPrice *= usdRate;

        totalValue += amount * currentPrice;
        if (rate && rate !== 0) {
          prevCloseValue += amount * (currentPrice / (1 + rate / 100));
        } else {
          prevCloseValue += amount * currentPrice;
        }
      });
      const dailyChange = totalValue - prevCloseValue;
      const dailyChangePercent = prevCloseValue > 0 ? (dailyChange / prevCloseValue) * 100 : 0;

      // History'yi backend'den al (sparkline için)
      const sparkHistory = histData?.history || [];

      const generatedPortfolioIndex = {
        symbol: "PORTFOY",
        name: "Portföy Endeksi",
        category: "Portföyüm",
        price: totalValue,
        change: dailyChange,
        changePercent: dailyChangePercent,
        history: histData?.history || []
      };

      setPortfolioIndex(generatedPortfolioIndex);
      setCachedValue(cacheKey, generatedPortfolioIndex, { ttlMs: CACHE_TTL_MS });
    } catch (err) {
      console.error('Portfolio index error:', err);
      setPortfolioIndex(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchMarkets = async (forceRefresh = false, silent = false) => {
    const cacheKey = "piyasalar:market-summary";
    if (!forceRefresh) {
      const cachedSummary = getCachedValue<any[]>(cacheKey);
      if (cachedSummary !== undefined) {
        const usdData = cachedSummary.find((d: any) => d.symbol === "USDTRY=X") || { price: 32.5 };
        const onsData = cachedSummary.find((d: any) => d.symbol === "GC=F") || { price: 2350, changePercent: 0, history: [] };

        const cachedResults = MARKET_TICKERS.map(ticker => {
          if (ticker.symbol === "GRAM_ALTIN") {
            const gramPrice = (onsData.price / 31.1035) * usdData.price;
            return {
              ...ticker,
              price: gramPrice,
              changePercent: onsData.changePercent,
              change: (gramPrice * onsData.changePercent) / 100,
              history: (onsData.history || []).map((p: number) => (p / 31.1035) * usdData.price)
            };
          }
          if (ticker.symbol === "CEYREK_ALTIN") {
            const gramPrice = (onsData.price / 31.1035) * usdData.price;
            return {
              ...ticker,
              price: gramPrice * 1.6065,
              changePercent: onsData.changePercent,
              change: (gramPrice * 1.6065 * onsData.changePercent) / 100,
              history: (onsData.history || []).map((p: number) => (p / 31.1035) * usdData.price * 1.6065)
            };
          }

          const liveData = cachedSummary.find((d: any) => d.symbol === ticker.symbol);
          return { ...ticker, ...liveData };
        });

        setMarketData(cachedResults);
        setLastUpdate(new Date());
        setLoading(false);
        return;
      }
    }

    if (!silent) setLoading(true);
    try {
      const res = await fetch(forceRefresh ? `${API_URL}/market-summary?refresh=true` : `${API_URL}/market-summary`, {
        headers: { 'X-Bypass-API-Cache': '1' }
      });
      const summaryData = await res.json();
      setCachedValue(cacheKey, summaryData, { ttlMs: CACHE_TTL_MS });

      const usdData = summaryData.find((d: any) => d.symbol === "USDTRY=X") || { price: 32.5 };
      const onsData = summaryData.find((d: any) => d.symbol === "GC=F") || { price: 2350, changePercent: 0, history: [] };

      // Altın Hesaplamaları
      const gramPrice = (onsData.price / 31.1035) * usdData.price;
      const ceyrekPrice = gramPrice * 1.6065;

      const results = MARKET_TICKERS.map(ticker => {
        if (ticker.symbol === "GRAM_ALTIN") {
          return {
            ...ticker,
            price: gramPrice,
            changePercent: onsData.changePercent,
            change: (gramPrice * onsData.changePercent) / 100,
            history: (onsData.history || []).map((p: number) => (p / 31.1035) * usdData.price)
          };
        }
        if (ticker.symbol === "CEYREK_ALTIN") {
          return {
            ...ticker,
            price: ceyrekPrice,
            changePercent: onsData.changePercent,
            change: (ceyrekPrice * onsData.changePercent) / 100,
            history: (onsData.history || []).map((p: number) => (p / 31.1035) * usdData.price * 1.6065)
          };
        }

        const liveData = summaryData.find((d: any) => d.symbol === ticker.symbol);
        return { ...ticker, ...liveData };
      });

      setMarketData(results);
      setLastUpdate(new Date());

      // Portföy endeksini sadece ilk yüklemede veya manuel yenilemede güncelle (Artık her dakika güncellenmeyecek)
    } catch (error) {
      console.error('Data fetch error:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshAllData = async (forceRefresh = false, tokenOverride?: string | null, silent = false) => {
    await fetchMarkets(forceRefresh, silent);
    const activeToken = tokenOverride ?? userToken;
    if (activeToken) {
      await fetchPortfolioIndex(activeToken, forceRefresh, silent);
    }
  };

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('token');
    setUserToken(token);
    const runRefresh = () => refreshAllData(false, token, false);
    runRefresh().then(() => {});
    
    // Silent background updates every 5 seconds, only if visible
    const runSilentRefresh = () => {
      if (document.visibilityState === 'visible') {
        refreshAllData(true, token, true);
      }
    };
    const interval = setInterval(runSilentRefresh, 5000);
    return () => clearInterval(interval);
  }, []);

  // Kategoriler (portföy endeksi varsa ekle)
  const categories = ["Borsa İstanbul", "Altın Piyasaları", "Global Endeksler", "Kripto Paralar", ...(portfolioIndex ? ["Portföyüm"] : [])];

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-neon-purple/30">
      <Navbar />
      
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-purple/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto pt-32 px-6 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white via-neon-purple to-purple-600">PİYASALAR</h1>
            <p className="text-gray-400 font-medium">Global ve yerel endekslerin anlık performans takibi.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Son Güncelleme</p>
              <p className="text-xs font-bold text-gray-300">{lastUpdate.toLocaleTimeString()}</p>
            </div>
            <button 
              onClick={() => refreshAllData(true)}
              disabled={loading}
              className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group disabled:opacity-50"
            >
              <RefreshCw size={20} className={`text-neon-purple ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            </button>
          </div>
        </div>

        {/* Categories */}
        {categories.map((category) => (
          <div key={category} className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <div className={`w-1.5 h-6 rounded-full shadow-[0_0_10px_rgba(0,200,255,0.5)] ${category === 'Portföyüm' ? 'bg-cyan-400' : 'bg-neon-purple'}`} />
              <h2 className="text-2xl font-black tracking-tight">{category}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
              {category === 'Portföyüm' && portfolioIndex ? (
                <MarketCard key="PORTFOY" item={portfolioIndex} idx={0} />
              ) : (
                marketData.filter(d => d.category === category).map((item, idx) => (
                  <MarketCard key={item.symbol} item={item} idx={idx} />
                ))
              )}

              {loading && marketData.length === 0 && (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-[2rem] animate-pulse h-48" />
                ))
              )}
            </div>
          </div>
        ))}

        {/* Portfolio Section */}
        <PortfolioSection />
      </div>
    </main>
  );
}
