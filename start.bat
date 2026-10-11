@echo off
rem ============================================================
rem  Jianting (ChordLab) - desktop window launcher
rem
rem  Opens the app inside a native WebView2 window: no browser
rem  tab, no address bar, no reload key, no devtools.
rem  Training progress lives in %LOCALAPPDATA%\Jianting\WebView2.
rem
rem  Double-click this file, or run:  python app.py
rem  Browser fallback:                start-browser.bat
rem ============================================================
setlocal
cd /d "%~dp0"

rem --- Prefer the windowless interpreter so no console window appears ---
set "PYW="
for /f "delims=" %%I in ('where pythonw 2^>nul') do if not defined PYW set "PYW=%%I"
if not defined PYW (
  for /f "delims=" %%I in ('where pyw 2^>nul') do if not defined PYW set "PYW=%%I"
)
if defined PYW (
  start "" "%PYW%" "%~dp0app.py"
  exit /b 0
)

rem --- Fallback: run with a console so errors stay visible ---
where python >nul 2>nul
if errorlevel 1 (
  echo [Jianting] Python not found. Please install Python 3 first.
  pause
  exit /b 1
)

python -c "import webview" >nul 2>nul
if errorlevel 1 (
  echo [Jianting] Missing dependency: pywebview
  echo            Please run:  python -m pip install pywebview
  pause
  exit /b 1
)

python "%~dp0app.py"
