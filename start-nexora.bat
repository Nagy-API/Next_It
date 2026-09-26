@echo off
title NEXORA Ops
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download the LTS version from https://nodejs.org , install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing NEXORA Ops for the first time. This takes a few minutes...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run local
pause
