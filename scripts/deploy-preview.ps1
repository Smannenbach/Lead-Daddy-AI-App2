# LeadDaddy.ai (lean) — one-command preview deploy.
# Safe to re-run: idempotent link, env upserts, preview deployment only (no --prod).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/deploy-preview.ps1
# Requires: Vercel CLI authenticated (vercel whoami), repo .env.local populated.

$ErrorActionPreference = "Stop"
$ProjectDir = "C:\Users\steve\Projects\lead-daddy-rebuild"
$ProjectName = "leaddaddy-ai"
Set-Location $ProjectDir

# 1. Link (idempotent)
$linked = $false
try {
  $link = vercel inspect .\ --scope steve-projects 2>$null
  if ($LASTEXITCODE -eq 0) { $linked = $true }
} catch {}
if (-not $linked) {
  Write-Host "Linking new Vercel project '$ProjectName' under steve-projects..."
  vercel link --yes --project $ProjectName --scope steve-projects
}

# 2. Push env vars from .env.local (values never printed). Upsert = rm + add.
$envFile = Join-Path $ProjectDir ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local missing — fill it per docs/SETUP.md first" }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name = $_.Substring(0, $_.IndexOf('=')).Trim()
  $value = $_.Substring($_.IndexOf('=') + 1).Trim()
  if (-not $name) { return }
  vercel env rm $name production -y 2>$null | Out-Null
  $value | vercel env add $name production | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "failed to set env $name" }
  Write-Host "env set: $name"
}

# 3. Preview deploy (production stays gated)
Write-Host "Deploying PREVIEW..."
$previewUrl = vercel --yes 2>&1 | Select-Object -Last 1
Write-Host "Preview URL: $previewUrl"
Write-Host "Next: open the URL, run the E2E checks in docs/SETUP.md Step 3, then get Steve's go for: vercel --prod"
