@echo off
setlocal

set /p VERSION=Enter version number (e.g. 1.0.1):
if "%VERSION%"=="" (echo Version is required. & exit /b 1)

git tag v%VERSION%
if errorlevel 1 (echo Tagging failed. & exit /b 1)

git push origin v%VERSION%
if errorlevel 1 (echo Push failed. & exit /b 1)

echo.
echo Tag v%VERSION% pushed.
echo GitHub Actions is now building and publishing the image.
echo Check progress at: https://github.com/JestinGe0/DeliveryApp/actions
echo.
pause
