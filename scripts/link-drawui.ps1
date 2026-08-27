# Junction CoreVital/vendor/drawui -> the local DrawUI docs/dist build.
# Recreate after clone, or if the link is missing. Requires a built DrawUI repo.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$link = Join-Path $repoRoot "vendor\drawui"
$target = "C:\Users\myoua\Documents\002_Projects\drawUI\docs\dist"

if (-not (Test-Path -LiteralPath $target)) {
    throw "DrawUI dist not found at $target. Run `npm run build` in the DrawUI repo first."
}

if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link
    $isReparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    if (-not $isReparse) {
        throw "$link exists and is not a junction. Remove it manually, then rerun."
    }
    # rmdir removes the junction without deleting target contents.
    cmd /c rmdir "$link"
}

New-Item -ItemType Junction -Path $link -Target $target | Out-Null
Write-Host "Linked $link -> $target"
