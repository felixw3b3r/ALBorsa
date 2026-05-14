"use client";

import Navbar from "@/components/Navbar";
import { ArrowRight, BarChart3, ShieldCheck, Zap, ArrowDown, Cpu, Globe2, FileText, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

const HeroBackground = dynamic(() => import("@/components/HeroBackground"), { ssr: false });

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white font-sans relative">
      {/* Full Screen Global Background Glow (Subtle Cyan) */}
      <div className="global-glow" />
      
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <HeroBackground />
        
        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-sm font-medium text-gray-300 mb-8"
          >
            <TrendingUp size={14} className="text-neon-purple" />
            <span>Geleceğin Borsa Analiz Platformu</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 leading-[0.9]"
          >
            BORSA İSTANBUL'U <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50">
              YAPAY ZEKA İLE KEŞFET
            </span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto text-xl text-gray-400 mb-10 leading-relaxed"
          >
            Karmaşık teknik analizleri saniyeler içinde tamamlayın. BIST hisselerini derinlemesine analiz edin ve akıllı yatırım kararları alın.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button className="w-full sm:w-auto bg-neon-purple text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-neon-purple-hover hover:scale-105 transition-transform flex items-center justify-center gap-2">
              Ücretsiz Başla <ArrowRight size={20} />
            </button>
            <button className="w-full sm:w-auto bg-white/5 border border-white/10 px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition-colors">
              Nasıl Çalışır?
            </button>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<BarChart3 />} 
            title="Portföy Takibi" 
            desc="Tüm yatırımlarınızı tek bir panelden izleyin. Hisselerinizin performansını anlık grafiklerle takip edin." 
          />
          <FeatureCard 
            icon={<Zap />} 
            title="Reel Kar/Zarar" 
            desc="Enflasyondan arındırılmış gerçek kazancınızı görün. Temettü ve maliyet hesaplamalarıyla net kârınızı bilin." 
          />
          <FeatureCard 
            icon={<ShieldCheck />} 
            title="AI Strateji Raporu" 
            desc="Her hisse için özel üretilen 'Al/Sat/Tut' stratejileri. Teknik verileri yapay zekaya yorumlatın." 
          />
        </div>
      </section>

      {/* Services Section with Animations */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          
          {/* Continuous Vertical Line */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-neon-purple to-transparent hidden md:block z-0" />

          {/* Section Title & Scroll Arrow - Moved Up */}
          <div className="relative z-10 flex flex-col items-center mb-24">
            <motion.div 
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              onClick={() => document.getElementById('services-list')?.scrollIntoView({ behavior: 'smooth' })}
              className="cursor-pointer bg-neon-purple p-3 rounded-full hover:scale-110 transition-transform shadow-[0_0_20px_rgba(139,0,232,0.5)] mb-8"
            >
              <ArrowDown size={20} className="text-black" />
            </motion.div>

            <h2 className="text-4xl font-bold tracking-tight bg-black px-8 py-2 border border-white/10 rounded-full">
              Hizmetlerimiz
            </h2>
          </div>

          <div id="services-list" className="space-y-32 relative z-10">
            {/* 1. Portföy Yönetimi - Right */}
            <ServiceRow 
              side="right" 
              icon={<BarChart3 size={32} />} 
              title="Portföy Yönetimi" 
              desc="Tüm varlıklarınızı tek bir akıllı panelden profesyonelce yönetin. Risk dağılımınızı anlık izleyin." 
            />

            {/* 2. Reel Kar - Left */}
            <ServiceRow 
              side="left" 
              icon={<TrendingUp size={32} />} 
              title="Reel Kar Analizi" 
              desc="Enflasyondan arındırılmış gerçek kazancınızı hesaplayın. Paranızı koruyup korumadığınızı net görün." 
            />

            {/* 3. AI Strateji Raporu - Right */}
            <ServiceRow 
              side="right" 
              icon={<Zap size={32} />} 
              title="AI Strateji Raporu" 
              desc="Her hisse için özel olarak üretilen, teknik veriye dayalı yapay zeka stratejileriyle bir adım önde olun." 
            />

            {/* 4. Kurumsal İşlem Takibi - Left */}
            <ServiceRow 
              side="left" 
              icon={<ShieldCheck size={32} />} 
              title="Kurumsal İşlem Takibi" 
              desc="Büyük aracı kurumların ve 'balinaların' anlık işlemlerini gözlemleyin, para akışını takip edin." 
            />

            {/* 5. Algoritmik İşlem Desteği - Right */}
            <ServiceRow 
              side="right" 
              icon={<Cpu size={32} />} 
              title="Algoritmik İşlem Desteği" 
              desc="Veri odaklı karar verme mekanizmalarıyla piyasa dalgalanmalarına karşı stratejinizi otomatikleştirin." 
            />

            {/* 6. Global Piyasa Entegrasyonu - Left */}
            <ServiceRow 
              side="left" 
              icon={<Globe2 size={32} />} 
              title="Global Piyasa Entegrasyonu" 
              desc="Sadece BIST değil, dünya devlerini de takip edin. Portföyünüzü global ölçekte çeşitlendirin." 
            />

            {/* 7. Özel Portföy Raporları - Right */}
            <ServiceRow 
              side="right" 
              icon={<FileText size={32} />} 
              title="Özel Portföy Raporları" 
              desc="Haftalık ve aylık olarak hazırlanan AI destekli raporlarla yatırım yolculuğunuzu dökümante edin." 
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 text-center text-gray-500 text-sm">
        <p>&copy; 2026 ALBorsa. Tüm hakları saklıdır. Yatırım tavsiyesi değildir.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <motion.div 
      whileHover={{ y: -10 }}
      className="p-8 rounded-3xl border border-white/5 bg-black hover:border-neon-purple/50 transition-all group"
    >
      <div className="text-white group-hover:text-neon-purple mb-6 w-10 h-10 transition-colors">
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-4">{title}</h3>
      <p className="text-gray-400">{desc}</p>
    </motion.div>
  );
}

function ServiceRow({ side, icon, title, desc }: { side: 'left' | 'right', icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className={`flex items-center w-full ${side === 'left' ? 'md:flex-row-reverse' : ''}`}>
      <div className="hidden md:block w-1/2" />
      
      {/* Connector Dot */}
      <div className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-neon-purple rounded-full border-4 border-black z-10 hidden md:block" />

      <motion.div 
        initial={{ x: side === 'right' ? 100 : -100, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring", damping: 20, stiffness: 100 }}
        className={`w-full md:w-1/2 p-1 ${side === 'right' ? 'md:pl-12' : 'md:pr-12'}`}
      >
        <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] hover:bg-white/[0.08] transition-colors group">
          <div className="text-neon-purple mb-4 bg-neon-purple/10 w-fit p-3 rounded-2xl">
            {icon}
          </div>
          <h3 className="text-2xl font-bold mb-3">{title}</h3>
          <p className="text-gray-400 leading-relaxed">{desc}</p>
        </div>
      </motion.div>
    </div>
  );
}
