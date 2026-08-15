@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Cannot build the static site.
  goto :failed
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Cannot build the static site.
  goto :failed
)

if not exist "node_modules\vinext\dist\cli.js" (
  echo Project dependencies are missing. Run npm install first.
  goto :failed
)

echo Building the latest source into dist\client...
call npm.cmd run build
if errorlevel 1 goto :failed

if not exist "dist\client\index.html" (
  echo Build finished without dist\client\index.html.
  goto :failed
)

echo.
echo Static page update complete: dist\client
echo Refresh the browser, or restart the local launcher if the old page is still open.
pause
exit /b 0

:failed
echo.
echo Static page update failed. See the error above.
pause
exit /b 1
