param([string]$Iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe")
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!(Test-Path -LiteralPath $Iscc)) { throw 'Install Inno Setup 6 or pass -Iscc with the compiler path.' }
if (!(Test-Path -LiteralPath '../renpy-8.5.3-sdk/renpy.py')) { throw 'Extract the official RenPy 8.5.3 SDK beside this repository.' }
node scripts/collect-notices.mjs
if ($LASTEXITCODE) { throw 'License collection failed' }
npm test
if ($LASTEXITCODE) { throw 'Tests failed' }
npm run build
if ($LASTEXITCODE) { throw 'Web build failed' }
npx electron-builder --dir --win --config.directories.output=release-installer
if ($LASTEXITCODE) { throw 'Desktop packaging failed' }
$package = (Resolve-Path 'release-installer/win-unpacked').Path
$forbidden = Get-ChildItem -LiteralPath $package -Recurse -File | Where-Object { $_.Extension -in '.keystore','.jks','.log' -or $_.Name -eq 'local.properties' -or $_.FullName -match '\\saves\\|\\renpy-sdk\\tmp\\|\\rapt\\project\\' }
if ($forbidden) { throw 'Packaging contains private/generated files; refusing installer build.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
& $Iscc '/Qp' "/DAppVersion=$version" "/DPackageDir=$package" 'installer/istoriya.iss'
if ($LASTEXITCODE) { throw 'Inno Setup failed' }
$setup = "release-installer/setup/Istoriya-Setup-$version-x64.exe"
$stream = [IO.File]::OpenRead((Join-Path (Get-Location) $setup))
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $sha.Dispose() }
"$hash  $([IO.Path]::GetFileName($setup))" | Set-Content -LiteralPath 'release-installer/setup/SHA256SUMS.txt' -Encoding ascii
Write-Output "Installer: $setup"
