@echo off
rem Looks for new game versions of Beyond All Reason on the BAR package server, downloads each one, exports it and stores only what changed against the version before, then refreshes the counterparts and counters (exporter\update_versions.py). --list: only show them.
python "%~dp0exporter\update_versions.py" %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Finished.) else (echo Finished with errors, see above.)
pause
exit /b %RC%
