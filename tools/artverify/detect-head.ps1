param([string]$Dir, [int]$ScaleW = 0, [double]$Frac = 0.15, [string]$Filter = "g43-*.jpg")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function IsHair($r, $g, $b) {
  $max = [math]::Max($r, [math]::Max($g, $b)); $min = [math]::Min($r, [math]::Min($g, $b))
  if ($max -lt 90 -or ($max - $min) -lt 40) { return $false }
  if (-not ($r -gt $g -and $g -ge $b)) { return $false }
  if (($r - $g) -lt 22) { return $false }
  $l = ($max + $min) / 510.0
  $sat = ($max - $min) / (255 - [math]::Abs($max + $min - 255))
  return ($l -gt 0.22 -and $l -lt 0.80 -and $sat -gt 0.42)
}

Get-ChildItem $Dir -File -Filter $Filter | Sort-Object Name | ForEach-Object {
  $src = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $img = $src
  if ($ScaleW -gt 0) {
    $sc = $ScaleW / [double]$src.Width
    if ($sc -gt 1) { $sc = 1.0 }
    $w = [int][math]::Round($src.Width * $sc); $h = [int][math]::Round($src.Height * $sc)
    $img = New-Object System.Drawing.Bitmap -ArgumentList $w, $h
    $g2 = [System.Drawing.Graphics]::FromImage($img)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($src, 0, 0, $w, $h)
    $g2.Dispose()
  }
  $w = $img.Width; $h = $img.Height

  # 臉中心：x 35–85%、y 15–45% 的膚色質心（同 measure-file.ps1）
  $sx = 0; $sy = 0; $n = 0
  for ($y = [int]($h * 0.15); $y -lt [int]($h * 0.45); $y++) {
    for ($x = [int]($w * 0.35); $x -lt [int]($w * 0.85); $x++) {
      $p = $img.GetPixel($x, $y)
      if ($p.R -gt 205 -and $p.G -gt 155 -and $p.B -gt 125 -and ($p.R - $p.B) -lt 85 -and ($p.R - $p.G) -lt 55) {
        $sx += $x; $sy += $y; $n++
      }
    }
  }
  $fx = if ($n -gt 0) { [int]($sx / $n) } else { [int]($w * 0.62) }
  $fy = if ($n -gt 0) { [int]($sy / $n) } else { [int]($h * 0.35) }
  $bw = [int]($w * 0.08)
  $b0 = [math]::Max(0, $fx - $bw); $b1 = [math]::Min($w - 1, $fx + $bw)

  $rowOk = New-Object 'bool[]' $h
  for ($y = 0; $y -lt $h; $y++) {
    $c = 0; $m = 0
    for ($x = $b0; $x -le $b1; $x++) {
      $p = $img.GetPixel($x, $y)
      if (IsHair $p.R $p.G $p.B) { $c++ }
      $m++
    }
    $rowOk[$y] = (($c / [double]$m) -ge $Frac)
  }
  $top = -1
  for ($y = 0; $y + 1 -lt $h; $y++) {
    if ($rowOk[$y] -and $rowOk[$y+1]) { $top = $y; break }
  }
  "{0}  {1}x{2}  face=({3},{4})  band={5}-{6}  headTop={7} ({8}%)" -f `
    $_.Name, $w, $h, $fx, $fy, $b0, $b1, $top, [math]::Round(100.0 * $top / $h, 1)
  if ($img -ne $src) { $img.Dispose() }
  $src.Dispose()
}
