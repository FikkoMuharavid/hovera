# ==============================================================================
# Hovera - Helper Publikasi GitHub Releases via GitHub REST API
# ==============================================================================
param (
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Notes = "Pembaruan v1.0.1: Kalibrasi sinkronisasi lirik Spotify ultra-presisi, optimasi akselerasi GPU, dan sistem auto-update otomatis."
)

$ErrorActionPreference = "Stop"

# 1. Token GitHub. Urutan: $env:GITHUB_TOKEN (disarankan: fine-grained token khusus
#    repo ini dengan izin "Contents: Read and write") -> `gh auth token` -> Git Credential Manager.
$token = $env:GITHUB_TOKEN
if (-not $token -and (Get-Command gh -ErrorAction SilentlyContinue)) {
    $token = (gh auth token 2>$null)
}
if ($token) { $token = $token.Trim() }

if (-not $token) {
Write-Host "[PERINGATAN] Memakai token dari Git Credential Manager (scope mungkin terlalu luas)." -ForegroundColor Yellow
$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = "git"
$processInfo.Arguments = "credential fill"
$processInfo.RedirectStandardInput = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true

$process = [System.Diagnostics.Process]::Start($processInfo)
$process.StandardInput.WriteLine("protocol=https")
$process.StandardInput.WriteLine("host=github.com")
$process.StandardInput.WriteLine("")
$process.StandardInput.Close()

$output = $process.StandardOutput.ReadToEnd()
$process.WaitForExit()

$passwordLine = ($output -split "`r?`n") | Where-Object { $_ -like "password=*" }
if (-not $passwordLine) {
    throw "Gagal mendapatkan token autentikasi GitHub dari git credentials."
}
$token = $passwordLine.Substring(9).Trim()
}

$repo = "FikkoMuharavid/hovera"
$baseApi = "https://api.github.com/repos/$repo"
$headers = @{
    "Authorization" = "token $token"
    "User-Agent" = "Hovera-Release"
    "Accept" = "application/vnd.github.v3+json"
}

Write-Host "Memeriksa rilis untuk tag v$Version di GitHub..." -ForegroundColor Cyan

# Cek apakah rilis sudah ada
$existingRelease = $null
try {
    $existingRelease = Invoke-RestMethod -Uri "$baseApi/releases/tags/v$Version" -Headers $headers -Method Get -UseBasicParsing
    Write-Host "Rilis v$Version sudah ditemukan (ID: $($existingRelease.id)). Akan diperbarui..." -ForegroundColor Yellow
} catch {
    Write-Host "Rilis v$Version belum ada. Membuat rilis baru..." -ForegroundColor Cyan
}

if (-not $existingRelease) {
    $bodyJson = @{
        tag_name = "v$Version"
        name = "Hovera v$Version"
        body = $Notes
        draft = $false
        prerelease = $false
    } | ConvertTo-Json

    $existingRelease = Invoke-RestMethod -Uri "$baseApi/releases" -Headers $headers -Method Post -Body $bodyJson -ContentType "application/json" -UseBasicParsing
    Write-Host "Rilis v$Version berhasil dibuat (ID: $($existingRelease.id))!" -ForegroundColor Green
}

$releaseId = $existingRelease.id
$uploadBase = "https://uploads.github.com/repos/$repo/releases/$releaseId/assets"

# Berkas yang akan diunggah
$releaseDir = Join-Path (Resolve-Path "$PSScriptRoot\..") "releases\v$Version"
$files = @(
    "latest.json",
    "Hovera_${Version}_x64-setup.exe",
    "Hovera_${Version}_x64-setup.exe.sig",
    "Hovera_${Version}_x64-setup.nsis.zip",
    "Hovera_${Version}_x64-setup.nsis.zip.sig"
)

# Ambil daftar aset yang sudah ada jika ada rilis lama
$existingAssets = @{}
try {
    $assets = Invoke-RestMethod -Uri "$baseApi/releases/$releaseId/assets" -Headers $headers -Method Get -UseBasicParsing
    foreach ($a in $assets) {
        $existingAssets[$a.name] = $a.id
    }
} catch {}

foreach ($f in $files) {
    $filePath = Join-Path $releaseDir $f
    if (-not (Test-Path $filePath)) {
        Write-Host "Berkas $filePath tidak ditemukan, melewati..." -ForegroundColor DarkGray
        continue
    }

    # Hapus aset lama jika ada nama yang sama
    if ($existingAssets.ContainsKey($f)) {
        $assetId = $existingAssets[$f]
        Write-Host "Menghapus aset lama: $f (ID: $assetId)..." -ForegroundColor Yellow
        Invoke-RestMethod -Uri "$baseApi/releases/assets/$assetId" -Headers $headers -Method Delete -UseBasicParsing | Out-Null
    }

    Write-Host "Mengunggah $f ($([math]::Round((Get-Item $filePath).Length / 1MB, 2)) MB)..." -ForegroundColor Cyan
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    
    $contentType = "application/octet-stream"
    if ($f -match '\.json$') { $contentType = "application/json" }
    elseif ($f -match '\.zip$') { $contentType = "application/zip" }

    $uploadUrl = "$uploadBase`?name=$f"
    $uploadHeaders = @{
        "Authorization" = "token $token"
        "User-Agent" = "Hovera-Release"
        "Content-Type" = $contentType
    }

    Invoke-RestMethod -Uri $uploadUrl -Headers $uploadHeaders -Method Post -Body $bytes -UseBasicParsing | Out-Null
    Write-Host "[OK] Berhasil mengunggah $f" -ForegroundColor Green
}

# Sinkronisasi tag git
try {
    git tag "v$Version" 2>$null
    git push origin "v$Version" 2>$null
} catch {}

Write-Host "`nSemua berkas rilis v$Version berhasil dipublikasikan ke GitHub Releases!" -ForegroundColor Green
Write-Host "URL Rilis: https://github.com/$repo/releases/tag/v$Version" -ForegroundColor Yellow
Write-Host "URL latest.json: https://github.com/$repo/releases/latest/download/latest.json" -ForegroundColor Yellow
