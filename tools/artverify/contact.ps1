param([string]$Dir, [string]$Out, [string]$Filter = 'media_*.jpg')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem $Dir -File -Filter $Filter | Sort-Object Name
$seen = @{}
$uniq = New-Object System.Collections.Generic.List[object]
foreach ($f in $files) {
  $h = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
  if ($seen.ContainsKey($h)) { continue }
  $seen[$h] = $true
  $uniq.Add($f)
}
$cols = 4
$rows = [math]::Ceiling($uniq.Count / $cols)
$cw = 420
$ch = 236
$pad = 8
$bmp = New-Object System.Drawing.Bitmap ($cols * $cw), ($rows * $ch)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(24, 24, 24))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = New-Object System.Drawing.Font 'Segoe UI', 16, ([System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::White
for ($i = 0; $i -lt $uniq.Count; $i++) {
  $img = [System.Drawing.Bitmap]::FromFile($uniq[$i].FullName)
  $x = ($i % $cols) * $cw
  $y = [math]::Floor($i / $cols) * $ch
  $g.DrawImage($img, $x + $pad, $y + $pad, $cw - 2 * $pad, $ch - 2 * $pad - 26)
  $g.DrawString(("{0}" -f ($i + 1)), $font, $brush, ($x + $pad + 4), ($y + $ch - 30))
  $img.Dispose()
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
"wrote $Out  ($($uniq.Count) images)"
