param(
    [string]$Root = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string[]]$Extensions = @(".ps1", ".mjs", ".cmd", ".bat"),
    [switch]$NoThrow,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertTo-NaradaJson {
    param($Value)
    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Value | ConvertTo-Json -Depth 100 }
    return $Value | ConvertTo-Json
}

function Convert-ToForwardSlashPath {
    param([string]$Path)
    return ($Path -replace "\\", "/")
}

function Get-RelativePath {
    param([string]$Base, [string]$Path)
    $baseUri = [Uri]((Resolve-Path -LiteralPath $Base).Path.TrimEnd("\") + "\")
    $pathUri = [Uri](Resolve-Path -LiteralPath $Path).Path
    return Convert-ToForwardSlashPath ([Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()))
}

function Remove-QuotedText {
    param([string]$Value)
    $withoutSingleQuoted = [regex]::Replace($Value, "'(?:''|[^'])*'", "''")
    return [regex]::Replace($withoutSingleQuoted, '"(?:`"|[^"])*"', '""')
}

if (-not (Test-Path -LiteralPath $Root)) { throw "scan_root_missing: $Root" }
$Root = (Resolve-Path -LiteralPath $Root).Path

$allowedRawWslPaths = @(
    "tools/typed-mcp/Invoke-EeMcpPrototype.ps1",
    "tools/typed-mcp/ee-mcp-server.mjs",
    "tools/typed-mcp/Test-EeMcpServer.ps1",
    "tools/typed-mcp/Test-TypedMcpSurfaces.ps1"
)
$guardImplementationPaths = @(
    "tools/andrey-user/Assert-NoRawWslCrossing.ps1",
    "tools/andrey-user/Test-RawWslCrossingGuard.ps1"
)

$rawWslCommandTokenPatterns = @(
    "(?im)(^|[;&|({\s])(?:&\s*)?wsl(?:\.exe)?(?:\s|$)"
)
$rawWslExplicitExecutablePatterns = @(
    "(?im)(^|[;&|({\s])&\s*[""']wsl(?:\.exe)?[""']",
    "(?i)\bFileName\s*=\s*[""']wsl(?:\.exe)?[""']",
    "(?i)\bStart-Process\s+-(?:FilePath|File)\s+[""']?wsl(?:\.exe)?\b",
    "(?i)\bspawnSync\(\s*[""']wsl(?:\.exe)?[""']"
)
$naradaTokenPattern = "(?i)\bnarada\b"
$distributedBashPattern = "(?is)\bwsl(?:\.exe)?\b.*?\s-d\s+\S+.*?--\s+bash\s+-lc"
$violations = [System.Collections.Generic.List[object]]::new()
$allowedHits = [System.Collections.Generic.List[object]]::new()

$files = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {
    $Extensions -contains $_.Extension
}

foreach ($file in $files) {
    $relative = Get-RelativePath -Base $Root -Path $file.FullName
    if ($guardImplementationPaths -contains $relative) { continue }

    $content = [System.IO.File]::ReadAllText($file.FullName)
    $commandContent = Remove-QuotedText $content
    $hasRawWsl = $false
    foreach ($pattern in $rawWslCommandTokenPatterns) {
        if ($commandContent -match $pattern) {
            $hasRawWsl = $true
            break
        }
    }
    foreach ($pattern in $rawWslExplicitExecutablePatterns) {
        if ($content -match $pattern) {
            $hasRawWsl = $true
            break
        }
    }
    if (-not $hasRawWsl) { continue }

    $isAllowed = $allowedRawWslPaths -contains $relative
    $isNaradaShape = ($content -match $distributedBashPattern) -and ($content -match $naradaTokenPattern)
    $kind = if ($isNaradaShape) { "raw_wsl_narada_crossing" } else { "raw_wsl_crossing" }

    $record = [pscustomobject][ordered]@{
        path = $relative
        kind = $kind
        allowed = $isAllowed
    }

    if ($isAllowed) {
        $allowedHits.Add($record) | Out-Null
    } else {
        $violations.Add($record) | Out-Null
    }
}

$result = [pscustomobject][ordered]@{
    schema = "narada.andrey.raw_wsl_crossing_guard.v0"
    status = if ($violations.Count -eq 0) { "passed" } else { "failed" }
    ok = $violations.Count -eq 0
    scan_root = $Root
    scanned_extensions = $Extensions
    policy = "raw wsl/wsl.exe is refused in Windows-side scripts outside retired EE-MCP prototype and guard-test loci"
    allowed_raw_wsl_paths = $allowedRawWslPaths
    allowed_hits = @($allowedHits)
    violations = @($violations)
    missing_capability_report = "delegated CLI embodiment not loadable / missing EE-MCP capability"
}

if ($PassThru) {
    ConvertTo-NaradaJson $result
}

if ($violations.Count -gt 0 -and -not $NoThrow) {
    $summary = (@($violations) | ForEach-Object { "$($_.path):$($_.kind)" }) -join "; "
    throw "raw_wsl_crossing_guard_failed: $summary"
}
