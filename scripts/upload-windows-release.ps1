param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = "Stop"

$patterns = @("*.exe", "*.blockmap", "latest*.yml")
$files = Get-ChildItem -Path dist -File | Where-Object {
  $name = $_.Name
  $patterns | Where-Object { $name -like $_ }
}

if (-not $files.Count) {
  Write-Error "No release files found in dist/"
}

foreach ($file in $files) {
  $attempt = 0
  $maxAttempts = 5
  while ($attempt -lt $maxAttempts) {
    $attempt++
    Write-Host "Uploading $($file.Name) (attempt $attempt/$maxAttempts)..."
    gh release upload $Tag $file.FullName --clobber
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Uploaded $($file.Name)"
      break
    }
    if ($attempt -ge $maxAttempts) {
      Write-Error "Failed to upload $($file.Name)"
    }
    Start-Sleep -Seconds 45
  }
}
