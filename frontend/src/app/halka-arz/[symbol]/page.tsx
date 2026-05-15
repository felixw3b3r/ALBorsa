"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from "@/components/Navbar";
import { 
  Rocket, Calendar, Tag, ArrowLeft, TrendingUp, Users, 
  Briefcase, PieChart, Info, CheckCircle2, AlertCircle 
} from "lucide-react";
import { motion } from "framer-motion";

export default function HalkaArzDetailPage() {
  const { symbol } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch(`http://localhost:5000/api/halkaarz/${symbol}`)
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [symbol]);

  if (!mounted) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-neon-purple"></div>
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="min-h-screen bg-black text-white p-20 flex flex-col items-center justify-center text-center">
        <AlertCircle size={64} className="text-red-500 mb-6" />
        <h1 className="text-4xl font-bold mb-4">{symbol} İçin Detay Bulunamadı</h1>
        <p className="text-gray-400 mb-8 max-w-md">{data.error}</p>
        <button 
          onClick={() => router.back()}
          className="px-8 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all"
        >
          Geri Dön
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans relative pb-20">
      <Navbar />
      
      <main className="pt-32 px-6 max-w-7xl mx-auto">
        {/* Back Button */}
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span>Halka Arz Listesine Dön</span>
        </button>

        {/* Header Section */}
        <section className="flex flex-col md:flex-row items-center gap-8 mb-16">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-32 h-32 bg-white rounded-[2.5rem] p-4 flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_50px_rgba(255,255,255,0.1)]"
          >
            <img src={data.logo} alt={data.title} className="w-full h-full object-contain" />
          </motion.div>
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
              <span className="bg-neon-purple text-black text-xs font-black px-3 py-1 rounded-lg uppercase tracking-widest">
                {data.symbol}
              </span>
              <span className="text-gray-500 font-bold">•</span>
              <span className="text-neon-purple font-bold text-sm tracking-widest uppercase flex items-center gap-1">
                <CheckCircle2 size={14} />
                Onaylı Arz
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4 leading-none">
              {data.title}
            </h1>
            <p className="text-gray-400 text-lg flex items-center justify-center md:justify-start gap-2">
              <Calendar size={18} className="text-neon-purple" />
              {data.date}
            </p>
          </div>
        </section>

        {/* Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <SummaryCard label="Arz Fiyatı" value={data.price} icon={<Tag className="text-neon-purple" />} />
          <SummaryCard label="Dağıtım Şekli" value={data.distribution} icon={<Users className="text-neon-purple" />} />
          <SummaryCard label="Lot Sayısı" value={data.lots} icon={<Briefcase className="text-neon-purple" />} />
          <SummaryCard label="Arz Büyüklüğü" value={data.size} icon={<TrendingUp className="text-neon-purple" />} />
        </div>

        {/* Deep Details Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            
            {/* 1. Distribution Estimates Table */}
            {data.estimates && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 overflow-hidden"
              >
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                  <Users size={24} className="text-neon-purple" />
                  Katılımcı Bazlı Tahmini Dağıtım
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-white/5">
                        <th className="pb-4 font-bold">Katılımcı Sayısı</th>
                        <th className="pb-4 font-bold text-center">Tahmini Lot</th>
                        <th className="pb-4 font-bold text-right">Tahmini Tutar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.estimates.map((row: any, idx: number) => (
                        <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 font-bold text-gray-300">{row.participants}</td>
                          <td className="py-4 text-center text-neon-purple font-bold">{row.lots}</td>
                          <td className="py-4 text-right text-white font-mono">{row.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* 2. Financial Performance Table (ŞİMDİ ÜSTTE) */}
            {data.balanceSheet && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 overflow-hidden"
              >
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                  <TrendingUp size={24} className="text-neon-purple" />
                  Finansal Performans (Milyar TL)
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-white/5">
                        <th className="pb-4 font-bold">Dönem</th>
                        <th className="pb-4 font-bold text-center">Hasılat</th>
                        <th className="pb-4 font-bold text-right">Brüt Kar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.balanceSheet.map((row: any, idx: number) => (
                        <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 font-bold text-gray-300">{row.year}</td>
                          <td className="py-4 text-center text-white font-medium">{row.revenue}</td>
                          <td className="py-4 text-right text-green-500 font-bold">{row.profit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* 3. Fund Usage (ŞİMDİ ALTTA) */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8"
            >
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <PieChart size={24} className="text-neon-purple" />
                Halka Arz Geliri Nerede Kullanılacak?
              </h2>
              <div className="space-y-6">
                {data.fundUsage.map((usage: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300 font-medium">{usage.area}</span>
                      <span className="text-neon-purple font-bold">%{usage.ratio}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${usage.ratio}%` }}
                        transition={{ delay: 0.5 + (idx * 0.1), duration: 1 }}
                        className="h-full bg-gradient-to-r from-neon-purple to-purple-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 4. Allocation Table */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 overflow-hidden"
            >
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <Users size={24} className="text-neon-purple" />
                Tahsisat Grupları
              </h2>
              <div className="space-y-6">
                {data.allocation.map((item: any, idx: number) => (
                  <div key={idx} className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-gray-300">{item.group}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{item.lot} Lot</div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-neon-purple font-black text-sm">%{item.ratio}</span>
                          {item.group.includes('Yüksek') && data.extra.highThreshold && (
                            <span className="text-[10px] text-gray-500 font-bold bg-white/5 px-2 py-0.5 rounded-md">
                              ({data.extra.highThreshold.split(' ')[0]} TL+)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.ratio}%` }}
                        transition={{ delay: 0.3 + (idx * 0.1), duration: 1 }}
                        className="h-full bg-gradient-to-r from-neon-purple to-indigo-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right Sidebar - 1 Col */}
          <div className="space-y-8">
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 space-y-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                <Info size={24} className="text-neon-purple" />
                Teknik Bilgiler
              </h2>
              
              <TechnicalItem label="Aracı Kurum" value={data.manager} />
              <TechnicalItem label="Pazar" value={data.market} />
              
              <div className="space-y-2 pt-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Halka Arz Şekli</div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-xl">
                    <span className="text-[10px] text-gray-400">Sermaye Artırımı</span>
                    <span className="text-xs font-bold text-white">{data.method.capitalIncrease}</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-xl">
                    <span className="text-[10px] text-gray-400">Ortak Satışı</span>
                    <span className="text-xs font-bold text-white">{data.method.partnerSale}</span>
                  </div>
                </div>
              </div>

              <TechnicalItem label="T1-T2 Bakiye" value={data.t1t2} color={data.t1t2.includes('Kullanılabilir') ? 'text-green-500' : 'text-red-500'} />
              <TechnicalItem label="Fiyat İstikrarı" value={data.stability} />
              <TechnicalItem label="Katılım Endeksi" value={data.index} color={data.index.includes('Uygun') ? 'text-green-500' : 'text-red-500'} />
              
              <div className="pt-6 border-t border-white/5 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-bold">Halka Açıklık</span>
                  <span className="text-white font-bold">{data.extra.float}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-bold">Halka Arz İskontosu</span>
                  <span className="text-neon-purple font-bold">{data.extra.discount}</span>
                </div>
              </div>
            </div>

            <div className="bg-neon-purple/5 border border-neon-purple/20 rounded-[2.5rem] p-8">
              <h3 className="text-xl font-bold mb-4 text-neon-purple">Yatırımcı Notu</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Bu veriler taslak izahname ve onaylı halka arz bilgilerinden derlenmiştir. Yatırım yapmadan önce resmi izahnameyi mutlaka inceleyiniz.
              </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl group hover:border-neon-purple/30 transition-all">
      <div className="mb-4">{icon}</div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-black mb-1">{label}</div>
      <div className="text-xl font-bold group-hover:text-neon-purple transition-colors">{value}</div>
    </div>
  );
}

function TechnicalItem({ label, value, color = "text-gray-200" }: { label: string, value: string, color?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{label}</div>
      <div className={`text-sm font-bold leading-snug ${color}`}>{value}</div>
    </div>
  );
}
