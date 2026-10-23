@echo off
title Dynamic Island Windows
cd /d "%~dp0"
echo Membersihkan instance lama...
taskkill /F /IM electron.exe >nul 2>&1
echo Memulai Dynamic Island...
start "" "node_modules\electron\dist\electron.exe" .
exit
