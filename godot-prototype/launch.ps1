param(
    [string]$GodotPath = 'C:\dev\Godot_v4.6.3-stable_win64.exe\Godot_v4.6.3-stable_win64.exe',
    [switch]$Play
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $GodotPath -PathType Leaf)) {
    throw 'Godot executable not found. Pass -GodotPath with its full path, or import project.godot from Godot.'
}
$projectPath = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$launchArguments = @('--path', ('"' + $projectPath + '"'))
if (-not $Play) {
    $launchArguments += @('--editor', 'res://scenes/workshop.tscn')
}
# This is the interactive editor/game requested by the user, not a hidden helper.
Start-Process -FilePath $GodotPath -ArgumentList $launchArguments
