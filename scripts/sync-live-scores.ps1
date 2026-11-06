
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env.local"

if (-not (Test-Path $envPath)) {
    throw ".env.local was not found in the project folder."
}

$secretLine = Get-Content $envPath |
    Where-Object { $_ -match '^\s*FPL_SYNC_SECRET\s*=' } |
    Select-Object -First 1

if (-not $secretLine) {
    throw "FPL_SYNC_SECRET was not found in .env.local."
}

$secret = ($secretLine -replace '^\s*FPL_SYNC_SECRET\s*=\s*', '').Trim()
$secret = $secret.Trim('"').Trim("'")

if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "FPL_SYNC_SECRET is empty."
}

$headers = @{
    Authorization = "Bearer $secret"
}

$url = "http://localhost:3000/api/admin/sync-live-scores"

Write-Host "FPL Clash live-score sync started."
Write-Host "Sync interval: 2 minutes. Press Ctrl+C to stop."

try {
    while ($true) {
        $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

        try {
            $result = Invoke-RestMethod `
                -Uri $url `
                -Method POST `
                -Headers $headers `
                -ContentType "application/json" `
                -Body "{}" `
                -TimeoutSec 90

            Write-Host "[$time] Gameweek $($result.gameweek): updated $($result.updated), failed $($result.failed)."

            if ($result.failures -and $result.failures.Count -gt 0) {
                $result.failures | ConvertTo-Json -Depth 4
            }

            if ($result.error) {
                Write-Host $result.error
            }
        }
        catch {
            Write-Host "[$time] Sync request failed."
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message
            } else {
                Write-Host $_.Exception.Message
            }
        }

        Start-Sleep -Seconds 360
    }
}
finally {
    $secret = $null
    $headers = $null
    Write-Host "Live-score sync stopped."
}
