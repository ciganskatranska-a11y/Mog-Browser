@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
call node scripts\build.js >nul
start "" "node_modules\electron\dist\electron.exe" .
