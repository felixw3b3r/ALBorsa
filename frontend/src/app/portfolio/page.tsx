"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, PieChart, Activity, MoreVertical, Plus, Edit2, Check, X, Trash2, RefreshCw, Search } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';

const BIST100_STOCKS = [
  "AEFES", "AGHOL", "AHGAZ", "AKBNK", "AKCNS", "AKFGY", "AKSA", "AKSEN", "ALARK", "ALBRK", 
  "ALFAS", "ARCLK", "ASELS", "ASTOR", "AYGAZ", "BERA", "BIENY", "BIMAS", "BRSAN", "CANTE", 
  "CCOLA", "CIMSA", "CWENE", "DOAS", "DOHOL", "ECILC", "ECZYT", "EGEEN", "EKGYO", "ENJSA", 
  "ENKAI", "EREGL", "EUPWR", "EUREN", "FROTO", "GARAN", "GENIL", "GESAN", "GLYHO", "GUBRF", 
  "GWIND", "HALKB", "HEKTS", "HKTM", "HLGYO", "IMASM", "INVEO", "INVES", "IPEKE", "ISCTR", 
  "ISDMR", "ISFIN", "ISGYO", "ISMEN", "IZENR", "KCAER", "KCHOL", "KMPUR", "KONTR", "KONYA", 
  "KOZAA", "KOZAL", "KRDMD", "KZBGY", "MAVI", "MGROS", "MIATK", "ODAS", "OTKAR", "OYAKC", 
  "PENTA", "PETKM", "PGSUS", "PNLSN", "QUAGR", "SAHOL", "SASA", "SAYAS", "SISE", "SKBNK", 
  "SMRTG", "SOKM", "SUWEN", "TAVHL", "TCELL", "THYAO", "TKFEN", "TOASO", "TSKB", "TTKOM", 
  "TTRAK", "TUKAS", "TUPRS", "ULKER", "VAKBN", "VESBE", "VESTL", "YEOTK", "YKBNK", "YYLGD", "ZOREN"
].sort();

const NASDAQ500_STOCKS = [
  "A", "AAL", "AAP", "AAPL", "ABBV", "ABC", "ABT", "ACGL", "ACN", "ADAY", "ADBE", "ADI", "ADM", "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM", "ALB", "ALGN", "ALK", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP", "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH", "APTV", "ARE", "ATO", "ATRC", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP", "AYI", "AZO", "BA", "BAC", "BALL", "BAX", "BBWI", "BBY", "BDX", "BEN", "BF.B", "BG", "BIIB", "BIO", "BK", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BR", "BRK.B", "BRO", "BSX", "BWA", "BX", "BXP", "C", "CAG", "CAH", "CARR", "CAT", "CB", "CBOE", "CBRE", "CCI", "CCL", "CDNS", "CDW", "CE", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI", "CINF", "CL", "CLX", "CMA", "CMCSA", "CME", "CMG", "CMI", "CMS", "CNC", "CNP", "COF", "COO", "COP", "COR", "COST", "CPB", "CPRT", "CPT", "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS", "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR", "D", "DAL", "DAN", "DAY", "DD", "DE", "DECK", "DFS", "DG", "DGX", "DHI", "DHR", "DIS", "DLR", "DLTR", "DOC", "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA", "DVN", "DXCM", "EA", "EBAY", "ECL", "ED", "EFX", "EG", "EIX", "EL", "ELV", "EMN", "EMR", "ENPH", "EOG", "EPAM", "EQIX", "EQR", "EQT", "ES", "ESS", "ETN", "ETR", "ETSY", "EVRG", "EW", "EXC", "EXPD", "EXPE", "EXR", "F", "FANG", "FAST", "FI", "FICO", "FIS", "FITB", "FLT", "FMC", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV", "GD", "GE", "GEV", "GGG", "GILD", "GIS", "GL", "GLW", "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWRE", "GWW", "HAL", "HAS", "HBAN", "HCA", "HD", "HES", "HIG", "HII", "HLDX", "HOLX", "HON", "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM", "IBM", "ICE", "IDXX", "IEX", "IFF", "ILMN", "INCY", "INTC", "INTU", "INVH", "IP", "IPG", "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ", "J", "JBHT", "JBL", "JCI", "JKHY", "JNJ", "JNPR", "JPM", "K", "KDP", "KEY", "KEYS", "KHC", "KIM", "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "KVUE", "L", "LDOS", "LEN", "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNC", "LNT", "LOW", "LRCX", "LULU", "LUV", "LVS", "LW", "LYB", "LYV", "MA", "MAA", "MAR", "MAS", "MCD", "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MET", "META", "METC", "MGM", "MHK", "MKC", "MKTX", "MLM", "MMC", "MMM", "MNST", "MO", "MOH", "MOS", "MPC", "MPWR", "MRK", "MRNA", "MS", "MSCI", "MSFT", "MSI", "MTB", "MTCH", "MTD", "MU", "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC", "NOW", "NRG", "NSC", "NTAP", "NTR", "NTRS", "NUE", "NVDA", "NVR", "NWC", "NWL", "NWS", "NWSA", "NXPI", "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY", "PANW", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE", "PFG", "PG", "PGR", "PH", "PHM", "PKG", "PKI", "PLD", "PM", "PNC", "PNR", "PNW", "POOL", "PPG", "PPL", "PRU", "PSA", "PTC", "PWR", "PYPL", "QCOM", "QRVO", "RCL", "RE", "REG", "REGN", "RF", "RHI", "RJF", "RL", "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY", "SBAC", "SBUX", "SCHW", "SHW", "SIRI", "SITM", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO", "SPG", "SPGI", "SRE", "STE", "STLD", "STT", "STX", "STZ", "SWK", "SWKS", "SYK", "SYY", "T", "TAP", "TDG", "TDY", "TECH", "TEL", "TER", "TFT", "TFC", "TFX", "TGT", "TJX", "TMO", "TMUS", "TPR", "TRGP", "TRMB", "TROW", "TRV", "TSCO", "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT", "TYL", "UAL", "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB", "V", "VICI", "VLO", "VMC", "VRSK", "VRTX", "VTR", "VZ", "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC", "WFRD", "WHR", "WM", "WMB", "WMT", "WRB", "WST", "WTW", "WY", "WYNN", "XEL", "XOM", "XRAY", "XYL", "YUM", "ZBH", "ZBRA", "ZTS"
].sort();

export default function PortfolioPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [livePrices, setLivePrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredStock, setHoveredStock] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState("BIST 100");
  const [usdRate, setUsdRate] = useState<number>(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    setMounted(true);
    fetchPortfolio();
    fetchUsdRate();

    // 15 saniyede bir verileri tazele
    const interval = setInterval(() => {
      fetchPortfolio();
    }, 15000);

    return () => clearInterval(interval);
  }, []);


  const [newStock, setNewStock] = useState({ 
    name: "", 
    amount: 0, 
    cost: 0, 
    purchaseDate: new Date().toISOString().split('T')[0], 
    color: "#00f2ff" 
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const handleDeleteStock = async (name: string) => {
    if (!confirm(`${name || 'İsimsiz varlık'} silinsin mi?`)) return;
    try {
      const encodedName = name ? encodeURIComponent(name) : "undefined";
      const response = await fetch(`${API_URL}/portfolio/${encodedName}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        setEditingStock(null);
        await fetchPortfolio();
      } else {
        alert("Hisse silinemedi.");
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert("Silme işlemi sırasında bir hata oluştu.");
    }
  };

  const fetchLivePrices = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      const response = await fetch(`${API_URL}/stocks?symbols=${symbols.join(',')}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success && data.result) {
        setLivePrices(data.result);
      }
    } catch (error) {
      console.error('Live prices error:', error);
    }
  };

  const fetchUsdRate = async () => {
    try {
      const response = await fetch(`${API_URL}/exchange-rate`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success && data.result) {
        const usd = data.result.find((r: any) => r.code === "USD" || r.name === "Amerikan Doları");
        if (usd) {
          const rawSelling = usd.selling;
          const parsedRate = typeof rawSelling === 'string' 
            ? parseFloat(rawSelling.replace(',', '.')) 
            : rawSelling;
          setUsdRate(parsedRate || 0);
        }
      }
    } catch (error) {
      console.error('USD Rate error:', error);
    }
  };

  const fetchYahooPrices = async (symbols: string[]) => {
    // Bu fonksiyon artık gereksiz, fetchLivePrices kullanıyoruz
  };

  const fetchHistoricalPrice = async () => {
    const symbol = newStock.name || searchTerm;
    if (!symbol || !newStock.purchaseDate) {
      alert("Lütfen önce hisse seçin ve tarih belirleyin.");
      return;
    }
    
    try {
      setFetchingHistorical(true);
      const response = await fetch(`${API_URL}/historical?symbol=${symbol}&date=${newStock.purchaseDate}&market=${selectedMarket}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      
      if (data.success && data.price) {
        setNewStock({ ...newStock, cost: Number(data.price.toFixed(2)) });
      } else {
        alert(data.message || "O tarih için fiyat bulunamadı.");
      }
    } catch (error) {
      console.error("Historical fetch error:", error);
      alert("Fiyat çekilirken bir hata oluştu.");
    } finally {
      setFetchingHistorical(false);
    }
  };

  // Backend'den verileri çek
  // (Buradaki useEffect kaldırıldı çünkü yukarıdaki mount useEffect içinde hallediliyor)

  const fetchHistoricalPriceForEdit = async () => {
    if (!editingStock.name || !editingStock.purchaseDate) {
      alert("Lütfen tarih belirleyin.");
      return;
    }
    
    try {
      setFetchingHistorical(true);
      // Piyasayı belirle (NASDAQ listesindeyse ona göre gönder)
      const market = NASDAQ500_STOCKS.includes(editingStock.name) ? "NASDAQ 500" : "BIST 100";
      const response = await fetch(`${API_URL}/historical?symbol=${editingStock.name}&date=${editingStock.purchaseDate}&market=${market}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      
      if (data.success && data.price) {
        setEditingStock({ ...editingStock, cost: Number(data.price.toFixed(2)) });
      } else {
        alert(data.message || "O tarih için fiyat bulunamadı.");
      }
    } catch (error) {
      console.error("Historical fetch error:", error);
      alert("Fiyat çekilirken bir hata oluştu.");
    } finally {
      setFetchingHistorical(false);
    }
  };

  const [fetchingHistorical, setFetchingHistorical] = useState(false);

  const calculateDaysAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const purchase = new Date(dateStr);
    const today = new Date();
    const pDate = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate());
    const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffTime = Math.abs(tDate.getTime() - pDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 0 ? "Bugün" : `${diffDays} gün önce`;
  };

  const fetchPortfolio = async () => {
    try {
      const response = await fetch(`${API_URL}/portfolio`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      let data = [];
      if (response.ok) {
        data = await response.json();
        setPortfolio(Array.isArray(data) ? data : []);
      } else {
        setPortfolio([]);
      }
      
      if (data && data.length > 0) {
        const symbols = data.map((p: any) => {
          // BIST 100 listesindeyse sonuna .IS ekle (Yahoo için)
          if (BIST100_STOCKS.includes(p.name)) return `${p.name}.IS`;
          return p.name;
        });
        fetchLivePrices(symbols);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/portfolio`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editingStock),
      });
      if (response.ok) {
        await fetchPortfolio(); // Veriyi tekrar çek
        setEditingStock(null);
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handleCreateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = newStock.name || searchTerm;
    
    if (!finalName) {
      alert("Lütfen bir hisse seçin veya sembol girin.");
      return;
    }

    try {
      const stockColors: { [key: string]: string } = {
        "THYAO": "#ff4d4d", "ASELS": "#8b00e8", "EREGL": "#00f2ff", "SISE": "#33ff77",
        "GARAN": "#ffcc00", "AKBNK": "#ff66aa", "KCHOL": "#aa66ff", "SAHOL": "#66aaff"
      };
      const color = stockColors[finalName] || `hsl(${Math.random() * 360}, 70%, 60%)`;
      
      const response = await fetch(`${API_URL}/portfolio`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ...newStock, name: finalName, color }),
      });
      if (response.ok) {
        await fetchPortfolio();
        setIsAdding(false);
        setIsManual(false);
        setSearchTerm(""); // Arama kutusunu temizle
        setNewStock({ name: "", amount: 0, cost: 0, purchaseDate: new Date().toISOString().split('T')[0], color: "#00f2ff" });
      } else {
        const errorData = await response.json();
        alert(errorData.message || "Hisse eklenirken bir hata oluştu.");
      }
    } catch (error) {
      console.error('Add error:', error);
      alert("Sunucuya bağlanırken bir hata oluştu.");
    }
  };

  // Her hisse ismine özel sabit bir renk üret
  const getStockColor = (name: string, index: number) => {
    const colors = ["#8b00e8", "#00f2ff", "#ff4d4d", "#33ff77", "#ffcc00", "#ff66aa", "#aa66ff", "#66aaff"];
    return colors[index % colors.length];
  };

  // Verileri güncel değerlerle (Adet * Maliyet) hazırla
  const processedData = portfolio.map((item, index) => {
    // Canlı fiyatı bul
    const liveStock = livePrices.find(s => {
      const search = (item.name || "").toString().trim().toUpperCase();
      const code = (s.code || "").toString().trim().toUpperCase();
      // BIST hisselerinde backend'den .IS takısı gelebilir, her iki duruma da bak
      return code === search || code === `${search}.IS`;
    });
    
    const isUsdStock = item.name && !item.name.toUpperCase().endsWith('.IS') && !BIST100_STOCKS.includes(item.name.toUpperCase());
    const isCostInUSD = isUsdStock && item.cost < 1500;
    const itemCostTL = isCostInUSD ? item.cost * usdRate : item.cost;

    let currentPrice = itemCostTL;
    
    if (liveStock) {
      let price = liveStock.price;
      // Eğer hisse dolar bazlıysa (NASDAQ vb.), güncel kurla TL'ye çevir
      if (liveStock.currency === "USD" && usdRate > 0) {
        price = price * usdRate;
      }
      currentPrice = price;
    }

    const costValue = (item.amount || 0) * itemCostTL;
    const currentValue = (item.amount || 0) * currentPrice;
    const plValue = currentValue - costValue;
    
    return {
      ...item,
      cost: itemCostTL,
      color: item.color && item.color !== "#00f2ff" ? item.color : getStockColor(item.name, index),
      value: currentValue,
      costValue,
      currentPrice,
      plValue,
      plPercentage: itemCostTL > 0 ? ((currentPrice - itemCostTL) / itemCostTL) * 100 : 0,
      dailyRate: liveStock ? liveStock.rate : 0,
      updatedAt: liveStock ? liveStock.updatedAt : null
    };
  });

  const totalValue = processedData.reduce((acc, curr) => acc + curr.value, 0);
  const totalCost = processedData.reduce((acc, curr) => acc + curr.costValue, 0);
  const totalPL = totalValue - totalCost;
  
  // Ağırlıklı günlük değişim hesaplama
  const totalDailyChangePercent = processedData.reduce((acc, curr) => {
    const weight = curr.value / (totalValue || 1);
    return acc + (curr.dailyRate * weight);
  }, 0);
  
  // Toplam günlük TL bazlı değişim
  const totalDailyChangeTL = processedData.reduce((acc, curr) => {
    return acc + (curr.value * (curr.dailyRate / 100));
  }, 0);
  
  const processedWithPercentage = processedData.map(item => ({
    ...item,
    percentage: totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0
  })).sort((a, b) => b.value - a.value);

  const maxStock = processedWithPercentage.length > 0 
    ? processedWithPercentage.reduce((prev, current) => (prev.percentage > current.percentage) ? prev : current)
    : { name: "Hisse Yok", percentage: 0, color: "#8b00e8" };

  const displayStock = hoveredStock 
    ? processedWithPercentage.find(s => s.name === hoveredStock) 
    : maxStock;

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-neon-purple/30">
      <Navbar />
      
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-purple/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto pt-32 px-6 pb-20">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">PORTFÖYÜM</h1>
            <p className="text-gray-400 font-medium">Yapay zeka destekli varlık yönetimi ve analiz.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex items-center gap-6 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
              <div className="p-4 bg-neon-purple/20 rounded-xl">
                <Wallet className="text-neon-purple w-8 h-8" />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Toplam Bakiye</p>
                <h2 className="text-3xl font-black text-white">₺{(totalValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h2>
                <p className="text-sm font-bold text-neon-purple mt-1">
                  ${usdRate > 0 ? (totalValue / usdRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </p>
              </div>
            </div>
            <button 
              onClick={async () => {
                setLoading(true);
                await fetchPortfolio(); 
                await fetchUsdRate();
                setLoading(false);
              }}
              className="bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-2xl transition-all h-full"
            >
              <RefreshCw className={`w-8 h-8 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Top Summary & Chart Area (Sketch-based) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          
          {/* Left: Stats List */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex flex-col justify-center gap-8 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <div className="group transition-transform hover:translate-x-2">
              <p className="text-sm text-neon-purple font-bold uppercase tracking-wider mb-2">
                {totalPL >= 0 ? 'Toplam Kar' : 'Toplam Zarar'}
              </p>
              <div className="flex items-center gap-3">
                <span className={`text-4xl font-black tracking-tighter ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPL >= 0 ? '+' : ''}₺{(totalPL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                {totalPL >= 0 ? <TrendingUp className="text-green-400 w-6 h-6" /> : <TrendingDown className="text-red-400 w-6 h-6" />}
              </div>
              <p className={`text-sm font-bold mt-1 ${totalPL >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                %{((totalPL / (totalCost || 1)) * 100).toFixed(2)} Toplam Getiri
              </p>
            </div>
            <div className="h-px bg-white/5 w-full" />
            
            <div className="group transition-transform hover:translate-x-2">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">
                {totalDailyChangeTL >= 0 ? 'Günlük Kar' : 'Günlük Zarar'}
              </p>
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-black tracking-tighter ${totalDailyChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalDailyChangePercent >= 0 ? '+' : '-'}₺{Math.abs(totalDailyChangeTL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {totalDailyChangePercent >= 0 ? <TrendingUp className="text-green-400 w-6 h-6" /> : <TrendingDown className="text-red-400 w-6 h-6" />}
              </div>
              <p className={`text-sm font-bold mt-1 ${totalDailyChangePercent >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                %{Math.abs(totalDailyChangePercent).toFixed(2)} Değişim (Bugün)
              </p>
            </div>

            <div className="h-px bg-white/5 w-full" />

            <div className="opacity-40 select-none">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">
                  {totalPL >= 0 ? 'Haftalık Kar' : 'Haftalık Zarar'}
                </p>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400 font-black uppercase tracking-tighter">Yakında</span>
              </div>
              <div className="flex items-center gap-3 grayscale">
                <span className="text-3xl font-black tracking-tighter text-gray-500">₺0,00</span>
                <TrendingUp className="text-gray-600 w-6 h-6" />
              </div>
              <p className="text-xs font-bold mt-1 text-gray-600">Veri analizi hazırlanıyor...</p>
            </div>

            <div className="opacity-40 select-none">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">
                  {totalPL >= 0 ? 'Aylık Kar' : 'Aylık Zarar'}
                </p>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400 font-black uppercase tracking-tighter">Yakında</span>
              </div>
              <div className="flex items-center gap-3 grayscale">
                <span className="text-3xl font-black tracking-tighter text-gray-500">₺0,00</span>
                <TrendingUp className="text-gray-600 w-6 h-6" />
              </div>
              <p className="text-xs font-bold mt-1 text-gray-600">Yapay zeka tahmini bekliyor...</p>
            </div>
          </div>

          {/* Middle: Legend List */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex flex-col justify-center gap-6 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <h3 className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Activity size={14} className="text-neon-purple" /> Varlık Dağılımı
            </h3>
            {processedWithPercentage.map((stock, i) => (
              <motion.div 
                key={i}
                animate={{ 
                  scale: hoveredStock === stock.name ? 1.05 : 1,
                  backgroundColor: hoveredStock === stock.name ? `${stock.color}15` : 'rgba(255,255,255,0.05)',
                  borderColor: hoveredStock === stock.name ? stock.color : 'rgba(255,255,255,0.05)'
                }}
                onMouseEnter={() => setHoveredStock(stock.name)}
                onMouseLeave={() => setHoveredStock(null)}
                className="flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer shadow-lg"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ 
                      backgroundColor: stock.color, 
                      boxShadow: `0 0 10px ${stock.color}` 
                    }} 
                  />
                  <span className="font-bold text-lg">{stock.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-bold">₺{stock.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">%{stock.percentage} Ağırlık</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right: Pie Chart (The Star) */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl flex items-center justify-center relative overflow-hidden group shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-neon-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative w-64 h-64 md:w-80 md:h-80">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {processedWithPercentage.map((stock, i) => {
                  const prevPercentages = processedWithPercentage.slice(0, i).reduce((acc, curr) => acc + curr.percentage, 0);
                  const startAngle = (prevPercentages / 100) * 360;
                  const endAngle = ((prevPercentages + stock.percentage) / 100) * 360;
                  
                  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
                    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
                    return {
                      x: cx + (r * Math.cos(angleInRadians)),
                      y: cy + (r * Math.sin(angleInRadians))
                    };
                  };

                  const r_outer = 48;
                  const r_inner = 32;
                  
                  // Add a small gap between segments by adjusting angles
                  const gap = 1; 
                  const adjustedStart = startAngle + gap;
                  const adjustedEnd = endAngle - gap;

                  const start_o = polarToCartesian(50, 50, r_outer, adjustedEnd);
                  const end_o = polarToCartesian(50, 50, r_outer, adjustedStart);
                  const start_i = polarToCartesian(50, 50, r_inner, adjustedEnd);
                  const end_i = polarToCartesian(50, 50, r_inner, adjustedStart);

                  const largeArcFlag = (stock.percentage - (gap*2/360*100)) > 50 ? "1" : "0";
                  
                  const d = [
                    "M", start_o.x, start_o.y,
                    "A", r_outer, r_outer, 0, largeArcFlag, 0, end_o.x, end_o.y,
                    "L", end_i.x, end_i.y,
                    "A", r_inner, r_inner, 0, largeArcFlag, 1, start_i.x, start_i.y,
                    "Z"
                  ].join(" ");
                  
                  const textAngle = startAngle + (stock.percentage / 2);
                  const textPos = polarToCartesian(50, 50, 40, textAngle);

                  return (
                    <g 
                      key={i}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredStock(stock.name)}
                      onMouseLeave={() => setHoveredStock(null)}
                    >
                      <motion.path
                        d={d}
                        fill={stock.color}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ 
                          opacity: hoveredStock ? (hoveredStock === stock.name ? 1 : 0.3) : 0.8,
                          scale: hoveredStock === stock.name ? 1.05 : 1,
                        }}
                        whileHover={{ filter: 'brightness(1.2)' }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        style={{ 
                          filter: hoveredStock === stock.name ? `drop-shadow(0 0 15px ${stock.color})` : 'none',
                        }}
                      />
                      {stock.percentage > 8 && !hoveredStock && (
                        <text 
                          x={textPos.x} 
                          y={textPos.y} 
                          fill="white" 
                          fontSize="3.5" 
                          fontWeight="black" 
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="pointer-events-none transform rotate-90 origin-center opacity-80"
                        >
                          %{stock.percentage}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Center Info - Dynamic */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={displayStock?.name}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-[0.2em] mb-1">
                      {hoveredStock ? 'Varlık' : 'En Yüksek'}
                    </span>
                    <span className="text-3xl font-black text-white tracking-tighter" style={{ color: hoveredStock ? displayStock?.color : 'white', textShadow: hoveredStock ? `0 0 20px ${displayStock?.color}44` : 'none' }}>
                      {displayStock?.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: displayStock?.color }} />
                      <span className="text-sm font-bold text-gray-300">
                        %{displayStock?.percentage}
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <div className="mt-8 bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative z-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <Activity className="text-neon-purple w-6 h-6" />
              Aktif Varlıklar
              <span className="text-xs bg-white/10 px-2 py-1 rounded-md text-gray-400">
                {livePrices.length > 0 ? `${livePrices.length} Canlı Veri` : 'Bağlanıyor...'}
              </span>
            </h2>
            <div className="flex items-center gap-4">
              <button 
                onClick={async () => {
                  setLoading(true);
                  await fetchPortfolio();
                  await fetchUsdRate();
                  setLoading(false);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300 font-bold text-sm text-gray-300 hover:text-white"
              >
                <RefreshCw className="w-4 h-4" /> Güncelle
              </button>
              <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-neon-purple/20 hover:bg-neon-purple/40 border border-neon-purple/50 rounded-2xl transition-all duration-300 font-bold text-sm"
              >
                <Plus size={18} /> Yeni Hisse Ekle
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/5 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
                <tr>
                  <th className="px-8 py-4">Sembol</th>
                  <th className="px-8 py-4">Miktar (Lot)</th>
                  <th className="px-8 py-4">Ort. Maliyet</th>
                  <th className="px-8 py-4">Güncel Fiyat</th>
                  <th className="px-8 py-4 text-right">K/Z Durumu</th>
                  <th className="px-8 py-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {processedWithPercentage.map((stock, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-transform group-hover:scale-110"
                          style={{ 
                            backgroundColor: `${stock.color}20`, 
                            color: stock.color,
                            boxShadow: `0 0 15px ${stock.color}30` 
                          }}
                        >
                          {stock.name[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-lg leading-tight">{stock.name}</span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            {(() => {
                              const purchase = new Date(stock.purchaseDate || Date.now());
                              const today = new Date();
                              // Saat farklarını sıfırlayalım ki sadece gün bazlı net hesaplama yapsın
                              const pDate = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate());
                              const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                              
                              const diffTime = Math.abs(tDate.getTime() - pDate.getTime());
                              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                              
                              const dateStr = purchase.toLocaleDateString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              });

                              return `${diffDays === 0 ? 'Bugün alındı' : diffDays + ' gün önce alındı'} (${dateStr})`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-medium text-gray-300">{stock.amount} Lot</td>
                    <td className="px-8 py-6">
                      <div className="font-medium text-gray-300">₺{stock.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="text-[11px] text-gray-500 font-bold mt-1 tracking-wider uppercase">
                        Maliyet: ₺{(stock.cost * stock.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-bold text-white">₺{stock.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="text-[11px] text-neon-purple font-bold mt-1 tracking-wider uppercase opacity-80">
                        Değer: ₺{(stock.currentPrice * stock.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {stock.updatedAt && (
                        <div className="text-[10px] text-cyan-400/70 mt-1 font-bold tracking-tight">
                          <span className="opacity-50 font-medium">Son:</span> {(() => {
                            const date = new Date(stock.updatedAt);
                            const isBist = BIST100_STOCKS.includes(stock.name.toUpperCase()) || stock.name.endsWith('.IS');
                            if (isBist) {
                              date.setMinutes(date.getMinutes() - 15);
                              return `${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (15dk gecikmeli)`;
                            }
                            return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          })()}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className={`flex flex-col items-end`}>
                        <span className={`font-bold ${stock.plValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {stock.plValue >= 0 ? '+' : ''}₺{stock.plValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className={`text-xs font-bold ${stock.plValue >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                          %{stock.plPercentage.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button 
                        onClick={() => setEditingStock(stock)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Stock Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setIsAdding(false); setIsManual(false); }} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md shadow-[0_20px_50px_rgba(0,242,255,0.2)]">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <Plus className="text-cyan-400" /> Yeni Hisse Ekle
                </h2>
                <button onClick={() => { setIsAdding(false); setIsManual(false); }} className="text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
              </div>
              <form onSubmit={handleCreateStock} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Borsa Seçimi</label>
                  <select 
                    value={selectedMarket}
                    onChange={(e) => setSelectedMarket(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg appearance-none cursor-pointer"
                  >
                    <option value="BIST 100" className="bg-black">Bist 100</option>
                    <option value="NASDAQ 500" className="bg-black">Nasdaq 500</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {isManual ? 'Hisse Sembolü (Manuel)' : 'Hisse Seçimi (BIST 100)'}
                    </label>
                    <button 
                      type="button" 
                      onClick={() => setIsManual(!isManual)}
                      className="text-[10px] font-black text-cyan-400 hover:text-white transition-colors uppercase tracking-tighter"
                    >
                      {isManual ? '← Listeye Dön' : '+ Global / Manuel Giriş'}
                    </button>
                  </div>
                  
                  {isManual ? (
                    <input 
                      type="text"
                      value={newStock.name}
                      onChange={(e) => setNewStock({...newStock, name: e.target.value.toUpperCase()})}
                      placeholder="Örn: NVDA veya AAPL"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg"
                      autoFocus
                      required
                    />
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value.toUpperCase());
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Hisse ara (Örn: THYAO)..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg"
                        required
                      />
                      <AnimatePresence>
                        {showSuggestions && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-[110] left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl max-h-60 overflow-y-auto shadow-2xl backdrop-blur-xl"
                          >
                            {(selectedMarket === "BIST 100" ? BIST100_STOCKS : NASDAQ500_STOCKS)
                              .filter(s => s.includes(searchTerm))
                              .slice(0, 20) // Performans için ilk 20 sonuç
                              .map(symbol => (
                                <button
                                  key={symbol}
                                  type="button"
                                  onClick={() => {
                                    setNewStock({...newStock, name: symbol});
                                    setSearchTerm(symbol);
                                    setShowSuggestions(false);
                                  }}
                                  className="w-full text-left px-5 py-3 hover:bg-white/10 transition-colors font-bold flex justify-between items-center"
                                >
                                  <span>{symbol}</span>
                                  <span className="text-[10px] text-gray-500 uppercase">{selectedMarket}</span>
                                </button>
                              ))
                            }
                            {searchTerm && !(selectedMarket === "BIST 100" ? BIST100_STOCKS : NASDAQ500_STOCKS).some(s => s.includes(searchTerm)) && (
                              <div className="px-5 py-3 text-gray-500 text-sm italic">Sonuç bulunamadı.</div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Adet (Lot)</label>
                    <input type="number" value={newStock.amount} onChange={(e) => setNewStock({...newStock, amount: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg" required />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Maliyet (TL)</label>
                      <button 
                        type="button"
                        onClick={fetchHistoricalPrice}
                        disabled={fetchingHistorical}
                        className="text-[10px] font-black text-cyan-400 hover:text-white transition-colors uppercase tracking-tighter flex items-center gap-1"
                      >
                        {fetchingHistorical ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Search className="w-3 h-3" />
                        )}
                        {fetchingHistorical ? 'Çekiliyor...' : 'Fiyatı Getir'}
                      </button>
                    </div>
                    <input type="number" step="any" value={newStock.cost} onChange={(e) => setNewStock({...newStock, cost: parseFloat(e.target.value) || 0})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg" required />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Alım Tarihi</label>
                    <span className="text-[10px] font-bold text-cyan-400 uppercase">{calculateDaysAgo(newStock.purchaseDate)}</span>
                  </div>
                  <input 
                    type="date" 
                    value={newStock.purchaseDate}
                    onChange={(e) => setNewStock({...newStock, purchaseDate: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-cyan-400 transition-colors font-bold text-lg color-scheme-dark" 
                  />
                </div>
                <button type="submit" className="w-full bg-cyan-500 text-black py-4 rounded-2xl font-black text-lg hover:bg-cyan-400 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,242,255,0.3)]">
                  <Check size={20} /> Portföye Ekle
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal (Updated with Date) */}
      <AnimatePresence>
        {editingStock && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingStock(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md shadow-[0_20px_50px_rgba(139,0,232,0.3)]">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3"><Edit2 className="text-neon-purple" /> {editingStock.name} Düzenle</h2>
                <button onClick={() => setEditingStock(null)} className="text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
              </div>
              <form onSubmit={handleUpdateStock} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Adet (Lot)</label>
                    <input type="number" value={editingStock.amount} onChange={(e) => setEditingStock({...editingStock, amount: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-neon-purple transition-colors font-bold text-lg" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Maliyet (TL)</label>
                      <button 
                        type="button"
                        onClick={fetchHistoricalPriceForEdit}
                        disabled={fetchingHistorical}
                        className="text-[10px] font-black text-neon-purple hover:text-white transition-colors uppercase tracking-tighter flex items-center gap-1"
                      >
                        {fetchingHistorical ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Search className="w-3 h-3" />
                        )}
                        {fetchingHistorical ? 'Çekiliyor...' : 'Fiyatı Getir'}
                      </button>
                    </div>
                    <input type="number" step="any" value={editingStock.cost} onChange={(e) => setEditingStock({...editingStock, cost: parseFloat(e.target.value) || 0})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-neon-purple transition-colors font-bold text-lg" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Alım Tarihi</label>
                    <span className="text-[10px] font-bold text-neon-purple uppercase">{calculateDaysAgo(editingStock.purchaseDate)}</span>
                  </div>
                  <input 
                    type="date" 
                    value={editingStock.purchaseDate ? editingStock.purchaseDate.split('T')[0] : ""}
                    onChange={(e) => setEditingStock({...editingStock, purchaseDate: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-neon-purple transition-colors font-bold text-lg color-scheme-dark" 
                  />
                </div>
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => handleDeleteStock(editingStock.name)}
                    className="flex-1 bg-red-500/10 text-red-500 py-4 rounded-2xl font-bold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 border border-red-500/20"
                  >
                    <Trash2 size={20} /> Sil
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-neon-purple text-white py-4 rounded-2xl font-black text-lg hover:bg-neon-purple-hover transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(139,0,232,0.4)]"
                  >
                    <Check size={20} /> Kaydet
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
