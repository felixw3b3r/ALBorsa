"use client";

import React, { useEffect, useState } from 'react';
import { 
  Calendar, ChevronRight, ChevronDown, ChevronUp,
  Clock, Ticket, Users
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';

export default function IPOTakvimPage() {
  const [ipoList, setIpoList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/halkaarz')
      .then(res => res.json())
      .then(data => {
        setIpoList(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Global Style for Border Animation (scoped here since it was in original page) */}
      <style jsx global>{`
        @keyframes border-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-border-rotate {
          animation: border-rotate 3s linear infinite;
        }
      `}</style>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-neon-purple"></div>
          <span className="text-gray-500 font-bold animate-pulse">Veriler yükleniyor...</span>
        </div>
      ) : (
        ipoList.map((ipo, idx) => (
          <IPOListItem 
            key={ipo.symbol} 
            ipo={ipo} 
            idx={idx} 
            isExpanded={expandedId === ipo.symbol}
            onToggle={() => setExpandedId(expandedId === ipo.symbol ? null : ipo.symbol)}
          />
        ))
      )}
    </div>
  );
}

function IPOListItem({ ipo, idx, isExpanded, onToggle }: { ipo: any, idx: number, isExpanded: boolean, onToggle: () => void }) {
  const isActive = ipo.status === 'active';
  // EKDMR özel durum: Aktif olsa bile (kodu kalsın diye) özet gösterilecek
  const showSummary = !isActive || ipo.symbol === 'EKDMR';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className={`group relative flex flex-col p-[1.5px] rounded-[2.5rem] transition-all overflow-hidden mb-4 ${
        isActive && ipo.symbol !== 'EKDMR' ? "shadow-[0_0_50px_rgba(64,224,208,0.2)]" : ""
      }`}
    >
      {isActive && ipo.symbol !== 'EKDMR' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] aspect-square animate-border-rotate opacity-100">
          <div className="w-full h-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_170deg,#40E0D0_180deg,transparent_190deg,transparent_350deg,#40E0D0_360deg)]"></div>
        </div>
      )}

      <div className={`relative z-10 flex flex-col bg-black/95 rounded-[2.4rem] backdrop-blur-3xl h-full ${
        isActive && ipo.symbol !== 'EKDMR' ? "" : "border border-white/10 hover:border-white/20"
      }`}>
        <div className="flex flex-col md:flex-row items-center gap-6 p-6">
          <div className="flex items-center gap-6 w-full md:w-2/5">
            <div className={`w-16 h-16 bg-white rounded-2xl p-2 flex items-center justify-center overflow-hidden shrink-0 transition-transform ${
              isActive && ipo.symbol !== 'EKDMR' ? "border-2 border-turquoise shadow-[0_0_15px_rgba(64,224,208,0.3)]" : "group-hover:scale-105"
            }`}>
              <img src={ipo.logo} alt={ipo.name} className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider mb-1 inline-block ${
                isActive && ipo.symbol !== 'EKDMR' ? "bg-turquoise text-black" : "bg-neon-purple text-white"
              }`}>
                {ipo.symbol}
              </span>
              <h3 className={`font-bold text-xl leading-tight truncate ${
                isActive && ipo.symbol !== 'EKDMR' ? "text-white" : "text-white group-hover:text-neon-purple transition-colors"
              }`}>
                {ipo.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-8 w-full md:w-1/4 text-gray-400">
            <div className="flex items-center gap-3">
              <Calendar size={18} className={isActive && ipo.symbol !== 'EKDMR' ? "text-turquoise" : "text-neon-purple"} />
              <span className="text-sm font-bold text-gray-300">{ipo.date}</span>
            </div>
          </div>

          <div className="flex items-center justify-end w-full md:w-1/3">
            {isActive && ipo.symbol !== 'EKDMR' ? (
              <Link 
                href={`/halka-arz/${ipo.symbol}`}
                className="w-full md:w-auto px-6 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-turquoise hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.15)] relative overflow-hidden group/btn"
              >
                <span className="relative z-10 uppercase tracking-wider">Premium Detay</span>
                <ChevronRight size={14} className="relative z-10 group-hover/btn:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <button 
                onClick={onToggle}
                className={`w-full md:w-auto px-8 py-4 rounded-[1.5rem] text-sm font-bold transition-all flex items-center justify-center gap-2 border border-white/10 hover:bg-white/5 ${
                  isExpanded ? "bg-white/10 border-white/30 text-white" : "text-gray-400"
                }`}
              >
                {isExpanded ? "ÖZETİ KAPAT" : "ARZ ÖZETİ"}
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && showSummary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-white/5 bg-white/[0.02]"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-8">
                <DetailBox 
                  icon={<Ticket size={16} className="text-neon-purple" />}
                  label="Kişi Başına Düşen" 
                  value={ipo.details?.perPerson || "Bilgi Yok"} 
                />
                <DetailBox 
                  icon={<Clock size={16} className="text-neon-purple" />}
                  label="İşleme Başlama" 
                  value={ipo.details?.listingDate || "Henüz Başlamadı"} 
                />
                <DetailBox 
                  icon={<Users size={16} className="text-neon-purple" />}
                  label="Katılımcı Sayısı" 
                  value={ipo.details?.participants || "Bilgi Yok"} 
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DetailBox({ icon, label, value }: { icon: any, label: string, value: string }) {
  return (
    <div className="flex items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
      <div className="p-2 bg-white/5 rounded-xl">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-black mb-0.5">{label}</div>
        <div className="text-sm font-bold text-gray-200">{value}</div>
      </div>
    </div>
  );
}
