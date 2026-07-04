import axios from 'axios';

// ============================================================================
// ⚠️ YAPILANDIRMA (Kendi yakaladığınız URL ve Header verileriyle doldurun)
// ============================================================================

// 1. Hedef API Uç Noktaları (URL'ler)
const FAVORITES_API_URL = 'https://api.ornek.com/favorites'; // Favori hisse listesini döndüren endpoint
const AKD_API_URL = 'https://api.ornek.com/akd'; // Belirli hissenin AKD verisini döndüren endpoint

// 2. Telegram Mini App kimlik doğrulama ve istek header'ları
const HEADERS = {
  'Host': 'api.ornek.com',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 Telegram-Android/10.11.1 (Xiaomi Redmi Note 8; Android 10)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Content-Type': 'application/json',
  
  // Telegram Mini App doğrulama token/header'ları (Geliştirici araçlarında yakaladıklarınızı buraya ekleyin)
  'Authorization': 'Bearer YAKALANAN_TOKEN_BURAYA', 
  
  // Telegram webApp initData şifreli dizesi (tgWebAppData / initData)
  // Genelde bir header olarak (örn: x-tg-data, tg-web-app-data) veya URL query parametresi olarak gönderilir
  'x-tg-data': 'query_id=xxx&user=yyy&auth_date=zzz&hash=aaa', 
  
  // Diğer olası mini app header'ları
  'Origin': 'https://webapp.ornek.com',
  'Referer': 'https://webapp.ornek.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site'
};

// ============================================================================
// ÇEKİRDEK İSTEK FONKSİYONLARI
// ============================================================================

/**
 * Botun ana sayfasındaki (favoriler listesindeki) hisseleri çeker.
 * Dönen verinin yapısına göre sembol listesini ayıklar.
 */
async function fetchFavoritesList(): Promise<string[]> {
  console.log('🔄 Favori hisse listesi çekiliyor...');
  
  // NOT: İstek tipiniz POST ise axios.post(URL, payload, { headers }) yapmalısınız.
  // Burada varsayılan olarak GET isteği yapılmıştır.
  const response = await axios.get(FAVORITES_API_URL, {
    headers: HEADERS,
    timeout: 10000 // 10 saniye zaman aşımı
  });

  console.log('✅ Favori listesi başarıyla çekildi. Yanıt Durumu:', response.status);
  
  // TODO: Dönen API yanıt yapısına göre sembolleri ayıklama mantığını güncelleyin.
  // Örnek varsayım: API doğrudan string dizisi döndürüyor veya { favorites: [{ symbol: 'THYAO' }] } yapısında.
  const responseData = response.data;
  console.log('📋 Ham Yanıt Örneği (İlk 200 Karakter):', JSON.stringify(responseData).substring(0, 200));

  let symbols: string[] = [];
  if (Array.isArray(responseData)) {
    symbols = responseData;
  } else if (responseData && Array.isArray(responseData.favorites)) {
    symbols = responseData.favorites.map((item: any) => item.symbol || item);
  } else if (responseData && typeof responseData === 'object') {
    // Diğer yaygın yapılar için fallback
    const potentialArray = Object.values(responseData).find(val => Array.isArray(val));
    if (potentialArray) {
      symbols = (potentialArray as any[]).map(item => item.symbol || item);
    }
  }

  // Eğer hiçbir şey bulunamazsa test için mock/varsayılan liste döner
  if (symbols.length === 0) {
    console.warn('⚠️ Yanıt yapısından otomatik sembol listesi çıkarılamadı. Kod içerisindeki parsing mantığını inceleyin.');
  }

  return symbols;
}

/**
 * Belirtilen hisse sembolü için AKD (Aracı Kurum Dağılımı) verilerini çeker.
 * @param symbol Hisse kodu (örn: "THYAO", "ASELS")
 */
async function fetchAKDData(symbol: string): Promise<any> {
  console.log(`🔄 [${symbol}] için AKD verisi çekiliyor...`);
  
  // NOT: API'niz parametreleri URL'de mi yoksa POST body'sinde mi bekliyor?
  // Örnek 1: GET isteği ile url parametresi: `${AKD_API_URL}?symbol=${symbol}`
  // Örnek 2: POST isteği ile JSON body: axios.post(AKD_API_URL, { symbol }, { headers })
  
  // Aşağıda Örnek 1 (GET + Query Parametresi) kullanılmıştır:
  const requestUrl = `${AKD_API_URL}?symbol=${symbol}`;
  
  const response = await axios.get(requestUrl, {
    headers: HEADERS,
    timeout: 10000
  });

  console.log(`✅ [${symbol}] AKD verisi başarıyla çekildi. Yanıt Durumu:`, response.status);
  return response.data;
}

// ============================================================================
// TEST KOŞTURUCU (RUNNER)
// ============================================================================
async function runTest() {
  console.log('🚀 1. Adım Test Başlatıldı: Telegram Mini App Core İstek Testi\n');
  
  try {
    // 1. Favorileri Çek
    const favorites = await fetchFavoritesList();
    console.log(`📌 Tespit Edilen Favori Hisseler (${favorites.length} adet):`, favorites);

    if (favorites.length === 0) {
      console.log('⚠️ Favori listesi boş veya ayrıştırılamadı. Lütfen API response yapısını kontrol edin.');
      return;
    }

    // 2. Her bir favori hisse için AKD verisini sırayla çek
    console.log('\n--- AKD Verilerinin Çekilmesi Başlatılıyor ---');
    for (const symbol of favorites) {
      try {
        const akdData = await fetchAKDData(symbol);
        console.log(`📊 [${symbol}] AKD Ham Yanıt (İlk 150 Karakter):`, JSON.stringify(akdData).substring(0, 150));
        console.log('----------------------------------------------');
      } catch (err: any) {
        console.error(`❌ [${symbol}] AKD verisi çekilirken hata oluştu:`, err.message);
        if (err.response) {
          console.error(`Status: ${err.response.status} | Data:`, JSON.stringify(err.response.data).substring(0, 200));
        }
      }
    }

    console.log('\n🎉 Test tamamlandı!');

  } catch (error: any) {
    console.error('\n🔴 Test sırasında ölümcül hata:', error.message);
    if (error.response) {
      console.error('API Hata Yanıtı:', {
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    }
  }
}

// Doğrudan script olarak çalıştırıldığında tetikle
runTest();
