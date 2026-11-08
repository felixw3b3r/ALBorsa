"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, PieChart, Activity, MoreVertical, Plus, Edit2, Check, X, Trash2, RefreshCw, Search } from 'lucide-react';
import Navbar from '@/components/Navbar';
import PortfolioWarmNav from '@/components/PortfolioWarmNav';
import styles from './portfolio-warm.module.css';
import { useRouter } from 'next/navigation';

import { ALL_BIST_STOCKS, BIST_STOCK_NAMES, NASDAQ500_STOCKS, normalizeSearchText } from '@/lib/stockCatalog';

interface StockWheelPickerProps {
  stocks: any[];
  hoveredStock: string | null;
  setHoveredStock: (name: string | null) => void;
}

function StockWheelPicker({ stocks, hoveredStock, setHoveredStock }: StockWheelPickerProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const itemHeight = 72;
  const gap = 12;
  const spacingAngle = 26;
  const scrollStepHeight = 160; // Decoupled from visual item height to prevent wheel scroll skipping on Windows
  const angleRatio = spacingAngle / scrollStepHeight;
  const radius = 175;
  const containerHeight = 360;

  const totalItems = stocks.length;
  const maxScroll = totalItems > 0 ? (totalItems - 1) * scrollStepHeight : 0;

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[360px] text-gray-500 font-medium">
        Henüz hisse eklenmemiş.
      </div>
    );
  }

  return (
    <div className="relative w-full h-[360px] select-none">
      <style dangerouslySetInnerHTML={{
        __html: `
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />

      {/* 1. Static Visual 3D Cylinder Container (Outside scroll container) */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          perspective: '1000px',
          transformStyle: 'preserve-3d',
          maskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, transparent)',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {stocks.map((stock, i) => {
            const angle = (i * spacingAngle) - (scrollTop * angleRatio);
            const angleRad = angle * Math.PI / 180;
            const y = radius * Math.sin(angleRad);
            const z = radius * (Math.cos(angleRad) - 1);

            const absAngle = Math.abs(angle);
            const opacity = Math.max(0, 1 - absAngle / 70);
            const scale = Math.max(0.6, 1 - absAngle / 180 * 0.35);

            if (opacity <= 0) return null;

            return (
              <div
                key={stock.name}
                className="absolute left-4 right-4 pointer-events-none"
                style={{
                  height: `${itemHeight}px`,
                  top: '50%',
                  marginTop: `-${itemHeight / 2}px`,
                  transform: `translateY(${y}px) translateZ(${z}px) rotateX(${angle}deg) scale(${scale})`,
                  opacity: opacity,
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
              >
                <div
                  onMouseEnter={() => setHoveredStock(stock.name)}
                  onMouseLeave={() => setHoveredStock(null)}
                  className={`${styles.wheelItem} w-full h-full p-4 rounded-2xl border cursor-pointer shadow-lg flex items-center justify-between pointer-events-auto transition-all duration-200`}
                  style={{
                    transform: hoveredStock === stock.name ? `scale(1.05)` : `scale(1)`,
                    backgroundColor: hoveredStock === stock.name ? `${stock.color}15` : 'rgba(255,255,255,0.05)',
                    borderColor: hoveredStock === stock.name ? stock.color : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: stock.color,
                        boxShadow: `0 0 10px ${stock.color}`
                      }}
                    />
                    <span className="font-bold text-lg">{stock.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      {stock.isForeignStock ? '$' : '₺'}
                      {stock.value.toLocaleString(undefined, { maximumFractionDigits: stock.isForeignStock ? 2 : 0 })}
                    </p>
                    <p className="text-xs text-gray-500">%{stock.percentage} Ağırlık</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Interactive Scroll Container (Overlaying on top, relative z-10) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-auto scrollbar-none snap-y snap-mandatory relative z-10"
      >
        <div style={{ height: `${maxScroll + containerHeight}px`, position: 'relative', width: '100%' }}>
          {stocks.map((_, i) => (
            <div
              key={`snap-${i}`}
              className="absolute left-0 w-full snap-center"
              style={{
                top: `${i * scrollStepHeight + (containerHeight / 2) - (scrollStepHeight / 2)}px`,
                height: `${scrollStepHeight}px`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const [warmTheme, setWarmTheme] = useState(false);
  useEffect(() => { setWarmTheme(localStorage.getItem('alborsa-landing-theme') === 'warm'); }, []);
  const changeTheme = (warm: boolean) => { localStorage.setItem('alborsa-landing-theme', warm ? 'warm' : 'dark'); setWarmTheme(warm); };
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [livePrices, setLivePrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredStock, setHoveredStock] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState("BIST 100");
  const [usdRate, setUsdRate] = useState<number>(0);
  const [historicalRates, setHistoricalRates] = useState<Record<string, number>>({});
  const [weeklyData, setWeeklyData] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; prices: Record<string, number> }>({ key: '', status: 'loading', prices: {} });
  const [monthlyData, setMonthlyData] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; prices: Record<string, number> }>({ key: '', status: 'loading', prices: {} });
  const [weeklyRetry, setWeeklyRetry] = useState(0);
  const [monthlyRetry, setMonthlyRetry] = useState(0);
  const [weeklyDay, setWeeklyDay] = useState(() => new Date().toLocaleDateString('en-CA'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    
    // Fetch USD rate and Portfolio in parallel, then set mounted & loading states
    const initData = async () => {
      setLoading(true);
      await Promise.all([fetchUsdRate(), fetchPortfolio()]);
      setMounted(true);
      setLoading(false);
    };
    initData();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchPortfolio();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        Promise.all([fetchUsdRate(), fetchPortfolio()]);
      }
    };

    const interval = setInterval(refreshWhenVisible, 5000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim().toUpperCase());
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchTerm]);


  const [newStock, setNewStock] = useState({
    name: "",
    amount: 0,
    cost: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
    color: "#00f2ff"
  });

  const API_URL = React.useMemo(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (configuredUrl) {
      return configuredUrl.endsWith('/') ? configuredUrl.slice(0, -1) : configuredUrl;
    }

    if (typeof window === 'undefined') {
      return 'http://localhost:5000/api';
    }

    const host = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      ? 'localhost'
      : window.location.hostname;
    return `http://${host}:5000/api`;
  }, []);
  const suggestionMatches = React.useMemo(() => {
    if (!showSuggestions) return [];
    const symbols = selectedMarket === "BIST 100" ? ALL_BIST_STOCKS : NASDAQ500_STOCKS;
    if (!debouncedSearchTerm) return symbols.slice(0, 20);
    const search = normalizeSearchText(debouncedSearchTerm);
    return symbols
      .filter(symbol => {
        const name = selectedMarket === "BIST 100" ? BIST_STOCK_NAMES[symbol] || "" : "";
        return normalizeSearchText(symbol).includes(search) || normalizeSearchText(name).includes(search);
      })
      .slice(0, 20);
  }, [debouncedSearchTerm, selectedMarket, showSuggestions]);
  const hasSuggestionMatch = suggestionMatches.length > 0;

  // Use calendar dates rather than UTC timestamps for the rolling seven-day window.
  useEffect(() => {
    const timer = setInterval(() => setWeeklyDay(new Date().toLocaleDateString('en-CA')), 60000);
    return () => clearInterval(timer);
  }, []);
  const weeklyKey = JSON.stringify(portfolio.map(item => [item._id, item.name, item.amount, item.cost, item.purchaseDate]));
  useEffect(() => {
    let cancelled = false;
    const items = JSON.parse(weeklyKey) as [string, string, number, number, string][];
    if (!items.length) return;
    const baseline = new Date(`${weeklyDay}T12:00:00`);
    baseline.setDate(baseline.getDate() - 7);
    const baselineDate = baseline.toLocaleDateString('en-CA');
    const requests = new Map<string, Promise<number>>();
    const getPrice = (symbol: string, date: string, market: string) => {
      const key = `${symbol}|${date}|${market}`;
      if (!requests.has(key)) {
        const params = new URLSearchParams({ symbol, date, market });
        requests.set(key, fetch(`${API_URL}/historical?${params}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(async response => {
          if (!response.ok) throw new Error('Geçmiş fiyat alınamadı');
          const data = await response.json();
          const returnedDate = new Date(data.date);
          const requestedEnd = new Date(`${date}T23:59:59`);
          if (!data.success || !Number.isFinite(data.rawPrice) || data.rawPrice <= 0 || !Number.isFinite(returnedDate.getTime()) || returnedDate > requestedEnd) throw new Error('Geçersiz geçmiş fiyat');
          return data.rawPrice as number;
        }));
      }
      return requests.get(key)!;
    };
    setWeeklyData({ key: weeklyKey + weeklyDay, status: 'loading', prices: {} });
    Promise.all(items.map(async ([id, name, amount, cost, purchaseDate]) => {
      const date = typeof purchaseDate === 'string' ? purchaseDate.slice(0, 10) : '';
      if (!id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > weeklyDay || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !Number.isFinite(Number(cost)) || Number(cost) <= 0) throw new Error('Eksik pozisyon bilgisi');
      const foreign = !name.toUpperCase().endsWith('.IS') && !ALL_BIST_STOCKS.includes(name.toUpperCase());
      const boughtInWindow = date >= baselineDate;
      const priceDate = boughtInWindow ? date : baselineDate;
      const price = boughtInWindow ? Number(cost) : await getPrice(name, priceDate, foreign ? 'NASDAQ' : 'BIST 100');
      const rate = foreign ? await getPrice('USDTRY=X', priceDate, 'GLOBAL') : 1;
      return [id, price * rate] as const;
    })).then(entries => {
      if (!cancelled) setWeeklyData({ key: weeklyKey + weeklyDay, status: 'ready', prices: Object.fromEntries(entries) });
    }).catch(() => {
      if (!cancelled) setWeeklyData({ key: weeklyKey + weeklyDay, status: 'error', prices: {} });
    });
    return () => { cancelled = true; };
  }, [weeklyKey, weeklyDay, weeklyRetry, API_URL]);
  useEffect(() => {
    let cancelled = false;
    const items = JSON.parse(weeklyKey) as [string, string, number, number, string][];
    if (!items.length) return;
    const baseline = new Date(`${weeklyDay}T12:00:00`);
    baseline.setDate(baseline.getDate() - 30);
    const baselineDate = baseline.toLocaleDateString('en-CA');
    const requests = new Map<string, Promise<number>>();
    const getPrice = (symbol: string, date: string, market: string) => {
      const key = `${symbol}|${date}|${market}`;
      if (!requests.has(key)) {
        const params = new URLSearchParams({ symbol, date, market });
        requests.set(key, fetch(`${API_URL}/historical?${params}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(async response => {
          if (!response.ok) throw new Error('Geçmiş fiyat alınamadı');
          const data = await response.json();
          const returnedDate = new Date(data.date);
          const requestedEnd = new Date(`${date}T23:59:59`);
          if (!data.success || !Number.isFinite(data.rawPrice) || data.rawPrice <= 0 || !Number.isFinite(returnedDate.getTime()) || returnedDate > requestedEnd) throw new Error('Geçersiz geçmiş fiyat');
          return data.rawPrice as number;
        }));
      }
      return requests.get(key)!;
    };
    setMonthlyData({ key: weeklyKey + weeklyDay, status: 'loading', prices: {} });
    Promise.all(items.map(async ([id, name, amount, cost, purchaseDate]) => {
      const date = typeof purchaseDate === 'string' ? purchaseDate.slice(0, 10) : '';
      if (!id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > weeklyDay || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !Number.isFinite(Number(cost)) || Number(cost) <= 0) throw new Error('Eksik pozisyon bilgisi');
      const foreign = !name.toUpperCase().endsWith('.IS') && !ALL_BIST_STOCKS.includes(name.toUpperCase());
      const boughtInWindow = date >= baselineDate;
      const priceDate = boughtInWindow ? date : baselineDate;
      const price = boughtInWindow ? Number(cost) : await getPrice(name, priceDate, foreign ? 'NASDAQ' : 'BIST 100');
      const rate = foreign ? await getPrice('USDTRY=X', priceDate, 'GLOBAL') : 1;
      return [id, price * rate] as const;
    })).then(entries => {
      if (!cancelled) setMonthlyData({ key: weeklyKey + weeklyDay, status: 'ready', prices: Object.fromEntries(entries) });
    }).catch(() => {
      if (!cancelled) setMonthlyData({ key: weeklyKey + weeklyDay, status: 'error', prices: {} });
    });
    return () => { cancelled = true; };
  }, [weeklyKey, weeklyDay, monthlyRetry, API_URL]);

  const handleDeleteStock = async (name: string) => {
    if (!confirm(`${name || 'İsimsiz varlık'} silinsin mi?`)) return;
    try {
      const encodedName = name ? encodeURIComponent(name) : "undefined";
      const response = await fetch(`${API_URL}/portfolio/${encodedName}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        setEditingStock(null);
        await fetchPortfolio();
      } else {
        alert("Hisse silinemedi.");
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert("Silme işlemi sırasında bir hata oluştu.");
    }
  };

  const fetchLivePrices = async (symbols: string[]) => {
    if (symbols.length === 0) return [];
    try {
      const response = await fetch(`${API_URL}/stocks?symbols=${symbols.join(',')}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'X-Bypass-API-Cache': '1'
        }
      });
      const data = await response.json();
      if (data.success && data.result) {
        return data.result;
      }
    } catch (error) {
      console.error('Live prices error:', error);
    }
    return [];
  };

  const fetchUsdRate = async () => {
    try {
      const response = await fetch(`${API_URL}/exchange-rate`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success && data.result) {
        const usd = data.result.find((r: any) => r.code === "USD" || r.name === "Amerikan Doları");
        if (usd) {
          const rawSelling = usd.selling;
          const parsedRate = typeof rawSelling === 'string'
            ? parseFloat(rawSelling.replace(',', '.'))
            : rawSelling;
          setUsdRate(parsedRate || 0);
        }
      }
    } catch (error) {
      console.error('USD Rate error:', error);
    }
  };

  const fetchYahooPrices = async (symbols: string[]) => {
    // Bu fonksiyon artık gereksiz, fetchLivePrices kullanıyoruz
  };

  const fetchHistoricalPrice = async () => {
    const symbol = newStock.name || searchTerm;
    const token = localStorage.getItem('token');

    if (!token) {
      alert("Oturum süreniz dolmuş, lütfen tekrar giriş yapın.");
      return;
    }

    if (!symbol || !newStock.purchaseDate) {
      alert("Lütfen önce hisse seçin ve tarih belirleyin.");
      return;
    }

    try {
      setFetchingHistorical(true);
      const response = await fetch(`${API_URL}/historical?symbol=${symbol}&date=${newStock.purchaseDate}&market=${selectedMarket}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        alert("Geçersiz token. Lütfen tekrar giriş yapın.");
        return;
      }

      const data = await response.json();

      if (data.success && data.price) {
        setNewStock({ ...newStock, cost: Number(data.price.toFixed(2)) });
      } else {
        alert(data.message || "O tarih için fiyat bulunamadı.");
      }
    } catch (error) {
      console.error("Historical fetch error:", error);
      alert("Fiyat çekilirken bir hata oluştu.");
    } finally {
      setFetchingHistorical(false);
    }
  };

  // Backend'den verileri çek
  // (Buradaki useEffect kaldırıldı çünkü yukarıdaki mount useEffect içinde hallediliyor)

  const fetchHistoricalPriceForEdit = async () => {
    const token = localStorage.getItem('token');

    if (!token) {
      alert("Oturum süreniz dolmuş, lütfen tekrar giriş yapın.");
      return;
    }

    if (!editingStock.name || !editingStock.purchaseDate) {
      alert("Lütfen tarih belirleyin.");
      return;
    }

    try {
      setFetchingHistorical(true);
      // Piyasayı belirle (NASDAQ listesindeyse ona göre gönder)
      const market = NASDAQ500_STOCKS.includes(editingStock.name) ? "NASDAQ 500" : "BIST 100";
      const response = await fetch(`${API_URL}/historical?symbol=${editingStock.name}&date=${editingStock.purchaseDate}&market=${market}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        alert("Geçersiz token. Lütfen tekrar giriş yapın.");
        return;
      }

      const data = await response.json();

      if (data.success && data.price) {
        setEditingStock({ ...editingStock, cost: Number(data.price.toFixed(2)) });
      } else {
        alert(data.message || "O tarih için fiyat bulunamadı.");
      }
    } catch (error) {
      console.error("Historical fetch error:", error);
      alert("Fiyat çekilirken bir hata oluştu.");
    } finally {
      setFetchingHistorical(false);
    }
  };

  const [fetchingHistorical, setFetchingHistorical] = useState(false);

  const calculateDaysAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const purchase = new Date(dateStr);
    const today = new Date();
    const pDate = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate());
    const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffTime = Math.abs(tDate.getTime() - pDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 0 ? "Bugün" : `${diffDays} gün önce`;
  };

  const fetchPortfolio = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setPortfolio([]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/portfolio`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        setPortfolio([]);
        return;
      }

      const data = await response.json();
      const portfolioData = Array.isArray(data) ? data : [];

      if (portfolioData.length > 0) {
        const symbols = portfolioData.map((p: any) => {
          if (ALL_BIST_STOCKS.includes(p.name)) return `${p.name}.IS`;
          return p.name;
        });

        // Start fetching live prices and historical rates in parallel
        const livePricesPromise = fetchLivePrices(symbols);

        const histRates: Record<string, number> = {};
        
        // Read cached rates from localStorage
        let cachedRates: Record<string, number> = {};
        try {
          const stored = localStorage.getItem('bistai_historical_rates');
          if (stored) {
            cachedRates = JSON.parse(stored);
          }
        } catch (e) {
          console.error('Error reading historical rates cache:', e);
        }

        const historicalPromise = Promise.all(portfolioData.map(async (item: any) => {
          if (item.purchaseDate) {
            const date = item.purchaseDate.split('T')[0];
            const cacheKey = `${item._id}:${date}`;

            if (cachedRates[cacheKey] !== undefined) {
              histRates[item._id] = cachedRates[cacheKey];
              return;
            }

            try {
              const res = await fetch(`${API_URL}/historical?symbol=USDTRY=X&date=${date}&market=GLOBAL`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const json = await res.json();
              if (json.success) {
                histRates[item._id] = json.price;
                cachedRates[cacheKey] = json.price;
              }
            } catch (e) {
              console.error('Error fetching historical USD rate for portfolio item:', e);
            }
          }
        })).then(() => {
          // Write updated cache to localStorage
          try {
            localStorage.setItem('bistai_historical_rates', JSON.stringify(cachedRates));
          } catch (e) {
            console.error('Error writing historical rates cache:', e);
          }
        });

        // Await both promises concurrently
        const [livePricesData] = await Promise.all([livePricesPromise, historicalPromise]);

        // Atomically set all states together to prevent rendering intermediate/partially loaded states
        setLivePrices(livePricesData);
        setHistoricalRates(histRates);
        setPortfolio(portfolioData);
      } else {
        setPortfolio([]);
        setLivePrices([]);
        setHistoricalRates({});
      }
    } catch (error) {
      console.error('Portfolio fetch error:', error);
      if (error instanceof TypeError) {
        console.error('API URL veya ağ bağlantısını kontrol edin:', API_URL);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/portfolio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editingStock),
      });
      if (response.ok) {
        await fetchPortfolio(); // Veriyi tekrar çek
        setEditingStock(null);
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handleCreateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = newStock.name || searchTerm;

    if (!finalName) {
      alert("Lütfen bir hisse seçin veya sembol girin.");
      return;
    }

    try {
      const stockColors: { [key: string]: string } = {
        "THYAO": "#ff4d4d", "ASELS": "#7c3aed", "EREGL": "#00f2ff", "SISE": "#33ff77",
        "GARAN": "#ffcc00", "AKBNK": "#ff66aa", "KCHOL": "#ff9955", "SAHOL": "#66aaff"
      };
      const color = stockColors[finalName] || `hsl(${Math.random() * 360}, 70%, 60%)`;

      const response = await fetch(`${API_URL}/portfolio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ...newStock, name: finalName, color }),
      });
      if (response.ok) {
        await fetchPortfolio();
        setIsAdding(false);
        setIsManual(false);
        setSearchTerm(""); // Arama kutusunu temizle
        setNewStock({ name: "", amount: 0, cost: 0, purchaseDate: new Date().toISOString().split('T')[0], color: "#00f2ff" });
      } else {
        const errorData = await response.json();
        alert(errorData.message || "Hisse eklenirken bir hata oluştu.");
      }
    } catch (error) {
      console.error('Add error:', error);
      alert("Sunucuya bağlanırken bir hata oluştu.");
    }
  };

  // Her hisse ismine özel sabit bir renk üret
  const getStockColor = (name: string, index: number) => {
    const colors = ["#7c3aed", "#00f2ff", "#ff4d4d", "#33ff77", "#ffcc00", "#ff66aa", "#ff9955", "#66aaff"];
    return colors[index % colors.length];
  };

  // Verileri güncel değerlerle (Adet * Maliyet) hazırla
  const processedData = portfolio.map((item, index) => {
    // Canlı fiyatı bul
    const liveStock = livePrices.find(s => {
      const search = (item.name || "").toString().trim().toUpperCase();
      const code = (s.code || "").toString().trim().toUpperCase();
      // BIST hisselerinde backend'den .IS takısı gelebilir, her iki duruma da bak
      return code === search || code === `${search}.IS`;
    });

    const normalizedName = (item.name || "").toString().trim().toUpperCase();
    const isForeignStock = Boolean(normalizedName) && !normalizedName.endsWith('.IS') && !ALL_BIST_STOCKS.includes(normalizedName);

    // Original values in their respective currency (USD for foreign, TL for BIST)
    let costOriginal = item.cost;
    const currentPriceOriginal = liveStock ? (liveStock.price || 0) : item.cost;

    // Auto-detect if the stored cost was entered/saved in TL instead of USD
    if (isForeignStock && costOriginal > 0 && currentPriceOriginal > 0) {
      const ratio = costOriginal / currentPriceOriginal;
      // If the ratio is close to the USD/TRY exchange rate (e.g. between 15 and 70),
      // it means the cost was stored in TL and we convert it to USD for displays & calculations.
      if (ratio > 15 && ratio < 70 && usdRate > 0) {
        costOriginal = costOriginal / usdRate;
      }
    }

    const costValueOriginal = (item.amount || 0) * costOriginal;
    const currentValueOriginal = (item.amount || 0) * currentPriceOriginal;
    const plValueOriginal = currentValueOriginal - costValueOriginal;

    // TL equivalents for calculations and display of plValue in TL
    const histUSD = historicalRates[item._id] || usdRate || 1;
    const costTL = isForeignStock && histUSD > 0 ? costOriginal * histUSD : item.cost;
    let currentPriceTL = costTL;
    if (liveStock) {
      let price = liveStock.price || 0;
      if ((liveStock.currency === "USD" || isForeignStock) && usdRate > 0) {
        price = price * usdRate;
      }
      currentPriceTL = price;
    }

    const costValueTL = (item.amount || 0) * costTL;
    const currentValueTL = (item.amount || 0) * currentPriceTL;
    const plValueTL = currentValueTL - costValueTL;

    // Matematiksel model: Alım tarihine ve günlük değişim oranına göre net günlük değişim hesaplama
    const purchase = new Date(item.purchaseDate || Date.now());
    const today = new Date();
    const pDate = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate());
    const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isBoughtToday = pDate.getTime() === tDate.getTime();

    const dailyRate = liveStock ? liveStock.rate : 0;
    let dailyChangeTL = 0;
    if (isBoughtToday) {
      // Bugün alındıysa günlük kâr/zarar, alım anından bugüne kadarki kâr/zarardır (maliyete göre)
      dailyChangeTL = plValueTL;
    } else if (dailyRate !== 0) {
      // Bugün alınmadıysa, dünkü kapanış değerine göre net günlük değişim
      dailyChangeTL = (100 + dailyRate !== 0) ? currentValueTL * (dailyRate / (100 + dailyRate)) : 0;
    }

    return {
      ...item,
      isForeignStock,
      costOriginal,
      currentPriceOriginal,
      costValueOriginal,
      currentValueOriginal,
      plValueOriginal,
      value: isForeignStock ? currentValueOriginal : currentValueTL,
      costValue: isForeignStock ? costValueOriginal : costValueTL,
      cost: costOriginal,
      currentPrice: currentPriceOriginal,
      color: item.color && item.color !== "#00f2ff" ? item.color : getStockColor(item.name, index),
      plValue: plValueOriginal,
      plPercentage: costOriginal > 0 ? ((currentPriceOriginal - costOriginal) / costOriginal) * 100 : 0,
      dailyRate: dailyRate,
      updatedAt: liveStock ? liveStock.updatedAt : null,

      // Kept for global TL stats
      valueTL: currentValueTL,
      costValueTL,
      plValueTL,
      dailyChangeTL
    };
  });

  const totalValue = processedData.reduce((acc, curr) => acc + curr.valueTL, 0);
  const totalCost = processedData.reduce((acc, curr) => acc + curr.costValueTL, 0);
  const totalPL = totalValue - totalCost;

  // Toplam günlük TL bazlı değişim (Matematiksel olarak doğru toplam)
  const totalDailyChangeTL = processedData.reduce((acc, curr) => {
    return acc + curr.dailyChangeTL;
  }, 0);

  // Ağırlıklı günlük yüzde değişim (Dünkü kapanış/baz değer üzerinden)
  const totalBaseValue = totalValue - totalDailyChangeTL;
  const totalDailyChangePercent = totalBaseValue > 0 ? (totalDailyChangeTL / totalBaseValue) * 100 : 0;

  const weeklyReady = portfolio.length > 0 && weeklyData.key === weeklyKey + weeklyDay && weeklyData.status === 'ready';
  const weeklyLiveAvailable = processedData.every(item => {
    const symbol = String(item.name || '').trim().toUpperCase();
    const quote = livePrices.find(s => [symbol, `${symbol}.IS`].includes(String(s.code || '').trim().toUpperCase()));
    return quote && Number.isFinite(Number(quote.price)) && Number(quote.price) > 0 && (!item.isForeignStock || usdRate > 0);
  });
  const weeklyBase = weeklyReady ? processedData.reduce((sum, item) => {
    // Keep the same cost normalization as the rest of the portfolio for recent purchases.
    const purchaseDate = String(item.purchaseDate).slice(0, 10);
    const start = new Date(`${weeklyDay}T12:00:00`);
    start.setDate(start.getDate() - 7);
    const adjustment = purchaseDate >= start.toLocaleDateString('en-CA') && item.isForeignStock ? item.costOriginal / Number(portfolio.find(p => p._id === item._id)?.cost) : 1;
    return sum + Number(item.amount) * weeklyData.prices[item._id] * adjustment;
  }, 0) : 0;
  const weeklyChange = totalValue - weeklyBase;
  const weeklyPercent = weeklyBase > 0 ? weeklyChange / weeklyBase * 100 : 0;
  const monthlyReady = portfolio.length > 0 && monthlyData.key === weeklyKey + weeklyDay && monthlyData.status === 'ready';
  const monthlyBase = monthlyReady ? processedData.reduce((sum, item) => {
    // Keep the same cost normalization as the rest of the portfolio for recent purchases.
    const purchaseDate = String(item.purchaseDate).slice(0, 10);
    const start = new Date(`${weeklyDay}T12:00:00`);
    start.setDate(start.getDate() - 30);
    const adjustment = purchaseDate >= start.toLocaleDateString('en-CA') && item.isForeignStock ? item.costOriginal / Number(portfolio.find(p => p._id === item._id)?.cost) : 1;
    return sum + Number(item.amount) * monthlyData.prices[item._id] * adjustment;
  }, 0) : 0;
  const monthlyChange = totalValue - monthlyBase;
  const monthlyPercent = monthlyBase > 0 ? monthlyChange / monthlyBase * 100 : 0;

  const processedWithPercentage = processedData.map(item => ({
    ...item,
    percentage: totalValue > 0 ? Math.round((item.valueTL / totalValue) * 100) : 0
  })).sort((a, b) => b.valueTL - a.valueTL);

  const maxStock = processedWithPercentage.length > 0
    ? processedWithPercentage.reduce((prev, current) => (prev.percentage > current.percentage) ? prev : current)
    : { name: "Hisse Yok", percentage: 0, color: "#7c3aed" };

  const displayStock = hoveredStock
    ? processedWithPercentage.find(s => s.name === hoveredStock)
    : maxStock;

  if (!mounted) return null;

  return (
    <main className={`min-h-screen bg-black text-white font-sans selection:bg-neon-purple/30 ${warmTheme ? styles.warm : ''}`}>
      {warmTheme ? <PortfolioWarmNav onDark={() => changeTheme(false)} /> : <><Navbar /><button type="button" onClick={() => changeTheme(true)} className={styles.themeButton}>◐ Sıcak tema</button></>}

      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-purple/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto pt-32 px-6 pb-20">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">PORTFÖYÜM</h1>
            <p className="text-gray-400 font-medium">Yapay zeka destekli varlık yönetimi ve analiz.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex items-center gap-6 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
              <div className="p-4 bg-neon-purple/20 rounded-xl">
                <Wallet className="text-neon-purple w-8 h-8" />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Toplam Bakiye</p>
                <h2 className="text-3xl font-black text-white">₺{(totalValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h2>
                <p className="text-sm font-bold text-neon-purple mt-1">
                  ${usdRate > 0 ? (totalValue / usdRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                setLoading(true);
                await Promise.all([fetchUsdRate(), fetchPortfolio()]);
                setLoading(false);
              }}
              className="bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-2xl transition-all h-full"
            >
              <RefreshCw className={`w-8 h-8 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Top Summary & Chart Area (Sketch-based) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">

          {/* Left: Stats List */}
          <div className="min-h-[480px] bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex flex-col justify-center gap-8 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <div className="group transition-transform hover:translate-x-2">
              <p className="text-sm text-neon-purple font-bold uppercase tracking-wider mb-2">
                {totalPL >= 0 ? 'Toplam Kar' : 'Toplam Zarar'}
              </p>
              <div className="flex items-center gap-3">
                <span className={`text-4xl font-black tracking-tighter ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPL >= 0 ? '+' : ''}₺{Math.trunc(totalPL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                {totalPL >= 0 ? <TrendingUp className="text-green-400 w-6 h-6" /> : <TrendingDown className="text-red-400 w-6 h-6" />}
              </div>
              <p className={`text-sm font-bold mt-1 ${totalPL >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                %{((totalPL / (totalCost || 1)) * 100).toFixed(2)} Toplam Getiri
              </p>
            </div>
            <div className="h-px bg-white/5 w-full" />

            <div className="group transition-transform hover:translate-x-2">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">
                {totalDailyChangeTL >= 0 ? 'Günlük Kar' : 'Günlük Zarar'}
              </p>
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-black tracking-tighter ${totalDailyChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalDailyChangePercent >= 0 ? '+' : '-'}₺{Math.trunc(Math.abs(totalDailyChangeTL)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                {totalDailyChangePercent >= 0 ? <TrendingUp className="text-green-400 w-6 h-6" /> : <TrendingDown className="text-red-400 w-6 h-6" />}
              </div>
              <p className={`text-sm font-bold mt-1 ${totalDailyChangePercent >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                %{Math.abs(totalDailyChangePercent).toFixed(2)} Değişim (Bugün)
              </p>
            </div>

            <div className="h-px bg-white/5 w-full" />

            <div aria-live="polite">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">
                {weeklyReady && weeklyLiveAvailable ? (weeklyChange > 0 ? 'Haftalık Kâr' : weeklyChange < 0 ? 'Haftalık Zarar' : 'Haftalık Değişim') : 'Haftalık Değişim'}
              </p>
              {!portfolio.length ? <p className="text-sm text-gray-500">Hesaplama için portföyünüze varlık ekleyin.</p> : weeklyData.key !== weeklyKey + weeklyDay || weeklyData.status === 'loading' ? <p className="text-sm text-gray-500">Haftalık veriler yükleniyor...</p> : weeklyData.status === 'error' || !weeklyLiveAvailable ? (
                <div className="text-sm text-gray-500"><p>Fiyat, kur veya alım tarihi eksik olduğu için hesaplanamıyor.</p><button type="button" onClick={() => { setWeeklyRetry(value => value + 1); fetchUsdRate(); fetchPortfolio(); }} className="mt-2 underline font-bold">Tekrar dene</button></div>
              ) : <>
                <div className={`flex items-center gap-3 ${weeklyChange > 0 ? 'text-green-400' : weeklyChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  <span className="text-3xl font-black tracking-tighter">{weeklyChange > 0 ? '+' : weeklyChange < 0 ? '-' : ''}₺{Math.abs(weeklyChange).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  {weeklyChange > 0 ? <TrendingUp className="w-6 h-6" aria-hidden="true" /> : weeklyChange < 0 ? <TrendingDown className="w-6 h-6" aria-hidden="true" /> : null}
                </div>
                <p className={`text-sm font-bold mt-1 ${weeklyChange > 0 ? 'text-green-400/60' : weeklyChange < 0 ? 'text-red-400/60' : 'text-gray-500'}`}>%{weeklyPercent.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Son 7 gün</p>
              </>}
            </div>

            <div aria-live="polite">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">
                {monthlyReady && weeklyLiveAvailable ? (monthlyChange > 0 ? 'Aylık Kâr' : monthlyChange < 0 ? 'Aylık Zarar' : 'Aylık Değişim') : 'Aylık Değişim'}
              </p>
              {!portfolio.length ? <p className="text-sm text-gray-500">Hesaplama için portföyünüze varlık ekleyin.</p> : monthlyData.key !== weeklyKey + weeklyDay || monthlyData.status === 'loading' ? <p className="text-sm text-gray-500">Aylık veriler yükleniyor...</p> : monthlyData.status === 'error' || !weeklyLiveAvailable ? (
                <div className="text-sm text-gray-500"><p>Fiyat, kur veya alım tarihi eksik olduğu için hesaplanamıyor.</p><button type="button" onClick={() => { setMonthlyRetry(value => value + 1); fetchUsdRate(); fetchPortfolio(); }} className="mt-2 underline font-bold">Tekrar dene</button></div>
              ) : <>
                <div className={`flex items-center gap-3 ${monthlyChange > 0 ? 'text-green-400' : monthlyChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  <span className="text-3xl font-black tracking-tighter">{monthlyChange > 0 ? '+' : monthlyChange < 0 ? '-' : ''}₺{Math.abs(monthlyChange).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  {monthlyChange > 0 ? <TrendingUp className="w-6 h-6" aria-hidden="true" /> : monthlyChange < 0 ? <TrendingDown className="w-6 h-6" aria-hidden="true" /> : null}
                </div>
                <p className={`text-sm font-bold mt-1 ${monthlyChange > 0 ? 'text-green-400/60' : monthlyChange < 0 ? 'text-red-400/60' : 'text-gray-500'}`}>%{monthlyPercent.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Son 30 gün</p>
              </>}
            </div>
          </div>

          {/* Middle: Legend List */}
          <div className="h-[480px] bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex flex-col justify-start gap-4 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <h3 className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Activity size={14} className="text-neon-purple" /> Varlık Dağılımı
            </h3>
            <StockWheelPicker
              stocks={processedWithPercentage}
              hoveredStock={hoveredStock}
              setHoveredStock={setHoveredStock}
            />
          </div>

          {/* Right: Pie Chart (The Star) */}
          <div className="h-[480px] bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex items-center justify-center relative overflow-hidden group shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-neon-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="relative w-64 h-64 md:w-80 md:h-80">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {processedWithPercentage.map((stock, i) => {
                  const prevPercentages = processedWithPercentage.slice(0, i).reduce((acc, curr) => acc + curr.percentage, 0);
                  const startAngle = (prevPercentages / 100) * 360;
                  const endAngle = ((prevPercentages + stock.percentage) / 100) * 360;

                  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
                    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
                    return {
                      x: cx + (r * Math.cos(angleInRadians)),
                      y: cy + (r * Math.sin(angleInRadians))
                    };
                  };

                  const r_outer = 48;
                  const r_inner = 32;

                  // Add a small gap between segments by adjusting angles
                  const gap = 1;
                  const adjustedStart = startAngle + gap;
                  const adjustedEnd = endAngle - gap;

                  const start_o = polarToCartesian(50, 50, r_outer, adjustedEnd);
                  const end_o = polarToCartesian(50, 50, r_outer, adjustedStart);
                  const start_i = polarToCartesian(50, 50, r_inner, adjustedEnd);
                  const end_i = polarToCartesian(50, 50, r_inner, adjustedStart);

                  const largeArcFlag = (stock.percentage - (gap * 2 / 360 * 100)) > 50 ? "1" : "0";

                  const d = [
                    "M", start_o.x, start_o.y,
                    "A", r_outer, r_outer, 0, largeArcFlag, 0, end_o.x, end_o.y,
                    "L", end_i.x, end_i.y,
                    "A", r_inner, r_inner, 0, largeArcFlag, 1, start_i.x, start_i.y,
                    "Z"
                  ].join(" ");

                  const textAngle = startAngle + (stock.percentage / 2);
                  const textPos = polarToCartesian(50, 50, 40, textAngle);

                  return (
                    <g
                      key={i}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredStock(stock.name)}
                      onMouseLeave={() => setHoveredStock(null)}
                    >
                      <motion.path
                        d={d}
                        fill={stock.color}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{
                          opacity: hoveredStock ? (hoveredStock === stock.name ? 1 : 0.3) : 0.8,
                          scale: hoveredStock === stock.name ? 1.05 : 1,
                        }}
                        whileHover={{ filter: 'brightness(1.2)' }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        style={{
                          filter: hoveredStock === stock.name ? `drop-shadow(0 0 15px ${stock.color})` : 'none',
                        }}
                      />
                      {stock.percentage > 8 && !hoveredStock && (
                        <text
                          x={textPos.x}
                          y={textPos.y}
                          fill="white"
                          fontSize="3.5"
                          fontWeight="black"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="pointer-events-none transform rotate-90 origin-center opacity-80"
                        >
                          %{stock.percentage}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Center Info - Dynamic */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={displayStock?.name}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-[0.2em] mb-1">
                      {hoveredStock ? 'Varlık' : 'En Yüksek'}
                    </span>
                    <span className="text-3xl font-black text-white tracking-tighter" style={{ color: hoveredStock ? displayStock?.color : 'white', textShadow: hoveredStock ? `0 0 20px ${displayStock?.color}44` : 'none' }}>
                      {displayStock?.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: displayStock?.color }} />
                      <span className="text-sm font-bold text-gray-300">
                        %{displayStock?.percentage}
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <div className="mt-8 bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative z-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <Activity className="text-neon-purple w-6 h-6" />
              Aktif Varlıklar
              <span className="text-xs bg-white/10 px-2 py-1 rounded-md text-gray-400">
                {livePrices.length > 0 ? `${livePrices.length} Canlı Veri` : 'Bağlanıyor...'}
              </span>
            </h2>
            <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  setLoading(true);
                  await Promise.all([fetchUsdRate(), fetchPortfolio()]);
                  setLoading(false);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300 font-bold text-sm text-gray-300 hover:text-white"
              >
                <RefreshCw className="w-4 h-4" /> Güncelle
              </button>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-neon-purple/20 hover:bg-neon-purple/40 border border-neon-purple/50 rounded-2xl transition-all duration-300 font-bold text-sm"
              >
                <Plus size={18} /> Yeni Hisse Ekle
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/5 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
                <tr>
                  <th className="px-8 py-4">Sembol</th>
                  <th className="px-8 py-4">Miktar (Lot)</th>
                  <th className="px-8 py-4">Ort. Maliyet</th>
                  <th className="px-8 py-4">Güncel Fiyat</th>
                  <th className="px-8 py-4 text-right">K/Z Durumu</th>
                  <th className="px-8 py-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {processedWithPercentage.map((stock, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors group">
                    <td 
                      className="px-8 py-6 cursor-pointer hover:text-neon-purple transition-colors"
                      onClick={() => router.push(`/piyasalar/${stock.name}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-transform group-hover:scale-110"
                          style={{
                            backgroundColor: `${stock.color}20`,
                            color: stock.color,
                            boxShadow: `0 0 15px ${stock.color}30`
                          }}
                        >
                          {stock.name[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-lg leading-tight">{stock.name}</span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            {(() => {
                              const purchase = new Date(stock.purchaseDate || Date.now());
                              const today = new Date();
                              // Saat farklarını sıfırlayalım ki sadece gün bazlı net hesaplama yapsın
                              const pDate = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate());
                              const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

                              const diffTime = Math.abs(tDate.getTime() - pDate.getTime());
                              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                              const dateStr = purchase.toLocaleDateString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              });

                              return `${diffDays === 0 ? 'Bugün alındı' : diffDays + ' gün önce alındı'} (${dateStr})`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-medium text-gray-300">{stock.amount} Lot</td>
                    <td className="px-8 py-6">
                      <div className="font-medium text-gray-300">
                        {stock.isForeignStock ? '$' : '₺'}
                        {stock.costOriginal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-gray-500 font-bold mt-1 tracking-wider uppercase">
                        Maliyet: {stock.isForeignStock ? '$' : '₺'}
                        {(stock.costOriginal * stock.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-bold text-white">
                        {stock.isForeignStock ? '$' : '₺'}
                        {stock.currentPriceOriginal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-neon-purple font-bold mt-1 tracking-wider uppercase opacity-80">
                        Değer: {stock.isForeignStock ? '$' : '₺'}
                        {(stock.currentPriceOriginal * stock.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {stock.updatedAt && (
                        <div className="text-[10px] text-cyan-400/70 mt-1 font-bold tracking-tight">
                          <span className="opacity-50 font-medium">Son:</span> {(() => {
                            const date = new Date(stock.updatedAt);
                            const isBist = ALL_BIST_STOCKS.includes(stock.name.toUpperCase()) || stock.name.endsWith('.IS');
                            if (isBist) {
                              date.setMinutes(date.getMinutes() - 15);
                              return `${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (15dk gecikmeli)`;
                            }
                            return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          })()}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className={`flex flex-col items-end`}>
                        <span className={`font-bold ${stock.plValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {stock.plValue >= 0 ? '+' : ''}
                          {stock.isForeignStock ? '$' : '₺'}
                          {Math.trunc(stock.plValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className={`text-xs font-bold ${stock.plValue >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                          %{stock.plPercentage.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        onClick={() => setEditingStock(stock)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Stock Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setIsAdding(false); setIsManual(false); }} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md shadow-[0_20px_50px_rgba(0,242,255,0.2)]">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <Plus className="text-cyan-400" /> Yeni Hisse Ekle
                </h2>
                <button onClick={() => { setIsAdding(false); setIsManual(false); }} className="text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
              </div>
              <form onSubmit={handleCreateStock} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Borsa Seçimi</label>
                  <select
                    value={selectedMarket}
                    onChange={(e) => setSelectedMarket(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg appearance-none cursor-pointer"
                  >
                    <option value="BIST 100" className="bg-black">Bist 100</option>
                    <option value="NASDAQ 500" className="bg-black">Nasdaq 500</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {isManual ? 'Hisse Sembolü (Manuel)' : 'Hisse Seçimi (BIST 100)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManual(!isManual)}
                      className="text-[10px] font-black text-cyan-400 hover:text-white transition-colors uppercase tracking-tighter"
                    >
                      {isManual ? '← Listeye Dön' : '+ Global / Manuel Giriş'}
                    </button>
                  </div>

                  {isManual ? (
                    <input
                      type="text"
                      value={newStock.name}
                      onChange={(e) => setNewStock({ ...newStock, name: e.target.value.toUpperCase() })}
                      placeholder="Örn: NVDA veya AAPL"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg"
                      autoFocus
                      required
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value.toUpperCase());
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Hisse ara (Örn: THYAO)..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg"
                        required
                      />
                      <AnimatePresence>
                        {showSuggestions && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-[110] left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl max-h-60 overflow-y-auto shadow-2xl backdrop-blur-xl"
                          >
                            {suggestionMatches.map(symbol => (
                              <button
                                key={symbol}
                                type="button"
                                onClick={() => {
                                  setNewStock({ ...newStock, name: symbol });
                                  setSearchTerm(symbol);
                                  setShowSuggestions(false);
                                }}
                                className="w-full text-left px-5 py-3 hover:bg-white/10 transition-colors font-bold flex justify-between items-center"
                              >
                                <span className="min-w-0">
                                  <span className="block">{symbol}</span>
                                  {selectedMarket === "BIST 100" && BIST_STOCK_NAMES[symbol] && (
                                    <span className="block truncate text-[10px] font-semibold normal-case text-gray-500">
                                      {BIST_STOCK_NAMES[symbol]}
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] text-gray-500 uppercase">{selectedMarket}</span>
                              </button>
                            ))
                            }
                            {debouncedSearchTerm && !hasSuggestionMatch && (
                              <div className="px-5 py-3 text-gray-500 text-sm italic">Sonuç bulunamadı.</div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Adet (Lot)</label>
                    <input type="number" value={newStock.amount} onChange={(e) => setNewStock({ ...newStock, amount: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg" required />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {selectedMarket === "NASDAQ 500" ? "Maliyet (USD)" : "Maliyet (TL)"}
                      </label>
                      <button
                        type="button"
                        onClick={fetchHistoricalPrice}
                        disabled={fetchingHistorical}
                        className="text-[10px] font-black text-cyan-400 hover:text-white transition-colors uppercase tracking-tighter flex items-center gap-1"
                      >
                        <span className="relative inline-flex w-3 h-3 shrink-0 items-center justify-center">
                          <Search className={`absolute w-3 h-3 transition-opacity ${fetchingHistorical ? 'opacity-0' : 'opacity-100'}`} />
                          <RefreshCw className={`absolute w-3 h-3 transition-opacity ${fetchingHistorical ? 'opacity-100 animate-spin' : 'opacity-0'}`} />
                        </span>
                        <span className={fetchingHistorical ? 'hidden' : 'inline'}>Fiyatı Getir</span>
                        <span className={fetchingHistorical ? 'inline' : 'hidden'}>Çekiliyor...</span>
                      </button>
                    </div>
                    <input type="number" step="any" value={newStock.cost} onChange={(e) => setNewStock({ ...newStock, cost: parseFloat(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg" required />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Alım Tarihi</label>
                    <span className="text-[10px] font-bold text-cyan-400 uppercase">{calculateDaysAgo(newStock.purchaseDate)}</span>
                  </div>
                  <input
                    type="date"
                    value={newStock.purchaseDate}
                    onChange={(e) => setNewStock({ ...newStock, purchaseDate: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg color-scheme-dark"
                  />
                </div>
                <button type="submit" className="w-full bg-cyan-500 text-black py-4 rounded-2xl font-black text-lg hover:bg-cyan-400 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,242,255,0.3)]">
                  <Check size={20} /> Portföye Ekle
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal (Updated with Date) */}
      <AnimatePresence>
        {editingStock && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingStock(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md shadow-[0_20px_50px_rgba(124,58,237,0.3)]">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3"><Edit2 className="text-neon-purple" /> {editingStock.name} Düzenle</h2>
                <button onClick={() => setEditingStock(null)} className="text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
              </div>
              <form onSubmit={handleUpdateStock} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Adet (Lot)</label>
                    <input type="number" value={editingStock.amount} onChange={(e) => setEditingStock({ ...editingStock, amount: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-neon-purple transition-colors font-bold text-lg" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {(editingStock && (NASDAQ500_STOCKS.includes(editingStock.name) || (!editingStock.name.endsWith('.IS') && !ALL_BIST_STOCKS.includes(editingStock.name)))) ? "Maliyet (USD)" : "Maliyet (TL)"}
                      </label>
                      <button
                        type="button"
                        onClick={fetchHistoricalPriceForEdit}
                        disabled={fetchingHistorical}
                        className="text-[10px] font-black text-neon-purple hover:text-white transition-colors uppercase tracking-tighter flex items-center gap-1"
                      >
                        <span className="relative inline-flex w-3 h-3 shrink-0 items-center justify-center">
                          <Search className={`absolute w-3 h-3 transition-opacity ${fetchingHistorical ? 'opacity-0' : 'opacity-100'}`} />
                          <RefreshCw className={`absolute w-3 h-3 transition-opacity ${fetchingHistorical ? 'opacity-100 animate-spin' : 'opacity-0'}`} />
                        </span>
                        <span className={fetchingHistorical ? 'hidden' : 'inline'}>Fiyatı Getir</span>
                        <span className={fetchingHistorical ? 'inline' : 'hidden'}>Çekiliyor...</span>
                      </button>
                    </div>
                    <input type="number" step="any" value={editingStock.cost} onChange={(e) => setEditingStock({ ...editingStock, cost: parseFloat(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-neon-purple transition-colors font-bold text-lg" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Alım Tarihi</label>
                    <span className="text-[10px] font-bold text-neon-purple uppercase">{calculateDaysAgo(editingStock.purchaseDate)}</span>
                  </div>
                  <input
                    type="date"
                    value={editingStock.purchaseDate ? editingStock.purchaseDate.split('T')[0] : ""}
                    onChange={(e) => setEditingStock({ ...editingStock, purchaseDate: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-neon-purple transition-colors font-bold text-lg color-scheme-dark"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => handleDeleteStock(editingStock.name)}
                    className="flex-1 bg-red-500/10 text-red-500 py-4 rounded-2xl font-bold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 border border-red-500/20"
                  >
                    <Trash2 size={20} /> Sil
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-neon-purple text-white py-4 rounded-2xl font-black text-lg hover:bg-neon-purple-hover transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(124,58,237,0.4)]"
                  >
                    <Check size={20} /> Kaydet
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
