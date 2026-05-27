"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, Calendar, User, ExternalLink, Share2 } from 'lucide-react';

export default function NewsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [newsItem, setNewsItem] = useState<any>(null);
  const [content, setContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

  useEffect(() => {
    const storedNews = localStorage.getItem(`news_${params.id}`);
    if (storedNews) {
      const item = JSON.parse(storedNews);
      setNewsItem(item);
      if (item.content) {
        setContent(item.content);
        setLoadingContent(false);
      } else {
        fetchContent(item.link);
      }
    }
  }, [params.id]);

  const fetchContent = async (url: string) => {
    setLoadingContent(true);
    try {
      const res = await fetch(`${API_URL}/news/content?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      setContent(data.content);
    } catch (e) {
      setContent('Haber içeriği yüklenirken bir hata oluştu.');
    } finally {
      setLoadingContent(false);
    }
  };

  if (!newsItem) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neon-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Hero Header with Image */}
      <div className="relative h-[60vh] w-full overflow-hidden">
        <motion.img 
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.6 }}
          transition={{ duration: 1.5 }}
          src={newsItem.thumbnail} 
          alt={newsItem.title} 
          className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent" />
        
        {/* Navigation */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-center z-20">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full hover:bg-white/10 transition-all group"
          >
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold text-xs uppercase tracking-widest">Geri Dön</span>
          </button>
          <div className="flex gap-4">
            <button className="p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full hover:text-neon-purple transition-colors">
              <Share2 size={20} />
            </button>
          </div>
        </div>

        {/* Title & Metadata Over Image */}
        <div className="absolute bottom-12 left-8 right-8 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <span className="inline-block px-3 py-1 bg-neon-purple/20 border border-neon-purple/30 text-neon-purple text-[10px] font-black uppercase tracking-[0.2em] rounded-md mb-6">
              {newsItem.publisher} • ÖZEL HABER
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight mb-8">
              {newsItem.title}
            </h1>
            <div className="flex flex-wrap items-center gap-6 text-gray-400 text-xs font-bold uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-neon-purple" />
                <span>Yayınlanma: {new Date(newsItem.providerPublishTime * 1000).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <User size={16} className="text-neon-purple" />
                <span>Kaynak: {newsItem.publisher}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-4xl mx-auto px-8 py-16">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="prose prose-invert prose-lg max-w-none"
        >
          {loadingContent ? (
            <div className="flex flex-col items-center gap-6 py-20">
              <div className="w-10 h-10 border-2 border-white/10 border-t-neon-purple rounded-full animate-spin" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-xs">Makale Hazırlanıyor...</p>
            </div>
          ) : (
            <>
              <p className="text-xl text-gray-300 leading-relaxed font-medium mb-12 border-l-4 border-neon-purple pl-8 italic">
                {newsItem.title} - {newsItem.publisher} haber merkezinden gelen son dakika gelişmeleri.
              </p>
              
              <div className="whitespace-pre-wrap text-gray-400 leading-loose text-lg font-medium mb-16">
                {content}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-12 mb-12 backdrop-blur-sm">
                <h2 className="text-xl font-black mb-4 text-white uppercase tracking-tight">KAYNAKÇA VE ATIF</h2>
                <p className="text-sm text-gray-500 mb-8 italic">
                  Bu makale aslen <strong>{newsItem.publisher}</strong> tarafından yayınlanmıştır. ALBorsa, veriyi doğruluğunu koruyarak kullanıcılarına sunmaktadır.
                </p>
                
                <a 
                  href={newsItem.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-white/10 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-neon-purple transition-all group"
                >
                  Orijinal Kaynağa Git
                  <ExternalLink size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </a>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16">
            <div className="p-8 bg-white/[0.02] border border-white/5 rounded-3xl">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Piyasa Etkisi</h4>
              <p className="text-sm text-gray-400">Bu gelişme hisse senedi üzerinde kısa vadeli volatilite yaratabilir. Teknik göstergeleri takipte kalınız.</p>
            </div>
            <div className="p-8 bg-white/[0.02] border border-white/5 rounded-3xl">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Analist Görüşü</h4>
              <p className="text-sm text-gray-400">Sektörel trendlerle uyumlu bir haber akışı. Uzun vadeli projeksiyonlarda pozitif değerlendirilebilir.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
