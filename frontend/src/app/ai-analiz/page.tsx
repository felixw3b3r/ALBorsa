"use client";

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Brain, Cpu, Sparkles, ArrowLeft, Database, Layers, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';

export default function AiAnalizPage() {
  const router = useRouter();

  // Animasyon varyasyonları
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 15 }
    }
  };

  const glowVariants: Variants = {
    animate: {
      scale: [1, 1.1, 0.95, 1.05, 1],
      opacity: [0.5, 0.75, 0.4, 0.65, 0.5],
      transition: {
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  const progressItems = [
    { name: "Veri Eğitimi & ML Modeli", progress: 92, icon: <Database className="w-5 h-5 text-neon-purple" /> },
    { name: "Teknik Analiz Motoru", progress: 100, icon: <Cpu className="w-5 h-5 text-cyan-400" /> },
    { name: "Güvenlik & Hız Optimizasyonu", progress: 85, icon: <ShieldCheck className="w-5 h-5 text-emerald-400" /> },
    { name: "Stratejik Raporlama Katmanı", progress: 78, icon: <Layers className="w-5 h-5 text-amber-400" /> }
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans relative overflow-hidden flex flex-col justify-between">
      {/* Arka Plan Glow Efektleri */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-neon-purple/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[180px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,#000_100%)]" />
      </div>

      <Navbar />

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center pt-32 pb-20 px-6 relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-3xl w-full text-center flex flex-col items-center"
        >
          {/* Logo / Glowing Brain Core */}
          <motion.div variants={itemVariants} className="relative mb-12">
            {/* Arka Plan Glow Halesi */}
            <motion.div
              variants={glowVariants}
              animate="animate"
              className="absolute inset-0 -m-8 bg-gradient-to-tr from-neon-purple via-fuchsia-600 to-cyan-400 rounded-full blur-3xl opacity-50"
            />
            
            {/* Ana İkon Kartı */}
            <div className="relative w-32 h-32 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-2xl flex items-center justify-center shadow-[0_0_50px_rgba(139,0,232,0.25)] group hover:border-neon-purple/50 transition-colors duration-500">
              <motion.div
                animate={{
                  rotateY: [0, 360],
                  scale: [1, 1.05, 1]
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  repeatType: "reverse",
                  ease: "easeInOut"
                }}
              >
                <Brain className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(139,0,232,0.7)]" />
              </motion.div>
              <motion.div
                animate={{
                  opacity: [0.3, 1, 0.3],
                  scale: [0.8, 1.2, 0.8]
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute top-4 right-4"
              >
                <Sparkles className="w-5 h-5 text-cyan-400" />
              </motion.div>
            </div>
          </motion.div>

          {/* Heading */}
          <motion.div variants={itemVariants} className="space-y-4 mb-6">
            <span className="px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-neon-purple/10 border border-neon-purple/30 text-neon-purple inline-flex items-center gap-1.5 shadow-[0_0_15px_rgba(139,0,232,0.15)]">
              <Sparkles className="w-3.5 h-3.5" /> Çok Yakında
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
              AI Analiz Modülü <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-white/40">
                Geliştirilmektedir
              </span>
            </h1>
          </motion.div>

          {/* Subtitle / Description */}
          <motion.p
            variants={itemVariants}
            className="text-gray-400 text-lg md:text-xl max-w-2xl leading-relaxed mb-12"
          >
            Yapay zeka algoritmalarımız ve derin öğrenme modellerimiz şu anda Borsa İstanbul ve NASDAQ verileriyle eğitilmektedir. Çok yakında profesyonel AI destekli hisse raporları ve Al/Sat/Tut stratejileri hizmetinizde olacaktır.
          </motion.p>

          {/* Development Status Dashboard / Progress Cards */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left mb-12"
          >
            {progressItems.map((item, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm flex flex-col justify-between gap-4 hover:border-white/10 hover:bg-white/[0.05] transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/5 group-hover:scale-110 transition-transform">
                      {item.icon}
                    </div>
                    <span className="font-semibold text-sm text-gray-200">{item.name}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">
                    %{item.progress}
                  </span>
                </div>
                
                {/* Progress Bar Container */}
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.progress}%` }}
                    transition={{ delay: 0.5 + idx * 0.1, duration: 1.2, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-neon-purple to-cyan-500 rounded-full"
                  />
                </div>
              </div>
            ))}
          </motion.div>

          {/* Navigation Action Buttons */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="px-8 py-3.5 rounded-xl font-bold bg-white text-black hover:bg-neon-purple hover:text-white hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2 group shadow-[0_4px_20px_rgba(255,255,255,0.1)] cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              Ana Sayfaya Dön
            </button>
            <button
              onClick={() => router.push('/piyasalar')}
              className="px-8 py-3.5 rounded-xl font-bold bg-white/5 hover:bg-white/10 border border-white/10 transition-colors duration-300 flex items-center justify-center gap-2 cursor-pointer"
            >
              Piyasaları İncele
            </button>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5 text-center text-gray-500 text-xs relative z-10 bg-black/40 backdrop-blur-md">
        <p>&copy; 2026 ALBorsa. Tüm hakları saklıdır. Yatırım tavsiyesi değildir.</p>
      </footer>
    </div>
  );
}
