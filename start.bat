@echo off
title PEP Delivery Platform - Startup
color 0A
setlocal enabledelayedexpansion

set "APP_DIR=%~dp0"
if "!APP_DIR:~-1!"=="\" set "APP_DIR=!APP_DIR:~0,-1!"

set "PYTHON_CMD=C:\Users\jesti\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "!PYTHON_CMD!" set "PYTHON_CMD=python"

echo.
echo  ================================================
echo   PEP Delivery Platform - Starting All Services
echo  ================================================
echo.

echo  [1/4] Starting Valhalla routing engine...
docker start valhalla_uk >nul 2>&1
if %errorlevel% neq 0 (
    echo  WARNING: Valhalla failed to start. Check Docker Desktop is running.
) else (
    echo  Valhalla starting on http://localhost:8002 (background)
)
echo.

echo  [2/4] Starting Llama AI server (background)...
set "LLAMA_MODEL=C:\Users\jesti\.ollama\models\blobs\sha256-dde5aa3fc5ffc17176b5e8bdc82f587b24b2678c6c66101bf7da77af9f7ccdff"
set "LLAMA_EXE=!APP_DIR!\llama-server\llama-server.exe"
powershell -WindowStyle Hidden -Command "Start-Process '!LLAMA_EXE!' -ArgumentList '-m \"!LLAMA_MODEL!\" --port 8080 --ctx-size 2048 --threads 6 --no-webui -np 1' -WindowStyle Hidden" >nul 2>&1
echo  Llama server starting on http://localhost:8080
echo.

echo  [3/4] Starting Python VRP optimiser (background)...
powershell -WindowStyle Hidden -Command "Start-Process '!PYTHON_CMD!' -ArgumentList '\"!APP_DIR!\python\optimise.py\"' -WorkingDirectory '!APP_DIR!\python' -WindowStyle Hidden" >nul 2>&1
echo  OR-Tools optimiser starting on http://localhost:8000
echo.

echo  [4/4] Starting Node.js app server...
echo  App available at https://localhost:3443
echo  ================================================
echo.

timeout /t 5 /nobreak >nul
start https://localhost:3443

cd /d "!APP_DIR!\server"
node server.js
