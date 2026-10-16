param([ValidateSet('On','Off')][string]$Mode='On',[string]$LocationFile='.artifacts/native-ui-qa-location.json')
$ErrorActionPreference='Stop'
$qaMetadata=Get-Content -LiteralPath $LocationFile -Raw -Encoding UTF8 | ConvertFrom-Json
$qaRoot=[string](& node -e "process.stdout.write(require('node:fs').realpathSync.native(process.argv[1]))" $qaMetadata.root)
$qaInfo=Get-Content -LiteralPath (Join-Path $qaRoot 'ui-profile.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$qaProfile=[string](& node -e "process.stdout.write(require('node:fs').realpathSync.native(process.argv[1]))" $qaInfo.profile)
if((Split-Path -Parent $qaProfile) -ne $qaRoot -or (Split-Path -Leaf $qaProfile) -ne $qaInfo.marker -or $qaInfo.marker -notlike 'ui-profile-*'){throw 'Not an owned QA profile'}
if((Get-Content -LiteralPath (Join-Path $qaProfile 'qa-profile-marker') -Raw) -ne $qaInfo.marker){throw 'QA marker mismatch'}
$qaFile=Join-Path $qaProfile 'workspace/workspace.json'
$qaAttributes=[IO.File]::GetAttributes($qaFile)
if($Mode -eq 'On'){$qaAttributes=$qaAttributes -bor [IO.FileAttributes]::ReadOnly}else{$qaAttributes=$qaAttributes -band (-bnot [IO.FileAttributes]::ReadOnly)}
[IO.File]::SetAttributes($qaFile,$qaAttributes)
Write-Output "Owned QA workspace read-only: $(([IO.File]::GetAttributes($qaFile) -band [IO.FileAttributes]::ReadOnly) -ne 0)"
