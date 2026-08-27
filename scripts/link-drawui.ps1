# Copy the local DrawUI docs/dist build into CoreVital/vendor/drawui.
# Run after rebuilding DrawUI, then commit the updated vendor files.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $repoRoot "vendor\drawui"
$target = "C:\Users\myoua\Documents\002_Projects\drawUI\docs\dist"

if (-not (Test-Path -LiteralPath $target)) {
    throw "DrawUI dist not found at $target. Run `npm run build` in the DrawUI repo first."
}

if (Test-Path -LiteralPath $dest) {
    $item = Get-Item -LiteralPath $dest
    $isReparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    if ($isReparse) {
        # rmdir removes a junction without deleting target contents.
        cmd /c rmdir "$dest"
    } else {
        Remove-Item -LiteralPath $dest -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $dest | Out-Null
Copy-Item -Path (Join-Path $target "*") -Destination $dest -Recurse -Force
Write-Host "Copied $target -> $dest"
