param(
  [string]$Src,
  [string]$OutDir
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$img = [System.Drawing.Bitmap]::FromFile($Src)
$w = [int]($img.Width / 2)
$h = [int]($img.Height / 2)
$names = @(
  'g43-story-default.jpg',
  'g43-story-soft-morning.jpg',
  'g43-cg-magic-light.jpg',
  'g43-story-reading.jpg'
)
$k = 0
for ($ry = 0; $ry -lt 2; $ry++) {
  for ($rx = 0; $rx -lt 2; $rx++) {
    $rect = New-Object System.Drawing.Rectangle ($rx * $w), ($ry * $h), $w, $h
    $crop = $img.Clone($rect, $img.PixelFormat)
    $path = Join-Path $OutDir $names[$k]
    $crop.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $crop.Dispose()
    $k++
  }
}
$img.Dispose()
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize
