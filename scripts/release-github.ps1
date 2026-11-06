# ==============================================================================
# Hovera - Skrip Otomasi Rilis & Pembaruan GitHub Releases (Tauri v2)
# ==============================================================================
# Penggunaan:
#   .\scripts\release-github.ps1 -Version "1.0.1" -Notes "Deskripsi pembaruan..."
# ==============================================================================

param (
    [Parameter(Mandatory = $true, HelpMessage = "Nomor versi rilis baru (contoh: 1.0.1)")]
    [string]$Version,

    [Parameter(Mandatory = $false, HelpMessage = "Catatan pembaruan / changelog")]
    [string]$Notes = "Pembaruan rutin stabilitas dan peningkatan fitur.",

    [switch]$SkipBuild = $false,

    [switch]$AutoPublish = $false
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$KeyPath = Join-Path $RootDir ".tauri\hovera.key"
$PackageJsonPath = Join-Path $RootDir "package.json"
$TauriConfPath = Join-Path $RootDir "src-tauri\tauri.conf.json"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  HOVERA RELEASE AUTOMATION ENGINE (v$Version)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Validasi Kunci Ed25519
if (-not (Test-Path $KeyPath)) {
    Write-Host "[ERROR] Kunci privat penandatanganan tidak ditemukan di: $KeyPath" -ForegroundColor Red
    Write-Host "Silakan jalankan .\scripts\generate-keys.ps1 terlebih dahulu." -ForegroundColor Yellow
    exit 1
}

$privateKey = (Get-Content $KeyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY = $privateKey
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

# 2. Sinkronisasi Versi di package.json dan tauri.conf.json
Write-Host "`n[1/5] Memperbarui nomor versi menjadi $Version..." -ForegroundColor Yellow

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Update package.json
$pkgJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
$pkgJson.version = $Version
[System.IO.File]::WriteAllText($PackageJsonPath, ($pkgJson | ConvertTo-Json -Depth 10), $Utf8NoBom)

# Update tauri.conf.json
$tauriJson = Get-Content $TauriConfPath -Raw | ConvertFrom-Json
$tauriJson.version = $Version
[System.IO.File]::WriteAllText($TauriConfPath, ($tauriJson | ConvertTo-Json -Depth 10), $Utf8NoBom)

# Update Cargo.toml
$CargoTomlPath = Join-Path $RootDir "src-tauri\Cargo.toml"
if (Test-Path $CargoTomlPath) {
    $cargoContent = Get-Content $CargoTomlPath -Raw
    $cargoContent = [regex]::Replace($cargoContent, '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`"")
    [System.IO.File]::WriteAllText($CargoTomlPath, $cargoContent, $Utf8NoBom)
}

Write-Host "[OK] package.json, tauri.conf.json & Cargo.toml disinkronkan ke v$Version" -ForegroundColor Green

# Commit pembaruan versi ke git
Push-Location $RootDir
try {
    git add $PackageJsonPath $TauriConfPath $CargoTomlPath
    git commit -m "chore(release): bump version to v$Version"
    git push origin main
} catch {
    Write-Host "[INFO] Tidak ada perubahan git baru untuk di-commit." -ForegroundColor DarkGray
} finally {
    Pop-Location
}

# 3. Kompilasi Frontend & Bundle Tauri
if (-not $SkipBuild) {
    Write-Host "`n[2/5] Membangun frontend dan mengompilasi installer Windows (NSIS)..." -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Gagal build frontend." }

        npx @tauri-apps/cli build --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw "Gagal kompilasi bundle NSIS Tauri." }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/5] Melewati tahap build (--SkipBuild aktif)..." -ForegroundColor DarkGray
}

# 4. Pencarian & Penandatanganan Berkas Output Build
Write-Host "`n[3/5] Memeriksa berkas installer dan tanda tangan keamanan..." -ForegroundColor Yellow
$NsisDir = Join-Path $RootDir "src-tauri\target\release\bundle\nsis"
$InstallerExe = Join-Path $NsisDir "Hovera_${Version}_x64-setup.exe"
$ExeSigFile = Join-Path $NsisDir "Hovera_${Version}_x64-setup.exe.sig"
$UpdateZip = Join-Path $NsisDir "Hovera_${Version}_x64-setup.nsis.zip"
$ZipSigFile = Join-Path $NsisDir "Hovera_${Version}_x64-setup.nsis.zip.sig"

if (-not (Test-Path $InstallerExe)) {
    Write-Host "[ERROR] Berkas installer $InstallerExe tidak ditemukan di $NsisDir" -ForegroundColor Red
    exit 1
}

# Tandatangani berkas installer exe langsung (rekomendasi standar Tauri v2)
Write-Host "[PROSES] Menandatangani berkas installer exe dengan kunci privat Ed25519..." -ForegroundColor Cyan
Remove-Item env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
npx @tauri-apps/cli signer sign $InstallerExe -f $KeyPath --app-version $Version

if (-not (Test-Path $ExeSigFile)) {
    Write-Host "[ERROR] Berkas tanda tangan digital exe (.sig) tidak berhasil dibuat." -ForegroundColor Red
    exit 1
}

$exeSignature = (Get-Content $ExeSigFile -Raw).Trim()

# Buat arsip zip uncompressed (Store) murni tanpa kompresi deflated untuk kompatibilitas
Write-Host "[PROSES] Membuat paket arsip murni uncompressed (Store)..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $UpdateZip) { Remove-Item $UpdateZip -Force }
$archive = [System.IO.Compression.ZipFile]::Open($UpdateZip, [System.IO.Compression.ZipArchiveMode]::Create)
$exeLeafName = Split-Path $InstallerExe -Leaf
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $InstallerExe, $exeLeafName, [System.IO.Compression.CompressionLevel]::NoCompression)
$archive.Dispose()

# Tandatangani juga paket zip fallback
npx @tauri-apps/cli signer sign $UpdateZip -f $KeyPath --app-version $Version

# 5. Persiapan Direktori Rilis & Berkas latest.json
Write-Host "`n[4/5] Menyiapkan paket rilis dan metadata latest.json..." -ForegroundColor Yellow
$ReleaseFolder = Join-Path $RootDir "releases\v$Version"
if (-not (Test-Path $ReleaseFolder)) {
    New-Item -ItemType Directory -Force -Path $ReleaseFolder | Out-Null
}

$IsoDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$ExeFileName = [System.IO.Path]::GetFileName($InstallerExe)
$DownloadUrl = "https://github.com/FikkoMuharavid/hovera/releases/download/v$Version/$ExeFileName"

$latestJsonContent = @{
    version = $Version
    notes = $Notes
    pub_date = $IsoDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $exeSignature
            url = $DownloadUrl
        }
    }
}

$LatestJsonPath = Join-Path $ReleaseFolder "latest.json"
[System.IO.File]::WriteAllText($LatestJsonPath, ($latestJsonContent | ConvertTo-Json -Depth 6), $Utf8NoBom)

# Salin berkas ke folder releases
Copy-Item -Path $InstallerExe -Destination (Join-Path $ReleaseFolder $ExeFileName) -Force
Copy-Item -Path $ExeSigFile -Destination (Join-Path $ReleaseFolder (Split-Path $ExeSigFile -Leaf)) -Force
if (Test-Path $UpdateZip) {
    Copy-Item -Path $UpdateZip -Destination (Join-Path $ReleaseFolder (Split-Path $UpdateZip -Leaf)) -Force
}
if (Test-Path $ZipSigFile) {
    Copy-Item -Path $ZipSigFile -Destination (Join-Path $ReleaseFolder (Split-Path $ZipSigFile -Leaf)) -Force
}

Write-Host "[OK] Paket rilis siap di: $ReleaseFolder" -ForegroundColor Green
Write-Host "     - latest.json (Direct EXE URL & Signature)" -ForegroundColor Cyan
Write-Host "     - $ExeFileName" -ForegroundColor Cyan
Write-Host "     - $(Split-Path $ExeSigFile -Leaf)" -ForegroundColor Cyan
Write-Host "     - $(Split-Path $UpdateZip -Leaf) (Uncompressed Store)" -ForegroundColor Cyan

# 6. Informasi & Panduan Publikasi ke GitHub Releases
Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  LANGKAH TERAKHIR: UNGGAH KE GITHUB RELEASES" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Tag Rilis    : v$Version" -ForegroundColor White
Write-Host "Catatan      : $Notes" -ForegroundColor White
Write-Host "Berkas Paket : $ReleaseFolder" -ForegroundColor Yellow

if ($AutoPublish) {
    Write-Host "`n[5/5] Mempublikasikan ke GitHub Releases secara otomatis via API..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "publish-release-github.ps1") -Version $Version -Notes $Notes
    Write-Host "`n[SUKSES] Rilis v$Version berhasil dipublikasikan ke GitHub!" -ForegroundColor Green
    exit 0
}

$ghInstalled = Get-Command gh -ErrorAction SilentlyContinue

if ($ghInstalled) {
    Write-Host "`nGitHub CLI terdeteksi. Ingin langsung publikasikan sekarang via 'gh'? (Y/N)" -ForegroundColor Cyan
    $answer = Read-Host
    if ($answer -eq 'Y' -or $answer -eq 'y') {
        $filesToUpload = @($LatestJsonPath, (Join-Path $ReleaseFolder $ZipFileName))
        if (Test-Path (Join-Path $ReleaseFolder (Split-Path $InstallerExe -Leaf))) {
            $filesToUpload += (Join-Path $ReleaseFolder (Split-Path $InstallerExe -Leaf))
        }
        gh release create "v$Version" $filesToUpload --title "Hovera v$Version" --notes "$Notes"
        Write-Host "`n[SUKSES] Rilis v$Version berhasil dipublikasikan ke GitHub!" -ForegroundColor Green
        exit 0
    }
}

# Buka folder rilis dan halaman GitHub Releases di browser
Write-Host "`n[PANDUAN MANUAL CEPAT]:" -ForegroundColor Yellow
Write-Host "1. Git tag & commit:" -ForegroundColor White
Write-Host "   git commit -am 'release: v$Version'" -ForegroundColor Gray
Write-Host "   git tag v$Version" -ForegroundColor Gray
Write-Host "   git push origin main --tags" -ForegroundColor Gray
Write-Host "`n2. Seret (drag-and-drop) 2 berkas dari folder rilis ke halaman GitHub Releases:" -ForegroundColor White
Write-Host "   - latest.json" -ForegroundColor Cyan
Write-Host "   - $ZipFileName" -ForegroundColor Cyan

Start-Process explorer.exe $ReleaseFolder
Start-Process "https://github.com/FikkoMuharavid/hovera/releases/new?tag=v$Version&title=Hovera+v$Version"
