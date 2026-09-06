param(
    [Parameter(Position = 0)]
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# Always operate on this repository, even when the script is launched from
# another folder (for example, from a desktop shortcut).
Set-Location -LiteralPath $PSScriptRoot

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

$isWorkTree = (& git rev-parse --is-inside-work-tree 2>$null)
if ($LASTEXITCODE -ne 0 -or $isWorkTree -ne "true") {
    throw "This folder is not a Git worktree: $PSScriptRoot"
}

$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
    throw "Publishing is restricted to the main branch. Current branch: '$branch'."
}

$remote = (& git remote get-url origin 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remote)) {
    throw "No 'origin' remote is configured for this repository."
}

$status = (& git status --short)
if ($LASTEXITCODE -ne 0) {
    throw "Could not read the Git status."
}

if ([string]::IsNullOrWhiteSpace(($status -join "`n"))) {
    Write-Host "Nothing to publish. The working tree is clean." -ForegroundColor Green
    exit 0
}

Write-Host "Changes that will be published:" -ForegroundColor Cyan
$status | ForEach-Object { Write-Host "  $_" }
Write-Host ""

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = Read-Host "Commit message (default: Publish app update)"
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Publish app update"
    }
}

$confirmation = Read-Host "Publish these changes to GitHub Pages? [y/N]"
if ($confirmation -notmatch "^(y|yes)$") {
    Write-Host "Publish cancelled. No files were changed." -ForegroundColor Yellow
    exit 0
}

Invoke-Git -Arguments @("add", "-A")

# A file can disappear between the status check and git add. Do not create an
# empty commit in that case.
& git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "Nothing is staged to publish." -ForegroundColor Yellow
    exit 0
}
if ($LASTEXITCODE -ne 1) {
    throw "Could not inspect the staged changes."
}

Invoke-Git -Arguments @("commit", "-m", $Message)
Invoke-Git -Arguments @("push", "origin", "main")

Write-Host ""
Write-Host "Published to origin/main. GitHub Actions will test and deploy the app." -ForegroundColor Green
Write-Host "Actions: https://github.com/burgesslouis/ww-mod-app/actions"
Write-Host "Live app: https://burgesslouis.github.io/ww-mod-app/"
