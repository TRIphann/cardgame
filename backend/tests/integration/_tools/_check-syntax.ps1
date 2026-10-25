# Parse every PowerShell file under backend/tests and report syntax errors.
#
# Usage: pwsh -NoProfile -File _check-syntax.ps1
#
# Recurses into the card/, lobby/, flow/ and _tools/ subfolders so a broken
# suite anywhere in the tree is caught before it reaches CI.

$here = $PSScriptRoot
$root = Split-Path -Parent $here

$files = Get-ChildItem -Path $root -Recurse -Filter *.ps1 -File
$bad = 0
foreach ($f in $files) {
  $errors = $null
  $tokens = $null
  [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors -and $errors.Count -gt 0) {
    $bad++
    $rel = $f.FullName.Replace($root, "")
    Write-Output "SYNTAX ERROR: $rel"
    foreach ($e in $errors) { Write-Output ("   line {0}: {1}" -f $e.Extent.StartLineNumber, $e.Message) }
  }
}
if ($bad -eq 0) { Write-Output "ALL SYNTAX OK ($($files.Count) files)" } else { Write-Output "$bad file(s) with syntax errors"; exit 1 }
