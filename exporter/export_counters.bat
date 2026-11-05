@echo off
rem Fetches the counter charts of Armada and Cortex from beyondallreason.info and writes website\assets\counters.json (export_counters.py); parameters of the script can be added, e.g.: export_counters.bat --out counters.json
python "%~dp0export_counters.py" %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Counters exported.) else (echo Export FAILED, see the message above.)
pause
exit /b %RC%
