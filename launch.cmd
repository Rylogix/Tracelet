@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 scripts\launch.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Install Python 3.11+ from https://python.org/downloads/ and Node.js 22 from https://nodejs.org/.
  ) else (
    python scripts\launch.py
  )
)
pause
