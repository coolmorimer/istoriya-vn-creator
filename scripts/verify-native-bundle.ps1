$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'file-sha256.ps1')
Set-Location (Join-Path $PSScriptRoot '..')
$expected=(Get-Content -LiteralPath package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
$binary=Join-Path (Get-Location) 'src-tauri/target/release/istoriya.exe'
if((Get-Item -LiteralPath $binary).VersionInfo.ProductVersion -ne $expected){throw 'EXE version does not match package.json'}
$runtimeCheck=Get-Content -LiteralPath '.artifacts/native-runtime-check.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if($runtimeCheck.version -ne $expected){throw 'Adjacent runtime has not been synchronized for this version'}
foreach($file in $runtimeCheck.files.PSObject.Properties){
  $shipped=Join-Path $runtimeCheck.destination "runtime/$($file.Name)"
  $staged=Join-Path $runtimeCheck.source "runtime/$($file.Name)"
  if((Get-IstoriyaFileSha256 $shipped) -ne $file.Value -or (Get-IstoriyaFileSha256 $staged) -ne $file.Value){throw "Stale compiler module: $($file.Name)"}
}
$resultFile=Join-Path (Get-Location) '.artifacts/native-bundle-check.json'
$verification=Start-Process -FilePath $binary -ArgumentList @('--verify-bundle',"`"$resultFile`"") -WindowStyle Hidden -PassThru
if(!$verification.WaitForExit(20000)){$verification.Kill();throw 'Standalone bundle verification timed out'}
if($verification.ExitCode -ne 0){throw 'EXE does not contain a standalone production UI'}
$bundle=Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
if(!$bundle.standalone -or !$bundle.embeddedUi -or !$bundle.runtimeReady -or $bundle.version -ne $expected){throw 'Standalone bundle verification failed'}
$bundle | Add-Member -NotePropertyName binarySha256 -NotePropertyValue (Get-IstoriyaFileSha256 $binary) -Force
$bundle | ConvertTo-Json | Set-Content -LiteralPath $resultFile -Encoding UTF8
Write-Output "Verified standalone EXE $expected"
