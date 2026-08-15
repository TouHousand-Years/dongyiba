@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Cannot update the database SHA.
  goto :failed
)

echo Updating the bundled databases and SHA values from db\*.csv...
node.exe scripts\generate_default_catalog.mjs
if errorlevel 1 goto :failed

node.exe scripts\generate_default_catalog.mjs --check
if errorlevel 1 goto :failed

echo.
echo Database SHA update complete.
echo Commit app\default-catalog.generated.ts together with the database changes.
pause
exit /b 0

:failed
echo.
echo Database SHA update failed. See the error above.
pause
exit /b 1
