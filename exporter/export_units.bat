@echo off
rem Starts the unit export (export_units.ps1) with its defaults; parameters of the script can be added, e.g.: export_units.bat -Game "Beyond All Reason <version>"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export_units.ps1" %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Export finished.) else (echo Export FAILED, see the message above.)
pause
exit /b %RC%
