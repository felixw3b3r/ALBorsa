"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, Search, ArrowLeft, TrendingUp, TrendingDown, 
  Activity, Zap, Info, RefreshCw, BarChart3, Filter
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
  const [data, setData] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30 saniyede bir kontrol et
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/analysis/bist100`);
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

  const filteredData = data
    .filter(item => item.symbol.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.quant?.opportunityScore ?? b.scores.total) - (a.quant?.opportunityScore ?? a.scores.total));

  /*
      if (sortBy === 'total') return (b.quant?.opportunityScore ?? b.scores.total) - (a.quant?.opportunityScore ?? a.scores.total);
      if (sortBy === 'change') return b.changePercent - a.changePercent;
      if (sortBy === 'deepseek') {
        const getDecisionWeight = (item: any) => {
          const k = String(item.deepseek?.karar || item.quant?.decision || '');
          if (k === 'GUCLU_AL') return 4;
          if (k === 'KADEMELI_AL') return 3;
          if (k === 'IZLE') return 2;
          if (k === 'AZALT') return 1;
          if (k === 'GÜÇLÜ_AL' || k === 'AL') return 3;
          if (k === 'BEKLE') return 2;
          if (k === 'SAT') return 1;
          return 0;
        };

        const getProfitPotential = (item: any) => {
          if (!item.deepseek || !item.deepseek.take_profit) return -1000;
          return ((item.deepseek.take_profit - item.price) / item.price) * 100;
        };

        const weightA = getDecisionWeight(a);
        const weightB = getDecisionWeight(b);

        // 1. Önce Karar Hiyerarşisi (AL > BEKLE > SAT)
        if (weightA !== weightB) return weightB - weightA;

        // 2. Kararlar aynıysa kendi içlerinde Kâr Potansiyeline (%) bak
        return getProfitPotential(b) - getProfitPotential(a);
      }
      return 0;
    });

  */

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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-black tracking-tight"
            >
              BIST 100 <span className="text-gray-500">Rejim Bazli Model</span>
            </motion.h1>
            <p className="text-gray-400 max-w-xl">
              Rejim, relatif guc, momentum, hacim ve risk katmanlariyla BIST 100 hisselerinin olasilikli analizi.
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
              onClick={() => { setLoading(true); fetchData(); }}
              className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Toolbar Section */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input 
              type="text" 
              placeholder="Hisse ara... (Örn: THYAO)" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-neon-purple/50 transition-all"
            />
          </div>
          
          <div className="hidden">
            {(['total', 'change', 'deepseek'] as const).map((type) => (
              <button
                key={type}
                onClick={() => undefined}
                className={`px-6 py-4 rounded-2xl border font-bold text-sm transition-all ${
                  false
                    ? 'bg-neon-purple border-neon-purple text-white shadow-[0_0_20px_rgba(139,0,232,0.3)]' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                }`}
              >
                {type === 'total' ? 'Skora Göre' : type === 'change' ? 'Değişime Göre' : 'DeepSeek'}
              </button>
            ))}
          </div>
        </div>

        {/* Table / Grid Section */}
        {loading && data.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-white/5 rounded-[2rem] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredData.map((item, idx) => (
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
                        <span className="text-xl font-mono font-medium">₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        <span className={`text-sm font-bold flex items-center ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.changePercent >= 0 ? <TrendingUp size={14} className="mr-1"/> : <TrendingDown size={14} className="mr-1"/>}
                          %{Math.abs(item.changePercent).toFixed(2)}
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
                    <IndicatorItem label="SMA (20)" value={item.indicators.sma20?.toFixed(2) || '--'} status={item.price > (item.indicators.sma20 || 0) ? 'success' : 'danger'} />
                    <IndicatorItem label="EMA (50)" value={item.indicators.ema50?.toFixed(2) || '--'} status={item.price > (item.indicators.ema50 || 0) ? 'success' : 'danger'} />
                    <IndicatorItem label="VWAP Sapma" value={item.indicators.vwap ? `${(((item.price - item.indicators.vwap) / item.indicators.vwap) * 100).toFixed(2)}%` : '--'} status="neutral" />
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
                          <div className="text-sm font-mono font-black text-rose-400">₺{item.deepseek.stop_loss}</div>
                        </div>
                        <div className="flex-1 bg-black/60 p-3 rounded-xl border border-white/10 shadow-lg">
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[10px] text-gray-400 uppercase font-black">Kar Al</div>
                            <div className="text-[10px] font-bold text-emerald-400/80">
                              +%{(((item.deepseek.take_profit - item.price) / item.price) * 100).toFixed(1)}
                            </div>
                          </div>
                          <div className="text-sm font-mono font-black text-emerald-400">₺{item.deepseek.take_profit}</div>
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
              ))}
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
