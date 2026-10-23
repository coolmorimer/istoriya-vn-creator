param([ValidateSet('dev','build','test','check')][string]$Mode='dev')
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$cargoDirectory=Join-Path $env:USERPROFILE '.cargo/bin'
if (Test-Path -LiteralPath (Join-Path $cargoDirectory 'cargo.exe')) { $env:PATH="$cargoDirectory;$env:PATH" }
$nativeReleaseMutex=$null
$nativeReleaseOwned=$false
try {
  # Cargo releases its own lock before our runtime synchronization. A concurrent
  # test build can then copy the same Tauri resources. Serialize the full chain.
  if($Mode -in 'build','test') {
    $nativeRootKey=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.ToLowerInvariant()
    $nativeHasher=[Security.Cryptography.SHA256]::Create()
    try {$nativeRootHash=([BitConverter]::ToString($nativeHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($nativeRootKey)))).Replace('-','')}
    finally {$nativeHasher.Dispose()}
    $nativeReleaseMutex=[Threading.Mutex]::new($false,('Local\Istoriya.NativeRelease.'+$nativeRootHash))
    try {$nativeReleaseOwned=$nativeReleaseMutex.WaitOne(0)}
    catch [Threading.AbandonedMutexException] {$nativeReleaseOwned=$true}
    if(!$nativeReleaseOwned){Write-Output 'Waiting for another Rust build/test command to finish...'}
    $nativeLockDeadline=[DateTime]::UtcNow.AddMinutes(15)
    while(!$nativeReleaseOwned){
      if([DateTime]::UtcNow -gt $nativeLockDeadline){throw 'Another Rust command did not finish within 15 minutes. Retry when it completes.'}
      try {$nativeReleaseOwned=$nativeReleaseMutex.WaitOne(1000)}
      catch [Threading.AbandonedMutexException] {$nativeReleaseOwned=$true}
    }
  }
  if ($Mode -in 'test','check') {
    if($Mode -eq 'test'){
      & cargo test --release --locked --manifest-path crates/istoriya-core/Cargo.toml --target-dir src-tauri/target
      if($LASTEXITCODE){throw 'Rust core tests failed'}
      node scripts/verify-document-parity.mjs --use-native-target
      if($LASTEXITCODE){throw 'Rust/JS document parity failed'}
      node scripts/verify-story-parity.mjs --use-native-target
      if($LASTEXITCODE){throw 'Rust/JS story navigation parity failed'}
      & cargo test --release --locked --features tauri/custom-protocol --manifest-path src-tauri/Cargo.toml
    }else{& cargo check --locked --manifest-path src-tauri/Cargo.toml}
  } else {
    if ($Mode -eq 'dev') { node scripts/prepare-native.mjs; if($LASTEXITCODE){throw 'Native resources failed'} }
    if($Mode -eq 'build') { & npx tauri build --no-bundle } else { & npx tauri dev }
  }
  if($LASTEXITCODE){throw "Rust $Mode failed ($LASTEXITCODE)"}
  if($Mode -eq 'build'){node scripts/sync-native-runtime.mjs;if($LASTEXITCODE){throw 'Native runtime synchronization failed'};& (Join-Path $PSScriptRoot 'verify-native-bundle.ps1')}
} finally {
  if($nativeReleaseOwned){$nativeReleaseMutex.ReleaseMutex()}
  if($nativeReleaseMutex){$nativeReleaseMutex.Dispose()}
}
