@echo off
title PEP Delivery Platform - SSL Certificate Setup
color 0E
setlocal enabledelayedexpansion

set "APP_DIR=%~dp0"
if "!APP_DIR:~-1!"=="\" set "APP_DIR=!APP_DIR:~0,-1!"

set "MKCERT=!APP_DIR!\mkcert.exe"
set "CERT_DIR=!APP_DIR!\server\certs"
set "KEY_FILE=!CERT_DIR!\server.key"
set "CERT_FILE=!CERT_DIR!\server.cert"

echo.
echo  ================================================
echo   PEP Delivery Platform - SSL Certificate Setup
echo  ================================================
echo.

:: ---- Step 1: Get mkcert ----

echo  [1/3] Locating mkcert...

if exist "!MKCERT!" (
    echo  [OK]   mkcert.exe already in app folder.
    goto :install_ca
)
where mkcert >nul 2>&1
if %errorlevel% equ 0 (
    set "MKCERT=mkcert"
    echo  [OK]   mkcert found on PATH.
    goto :install_ca
)

echo         Not found. Downloading mkcert...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Invoke-WebRequest -Uri 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe' -OutFile '!MKCERT!' -UseBasicParsing"

if not exist "!MKCERT!" (
    echo  [FAIL] Download failed. Check your internet connection and try again.
    pause
    exit /b 1
)
echo  [OK]   mkcert.exe downloaded.

:: ---- Step 2: Install the local CA ----

:install_ca
echo.
echo  [2/3] Installing local Certificate Authority...
echo         ^(Browsers will trust certs signed by this CA^)

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo         Administrator rights required.
    echo         Please click Yes in the UAC prompt that appears...
    echo.
    powershell -Command "Start-Process cmd -ArgumentList '/c \"!MKCERT!\" -install ^&^& echo. ^&^& echo  [OK] CA installed. ^&^& pause' -Verb RunAs -Wait"
) else (
    "!MKCERT!" -install
    if %errorlevel% neq 0 (
        echo  [FAIL] CA installation failed.
        pause
        exit /b 1
    )
    echo  [OK]   Certificate Authority installed.
)

:: ---- Step 3: Generate the certificate ----

echo.
echo  [3/3] Generating certificate for this machine...

:: Collect all local IPv4 addresses via PowerShell (cleaner than ipconfig parsing)
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command ^
  "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' }).IPAddress -join ' '"`) do set "EXTRA_IPS=%%a"

if not exist "!CERT_DIR!" mkdir "!CERT_DIR!"

echo         Domains: localhost 127.0.0.1 !EXTRA_IPS!
echo.

"!MKCERT!" -key-file "!KEY_FILE!" -cert-file "!CERT_FILE!" localhost 127.0.0.1 !EXTRA_IPS!

if %errorlevel% neq 0 (
    echo.
    echo  [FAIL] Certificate generation failed.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo   Certificate installed successfully!
echo.
echo   Your browser will now show a GREEN padlock
echo   when accessing this app over HTTPS.
echo.
echo   If HTTPS is not enabled yet:
echo   1. Open  server\.env  in Notepad
echo   2. Set   HTTPS_ENABLED=true
echo   3. Run   stop.bat  then  start.bat
echo   4. Open  https://localhost:3443
echo  ================================================
echo.
pause
