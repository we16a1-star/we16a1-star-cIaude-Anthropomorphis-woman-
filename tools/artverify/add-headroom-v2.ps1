param(
  [Parameter(Mandatory=$true)][string]$InPath,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$PadPx = 64,
  [int]$HairX0 = -1,
  [int]$HairX1 = -1,
  [int]$JpegQuality = 92
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function IsWarmHair($c) {
  $r = [int]$c.R; $g = [int]$c.G; $b = [int]$c.B
  return ($r -gt 115 -and ($r - $b) -gt 42 -and ($r - $g) -gt 22)
}

function BlurBmp($bmp, [int]$div) {
  $sw = [math]::Max(1, [int]($bmp.Width / $div))
  $sh = [math]::Max(1, [int]($bmp.Height / $div))
  $small = New-Object System.Drawing.Bitmap $sw, $sh
  $g1 = [System.Drawing.Graphics]::FromImage($small)
  $g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
  $g1.DrawImage($bmp, 0, 0, $sw, $sh)
  $g1.Dispose()
  $g2 = [System.Drawing.Graphics]::FromImage($bmp)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($small, 0, 0, $bmp.Width, $bmp.Height)
  $g2.Dispose()
  $small.Dispose()
}

$src = [System.Drawing.Bitmap]::FromFile($InPath)
$W = $src.Width
$H = $src.Height

# 去掉最上緣偶發 1px 亮線
$l0 = 0.0; $l2 = 0.0; $n = 0
for ($x = 0; $x -lt $W; $x += 4) {
  $c0 = $src.GetPixel($x, 0); $l0 += 0.2126*$c0.R + 0.7152*$c0.G + 0.0722*$c0.B
  $c2 = $src.GetPixel($x, 2); $l2 += 0.2126*$c2.R + 0.7152*$c2.G + 0.0722*$c2.B
  $n++
}
$skip = if (($l0/$n) -gt (($l2/$n) + 35)) { 2 } else { 0 }
$workH = $H - $skip
$work = $src.Clone([System.Drawing.Rectangle]::new(0, $skip, $W, $workH), $src.PixelFormat)

$pad = [math]::Max(0, [math]::Min([int]($H * 0.22), $PadPx))
$keepH = $H - $pad
$img = $work.Clone([System.Drawing.Rectangle]::new(0, 0, $W, $keepH), $work.PixelFormat)

# 1) 自動偵測頂部 28px 內人物髮區水平範圍（若未手動指定）
if ($HairX0 -lt 0 -or $HairX1 -lt 0) {
  $minX = $W; $maxX = -1
  $scanY = [math]::Min(28, $keepH - 1)
  $bx0 = [int]($W * 0.34); $bx1 = [int]($W * 0.84)
  for ($y = 0; $y -le $scanY; $y++) {
    for ($x = $bx0; $x -lt $bx1; $x++) {
      if (IsWarmHair ($img.GetPixel($x, $y))) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
      }
    }
  }
  if ($maxX -gt $minX) {
    $HairX0 = [math]::Max([int]($W * 0.30), $minX - 24)
    $HairX1 = [math]::Min([int]($W * 0.88), $maxX + 24)
  } else {
    $HairX0 = [int]($W * 0.42)
    $HairX1 = [int]($W * 0.76)
  }
}

# 2) 建立乾淨的「頂部背景條」（垂直翻轉原圖頂部帶，再把髮區以左右純背景插值覆蓋）
$sampleH = [math]::Min($pad, [math]::Min(96, $keepH))
$strip = New-Object System.Drawing.Bitmap $W, $pad
$gs = [System.Drawing.Graphics]::FromImage($strip)
$gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$topSlice = $img.Clone([System.Drawing.Rectangle]::new(0, 0, $W, $sampleH), $img.PixelFormat)
$topSlice.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipY)
$gs.DrawImage($topSlice, 0, 0, $W, $pad)
$gs.Dispose()
$topSlice.Dispose()

# 在髮區（HairX0..HairX1）內，用左右純背景柱橫向平滑插值覆蓋，徹底杜絕髮絲殘影
$sampleSpan = 28
$lStart = [math]::Max(0, $HairX0 - $sampleSpan)
$lEnd   = [math]::Max($lStart + 1, $HairX0)
$rStart = [math]::Min($W - 1, $HairX1)
$rEnd   = [math]::Min($W, $HairX1 + $sampleSpan)
$spanW  = [math]::Max(1, $HairX1 - $HairX0)

for ($y = 0; $y -lt $pad; $y++) {
  $lr = 0.0; $lg = 0.0; $lb = 0.0; $ln = 0
  for ($x = $lStart; $x -lt $lEnd; $x++) {
    $c = $strip.GetPixel($x, $y)
    $lr += $c.R; $lg += $c.G; $lb += $c.B; $ln++
  }
  $rr = 0.0; $rg = 0.0; $rb = 0.0; $rn = 0
  for ($x = $rStart; $x -lt $rEnd; $x++) {
    $c = $strip.GetPixel($x, $y)
    $rr += $c.R; $rg += $c.G; $rb += $c.B; $rn++
  }
  $lr /= [math]::Max(1, $ln); $lg /= [math]::Max(1, $ln); $lb /= [math]::Max(1, $ln)
  $rr /= [math]::Max(1, $rn); $rg /= [math]::Max(1, $rn); $rb /= [math]::Max(1, $rn)

  $fLeft  = [math]::Max(0, $HairX0 - 18)
  $fRight = [math]::Min($W - 1, $HairX1 + 18)
  for ($x = $fLeft; $x -le $fRight; $x++) {
    $t = [math]::Max(0.0, [math]::Min(1.0, ($x - $HairX0) / [double]$spanW))
    $s = $t * $t * (3.0 - 2.0 * $t)
    $ir = $lr * (1.0 - $s) + $rr * $s
    $ig = $lg * (1.0 - $s) + $rg * $s
    $ib = $lb * (1.0 - $s) + $rb * $s

    $blend = 1.0
    if ($x -lt $HairX0) { $blend = ($x - $fLeft) / [double][math]::Max(1, $HairX0 - $fLeft) }
    elseif ($x -gt $HairX1) { $blend = ($fRight - $x) / [double][math]::Max(1, $fRight - $HairX1) }

    $orig = $strip.GetPixel($x, $y)
    $nr = [int][math]::Max(0, [math]::Min(255, [math]::Round($orig.R * (1.0 - $blend) + $ir * $blend)))
    $ng = [int][math]::Max(0, [math]::Min(255, [math]::Round($orig.G * (1.0 - $blend) + $ig * $blend)))
    $nb = [int][math]::Max(0, [math]::Min(255, [math]::Round($orig.B * (1.0 - $blend) + $ib * $blend)))
    $strip.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $nr, $ng, $nb))
  }
}

# 柔焦建立自然景深
BlurBmp $strip 6
BlurBmp $strip 4

# 3) 計算每一欄 x 在原圖最上緣 0..3 列是否碰到頭髮（只有真的碰到髮絲的欄才跳過接縫）
$hairAtTop = New-Object bool[] $W
for ($x = $HairX0; $x -le $HairX1 -and $x -lt $W; $x++) {
  $hit = $false
  for ($y = 0; $y -le 3 -and $y -lt $keepH; $y++) {
    if (IsWarmHair ($img.GetPixel($x, $y))) { $hit = $true; break }
  }
  $hairAtTop[$x] = $hit
}
# 膨脹 ±8px 避免髮絲抗鋸齒邊緣被向上拖曳
$hairMask = New-Object bool[] $W
for ($x = 0; $x -lt $W; $x++) {
  if ($hairAtTop[$x]) {
    $xA = [math]::Max(0, $x - 8); $xB = [math]::Min($W - 1, $x + 8)
    for ($k = $xA; $k -le $xB; $k++) { $hairMask[$k] = $true }
  }
}

# 接縫平滑羽化（24px，純背景 100% 銜接原圖頂緣色，髮緣自動避開）
$seamH = [math]::Min(24, $pad)
for ($x = 0; $x -lt $W; $x++) {
  if ($hairMask[$x]) { continue }
  # 取 0..2 列平均顏色減少單列雜訊
  $c0 = $img.GetPixel($x, 0)
  $c1 = $img.GetPixel($x, [math]::Min(1, $keepH - 1))
  $ar = ($c0.R * 0.65 + $c1.R * 0.35)
  $ag = ($c0.G * 0.65 + $c1.G * 0.35)
  $ab = ($c0.B * 0.65 + $c1.B * 0.35)
  for ($i = 0; $i -lt $seamH; $i++) {
    $u = 1.0 - ($i / [double]$seamH)
    $a = $u * $u # 平滑二次衰減，無水平轉折痕
    $py = $pad - 1 - $i
    $bg = $strip.GetPixel($x, $py)
    $nr = [int][math]::Round($bg.R * (1.0 - $a) + $ar * $a)
    $ng = [int][math]::Round($bg.G * (1.0 - $a) + $ag * $a)
    $nb = [int][math]::Round($bg.B * (1.0 - $a) + $ab * $a)
    $strip.SetPixel($x, $py, [System.Drawing.Color]::FromArgb(255, $nr, $ng, $nb))
  }
}

# 4) 頂部淡自然暗角
$c1 = [System.Drawing.Color]::FromArgb(68, 18, 14, 12)
$c2 = [System.Drawing.Color]::FromArgb(0, 18, 14, 12)
$lgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, $W, $pad), $c1, $c2, 90)
$gV = [System.Drawing.Graphics]::FromImage($strip)
$gV.FillRectangle($lgBrush, 0, 0, $W, $pad)
$gV.Dispose(); $lgBrush.Dispose()

# 5) 合成 1024x576
$canvas = New-Object System.Drawing.Bitmap $W, $H
$gc = [System.Drawing.Graphics]::FromImage($canvas)
$gc.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gc.DrawImage($strip, 0, 0, $W, $pad)
$gc.DrawImage($img, 0, $pad, $W, $keepH)
$gc.Dispose()

# 6) 在接縫 y=pad 處對非髮區做極微小 3px 垂直抗鋸齒柔邊（徹底消滅 1px 折線）
if ($pad -ge 3 -and ($pad + 2) -lt $H) {
  for ($x = 0; $x -lt $W; $x++) {
    if ($hairMask[$x]) { continue }
    $pUp = $canvas.GetPixel($x, $pad - 2)
    $pM1 = $canvas.GetPixel($x, $pad - 1)
    $pM2 = $canvas.GetPixel($x, $pad)
    $pDn = $canvas.GetPixel($x, $pad + 1)
    $r1 = [int][math]::Round($pUp.R * 0.25 + $pM1.R * 0.50 + $pM2.R * 0.25)
    $g1 = [int][math]::Round($pUp.G * 0.25 + $pM1.G * 0.50 + $pM2.G * 0.25)
    $b1 = [int][math]::Round($pUp.B * 0.25 + $pM1.B * 0.50 + $pM2.B * 0.25)
    $r2 = [int][math]::Round($pM1.R * 0.25 + $pM2.R * 0.50 + $pDn.R * 0.25)
    $g2 = [int][math]::Round($pM1.G * 0.25 + $pM2.G * 0.50 + $pDn.G * 0.25)
    $b2 = [int][math]::Round($pM1.B * 0.25 + $pM2.B * 0.50 + $pDn.B * 0.25)
    $canvas.SetPixel($x, $pad - 1, [System.Drawing.Color]::FromArgb(255, $r1, $g1, $b1))
    $canvas.SetPixel($x, $pad,     [System.Drawing.Color]::FromArgb(255, $r2, $g2, $b2))
  }
}

$ext = [System.IO.Path]::GetExtension($Out).ToLower()
if ($ext -eq '.png') {
  $canvas.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
} else {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$JpegQuality)
  $canvas.Save($Out, $codec, $ep)
  $ep.Dispose()
}

$canvas.Dispose(); $img.Dispose(); $work.Dispose(); $src.Dispose(); $strip.Dispose()
"$InPath -> $Out  skip=$skip pad=$pad hairX=[$HairX0..$HairX1] q=$JpegQuality"