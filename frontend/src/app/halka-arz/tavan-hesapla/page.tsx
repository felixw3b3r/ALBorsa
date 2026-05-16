"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Calculator, TrendingUp, Wallet, Info, CalendarRange } from 'lucide-react';

interface CeilingDay {
  day: number;
  price: number;
  dailyProfit: number;
  totalProfit: number;
  totalValue: number;
  totalReturnPercent: number; // Toplam anaparaya göre % kazanç
}

export default function IPOTavanHesaplaPage() {
  const [price, setPrice] = useState<number>(0);
  const [lot, setLot] = useState<number>(0);
  const [days, setDays] = useState<number>(10); // Varsayılan 10 gün
  const [results, setResults] = useState<CeilingDay[]>([]);

  useEffect(() => {
    if (price > 0 && lot > 0 && days > 0) {
      calculateCeilingSeries();
    } else {
      setResults([]);
    }
  }, [price, lot, days]);

  const calculateCeilingSeries = () => {
    const series: CeilingDay[] = [];
    const initialInvestment = price * lot;
    let currentPrice = price;

    // Kullanıcının girdiği gün sayısı kadar dön (Max 50 gün güvenlik sınırı)
    const targetDays = Math.min(days, 50);

    for (let day = 1; day <= targetDays; day++) {
      const nextPrice = Number((currentPrice * 1.10).toFixed(2));
      const totalValue = Number((nextPrice * lot).toFixed(2));
      const totalProfit = Number((totalValue - initialInvestment).toFixed(2));
      const dailyProfit = day === 1 
        ? Number((totalValue - initialInvestment).toFixed(2))
        : Number((totalValue - (currentPrice * lot)).toFixed(2));
      
      // Toplam Kar Yüzdesi: (Toplam Kar / Ana Para) * 100
      const totalReturnPercent = Number(((totalValue - initialInvestment) / initialInvestment * 100).toFixed(2));

      series.push({
        day,
        price: nextPrice,
        dailyProfit,
        totalProfit,
        totalValue,
        totalReturnPercent
      });
      currentPrice = nextPrice;
    }
    setResults(series);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      {/* Input Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-md">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Hisse Fiyatı</label>
          <div className="relative">
            <input 
              type="number" 
              value={price || ''} 
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:border-neon-purple transition-all text-2xl font-bold text-white"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 font-bold">TL</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-md">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Lot Miktarı</label>
          <div className="relative">
            <input 
              type="number" 
              value={lot || ''} 
              onChange={(e) => setLot(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:border-neon-purple transition-all text-2xl font-bold text-white"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 font-bold">LOT</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-md">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Tavan Gün Sayısı</label>
          <div className="relative">
            <input 
              type="number" 
              value={days || ''} 
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:border-neon-purple transition-all text-2xl font-bold text-white"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 font-bold italic text-neon-purple">GÜN</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
          >
            <div className="bg-neon-purple/10 border border-neon-purple/20 rounded-3xl p-6">
              <div className="flex items-center gap-3 text-neon-purple mb-2">
                <Wallet size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Ana Para (Maliyet)</span>
              </div>
              <div className="text-2xl font-bold">{(price * lot).toLocaleString()} TL</div>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-3xl p-6">
              <div className="flex items-center gap-3 text-green-400 mb-2">
                <TrendingUp size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">{results.length}. Gün Sonunda</span>
              </div>
              <div className="text-2xl font-bold">{results[results.length - 1].totalValue.toLocaleString()} TL</div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-3xl p-6">
              <div className="flex items-center gap-3 text-cyan-400 mb-2">
                <TrendingUp size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Toplam Kar (%)</span>
              </div>
              <div className="text-2xl font-bold text-cyan-400">%{results[results.length - 1].totalReturnPercent.toLocaleString()}</div>
              <div className="text-xs font-bold text-cyan-400/60 mt-1">+{results[results.length - 1].totalProfit.toLocaleString()} TL</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Table */}
      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-md">
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-gray-400">
              <CalendarRange size={20} />
            </div>
            <h2 className="text-xl font-bold">{results.length > 0 ? `${results.length} Günlük` : ''} Tavan Serisi Projeksiyonu</h2>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            <Info size={14} />
            Günlük %10 marj ile hesaplanmıştır
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] text-[10px] font-black text-gray-500 uppercase tracking-widest">
                <th className="px-8 py-4">Gün</th>
                <th className="px-8 py-4">Hisse Fiyatı</th>
                <th className="px-8 py-4">Günlük Kar</th>
                <th className="px-8 py-4">Toplam Kar (TL)</th>
                <th className="px-8 py-4 text-center">Toplam Kar (%)</th>
                <th className="px-8 py-4 text-right">Portföy Değeri</th>
              </tr>
            </thead>
            <tbody>
              {results.length > 0 ? (
                results.map((res) => (
                  <motion.tr 
                    key={res.day}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(res.day * 0.03, 0.5) }}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-8 py-5">
                      <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-black text-gray-400 group-hover:bg-neon-purple group-hover:text-white transition-all">
                        {res.day}
                      </span>
                    </td>
                    <td className="px-8 py-5 font-bold text-gray-300">
                      {res.price.toLocaleString(undefined, { minimumFractionDigits: 2 })} TL
                    </td>
                    <td className="px-8 py-5 font-bold text-green-400">
                      +%{ (res.day === 1 ? 10 : 10).toFixed(1) }
                      <span className="text-[10px] block opacity-60">+{res.dailyProfit.toLocaleString()} TL</span>
                    </td>
                    <td className="px-8 py-5 font-bold text-cyan-400">
                      {res.totalProfit.toLocaleString()} TL
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-xs font-black border border-cyan-500/20">
                        %{res.totalReturnPercent.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-8 py-5 font-black text-right text-white">
                      {res.totalValue.toLocaleString()} TL
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-gray-600 font-bold italic">
                    Hesaplama yapmak için fiyat, lot ve gün sayısı giriniz.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
