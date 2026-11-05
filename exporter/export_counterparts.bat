@echo off
rem Makes website\assets\counterparts.json (export_counterparts.py): the old file, the names and the counterparts of the unit pages of beyondallreason.info (about a minute); parameters of the script can be added, e.g.: export_counterparts.bat --no-web
python "%~dp0export_counterparts.py" %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Counterparts exported.) else (echo Export FAILED, see the message above.)
pause
exit /b %RC%
