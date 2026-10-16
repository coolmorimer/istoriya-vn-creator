param([switch]$SkipBuild,[string]$Iscc="${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",[string]$OutputDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'file-sha256.ps1')
Set-Location (Join-Path $PSScriptRoot '..')
if(!(Test-Path -LiteralPath $Iscc)){throw 'Inno Setup 6 is required'}
if(!$SkipBuild){npm test;if($LASTEXITCODE){throw 'JS tests failed'};npm run native:test;if($LASTEXITCODE){throw 'Rust tests failed'};npm run desktop;if($LASTEXITCODE){throw 'Native build failed'}}
$nativeRoot=Join-Path (Get-Location) '.artifacts/native-resources'
$forbidden=Get-ChildItem -LiteralPath $nativeRoot -Recurse -File | Where-Object {$_.Extension -in '.keystore','.jks','.log' -or $_.Name -eq 'local.properties' -or $_.FullName -match '\\saves\\|\\renpy-sdk\\tmp\\|\\rapt\\project\\'}
if($forbidden){throw 'Native package contains private or generated files; refusing installer build'}
node scripts/collect-notices.mjs
if($LASTEXITCODE){throw 'License collection failed'}
node scripts/collect-native-notices.mjs
if($LASTEXITCODE){throw 'Native license collection failed'}
$bootstrap=Join-Path (Get-Location) '.artifacts/MicrosoftEdgeWebview2Setup.exe'
if(!(Test-Path -LiteralPath $bootstrap)){Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap -UseBasicParsing}
# Load this shell's cmdlets, not another PowerShell version's types/format data
# inherited through PSModulePath when npm was launched from PowerShell 7.
if($PSVersionTable.PSEdition -eq 'Desktop') {
  Import-Module -Assembly ([System.Reflection.Assembly]::Load('Microsoft.PowerShell.Security, Version=3.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35')) -ErrorAction Stop
} else {
  Import-Module (Join-Path $PSHOME 'Microsoft.PowerShell.Security.dll') -ErrorAction Stop
}
$signature=Get-AuthenticodeSignature -LiteralPath $bootstrap
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'WebView2 installer signature verification failed'}
$version=(Get-Content package.json -Raw | ConvertFrom-Json).version
$bundleCheck=Join-Path (Get-Location) '.artifacts/native-bundle-check.json'
& (Join-Path $PSScriptRoot 'verify-native-bundle.ps1')
if($LASTEXITCODE){throw 'Adjacent native runtime verification failed'}
$bundle=Get-Content -LiteralPath $bundleCheck -Raw -Encoding UTF8 | ConvertFrom-Json
if(!$bundle.standalone -or !$bundle.embeddedUi -or !$bundle.runtimeReady -or $bundle.version -ne $version){throw 'Standalone bundle verification failed'}
$binaryHash=Get-IstoriyaFileSha256 'src-tauri/target/release/istoriya.exe'
if($bundle.binarySha256 -ne $binaryHash){throw 'EXE changed after standalone verification; run npm run desktop first'}
$setupDirectory=if($OutputDirectory){[IO.Path]::GetFullPath($OutputDirectory)}else{Join-Path (Get-Location) 'release-rust/setup'}
if(!(Test-Path -LiteralPath $setupDirectory)){New-Item -ItemType Directory -Path $setupDirectory | Out-Null}
$setupDirectory=(Resolve-Path -LiteralPath $setupDirectory).Path
& $Iscc '/Qp' "/O$setupDirectory" "/DAppVersion=$version" 'installer/istoriya-rust.iss'
if($LASTEXITCODE){throw 'Inno compilation failed'}
if((Get-IstoriyaFileSha256 'src-tauri/target/release/istoriya.exe') -ne $binaryHash){throw 'EXE changed during packaging; refusing to mark installer verified. Build again from a stable binary.'}
$setup=Join-Path $setupDirectory "Istoriya-Rust-Setup-$version-x64.exe"
$digest=Get-IstoriyaFileSha256 $setup
"$digest  $([IO.Path]::GetFileName($setup))" | Set-Content -LiteralPath (Join-Path $setupDirectory 'SHA256SUMS.txt') -Encoding ascii
@{version=$version;binarySha256=$binaryHash;installerSha256=$digest;installer=[IO.Path]::GetFileName($setup);createdAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $setupDirectory 'packaging-manifest.json') -Encoding UTF8
Write-Output "Installer: $setup"
