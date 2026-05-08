# setup-okx-profile.ps1
# Reads .env and writes API credentials to OKX CLI config.toml (demo profile)

$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$tomlPath = "$env:USERPROFILE\.okx\config.toml"

if (-not (Test-Path $envFile)) {
    Write-Error ".env not found. Please copy .env.example to .env and fill in your API credentials."
    exit 1
}

$apiKey = $null
$secretKey = $null
$passphrase = $null

foreach ($line in Get-Content $envFile -Encoding UTF8) {
    if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
    $parts = $line -split '=', 2
    switch ($parts[0].Trim()) {
        'OKX_API_KEY'    { $apiKey    = $parts[1].Trim() }
        'OKX_SECRET_KEY' { $secretKey = $parts[1].Trim() }
        'OKX_PASSPHRASE' { $passphrase = $parts[1].Trim() }
    }
}

$missing = @()
if (-not $apiKey     -or $apiKey     -match '^(.*placeholder.*|.*在此.*|.*YOUR.*)$') { $missing += 'OKX_API_KEY' }
if (-not $secretKey  -or $secretKey  -match '^(.*placeholder.*|.*在此.*|.*YOUR.*)$') { $missing += 'OKX_SECRET_KEY' }
if (-not $passphrase -or $passphrase -match '^(.*placeholder.*|.*在此.*|.*YOUR.*)$') { $missing += 'OKX_PASSPHRASE' }

if ($missing.Count -gt 0) {
    Write-Error "The following fields are not set in .env: $($missing -join ', ')"
    Write-Host "Please open .env and fill in the values, then run this script again."
    exit 1
}

$okxDir = "$env:USERPROFILE\.okx"
if (-not (Test-Path $okxDir)) {
    New-Item -ItemType Directory -Path $okxDir | Out-Null
}

# TOML quoting: use single quotes if value contains " or \, else double quotes
function ToTomlString($val) {
    if ($val -match '["\\]') { return "'$val'" }
    return """$val"""
}

$tomlContent = @"
default_profile = "demo"

[profiles.demo]
api_key = $(ToTomlString $apiKey)
secret_key = $(ToTomlString $secretKey)
passphrase = $(ToTomlString $passphrase)
demo = true
"@

# Write UTF-8 without BOM (PowerShell 5.1 -Encoding UTF8 adds BOM which breaks TOML parser)
[System.IO.File]::WriteAllText($tomlPath, $tomlContent, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Done. config.toml written to: $tomlPath"
Write-Host ""
Write-Host "Verifying connection..."
Write-Host ""

$result = & okx --profile demo account balance 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Connection OK. Account balance:"
    Write-Host $result
} else {
    Write-Host "Connection failed. Please check your API credentials."
    Write-Host $result
    Write-Host ""
    Write-Host "Common causes:"
    Write-Host "  1. API Key was not created under the Demo Trading environment"
    Write-Host "  2. Passphrase is incorrect (case-sensitive)"
    Write-Host "  3. Secret Key was not copied completely (only shown once)"
}
