param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference='Stop'
$jobRequest=Get-Content -LiteralPath $Request -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'isolated-desktop.cs') -Raw -Encoding UTF8)
$result=if($jobRequest.closeSignal){[IsolatedGameDesktop]::RunWithCloseSignal($jobRequest.executable,[string[]]$jobRequest.arguments,$jobRequest.directory,$jobRequest.logPath,[int]$jobRequest.timeoutSeconds,$jobRequest.closeSignal)}else{[IsolatedGameDesktop]::Run($jobRequest.executable,[string[]]$jobRequest.arguments,$jobRequest.directory,$jobRequest.logPath,[int]$jobRequest.timeoutSeconds)}
$result | ConvertTo-Json | Set-Content -LiteralPath $jobRequest.resultPath -Encoding utf8
if($result.ExitCode -ne 0){exit 1}
