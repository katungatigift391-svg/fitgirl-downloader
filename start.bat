@echo off
title FitGirl Repack Downloader
cd /d "%~dp0"

echo ===================================================
echo             FITGIRL REPACK DOWNLOADER
echo ===================================================
echo.

rem Prefer bundled Node runtime in bin\ if present
if exist "%~dp0bin\node.exe" (
    set "PATH=%~dp0bin;%PATH%"
    set "NODE_CMD=%~dp0bin\node.exe"
    set "NPM_CMD=%~dp0bin\npm.cmd"
) else (
    set "NODE_CMD=node"
    set "NPM_CMD=npm"
)

"%NODE_CMD%" -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in bin\ or system PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing required dependencies...
    call "%NPM_CMD%" install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Starting Downloader Server on http://localhost:3333 ...
start "" http://localhost:3333
"%NODE_CMD%" server.js
pause

