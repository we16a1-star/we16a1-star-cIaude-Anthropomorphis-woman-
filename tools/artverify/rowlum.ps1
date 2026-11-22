param([string]$Dir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Get-ChildItem $Dir -File -Filter 'g43-*.jpg' | Sort-Object Name | ForEach-Object {
  $img = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $W = $img.Width
  $rows = @()
  foreach ($y in @(0, 10, 20, 30, 40, 50, 55, 56, 57, 58, 60, 70, 80, 90, 120, 200)) {
    if ($y -ge $img.Height) { continue }
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
