#Requires -Version 7
<#
.SYNOPSIS
  Deploys Wichteln to Azure Container Apps + Table Storage (two phases).
.DESCRIPTION
  1. Creates the resource group and bootstraps infrastructure (deployApp=false).
  2. Builds the Linux image locally and pushes it to the deployment's ACR.
  3. Deploys the app and maintenance job pinned to the pushed digest.
  Every Azure command explicitly targets -Subscription; the CLI default is never changed.
  Use -SkipBootstrap for code-only releases.
#>
[CmdletBinding()]
param(
  [string]$Subscription = '3e79bb51-3c95-4b79-b815-1380dfcd3506',
  [string]$ResourceGroup = 'rg-wichteln',
  [string]$Location = 'westeurope',
  [string]$Prefix = 'wichteln',
  [string]$Repository = 'wichteln',
  [string]$NpmRegistry = 'https://packagefeedproxy.microsoft.io/npm/',
  [int]$MinReplicas = 1,
  [int]$MaxReplicas = 2,
  [switch]$SkipBootstrap
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Template = Join-Path $PSScriptRoot 'main.bicep'

function Invoke-Az {
  $out = & az @args
  if ($LASTEXITCODE -ne 0) { throw "az $($args[0..1] -join ' ') failed" }
  $out
}

$account = Invoke-Az account show --subscription $Subscription --query '{name:name,user:user.name}' -o json | ConvertFrom-Json
Write-Host "Subscription: $($account.name) as $($account.user)"

$common = @('--resource-group', $ResourceGroup, '--subscription', $Subscription)
$params = @("namePrefix=$Prefix", "location=$Location", "imageRepository=$Repository", "minReplicas=$MinReplicas", "maxReplicas=$MaxReplicas")

if (-not $SkipBootstrap) {
  Write-Host "Phase 1: resource group + infrastructure"
  Invoke-Az group create --name $ResourceGroup --location $Location --subscription $Subscription -o none
  Invoke-Az deployment group create --name wichteln-bootstrap @common --template-file $Template --parameters @params deployApp=false -o none
}

$outputs = Invoke-Az deployment group show --name wichteln-bootstrap @common --query properties.outputs -o json | ConvertFrom-Json
$registry = $outputs.registryName.value
$loginServer = $outputs.registryLoginServer.value

$runtimeParameters = @{
  publicUrl = @{ value = '' }
  customDomains = @{ value = @() }
}
$apps = @(Invoke-Az resource list @common --resource-type Microsoft.App/containerApps --query '[].name' -o json | ConvertFrom-Json)
if ("${Prefix}-app" -in $apps) {
  $app = Invoke-Az containerapp show --name "${Prefix}-app" @common -o json | ConvertFrom-Json
  $publicUrl = $app.properties.template.containers |
    Where-Object name -eq 'wichteln' |
    ForEach-Object env |
    Where-Object name -eq 'PUBLIC_URL'
  if ($publicUrl) { $runtimeParameters.publicUrl.value = $publicUrl.value }
  if ($app.properties.configuration.ingress.customDomains) {
    $runtimeParameters.customDomains.value = @($app.properties.configuration.ingress.customDomains)
  }
}

Write-Host "Build + push image to $loginServer"
$tag = (git -C $Root rev-parse --short=12 HEAD).Trim() + '-' + (Get-Date -Format 'yyyyMMddHHmmss')
$image = "${loginServer}/${Repository}:${tag}"
Invoke-Az acr login --name $registry --subscription $Subscription
docker build --platform linux/amd64 --build-arg "NPM_REGISTRY=$NpmRegistry" --tag $image $Root
if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }
docker push $image
if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }
$digest = (Invoke-Az acr repository show --name $registry --image "${Repository}:${tag}" --subscription $Subscription --query digest -o tsv).Trim()
if ($digest -notmatch '^sha256:[0-9a-f]{64}$') { throw "Unexpected digest '$digest'" }

Write-Host "Phase 2: app + maintenance job ($digest)"
$attempt = 0
$runtimeFile = New-TemporaryFile
try {
  $runtimeParameters | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $runtimeFile.FullName -Encoding utf8
  while ($true) {
    $attempt++
    & az deployment group create --name wichteln-release @common --template-file $Template --parameters @params "@$($runtimeFile.FullName)" deployApp=true "imageTag=$digest" -o none
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -ge 3) { throw 'Workload deployment failed (check image pull / RBAC propagation)' }
    Write-Warning "Release attempt $attempt failed; waiting 90s for RBAC propagation"
    Start-Sleep -Seconds 90
  }
} finally {
  Remove-Item -LiteralPath $runtimeFile.FullName
}

$appUrl = (Invoke-Az deployment group show --name wichteln-release @common --query properties.outputs.appUrl.value -o tsv).Trim()
Write-Host "App: $appUrl"
Invoke-RestMethod "$appUrl/api/health"
