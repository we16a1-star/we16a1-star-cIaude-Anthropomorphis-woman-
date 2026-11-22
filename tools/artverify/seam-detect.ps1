param([string]$Dir, [int]$ScaleW = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# 與 shot-inject.html 的 isHair() 相同的判定（右半部橘紅髮色）
function IsHair($r, $g, $b) {
  $max = [math]::Max($r, [math]::Max($g, $b)); $min = [math]::Min($r, [math]::Min($g, $b))
  if ($max -lt 90 -or ($max - $min) -lt 40) { return $false }
  if (-not ($r -gt $g -and $g -ge $b)) { return $false }
  if (($r - $g) -lt 22) { return $false }
  $l = ($max + $min) / 510.0
  $sat = ($max - $min) / (255 - [math]::Abs($max + $min - 255))
  return ($l -gt 0.22 -and $l -lt 0.80 -and $sat -gt 0.42)
}

Get-ChildItem $Dir -File -Filter '*.jpg' | Sort-Object Name | ForEach-Object {
  $src = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $img = $src
  if ($ScaleW -gt 0 -and $src.Width -ne $ScaleW) {
    $sc = $ScaleW / [double]$src.Width
    $w = [int][math]::Round($src.Width * $sc); $h = [int][math]::Round($src.Height * $sc)
    $img = New-Object System.Drawing.Bitmap -ArgumentList $w, $h
    $g2 = [System.Drawing.Graphics]::FromImage($img)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($src, 0, 0, $w, $h)
    $g2.Dispose()
  }
  $w = $img.Width; $h = $img.Height

  # 1) 逐列垂直差異：合成留白條是「橫向拉伸的模糊背景」，列與列幾乎相同
  $vd = New-Object 'double[]' $h
  $x0 = [int]($w * 0.10); $x1 = [int]($w * 0.95)
  for ($y = 1; $y -lt $h; $y++) {
    $sum = 0.0; $n = 0
    for ($x = $x0; $x -lt $x1; $x += 2) {
      $a = $img.GetPixel($x, $y); $b = $img.GetPixel($x, $y - 1)
      $sum += [math]::Abs($a.R - $b.R) + [math]::Abs($a.G - $b.G) + [math]::Abs($a.B - $b.B)
      $n++
    }
    $vd[$y] = $sum / ($n * 3.0)
  }
  $baseN = [math]::Min(20, $h - 1)
  $base = 0.0
  for ($y = 1; $y -le $baseN; $y++) { $base += $vd[$y] }
  $base /= $baseN

  # 2) 接縫＝第一個「≥6 且 ≥2.5 倍上方基準」的列
  $seam = 0
  for ($y = 8; $y -lt [math]::Min($h - 2, [int]($h * 0.45)); $y++) {
    if ($vd[$y] -ge 6 -and $vd[$y] -ge (2.5 * $base)) { $seam = $y; break }
  }

  # 3) 髮頂：從接縫下一列開始掃（避開留白條），右半部 ≥1.2% 且連續兩列
  $hx0 = [int]($w * 0.52)
  $need = [math]::Max(3, [int](($w - $hx0) * 0.012))
  $rowHit = New-Object 'bool[]' $h
  for ($y = 0; $y -lt $h; $y++) {
    $c = 0
    for ($x = $hx0; $x -lt $w; $x++) {
      $p = $img.GetPixel($x, $y); if (IsHair $p.R $p.G $p.B) { $c++ }
    }
    $rowHit[$y] = ($c -ge $need)
  }
  $raw = -1
  for ($y = 0; $y + 1 -lt $h; $y++) { if ($rowHit[$y] -and $rowHit[$y+1]) { $raw = $y; break } }
  $fixed = -1
  for ($y = $seam; $y + 1 -lt $h; $y++) { if ($rowHit[$y] -and $rowHit[$y+1]) { $fixed = $y; break } }

  "{0,-30} {1}x{2}  seam={3,4} (base {4:N2})  raw={5,4} ({6,5:N1}%)  seamSkipped={7,4} ({8,5:N1}%)" -f `
    $_.Name, $w, $h, $seam, $base, $raw, [math]::Round(100.0 * $raw / $h, 1),
    $fixed, [math]::Round(100.0 * $fixed / $h, 1)
  if ($img -ne $src) { $img.Dispose() }
  $src.Dispose()
}
