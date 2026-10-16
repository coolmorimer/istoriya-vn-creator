function Get-IstoriyaFileSha256([string]$LiteralPath) {
  $stream=[IO.File]::OpenRead([IO.Path]::GetFullPath($LiteralPath))
  $algorithm=[Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}
