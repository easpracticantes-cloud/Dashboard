<#
.SYNOPSIS
  Configura GEMINI_API_KEY (y CORS) en el backend de Render vía API.

.EXAMPLE
  $env:RENDER_API_KEY = 'rnd_xxx'
  .\scripts\set-render-gemini.ps1 -ServiceId 'srv-xxxxxxxx' -GeminiApiKey 'AQ....'
#>
param(
  [Parameter(Mandatory = $true)][string]$ServiceId,
  [Parameter(Mandatory = $true)][string]$GeminiApiKey,
  [string]$GeminiModel = 'gemini-3.6-flash',
  [string]$CorsOrigins = 'https://dashboard-frontend.onrender.com,https://*.onrender.com,http://localhost:4200,http://localhost:5173',
  [string]$ApiKey = $env:RENDER_API_KEY
)

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw 'Define RENDER_API_KEY (Account Settings → API Keys en Render).'
}

$headers = @{
  Authorization = "Bearer $ApiKey"
  Accept        = 'application/json'
  'Content-Type' = 'application/json'
}

function Set-Env([string]$Key, [string]$Value) {
  $url = "https://api.render.com/v1/services/$ServiceId/env-vars/$Key"
  $body = @{ value = $Value } | ConvertTo-Json
  Write-Host "PUT $Key ..."
  Invoke-RestMethod -Method Put -Uri $url -Headers $headers -Body $body | Out-Null
}

Set-Env -Key 'GEMINI_API_KEY' -Value $GeminiApiKey
Set-Env -Key 'GEMINI_MODEL' -Value $GeminiModel
Set-Env -Key 'APP_AI_PROVIDER' -Value 'gemini'
Set-Env -Key 'CORS_ALLOWED_ORIGINS' -Value $CorsOrigins

Write-Host 'Listo. En Render: Manual Deploy → Clear build cache & deploy (o Save and deploy en Environment).'
