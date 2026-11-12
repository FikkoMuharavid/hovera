# ==============================================================================
# Hovera - Skrip Otomasi Rilis & Pembaruan GitHub Releases (Tauri v2)
# ==============================================================================
# Penggunaan:
#   .\scripts\release-github.ps1 -Version "1.0.8" -Notes "Deskripsi pembaruan..."
#
# Opsi:
#   -SkipBuild     Lewati build (pakai output build yang sudah ada)
#   -Push          Commit bump versi lalu push ke origin/main tanpa bertanya
#   -AutoPublish   Unggah ke GitHub Releases setelah paket siap
#   -NoKeyPassword Kunci updater tanpa password (tidak ditanyakan)
#
# Variabel lingkungan:
#   HOVERA_SIGNING_KEY_PATH              Lokasi kunci privat updater (default: ~\.hovera\hovera.key)
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD   Password kunci (jika kosong, akan ditanyakan)
#   HOVERA_CERT_THUMBPRINT               (Opsional) Thumbprint sertifikat code-signing Authenticode
#                                        di Windows Certificate Store. Bila diisi, hovera.exe dan
#                                        installer ditandatangani sehingga SmartScreen tidak memblokir.
#   HOVERA_TIMESTAMP_URL                 (Opsional) Server timestamp, default http://timestamp.digicert.com
# ==============================================================================

param (
    [Parameter(Mandatory = $true, HelpMessage = "Nomor versi rilis baru (contoh: 1.0.8)")]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [Parameter(Mandatory = $false, HelpMessage = "Catatan pembaruan / changelog")]
    [string]$Notes = "Pembaruan rutin stabilitas dan peningkatan fitur.",

    [switch]$SkipBuild = $false,

    [switch]$Push = $false,

    [switch]$AutoPublish = $false,

    # Kunci updater tidak memakai password (lewati pertanyaan password)
    [switch]$NoKeyPassword = $false
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$PackageJsonPath = Join-Path $RootDir "package.json"
$TauriConfPath = Join-Path $RootDir "src-tauri\tauri.conf.json"
$CargoTomlPath = Join-Path $RootDir "src-tauri\Cargo.toml"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  HOVERA RELEASE AUTOMATION ENGINE (v$Version)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Lokasi & password kunci Ed25519 (updater)
$KeyPath = $env:HOVERA_SIGNING_KEY_PATH
if (-not $KeyPath) { $KeyPath = Join-Path $env:USERPROFILE ".hovera\hovera.key" }
$LegacyKeyPath = Join-Path $RootDir ".tauri\hovera.key"
if (-not (Test-Path $KeyPath) -and (Test-Path $LegacyKeyPath)) {
    Write-Host "[PERINGATAN] Memakai kunci lama di dalam folder repo: $LegacyKeyPath" -ForegroundColor Yellow
    Write-Host "             Pindahkan ke ~\.hovera\ atau set HOVERA_SIGNING_KEY_PATH." -ForegroundColor Yellow
    $KeyPath = $LegacyKeyPath
}
if (-not (Test-Path $KeyPath)) {
    Write-Host "[ERROR] Kunci privat penandatanganan tidak ditemukan di: $KeyPath" -ForegroundColor Red
    Write-Host "Jalankan .\scripts\generate-keys.ps1 terlebih dahulu." -ForegroundColor Yellow
    exit 1
}

$KeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
if ($NoKeyPassword) { $KeyPassword = "" }
if ($null -eq $KeyPassword) {
    $secure = Read-Host "Password kunci updater (kosongkan jika kunci lama tanpa password)" -AsSecureString
    $KeyPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if ($KeyPassword -eq "") {
    Write-Host "[PERINGATAN] Kunci updater tanpa password. Lihat AUDIT-PRODUCTION.md (T9)." -ForegroundColor Yellow
}

# 2. Sinkronisasi versi (regex, agar format file tidak diubah)
Write-Host "`n[1/5] Memperbarui nomor versi menjadi $Version..." -ForegroundColor Yellow

function Set-JsonVersion([string]$Path, [string]$NewVersion) {
    $content = [System.IO.File]::ReadAllText($Path)
    $updated = [regex]::Replace($content, '("version"\s*:\s*)"[^"]+"', "`${1}`"$NewVersion`"", 1)
    [System.IO.File]::WriteAllText($Path, $updated, $Utf8NoBom)
}
Set-JsonVersion $PackageJsonPath $Version
Set-JsonVersion $TauriConfPath $Version
$cargoContent = [System.IO.File]::ReadAllText($CargoTomlPath)
$cargoContent = [regex]::Replace($cargoContent, '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`"", 1)
[System.IO.File]::WriteAllText($CargoTomlPath, $cargoContent, $Utf8NoBom)
Write-Host "[OK] package.json, tauri.conf.json & Cargo.toml disinkronkan ke v$Version" -ForegroundColor Green

# Commit & push hanya atas persetujuan
$doPush = $Push
if (-not $doPush) {
    $answer = Read-Host "Commit bump versi dan push ke origin/main sekarang? (y/N)"
    $doPush = ($answer -eq 'y' -or $answer -eq 'Y')
}
if ($doPush) {
    Push-Location $RootDir
    try {
        git add $PackageJsonPath $TauriConfPath $CargoTomlPath (Join-Path $RootDir "src-tauri\Cargo.lock")
        git commit -m "chore(release): bump version to v$Version"
        git push origin main
    } catch {
        Write-Host "[INFO] Tidak ada perubahan git baru untuk di-commit." -ForegroundColor DarkGray
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[INFO] Bump versi tidak di-commit. Jangan lupa commit sebelum publikasi." -ForegroundColor DarkGray
}

# 3. Build (CLI Tauri dari devDependencies, bukan versi 'latest' acak dari npx)
if (-not $SkipBuild) {
    Write-Host "`n[2/5] Membangun installer Windows (NSIS)..." -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        $buildArgs = @("run", "tauri", "--", "build", "--bundles", "nsis")
        if ($env:HOVERA_CERT_THUMBPRINT) {
            $tsUrl = $env:HOVERA_TIMESTAMP_URL
            if (-not $tsUrl) { $tsUrl = "http://timestamp.digicert.com" }
            $signConfig = @{
                bundle = @{
                    windows = @{
                        certificateThumbprint = $env:HOVERA_CERT_THUMBPRINT
                        digestAlgorithm = "sha256"
                        timestampUrl = $tsUrl
                    }
                }
            } | ConvertTo-Json -Depth 5 -Compress
            $signConfigPath = Join-Path $env:TEMP "hovera-sign-config.json"
            [System.IO.File]::WriteAllText($signConfigPath, $signConfig, $Utf8NoBom)
            $buildArgs += @("--config", $signConfigPath)
            Write-Host "[INFO] Code signing Authenticode aktif (thumbprint $($env:HOVERA_CERT_THUMBPRINT))" -ForegroundColor Cyan
        } else {
            Write-Host "[PERINGATAN] HOVERA_CERT_THUMBPRINT tidak di-set: installer TIDAK di-code-sign (SmartScreen akan memperingatkan pengguna)." -ForegroundColor Yellow
        }

        & npm @buildArgs
        if ($LASTEXITCODE -ne 0) { throw "Gagal kompilasi bundle NSIS Tauri." }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/5] Melewati tahap build (-SkipBuild aktif)..." -ForegroundColor DarkGray
}

# 4. Tanda tangan updater (minisign / Ed25519)
Write-Host "`n[3/5] Menandatangani installer untuk updater..." -ForegroundColor Yellow
$NsisDir = Join-Path $RootDir "src-tauri\target\release\bundle\nsis"
$ExeFileName = "Hovera_${Version}_x64-setup.exe"
$InstallerExe = Join-Path $NsisDir $ExeFileName
$ExeSigFile = "$InstallerExe.sig"

if (-not (Test-Path $InstallerExe)) {
    Write-Host "[ERROR] Berkas installer $InstallerExe tidak ditemukan" -ForegroundColor Red
    exit 1
}

Push-Location $RootDir
try {
    # Selalu kirim password secara eksplisit (juga yang kosong) agar CLI tidak menunggu input.
    $signArgs = @("run", "tauri", "--", "signer", "sign", $InstallerExe, "-f", $KeyPath, "--password=$KeyPassword")
    & npm @signArgs
    if ($LASTEXITCODE -ne 0) { throw "Gagal menandatangani installer." }
} finally {
    Pop-Location
    $KeyPassword = $null
}

if (-not (Test-Path $ExeSigFile)) {
    Write-Host "[ERROR] Berkas tanda tangan (.sig) tidak berhasil dibuat." -ForegroundColor Red
    exit 1
}
$exeSignature = (Get-Content $ExeSigFile -Raw).Trim()

# 5. Paket rilis + latest.json
Write-Host "`n[4/5] Menyiapkan paket rilis dan metadata latest.json..." -ForegroundColor Yellow
$ReleaseFolder = Join-Path $RootDir "releases\v$Version"
New-Item -ItemType Directory -Force -Path $ReleaseFolder | Out-Null

$latestJson = [ordered]@{
    version = $Version
    notes = $Notes
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $exeSignature
            url = "https://github.com/FikkoMuharavid/hovera/releases/download/v$Version/$ExeFileName"
        }
    }
}
$LatestJsonPath = Join-Path $ReleaseFolder "latest.json"
[System.IO.File]::WriteAllText($LatestJsonPath, ($latestJson | ConvertTo-Json -Depth 6), $Utf8NoBom)
Copy-Item -Path $InstallerExe -Destination (Join-Path $ReleaseFolder $ExeFileName) -Force
Copy-Item -Path $ExeSigFile -Destination (Join-Path $ReleaseFolder "$ExeFileName.sig") -Force

Write-Host "[OK] Paket rilis siap di: $ReleaseFolder" -ForegroundColor Green
Write-Host "     - latest.json" -ForegroundColor Cyan
Write-Host "     - $ExeFileName (+ .sig)" -ForegroundColor Cyan

# 6. Publikasi
if ($AutoPublish) {
    Write-Host "`n[5/5] Mempublikasikan ke GitHub Releases..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "publish-release-github.ps1") -Version $Version -Notes $Notes
    exit 0
}

Write-Host "`n[5/5] Publikasi manual:" -ForegroundColor Yellow
Write-Host "   .\scripts\publish-release-github.ps1 -Version $Version -Notes `"...`"" -ForegroundColor Gray
Write-Host "   atau unggah latest.json, $ExeFileName, dan $ExeFileName.sig ke tag v$Version" -ForegroundColor Gray
Start-Process explorer.exe $ReleaseFolder
