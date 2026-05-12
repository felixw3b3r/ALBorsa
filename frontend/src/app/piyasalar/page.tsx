"use client";

import React, { useState, useEffect } from 'react';
import Navbar from "@/components/Navbar";
import { TrendingUp, TrendingDown, RefreshCw, BarChart3, Globe, Zap, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';

// Logo Bileşeni (Detay sayfasıyla aynı akıllı yapı)
function SymbolLogo({ symbol, color }: { symbol: string, color: string }) {
  const [error, setError] = useState(false);
  const cleanSymbol = symbol.split('.')[0].split('-')[0].toUpperCase();
  
  const logoPath = error ? `/logos/${cleanSymbol}.png` : `/logos/${cleanSymbol}.svg`;

  return (
    <div 
      className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden border border-white/10 shrink-0 transition-transform group-hover:scale-110 shadow-lg bg-black/20"
      style={{ backgroundColor: `${color}10` }}
    >
      {!error || logoPath.endsWith('.png') ? (
        <img 
          src={logoPath} 
          alt={symbol}
          className="w-full h-full object-contain p-2"
          onError={(e) => {
            if (!error) setError(true);
            else (e.target as any).style.display = 'none';
          }}
        />
      ) : null}
      {(error && logoPath.endsWith('.png')) && (
        <span className="text-sm font-black" style={{ color }}>
          {symbol[0]}
        </span>
      )}
    </div>
  );
}

const MARKET_TICKERS = [
  { symbol: "XU100.IS", name: "BIST 100", category: "Borsa İstanbul" },
  { symbol: "XU050.IS", name: "BIST 50", category: "Borsa İstanbul" },
  { symbol: "XU030.IS", name: "BIST 30", category: "Borsa İstanbul" },
  { symbol: "XBANK.IS", name: "BIST Banka", category: "Borsa İstanbul" },
  { symbol: "XUTEK.IS", name: "BIST Teknoloji", category: "Borsa İstanbul" },
  { symbol: "^GSPC", name: "S&P 500", category: "Global Endeksler" },
  { symbol: "^NDX", name: "Nasdaq 100", category: "Global Endeksler" },
  { symbol: "^IXIC", name: "Nasdaq", category: "Global Endeksler" },
  { symbol: "^SOX", name: "Yarı İletkenler (AI)", category: "Global Endeksler" },
  { symbol: "^NYFANG", name: "Mega Tech (FANG+)", category: "Global Endeksler" },
  { symbol: "^NBI", name: "BioTech (AI Sağlık)", category: "Global Endeksler" },
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
  
  return (
    <Link href={`/piyasalar/${item.symbol}`}>
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
              <SymbolLogo 
                symbol={item.symbol} 
                color={item.changePercent >= 0 ? "#4ade80" : "#f87171"} 
              />
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{item.symbol}</p>
                <h3 className="text-xl font-bold text-white group-hover:text-neon-purple transition-colors">{item.name}</h3>
              </div>
            </div>
            <div className={`p-3 rounded-2xl ${item.changePercent >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {item.changePercent >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <h4 className="text-3xl font-black tracking-tighter mb-1 text-white">
                {item.category === "Kripto Paralar" ? "$" : ""}
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

export default function PiyasalarPage() {
  const [mounted, setMounted] = useState(false);
  const [marketData, setMarketData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const fetchMarkets = async () => {
    setLoading(true);
    try {
      // TÜM VERİLERİ TEK SEFERDE ÇEK (SÜPER HIZLI)
      const res = await fetch(`${API_URL}/market-summary`);
      const summaryData = await res.json();
      
      // MARKET_TICKERS ile gelen isimleri ve kategorileri eşleştir
      const results = MARKET_TICKERS.map(ticker => {
        const liveData = summaryData.find((d: any) => d.symbol === ticker.symbol);
        return { ...ticker, ...liveData };
      });

      setMarketData(results);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 60000); // 1 dakikada bir güncelle
    return () => clearInterval(interval);
  }, []);

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
              onClick={fetchMarkets}
              disabled={loading}
              className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group disabled:opacity-50"
            >
              <RefreshCw size={20} className={`text-neon-purple ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            </button>
          </div>
        </div>

        {/* Categories */}
        {["Borsa İstanbul", "Global Endeksler", "Kripto Paralar"].map((category) => (
          <div key={category} className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1.5 h-6 bg-neon-purple rounded-full shadow-[0_0_10px_rgba(139,0,232,0.5)]" />
              <h2 className="text-2xl font-black tracking-tight">{category}</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
              {marketData.filter(d => d.category === category).map((item, idx) => (
                <MarketCard key={item.symbol} item={item} idx={idx} />
              ))}
              
              {loading && marketData.length === 0 && (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-[2rem] animate-pulse h-48" />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
