@AGENTS.md

# Frontend Özel Bilgiler

## Önemli Sayfalar
- `/piyasalar`: Piyasalar ana sayfası (hisse listesi, sparkline grafikler, kategoriler)
- `/piyasalar/[symbol]`: Hisse detay sayfası (fiyat grafiği, teknik analiz, haberler)
- `/portfolio`: Portföy yönetimi (ekleme, düzenleme, silme, pasta grafiği)
- `/real-getiri`: Real getiri hesaplama (benchmark karşılaştırma, dolar/euro bazlı)
- `/login`: Giriş sayfası
- `/register`: Kayıt sayfası
- `/haberler/[id]`: Haber detay sayfası

## Kullanılan Kütüphaneler
- Next.js 14+ (App Router)
- React 18+
- Tailwind CSS
- Framer Motion (animasyonlar)
- Zod (tip doğrulama)
- Axios (HTTP istekleri)
- Lucide React (ikonlar)
- Recharts (grafikler - piyasalar sayfasında)

## Kodlama Kuralları
- Tüm bileşenler `'use client'` direktifi ile başlar (istemci tarafı)
- State yönetimi için `useState`, `useEffect` kullan
- API çağrıları için `fetch` veya `axios` kullan
- Animasyonlar için `framer-motion` kullan
- Tip güvenliği için `shared/types.ts`'den tipleri import et
- Renkler için Tailwind CSS sınıfları kullan (bg-neon-purple, text-cyan-400 vb.)
- Pasta grafiği için SVG kullan (portfolio sayfası)
- Sparkline grafikler için SVG kullan (piyasalar sayfası)

## Önemli Component'ler
- `Navbar`: Üst navigasyon çubuğu
- `HeroBackground`: Arka plan efekti
- `SymbolLogo`: Hisse logosu (SVG/PNG fallback)
- `Sparkline`: Küçük grafik (piyasalar sayfası)
- `MarketCard`: Piyasa kartı (piyasalar sayfası)

## API Kullanımı
- Tüm API istekleri `NEXT_PUBLIC_API_URL` (varsayılan: `http://localhost:5000/api`)
- Auth token `localStorage.getItem('token')` ile alınır
- `Authorization: Bearer <token>` header'ı ile gönderilir
