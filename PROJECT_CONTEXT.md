# PROJECT CONTEXT: Local-First Stock Analysis SaaS

## Current Tech Stack
- **Backend:** Node.js, Express, TypeScript, Zod
- **Frontend:** Next.js (App Router), Tailwind CSS
- **Database & Cache:** MongoDB, Redis (via Docker)
- **AI & Data:** Gemini 1.5 Flash API, Yahoo Finance, TCMB EVDS

## Project Structure
- `/PROJECT_CONTEXT.md` -> AI Hafızası (Sen buradasın)
- `/backend` -> API, Veri Çekme (BIST/BoFA), AI Logic
- `/frontend` -> UI, Dashboard, Portföy Yönetimi
- `/shared` -> Ortak TypeScript Interface ve Tipleri
- `/docker-compose.yml` -> Local Altyapı (Mongo + Redis)

## Recent Activity
- Proje iskeleti tasarlandı ve Antigravity görev listesi oluşturuldu.
- Aşama 1 tamamlandı, temel klasörler ve tipler oluşturuldu.

## Task Board
- [x] 1. Aşama: Klasör mimarisi ve Git repo kurulumu.
- [ ] 2. Aşama: Docker altyapısının (MongoDB + Redis) ayağa kaldırılması.
- [x] 3. Aşama: Shared klasöründe temel tiplerin tanımlanması.

## Logic & Rules
1. Daima TypeScript kullan ve strict mod aktif olsun.
2. Monitörlerin minimum parlaklığında bile net okunabilen, yüksek kontrastlı Full Dark Theme uygula.
3. Hisse kodlarının sonuna daima `.IS` ekle (Örn: THYAO.IS).
4. Veri transferlerinde mutlak suretle Zod ile validasyon yap.
5. Her büyük özellik eklendiğinde bu dosyayı (PROJECT_CONTEXT.md) güncelle.

🚀 Antigravity Task List: Local Development Roadmap
Aşağıdaki liste, geliştirme sürecini sırasıyla uygulayabileceğin modüllere ayırmıştır.

Aşama 1: Temel İskelet ve "Shared" Altyapısı (Foundation)
[x] Kök dizini oluştur ve npm init -y ile ana projeyi başlat.
[x] PROJECT_CONTEXT.md dosyasını kök dizine ekle.
[x] /shared klasörünü oluştur.
[x] /shared/types.ts içine temel Zod şemalarını ve TypeScript arayüzlerini (StockData, BofaReport, TechnicalIndicators) yaz.
[x] /backend ve /frontend klasörlerini oluştur (henüz içlerini doldurma).

Aşama 2: Local Infrastructure (Docker)
[x] Kök dizinde docker-compose.yml dosyası oluştur.
[x] MongoDB resmi imajını ekle ve portları ayarla (27017:27017).
[x] Redis resmi imajını ekle ve portları ayarla (6379:6379).
[ ] Terminalden docker-compose up -d komutu ile servisleri başlat ve çalıştıklarını test et.
[ ] PROJECT_CONTEXT.md'yi güncelle: "Aşama 2 tamamlandı, DB ve Cache localde aktif."

Aşama 3: Backend İnşası (Veri ve AI Katmanı)
[x] /backend dizinine geç, Node.js + Express + TS kurulumlarını yap.
[x] /shared dizinini backend'e bağla (tsconfig path ayarları veya monorepo mantığı ile).
[x] Data Fetchers: Yahoo Finance'ten .IS uzantılı hisselerin verisini ve TCMB EVDS'den kur bilgisini çekecek servisleri (Axios/Fetch) yaz.
[x] Technical Analysis: Çekilen veriler üzerinden RSI ve MACD hesaplayan yardımcı fonksiyonları oluştur.
[x] AI Agent Endpoint: Gemini 1.5 Flash API entegrasyonunu yap. Hazırlanan teknik verileri Gemini'ye besleyip "Al/Sat/Tut" strateji raporu döndüren rotayı (/api/analyze) oluştur.
[x] MongoDB bağlantısını kur (Mongoose/Prisma) ve çekilen ham verileri Redis ile cache'le.
[x] PROJECT_CONTEXT.md'yi güncelle: "Aşama 3 tamamlandı, API rotaları ve Gemini entegrasyonu hazır."

Aşama 4: Frontend İnşası (Dashboard ve UI)
[x] /frontend dizininde Next.js App Router projesi başlat.
[x] Tailwind CSS yapılandırmasında köklü bir Dark Mode ayarı yap (Siyah arka planlar, koyu gri paneller, yüksek kontrastlı neon vurgular - yeşil/kırmızı).
[x] /shared klasöründeki tipleri frontend'e import edilebilir hale getir.
[x] Bileşenler: Hisse arama çubuğu, RSI/MACD gösterge kartları ve AI Analiz Raporu bileşeni oluştur.
[x] Backend API'sine (localhost:PORT) bağlanarak verileri ekrana dök.
[x] PROJECT_CONTEXT.md'yi güncelle: "Aşama 4 tamamlandı, arayüz backend ile bağlandı."

Aşama 5: Sistem Entegrasyonu ve Agent Döngüsü Testi
[ ] Postman veya curl ile end-to-end (uçtan uca) test yap: Bir hisse sorgula, cache'e düşüp düşmediğini kontrol et, AI analizinin üretildiğini doğrula.
