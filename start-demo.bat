@echo off
setlocal
cd /d "%~dp0"

echo ========================================================================
echo                 Starting Workaholic Local Demo Launcher
echo ========================================================================
node scripts\start-demo.js %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Demo launcher encountered an error (exit code %ERRORLEVEL%).
  pause
)
endlocal
