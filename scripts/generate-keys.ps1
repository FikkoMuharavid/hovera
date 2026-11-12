# ==============================================================================
# Hovera - Pembuatan Kunci Tanda Tangan Updater Ed25519 (Tauri v2)
# ==============================================================================
# Kunci disimpan DI LUAR folder repo (default: ~\.hovera\hovera.key) dan dilindungi
# password. CLI Tauri akan menanyakan password secara interaktif.
#
# PENTING:
#  - Simpan password di password manager dan buat backup offline kunci privat.
#    Kunci yang hilang = pengguna lama tidak bisa menerima update lagi.
#  - Mengganti kunci berarti mengganti "pubkey" di src-tauri/tauri.conf.json.
#    Versi yang sudah terpasang di PC pengguna hanya menerima update yang
#    ditandatangani kunci LAMA, jadi rotasi harus direncanakan (lihat README).
# ==============================================================================
param (
    [string]$KeyPath = $(if ($env:HOVERA_SIGNING_KEY_PATH) { $env:HOVERA_SIGNING_KEY_PATH } else { Join-Path $env:USERPROFILE ".hovera\hovera.key" }),
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$KeyDir = Split-Path $KeyPath -Parent
$PubKeyPath = "$KeyPath.pub"

if (-not (Test-Path $KeyDir)) {
    New-Item -ItemType Directory -Force -Path $KeyDir | Out-Null
}

if ((Test-Path $KeyPath) -and -not $Force) {
    Write-Host "[INFO] Kunci privat sudah ada di: $KeyPath" -ForegroundColor Yellow
    if (Test-Path $PubKeyPath) {
        Write-Host "[INFO] Kunci publik:" -ForegroundColor Cyan
        Write-Host ((Get-Content $PubKeyPath -Raw).Trim()) -ForegroundColor Green
    }
    Write-Host "Gunakan -Force untuk membuat kunci baru (rotasi)." -ForegroundColor DarkGray
    exit 0
}

Write-Host "[PROSES] Membuat pasangan kunci Ed25519 baru (Anda akan diminta password)..." -ForegroundColor Cyan
Push-Location $RootDir
try {
    $genArgs = @("run", "tauri", "--", "signer", "generate", "-w", $KeyPath)
    if ($Force) { $genArgs += "--force" }
    & npm @genArgs
    if ($LASTEXITCODE -ne 0) { throw "Gagal membuat kunci." }
} finally {
    Pop-Location
}

if (Test-Path $PubKeyPath) {
    $pubKey = (Get-Content $PubKeyPath -Raw).Trim()
    Write-Host "`n[SUKSES] Kunci berhasil dibuat." -ForegroundColor Green
    Write-Host "Kunci privat : $KeyPath" -ForegroundColor Yellow
    Write-Host "Kunci publik : $pubKey" -ForegroundColor Cyan
    Write-Host "`nLangkah berikutnya: salin kunci publik ke plugins.updater.pubkey di src-tauri/tauri.conf.json," -ForegroundColor White
    Write-Host "lalu backup kunci privat + password ke tempat aman (offline)." -ForegroundColor White
} else {
    Write-Host "[ERROR] Gagal menghasilkan kunci. Periksa output di atas." -ForegroundColor Red
}
