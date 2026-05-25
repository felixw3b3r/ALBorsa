"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from "@/components/Navbar";
import IPONavbar from "@/components/IPONavbar";
import { motion } from "framer-motion";

export default function IPOLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Detay sayfasında mıyız kontrol edelim
  const isDetailPage = pathname !== '/halka-arz' && 
                       pathname !== '/halka-arz/takvim' && 
                       pathname !== '/halka-arz/tavan-hesapla';

  if (isDetailPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-neon-purple/30 overflow-x-hidden">
      <Navbar />
      
      <main className="pt-32 px-6 max-w-6xl mx-auto pb-20">
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-neon-purple"></div>
              <span className="text-neon-purple font-black tracking-[0.3em] uppercase text-xs">Piyasa Takibi</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-neon-purple"></div>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 leading-none text-white">
              Halka <span className="text-neon-purple">Arz</span> Terminali
            </h1>
            <p className="text-gray-500 text-lg max-w-xl mx-auto font-medium">
              2026 yılı güncel halka arz takvimi, onaylı izahnameler ve geçmiş arz analizleri.
            </p>
          </motion.div>
        </header>

        <IPONavbar />

        {children}
      </main>
    </div>
  );
}
