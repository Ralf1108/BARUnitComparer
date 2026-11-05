# Unit export for the unit comparison website (SPECIFICATION.md, section 10): starts the installed Beyond All Reason ONCE in its own sandbox folder, lets the widget
# unit-export.lua write the data of all units, and copies the result to -Out:
#   <Out>\<version>\data\units-<version>.json   all units with their values (the version of the game is in the name and in the file)
#   <Out>\counterparts.json                     the counterpart ids, for all versions (an existing file is given to the game first: its ids are kept, only new units are added)
#   <Out>\<version>\data\units-<version>.reduced.json.gz and <Out>\<version>\images\icons\   the data of the website (reduce_units.py)
# Nothing of the installed game is changed: the game writes into its own folder (<Work>\data) and reads the installed packages, pool, rapid and maps (SPRING_DATADIR).
# The game starts in a small framed window, ends itself (quitforce) and only this script's own process is ever stopped.
#   .\export_units.ps1 [-Out <folder>] [-Data <data folder of BAR>] [-Work <folder>] [-WaitSec 300] [-Map "<map name>"] [-Game "<game name and version>"] [-Engine "<engine folder name>"]
# -Out: default website\assets\.
# -PrintGame: only prints the game that would be exported ("Beyond All Reason <version>") and ends, without starting anything.
# -Data: the data folder of the BAR installation (the one with packages, pool, rapid, engine, cache). Default: the environment variable BAR_DATA, otherwise the first of the usual places.
# -Map: the map to load as the engine names it; any installed map will do. Default: "Hooked 1.1.1" (small, so that the game loads fast), if it is not installed any other installed map.
# -Engine: the engine to start, the name of its folder in <Data>\engine; default: the newest. An old game version may need the engine of its time.
# -Game: the game to start as the engine names it ("Beyond All Reason test-31820-45ea098"); default: the installed one (see Get-GameVersion; an older version has to be
# installed as a package first, see SPECIFICATION.md "Several game versions").
# Exit code 1 and a message on stderr if the export failed; nothing is copied to -Out then.
param(
    [string]$Out = (Join-Path (Split-Path $PSScriptRoot -Parent) 'website\assets'),
    [string]$Data = '',
    [string]$Work = (Join-Path $env:TEMP 'unit_export'),
    [int]$WaitSec = 300,
    [string]$Map = '',
    [string]$Game = '',
    [string]$Engine = '',
    [switch]$PrintGame
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

function Fail($text) {
    [Console]::Error.WriteLine("ERROR: $text")
    exit 1
}

# The data folder of the installation: the given one, $env:BAR_DATA, or the first usual place that looks like one
function Find-DataDir($given) {
    if ($given -and -not ((Test-Path (Join-Path $given 'packages')) -and (Test-Path (Join-Path $given 'engine')))) { Fail "$given is not a BAR data folder (it needs the folders packages and engine)." }
    $usual = @($given, $env:BAR_DATA, 'C:\Games\Beyond-All-Reason\data', (Join-Path $env:LOCALAPPDATA 'Programs\Beyond-All-Reason\data'), 'C:\Program Files\Beyond-All-Reason\data', 'D:\Games\Beyond-All-Reason\data')
    foreach ($c in $usual) { if ($c -and (Test-Path (Join-Path $c 'packages')) -and (Test-Path (Join-Path $c 'engine'))) { return (Resolve-Path $c).Path } }
    $tried = ($usual | Where-Object { $_ }) -join ', '
    Fail "No BAR data folder found (needs the folders packages and engine). Give it with -Data or the environment variable BAR_DATA. Looked in: $tried"
}

# Version of the installed official game (byar:test, otherwise byar:stable; the first one whose package is installed), as the engine names it
function Get-GameVersion($data) {
    Add-Type -AssemblyName System.IO.Compression
    $versionsFile = Join-Path $data 'rapid\repos-cdn.beyondallreason.dev\byar\versions.gz'
    if (-not (Test-Path $versionsFile)) { throw 'No game data found (rapid\...\byar\versions.gz). Please start BAR once and let a game load.' }
    $fs = [IO.File]::OpenRead($versionsFile)
    $gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
    $sr = New-Object IO.StreamReader($gz)
    $text = $sr.ReadToEnd(); $sr.Close(); $fs.Close()
    $game = $null; $fallback = $null
    foreach ($tag in @('byar:test', 'byar:stable')) {
        foreach ($line in ($text -split "`n")) {
            if ($line.StartsWith($tag + ',')) {
                $f = $line.Trim().Split(',')
                if (-not $fallback) { $fallback = $f[3] }
                if (-not $game -and (Test-Path (Join-Path $data ("packages\" + $f[1] + '.sdp')))) { $game = $f[3] }
            }
        }
    }
    if (-not $game) { $game = $fallback }
    if (-not $game) { throw 'Game version not found.' }
    return $game
}

# The newest installed engine (the folder with spring.exe whose name has the highest version number)
function Get-Engine($data, $wanted) {
    if ($wanted) {
        $dir = Get-Item (Join-Path $data "engine\$wanted") -ErrorAction SilentlyContinue
        if (-not $dir -or -not (Test-Path (Join-Path $dir.FullName 'spring.exe'))) { Fail "Engine '$wanted' not found in $data\engine (installed: $((Get-ChildItem (Join-Path $data 'engine') -Directory | ForEach-Object Name) -join ', '))." }
        return $dir
    }
    $byVersion = { [regex]::Replace($_.Name, '\d+', [Text.RegularExpressions.MatchEvaluator] { param($m) $m.Value.PadLeft(10, '0') }) }
    $engineDir = Get-ChildItem (Join-Path $data 'engine') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'spring.exe') } | Sort-Object $byVersion | Select-Object -Last 1
    if (-not $engineDir) { throw 'No engine found in data\engine. Please start BAR once so the launcher installs it.' }
    return $engineDir
}

Add-Type @'
using System; using System.Runtime.InteropServices;
public class WinUx { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
'@

$Data = Find-DataDir $Data
$exe = (Get-Engine $Data $Engine).FullName + '\spring.exe'
if (-not $Game) { $Game = Get-GameVersion $Data }
if ($PrintGame) { $Game; exit 0 }

# game and map have to be known to the engine: otherwise it stops at a message box that waits for a click, until the timeout
$archiveCache = (Get-ChildItem "$Data\cache\ArchiveCache*.lua" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
if (-not $archiveCache) { Fail "No archive cache found in $Data\cache. Please start BAR once and let a game load." }
$archives = Get-Content $archiveCache -Raw
if (-not $Map) {   # any installed map will do (modtype 3 = map in the archive cache): the small default, otherwise the first one
    $maps = @([regex]::Matches($archives, '(?s)modtype = 3,.*?\r?\n\t+name = "([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    if ($maps -contains 'Hooked 1.1.1') { $Map = 'Hooked 1.1.1' } elseif ($maps.Count) { $Map = $maps[0] } else { Fail "No map found in $archiveCache. Please start BAR once and let a game load." }
}
foreach ($archive in @(@('Game', $Game), @('Map', $Map))) {
    if ($archives -notmatch ('name = "' + [regex]::Escape($archive[1]) + '"')) {
        Fail "$($archive[0]) '$($archive[1])' is not installed (not in $archiveCache). Give an installed one with -$($archive[0]); a new download is known after BAR has been started once."
    }
}

Write-Host @"
Unit export for Beyond All Reason
  Why the game is started: the unit values are not read from the files of the game but from the RUNNING game (its unit and weapon definitions, after the game has
  processed all unit files and game options), because only these are the numbers that count in a match. So the script starts the game once, in a small window that
  is put to the back, loads a map (only to get into a game), lets a widget write the data of all units and then ends the game itself.
  Game:   $Game
  Engine: $exe
  Map:    $Map (any map will do, it is not used for anything)
  Data:   $Data (only read, nothing in it is changed)
  Result: $Out (the game itself writes into the sandbox $Work, the result is moved from there)
"@
Write-Host '[1/4] Preparing the sandbox: write folder, widget, config, game script ...'
$d = Join-Path $Work 'data'
$we = Join-Path $d 'LuaUI\Config\WebsiteExport'

# the sandbox: an own write folder; the installed game is only read (SPRING_DATADIR below), nothing is linked into the sandbox
# Older versions of this script put junctions to the installed game into the sandbox: take such links away first (rmdir removes only the link), so that
# Remove-Item below can never reach the real game folders through them
if (Test-Path $d) { foreach ($j in Get-ChildItem $d -Directory | Where-Object { $_.Attributes -band 'ReparsePoint' }) { cmd /c rmdir "$($j.FullName)" } }
if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory "$d\cache", "$d\games", "$d\LuaUI\Widgets", "$d\LuaUI\Include", "$d\LuaUI\Config", $we -Force | Out-Null
Copy-Item $archiveCache "$d\cache\"

# the widget and the three files it includes (they all lie next to this script)
Copy-Item (Join-Path $here 'unit-export.lua') "$d\LuaUI\Widgets\"
Copy-Item (Join-Path $here 'lua\*.lua') "$d\LuaUI\Include\"
Set-Content (Join-Path $we 'quit.txt') 'quit'   # the widget ends the game when it is through
if (Test-Path (Join-Path $Out 'counterparts.json')) { Copy-Item (Join-Path $Out 'counterparts.json') $we }   # the ids that were corrected by hand stay

# one human player, one AI, the game option forceallunits=1 (without it the Scavenger and Raptor units do not exist)
$script = @"
[game]
{
	[allyteam0] { numallies=0; }
	[allyteam1] { numallies=0; }
	[team0] { allyteam=0; teamleader=0; side=Armada; handicap=0; }
	[team1] { allyteam=1; teamleader=0; side=Armada; handicap=0; }
	[ai0] { shortname=NullAI; team=1; host=0; name=Null1; }
	[player0] { name=Player; spectator=0; team=0; }
	[modoptions] { deathmode=neverend; experimentallegionfaction=1; forceallunits=1; }
	ishost=1;
	hostip=127.0.0.1;
	hostport=18455;
	myplayername=Player;
	gametype=$Game;
	mapname=$Map;
	startpostype=0;
	numplayers=1;
	numusers=2;
	nohelperais=0;
}
"@
[IO.File]::WriteAllText("$d\script.txt", $script, (New-Object Text.UTF8Encoding $false))
# UserWidgetMemoryLimits = 0: BAR limits the memory of user widgets and would stop the widget (the export builds about 15 MB of text)
[IO.File]::WriteAllLines("$Work\springsettings.cfg", @('Fullscreen = 0', 'WindowBorderless = 0', 'XResolution = 1000', 'YResolution = 600', 'XResolutionWindowed = 1000', 'YResolutionWindowed = 600',
    'WindowPosX = 40', 'WindowPosY = 40', 'Sound = 0', 'MaxSounds = 0', 'UserWidgetMemoryLimits = 0'))

Write-Host '[2/4] Starting the game (the first start of a game version may take a while: the game files are read)'
$prev = [WinUx]::GetForegroundWindow()
$env:SPRING_DATADIR = $Data   # more data folder for reading (packages, pool, rapid, maps): the engine reads the installed game from there
$p = Start-Process $exe -ArgumentList @('--config', "`"$Work\springsettings.cfg`"", '--write-dir', "`"$d`"", "`"$d\script.txt`"") -PassThru
Write-Host "      game started (process $($p.Id)); the widget exports a moment after the game has loaded and ends the game, waiting at most $WaitSec s"
Write-Host '[3/4] Waiting for the export ...'
$start = Get-Date; $nextNote = 15
while (((Get-Date) - $start).TotalSeconds -lt $WaitSec -and -not $p.HasExited) {
    $p.Refresh()
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) { [void][WinUx]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013); [void][WinUx]::SetForegroundWindow($prev) }   # window to the back
    Start-Sleep 3
    $sec = [int]((Get-Date) - $start).TotalSeconds
    if ($sec -ge $nextNote) { Write-Host "      still running, $sec s"; $nextNote += 15 }
}
$timedOut = -not $p.HasExited
if ($timedOut) { Write-Host '      timeout: ending the game'; try { $p.CloseMainWindow() | Out-Null; Start-Sleep 5; if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } } catch {} }

# the result
Write-Host "[4/4] The game has ended after $([int]((Get-Date) - $start).TotalSeconds) s, checking the result ..."
$log = "$d\infolog.txt"
$status = Join-Path $we 'status.txt'
if (-not (Test-Path $status)) {
    if ($timedOut) { Fail "The game did not finish within $WaitSec seconds and the widget wrote no result (try a higher -WaitSec). Log: $log" }
    Fail "The game ended, but the widget wrote no result. Is the game '$Game' and the map '$Map' installed (-Game, -Map)? Log: $log"
}
$line = "$(Get-Content $status -Raw)".Trim()
if (-not $line.StartsWith('ok')) { Fail "The export failed: $line. Log: $log" }
Write-Host "      widget: $line"
New-Item -ItemType Directory $Out -Force | Out-Null
$exported = @()
Get-ChildItem $we -Filter 'units-*.json' | ForEach-Object {
    $size = [math]::Round($_.Length / 1e6, 1)
    $folder = Join-Path (Join-Path $Out ($_.BaseName -replace '^units-', '')) 'data'
    New-Item -ItemType Directory $folder -Force | Out-Null
    Move-Item $_.FullName $folder -Force
    $exported += (Join-Path $folder $_.Name)
    "moved $($_.Name) ($size MB) to $folder"
}
Move-Item (Join-Path $we 'counterparts.json') $Out -Force
"moved counterparts.json to $Out"

# the data of the website: the reduced file, the list of versions, the icons. A problem here is a warning: the export itself has worked
$reduced = $false
try {
    $reduced = $true
    foreach ($file in $exported) {   # a new export replaces the reduced file of that version
        & python (Join-Path $here 'reduce_units.py') --units $file --out $Out --data $Data --force 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) { $reduced = $false }
    }
} catch { "$_" }
if (-not $reduced) { Write-Host "WARNING: the data of the website was not made (exporter\reduce_units.py needs Python)." -ForegroundColor Yellow }
Remove-Item $Work -Recurse -Force   # the sandbox is not needed any more (after an error it stays, for the log)
