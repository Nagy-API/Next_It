@echo off
setlocal
title NEXORA Ops
cd /d "%~dp0"

echo.
echo  ==============================================
echo    NEXORA Ops
echo    Keep this window open while you use it.
echo  ==============================================
echo.

rem ---------------------------------------------------------------
rem  1) Node.js: use the one on this computer if it is new enough,
rem     otherwise download a private copy into this folder (.node).
rem ---------------------------------------------------------------
set "NODE_VER=v22.22.2"
set "NODE_DIR=%~dp0.node\node-%NODE_VER%-win-x64"
set "NODE_SHA=7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c"

if exist "%NODE_DIR%\node.exe" goto use_private_node

where node >nul 2>nul
if errorlevel 1 goto get_node
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" >nul 2>nul
if errorlevel 1 goto get_node
goto have_node

:get_node
echo  [1/3] Downloading Node.js (about 30 MB, first time only)...
if not exist "%~dp0.node" mkdir "%~dp0.node"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$zip=Join-Path '%~dp0.node' 'node.zip';" ^
  "Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip' -OutFile $zip;" ^
  "if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne '%NODE_SHA%') { Remove-Item $zip; Write-Host 'Download was corrupted - please try again.'; exit 1 };" ^
  "Expand-Archive -Path $zip -DestinationPath '%~dp0.node' -Force; Remove-Item $zip"
if errorlevel 1 goto fail
if not exist "%NODE_DIR%\node.exe" goto fail

:use_private_node
set "PATH=%NODE_DIR%;%PATH%"

:have_node
for /f "delims=" %%v in ('node -v') do echo  Using Node.js %%v

rem ---------------------------------------------------------------
rem  2) Install the app's packages (first time only).
rem ---------------------------------------------------------------
if exist "node_modules\.nexora-installed" goto run_app
echo.
echo  [2/3] Installing NEXORA Ops (first time only, a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo ok> "node_modules\.nexora-installed"

rem ---------------------------------------------------------------
rem  3) Prepare the database, build once, start, open the browser.
rem ---------------------------------------------------------------
:run_app
echo.
echo  [3/3] Starting... the browser opens by itself at http://localhost:3000
echo        Sign in:  shahenda  /  Nexora@2026
echo.
call npm run local
goto end

:fail
echo.
echo  Something went wrong (see the messages above).
echo  Check the internet connection and double-click start-nexora.bat again.

:end
echo.
pause
