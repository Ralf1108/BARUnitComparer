# Exports the unit data of the installed Beyond All Reason (exporter\export_units.ps1) and renders a picture of every unit in it (render_unit\render_unit.py),
# as AVIF with the default quality and size, into the folder out\ next to this file. Started by "export and render all units.bat".
# The output of the two scripts is not shown, only the progress: the steps of the export, then a counter with the size so far and the time still needed.
# Parameters: -Faction <all | arm | cor | leg | scv | rap, several separated by commas> renders only the units of these factions (the export is always complete);
# without it the script asks. For tests: -Limit <n> renders only the first n units; -Yes skips the questions at the start.
param([string]$Faction = '', [int]$Limit = 0, [switch]$Yes)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out = Join-Path $root 'out'
$chunk = 80   # units per call of render_unit.py: every call starts its browsers (--jobs of them, 4 by default) once; the counter is updated after each call
$errors = New-Object System.Collections.Generic.List[string]

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

Add-Type -AssemblyName System.Windows.Forms
$text = @"
This will do two things:

1. Export the unit data from the installed Beyond All Reason: the game is started once in a small window (about 30 seconds) and writes units-<game version>.json and equivalences.json to exporter\out.

2. Render a picture of $what in that file as AVIF, in the default quality and size, to the folder out\ of this repository. This takes a while (roughly 1 to 2 seconds per unit).

Start?
"@
if (-not $Yes -and [System.Windows.Forms.MessageBox]::Show($text, 'Export and render all units', 'OKCancel', 'Information') -ne 'OK') { exit 2 }

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
Write-Host ("   Unit data collected: {0} ({1:N1} MB), after {2}" -f $units.Name, ($units.Length / 1MB), (Clock ((Get-Date) - $t0))) -ForegroundColor Green

# ---------------------------------------------------------------- 2. the pictures
$names = New-Object System.Collections.Generic.List[string]
foreach ($line in [IO.File]::ReadLines($units.FullName)) { if ($line -match '^"([^"]+)":\{"game"') { if (-not $wanted.Count -or $wanted -contains (Get-Faction $Matches[1])) { $names.Add($Matches[1]) } } }   # one unit per line (SPECIFICATION.md, section 2.1)
if ($Limit -gt 0 -and $names.Count -gt $Limit) { $names.RemoveRange($Limit, $names.Count - $Limit) }
if ($names.Count -eq 0) { Fail "No units found in $($units.FullName) for: $what." }
New-Item -ItemType Directory $out -Force | Out-Null
Write-Host ''
Write-Host "== 2/2  Rendering $($names.Count) units ($what) as AVIF (default quality and size) into $out ==" -ForegroundColor Cyan
$renderLog = Join-Path $env:TEMP 'render_unit_log.txt'
$t1 = Get-Date; $done = 0; $ok = 0; $bytes = 0
for ($i = 0; $i -lt $names.Count; $i += $chunk) {
    $batch = $names.GetRange($i, [math]::Min($chunk, $names.Count - $i))
    & python (Join-Path $root 'render_unit\render_unit.py') --out $out --units $units.FullName --format avif @batch *> $renderLog
    foreach ($u in $batch) {
        $f = Join-Path $out "$u.avif"
        if ((Test-Path $f) -and (Get-Item $f).LastWriteTime -ge $t1) { $ok++; $bytes += (Get-Item $f).Length } else { $errors.Add($u) }
    }
    $done += $batch.Count
    foreach ($line in @(Get-Content $renderLog -ErrorAction SilentlyContinue | Where-Object { $_ -match '^(ERROR|FAILED)' })) { $errors.Add("   $line") }
    $el = (Get-Date) - $t1
    $eta = if ($done -gt 0) { [TimeSpan]::FromSeconds($el.TotalSeconds / $done * ($names.Count - $done)) } else { [TimeSpan]::Zero }
    Write-Host ("`r   {0} / {1} pictures ({2:P0})   {3:N1} MB so far   elapsed {4}   ETA {5}   " -f $done, $names.Count, ($done / $names.Count), ($bytes / 1MB), (Clock $el), (Clock $eta)) -NoNewline
}
Write-Host ''

# ---------------------------------------------------------------- summary
$total = (Get-Date) - $t0
Write-Host ''
Write-Host '== Summary ==' -ForegroundColor Cyan
Write-Host "   Unit data:  $($units.FullName)"
Write-Host ("   Pictures:   {0} of {1} units rendered, {2} failed" -f $ok, $names.Count, ($names.Count - $ok))
Write-Host ("   Size:       {0:N1} MB in total, {1:N1} KB per picture" -f ($bytes / 1MB), $(if ($ok) { $bytes / $ok / 1KB } else { 0 }))
Write-Host "   Folder:     $out"
Write-Host ("   Time:       {0} (export {1}, rendering {2})" -f (Clock $total), (Clock ($t1 - $t0)), (Clock ((Get-Date) - $t1)))
if ($errors.Count) {
    $errFile = Join-Path $out 'render_errors.txt'
    $errors | Set-Content $errFile
    Write-Host "   Not rendered (see $errFile): $(($errors | Select-Object -First 10) -join ', ')$(if ($errors.Count -gt 10) { ', ...' })" -ForegroundColor Yellow
    exit 1
}
