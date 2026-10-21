@echo off
rem Caldrevan first-time setup (docs/LAUNCHER.md): npm ci, npm run build, npm run ui:build. Visible output, stops at the first failure.
rem Never touches saves or configuration. Close the game first (a running game can lock files in node_modules).
setlocal
pushd "%~dp0" || goto :nofolder
where node >nul 2>nul || goto :nonode
where npm >nul 2>nul || goto :nonode
echo Caldrevan setup. This installs dependencies and builds the game; it can take a few minutes.
echo.
echo [1/3] npm ci
call npm ci || goto :failed
echo.
echo [2/3] npm run build
call npm run build || goto :failed
echo.
echo [3/3] npm run ui:build
call npm run ui:build || goto :failed
echo.
echo Setup finished. Double-click Caldrevan.cmd to play.
goto :done

:nonode
echo Node.js and npm were not found on this computer.
echo Install Node.js 22 LTS from https://nodejs.org , then double-click setup.cmd again.
goto :done

:nofolder
echo Could not open the Caldrevan folder.
goto :done

:failed
echo.
echo Setup stopped because the step above failed. Read the error above it, fix the cause, then double-click setup.cmd again.

:done
echo.
pause
