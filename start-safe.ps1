# ================================================================
#  bistAL GUVENLI BASLAMA SCRIPTI
#  Windows native API ile proje izolasyonu:
#    1. CPU affinity  - sadece 6 cekirdek (16'dan)
#    2. PriorityClass - BelowNormal (dwm.exe'den dusuk)
#    3. MaxWorkingSet - fiziksel RAM kotasi
#    4. Monitor loop  - 15sn'de bir kontrol, asinca temiz kapat
# ================================================================

$PROJECT_ROOT    = "C:\Users\zoomy\Desktop\bistAL"
$BACKEND_DIR     = "$PROJECT_ROOT\backend"
$FRONTEND_DIR    = "$PROJECT_ROOT\frontend"

# --- Limitler (32GB/16-core sistemde projeye 6GB/6 cekirdek ayriliyor) ---
$CPU_CORES_ALLOWED   = 6      # 16 cekirdekten 6'si
$BACKEND_WORKING_MB  = 2048   # Backend fiziksel RAM kotasi (heap 1536 + overhead)
$FRONTEND_WORKING_MB = 4096   # Frontend fiziksel RAM kotasi (heap 3072 + overhead)
$MONITOR_INTERVAL_S  = 15     # Kontrol sikligi (saniye)
$KILL_THRESHOLD_MB   = 6000   # Toplam bu MB'i asinca servisler kapatilir
# -------------------------------------------------------------------------

$CPU_AFFINITY = [IntPtr]([long]([Math]::Pow(2, $CPU_CORES_ALLOWED) - 1))

$script:backendPid  = $null
$script:frontendPid = $null

# ================================================================
function Write-Banner {
    Clear-Host
    Write-Host "================================================================" -ForegroundColor DarkCyan
    Write-Host "  bistAL GUVENLI BASLAMA" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor DarkCyan
    Write-Host "  CPU Limiti   : $CPU_CORES_ALLOWED cekirdek / 16 (mask=$([int]$CPU_AFFINITY))" -ForegroundColor Gray
    Write-Host "  Oncelik      : BelowNormal (dwm.exe'den dusuk)" -ForegroundColor Gray
    Write-Host "  Backend RAM  : max ${BACKEND_WORKING_MB}MB fiziksel" -ForegroundColor Gray
    Write-Host "  Frontend RAM : max ${FRONTEND_WORKING_MB}MB fiziksel" -ForegroundColor Gray
    Write-Host "  Kill siniri  : Toplam ${KILL_THRESHOLD_MB}MB" -ForegroundColor Gray
    Write-Host "================================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

# ================================================================
function Apply-Limits {
    param(
        [System.Diagnostics.Process]$proc,
        [int]$maxWorkingMB,
        [string]$label
    )
    try {
        $proc.Refresh()
        if ($proc.HasExited) { return $false }
        $proc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal
        $proc.ProcessorAffinity = $CPU_AFFINITY
        $proc.MaxWorkingSet = [IntPtr]([long]$maxWorkingMB * 1024 * 1024)
        return $true
    } catch {
        return $false
    }
}

# ================================================================
function Get-AllChildPids {
    param([int]$parentPid)
    $result = @()
    $children = Get-WmiObject Win32_Process | Where-Object { $_.ParentProcessId -eq $parentPid }
    foreach ($c in $children) {
        $result += $c.ProcessId
        $result += Get-AllChildPids -parentPid $c.ProcessId
    }
    return $result
}

# ================================================================
function Limit-ProcessTree {
    param([int]$rootPid, [int]$maxMB, [string]$label, [switch]$Silent)
    $allPids = @($rootPid) + (Get-AllChildPids -parentPid $rootPid)
    $limited = 0
    foreach ($procId in $allPids) {
        try {
            $p = Get-Process -Id $procId -ErrorAction Stop
            if (-not $p.HasExited) {
                $ok = Apply-Limits -proc $p -maxWorkingMB $maxMB -label "$label[$procId]"
                if ($ok) { $limited++ }
            }
        } catch { }
    }
    if (-not $Silent) {
        Write-Host "  [OK] $label - $limited proses limitlendi" -ForegroundColor Green
    }
}

# ================================================================
function Get-TreeMemoryMB {
    param([int]$rootPid)
    $total = 0
    $allPids = @($rootPid) + (Get-AllChildPids -parentPid $rootPid)
    foreach ($procId in $allPids) {
        try {
            $p = Get-Process -Id $procId -ErrorAction Stop
            if (-not $p.HasExited) {
                $total += [Math]::Round($p.WorkingSet64 / 1MB, 0)
            }
        } catch { }
    }
    return $total
}

# ================================================================
function Stop-SafeTree {
    param([int]$rootPid, [string]$label)
    Write-Host ""
    Write-Host "[!!] $label durduruluyor (PID=$rootPid)..." -ForegroundColor Red
    $allPids = @($rootPid) + (Get-AllChildPids -parentPid $rootPid)
    foreach ($procId in $allPids) {
        try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch { }
    }
    Write-Host "  [OK] $label durduruldu." -ForegroundColor Yellow
}

# ================================================================
#  ANA AKIS
# ================================================================
Write-Banner

# --- 1. Onceki node.exe proseslerini temizle ----
Write-Host "[1/4] Onceki node.exe proseleri temizleniyor..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmdLine -like "*bistAL*" -or $cmdLine -like "*tsx*" -or $cmdLine -like "*next*") {
            Stop-Process -Id $_.Id -Force
            Write-Host "  Temizlendi: PID $($_.Id)" -ForegroundColor Gray
        }
    } catch { }
}
Start-Sleep -Seconds 1

# --- 2. Backend baslat (yeni pencerede) ---------
# NODE_OPTIONS package.json cross-env tarafindan ataniyor: --max-old-space-size=1536
Write-Host ""
Write-Host "[2/4] Backend baslatiliyor..." -ForegroundColor Yellow
$backendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/k", "title BISTAL-BACKEND && cd /d `"$BACKEND_DIR`" && npm run dev" `
    -PassThru

$script:backendPid = $backendProc.Id
Write-Host "  Backend PID: $($script:backendPid)" -ForegroundColor Green

# --- 3. Frontend baslat (yeni pencerede) --------
# NODE_OPTIONS package.json cross-env tarafindan ataniyor: --max-old-space-size=3072
Write-Host ""
Write-Host "[3/4] Frontend baslatiliyor..." -ForegroundColor Yellow
$frontendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/k", "title BISTAL-FRONTEND && cd /d `"$FRONTEND_DIR`" && npm run dev" `
    -PassThru

$script:frontendPid = $frontendProc.Id
Write-Host "  Frontend PID: $($script:frontendPid)" -ForegroundColor Green

# --- 4. Node prosesleri olusana kadar bekle -----
Write-Host ""
Write-Host "[4/4] Node.exe proseleri bekleniyor (12sn)..." -ForegroundColor Yellow
Start-Sleep -Seconds 12

Write-Host ""
Write-Host "Limitler uygulanıyor:" -ForegroundColor Cyan
Limit-ProcessTree -rootPid $script:backendPid  -maxMB $BACKEND_WORKING_MB  -label "Backend"
Limit-ProcessTree -rootPid $script:frontendPid -maxMB $FRONTEND_WORKING_MB -label "Frontend"

# ================================================================
#  MONITOR LOOP
# ================================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkCyan
Write-Host "  MONITOR AKTIF - Her ${MONITOR_INTERVAL_S}sn kontrol" -ForegroundColor Cyan
Write-Host "  Durdurmak icin: Ctrl+C" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor DarkCyan
Write-Host ""

while ($true) {
    Start-Sleep -Seconds $MONITOR_INTERVAL_S

    $ts = Get-Date -Format "HH:mm:ss"

    $bMem   = 0; $bAlive = $false
    $fMem   = 0; $fAlive = $false

    try {
        $bp = Get-Process -Id $script:backendPid -ErrorAction Stop
        $bAlive = -not $bp.HasExited
        $bMem = Get-TreeMemoryMB -rootPid $script:backendPid
        Limit-ProcessTree -rootPid $script:backendPid -maxMB $BACKEND_WORKING_MB -label "Backend" -Silent
    } catch { $bAlive = $false }

    try {
        $fp = Get-Process -Id $script:frontendPid -ErrorAction Stop
        $fAlive = -not $fp.HasExited
        $fMem = Get-TreeMemoryMB -rootPid $script:frontendPid
        Limit-ProcessTree -rootPid $script:frontendPid -maxMB $FRONTEND_WORKING_MB -label "Frontend" -Silent
    } catch { $fAlive = $false }

    $total = $bMem + $fMem

    $bColor = if ($bMem -gt $BACKEND_WORKING_MB  * 0.9) { "Red" } elseif ($bMem -gt $BACKEND_WORKING_MB  * 0.7) { "Yellow" } else { "Green" }
    $fColor = if ($fMem -gt $FRONTEND_WORKING_MB * 0.9) { "Red" } elseif ($fMem -gt $FRONTEND_WORKING_MB * 0.7) { "Yellow" } else { "Green" }
    $tColor = if ($total -gt $KILL_THRESHOLD_MB  * 0.9) { "Red" } elseif ($total -gt $KILL_THRESHOLD_MB  * 0.7) { "Yellow" } else { "Cyan" }

    $bStatus = if ($bAlive) { "CALISIYOR" } else { "DURDU" }
    $fStatus = if ($fAlive) { "CALISIYOR" } else { "DURDU" }

    Write-Host "[$ts]  Backend: " -NoNewline -ForegroundColor Gray
    Write-Host "${bMem}MB ($bStatus)" -NoNewline -ForegroundColor $bColor
    Write-Host "  |  Frontend: " -NoNewline -ForegroundColor Gray
    Write-Host "${fMem}MB ($fStatus)" -NoNewline -ForegroundColor $fColor
    Write-Host "  |  TOPLAM: " -NoNewline -ForegroundColor Gray
    Write-Host "${total}MB" -ForegroundColor $tColor

    # Backend cok RAM alirsa yeniden baslat
    if ($bAlive -and $bMem -gt ($BACKEND_WORKING_MB * 1.5)) {
        Write-Host ""
        Write-Host "[UYARI] Backend cok fazla RAM kullaniyor! (${bMem}MB > limit)" -ForegroundColor Red
        Stop-SafeTree -rootPid $script:backendPid -label "Backend"
        Write-Host "Backend 5sn sonra yeniden baslatilacak..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        $backendProc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/k", "title BISTAL-BACKEND && cd /d `"$BACKEND_DIR`" && npm run dev" `
            -PassThru
        $script:backendPid = $backendProc.Id
        Start-Sleep -Seconds 10
        Limit-ProcessTree -rootPid $script:backendPid -maxMB $BACKEND_WORKING_MB -label "Backend"
    }

    # Toplam sinir asildi - her sey dur
    if ($total -gt $KILL_THRESHOLD_MB) {
        Write-Host ""
        Write-Host "[KRITIK] Toplam RAM ${total}MB - Sinir asildi (${KILL_THRESHOLD_MB}MB)!" -ForegroundColor Red
        Write-Host "Her iki servis kapatiliyor..." -ForegroundColor Red
        Stop-SafeTree -rootPid $script:backendPid  -label "Backend"
        Stop-SafeTree -rootPid $script:frontendPid -label "Frontend"
        Write-Host ""
        Write-Host "Servisler durduruldu. Masaustunus kurtardim :)" -ForegroundColor Green
        Write-Host "Yeniden baslatmak icin scripti tekrar calistir." -ForegroundColor Gray
        break
    }
}
