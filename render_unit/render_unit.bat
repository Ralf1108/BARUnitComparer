@echo off
rem Asks for the units and the format, then renders the pictures (render_unit.py) into the folder "out" next to this file.
setlocal enabledelayedexpansion
set "NAMES="
set "FMT="
set "UNITSFILE="
set "QC="
set "QUAL="
set "ARGS="
echo Unit names, separated by blanks (e.g. armllt legnavyscout), or @file with one name per line.
set /p NAMES=Units: 
if "%NAMES%"=="" (echo No unit given. & pause & exit /b 1)
echo.
echo Format: png, jpeg, bmp, avif, webp, several separated by commas, or all (= all five).
set /p FMT=Format [all]: 
if "%FMT%"=="" set "FMT=all"
echo.
echo Quality 0 to 100 per format (higher = bigger file, fewer losses). Defaults: avif=70 webp=85 jpeg=90.
echo Enter = defaults, or e.g.: avif=80 jpeg=95
set /p QUAL=Quality: 
set "KEY="
if defined QUAL for %%t in (%QUAL%) do (
  if defined KEY (set ARGS=!ARGS! --!KEY!-quality %%t& set "KEY=") else (set "KEY=%%t")
)
echo.
echo With several formats the quality of each against the lossless picture can be measured (PSNR, SSIM).
set /p QC=Quality check [Y/n]: 
if /i "%QC%"=="n" set ARGS=!ARGS! --no-quality-check
echo.
echo The Raptors need the unit data of the exporter (units-...json), e.g. exporter\out\units-test-31820-45ea098.json
set /p UNITSFILE=Unit data file [Enter = none]: 
if defined UNITSFILE set ARGS=%ARGS% --units "%UNITSFILE:"=%"
echo.
python "%~dp0render_unit.py" --out "%~dp0out" --format %FMT% %ARGS% %NAMES%
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo Done. The pictures are in %~dp0out) else (echo FAILED, see the message above.)
pause
exit /b %RC%
