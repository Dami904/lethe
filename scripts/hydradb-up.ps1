# PowerShell equivalent of scripts/hydradb-up.sh, for judges on native
# Windows with Docker Desktop and no bash (no WSL, no Git Bash). Creates the
# host-mounted store/cache dirs and a dev auth token, then starts HydraDB
# via docker compose. Safe to re-run.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/hydradb-up.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

New-Item -ItemType Directory -Force -Path ".hydradb-data/store" | Out-Null
New-Item -ItemType Directory -Force -Path ".hydradb-data/cache" | Out-Null

$tokenPath = ".hydradb-data/auth-token"
if (-not (Test-Path $tokenPath)) {
    # PowerShell's -Encoding utf8 writes a UTF-8 BOM, which would become
    # part of the token HydraDB actually reads from this file and break
    # authentication silently. .NET's UTF8Encoding($false) writes clean
    # UTF-8 with no BOM, matching bash's `printf '%s\n'` byte-for-byte.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $fullTokenPath = Join-Path (Get-Location).Path $tokenPath
    [System.IO.File]::WriteAllText($fullTokenPath, "local-development-token-32-bytes`n", $utf8NoBom)
}

# Unlike scripts/hydradb-up.sh, this does not set DOCKER_UID/DOCKER_GID --
# there's no POSIX UID on native Windows, and Docker Desktop's bind-mount
# layer for Windows paths doesn't enforce host-side UID ownership the way a
# native Linux Docker host does (that's what scripts/hydradb-up.sh's
# UID/GID export works around; see docker-compose.yml). The compose file's
# default fallback (1000:1000) is fine here.
docker compose up -d hydradb

Write-Host "Waiting for HydraDB readiness on :9090/readyz ..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:9090/readyz" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # not ready yet, keep polling
    }
    Start-Sleep -Seconds 1
}

if ($ready) {
    Write-Host "HydraDB is ready."
    exit 0
} else {
    Write-Error "HydraDB did not become ready in time; check 'docker compose logs hydradb'."
    exit 1
}
