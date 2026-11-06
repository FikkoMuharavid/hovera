# ==============================================================================
# Hovera - Skrip Pembuatan Kunci Tanda Tangan Kriptografis Ed25519 (Tauri v2)
# ==============================================================================

$KeyDir = Join-Path $PSScriptRoot "..\.tauri"
$PrivKeyPath = Join-Path $KeyDir "hovera.key"
$PubKeyPath = Join-Path $KeyDir "hovera.key.pub"

if (-not (Test-Path $KeyDir)) {
    New-Item -ItemType Directory -Force -Path $KeyDir | Out-Null
}

if (Test-Path $PrivKeyPath) {
    Write-Host "[INFO] Kunci privat sudah ada di: $PrivKeyPath" -ForegroundColor Yellow
    if (Test-Path $PubKeyPath) {
        $pubKey = (Get-Content $PubKeyPath -Raw).Trim()
        Write-Host "[INFO] Kunci publik Anda adalah:" -ForegroundColor Cyan
        Write-Host $pubKey -ForegroundColor Green
    }
    Write-Host "Kunci ini aman dan tidak akan ter-commit ke GitHub (.gitignore aktif)." -ForegroundColor DarkGray
    exit 0
}

Write-Host "[PROSES] Menghasilkan pasangan kunci Ed25519 baru untuk Hovera..." -ForegroundColor Cyan
npx @tauri-apps/cli signer generate -w $PrivKeyPath --ci

if (Test-Path $PubKeyPath) {
    $pubKey = (Get-Content $PubKeyPath -Raw).Trim()
    Write-Host "`n[SUKSES] Kunci berhasil dibuat!" -ForegroundColor Green
    Write-Host "Kunci Privat: $PrivKeyPath" -ForegroundColor Yellow
    Write-Host "Kunci Publik: $pubKey" -ForegroundColor Cyan
} else {
    Write-Host "[ERROR] Gagal menghasilkan kunci. Silakan periksa output error di atas." -ForegroundColor Red
}
