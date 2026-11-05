# Unit extraction for the unit comparison website (specification.md, section 10): starts the installed Beyond All Reason ONCE in its own sandbox folder, lets the widget
# unit-extraction.lua write the data of all units, and copies the result to -Out:
#   <Out>\units-<game version>.json   all units with their values (the version of the game is in the name and in the file)
#   <Out>\comparison.json             the comparison ids (an existing file in <Out> is given to the game first: its ids are kept, only new units are added)
# Nothing of the installed game is changed: the game writes into its own folder (<Work>\data) and reads the installed packages, pool, rapid and maps (SPRING_DATADIR).
# The game starts in a small framed window, ends itself (quitforce) and only this script's own process is ever stopped.
#   .\extract_units.ps1 [-Out <folder>] [-Data <data folder of BAR>] [-Work <folder>] [-WaitSec 300] [-Map "<map name>"] [-Game "<game name and version>"]
# -Map: the map to load as the engine names it; any installed map will do, the default is a small one so that the game loads fast.
# -Game: the game to start as the engine names it ("Beyond All Reason test-31820-45ea098"); default: the installed one (see Get-GameVersion; an older version has to be
# installed as a package first, see specification.md "Several game versions").
# Exit code 1 and a message on stderr if the extraction failed; nothing is copied to -Out then.
param(
    [string]$Out = (Join-Path $PSScriptRoot 'out'),
    [string]$Data = 'C:\Games\Beyond-All-Reason\data',
    [string]$Work = (Join-Path $env:TEMP 'unit_extraction'),
    [int]$WaitSec = 300,
    [string]$Map = 'Hooked 1.1.1',
    [string]$Game = ''
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

function Fail($text) {
    [Console]::Error.WriteLine("ERROR: $text")
    exit 1
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
function Get-Engine($data) {
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

$exe = (Get-Engine $Data).FullName + '\spring.exe'
if (-not $Game) { $Game = Get-GameVersion $Data }

# game and map have to be known to the engine: otherwise it stops at a message box that waits for a click, until the timeout
$archiveCache = (Get-ChildItem "$Data\cache\ArchiveCache*.lua" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
if (-not $archiveCache) { Fail "No archive cache found in $Data\cache. Please start BAR once and let a game load." }
$archives = Get-Content $archiveCache -Raw
foreach ($archive in @(@('Game', $Game), @('Map', $Map))) {
    if ($archives -notmatch ('name = "' + [regex]::Escape($archive[1]) + '"')) {
        Fail "$($archive[0]) '$($archive[1])' is not installed (not in $archiveCache). Give an installed one with -$($archive[0]); a new download is known after BAR has been started once."
    }
}

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
Copy-Item (Join-Path $here 'unit-extraction.lua') "$d\LuaUI\Widgets\"
Copy-Item (Join-Path $here 'lua\*.lua') "$d\LuaUI\Include\"
Set-Content (Join-Path $we 'quit.txt') 'quit'   # the widget ends the game when it is through
if (Test-Path (Join-Path $Out 'comparison.json')) { Copy-Item (Join-Path $Out 'comparison.json') $we }   # the ids that were corrected by hand stay

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

$prev = [WinUx]::GetForegroundWindow()
$env:SPRING_DATADIR = $Data   # more data folder for reading (packages, pool, rapid, maps): the engine reads the installed game from there
$p = Start-Process $exe -ArgumentList @('--config', "`"$Work\springsettings.cfg`"", '--write-dir', "`"$d`"", "`"$d\script.txt`"") -PassThru
"started pid $($p.Id), game '$Game'"
$start = Get-Date
while (((Get-Date) - $start).TotalSeconds -lt $WaitSec -and -not $p.HasExited) {
    $p.Refresh()
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) { [void][WinUx]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013); [void][WinUx]::SetForegroundWindow($prev) }   # window to the back
    Start-Sleep 3
}
$timedOut = -not $p.HasExited
if ($timedOut) { 'timeout: ending the game'; try { $p.CloseMainWindow() | Out-Null; Start-Sleep 5; if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } } catch {} }

# the result
$log = "$d\infolog.txt"
$status = Join-Path $we 'status.txt'
if (-not (Test-Path $status)) {
    if ($timedOut) { Fail "The game did not finish within $WaitSec seconds and the widget wrote no result (try a higher -WaitSec). Log: $log" }
    Fail "The game ended, but the widget wrote no result. Is the game '$Game' and the map '$Map' installed (-Game, -Map)? Log: $log"
}
$line = "$(Get-Content $status -Raw)".Trim()
if (-not $line.StartsWith('ok')) { Fail "The export failed: $line. Log: $log" }
$line
New-Item -ItemType Directory $Out -Force | Out-Null
Get-ChildItem $we -Filter 'units-*.json' | ForEach-Object { $size = [math]::Round($_.Length / 1e6, 1); Move-Item $_.FullName $Out -Force; "moved $($_.Name) ($size MB) to $Out" }
Move-Item (Join-Path $we 'comparison.json') $Out -Force
"moved comparison.json to $Out"
Remove-Item $Work -Recurse -Force   # the sandbox is not needed any more (after an error it stays, for the log)
