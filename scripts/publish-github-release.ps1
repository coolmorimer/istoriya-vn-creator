param(
  [ValidateSet('Status','Create','Upload','Verify','Publish')][string]$Mode='Status',
  [Parameter(Mandatory=$true)][string]$Directory
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'file-sha256.ps1')
Set-Location (Join-Path $PSScriptRoot '..')
$repo='coolmorimer/istoriya-vn-creator'
$directory=(Resolve-Path -LiteralPath $Directory).Path
$manifest=Get-Content -LiteralPath (Join-Path $directory 'release-manifest.json') -Raw | ConvertFrom-Json
$version=(Get-Content package.json -Raw | ConvertFrom-Json).version
if($manifest.version -ne $version -or $manifest.channel -ne 'beta'){throw 'Release identity mismatch'}
$tag="v$version"
$oldToken=$env:GH_TOKEN
try {
  # Read the already configured credential without printing or persisting it.
  if(!$env:GH_TOKEN){
    $credentialLines=@('protocol=https','host=github.com','') | git -c credential.interactive=false credential fill 2>$null
    if($LASTEXITCODE){throw 'Existing GitHub credential unavailable'}
    $password=@($credentialLines | Where-Object {$_.StartsWith('password=')})
    if($password.Count -ne 1){throw 'GitHub credential unavailable'}
    $env:GH_TOKEN=$password[0].Substring(9)
  }
  if($manifest.sourceCommit -ne (git rev-parse HEAD)){throw 'Local commit changed'}
  if((git status --porcelain)){throw 'Commit intended source before publication'}
  $remoteMain=gh api "repos/$repo/commits/main" --jq .sha
  if($LASTEXITCODE -or $remoteMain -ne $manifest.sourceCommit){throw 'Remote main commit mismatch'}
  $ref=gh api "repos/$repo/git/ref/tags/$tag" | ConvertFrom-Json
  if($LASTEXITCODE -or $ref.object.type -ne 'tag'){throw 'Annotated remote tag expected'}
  $tagCommit=gh api "repos/$repo/git/tags/$($ref.object.sha)" --jq .object.sha
  if($LASTEXITCODE -or $tagCommit -ne $manifest.sourceCommit){throw 'Tag commit mismatch'}
  function Read-Release {
    $body=gh api "repos/$repo/releases?per_page=100"
    if($LASTEXITCODE){throw 'Cannot inspect release; do not replay uncertain mutations'}
    $matches=@(($body | ConvertFrom-Json) | Where-Object tag_name -eq $tag)
    if($matches.Count -ne 1){throw 'Expected one matching release'}
    return $matches[0]
  }
  if($Mode -eq 'Create'){
    $existing=gh release list --repo $repo --limit 100 --json tagName
    if($LASTEXITCODE){throw 'Cannot inspect existing releases'}
    if(@(($existing | ConvertFrom-Json) | Where-Object tagName -eq $tag).Count){throw 'Release exists; inspect before retry'}
    $headline=if($version -eq '0.2.38'){'Rust переходы и сцены вне глав'}else{'Rust ядро документа'}
    gh release create $tag --repo $repo --verify-tag --draft --prerelease --latest=false --title "История $version бета — $headline" --notes-file "docs/releases/$version.md"
    if($LASTEXITCODE){throw 'Create outcome uncertain; inspect before retry'}
  }
  $release=Read-Release
  if(!$release.prerelease){throw 'Expected beta release'}
  $local=@(Get-ChildItem -LiteralPath $directory -File)
  if($Mode -eq 'Upload'){
    if(!$release.draft){throw 'Never modify published assets'}
    foreach($file in $local){
      $digest=Get-IstoriyaFileSha256 $file.FullName
      $asset=@($release.assets | Where-Object name -eq $file.Name)
      if($asset.Count){
        if($asset.Count -ne 1 -or $asset[0].size -ne $file.Length -or $asset[0].digest -ne "sha256:$digest"){throw "Existing asset differs: $($file.Name)"}
        continue
      }
      Write-Output "Uploading $($file.Name) ($($file.Length) bytes)"
      gh release upload $tag $file.FullName --repo $repo
      if($LASTEXITCODE){throw 'Upload outcome uncertain; inspect before retry'}
    }
    $release=Read-Release
  }
  if($Mode -in 'Verify','Publish'){
    if($release.assets.Count -ne $local.Count){throw 'Asset count mismatch'}
    foreach($file in $local){
      $digest=Get-IstoriyaFileSha256 $file.FullName
      $asset=@($release.assets | Where-Object name -eq $file.Name)
      if($asset.Count -ne 1 -or $asset[0].state -ne 'uploaded' -or $asset[0].size -ne $file.Length -or $asset[0].digest -ne "sha256:$digest"){throw "Asset mismatch: $($file.Name)"}
    }
    if($Mode -eq 'Publish'){
      if(!$release.draft){throw 'Already published; no mutation needed'}
      gh release edit $tag --repo $repo --draft=false --latest=false
      if($LASTEXITCODE){throw 'Publish outcome uncertain; inspect before retry'}
      $release=Read-Release
      if($release.draft){throw 'Release still draft'}
    }
  }
  @{tag=$tag;draft=$release.draft;prerelease=$release.prerelease;assets=$release.assets.Count;sourceCommit=$manifest.sourceCommit;url=$release.html_url;mode=$Mode;allGitHubAssetDigestsMatched=($Mode -in 'Verify','Publish')} | ConvertTo-Json
} finally {
  if($null -eq $oldToken){Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue}else{$env:GH_TOKEN=$oldToken}
}
