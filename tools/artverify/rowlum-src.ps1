param([string]$Dir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Get-ChildItem $Dir -File -Filter 'media_*.jpg' | Sort-Object Name | ForEach-Object {
  $img = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $W = $img.Width
  $rows = @()
  foreach ($y in @(0, 1, 2, 3, 5, 10, 20, 40, 60, 80)) {
    $sum = 0.0; $n = 0
    for ($x = 0; $x -lt $W; $x += 4) {
      $c = $img.GetPixel($x, $y)
      $sum += 0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B
      $n++
    }
    $rows += ("{0}:{1:N0}" -f $y, ($sum / $n))
  }
  "{0}  {1}" -f $_.Name, ($rows -join '  ')
  $img.Dispose()
}
