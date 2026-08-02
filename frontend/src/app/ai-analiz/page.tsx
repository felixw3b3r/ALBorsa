"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, Search, ArrowLeft, TrendingUp, TrendingDown, 
  Activity, Zap, Info, RefreshCw, BarChart3, Filter,
  LayoutGrid, List
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';

interface AnalysisResult {
  symbol: string;
  price: number;
  changePercent: number;
  indicators: {
    sma20: number | null;
    ema50: number | null;
    rsi: number | null;
    macd: { macdLine: number; signalLine: number; histogram: number } | null;
    mom: number | null;
    atr: number | null;
    adx: number | null;
    vwap: number | null;
    obv: number | null;
    cmf: number | null;
  };
  scores: {
    adx: number;
    vwap: number;
    volume: number;
    rsi: number;
    total: number;
  };
  quant?: {
    modelVersion: string;
    decision: string;
    probability: number;
    confidence: number;
    opportunityScore: number;
    riskScore: number;
    expectedAlpha20d: number;
    regime: string;
    factorScores: {
      trend: number;
      momentum: number;
      volume: number;
      meanReversion: number;
      relativeStrength: number;
      riskAdjusted: number;
    };
    diagnostics: {
      relativeReturn20d: number;
      volumeRatio20d: number;
      atrPercent: number;
      maxDrawdown20d: number;
    };
    reasons: string[];
  };
  deepseek?: {
    karar: "GÜÇLÜ_AL" | "AL" | "BEKLE" | "SAT";
    olasilik_yuzdesi: number;
    neden: string;
    stop_loss: number;
    take_profit: number;
  } | null;
}

export default function AiAnalizPage() {
  const router = useRouter();
  const [market, setMarket] = useState<'bist' | 'nasdaq'>('bist');
  const [data, setData] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [subTab, setSubTab] = useState<'all' | 'ai-portfolio'>('all');
  const [signals, setSignals] = useState<any[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  // signalPrices: { [symbol]: livePrice } for the AI portfolio signals
  const [signalPrices, setSignalPrices] = useState<Record<string, number>>({});

  const fetchData = async (currentMarket: 'bist' | 'nasdaq') => {
    try {
      const endpoint = currentMarket === 'bist' ? 'bist100' : 'nasdaq100';
      const res = await fetch(`${API_URL}/analysis/${endpoint}`);
      const json = await res.json();
      if (json) {
        setData(json.data || []);
        setLastUpdate(json.lastUpdate || 0);
        setIsUpdating(json.isUpdating || false);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignals = async (currentMarket: 'bist' | 'nasdaq') => {
    setSignalsLoading(true);
    try {
      const res = await fetch(`${API_URL}/analysis/ai-portfolio?market=${currentMarket}`);
      const json = await res.json();
      if (json && json.success) {
        setSignals(json.data || []);
      }
    } catch (err) {
      console.error('Fetch signals error:', err);
    } finally {
      setSignalsLoading(false);
    }
  };

  // Fetch real-time prices for active signals directly from /api/stocks
  const fetchSignalPrices = async (sigs: any[], currentMarket: 'bist' | 'nasdaq') => {
    if (!sigs || sigs.length === 0) return;
    // status from backend is 'ACTIVE' (uppercase) — use case-insensitive; fetch ALL signals
    const symbols = sigs
      .map((s: any) => {
        // BIST symbols need .IS suffix for Yahoo Finance
        const isBist = currentMarket === 'bist';
        return isBist && !s.symbol.endsWith('.IS') ? `${s.symbol}.IS` : s.symbol;
      });
    if (symbols.length === 0) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_URL}/stocks?symbols=${symbols.join(',')}`, {
        headers: {
          'X-Bypass-API-Cache': '1',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const json = await res.json();
      if (json && json.result) {
        const priceMap: Record<string, number> = {};
        json.result.forEach((item: any) => {
          const ticker = item.code || item.symbol || '';
          if (ticker) {
            // Map both THYAO.IS -> THYAO and AAPL -> AAPL
            const bare = ticker.replace('.IS', '');
            priceMap[bare] = item.price;
            priceMap[ticker] = item.price;
          }
        });
        setSignalPrices(priceMap);
      }
    } catch (err) {
      console.error('Signal prices fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData(market);
    fetchSignals(market);
    const interval = setInterval(() => {
      fetchData(market);
      fetchSignals(market);
    }, 30000);
    return () => clearInterval(interval);
  }, [market]);

  // Whenever signals or data change, fetch their live prices; also poll every 10s
  useEffect(() => {
    const fetchPrices = () => {
      const symbolsToFetch = new Set<string>();
      signals.forEach((s: any) => symbolsToFetch.add(s.symbol));
      data.forEach((d: any) => symbolsToFetch.add(d.symbol));
      
      const symbolsArray = Array.from(symbolsToFetch).map(sym => ({ symbol: sym }));
      if (symbolsArray.length > 0) {
        fetchSignalPrices(symbolsArray, market);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 10000);
    return () => clearInterval(interval);
  }, [signals, data, market]);

  const filteredData = data
    .filter(item => item.symbol.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.quant?.opportunityScore ?? b.scores.total) - (a.quant?.opportunityScore ?? a.scores.total));

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getDecisionLabel = (decision?: string) => {
    const value = String(decision || '');
    if (value === 'GUCLU_AL') return 'GUCLU AL';
    if (value === 'KADEMELI_AL') return 'KADEMELI AL';
    if (value === 'IZLE') return 'IZLE';
    if (value === 'AZALT') return 'AZALT';
    if (value === 'BEKLE') return 'IZLE';
    return value || '--';
  };

  const getRegimeLabel = (regime?: string) => {
    if (regime === 'BULL_TREND') return 'Trend Pozitif';
    if (regime === 'RISK_OFF') return 'Risk-Off';
    if (regime === 'VOLATILE') return 'Volatil';
    if (regime === 'RANGE') return 'Yatay';
    return '--';
  };

  const getDecisionColor = (decision?: string) => {
    const value = String(decision || '');
    if (value.includes('AL')) return 'text-emerald-400';
    if (value === 'AZALT' || value === 'SAT') return 'text-rose-400';
    return 'text-amber-400';
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-neon-purple/30">
      {/* Arka Plan Glow Efektleri */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-neon-purple/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-28 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-4">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 text-neon-purple"
            >
              <div className="p-2 rounded-lg bg-neon-purple/10 border border-neon-purple/20">
                <Brain size={24} />
              </div>
              <span className="font-bold tracking-widest uppercase text-sm">Quant Strateji Merkezi</span>
              {isUpdating && (
                <div className="flex items-center gap-2 ml-4 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  ANALİZ GÜNCELLENİYOR...
                </div>
              )}
            </motion.div>
            <motion.h1 
              key={market}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-black tracking-tight"
            >
              {market === 'bist' ? (
                <>BIST 100 <span className="text-gray-500">Rejim Bazlı Model</span></>
              ) : (
                <>NASDAQ 100 <span className="text-gray-500">Rejim Bazlı Analiz</span></>
              )}
            </motion.h1>
            <p className="text-gray-400 max-w-xl">
              {market === 'bist' 
                ? 'Rejim, relatif guc, momentum, hacim ve risk katmanlariyla BIST 100 hisselerinin olasilikli analizi.'
                : 'Rejim, relatif guc, momentum, hacim ve risk katmanlariyla NASDAQ 100 hisselerinin olasilikli analizi.'
              }
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Son Güncelleme</p>
              <p className="text-sm font-mono text-gray-300">
                {lastUpdate ? new Date(lastUpdate).toLocaleTimeString('tr-TR') : '--:--:--'}
              </p>
            </div>
            <button 
              onClick={() => { setLoading(true); fetchData(market); }}
              className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Market Toggle (BIST / NASDAQ) */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-md">
            <button
              onClick={() => { setLoading(true); setMarket('bist'); }}
              className={`relative flex items-center gap-2 px-8 py-3 rounded-xl text-xs font-black transition-all ${
                market === 'bist' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {market === 'bist' && (
                <motion.div
                  layoutId="market-nav-bg"
                  className="absolute inset-0 bg-neon-purple rounded-xl shadow-[0_0_20px_rgba(188,19,254,0.5)]"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">BIST</span>
            </button>
            <button
              onClick={() => { setLoading(true); setMarket('nasdaq'); }}
              className={`relative flex items-center gap-2 px-8 py-3 rounded-xl text-xs font-black transition-all ${
                market === 'nasdaq' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {market === 'nasdaq' && (
                <motion.div
                  layoutId="market-nav-bg"
                  className="absolute inset-0 bg-neon-purple rounded-xl shadow-[0_0_20px_rgba(188,19,254,0.5)]"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">NASDAQ</span>
            </button>
          </div>
        </div>

        {/* Sub-tab selection (Tüm Hisseler / Yapay Zeka Al Portföyü) */}
        <div className="flex justify-center gap-6 mb-8 border-b border-white/5 pb-4">
          <button 
            onClick={() => setSubTab('all')}
            className={`text-sm font-bold pb-2 border-b-2 transition-all ${subTab === 'all' ? 'border-neon-purple text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            Tüm Analizler
          </button>
          <button 
            onClick={() => setSubTab('ai-portfolio')}
            className={`text-sm font-bold pb-2 border-b-2 transition-all flex items-center gap-2 ${subTab === 'ai-portfolio' ? 'border-neon-purple text-neon-purple' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            <Zap size={14} className="text-neon-purple" />
            Yapay Zeka Al Portföyü
          </button>
        </div>

        {/* Toolbar Section */}
        {subTab === 'all' && (
          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
              <input 
                type="text" 
                placeholder={market === 'bist' ? "Hisse ara... (Örn: THYAO)" : "Hisse ara... (Örn: AAPL)"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-neon-purple/50 transition-all"
              />
            </div>
          </div>
        )}

        {/* Table / Grid Section */}
        {subTab === 'ai-portfolio' ? (
          <AiPortfolioView signals={signals} loading={signalsLoading} market={market} data={data} signalPrices={signalPrices} />
        ) : loading && data.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-white/5 rounded-[2rem] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredData.map((item, idx) => {
                const livePrice = signalPrices[item.symbol] ?? item.price;
                const liveChangePercent = item.price ? ((livePrice - item.price) / item.price) * 100 : item.changePercent;
                
                return (
                <motion.div
                  layout
                  key={item.symbol}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  onClick={() => router.push(`/piyasalar/${item.symbol}`)}
                  className="group relative bg-[#0A0A0A] border border-white/5 rounded-[2.5rem] p-8 hover:border-neon-purple/30 transition-all cursor-pointer overflow-hidden"
                >
                  {/* Score Circular Progress (Backdrop) */}
                  <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                    <Zap className="w-full h-full text-white" />
                  </div>

                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="text-3xl font-black group-hover:text-neon-purple transition-colors">{item.symbol}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl font-mono font-medium">
                          {market === 'bist' ? '₺' : '$'}
                          {livePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-sm font-bold flex items-center ${liveChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {liveChangePercent >= 0 ? <TrendingUp size={14} className="mr-1"/> : <TrendingDown size={14} className="mr-1"/>}
                          %{Math.abs(liveChangePercent).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-4xl font-black ${getScoreColor(item.quant?.opportunityScore ?? item.scores.total)}`}>
                        {Math.round(item.quant?.opportunityScore ?? item.scores.total)}
                      </div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">FIRSAT</div>
                    </div>
                  </div>

                  {item.quant && (
                    <div className="grid grid-cols-3 gap-2 mb-6">
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <div className="text-[9px] font-black text-gray-500 uppercase">Olasilik</div>
                        <div className="text-sm font-black text-cyan-300">%{item.quant.probability}</div>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <div className="text-[9px] font-black text-gray-500 uppercase">Risk</div>
                        <div className={getScoreColor(100 - item.quant.riskScore)}>{item.quant.riskScore}</div>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <div className="text-[9px] font-black text-gray-500 uppercase">Rejim</div>
                        <div className="text-xs font-black text-gray-200">{getRegimeLabel(item.quant.regime)}</div>
                      </div>
                    </div>
                  )}

                  {/* Indicator Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
                    <IndicatorItem label="RSI (14)" value={item.indicators.rsi?.toFixed(1) || '--'} status={item.indicators.rsi && item.indicators.rsi > 70 ? 'danger' : item.indicators.rsi && item.indicators.rsi < 30 ? 'success' : 'neutral'} />
                    <IndicatorItem 
                      label="ADX" 
                      value={item.indicators.adx?.toFixed(1) || '--'} 
                      status={
                        !item.indicators.adx ? 'neutral' :
                        item.indicators.adx >= 40 ? 'success' :
                        item.indicators.adx >= 20 ? 'neutral' : 'danger'
                      } 
                    />
                    <IndicatorItem label="MACD Hist" value={item.indicators.macd?.histogram?.toFixed(2) || '--'} status={item.indicators.macd && item.indicators.macd.histogram > 0 ? 'success' : 'danger'} />
                    <IndicatorItem label="SMA (20)" value={item.indicators.sma20?.toFixed(2) || '--'} status={livePrice > (item.indicators.sma20 || 0) ? 'success' : 'danger'} />
                    <IndicatorItem label="EMA (50)" value={item.indicators.ema50?.toFixed(2) || '--'} status={livePrice > (item.indicators.ema50 || 0) ? 'success' : 'danger'} />
                    <IndicatorItem label="VWAP Sapma" value={item.indicators.vwap ? `${(((livePrice - item.indicators.vwap) / item.indicators.vwap) * 100).toFixed(2)}%` : '--'} status="neutral" />
                    <IndicatorItem label="Momentum" value={item.indicators.mom?.toFixed(1) || '--'} status={item.indicators.mom && item.indicators.mom > 0 ? 'success' : 'danger'} />
                    <IndicatorItem label="CMF" value={item.indicators.cmf?.toFixed(2) || '--'} status={item.indicators.cmf && item.indicators.cmf > 0 ? 'success' : 'danger'} />
                    <IndicatorItem label="OBV" value={item.indicators.obv ? (item.indicators.obv / 1000000).toFixed(1) + 'M' : '--'} status="neutral" />
                    <IndicatorItem label="ATR" value={item.indicators.atr?.toFixed(2) || '--'} />
                  </div>

                  {/* DeepSeek AI Section */}
                  {item.deepseek && (
                    <div className="mt-8 pt-6 border-t border-blue-500/30 bg-blue-500/10 -mx-8 -mb-8 px-8 pb-8 rounded-b-[2.5rem]">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2 text-blue-400">
                          <Zap size={16} fill="currentColor" />
                          <span className="text-xs font-black uppercase tracking-widest">DeepSeek Quant V4</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-base font-black tracking-tight ${getDecisionColor(item.deepseek.karar)}`}>
                            {getDecisionLabel(item.deepseek.karar)}
                          </span>
                          <span className="text-[11px] text-blue-300 font-black">GUVEN: %{item.quant?.confidence ?? item.deepseek.olasilik_yuzdesi}</span>
                        </div>
                      </div>
                      
                      <p className="text-[12px] text-white font-bold leading-relaxed mb-5 bg-black/20 p-3 rounded-xl border border-blue-500/20 shadow-inner">
                        <span className="text-blue-400 mr-1">●</span> {item.deepseek.neden}
                      </p>

                      <div className="flex gap-4">
                        <div className="flex-1 bg-black/60 p-3 rounded-xl border border-white/10 shadow-lg">
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[10px] text-gray-400 uppercase font-black">Zarar Kes</div>
                            <div className="text-[10px] font-bold text-rose-400/80">
                              %{(((item.deepseek.stop_loss - item.price) / item.price) * 100).toFixed(1)}
                            </div>
                          </div>
                          <div className="text-sm font-mono font-black text-rose-400">
                            {market === 'bist' ? '₺' : '$'}
                            {item.deepseek.stop_loss}
                          </div>
                        </div>
                        <div className="flex-1 bg-black/60 p-3 rounded-xl border border-white/10 shadow-lg">
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[10px] text-gray-400 uppercase font-black">Kar Al</div>
                            <div className="text-[10px] font-bold text-emerald-400/80">
                              +%{(((item.deepseek.take_profit - item.price) / item.price) * 100).toFixed(1)}
                            </div>
                          </div>
                          <div className="text-sm font-mono font-black text-emerald-400">
                            {market === 'bist' ? '₺' : '$'}
                            {item.deepseek.take_profit}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Stats */}
                  <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center opacity-60">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Teknik Veri</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Canlı Analiz</span>
                    </div>
                  </div>
                </motion.div>
              )})}
            </AnimatePresence>
          </div>
        )}

        {filteredData.length === 0 && !loading && (
          <div className="text-center py-20 bg-white/5 rounded-[3rem] border border-dashed border-white/10">
            <Search size={48} className="mx-auto text-gray-600 mb-4" />
            <h3 className="text-xl font-bold text-gray-400">Aramanıza uygun hisse bulunamadı.</h3>
          </div>
        )}
      </main>

      <footer className="py-12 border-t border-white/5 text-center">
        <p className="text-gray-500 text-sm">© 2026 ALBorsa AI - Yatırım tavsiyesi değildir.</p>
      </footer>
    </div>
  );
}

function IndicatorItem({ label, value, status = 'neutral' }: { label: string, value: string | number, status?: 'success' | 'danger' | 'neutral' | 'warning' }) {
  const getStatusColor = () => {
    if (status === 'success') return 'bg-emerald-500/10 text-emerald-400';
    if (status === 'danger') return 'bg-rose-500/10 text-rose-400';
    if (status === 'warning') return 'bg-amber-500/10 text-amber-400';
    return 'bg-white/5 text-gray-400';
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
      <div className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold w-fit ${getStatusColor()}`}>
        {value}
      </div>
    </div>
  );
}

function AiPortfolioView({ signals, loading, market, data, signalPrices }: { signals: any[], loading: boolean, market: 'bist' | 'nasdaq', data: any[], signalPrices: Record<string, number> }) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-64 bg-white/5 rounded-[2rem] animate-pulse" />
        ))}
      </div>
    );
  }

  const activeSignals = signals.filter(s => s.status === 'ACTIVE');
  const closedSignals = signals.filter(s => s.status !== 'ACTIVE');

  const getStatusLabel = (status: string) => {
    if (status === 'ACTIVE') return 'Aktif Pozisyon';
    if (status === 'TAKE_PROFIT') return 'Kar Al Hedefi';
    if (status === 'STOP_LOSS') return 'Zarar Kes Limit';
    return status;
  };

  const getStatusColor = (status: string) => {
    if (status === 'ACTIVE') return 'text-neon-purple bg-neon-purple/10 border-neon-purple/20';
    if (status === 'TAKE_PROFIT') return 'text-green-400 bg-green-400/10 border-green-400/20';
    if (status === 'STOP_LOSS') return 'text-red-400 bg-red-400/10 border-red-400/20';
    return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
  };

  return (
    <div className="space-y-12">
      {/* 1. Aktif Pozisyonlar */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-neon-purple rounded-full shadow-[0_0_10px_rgba(188,19,254,0.5)]" />
            <h2 className="text-2xl font-black tracking-tight">Aktif Pozisyonlar ({activeSignals.length})</h2>
          </div>
          
          {activeSignals.length > 0 && (
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-md">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-neon-purple text-white shadow-[0_0_10px_rgba(188,19,254,0.4)]' : 'text-gray-500 hover:text-gray-300'
                }`}
                title="Grid Görünümü"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === 'list' ? 'bg-neon-purple text-white shadow-[0_0_10px_rgba(188,19,254,0.4)]' : 'text-gray-500 hover:text-gray-300'
                }`}
                title="Liste Görünümü"
              >
                <List size={16} />
              </button>
            </div>
          )}
        </div>

        {activeSignals.length === 0 ? (
          <div className="bg-white/5 border border-white/5 rounded-[2rem] p-12 text-center text-cyan-400 font-medium">
            Şu an aktif tavsiye pozisyonu bulunmuyor.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeSignals.map((sig) => {
              // Prefer live price from /api/stocks; fall back to analysis data, then entryPrice
              const latestPrice = signalPrices[sig.symbol] ?? signalPrices[sig.symbol + '.IS'] ?? data.find(d => d.symbol === sig.symbol || d.symbol === sig.symbol + '.IS')?.price ?? sig.entryPrice;
              return (
                <SignalCard key={sig._id} signal={sig} latestPrice={latestPrice} market={market} />
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {activeSignals.map((sig) => {
              const latestPrice = signalPrices[sig.symbol] ?? signalPrices[sig.symbol + '.IS'] ?? data.find(d => d.symbol === sig.symbol || d.symbol === sig.symbol + '.IS')?.price ?? sig.entryPrice;
              return (
                <SignalRow key={sig._id} signal={sig} latestPrice={latestPrice} market={market} />
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Sonlanan İşlemler */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1.5 h-6 bg-gray-600 rounded-full" />
          <h2 className="text-2xl font-black tracking-tight">Sonlanan İşlemler ({closedSignals.length})</h2>
        </div>

        {closedSignals.length === 0 ? (
          <div className="bg-white/5 border border-white/5 rounded-[2rem] p-12 text-center text-cyan-400 font-medium">
            Henüz sonlanan işlem geçmişi bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto bg-[#0A0A0A] border border-white/5 rounded-[2.5rem] p-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs font-bold text-cyan-400 uppercase tracking-widest">
                  <th className="pb-4">Hisse</th>
                  <th className="pb-4">Giriş Tarihi / Fiyatı</th>
                  <th className="pb-4">Çıkış Tarihi / Fiyatı</th>
                  <th className="pb-4">Hedefler (TP / SL)</th>
                  <th className="pb-4 text-right">Durum / Getiri</th>
                </tr>
              </thead>
              <tbody>
                {closedSignals.map((sig) => {
                  const gainLossPercent = ((sig.closePrice - sig.entryPrice) / sig.entryPrice) * 100;
                  const prefix = market === 'bist' ? '₺' : '$';
                  return (
                    <tr key={sig._id} className="border-b border-white/5 text-sm font-medium hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 font-black text-lg text-white">{sig.symbol}</td>
                      <td className="py-4">
                        <div className="text-xs text-cyan-400">{new Date(sig.entryDate).toLocaleDateString('tr-TR')}</div>
                        <div className="text-white font-bold">{prefix}{sig.entryPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="py-4">
                        <div className="text-xs text-cyan-400">{sig.closeDate ? new Date(sig.closeDate).toLocaleDateString('tr-TR') : '--'}</div>
                        <div className="text-white font-bold">{prefix}{(sig.closePrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="py-4 text-xs text-cyan-400">
                        <div>Kar Al: {prefix}{sig.takeProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div>Zarar Kes: {prefix}{sig.stopLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="py-4 text-right">
                        <span className={`inline-block text-[10px] font-black px-2 py-1 rounded-md border mb-1 uppercase tracking-tighter ${getStatusColor(sig.status)}`}>
                          {getStatusLabel(sig.status)}
                        </span>
                        <div className={`font-black text-base ${gainLossPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalCard({ signal, latestPrice, market }: { signal: any, latestPrice: number, market: 'bist' | 'nasdaq' }) {
  const router = useRouter();
  const prefix = market === 'bist' ? '₺' : '$';
  
  // Calculate real-time profit/loss based on latestPrice
  const profitLoss = latestPrice - signal.entryPrice;
  const profitLossPercent = (profitLoss / signal.entryPrice) * 100;
  
  return (
    <div 
      onClick={() => router.push(`/piyasalar/${signal.symbol}`)}
      className="bg-[#0A0A0A] border border-neon-purple/20 hover:border-neon-purple/40 shadow-[0_0_20px_rgba(188,19,254,0.05)] rounded-[2.5rem] p-8 flex flex-col justify-between relative overflow-hidden group cursor-pointer transition-all"
    >
      {/* Background neon effect */}
      <div className="absolute top-0 right-0 w-24 h-24 blur-[60px] opacity-10 bg-neon-purple rounded-full" />
      
      <div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">{market.toUpperCase()} AL ÖNERİSİ</span>
            <h3 className="text-3xl font-black text-white">{signal.symbol}</h3>
            <span className="text-xs text-cyan-400 font-bold">{new Date(signal.entryDate).toLocaleDateString('tr-TR')} önerildi</span>
          </div>
          <div className="text-right">
            <span className="inline-block text-[10px] font-black px-2 py-1 rounded-md border border-neon-purple/20 text-neon-purple bg-neon-purple/10 uppercase tracking-tighter">
              AKTİF
            </span>
            <div className="text-[10px] font-black text-neon-purple uppercase tracking-widest mt-2">Skor: {signal.opportunityScore}</div>
          </div>
        </div>

        {/* Pricing Info */}
        <div className="grid grid-cols-2 gap-4 mb-6 bg-white/5 border border-white/5 rounded-2xl p-4">
          <div>
            <div className="text-[10px] text-cyan-400 font-bold uppercase">Giriş Fiyatı</div>
            <div className="text-lg font-black text-white">{prefix}{signal.entryPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-[10px] text-cyan-400 font-bold uppercase">Güncel Fiyat</div>
            <div className="text-lg font-black text-white">{prefix}{latestPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Target and Stop Levels */}
        {(() => {
          const slPercent = ((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100;
          const tpPercent = ((signal.takeProfit - signal.entryPrice) / signal.entryPrice) * 100;
          // Bar: left=StopLoss(0%), right=TakeProfit(100%). Entry tick divides proportionally.
          const entryPricePct = ((signal.entryPrice - signal.stopLoss) / (signal.takeProfit - signal.stopLoss || 1)) * 100;
          const latestPricePct = ((latestPrice - signal.stopLoss) / (signal.takeProfit - signal.stopLoss || 1)) * 100;
          const clampedEntry = Math.max(0, Math.min(100, entryPricePct));
          const clampedLatest = Math.max(0, Math.min(100, latestPricePct));
          return (
            <div className="mb-6">
              {/* Left = ZARAR KES, Right = KAR AL HEDEFİ */}
              <div className="flex justify-between items-end mb-1.5">
                <div>
                  <div className="text-[9px] text-red-400 font-black uppercase tracking-wider">← ZARAR KES</div>
                  <div className="text-[10px] text-red-400 font-bold">{prefix}{signal.stopLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({slPercent.toFixed(1)}%)</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-green-400 font-black uppercase tracking-wider">KAR AL HEDEFİ →</div>
                  <div className="text-[10px] text-green-400 font-bold">{prefix}{signal.takeProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+{tpPercent.toFixed(1)}%)</div>
                </div>
              </div>

              <div className="w-full bg-white/5 h-2 rounded-full relative overflow-visible">
                {/* Left zone bg (stop loss zone): subtle red tint */}
                <div className="absolute h-full rounded-l-full bg-red-500/10" style={{ left: 0, width: `${clampedEntry}%` }} />
                {/* Right zone bg (take profit zone): subtle green tint */}
                <div className="absolute h-full rounded-r-full bg-emerald-500/10" style={{ left: `${clampedEntry}%`, width: `${100 - clampedEntry}%` }} />

                {/* Static Entry Price Marker Tick (white divider) */}
                <div 
                  className="absolute w-0.5 h-4 bg-white/50 top-1/2 z-10"
                  style={{ left: `${clampedEntry}%`, transform: 'translate(-50%, -50%)' }}
                />

                {/* Profit: green fill from entry rightward */}
                {latestPrice > signal.entryPrice && (
                  <div 
                    className="absolute bg-emerald-500 h-full transition-all duration-500 rounded-full"
                    style={{
                      left: `${clampedEntry}%`,
                      width: `${Math.max(0, clampedLatest - clampedEntry)}%`
                    }}
                  />
                )}

                {/* Loss: red fill from entry leftward */}
                {latestPrice < signal.entryPrice && (
                  <div 
                    className="absolute bg-rose-500 h-full transition-all duration-500 rounded-full"
                    style={{
                      left: `${Math.min(clampedEntry, clampedLatest)}%`,
                      width: `${Math.max(0, clampedEntry - clampedLatest)}%`
                    }}
                  />
                )}

                {/* Moving Current Price Purple Dot */}
                <div 
                  className="absolute w-3 h-3 rounded-full bg-neon-purple top-1/2 z-20 border-2 border-black shadow-[0_0_10px_rgba(188,19,254,0.9)]"
                  style={{ left: `${clampedLatest}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-white/5">
        <span className="text-xs text-cyan-400 font-bold">Anlık Durum</span>
        <div className={`text-xl font-black ${profitLossPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal, latestPrice, market }: { signal: any, latestPrice: number, market: 'bist' | 'nasdaq' }) {
  const router = useRouter();
  const prefix = market === 'bist' ? '₺' : '$';
  
  // Calculate real-time profit/loss based on latestPrice
  const profitLoss = latestPrice - signal.entryPrice;
  const profitLossPercent = (profitLoss / signal.entryPrice) * 100;
  
  const slPercent = ((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100;
  const tpPercent = ((signal.takeProfit - signal.entryPrice) / signal.entryPrice) * 100;
  const entryPricePct = ((signal.entryPrice - signal.stopLoss) / (signal.takeProfit - signal.stopLoss || 1)) * 100;
  const latestPricePct = ((latestPrice - signal.stopLoss) / (signal.takeProfit - signal.stopLoss || 1)) * 100;

  return (
    <div 
      onClick={() => router.push(`/piyasalar/${signal.symbol}`)}
      className="bg-[#0A0A0A] border border-neon-purple/20 hover:border-neon-purple/40 shadow-[0_0_20px_rgba(188,19,254,0.02)] rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all group cursor-pointer"
    >
      {/* 1. Symbol & Market */}
      <div className="flex items-center gap-4 min-w-[150px]">
        <div>
          <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest block">{market.toUpperCase()} AL ÖNERİSİ</span>
          <h4 className="text-2xl font-black text-white">{signal.symbol}</h4>
          <span className="text-[10px] text-cyan-400 block">{new Date(signal.entryDate).toLocaleDateString('tr-TR')} önerildi</span>
        </div>
      </div>

      {/* 2. Prices */}
      <div className="grid grid-cols-2 gap-4 md:gap-8 min-w-[200px]">
        <div>
          <div className="text-[9px] text-cyan-400 font-bold uppercase">Giriş Fiyatı</div>
          <div className="text-base font-black text-white">{prefix}{signal.entryPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div>
          <div className="text-[9px] text-cyan-400 font-bold uppercase">Güncel Fiyat</div>
          <div className="text-base font-black text-white">{prefix}{latestPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* 3. Stop / Target Bar (Middle) */}
      <div className="flex-1 min-w-[250px]">
        {/* Left = ZARAR KES, Right = KAR AL HEDEFİ */}
        <div className="flex justify-between items-end mb-1.5">
          <div>
            <div className="text-[8px] text-red-400 font-black uppercase tracking-wider">← ZARAR KES</div>
            <div className="text-[9px] text-red-400 font-bold">{prefix}{signal.stopLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({slPercent.toFixed(1)}%)</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] text-green-400 font-black uppercase tracking-wider">KAR AL HEDEFİ →</div>
            <div className="text-[9px] text-green-400 font-bold">{prefix}{signal.takeProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+{tpPercent.toFixed(1)}%)</div>
          </div>
        </div>

        <div className="w-full bg-white/5 h-2 rounded-full relative overflow-visible">
          {/* Zone backgrounds */}
          <div className="absolute h-full rounded-l-full bg-red-500/10" style={{ left: 0, width: `${Math.max(0, Math.min(100, entryPricePct))}%` }} />
          <div className="absolute h-full rounded-r-full bg-emerald-500/10" style={{ left: `${Math.max(0, Math.min(100, entryPricePct))}%`, width: `${100 - Math.max(0, Math.min(100, entryPricePct))}%` }} />

          {/* Static Entry Price Marker Tick */}
          <div 
            className="absolute w-0.5 h-4 bg-white/50 top-1/2 z-10"
            style={{ left: `${Math.max(0, Math.min(100, entryPricePct))}%`, transform: 'translate(-50%, -50%)' }}
          />

          {/* Profit: green fill from entry rightward */}
          {latestPrice > signal.entryPrice && (
            <div 
              className="absolute bg-emerald-500 h-full transition-all duration-500 rounded-full"
              style={{
                left: `${Math.max(0, Math.min(100, entryPricePct))}%`,
                width: `${Math.max(0, Math.min(100, latestPricePct) - Math.max(0, Math.min(100, entryPricePct)))}%`
              }}
            />
          )}

          {/* Loss: red fill from entry leftward */}
          {latestPrice < signal.entryPrice && (
            <div 
              className="absolute bg-rose-500 h-full transition-all duration-500 rounded-full"
              style={{
                left: `${Math.min(Math.max(0, Math.min(100, entryPricePct)), Math.max(0, Math.min(100, latestPricePct)))}%`,
                width: `${Math.max(0, Math.max(0, Math.min(100, entryPricePct)) - Math.max(0, Math.min(100, latestPricePct)))}%`
              }}
            />
          )}

          {/* Moving Current Price Purple Dot */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-neon-purple top-1/2 z-20 border-2 border-black shadow-[0_0_10px_rgba(188,19,254,0.9)]"
            style={{ left: `${Math.max(0, Math.min(100, latestPricePct))}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>
      </div>

      {/* 4. Score & Status & Profit/Loss */}
      <div className="flex items-center justify-between md:justify-end gap-6 min-w-[200px]">
        <div className="text-right">
          <span className="inline-block text-[9px] font-black px-2 py-0.5 rounded border border-neon-purple/20 text-neon-purple bg-neon-purple/10 uppercase tracking-tighter">
            AKTİF
          </span>
          <div className="text-[10px] font-black text-neon-purple uppercase tracking-widest mt-1">Skor: {signal.opportunityScore}</div>
        </div>
        <div className="text-right min-w-[90px]">
          <div className="text-[9px] text-cyan-400 font-bold uppercase">Anlık Durum</div>
          <div className={`text-xl font-black ${profitLossPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
}
