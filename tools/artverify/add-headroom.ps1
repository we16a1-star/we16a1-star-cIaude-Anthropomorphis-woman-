param(
  [string]$InPath,
  [string]$Out,
  [int]$HeadPx = 76
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function MeanL($bmp, [int]$y0, [int]$y1) {
  $sum = 0.0; $n = 0
  for ($y = $y0; $y -le $y1; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x += 4) {
      $c = $bmp.GetPixel($x, $y)
      $sum += 0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B
      $n++
    }
  }
  if ($n -eq 0) { return 0.0 }
  return $sum / $n
}

function Blur($bmp, [int]$div) {
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

# 0) 去掉 JPEG 在圖片最上緣偶爾留下的 1 px 亮線
$skip = 0
$l0 = MeanL $src 0 0
$l2 = MeanL $src 2 2
if ($l0 -gt ($l2 + 40)) { $skip = 2 }
$workH = $H - $skip
$work = $src.Clone([System.Drawing.Rectangle]::new(0, $skip, $W, $workH), $src.PixelFormat)

# 1) 找髮頂（右半 48%–78% 的橘紅髮色）
$top = -1
$bx0 = [int]($W * 0.48); $bx1 = [int]($W * 0.78)
for ($y = 0; $y -lt [int]($workH * 0.55); $y++) {
  $cnt = 0
  for ($x = $bx0; $x -lt $bx1; $x++) {
    $c = $work.GetPixel($x, $y)
    if ($c.R -gt 150 -and ($c.R - $c.B) -gt 60 -and ($c.R - $c.G) -gt 30 -and $c.G -gt 55) { $cnt++ }
  }
  if ($cnt -ge 25) { $top = $y; break }
}
if ($top -lt 0) { throw "cannot find hair top in $InPath" }

$pad = $HeadPx - $top
if ($pad -lt 0) { $pad = 0 }
if ($pad -gt [int]($H * 0.2)) { $pad = [int]($H * 0.2) }

# 2) 從底部裁掉 pad，維持 16:9；頭頂剛好落在 pad
$keepH = $H - $pad
$img = $work.Clone([System.Drawing.Rectangle]::new(0, 0, $W, $keepH), $work.PixelFormat)

# 3) 頂部留白：左上背景（x 0–46%）橫向拉滿 + 模糊
$bgW = [int]($W * 0.46)
$bg = $img.Clone([System.Drawing.Rectangle]::new(0, 0, $bgW, $pad), $img.PixelFormat)
$strip = New-Object System.Drawing.Bitmap $W, $pad
$g = [System.Drawing.Graphics]::FromImage($strip)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($bg, 0, 0, $W, $pad)
$g.Dispose()
Blur $strip 6
Blur $strip 3
$bg.Dispose()

# 4) 亮度對齊：讓留白條的平均亮度等於原圖最上緣，避免出現一條亮帶
$targetL = MeanL $img 0 ([math]::Min(19, $keepH - 1))
$stripL = MeanL $strip 0 ($pad - 1)
$ratio = 1.0
if ($stripL -gt 1 -and $targetL -gt 1) {
  $ratio = [math]::Max(0.55, [math]::Min(1.8, $targetL / $stripL))
  $cm = New-Object System.Drawing.Imaging.ColorMatrix
  $cm.Matrix00 = $ratio; $cm.Matrix11 = $ratio; $cm.Matrix22 = $ratio
  $ia = New-Object System.Drawing.Imaging.ImageAttributes
  $ia.SetColorMatrix($cm)
  $dst = [System.Drawing.Rectangle]::new(0, 0, $W, $pad)
  $tmp = New-Object System.Drawing.Bitmap $W, $pad
  $gt = [System.Drawing.Graphics]::FromImage($tmp)
  $gt.DrawImage($strip, $dst, 0, 0, $W, $pad, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $gt.Dispose(); $ia.Dispose()
  $strip.Dispose()
  $strip = $tmp
}

# 5) 接縫：把原圖第 0 列橫向拉滿，於留白條底部 20 px 內由實到虛疊上去
$seamH = [math]::Min(20, $pad)
$row0 = $img.Clone([System.Drawing.Rectangle]::new(0, 0, $W, 1), $img.PixelFormat)
$gs = [System.Drawing.Graphics]::FromImage($strip)
for ($i = 0; $i -lt $seamH; $i++) {
  $a = [int](255 * (1 - $i / $seamH))
  if ($a -le 0) { continue }
  $cm = New-Object System.Drawing.Imaging.ColorMatrix
  $cm.Matrix33 = $a / 255.0
  $ia = New-Object System.Drawing.Imaging.ImageAttributes
  $ia.SetColorMatrix($cm)
  $dst = [System.Drawing.Rectangle]::new(0, ($pad - 1 - $i), $W, 1)
  $gs.DrawImage($row0, $dst, 0, 0, $W, 1, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $ia.Dispose()
}
$gs.Dispose()
$row0.Dispose()

# 6) 頂部淡暗角（給 HUD 暗底接續），很輕
$c1 = [System.Drawing.Color]::FromArgb(90, 24, 18, 14)
$c2 = [System.Drawing.Color]::FromArgb(0, 24, 18, 14)
$lg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, $W, $pad), $c1, $c2, 90)
$g = [System.Drawing.Graphics]::FromImage($strip)
$g.FillRectangle($lg, 0, 0, $W, $pad)
$g.Dispose(); $lg.Dispose()

# 7) 組合
$canvas = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($strip, 0, 0, $W, $pad)
$g.DrawImage($img, 0, $pad, $W, $keepH)
$g.Dispose()

$ext = [System.IO.Path]::GetExtension($Out).ToLower()
if ($ext -eq '.png') { $canvas.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png) }
else { $canvas.Save($Out, [System.Drawing.Imaging.ImageFormat]::Jpeg) }
$canvas.Dispose(); $img.Dispose(); $work.Dispose(); $src.Dispose(); $strip.Dispose()
"$InPath -> $Out  skip=$skip headTop $top -> $HeadPx (pad $pad, ratio $([math]::Round($ratio,2)))"
