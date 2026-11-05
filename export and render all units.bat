@echo off
rem Exports the unit data of the installed Beyond All Reason and renders a picture of every unit (AVIF) into the folder "out" of this repository.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export_and_render_all_units.ps1" %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Finished.) else if %RC%==2 (echo Cancelled.) else (echo Finished with errors, see above.)
pause
exit /b %RC%
