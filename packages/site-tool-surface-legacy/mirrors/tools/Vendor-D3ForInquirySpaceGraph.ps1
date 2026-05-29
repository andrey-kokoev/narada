#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Version = '7.9.0',
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$htmlPath = Join-Path $RepoRoot 'kb/site-lift/inquiry-space-force-graph.html'
$vendorDir = Join-Path $RepoRoot 'kb/site-lift/vendor'
$vendorPath = Join-Path $vendorDir 'd3.v7.min.js'
$url = "https://cdn.jsdelivr.net/npm/d3@$Version/dist/d3.min.js"
$localScriptTag = '<script src="vendor/d3.v7.min.js"></script>'
$cdnPattern = '<script src="https://cdn.jsdelivr.net/npm/d3@[^"" ]+/dist/d3\.min\.js"></script>'

if (-not (Test-Path -LiteralPath $htmlPath)) {
    throw "HTML file not found: $htmlPath"
}

if ($PSCmdlet.ShouldProcess($vendorPath, "Download D3 $Version from $url")) {
    New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null
    Invoke-WebRequest -Uri $url -OutFile $vendorPath
}

if (-not (Test-Path -LiteralPath $vendorPath)) {
    throw "D3 vendor file was not created: $vendorPath"
}

$vendorInfo = Get-Item -LiteralPath $vendorPath
if ($vendorInfo.Length -lt 100000) {
    throw "Downloaded D3 file is unexpectedly small: $($vendorInfo.Length) bytes"
}

$html = Get-Content -LiteralPath $htmlPath -Raw
if ($html -notmatch 'forceSimulation') {
    throw 'HTML does not look like the Inquiry Space force graph page.'
}

$updated = $false
if ($html -match [regex]::Escape($localScriptTag)) {
    Write-Verbose 'HTML already points at local D3 vendor file.'
}
elseif ($html -match $cdnPattern) {
    $html = [regex]::Replace($html, $cdnPattern, $localScriptTag, 1)
    $updated = $true
}
else {
    throw 'Could not find the D3 CDN script tag to replace.'
}

if ($updated -and $PSCmdlet.ShouldProcess($htmlPath, 'Replace D3 CDN script tag with local vendor path')) {
    Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8
}

$hash = Get-FileHash -LiteralPath $vendorPath -Algorithm SHA256
[pscustomobject]@{
    status = 'ok'
    d3_version = $Version
    vendor_path = (Resolve-Path -LiteralPath $vendorPath).Path
    vendor_bytes = $vendorInfo.Length
    vendor_sha256 = $hash.Hash.ToLowerInvariant()
    html_path = (Resolve-Path -LiteralPath $htmlPath).Path
    html_updated = $updated
    script_tag = $localScriptTag
} | ConvertTo-Json -Depth 3
