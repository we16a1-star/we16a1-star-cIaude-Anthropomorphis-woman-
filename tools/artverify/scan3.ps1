param([string]$List)
$big5 = [System.Text.Encoding]::GetEncoding(950)
$gb = [System.Text.Encoding]::GetEncoding(936)
$total = 0
$files = Get-Content -LiteralPath $List -Encoding UTF8
foreach ($f in $files) {
  if ([string]::IsNullOrWhiteSpace($f)) { continue }
  if (-not (Test-Path -LiteralPath $f)) { Write-Output ("SKIP " + $f); continue }
  $t = Get-Content -LiteralPath $f -Raw -Encoding UTF8
  $bad = @{}
  foreach ($ch in $t.ToCharArray()) {
    $code = [int]$ch
    if ($code -lt 0x3400) { continue }
    $s = [string]$ch
    $b5 = $big5.GetBytes($s)
    if ($b5.Length -eq 1 -and $b5[0] -eq 63) {
      $g = $gb.GetBytes($s)
      if (-not ($g.Length -eq 1 -and $g[0] -eq 63)) { $bad[$ch] = 1 }
    }
  }
  $pii = @()
  if ($t -match '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}') { $pii += 'email' }
  if ($t -match '\b09\d{2}[- ]?\d{3}[- ]?\d{3}\b') { $pii += 'mobile' }
  if ($t -match '\b[A-Z][12]\d{8}\b') { $pii += 'twid' }
  $n = $bad.Count + $pii.Count
  $total += $n
  $tag = if ($n -eq 0) { 'OK  ' } else { 'HIT ' }
  $list = if ($bad.Count -gt 0) { ' [' + (($bad.Keys | Select-Object -First 20) -join '') + ']' } else { '' }
  Write-Output ("{0} {1,-34} simplified={2}{3} pii={4}" -f $tag, (Split-Path $f -Leaf), $bad.Count, $list, $pii.Count)
}
Write-Output ("TOTAL ISSUES=" + $total)
