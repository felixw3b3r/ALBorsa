"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import SymbolLogo from "@/components/SymbolLogo";
import { ChevronLeft, TrendingUp, TrendingDown, RefreshCw, Search, ExternalLink, ArrowUpRight } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function IndexDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = params.symbol as string;
  
  const [mounted, setMounted] = useState(false);
  const [indexData, setIndexData] = useState<any>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [timeRange, setTimeRange] = useState({ id: '1g', label: '1G', interval: '15m' });
  const [kapDisclosures, setKapDisclosures] = useState<any[]>([]);
  const [kapLoading, setKapLoading] = useState(false);
  const [selectedKap, setSelectedKap] = useState<any | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const ranges = [
    { id: '1g', label: '1G', interval: '15m' },
    { id: '2g', label: '2G', interval: '15m' },
    { id: '3g', label: '3G', interval: '15m' },
    { id: '1w', label: '1H', interval: '1h' },
    { id: '1a', label: '1A', interval: '1h' },
    { id: '3a', label: '3A', interval: '1d' },
    { id: '1y', label: '1Y', interval: '1d' },
  ];

  useEffect(() => {
    setMounted(true);
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 60000);
    return () => clearInterval(interval);
  }, [symbol, timeRange]);

  // KAP Bildirimlerini Getir
  useEffect(() => {
    const fetchKap = async () => {
      setKapLoading(true);
      try {
        const res = await fetch(`${API_URL}/stocks/${symbol}/kap`);
        const data = await res.json();
        if (data.success) {
          setKapDisclosures(data.data || []);
        }
      } catch (err) {
        console.error('KAP fetch error:', err);
      } finally {
        setKapLoading(false);
      }
    };
    fetchKap();

    const fetchNews = async () => {
      setNewsLoading(true);
      try {
        const res = await fetch(`${API_URL}/stocks/${symbol}/news`);
        if (res.ok) {
          const data = await res.json();
          setNews(data || []);
        }
      } catch (err) {
        console.error('News fetch error:', err);
      } finally {
        setNewsLoading(false);
      }
    };
    fetchNews();
  }, [symbol]);

  // Otomatik Kademeli Yükleme (Progressive Loading)
  useEffect(() => {
    if (visibleCount < components.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prev => Math.min(prev + 20, components.length));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, components.length]);

  // Arama filtresi
  const filteredComponents = components.filter(c => 
    c.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedComponents = filteredComponents.slice(0, visibleCount);

  const fetchData = async (isRangeChange = false) => {
    if (isRangeChange) setChartLoading(true);
    else setLoading(true);
    try {
      const indexRes = await fetch(`${API_URL}/stocks/${symbol}?range=${timeRange.id}&interval=${timeRange.interval}`);
      const indexInfo = await indexRes.json();
      setIndexData(indexInfo);

      // Bileşenleri her zaman ilk yüklemede veya symbol değiştiğinde getir
      if (!isRangeChange || components.length === 0) {
        const compRes = await fetch(`${API_URL}/stocks/${symbol}/components`);
        if (compRes.ok) {
          const compData = await compRes.json();
          setComponents(compData);
        }
      }
      
      setLastUpdated(new Date().toLocaleTimeString('tr-TR'));
    } catch (error: any) {
      console.error('Data fetch error:', error);
    } finally {
      setLoading(false);
      setChartLoading(false);
    }
  };

  if (!mounted) return null;

  if (!indexData && loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <RefreshCw className="animate-spin text-neon-purple" size={48} />
      </div>
    );
  }

  const currentDisplayPrice = hoveredValue || indexData?.price;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <motion.button 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
        >
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold">Geri Dön</span>
        </motion.button>

        {lastUpdated && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Canlı Veri • Son Güncelleme: {lastUpdated}</span>
          </motion.div>
        )}
      </div>

      <div className="max-w-[1600px] mx-auto">
        {/* Top Section: Index Summary & Advanced Chart */}
        <div className="flex flex-col gap-8 mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4"
          >
            <div>
              <h1 className={`font-black tracking-tighter mb-2 ${
                (indexData?.name || symbol).length > 12 
                ? 'text-4xl md:text-6xl' 
                : 'text-6xl md:text-8xl'
              }`}>
                {(indexData?.name || symbol).replace('.IS', '')}
              </h1>
              <div className="flex items-baseline gap-6">
                <span className="text-5xl md:text-7xl font-bold tracking-tight text-white">
                  {currentDisplayPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                {indexData?.history && indexData.history.length > 0 && (
                  (() => {
                    // 1G için dünkü kapanışı türet: price - change = previousClose
                    // Diğer zaman dilimleri için grafiğin başlangıç noktasını baz al
                    const startPrice = timeRange.id === '1g'
                      ? (indexData.price - indexData.change)
                      : indexData.history[0];
                    
                    const diff = currentDisplayPrice - startPrice;
                    const diffPercent = (diff / startPrice) * 100;
                    const isPositive = diff >= 0;

                    return (
                      <div className={`flex items-center gap-2 text-3xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                        <span>{isPositive ? '+' : ''}{diffPercent?.toFixed(2)}%</span>
                        <span className="text-gray-500 text-xl font-medium">({isPositive ? '+' : ''}{diff?.toFixed(2)})</span>
                      </div>
                    );
                  })()
                )}
              </div>
              <div className="h-[80px] mt-4">
                {hoveredValue && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1">
                    <p className="text-cyan-400 font-black text-xs uppercase tracking-[0.3em] italic">
                      • Grafik Üzerindeki Değer
                    </p>
                    {hoveredIndex !== null && indexData?.timestamps?.[hoveredIndex] && (
                      <span className="text-gray-400 text-sm font-bold">
                        {new Date(indexData.timestamps[hoveredIndex]).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Time Range Selector (Integrated into Header area) */}
            <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
              {ranges.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setTimeRange(r)}
                  className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${
                    timeRange.id === r.id 
                      ? 'bg-neon-purple text-white shadow-[0_0_20px_rgba(188,19,254,0.5)]' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </motion.div>
          
          {/* Advanced Interactive Chart (FULL WIDTH) */}
          <div className="w-full h-[500px] md:h-[600px] relative bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 rounded-[4rem] p-12 backdrop-blur-sm shadow-2xl overflow-hidden group flex items-center justify-center">
            {chartLoading ? (
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="animate-spin text-neon-purple/50" size={48} />
                <span className="text-gray-600 font-black uppercase tracking-widest text-xs">Veriler Hazırlanıyor...</span>
              </div>
            ) : (
              <SparklineFull 
                key={`${symbol}-${timeRange.id}-${indexData?.history?.length}`}
                data={indexData?.history || []} 
                color={indexData?.changePercent >= 0 ? "#4ade80" : "#f87171"} 
                onHover={(val, idx) => {
                  setHoveredValue(val);
                  setHoveredIndex(idx);
                }}
              />
            )}
          </div>
        </div>

        <hr className="border-white/5 mb-12" />

        {/* Components Header & Search (Only show if it's an index with components) */}
        {components.length > 0 && (
          <>
            <div className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase text-gray-500 italic">Endeks Bileşenleri</h2>
                <span className="text-sm text-gray-600 font-bold">{filteredComponents.length} Hisse Listeleniyor</span>
              </div>

              <div className="relative w-full md:w-96 group">
                <input
                  type="text"
                  placeholder="Hisse ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 pl-12 focus:outline-none focus:border-cyan-400 transition-all text-white font-bold placeholder:text-gray-600 backdrop-blur-sm"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors" size={20} />
                {searchTerm && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_cyan]" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedComponents.map((comp, idx) => (
                <motion.div
                  layout
                  key={comp.symbol}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => router.push(`/piyasalar/${comp.symbol}`)}
                  className={`bg-white/5 border p-4 rounded-2xl flex items-center gap-4 transition-all group cursor-pointer ${
                    searchTerm && (comp.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || comp.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    ? 'border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]'
                    : 'border-white/5'
                  } hover:bg-white/10 hover:border-white/20`}
                >
                  <SymbolLogo
                    symbol={comp.symbol}
                    color={comp.changePercent >= 0 ? "#4ade80" : "#f87171"}
                    size="sm"
                  />

                  <div className="flex flex-col flex-grow">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">{comp.symbol.split('.')[0]}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-sm group-hover:text-neon-purple transition-colors truncate max-w-[140px]">{comp.name}</span>
                      <span className="text-xs font-medium text-gray-400 italic">
                        {comp.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end">
                    <div className={`font-black text-lg leading-none ${comp.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                       %{comp.changePercent?.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-bold text-gray-500 mt-1">
                      {comp.change?.toFixed(2)} {indexData?.category === "Global Endeksler" || indexData?.category === "Kripto Paralar" ? "$" : "TL"}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* KAP Bildirimleri Section */}
        {(!kapLoading && kapDisclosures.length === 0) ? null : (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase text-gray-500 italic">KAP Bildirimleri</h2>
                <span className="text-sm text-gray-600 font-bold">
                  {kapLoading ? 'Yükleniyor...' : `${kapDisclosures.length} Bildirim`}
                </span>
              </div>
              {kapDisclosures.length > 0 && (
                <a
                  href={`https://www.kap.org.tr/tr/bildirim-sorgu`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-cyan-400 transition-colors"
                >
                  KAP'ta Görüntüle <ExternalLink size={14} />
                </a>
              )}
            </div>

            {kapLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="animate-spin text-neon-purple/50" size={32} />
              </div>
            ) : selectedKap ? (
              /* Detail View */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-[2rem] p-8"
              >
                <button
                  onClick={() => setSelectedKap(null)}
                  className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-6 text-sm font-bold"
                >
                  <ChevronLeft size={16} /> Geri Dön
                </button>

                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                      {selectedKap.date} • {selectedKap.type}
                    </span>
                    <h3 className="text-xl font-black text-white mt-2">{selectedKap.subject}</h3>
                    <p className="text-gray-400 font-medium mt-2">{selectedKap.title}</p>
                  </div>
                  <a
                    href={selectedKap.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-cyan-400 hover:border-cyan-400/50 transition-all shrink-0"
                  >
                    KAP'ta Aç <ExternalLink size={14} />
                  </a>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-white/[0.02] rounded-2xl border border-white/5">
                  <div>
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Şirket</span>
                    <p className="text-sm font-bold text-white mt-1">{selectedKap.company}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Tür</span>
                    <p className="text-sm font-bold text-white mt-1">{selectedKap.class}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Hisse Kodları</span>
                    <p className="text-sm font-bold text-white mt-1">{selectedKap.stockCodes}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Ek</span>
                    <p className="text-sm font-bold text-white mt-1">{selectedKap.hasAttachments ? 'Var' : 'Yok'}</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* List View */
              <div className="space-y-3">
                {kapDisclosures.map((disclosure, idx) => (
                  <motion.div
                    key={disclosure.index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedKap(disclosure)}
                    className="bg-white/5 border border-white/5 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          {disclosure.date}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          disclosure.type === 'ODA'
                            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {disclosure.type}
                        </span>
                        {disclosure.hasAttachments && (
                          <span className="text-[10px] font-bold text-cyan-500">📎</span>
                        )}
                      </div>
                      <h4 className="font-bold text-white group-hover:text-neon-purple transition-colors truncate">
                        {disclosure.subject}
                      </h4>
                      <p className="text-sm text-gray-500 font-medium mt-1 line-clamp-2">
                        {disclosure.title}
                      </p>
                    </div>
                    <ChevronLeft size={18} className="text-gray-600 rotate-180 mt-2 shrink-0 group-hover:text-cyan-400 transition-colors" />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Genel Haberler Section */}
        {(!newsLoading && news.length === 0) ? null : (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase text-gray-500 italic">Haber Akışı</h2>
                <span className="text-sm text-gray-600 font-bold">
                  {newsLoading ? 'Yükleniyor...' : `${news.length} Güncel Haber`}
                </span>
              </div>
            </div>

            {newsLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="animate-spin text-cyan-400/50" size={32} />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {news.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    onClick={() => {
                      // Haberi localStorage'a kaydet (Detay sayfasında kullanmak için)
                      localStorage.setItem(`news_${item.id}`, JSON.stringify(item));
                      router.push(`/haberler/${item.id}`);
                    }}
                    className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group cursor-pointer hover:border-neon-purple/50 transition-all flex flex-col md:flex-row"
                  >
                    <div className="w-full md:w-1/3 h-48 md:h-auto overflow-hidden">
                      <img 
                        src={item.thumbnail} 
                        alt={item.title} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 grayscale group-hover:grayscale-0"
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-black text-neon-purple uppercase tracking-widest bg-neon-purple/10 px-2 py-0.5 rounded">
                            {item.publisher}
                          </span>
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            {new Date(item.providerPublishTime).toLocaleDateString('tr-TR')}
                          </span>
                        </div>
                        <h4 className="font-bold text-white group-hover:text-neon-purple transition-colors line-clamp-3 mb-4">
                          {item.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-500 group-hover:text-white transition-colors">
                        OKUMAYA DEVAM ET <ArrowUpRight size={14} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Advanced Chart Component
function SparklineFull({ data, color, onHover }: { data: number[], color: string, onHover: (val: number | null, idx: number | null) => void }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const width = 1000;
  const height = 300;
  
  const getX = (idx: number) => (idx / (data.length - 1)) * width;
  const getY = (val: number) => height - ((val - min) / range) * height;

  const points = data.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' ');

  // Y-Axis Ticks
  const ticks = [max, min + range * 0.66, min + range * 0.33, min];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round((x / width) * (data.length - 1));
    if (idx >= 0 && idx < data.length) {
      onHover(data[idx], idx);
    }
  };

  return (
    <svg 
      viewBox={`0 0 ${width} ${height}`} 
      className="w-full h-full overflow-visible cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHover(null, null)}
    >
      {/* Y-Axis Labels */}
      {ticks.map((tick, i) => (
        <g key={i}>
          <text x="-10" y={getY(tick)} className="fill-gray-600 text-[12px] font-bold" textAnchor="end" alignmentBaseline="middle">
            {tick.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
          </text>
          <line x1="0" y1={getY(tick)} x2={width} y2={getY(tick)} className="stroke-white/5" strokeWidth="1" />
        </g>
      ))}

      {/* Opening & Current Reference Lines with Labels */}
      <g>
        <line x1="0" y1={getY(data[0])} x2={width} y2={getY(data[0])} className="stroke-white/20" strokeWidth="1" strokeDasharray="4" />
        <text x="5" y={getY(data[0]) - 5} className="fill-white/30 text-[10px] font-black uppercase tracking-tighter">Açılış: {data[0].toLocaleString()}</text>
      </g>
      
      <g>
        <line x1="0" y1={getY(data[data.length-1])} x2={width} y2={getY(data[data.length-1])} className="stroke-cyan-500/30" strokeWidth="1" strokeDasharray="4" />
        <text x={width - 5} y={getY(data[data.length-1]) - 5} className="fill-cyan-400/50 text-[10px] font-black uppercase tracking-tighter" textAnchor="end">Güncel: {data[data.length-1].toLocaleString()}</text>
      </g>

      {/* Main Path */}
      <motion.path
        d={`M ${points}`}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Gradient Area */}
      <path
        d={`M 0,${height} L ${points} L ${width},${height} Z`}
        fill={`url(#chart-grad-${color})`}
        className="opacity-20"
      />
      <defs>
        <linearGradient id={`chart-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
