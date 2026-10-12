@echo off
setlocal enabledelayedexpansion

title ClassCast Server

:: Move to script directory dynamically
cd /d "%~dp0"

echo =========================================
echo   Starting ClassCast Platform
echo =========================================

:: 1. Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js ^(version 20 or newer^) from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    pause
    exit /b 1
)

:: 3. Check dependencies
if not exist "node_modules\" (
    echo [INFO] First-time setup: Installing dependencies...
    call npm install
)

:: 4. Check build outputs
if not exist "server\dist\index.js" (
    echo [INFO] Building ClassCast packages...
    call npm run build
)

:: 5. Open browser once server is responsive
start "" cmd /c "timeout /t 2 >nul && echo Opening ClassCast in your browser... && start http://localhost:3000"

:: 6. Run the server in foreground
call npm run start

pause
