@echo off
title PEP Delivery Platform - Shutdown
color 0C

echo.
echo  ================================================
echo   PEP Delivery Platform - Stopping All Services
echo  ================================================
echo.

echo  Stopping Valhalla routing engine...
docker stop valhalla_uk
echo  Valhalla stopped.
echo.

echo  Stopping Node.js and Python processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
echo  Node.js and Python stopped.
echo.

echo  ================================================
echo   All services stopped. Safe to shut down.
echo  ================================================
echo.
pause
