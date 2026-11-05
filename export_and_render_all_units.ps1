# Exports the unit data of the installed Beyond All Reason (exporter\export_units.ps1) and renders a picture of every unit in it (render_unit\render_unit.py),
# in the chosen format (default AVIF) with the default quality and size, into the folder out\ next to this file. Started by "export and render all units.bat".
# The output of the two scripts is not shown, only the progress: the steps of the export, then a counter with the size so far and the time still needed.
# Parameters: -Faction <all | arm | cor | leg | scv | rap, several separated by commas> renders only the units of these factions (the export is always complete);
# -Format <avif | webp | jpeg | png | bmp | all (= all five), several separated by commas> (default avif); without the parameters the script asks. Pictures that are there already (made for the same game version) are skipped, so an aborted run can be started again and goes on; -Force renders everything again. For tests: -Limit <n> renders only the first n units; -Yes skips the questions at the start.
param([string]$Faction = '', [string]$Format = '', [int]$Limit = 0, [switch]$Yes, [switch]$Force, [string]$Out = '')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out = if ($Out) { $Out } else { Join-Path $root 'out' }   # -Out: another folder for the pictures (for tests: never the real out\)
$chunk = 80   # units per call of render_unit.py: every call starts its browsers (--jobs of them, 4 by default) once; the counter is updated after each call
$errors = New-Object System.Collections.Generic.List[string]
$unsupported = New-Object System.Collections.Generic.List[string]   # units whose model is not an S3O file: no picture, not an error

function Fail($text) {
    Write-Host ''
    Write-Host "ERROR: $text" -ForegroundColor Red
    exit 1
}
function Clock($span) { '{0:00}:{1:00}:{2:00}' -f [int][math]::Floor($span.TotalHours), $span.Minutes, $span.Seconds }

# the faction of a unit as in the game's rules (Shared.factionOf): _scav = Scavengers, raptor_ = Raptors, otherwise the first three letters
function Get-Faction($unit) { if ($unit.EndsWith('_scav')) { 'scv' } elseif ($unit.StartsWith('raptor_')) { 'rap' } else { $unit.Substring(0, [math]::Min(3, $unit.Length)) } }

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

Write-Host ''
Write-Host 'This will do two things:' -ForegroundColor Cyan
Write-Host '  1. Export the unit data from the installed Beyond All Reason: the game is started once in a small window (about 30 seconds) and writes'
Write-Host '     units-<game version>.json and equivalences.json to exporter\out (it and equivalences.json are copied to out\ as well).'
Write-Host "  2. Render a picture of $what in that file as $formatText in the default quality and size, to the folder out\ of this repository."
Write-Host '     This takes a while (roughly 0.1 to 0.5 seconds per unit).'
Write-Host ''
if (-not $Yes) {
    $answer = Read-Host 'Start? [Enter = yes, n = cancel]'
    if ($answer -match '^\s*(n|no|c|cancel)') { exit 2 }
}

$t0 = Get-Date

# ---------------------------------------------------------------- 1. the export
Write-Host '== 1/2  Exporting the unit data from Beyond All Reason ==' -ForegroundColor Cyan
$log = Join-Path $env:TEMP 'export_units_log.txt'
$errLog = Join-Path $env:TEMP 'export_units_errors.txt'
$exportStart = Get-Date
$p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$root\exporter\export_units.ps1`"") `
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
$units = Get-ChildItem (Join-Path $root 'exporter\out') -Filter 'units-*.json' | Where-Object { $_.LastWriteTime -ge $exportStart.AddSeconds(-5) } | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $units) { Fail "The export ran, but no units-<game version>.json was written (log: $log)." }
New-Item -ItemType Directory $out -Force | Out-Null
Copy-Item $units.FullName $out -Force   # the unit data and the equivalences are also in out\ next to the pictures (the originals stay in exporter\out)
if (Test-Path (Join-Path $root 'exporter\out\equivalences.json')) { Copy-Item (Join-Path $root 'exporter\out\equivalences.json') $out -Force }
Write-Host ("   Unit data collected: {0} ({1:N1} MB), after {2}; a copy of it and of equivalences.json is in {3}" -f $units.Name, ($units.Length / 1MB), (Clock ((Get-Date) - $t0)), $out) -ForegroundColor Green

# ---------------------------------------------------------------- 2. the pictures
$names = New-Object System.Collections.Generic.List[string]
foreach ($line in [IO.File]::ReadLines($units.FullName)) { if ($line -match '^"([^"]+)":\{"game"') { if (-not $wanted.Count -or $wanted -contains (Get-Faction $Matches[1])) { $names.Add($Matches[1]) } } }   # one unit per line (SPECIFICATION.md, section 2.1)
if ($Limit -gt 0 -and $names.Count -gt $Limit) { $names.RemoveRange($Limit, $names.Count - $Limit) }
if ($names.Count -eq 0) { Fail "No units found in $($units.FullName) for: $what." }
New-Item -ItemType Directory $out -Force | Out-Null
Remove-Item (Join-Path $out 'render_errors.txt') -ErrorAction SilentlyContinue   # the list of the last run (only this one file of the folder; it is written again if there are errors)

# pictures that are there already are left alone: a picture counts as up to date if its files are all there and are not older than `$since` = the start of the first run for this
# game version (kept in out\.render_state.json); a new game version, or -Force, starts again from now. The files are written complete or not at all (render_unit.py).
$gameVersion = $units.BaseName -replace '^units-', ''
$stampFile = Join-Path $out '.render_state.json'
$since = Get-Date
if (-not $Force -and (Test-Path $stampFile)) {
    try {
        $st = Get-Content $stampFile -Raw | ConvertFrom-Json
        if ($st.gameVersion -eq $gameVersion) { $since = (New-Object DateTime ([int64]$st.sinceTicks), ([DateTimeKind]::Utc)).ToLocalTime() }
    } catch { }
}
(@{ gameVersion = $gameVersion; sinceTicks = $since.ToUniversalTime().Ticks } | ConvertTo-Json) | Set-Content $stampFile
function Files-Of($u) { @($formats | ForEach-Object { Join-Path $out ("$u." + $(if ($_ -eq 'jpeg') { 'jpg' } else { $_ })) }) }
$todo = New-Object System.Collections.Generic.List[string]; $skipped = 0; $bytes = 0
foreach ($u in $names) {
    $files = Files-Of $u
    if (@($files | Where-Object { (Test-Path $_) -and (Get-Item $_).LastWriteTime -ge $since }).Count -eq $files.Count) { $skipped++; $bytes += ($files | ForEach-Object { (Get-Item $_).Length } | Measure-Object -Sum).Sum } else { $todo.Add($u) }
}
Write-Host ''
Write-Host "== 2/2  Rendering $($names.Count) units ($what) as $formatText (default quality and size) into $out ==" -ForegroundColor Cyan
$renderLog = Join-Path $env:TEMP 'render_unit_log.txt'
$work = Join-Path $env:TEMP 'render_unit'          # the work folder of render_unit.py: every picture appears there as a lossless PNG as soon as it is rendered
if ($skipped) { Write-Host "   $skipped of $($names.Count) pictures are there already (from an earlier run with this game version) and are skipped; -Force renders everything again." -ForegroundColor Green }
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
    $renderArgs = @('"' + (Join-Path $root 'render_unit\render_unit.py') + '"', '--out', "`"$out`"", '--work', "`"$work`"", '--units', "`"$($units.FullName)`"", '--format', ($formats -join ','), '--no-quality-check') + $batch
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
if ($unsupported.Count) { Write-Host "   No picture:  $($unsupported -join ', ') (the model is not an S3O file, such models are not supported)" -ForegroundColor Yellow }
Write-Host ("   Size:       {0:N1} MB in total, {1:N1} KB per picture" -f ($bytes / 1MB), $(if ($ok) { $bytes / $ok / 1KB } else { 0 }))
Write-Host "   Folder:     $out"
Write-Host ("   Time:       {0} (export {1}, rendering {2})" -f (Clock $total), (Clock ($t1 - $t0)), (Clock ((Get-Date) - $t1)))
if ($errors.Count) {
    $errFile = Join-Path $out 'render_errors.txt'
    $errors | Set-Content $errFile
    Write-Host "   Not rendered (see $errFile): $(($errors | Select-Object -First 10) -join ', ')$(if ($errors.Count -gt 10) { ', ...' })" -ForegroundColor Yellow
    exit 1
}
