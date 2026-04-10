# exchange-fs-sync Windows Installation Script
# 
# This script installs exchange-fs-sync to the user's local application data
# and adds it to the PATH environment variable.
#
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\exchange-fs-sync"
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-Command {
    param([string]$Command)
    return [bool](Get-Command -Name $Command -ErrorAction SilentlyContinue)
}

# Check prerequisites
Write-Info "Checking prerequisites..."

if (-not (Test-Command "node")) {
    Write-Error "Node.js is not installed or not in PATH"
    Write-Host "Please install Node.js 18 or later from https://nodejs.org/"
    exit 1
}

$nodeVersion = (node --version).Substring(1)
$majorVersion = [int]$nodeVersion.Split('.')[0]

if ($majorVersion -lt 18) {
    Write-Error "Node.js version $nodeVersion is too old. Version 18 or later required."
    exit 1
}

Write-Success "Node.js v$nodeVersion found"

# Create installation directory
Write-Info "Creating installation directory: $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Download and extract
$tempDir = "$env:TEMP\exchange-fs-sync-install-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

try {
    if ($Version -eq "latest") {
        Write-Info "Downloading latest release..."
        # In a real scenario, this would download from GitHub releases
        # For now, we assume the package is built locally or from npm
        
        # Check if running from source directory
        if (Test-Path ".\packages\exchange-fs-sync") {
            Write-Info "Installing from local source..."
            
            # Build the package
            if (Test-Command "pnpm") {
                pnpm install
                pnpm build
            } elseif (Test-Command "npm") {
                npm install
                npm run build
            } else {
                Write-Error "Neither pnpm nor npm found"
                exit 1
            }
            
            # Copy built files
            Copy-Item -Path ".\packages\exchange-fs-sync\dist" -Destination $InstallDir -Recurse -Force
            Copy-Item -Path ".\packages\exchange-fs-sync\package.json" -Destination $InstallDir -Force
        } else {
            Write-Info "Installing from npm..."
            npm pack @narada/exchange-fs-sync --pack-destination $tempDir
            $tarball = Get-ChildItem $tempDir\*.tgz | Select-Object -First 1
            tar -xzf $tarball.FullName -C $tempDir
            Copy-Item -Path "$tempDir\package\dist" -Destination $InstallDir -Recurse -Force
            Copy-Item -Path "$tempDir\package\package.json" -Destination $InstallDir -Force
        }
    } else {
        Write-Info "Downloading version $Version..."
        npm pack @narada/exchange-fs-sync@$Version --pack-destination $tempDir
        $tarball = Get-ChildItem $tempDir\*.tgz | Select-Object -First 1
        tar -xzf $tarball.FullName -C $tempDir
        Copy-Item -Path "$tempDir\package\dist" -Destination $InstallDir -Recurse -Force
        Copy-Item -Path "$tempDir\package\package.json" -Destination $InstallDir -Force
    }

    Write-Success "Files installed to $InstallDir"

    # Create wrapper scripts
    $cliScript = @"
@echo off
node "$InstallDir\dist\cli\main.js" %*
"@
    
    $cliScript | Out-File -FilePath "$InstallDir\exchange-fs-sync.cmd" -Encoding ASCII
    
    # PowerShell wrapper
    $psWrapper = @"
#!/usr/bin/env pwsh
node "$InstallDir\dist\cli\main.js" `@args
"@
    
    $psWrapper | Out-File -FilePath "$InstallDir\exchange-fs-sync.ps1" -Encoding UTF8

    # Add to PATH
    Write-Info "Adding to PATH..."
    
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    if ($userPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable(
            "Path",
            "$userPath;$InstallDir",
            "User"
        )
        Write-Success "Added to PATH (User)"
    } else {
        Write-Info "Already in PATH"
    }

    # Create config directory
    $configDir = "$env:LOCALAPPDATA\exchange-fs-sync\config"
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null

    # Create sample config if it doesn't exist
    $configFile = "$configDir\config.json"
    if (-not (Test-Path $configFile)) {
        $sampleConfig = @"
{
  "mailbox_id": "your-mailbox-id",
  "root_dir": "C:\\Users\\$env:USERNAME\\ExchangeSync",
  "graph": {
    "tenant_id": "your-tenant-id",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "user_id": "user@example.com",
    "prefer_immutable_ids": true
  },
  "scope": {
    "included_container_refs": ["inbox", "sentitems"],
    "included_item_kinds": ["message"]
  }
}
"@
        $sampleConfig | Out-File -FilePath $configFile -Encoding UTF8
        Write-Info "Created sample config at $configFile"
    }

    Write-Success "Installation complete!"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Edit the configuration file: $configFile" -ForegroundColor White
    Write-Host "2. Restart your terminal to update PATH" -ForegroundColor White
    Write-Host "3. Run 'exchange-fs-sync --help' to get started" -ForegroundColor White
    Write-Host ""

} finally {
    # Cleanup
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force
    }
}
