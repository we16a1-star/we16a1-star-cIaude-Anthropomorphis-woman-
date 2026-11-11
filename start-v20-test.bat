@echo off
setlocal
rem v2.0 修改版實機測試啟動器（ASCII-only；執行包位於 temp，www 以 junction 指向 v2.0-modifications\app\www）
set "RUN=%TEMP%\opencode\claude-v20-run"
if not exist "%RUN%\electron-dist\electron.exe" (
  echo [v2.0] Electron runtime missing in test package.
  echo Ask the agent to rebuild the test package.
  pause
  exit /b 1
)
if not exist "%RUN%\www\index.html" (
  echo [v2.0] www junction broken. Rebuild the test package.
  pause
  exit /b 1
)
start "" "%RUN%\electron-dist\electron.exe" "%RUN%"
