# BarCommon.ps1: what the PowerShell scripts share (docs/game-files.md); dot-sourced:  . (Join-Path <repository> 'shared\BarCommon.ps1')
# The same rules for Python: bar_common.py next to this file. The usual places of the data folder: data_dirs.txt (read by both).

$BarCommonDir = $PSScriptRoot   # this folder (when dot-sourced, $PSScriptRoot inside a function would be the caller's)

# The faction of a unit as in the game's rules (Shared.factionOf): _scav = Scavengers, raptor_ = Raptors, otherwise the first three letters
function Get-Faction($unit) { if ($unit.EndsWith('_scav')) { 'scv' } elseif ($unit.StartsWith('raptor_')) { 'rap' } else { $unit.Substring(0, [math]::Min(3, $unit.Length)) } }

# "Beyond All Reason test-31820-45ea098" (or only the version) -> the version as in file and folder names (every character other than letters, digits, . _ - becomes _)
function Get-VersionName($game) { ($game -replace '^Beyond All Reason\s+', '') -replace '[^A-Za-z0-9._-]', '_' }

# The file extension of a picture format (jpeg -> jpg)
function Get-PictureExtension($format) { if ($format -eq 'jpeg') { 'jpg' } else { $format } }

function Test-DataDir($folder) { $folder -and (Test-Path (Join-Path $folder 'packages')) -and (Test-Path (Join-Path $folder 'pool')) }

# The data folder of the installation (it has packages and pool): the given one, $env:BAR_DATA, or the first of the usual places (data_dirs.txt).
# Throws if there is none (the message names the places looked at) or if a given folder is none.
function Find-DataDir($given) {
    if ($given -and -not (Test-DataDir $given)) { throw "$given is not a BAR data folder (it needs the folders packages and pool)." }
    $usual = Get-Content (Join-Path $BarCommonDir 'data_dirs.txt') | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') } |
        ForEach-Object { $p = [Environment]::ExpandEnvironmentVariables($_); if ($p.StartsWith('~')) { $p = $HOME + $p.Substring(1) }; $p }
    $candidates = @($given, $env:BAR_DATA) + @($usual) | Where-Object { $_ }
    foreach ($c in $candidates) { if (Test-DataDir $c) { return (Resolve-Path $c).Path } }
    throw "No BAR data folder found (it needs the folders packages and pool). Give it with -Data or the environment variable BAR_DATA. Looked in: $($candidates -join ', ')"
}

# The text of a rapid package list (versions.gz of the data folder: gzip, one `tag,md5,depends,name` per line)
function Read-RapidVersions($file) {
    Add-Type -AssemblyName System.IO.Compression
    $fs = [IO.File]::OpenRead($file)
    $gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
    $sr = New-Object IO.StreamReader($gz)
    $text = $sr.ReadToEnd(); $sr.Close(); $fs.Close()
    return $text
}

# Is the package of this game in the data folder (a rapid list names it and its .sdp is in packages)? A package just downloaded (exporter\update_versions.py)
# is not in the archive cache yet: the engine adds it when it starts.
function Test-RapidPackage($data, $name) {
    foreach ($file in @(Get-ChildItem (Join-Path $data 'rapid') -Recurse -Filter 'versions.gz' -ErrorAction SilentlyContinue)) {
        foreach ($line in ((Read-RapidVersions $file.FullName) -split "`n")) {
            $f = $line.Trim().Split(',')
            if ($f.Count -ge 4 -and $f[3] -eq $name -and (Test-Path (Join-Path $data ('packages\' + $f[1] + '.sdp')))) { return $true }
        }
    }
    return $false
}
