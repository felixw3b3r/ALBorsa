"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, BarChart3, ShieldAlert, Search, X, Wallet } from 'lucide-react';
import Navbar from '@/components/Navbar';
import PortfolioWarmNav from '@/components/PortfolioWarmNav';
import TurnusolCompare from './TurnusolCompare';
import styles from '../portfolio/portfolio-warm.module.css';
import warmStyles from './real-getiri-warm.module.css';
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
  "A", "AAL", "AAP", "AAPL", "ABBV", "ABC", "ABT", "ACGL", "ACN", "ADAY", "ADBE", "ADI", "ADM", "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM", "ALB", "ALGN", "ALK", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP", "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH", "APTV", "ARE", "ATO", "ATRC", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP", "AYI", "AZO", "BA", "BAC", "BALL", "BAX", "BBWI", "BBY", "BDX", "BEN", "BF.B", "BG", "BIIB", "BIO", "BK", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BR", "BRK.B", "BRO", "BSX", "BWA", "BX", "BXP", "C", "CAG", "CAH", "CARR", "CAT", "CB", "CBOE", "CBRE", "CCI", "CCL", "CDNS", "CDW", "CE", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI", "CINF", "CL", "CLX", "CMA", "CMCSA", "CME", "CMG", "CMI", "CMS", "CNC", "CNP", "COF", "COO", "COP", "COR", "COST", "CPB", "CPRT", "CPT", "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS", "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR", "D", "DAL", "DAN", "DAY", "DD", "DE", "DECK", "DFS", "DG", "DGX", "DHI", "DHR", "DIS", "DLR", "DLTR", "DOC", "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA", "DVN", "DXCM", "EA", "EBAY", "ECL", "ED", "EFX", "EG", "EIX", "EL", "ELV", "EMN", "EMR", "ENPH", "EOG", "EPAM", "EQIX", "EQR", "EQT", "ES", "ESS", "ETN", "ETR", "ETSY", "EVRG", "EW", "EXC", "EXPD", "EXPE", "EXR", "F", "FANG", "FAST", "FI", "FICO", "FIS", "FITB", "FLT", "FMC", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV", "GD", "GE", "GEV", "GGG", "GILD", "GIS", "GL", "GLW", "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWRE", "GWW", "HAL", "HAS", "HBAN", "HCA", "HD", "HES", "HIG", "HII", "HLDX", "HOLX", "HON", "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM", "IBM", "ICE", "IDXX", "IEX", "IFF", "ILMN", "INCY", "INTC", "INTU", "INVH", "IP", "IPG", "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ", "J", "JBHT", "JBL", "JCI", "JKHY", "JNJ", "JNPR", "JPM", "K", "KDP", "KEY", "KEYS", "KHC", "KIM", "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "KVUE", "L", "LDOS", "LEN", "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNC", "LNT", "LOW", "LRCX", "LULU", "LUV", "LVS", "LW", "LYB", "LYV", "MA", "MAA", "MAR", "MAS", "MCD", "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MET", "META", "METC", "MGM", "MHK", "MKC", "MKTX", "MLM", "MMC", "MMM", "MNST", "MO", "MOH", "MOS", "MPC", "MPWR", "MRK", "MRK", "MS", "MSCI", "MSFT", "MSI", "MTB", "MTCH", "MTD", "MU", "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC", "NOW", "NRG", "NSC", "NTAP", "NTR", "NTRS", "NUE", "NVDA", "NVR", "NWC", "NWL", "NWS", "NWSA", "NXPI", "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY", "PANW", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE", "PFG", "PG", "PGR", "PH", "PHM", "PKG", "PKI", "PLD", "PM", "PNC", "PNR", "PNW", "POOL", "PPG", "PPL", "PRU", "PSA", "PTC", "PWR", "PYPL", "QCOM", "QRVO", "RCL", "RE", "REG", "REGN", "RF", "RHI", "RJF", "RL", "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY", "SBAC", "SBUX", "SCHW", "SHW", "SIRI", "SITM", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO", "SPG", "SPGI", "SRE", "STE", "STLD", "STT", "STX", "STZ", "SWK", "SWKS", "SYK", "SYY", "T", "TAP", "TDG", "TDY", "TECH", "TEL", "TER", "TFT", "TFC", "TFX", "TGT", "TJX", "TMO", "TMUS", "TPR", "TRGP", "TRMB", "TROW", "TRV", "TSCO", "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT", "TYL", "UAL", "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB", "V", "VICI", "VLO", "VMC", "VRSK", "VRTX", "VTR", "VZ", "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC", "WFRD", "WHR", "WM", "WMB", "WMT", "WRB", "WST", "WTW", "WY", "WYNN", "XEL", "XOM", "XRAY", "XYL", "YUM", "ZBH", "ZBRA", "ZTS", "SKHYV", "SPCX"
];

const getBenchmarkLabel = (ticker: string) => {
  if (ticker === "USDTRY=X") return "DOLAR";
  if (ticker === "EURTRY=X") return "EURO";
  if (ticker === "GC=F") return "ALTIN";
  if (ticker === "BTC-USD") return "BTC";
  return ticker;
};

const isUsdPricedBenchmark = (ticker: string, currency: string) => {
  const normalized = ticker.toUpperCase();
  if (normalized.endsWith("TRY=X")) return false;
  return currency === "USD" || normalized.includes("-USD") || NASDAQ500_STOCKS.includes(normalized) || normalized === "GC=F";
};

export default function RealGetiriPage() {
  const [warmTheme, setWarmTheme] = useState(false);
  const [turnusolOpen, setTurnusolOpen] = useState(false);
  useEffect(() => { setWarmTheme(localStorage.getItem('alborsa-landing-theme') === 'warm'); }, []);
  const changeTheme = (warm: boolean) => { localStorage.setItem('alborsa-landing-theme', warm ? 'warm' : 'dark'); setWarmTheme(warm); };
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [livePrices, setLivePrices] = useState<any[]>([]);
  const [usdRate, setUsdRate] = useState<number>(0);
  const [eurRate, setEurRate] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadedTicker, setLoadedTicker] = useState<string | null>(null);
  const requestId = useRef(0);
  const [historicalRates, setHistoricalRates] = useState<{[key: string]: {usd: number, eur: number}}>({});

  const [benchmarkTicker, setBenchmarkTicker] = useState<string>("USDTRY=X");
  const [benchmarkHistoricalPrices, setBenchmarkHistoricalPrices] = useState<{[key: string]: number}>({});
  const [benchmarkCurrentPrice, setBenchmarkCurrentPrice] = useState<number>(0);
  const [benchmarkCurrency, setBenchmarkCurrency] = useState<string>("TRY");

  const [isSearchingBenchmark, setIsSearchingBenchmark] = useState(false);
  const [benchmarkSearchTerm, setBenchmarkSearchTerm] = useState("");
  const [benchmarkMarket, setBenchmarkMarket] = useState("BIST 100");
  const [showBenchmarkSuggestions, setShowBenchmarkSuggestions] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

  const handleUpdate = async (targetAsset?: string) => {
    const currentRequest = ++requestId.current;
    try {
      setLoading(true);
      setLoadError(false);
      const activeTicker = targetAsset || benchmarkTicker;

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      // Keep the rate request running while portfolio-dependent requests start.
      const rateRequest = fetch(`${API_URL}/exchange-rate`, { headers: { ...headers, 'X-Bypass-API-Cache': '1' } })
        .then(async response => response.ok ? await response.json() : null)
        .catch(() => null);
      const portRes = await fetch(`${API_URL}/portfolio`, { headers });
      if (!portRes.ok) throw new Error('Portföy verisi alınamadı');
      const portData = await portRes.json();
      if (!Array.isArray(portData)) throw new Error('Portföy verisi geçersiz');
      // setPortfolio(portData); // Kısmi veriyle geçici getiri hesaplanmasın.
      let nextUsdRate = 0;
      let nextEurRate = 0;
      let nextBenchmarkPrice = 0;
      let nextBenchmarkCurrency = 'TRY';
      let nextLivePrices: any[] = [];
      const histRates: any = {};
      const benchHist: any = {};

      const searchTicker = BIST100_STOCKS.includes(activeTicker) && !activeTicker.endsWith('.IS')
        ? `${activeTicker}.IS`
        : activeTicker;
      const portfolioSymbols = portData.map((p: any) => {
        const sym = p.name.toUpperCase();
        if (!NASDAQ500_STOCKS.includes(sym) && !sym.includes('.') && sym.length <= 5 && !['BTC', 'ETH', 'USDT'].includes(sym)) {
          return `${sym}.IS`;
        }
        return sym;
      });
      const symbols = [...new Set([searchTicker, ...portfolioSymbols])].join(',');
      const historicalRequests = new Map<string, Promise<any>>();
      const getHistorical = (symbol: string, date: string, market: string) => {
        const params = new URLSearchParams({ symbol, date, market });
        const key = params.toString();
        let request = historicalRequests.get(key);
        if (!request) {
          request = fetch(`${API_URL}/historical?${key}`, { headers }).then(r => r.json());
          historicalRequests.set(key, request);
        }
        return request;
      };
      const dates = [...new Set<string>(portData
        .filter((item: any) => item.purchaseDate)
        .map((item: any) => item.purchaseDate.split('T')[0]))];
      const benchmarkMarket = BIST100_STOCKS.includes(activeTicker) ? 'BIST 100' : 'GLOBAL';

      // Güncel fiyatlar ve tekil tarihler için geçmiş veriler aynı anda yüklenir.
      const [stockData, dateResults, rateData] = await Promise.all([
        fetch(`${API_URL}/stocks?symbols=${encodeURIComponent(symbols)}`, { headers }).then(r => r.json()),
        Promise.all(dates.map(async date => {
          const [usd, eur, benchmark] = await Promise.all([
            getHistorical('USDTRY=X', date, 'GLOBAL'),
            getHistorical('EURTRY=X', date, 'GLOBAL'),
            getHistorical(activeTicker, date, benchmarkMarket)
          ]);
          return { date, usd, eur, benchmark };
        })),
        rateRequest
      ]);
      if (!rateData?.success || !Array.isArray(rateData.result)) throw new Error('Kur verisi alınamadı');
      const usd = rateData.result.find((r: any) => r.code === 'USD' || r.name?.includes('Dolar'));
      const eur = rateData.result.find((r: any) => r.code === 'EUR');
      if (usd) nextUsdRate = typeof usd.selling === 'string' ? parseFloat(usd.selling.replace(',', '.')) : usd.selling;
      if (eur) nextEurRate = typeof eur.selling === 'string' ? parseFloat(eur.selling.replace(',', '.')) : eur.selling;
      if (!(nextUsdRate > 0) || !(nextEurRate > 0)) throw new Error('Güncel döviz kurları alınamadı');
      if (!stockData.success || !Array.isArray(stockData.result)) throw new Error('Güncel portföy fiyatları alınamadı');
      nextLivePrices = stockData.result;
      const match = nextLivePrices.find((r: any) =>
        r.code?.toUpperCase() === searchTicker.toUpperCase() || r.code?.toUpperCase() === activeTicker.toUpperCase()
      );
      if (match) {
        nextBenchmarkPrice = match.price || match.regularMarketPrice;
        nextBenchmarkCurrency = BIST100_STOCKS.includes(activeTicker) ? 'TRY' : (match.currency || 'TRY');
      }
      const missingPrice = portData.some((item: any) => {
        const name = String(item.name || '').trim().toUpperCase();
        const stock = nextLivePrices.find((s: any) => {
          const code = String(s.code || '').trim().toUpperCase();
          return code === name || code === `${name}.IS` || name === `${code}.IS`;
        });
        return !stock || !(Number(stock.regularMarketPrice || stock.price) > 0);
      });
      if (missingPrice) throw new Error('Bazı portföy fiyatları alınamadı');

      const ratesByDate = new Map<string, { usd: number, eur: number }>();
      for (const { date, usd, eur, benchmark } of dateResults) {
        ratesByDate.set(date, {
          usd: usd.success ? usd.price : nextUsdRate,
          eur: eur.success ? eur.price : nextEurRate
        });
        if (benchmark.success) {
          const usesRawUsdPrice = isUsdPricedBenchmark(activeTicker, benchmark.currency || '');
          benchHist[date] = usesRawUsdPrice && benchmark.rawPrice != null ? benchmark.rawPrice : benchmark.price;
        }
      }
      for (const item of portData) {
        const date = item.purchaseDate?.split('T')[0];
        if (date && ratesByDate.has(date)) histRates[item._id] = ratesByDate.get(date);
      }
      if (currentRequest !== requestId.current) return;
      setPortfolio(portData);
      setUsdRate(nextUsdRate);
      setEurRate(nextEurRate);
      setLivePrices(nextLivePrices);
      setHistoricalRates(histRates);
      setBenchmarkHistoricalPrices(benchHist);
      setBenchmarkCurrentPrice(nextBenchmarkPrice);
      setBenchmarkCurrency(nextBenchmarkCurrency);
      setLoadedTicker(activeTicker);
    } catch (error) {
      console.error('Update error:', error);
      if (currentRequest === requestId.current) setLoadError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    setMounted(true);
    handleUpdate(benchmarkTicker);
  }, []);

  useEffect(() => {
    if (mounted) {
      handleUpdate(benchmarkTicker);
    }
  }, [benchmarkTicker]);

  const benchmarkLabel = getBenchmarkLabel(benchmarkTicker);
  const benchmarkIsUsdPriced = isUsdPricedBenchmark(benchmarkTicker, benchmarkCurrency);
  const benchmarkPricePrefix = benchmarkIsUsdPriced ? "$" : "₺";

  const processedData = portfolio.map(item => {
    const itemName = (item.name || "").toString().trim().toUpperCase();
    const liveStock = livePrices.find(s => {
      const sCode = (s.code || "").toString().trim().toUpperCase();
      return sCode === itemName || sCode === `${itemName}.IS` || itemName === `${sCode}.IS`;
    });

    const amount = Number(item.amount || 0);
    const hist = historicalRates[item._id];
    const histUSD = hist?.usd || usdRate || 1;
    const histEUR = hist?.eur || eurRate || 1;
    const currentUSDRate = usdRate || histUSD || 1;

    const purchaseDateStr = item.purchaseDate?.split('T')[0];
    const benchHistPrice = Number(benchmarkHistoricalPrices[purchaseDateStr] || 0);
    const currentBenchmarkPrice = Number(benchmarkCurrentPrice || 0);

    const benchNorm = benchmarkTicker.toUpperCase().replace('.IS', '');
    const itemNorm = itemName.replace('.IS', '');
    const isSameStock = benchNorm === itemNorm;
    const liveCurrency = liveStock?.currency;
    const isNasdaqStock = Boolean(itemName) && (
      liveCurrency === "USD" ||
      itemName.includes("-USD") ||
      itemName === "GC=F" ||
      NASDAQ500_STOCKS.includes(itemName)
    );

    let cost = Number(item.cost || 0);
    let currentPrice = liveStock ? Number(liveStock.regularMarketPrice || liveStock.price || 0) : cost;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) currentPrice = cost;

    if (isNasdaqStock && cost > 0 && currentPrice > 0 && usdRate > 0) {
      const ratio = cost / currentPrice;
      if (ratio > 15 && ratio < 70) {
        cost = cost / usdRate;
      }
    }

    const costValue = amount * cost;
    const currentValue = amount * currentPrice;
    const costTL = isNasdaqStock ? costValue * histUSD : costValue;
    const currentValueTL = isNasdaqStock ? currentValue * currentUSDRate : currentValue;
    const profitLoss = currentValue - costValue;
    const profitLossPercent = costValue > 0 ? (profitLoss / costValue) * 100 : 0;

    let benchValueTL = costTL;
    const hasBenchmarkData = isSameStock || (benchHistPrice > 0 && currentBenchmarkPrice > 0);

    if (isSameStock) {
      benchValueTL = currentValueTL;
    } else if (hasBenchmarkData) {
      if (benchmarkIsUsdPriced) {
        const units = (costTL / histUSD) / benchHistPrice;
        benchValueTL = units * currentBenchmarkPrice * currentUSDRate;
      } else {
        const units = costTL / benchHistPrice;
        benchValueTL = units * currentBenchmarkPrice;
      }
    }

    const benchValue = isNasdaqStock ? benchValueTL / currentUSDRate : benchValueTL;
    const benchCostBase = isNasdaqStock ? costValue : costTL;
    const benchGain = benchValue - benchCostBase;
    const benchGainPercent = benchCostBase > 0 ? (benchGain / benchCostBase) * 100 : 0;
    const benchGainTL = benchValueTL - costTL;

    return {
      ...item,
      isNasdaqStock,
      cost,
      currentValue,
      costTL,
      currentValueTL,
      profitLoss,
      profitLossPercent,
      benchValue,
      benchGain,
      benchGainPercent,
      benchValueTL,
      benchGainTL,
      benchHistPrice,
      hasBenchmarkData,
      costUSDAtPurchase: costTL / histUSD,
      costEURAtPurchase: costTL / histEUR,
      benchmarkAssetName: benchmarkLabel
    };
  }).sort((a, b) => b.currentValueTL - a.currentValueTL);

  const totalCostTL = processedData.reduce((acc, item) => acc + (item.costTL || 0), 0);
  const totalCurrentValueTL = processedData.reduce((acc, item) => acc + (item.currentValueTL || 0), 0);
  const totalBenchmarkValue = processedData.reduce((acc, item) => acc + (item.benchValueTL || 0), 0);

  // REAL USD/EUR MALİYET HESABI: Her bir alımın kendi tarihindeki kuruna göre toplam maliyeti bul
  const totalCostUSD = processedData.reduce((acc, item) => acc + (item.costUSDAtPurchase || 0), 0);
  const totalCostEUR = processedData.reduce((acc, item) => acc + (item.costEURAtPurchase || 0), 0);

  const totalValueUSD = totalCurrentValueTL / (usdRate || 1);
  const totalValueEUR = totalCurrentValueTL / (eurRate || 1);

  const totalPLPercentUSD = totalCostUSD > 0 ? (((totalValueUSD - totalCostUSD) / totalCostUSD) * 100) : 0;
  const totalPLPercentEUR = totalCostEUR > 0 ? (((totalValueEUR - totalCostEUR) / totalCostEUR) * 100) : 0;

  const totalBenchmarkPL = totalBenchmarkValue - totalCostTL;
  const totalBenchmarkPLPercent = totalCostTL > 0 ? (totalBenchmarkPL / totalCostTL) * 100 : 0;

  const totalPLTL = totalCurrentValueTL - totalCostTL;
  const totalPLPercentTL = totalCostTL > 0 ? (totalPLTL / totalCostTL) * 100 : 0;

  if (!mounted) return null;

  return (
    <main className={`min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30 ${warmTheme ? `${styles.warm} ${warmStyles.realWarm}` : ''}`}>
      {warmTheme ? <PortfolioWarmNav tucked={turnusolOpen} onDark={() => changeTheme(false)} /> : <><Navbar /><button type="button" onClick={() => changeTheme(true)} className={styles.themeButton}>◐ Sıcak tema</button></>}

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto pt-24 md:pt-32 px-4 md:px-6 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-400 to-blue-500 uppercase">TURNUSOL KAĞIDI</h1>
            <p className="text-gray-400 text-sm font-medium">Varlıklarınızın enflasyon ve döviz karşısındaki gerçek gücü.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setIsSearchingBenchmark(true)}
              className="group flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-3 rounded-2xl transition-all"
            >
              <BarChart3 className="text-cyan-400 w-5 h-5" />
              <div className="text-left">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Kıyaslama Varlığı</p>
                <p className="text-sm font-black text-white uppercase">{benchmarkLabel}</p>
              </div>
            </button>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl flex items-center gap-4">
              <div className="p-3 bg-cyan-500/20 rounded-xl"><DollarSign className="text-cyan-400 w-5 h-5" /></div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest leading-none mb-1">USD/TRY</p>        
                <h2 className="text-lg font-black text-white">{loading || loadError || loadedTicker !== benchmarkTicker ? '—' : `₺${usdRate.toFixed(2)}`}</h2>
              </div>
            </div>

            <button onClick={() => handleUpdate(benchmarkTicker)} className="bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-2xl transition-all">
              <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <TurnusolCompare warm={warmTheme} onOpenChange={setTurnusolOpen} />
        {loadError ? (
          <p role="alert" className="text-red-400 text-sm">Veriler alınamadı. Yenile düğmesiyle tekrar deneyin.</p>
        ) : loading || loadedTicker !== benchmarkTicker ? (
          <p role="status" className="text-gray-400 text-sm">Veriler hazırlanıyor...</p>
        ) : (<>
        {/* Real Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-yellow-500/20 rounded-2xl"><Wallet className="text-yellow-400 w-6 h-6" /></div>
              <span className="text-[10px] font-black bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-lg uppercase">Maliyet</span>
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Toplam Yatırım</p>
            <h3 className="text-3xl font-black">₺{(totalCostTL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
            <p className="text-xs text-gray-400 mt-2">Cebinizden çıkan toplam ana para.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl border-cyan-500/10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-500/20 rounded-2xl"><ShieldAlert className="text-blue-400 w-6 h-6" /></div>
              <span className="text-[10px] font-black bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg uppercase">USD Bazlı</span>
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Portföy Değeri</p>
            <h3 className="text-3xl font-black">${totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>     
            <p className="text-xs text-gray-400 mt-2">Mevcut kur üzerinden toplam değer.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-green-500/20 rounded-2xl"><TrendingUp className="text-green-400 w-6 h-6" /></div>
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">TL Nominal Getiri</p>
            <h3 className={`text-3xl font-black ${totalPLTL >= 0 ? 'text-green-400' : 'text-red-400'}`}>%{totalPLPercentTL.toFixed(2)}</h3>
            <p className="text-xs text-gray-400 mt-2">Net sonucun ana paraya oranı.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl border-cyan-500/30">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-cyan-500/20 rounded-xl"><Activity className="text-cyan-400 w-6 h-6" /></div>
              <span className="text-[10px] font-black bg-cyan-400 text-black px-2 py-1 rounded-lg uppercase">Dolar Real</span>    
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Dolar Getiri Oranı</p>
            <h3 className={`text-3xl font-black ${totalPLPercentUSD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              %{totalPLPercentUSD.toFixed(2)}
            </h3>
            <p className={`text-sm mt-2 font-black ${totalPLPercentUSD >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
              {totalPLPercentUSD >= 0 ? '+' : '-'}${Math.abs(totalValueUSD - totalCostUSD).toLocaleString(undefined, { maximumFractionDigits: 2 })} {totalPLPercentUSD >= 0 ? 'Net Kâr' : 'Zarar'}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl border-purple-500/10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-500/20 rounded-2xl"><BarChart3 className="text-purple-400 w-6 h-6" /></div>
              <span className="text-[10px] font-black bg-purple-500/20 text-purple-400 px-2 py-1 rounded-lg uppercase">Euro Bazlı</span>
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Euro Getiri Oranı</p>
            <h3 className={`text-3xl font-black ${totalPLPercentEUR >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              %{totalPLPercentEUR.toFixed(2)}
            </h3>
            <p className={`text-sm mt-2 font-black ${totalPLPercentEUR >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
              {totalPLPercentEUR >= 0 ? '+' : '-'}€{Math.abs(totalValueEUR - totalCostEUR).toLocaleString(undefined, { maximumFractionDigits: 2 })} {totalPLPercentEUR >= 0 ? 'Net Kâr' : 'Zarar'}
            </p>
          </motion.div>
        </div>

        {/* Benchmark Summary Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 border border-white/10 rounded-[2.5rem] p-8 mb-12 backdrop-blur-xl relative overflow-hidden">      
          <div className="absolute top-0 right-0 p-8 opacity-10 text-cyan-400"><BarChart3 size={120} /></div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
            <div>
              <h2 className="text-3xl font-black mb-2 italic tracking-tighter uppercase underline decoration-cyan-500/30">TURNUSOL ÖZETİ ( {benchmarkLabel} )</h2>
              <p className="text-gray-400 text-sm max-w-md font-medium leading-relaxed">
                Eğer portföyünüzdeki her varlığı aldığınız tarihte o parayla doğrudan <span className="text-white font-black underline decoration-cyan-500">{benchmarkLabel}</span> alsaydınız:
              </p>
            </div>
            <div className="flex flex-col md:flex-row items-center md:items-end gap-8 md:gap-12">
              {/* Mevcut Durum */}
              <div className="text-center md:text-right bg-white/5 p-6 rounded-[2rem] border border-white/5 backdrop-blur-md">    
                <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2 leading-none">Mevcut Portföyünüz</p>
                <h3 className="text-4xl font-black text-white mb-3 tracking-tighter">₺{(totalCurrentValueTL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                <div className={`inline-flex flex-col items-center gap-1 px-6 py-3 rounded-2xl font-black shadow-xl ${totalPLTL >= 0 ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-red-500/20 text-red-400 border border-red-500/20'}`}>      
                  <div className="flex items-center gap-2 text-sm">
                    {totalPLTL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    %{Math.abs(totalPLPercentTL).toFixed(1)} {totalPLTL >= 0 ? 'Kâr' : 'Zarar'}
                  </div>
                  <div className="text-xs opacity-80">
                    ₺{Math.abs(totalPLTL).toLocaleString(undefined, { maximumFractionDigits: 0 })} {totalPLTL >= 0 ? 'Net Kâr' : 'Zarar'}
                  </div>
                </div>
              </div>

              {/* Simüle Durum */}
              <div className="text-center md:text-right bg-white/5 p-6 rounded-[2rem] border border-white/5 backdrop-blur-md">    
                <p className="text-cyan-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2 leading-none">Toplam Simüle Değer</p>
                <h3 className="text-4xl font-black text-white mb-3 tracking-tighter">₺{(totalBenchmarkValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                <div className={`inline-flex flex-col items-center gap-1 px-6 py-3 rounded-2xl font-black shadow-xl ${totalBenchmarkPL >= 0 ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-red-500/20 text-red-400 border border-red-500/20'}`}>
                  <div className="flex items-center gap-2 text-sm">
                    {totalBenchmarkPL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    %{Math.abs(totalBenchmarkPLPercent).toFixed(1)} {totalBenchmarkPL >= 0 ? 'Getiri' : 'Zarar'}
                  </div>
                  <div className="text-xs opacity-80">
                    ₺{Math.abs(totalBenchmarkPL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} {totalBenchmarkPL >= 0 ? 'Net Kâr' : 'Zarar'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl">
          <h2 className="text-2xl font-black mb-10 flex items-center gap-4"><Activity className="text-cyan-400 w-8 h-8" /> DETAYLI KARŞILAŞTIRMA</h2>
          <div className="space-y-4">
            {processedData.map((stock, i) => (
              <div key={i} className="group bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl p-6 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-black border border-white/10 rounded-2xl flex items-center justify-center text-2xl font-black text-cyan-400 group-hover:border-cyan-500 transition-all uppercase">{stock.name[0]}</div>
                  <div>
                    <h4 className="text-2xl font-black tracking-tight">{stock.name}</h4>
                    <p className="text-xs text-gray-500 font-black uppercase tracking-widest">
                      {stock.amount} LOT / {stock.isNasdaqStock ? "$" : "₺"}{stock.isNasdaqStock ? (stock.cost * stock.amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : stock.costTL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-gray-600">
                      <span>{new Date(stock.purchaseDate).toLocaleDateString('tr-TR')}</span>
                      <span className="w-1 h-1 bg-gray-800 rounded-full" />
                      <span>{Math.floor((new Date().getTime() - new Date(stock.purchaseDate).getTime()) / (1000 * 60 * 60 * 24))} gün önce</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-12">
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Mevcut Değer</p>
                    <p className="font-black text-2xl text-white tracking-tighter">
                      {stock.isNasdaqStock ? "$" : "₺"}{stock.currentValue.toLocaleString(undefined, { maximumFractionDigits: stock.isNasdaqStock ? 2 : 0 })}
                    </p>
                    <div className={`text-xs font-black flex items-center justify-end gap-1 mt-1 ${stock.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {stock.profitLoss >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {stock.isNasdaqStock ? "$" : "₺"}{Math.abs(stock.profitLoss).toLocaleString(undefined, { maximumFractionDigits: stock.isNasdaqStock ? 2 : 0 })} (%{stock.profitLossPercent.toFixed(1)})
                    </div>
                  </div>

                  <div className="text-right min-w-[220px]">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">EĞER {stock.benchmarkAssetName} ALSAYDIN</p>
                    <p className="font-black text-2xl text-gray-400 tracking-tighter">
                      {stock.hasBenchmarkData ? `${stock.isNasdaqStock ? '$' : '₺'}${stock.benchValue.toLocaleString(undefined, { maximumFractionDigits: stock.isNasdaqStock ? 2 : 0 })}` : '—'}
                    </p>
                    {stock.hasBenchmarkData ? (
                      <div className={`text-[11px] font-black mt-1 ${stock.benchGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stock.benchmarkAssetName} getirisi: {stock.benchGain >= 0 ? '+' : '-'}{stock.isNasdaqStock ? '$' : '₺'}{Math.abs(stock.benchGain).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (%{stock.benchGainPercent.toFixed(1)})
                      </div>
                    ) : <div className="text-[11px] text-gray-500 mt-1">Karşılaştırma verisi yok</div>}
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">H:</span>
                        <span className="text-[10px] text-gray-400 font-black">
                          {benchmarkPricePrefix}
                          {stock.benchHistPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md border border-white/10 shadow-sm">  
                        <span className="text-[9px] text-gray-500 font-bold uppercase">C:</span>
                        <span className="text-[10px] text-cyan-400 font-black">
                          {benchmarkPricePrefix}
                          {benchmarkCurrentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>)}
      </div>

      <AnimatePresence>
        {isSearchingBenchmark && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSearchingBenchmark(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-[0_0_100px_rgba(6,182,212,0.2)]">
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-3xl font-black tracking-tighter flex items-center gap-4"><Search className="text-cyan-400 w-8 h-8" /> Turnusol Seç</h2>
                <button onClick={() => setIsSearchingBenchmark(false)} className="text-gray-500 hover:text-white transition-all"><X size={32} /></button>
              </div>

              <div className="space-y-8">
                <div className="flex gap-4">
                  {["BIST 100", "NASDAQ 500", "CRYPTO"].map(m => (
                    <button key={m} onClick={() => setBenchmarkMarket(m)} className={`flex-1 py-3 rounded-2xl text-xs font-black transition-all ${benchmarkMarket === m ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20" : "bg-white/5 text-gray-500 hover:text-white"}`}>{m}</button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 w-6 h-6" />
                  <input type="text" placeholder="Sembol ara..." className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] py-6 pl-16 pr-6 text-xl font-black text-white focus:outline-none focus:border-cyan-500/50 transition-all" value={benchmarkSearchTerm} onChange={(e) => { setBenchmarkSearchTerm(e.target.value.toUpperCase()); setShowBenchmarkSuggestions(true); }} />
                </div>

                <div className="max-h-[350px] overflow-y-auto custom-scrollbar pr-4">
                  {showBenchmarkSuggestions && benchmarkSearchTerm && (
                    <div className="grid grid-cols-1 gap-3">
                      {(benchmarkMarket === "BIST 100" ? BIST100_STOCKS : benchmarkMarket === "NASDAQ 500" ? NASDAQ500_STOCKS : ["BTC-USD", "ETH-USD", "SOL-USD"])
                        .filter(s => s.includes(benchmarkSearchTerm))
                        .map(s => (
                          <button key={s} onClick={() => { setBenchmarkTicker(s); setBenchmarkSearchTerm(""); setShowBenchmarkSuggestions(false); setIsSearchingBenchmark(false); }} className="w-full px-8 py-5 text-left bg-white/5 hover:bg-cyan-500/10 rounded-[1.5rem] border border-transparent hover:border-cyan-500/30 transition-all flex items-center justify-between group">
                            <span className="font-black text-xl text-gray-300 group-hover:text-white">{s}</span>
                            <TrendingUp size={20} className="text-gray-700 group-hover:text-cyan-400" />
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-3 pt-6">
                   <button onClick={() => { setBenchmarkTicker("USDTRY=X"); setIsSearchingBenchmark(false); }} className="bg-white/5 border border-white/10 p-4 rounded-3xl text-[10px] font-black hover:bg-cyan-500/10 transition-all flex flex-col items-center gap-2"><DollarSign size={20} className="text-cyan-400" /> DOLAR</button>
                   <button onClick={() => { setBenchmarkTicker("EURTRY=X"); setIsSearchingBenchmark(false); }} className="bg-white/5 border border-white/10 p-4 rounded-3xl text-[10px] font-black hover:bg-blue-500/10 transition-all flex flex-col items-center gap-2"><span className="text-blue-400 text-xl font-bold">€</span> EURO</button>
                   <button onClick={() => { setBenchmarkTicker("GC=F"); setIsSearchingBenchmark(false); }} className="bg-white/5 border border-white/10 p-4 rounded-3xl text-[10px] font-black hover:bg-yellow-500/10 transition-all flex flex-col items-center gap-2"><div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50"><div className="w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_8px_#facc15]" /></div> ALTIN</button>
                   <button onClick={() => { setBenchmarkTicker("BTC-USD"); setIsSearchingBenchmark(false); }} className="bg-white/5 border border-white/10 p-4 rounded-3xl text-[10px] font-black hover:bg-orange-500/10 transition-all flex flex-col items-center gap-2"><Activity size={20} className="text-orange-400" /> BTC</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
