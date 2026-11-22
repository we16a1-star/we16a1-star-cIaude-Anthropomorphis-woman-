param([string]$Dir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
function IsHair($r, $g, $b) {
  $max = [math]::Max($r, [math]::Max($g, $b))
  $min = [math]::Min($r, [math]::Min($g, $b))
  if ($max -lt 90 -or ($max - $min) -lt 40) { return $false }
  if (-not ($r -gt $g -and $g -ge $b)) { return $false }
  if (($r - $g) -lt 22) { return $false }
  $l = ($max + $min) / 510.0
  $sat = ($max - $min) / (255 - [math]::Abs($max + $min - 255))
  return ($l -gt 0.22 -and $l -lt 0.80 -and $sat -gt 0.42)
}
Get-ChildItem $Dir -File -Filter 'g43-*.jpg' | Sort-Object Name | ForEach-Object {
  $img = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $w = $img.Width; $h = $img.Height
  $x0 = [int]($w * 0.52)
  $rows = @()
  for ($y = 0; $y -lt $h; $y++) {
    $c = 0
    for ($x = $x0; $x -lt $w; $x++) {
      $p = $img.GetPixel($x, $y)
      if (IsHair $p.R $p.G $p.B) { $c++ }
    }
    $rows += ($c / ($w - $x0))
  }
  # longest run of rows above threshold 0.012
  $best = 0; $cur = 0; $bestStart = -1; $start = 0
  for ($y = 0; $y -lt $h; $y++) {
    if ($rows[$y] -gt 0.012) {
      if ($cur -eq 0) { $start = $y }
      $cur++
      if ($cur -gt $best) { $best = $cur; $bestStart = $start }
    } else { $cur = 0 }
  }
  # first row that begins a run of >=8
  $first8 = -1
  $run = 0
  for ($y = 0; $y -lt $h; $y++) {
    if ($rows[$y] -gt 0.012) { $run++ } else { $run = 0 }
    if ($run -ge 8) { $first8 = $y - 7; break }
  }
  $firstAny = -1
  for ($y = 0; $y -lt $h; $y++) { if ($rows[$y] -gt 0.012) { $firstAny = $y; break } }
  "{0}  firstAny={1} firstRun8={2}  longestRun={3}@{4}" -f $_.Name, $firstAny, $first8, $best, $bestStart
  $img.Dispose()
}
