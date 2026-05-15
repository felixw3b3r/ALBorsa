# ================================================================
#  bistAL GUVENLI BASLAMA (NODE.JS SEVIYESI)
#  Sistem API'leriyle oynamak yerine sadece Node.js'i kisitlar.
# ================================================================

$PROJECT_ROOT    = "C:\Users\zoomy\Desktop\bistAL"
$BACKEND_DIR     = "$PROJECT_ROOT\backend"
$FRONTEND_DIR    = "$PROJECT_ROOT\frontend"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  PROJEYI TEMIZLIYORUZ..." -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan

Get-Process -Name "node", "cmd" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmdLine -like "*bistAL*" -or $cmdLine -like "*tsx*" -or $cmdLine -like "*next*" -or $cmdLine -like "*BISTAL*") {
            Stop-Process -Id $_.Id -Force
        }
    } catch { }
}
Start-Sleep -Seconds 2

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "  GÜVENLİ LİMİTLERLE BAŞLATILIYOR" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan

# Backend (Max 1.5 GB Heap)
Write-Host "-> Backend baslatiliyor (Max 1.5GB Heap)..." -ForegroundColor Yellow
$backendEnvBlock = "set NODE_OPTIONS=--max-old-space-size=1536&& npm run dev"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title BISTAL-BACKEND && cd /d `"$BACKEND_DIR`" && $backendEnvBlock"

# Frontend (Max 3 GB Heap)
Write-Host "-> Frontend baslatiliyor (Max 3GB Heap)..." -ForegroundColor Yellow
$frontendEnvBlock = "set NODE_OPTIONS=--max-old-space-size=3072&& npm run dev > frontend-log.txt 2>&1"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "title BISTAL-FRONTEND && cd /d `"$FRONTEND_DIR`" && $frontendEnvBlock"

Write-Host "`n[OK] Basarili! Masaustu pencerelerinde loglari gorebilirsiniz." -ForegroundColor Green
Write-Host "[OK] Eger Node.js belirtilen RAM'i asarsa kendi kendini guvenlice kapatacaktir." -ForegroundColor Green
Write-Host "[OK] PowerShell artik sistemi yormayacak." -ForegroundColor Gray
