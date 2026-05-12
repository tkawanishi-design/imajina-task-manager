@echo off
cd /d "%~dp0"
echo imajina Task Manager を起動します...
echo http://localhost:3001 をブラウザで開いてください
start http://localhost:3001
node server.js
pause
