@echo off
rem Caldrevan: double-click to open the launcher (docs/LAUNCHER.md). Needs Node.js 22 or newer. Never touches saves or configuration.
setlocal
pushd "%~dp0" || goto :nofolder
where node >nul 2>nul || goto :nonode
node "%~dp0scripts\launcher\main.mjs" --detach
if errorlevel 1 goto :failed
exit /b 0

:nonode
echo Node.js was not found on this computer.
echo Install Node.js 22 LTS from https://nodejs.org , then run setup.cmd and double-click Caldrevan.cmd again.
goto :failed

:nofolder
echo Could not open the Caldrevan folder.

:failed
echo.
pause
exit /b 1
