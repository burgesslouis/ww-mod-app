@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
set "exitCode=%ERRORLEVEL%"

if not "%exitCode%"=="0" (
  echo.
  echo Publish failed with exit code %exitCode%.
)

exit /b %exitCode%
