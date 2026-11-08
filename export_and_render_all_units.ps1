# Everything for one game version, every step only if its result is missing (SPECIFICATION.md, section 6). Started by "export and render all units.bat".
#   1. export       website\assets\<version>\data\units-<version>.json           (exporter\export_units.ps1, starts the game)
#   2. reduce       website\assets\<version>\data\units-<version>.reduced.json.gz   (exporter\reduce_units.py) of the base version (the first one exported);
#                   every later version gets units-<version>.diff.json.gz: only what changed against the version before it (nothing changed: no file, the
#                   version is only named in versions.json as unchanged, and the script ends here)
#   3. pictures     website\assets\<version>\images\<unit>.<format>              (render_unit\render_unit.py), only for the units without a picture;
#                   of a later version only the units whose picture changed (reduce_units.py --pictures)
# So an aborted run can be started again and goes on. The output of the scripts is not shown, only the progress.
# Parameters: -Faction <all | arm | cor | leg | scv | rap, several separated by commas> renders only the units of these factions (the export is always complete);
# -Format <avif | webp | jpeg | png | bmp | all (= all five), several separated by commas> (default avif); without the parameters the script asks. -Game "Beyond All Reason <version>": another installed version (default: the installed one). -Force: all three steps again, even if the results are there. For tests: -Limit <n> renders only the first n units; -Yes skips the questions at the start.
param([string]$Faction = '', [string]$Format = '', [string]$Game = '', [int]$Limit = 0, [switch]$Yes, [switch]$Force, [string]$Out = '')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'shared\BarCommon.ps1')   # Get-Faction, Get-VersionName, Get-PictureExtension (the same rules as the Python tools)
$out = if ($Out) { $Out } else { Join-Path $root 'website\assets' }   # -Out: another folder for the pictures (for tests: never the real website\assets\)
$chunk = 80   # units per call of render_unit.py: every call starts its browsers (--jobs of them, 4 by default) once; the counter is updated after each call
$errors = New-Object System.Collections.Generic.List[string]
$unsupported = New-Object System.Collections.Generic.List[string]   # units whose model format is not supported (render_unit.py: S3O, Collada): no picture, not an error

function Fail($text) {
    Write-Host ''
    Write-Host "ERROR: $text" -ForegroundColor Red
    exit 1
}
function Clock($span) { '{0:00}:{1:00}:{2:00}' -f [int][math]::Floor($span.TotalHours), $span.Minutes, $span.Seconds }

$known = [ordered]@{ arm = 'Armada'; cor = 'Cortex'; leg = 'Legion'; scv = 'Scavengers'; rap = 'Raptors' }
if (-not $Faction -and -not $Yes) {
    Write-Host 'Which units are to be rendered?  all, or: arm (Armada), cor (Cortex), leg (Legion), scv (Scavengers), rap (Raptors); several separated by commas, e.g. arm,cor'
    $Faction = Read-Host 'Factions [all]'
}
$wanted = @($Faction -split '[,; ]+' | Where-Object { $_ } | ForEach-Object { $_.ToLower() })
if ($wanted.Count -eq 0 -or $wanted -contains 'all') { $wanted = @() }
foreach ($w in $wanted) { if (-not $known.Contains($w)) { Fail "Unknown faction '$w' (all, arm, cor, leg, scv, rap)." } }
$what = if ($wanted.Count) { 'the units of ' + (($wanted | ForEach-Object { $known[$_] }) -join ', ') } else { 'every unit (about 1700)' }

$knownFormats = @('avif', 'webp', 'jpeg', 'png', 'bmp')
if (-not $Format -and -not $Yes) {
    Write-Host ''
    Write-Host 'Which picture format?  avif, webp, jpeg, png, bmp, or all (= all five); several separated by commas.'
    $Format = Read-Host 'Format [avif]'
}
$formats = @($Format -split '[,; ]+' | Where-Object { $_ } | ForEach-Object { $_.ToLower().Replace('jpg', 'jpeg') })
if ($formats.Count -eq 0) { $formats = @('avif') }
if ($formats -contains 'all') { $formats = $knownFormats }
foreach ($f in $formats) { if ($knownFormats -notcontains $f) { Fail "Unknown format '$f' (avif, webp, jpeg, png, bmp, all)." } }
$formatText = ($formats -join ', ').ToUpper()

# which game version, and what is there already (without starting the game)
$exporter = Join-Path $root 'exporter\export_units.ps1'
$printed = if ($Game) { & powershell -NoProfile -ExecutionPolicy Bypass -File $exporter -PrintGame -Game $Game } else { & powershell -NoProfile -ExecutionPolicy Bypass -File $exporter -PrintGame }
if ($LASTEXITCODE -ne 0 -or -not $printed) { Fail 'The game version could not be found (see above).' }
$gameName = @($printed)[-1].Trim()
$version = Get-VersionName $gameName   # the same rule as the file name of the export
$dataDir = Join-Path (Join-Path $out $version) 'data'
$versionDir = Join-Path (Join-Path $out $version) 'images'   # the pictures
$unitsFile = Join-Path $dataDir "units-$version.json"
$reducedFile = Join-Path $dataDir "units-$version.reduced.json.gz"
$diffFile = Join-Path $dataDir "units-$version.diff.json.gz"   # a later version: only what changed against the version before
function Test-Reduced { (Test-Path $reducedFile) -or (Test-Path $diffFile) }
function Test-Unchanged {   # compared with the version before, nothing changed (versions.json: unchanged)
    $listing = Join-Path $out 'versions.json'
    (Test-Path $listing) -and (@((Get-Content $listing -Raw | ConvertFrom-Json).unchanged) -contains $version)
}
function Reduced-Name { Split-Path $(if (Test-Path $reducedFile) { $reducedFile } else { $diffFile }) -Leaf }
$needExport = $Force -or -not (Test-Path $unitsFile)
$state = { param($needed, $text) if ($needed) { $text } else { 'there already, skipped' } }

Write-Host ''
Write-Host "Game version $version" -ForegroundColor Cyan
Write-Host "  1. Export the unit data:  $(& $state $needExport 'the game is started once in a small window (about 30 seconds)')"
Write-Host "  2. Reduced data of the website:  $(& $state ($needExport -or -not ((Test-Reduced) -or (Test-Unchanged))) 'will be made')"
Write-Host "  3. Pictures of $what as $formatText in the default quality and size, to $versionDir"
Write-Host '     Only the missing ones (roughly 0.1 to 0.5 seconds per picture).'
Write-Host ''
if (-not $Yes) {
    $answer = Read-Host 'Start? [Enter = yes, n = cancel]'
    if ($answer -match '^\s*(n|no|c|cancel)') { exit 2 }
}

$t0 = Get-Date

# ---------------------------------------------------------------- 1. the export
Write-Host '== 1/3  Unit data from Beyond All Reason ==' -ForegroundColor Cyan
if (-not $needExport) { Write-Host "   $(Split-Path $unitsFile -Leaf) is there already, the export is skipped" -ForegroundColor Green } else {
$log = Join-Path $env:TEMP 'export_units_log.txt'
$errLog = Join-Path $env:TEMP 'export_units_errors.txt'
$p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$root\exporter\export_units.ps1`"", '-Out', "`"$out`"", '-Game', "`"$gameName`"") `
    -RedirectStandardOutput $log -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
$null = $p.Handle   # keeps the handle, otherwise the exit code of the process is empty afterwards (Windows PowerShell 5.1)
$seen = @{}
while (-not $p.HasExited) {
    Start-Sleep -Milliseconds 700
    foreach ($line in @(Get-Content $log -ErrorAction SilentlyContinue)) {   # only the steps of the script, not its whole output
        if ($line -match '^\[\d/4\]' -and -not $seen.ContainsKey($line)) { $seen[$line] = 1; Write-Host "   $line" }
    }
}
foreach ($line in @(Get-Content $log -ErrorAction SilentlyContinue)) {
    if ($line -match '^\[\d/4\]' -and -not $seen.ContainsKey($line)) { $seen[$line] = 1; Write-Host "   $line" }
}
$p.WaitForExit()   # without it the exit code of a process started without -Wait can be empty
if ($p.ExitCode -ne 0) {
    $why = (@(Get-Content $errLog -ErrorAction SilentlyContinue) + @(Get-Content $log -Tail 5 -ErrorAction SilentlyContinue)) -join "`n"
    Fail "The export failed:`n$why`n(logs: $log, $errLog)"
}
if (-not (Test-Path $unitsFile)) { Fail "The export ran, but $unitsFile was not written (log: $log)." }
Write-Host ("   Unit data collected: {0} ({1:N1} MB), after {2}" -f (Split-Path $unitsFile -Leaf), ((Get-Item $unitsFile).Length / 1MB), (Clock ((Get-Date) - $t0))) -ForegroundColor Green
}
$units = Get-Item $unitsFile
New-Item -ItemType Directory $versionDir -Force | Out-Null

# ---------------------------------------------------------------- 2. the reduced data of the website
Write-Host ''
Write-Host '== 2/3  Reduced data of the website ==' -ForegroundColor Cyan
if ((Test-Reduced) -or (Test-Unchanged)) {
    if (Test-Reduced) { Write-Host "   $(Reduced-Name) $(if ($needExport) { 'made with the export' } else { 'is there already, skipped' })" -ForegroundColor Green }
} else {
    $reduceLog = Join-Path $env:TEMP 'reduce_units_log.txt'
    try { & python (Join-Path $root 'exporter\reduce_units.py') --units $unitsFile --out $out *> $reduceLog } catch { }
    if (Test-Reduced) { Write-Host "   $(Reduced-Name) made" -ForegroundColor Green }
    elseif (Test-Unchanged) { }
    else { Write-Host "   The reduced data could not be made, see $reduceLog. The pictures are made all the same." -ForegroundColor Yellow }
}

if ((Test-Unchanged) -and -not (Test-Reduced)) {
    Write-Host ''
    Write-Host "Nothing of $version changed against the version before: no diff file, no pictures; the version is not shown on the page." -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------- 3. the pictures
$names = New-Object System.Collections.Generic.List[string]
$pictureUnits = @()
if (Test-Reduced) { $pictureUnits = @(& python (Join-Path $root 'exporter\reduce_units.py') --pictures (Join-Path $out $version)) }   # the base: all units; a later version: only the ones whose picture differs
else { foreach ($line in [IO.File]::ReadLines($units.FullName)) { if ($line -match '^"([^"]+)":\{"game"') { $pictureUnits += $Matches[1] } } }   # without the reduced data: all units (one unit per line, SPECIFICATION.md, section 3.1)
foreach ($u in $pictureUnits) { if ($u -and (-not $wanted.Count -or $wanted -contains (Get-Faction $u))) { $names.Add($u) } }
if ($Limit -gt 0 -and $names.Count -gt $Limit) { $names.RemoveRange($Limit, $names.Count - $Limit) }
if ($names.Count -eq 0 -and (Test-Path $diffFile)) { Write-Host ''; Write-Host "No picture of $version changed against the version before: nothing to render." -ForegroundColor Green; exit 0 }
if ($names.Count -eq 0) { Fail "No units found in $($units.FullName) for: $what." }
Remove-Item (Join-Path $versionDir 'render_errors.txt') -ErrorAction SilentlyContinue   # the list of the last run (only this one file of the folder; it is written again if there are errors)

# a picture that is there is left alone: its files are written complete or not at all (render_unit.py), and every game version has its own folder
function Files-Of($u) { @($formats | ForEach-Object { Join-Path $versionDir ("$u." + (Get-PictureExtension $_)) }) }
$todo = New-Object System.Collections.Generic.List[string]; $skipped = 0; $bytes = 0
foreach ($u in $names) {
    $files = Files-Of $u
    if (-not $Force -and @($files | Where-Object { Test-Path $_ }).Count -eq $files.Count) { $skipped++; $bytes += ($files | ForEach-Object { (Get-Item $_).Length } | Measure-Object -Sum).Sum } else { $todo.Add($u) }
}
Write-Host ''
Write-Host "== 3/3  Pictures of $($names.Count) units ($what) as $formatText (default quality and size) in $versionDir ==" -ForegroundColor Cyan
$renderLog = Join-Path $env:TEMP 'render_unit_log.txt'
$work = Join-Path $env:TEMP 'render_unit'          # the work folder of render_unit.py: every picture appears there as a lossless PNG as soon as it is rendered
if ($skipped) { Write-Host "   $skipped of $($names.Count) pictures are there already and are skipped." -ForegroundColor Green }
$t1 = Get-Date; $done = $skipped; $ok = $skipped
function Show($now, $last) {   # ONE line that is rewritten: counter, percentage, size of the finished pictures, elapsed, ETA with the seconds per picture it is calculated from, last unit
    $el = (Get-Date) - $t1
    $perPicture = if ($now -gt $skipped) { $el.TotalSeconds / ($now - $skipped) } else { 0 }   # only the pictures made in this run count
    $eta = [TimeSpan]::FromSeconds($perPicture * ($names.Count - $now))
    $text = "   {0} / {1} ({2:P0})  {3:N1} MB  elapsed {4}  ETA {5} (at {6:N2} s per picture)  {7}" -f $now, $names.Count, ($now / $names.Count), ($bytes / 1MB), (Clock $el), (Clock $eta), $perPicture, $last
    $width = try { $Host.UI.RawUI.WindowSize.Width } catch { 100 }
    if ($width -lt 20) { $width = 100 }
    if ($text.Length -gt $width - 1) { $text = $text.Substring(0, $width - 1) }   # never longer than the window: a longer line wraps and `r then only goes back to the last row
    Write-Host ("`r" + $text.PadRight($width - 1)) -NoNewline
}
$shown = [math]::Floor($skipped / 20)   # the line is rewritten every 20 pictures
for ($i = 0; $i -lt $todo.Count; $i += $chunk) {
    $batch = $todo.GetRange($i, [math]::Min($chunk, $todo.Count - $i))
    $chunkStart = Get-Date
    $renderArgs = @('"' + (Join-Path $root 'render_unit\render_unit.py') + '"', '--out', "`"$versionDir`"", '--game', "`"$gameName`"", '--work', "`"$work`"", '--units', "`"$($units.FullName)`"", '--format', ($formats -join ','), '--no-quality-check') + $batch
    $p = Start-Process python -ArgumentList $renderArgs -RedirectStandardOutput $renderLog -RedirectStandardError "$renderLog.err" -WindowStyle Hidden -PassThru
    $null = $p.Handle
    $mine = New-Object System.Collections.Generic.HashSet[string]; foreach ($u in $batch) { [void]$mine.Add("$u.png") }
    while (-not $p.HasExited) {   # while the browsers work: count the pictures of this call that are there already (the rendering of a call comes before its encoding)
        Start-Sleep -Milliseconds 700
        $new = @(Get-ChildItem (Join-Path $work 'render') -Filter '*.png' -ErrorAction SilentlyContinue | Where-Object { $mine.Contains($_.Name) -and $_.LastWriteTime -ge $chunkStart } | Sort-Object LastWriteTime)
        if ($new.Count -and [math]::Floor(($done + $new.Count) / 20) -gt $shown) { $shown = [math]::Floor(($done + $new.Count) / 20); Show ($done + $new.Count) $new[-1].BaseName }
    }
    $p.WaitForExit()
    foreach ($line in @(Get-Content $renderLog -ErrorAction SilentlyContinue | Where-Object { $_ -match '^SKIP ' })) { $unsupported.Add(($line -split '[ :]')[1]) }
    foreach ($u in $batch) {
        $files = Files-Of $u
        if (@($files | Where-Object { (Test-Path $_) -and (Get-Item $_).LastWriteTime -ge $t1 }).Count -eq $files.Count) { $ok++; $bytes += ($files | ForEach-Object { (Get-Item $_).Length } | Measure-Object -Sum).Sum } elseif ($unsupported -notcontains $u) { $errors.Add($u) }
    }
    $done += $batch.Count
    foreach ($line in @(Get-Content $renderLog, "$renderLog.err" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^(ERROR|FAILED)' })) { $errors.Add("   $line") }
    if ([math]::Floor($done / 20) -gt $shown -or $done -ge $names.Count) { $shown = [math]::Floor($done / 20); Show $done $batch[-1] }
}
if ($todo.Count -eq 0) { Write-Host '   Nothing to do: all pictures are there already.' } else { Write-Host '' }

# ---------------------------------------------------------------- summary
$total = (Get-Date) - $t0
Write-Host ''
Write-Host '== Summary ==' -ForegroundColor Cyan
Write-Host "   Unit data:  $($units.FullName)"
Write-Host ("   Pictures:   {0} of {1} units done ({2} made now, {3} were there already), {4} failed" -f $ok, $names.Count, ($ok - $skipped), $skipped, ($names.Count - $ok - $unsupported.Count))
if ($unsupported.Count) { Write-Host "   No picture:  $($unsupported -join ', ') (the model has a format that is not supported: only S3O and Collada are)" -ForegroundColor Yellow }
Write-Host ("   Size:       {0:N1} MB in total, {1:N1} KB per picture" -f ($bytes / 1MB), $(if ($ok) { $bytes / $ok / 1KB } else { 0 }))
Write-Host "   Folder:     $versionDir"
Write-Host ("   Time:       {0} (export {1}, rendering {2})" -f (Clock $total), (Clock ($t1 - $t0)), (Clock ((Get-Date) - $t1)))
if ($errors.Count) {
    $errFile = Join-Path $versionDir 'render_errors.txt'
    $errors | Set-Content $errFile
    Write-Host "   Not rendered (see $errFile): $(($errors | Select-Object -First 10) -join ', ')$(if ($errors.Count -gt 10) { ', ...' })" -ForegroundColor Yellow
    exit 1
}
