param([string]$LocationFile='.artifacts/native-ui-qa-location.json',[Parameter(Mandatory=$true)][string]$ExpectedText)
$ErrorActionPreference='Stop'
$qaMetadata=Get-Content -LiteralPath $LocationFile -Raw -Encoding UTF8 | ConvertFrom-Json
$qaRoot=[string](& node -e "process.stdout.write(require('node:fs').realpathSync.native(process.argv[1]))" $qaMetadata.root)
$qaInfo=Get-Content -LiteralPath (Join-Path $qaRoot 'ui-profile.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$qaProfile=[string](& node -e "process.stdout.write(require('node:fs').realpathSync.native(process.argv[1]))" $qaInfo.profile)
if((Split-Path -Parent $qaProfile) -ne $qaRoot -or (Split-Path -Leaf $qaProfile) -ne $qaInfo.marker -or $qaInfo.marker -notlike 'ui-profile-*'){throw 'Refusing a non-QA profile'}
if((Get-Content -LiteralPath (Join-Path $qaProfile 'qa-profile-marker') -Raw) -ne $qaInfo.marker){throw 'QA marker mismatch'}
$qaWorkspace=Join-Path $qaProfile 'workspace/workspace.json'
$qaValues=(Get-Content -LiteralPath $qaWorkspace -Raw -Encoding UTF8 | ConvertFrom-Json).values
$qaDraft=$qaValues.'istoriya-project-recovery-v1' | ConvertFrom-Json
$qaSaved=$qaValues.'istoriya-project-v2' | ConvertFrom-Json
if(!$qaDraft -or $qaDraft.project.id -ne 'media_repair_qa' -or $qaSaved.id -ne 'media_repair_qa'){throw 'Unexpected QA project'}
$qaAction=$qaDraft.project.scenes.PSObject.Properties.Value.actions | Where-Object {$_.text -eq $ExpectedText}
if(@($qaAction).Count -ne 1){throw 'Expected durable draft text was not found'}
if(@($qaSaved.scenes.PSObject.Properties.Value.actions | Where-Object {$_.text -eq $ExpectedText}).Count){throw 'The edit already reached the ordinary save; this would not test recovery'}
$qaCandidates=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'istoriya.exe' -and $_.ExecutablePath -ieq $qaMetadata.executable -and $_.CommandLine.Contains('--verify-ui') -and $_.CommandLine.Contains([string]$qaMetadata.root)})
if($qaCandidates.Count -ne 1){throw 'Exactly one live owned QA process is required'}
$qaRun=[string](& node -e "process.stdout.write(require('node:fs').realpathSync.native(process.argv[1]))" $qaMetadata.run)
if((Split-Path -Parent $qaRun) -ne $qaRoot){throw 'Run is outside QA root'}
Copy-Item -LiteralPath $qaWorkspace -Destination (Join-Path $qaRun 'crash-workspace-before.json') -ErrorAction Stop
$qaHash=(Get-FileHash -LiteralPath $qaWorkspace -Algorithm SHA256).Hash.ToLowerInvariant()
$qaCrashReceipt=@{processId=$qaCandidates[0].ProcessId;root=$qaRoot;profile=$qaProfile;run=$qaRun;draftSavedAt=$qaDraft.savedAt;actionId=$qaAction[0].id;expectedText=$ExpectedText;workspaceSha256=$qaHash;forcedTermination=$true;ownerDesktopInput=$false}
$qaCrashReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaRun 'crash-receipt.json') -Encoding UTF8
Stop-Process -Id $qaCandidates[0].ProcessId -Force -ErrorAction Stop
$qaCrashReceipt | ConvertTo-Json
