@echo off
rem ============================================================
rem  Jianting (ChordLab) - browser fallback launcher
rem
rem  Starts the local HTTP server and opens the app in the
rem  default browser instead of a native window. Kept for
rem  parity: both entries serve the exact same files.
rem
rem  A local server is required either way, because browsers
rem  block sample fetches on the file:// protocol.
rem ============================================================
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ChordLab] Python not found. Please install Python 3 first.
  pause
  exit /b 1
)

set PORT=8766
echo [ChordLab] Browser mode: http://127.0.0.1:%PORT%/index.html
start "" cmd /c "timeout /t 1 /nobreak >nul & start "" http://127.0.0.1:%PORT%/index.html"
python server.py %PORT%

endlocal
