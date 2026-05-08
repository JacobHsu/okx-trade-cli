# create-bot.ps1
# Reads auto-trade-config.json, fetches current price, calculates range, creates grid bot.

$configFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime\auto-trade-config.json'

if (-not (Test-Path $configFile)) {
    Write-Error "Config not found: $configFile"
    exit 1
}

$config  = Get-Content $configFile -Encoding UTF8 | ConvertFrom-Json
$instId  = $config.targetInstId
$gridNum = $config.newBot.gridNum
$lever   = $config.newBot.lever
$sz      = $config.newBot.sz
$dir     = $config.newBot.direction
$half    = $config.newBot.rangeHalfWidth

Write-Host ""
Write-Host "Config loaded from: $configFile"
Write-Host "  instId        = $instId"
Write-Host "  gridNum       = $gridNum"
Write-Host "  lever         = $lever"
Write-Host "  sz            = $sz"
Write-Host "  direction     = $dir"
Write-Host "  rangeHalfWidth= $half"
Write-Host ""

# Fetch current price
Write-Host "Fetching current price for $instId ..."
$tickerRaw = & okx --profile demo --json market ticker $instId 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to fetch price: $tickerRaw"
    exit 1
}

$ticker = $tickerRaw | ConvertFrom-Json
$last = [double]($ticker[0].last)

$maxPx = [math]::Round($last + $half, 1)
$minPx = [math]::Round($last - $half, 1)

if ($minPx -le 0) {
    Write-Error "minPx ($minPx) is <= 0. Increase rangeHalfWidth or check the price."
    exit 1
}

Write-Host "Current price : $last"
Write-Host "Range         : $minPx ~ $maxPx  (+/- $half)"
Write-Host ""
Write-Host "Creating grid bot..."

$result = & okx --profile demo bot grid create `
    --instId $instId `
    --algoOrdType contract_grid `
    --direction $dir `
    --lever $lever `
    --gridNum $gridNum `
    --maxPx $maxPx `
    --minPx $minPx `
    --sz $sz `
    --tdMode isolated 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Bot created successfully!"
    Write-Host $result
    Write-Host ""
    Write-Host "Run 'node scripts/monitor.js' to start monitoring."
} else {
    Write-Host ""
    Write-Host "Failed to create bot:"
    Write-Host $result
}
