"use client";

import React, { useState } from 'react';

// Mevcut logo dosyalarının listesi (frontend/public/logos/ dizinindeki dosyalar)
const AVAILABLE_LOGOS = new Set([
  'AEFES', 'AKBNK', 'AKFGY', 'ALARK', 'ALBRK', 'ANSGR', 'ARCLK', 'ARDYZ',
  'ASELS', 'ASTOR', 'ASUZU', 'BERA', 'BIMAS', 'BUCIM', 'CANTE', 'CATES',
  'CEMTS', 'CLEBI', 'CWENE', 'DITAS', 'DOAS', 'DOHOL', 'EBEBK', 'EFORC',
  'EGEEN', 'EMKEL', 'ENERY', 'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GEDIK',
  'GOZDE', 'HEKTS', 'INDES', 'ISCTR', 'IZMDC', 'KARDM', 'KAREL', 'KCHOL',
  'KFEIN', 'KONTR', 'KOTON', 'KOZAL', 'KRDMD', 'LINK', 'LKMNH', 'LOGO',
  'MAVI', 'MIATK', 'MNDRS', 'MOGAN', 'NTHOL', 'ODAS', 'OTKAR', 'OYAKC',
  'PARSN', 'PENTA', 'PETKM', 'PGSUS', 'PLTUR', 'POLHO', 'QNBFB', 'QUAGR',
  'REEDR', 'SAHOL', 'SASA', 'SDTTR', 'SILVR', 'SISE', 'SKBNK', 'SUNTK',
  'TABGD', 'TCELL', 'THYAO', 'TOASO', 'TTKOM', 'TTRAK', 'TUPRS', 'TURSG',
  'UFUK', 'ULKER', 'USAK', 'VERUS', 'VESBE', 'VESTL', 'YKBNK',
]);

// Hangi sembolün hangi formatta logosu var (svg öncelikli)
function getLogoInfo(symbol: string): { exists: boolean; hasSvg: boolean } {
  const clean = symbol.split('.')[0].split('-')[0].toUpperCase();
  const exists = AVAILABLE_LOGOS.has(clean);
  // SVG dosyası var mı kontrol et (listeyi dosya adına göre belirledik,
  // şu an tüm mevcut logolar SVG. PNG-only olanlar da var.
  return { exists, hasSvg: exists };
}

interface SymbolLogoProps {
  symbol: string;
  color: string;
  size?: 'sm' | 'md';
}

export default function SymbolLogo({ symbol, color, size = 'md' }: SymbolLogoProps) {
  const [imgError, setImgError] = useState(false);
  const cleanSymbol = symbol.split('.')[0].split('-')[0].toUpperCase();
  const { exists, hasSvg } = getLogoInfo(symbol);

  const dimensions = size === 'sm'
    ? 'w-10 h-10 rounded-full'
    : 'w-12 h-12 rounded-2xl';

  const padding = size === 'sm' ? 'p-1' : 'p-2';
  const fontSize = size === 'sm' ? 'text-xs' : 'text-sm';

  // Logo dosyası yoksa direkt baş harfi göster (404 yok)
  if (!exists) {
    return (
      <div
        className={`${dimensions} flex items-center justify-center shrink-0 border border-white/10`}
        style={{ backgroundColor: `${color}10` }}
      >
        <span className={`${fontSize} font-black`} style={{ color }}>
          {cleanSymbol[0]}
        </span>
      </div>
    );
  }

  // Logo var, dene. SVG hata verirse PNG'ye geç
  const ext = imgError || !hasSvg ? 'png' : 'svg';
  const logoPath = `/logos/${cleanSymbol}.${ext}`;

  // PNG da hata verdiyse (end-state) baş harf göster
  if (imgError && ext === 'png') {
    return (
      <div
        className={`${dimensions} flex items-center justify-center shrink-0 border border-white/10`}
        style={{ backgroundColor: `${color}10` }}
      >
        <span className={`${fontSize} font-black`} style={{ color }}>
          {cleanSymbol[0]}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${dimensions} flex items-center justify-center overflow-hidden shrink-0 transition-transform group-hover:scale-110 shadow-lg`}
      style={{ backgroundColor: `${color}10` }}
    >
      <img
        src={logoPath}
        alt={cleanSymbol}
        className={`w-full h-full object-contain ${padding}`}
        onError={() => setImgError(true)}
      />
    </div>
  );
}
