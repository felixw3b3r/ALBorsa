# 🚀 Ubuntu Sunucu Kurulum Rehberi

Bu proje artık Dockerize edildi ve yayına hazır hale getirildi. Sunucuna kurmak için aşağıdaki adımları izle.

## 1. Hazırlık
Ubuntu sunucunda Docker ve Docker Compose'un kurulu olduğundan emin ol.
```bash
sudo apt update
sudo apt install docker.io docker-compose -y
```

## 2. Projeyi Sunucuya Aktar
Dosyaları sunucuna `git clone` ile veya SCP/FTP ile gönder.

## 3. Ortam Değişkenlerini Ayarla
Ana dizinde bir `.env` dosyası oluştur ve gerekli anahtarları gir:
```bash
nano .env
```
İçerik:
```env
# Gerekli anahtarlar (Gemini vb.)
```

## 4. Sistemi Başlat
Aşağıdaki komutla tüm sistemi (Frontend, Backend, Veritabanları, Nginx) arka planda çalıştır:
```bash
sudo docker-compose up -d --build
```

## 5. Erişim
*   **Web Sitesi:** `http://sunucu_ip_adresin`
*   **API:** `http://sunucu_ip_adresin/api`

## Yapılan İyileştirmeler:
*   **Dockerization:** Backend ve Frontend için Dockerfile'lar eklendi.
*   **Nginx:** Ters proxy olarak Nginx eklendi (Port 80 üzerinden erişim sağlar).
*   **Dinamik API:** Frontend, API adresini otomatik olarak sunucuya göre ayarlar (relative path `/api`).
*   **Veritabanı Bağlantıları:** Docker içindeki servis isimlerine (`mongodb`, `redis`) göre güncellendi.

---
**Bol kazançlar! 📈**
