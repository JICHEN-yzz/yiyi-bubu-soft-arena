@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "http://localhost:4173"
node server.mjs
if errorlevel 1 (
  echo.
  echo 游戏服务启动失败，请检查本机是否已安装 Node.js。
  pause
)
