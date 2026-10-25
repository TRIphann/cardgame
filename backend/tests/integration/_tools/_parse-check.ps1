param([string]$Path)
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
  foreach ($e in $errors) {
    Write-Output ("{0}:{1} {2}" -f $e.Extent.StartLineNumber, $e.Extent.StartColumnNumber, $e.Message)
  }
  exit 1
}
Write-Output "OK: $Path"
