@echo off
title PEP Delivery Platform - Installer
color 0B
setlocal enabledelayedexpansion

set "APP_DIR=%~dp0"
if "!APP_DIR:~-1!"=="\" set "APP_DIR=!APP_DIR:~0,-1!"

echo.
echo  ================================================
echo   PEP Delivery Platform - Installer
echo  ================================================
echo.

:: ---- Check prerequisites ----

echo  Checking prerequisites...
echo.

:: Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FAIL] Node.js is not installed.
    echo         Download LTS version from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo  [OK]   Node.js !NODE_VER!

:: Python - try both python and py launcher
set "PYTHON_CMD="
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
) else (
    py --version >nul 2>&1
    if %errorlevel% equ 0 set "PYTHON_CMD=py"
)
if "!PYTHON_CMD!"=="" (
    echo  [FAIL] Python is not installed.
    echo         Download from: https://python.org
    echo         IMPORTANT: Check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('!PYTHON_CMD! --version 2^>nul') do set "PY_VER=%%v"
echo  [OK]   !PY_VER! ^(command: !PYTHON_CMD!^)

:: Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FAIL] Docker Desktop is not installed or not running.
    echo         Download from: https://www.docker.com/products/docker-desktop
    echo         Start Docker Desktop, wait for it to fully load, then re-run this installer.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('docker --version 2^>nul') do set "DOCK_VER=%%v"
echo  [OK]   !DOCK_VER!

echo.
echo  All prerequisites found. Installing...
echo.

:: ---- Step 1: Node.js dependencies ----

echo  [1/4] Installing Node.js server dependencies...
pushd "!APP_DIR!\server"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [FAIL] npm install failed.
    echo         Check your internet connection and try again.
    popd
    pause
    exit /b 1
)
popd
echo  [OK]   Node.js dependencies installed.
echo.

:: ---- Step 2: Python dependencies ----

echo  [2/4] Installing Python dependencies...
!PYTHON_CMD! -m pip install -r "!APP_DIR!\requirements.txt"
if %errorlevel% neq 0 (
    echo.
    echo  [FAIL] pip install failed.
    echo         Try: !PYTHON_CMD! -m pip install --upgrade pip
    echo         Then re-run this installer.
    pause
    exit /b 1
)
echo  [OK]   Python dependencies installed.
echo.

:: ---- Step 3: Valhalla Docker image ----

echo  [3/4] Setting up Valhalla routing engine...
docker inspect valhalla_uk >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK]   Valhalla container already present, skipping import.
) else (
    if exist "!APP_DIR!\valhalla_uk.tar" (
        echo         Loading Valhalla image - this may take 5-10 minutes, please wait...
        docker load -i "!APP_DIR!\valhalla_uk.tar"
        if %errorlevel% neq 0 (
            echo.
            echo  [FAIL] Failed to load Valhalla image.
            echo         Make sure Docker Desktop is running and try again.
            echo         Contact support if the problem persists.
            pause
            exit /b 1
        )
        echo  [OK]   Valhalla routing engine installed.
    ) else (
        echo  [WARN] valhalla_uk.tar not found in the app folder.
        echo         Route optimisation will use OpenRouteService API instead.
        echo         Make sure your ORS_API_KEY is set in server\.env
    )
)
echo.

:: ---- Step 4: Environment configuration ----

echo  [4/4] Configuring environment...
if not exist "!APP_DIR!\server\.env" (
    copy "!APP_DIR!\server\.env.example" "!APP_DIR!\server\.env" >nul
    echo  [OK]   Created server\.env from template.
    echo.
    echo  +--------------------------------------------------+
    echo  ^|  ACTION REQUIRED before starting the app:        ^|
    echo  ^|                                                  ^|
    echo  ^|  Open server\.env and set your ORS_API_KEY.      ^|
    echo  ^|  Get a free key at: openrouteservice.org         ^|
    echo  +--------------------------------------------------+
) else (
    echo  [OK]   server\.env already exists, keeping your existing config.
)
echo.

:: ---- Done ----

echo  ================================================
echo   Installation complete!
echo.
echo   Next steps:
echo   1. Edit server\.env  ^(set your ORS_API_KEY^)
echo   2. Double-click  start.bat  to launch
echo   3. Open browser to  http://localhost:3000
echo  ================================================
echo.
pause
