@echo off
title FitGirl Repack Downloader
cd /d "%~dp0"

echo ===================================================
echo             FITGIRL REPACK DOWNLOADER
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing required dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Starting Downloader Server on http://localhost:3333 ...
start "" http://localhost:3333
node server.js
pause
