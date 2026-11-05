@echo off
rem Asks for the units and the format, then renders the pictures (render_unit.py) into the folder "out" next to this file.
setlocal
set "NAMES="
set "FMT="
set "UNITSFILE="
set "ARGS="
echo Unit names, separated by blanks (e.g. armllt legnavyscout), or @file with one name per line.
set /p NAMES=Units: 
if "%NAMES%"=="" (echo No unit given. & pause & exit /b 1)
echo.
echo Format: png, avif, webp, several separated by commas, or all (= png,avif,webp).
set /p FMT=Format [all]: 
if "%FMT%"=="" set "FMT=all"
if /i "%FMT%"=="all" set "FMT=png,avif,webp"
echo.
echo The Raptors need the unit data of the exporter (units-...json), e.g. exporter\out\units-test-31820-45ea098.json
set /p UNITSFILE=Unit data file [Enter = none]: 
if defined UNITSFILE set ARGS=--units "%UNITSFILE:"=%"
echo.
python "%~dp0render_unit.py" --out "%~dp0out" --format %FMT% %ARGS% %NAMES%
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Done. The pictures are in %~dp0out) else (echo FAILED, see the message above.)
pause
exit /b %RC%
