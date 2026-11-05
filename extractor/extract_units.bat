@echo off
rem Starts the unit extraction (extract_units.ps1) with its defaults; parameters of the script can be added, e.g.: extract_units.bat -Game "Beyond All Reason <version>"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0extract_units.ps1" %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Extraction finished.) else (echo Extraction FAILED, see the message above.)
pause
exit /b %RC%
