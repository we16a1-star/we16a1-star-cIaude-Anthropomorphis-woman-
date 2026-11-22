param([string]$Dir)
Add-Type -AssemblyName System.Drawing
$files = @(
  "g43-story-default.jpg",
  "g43-story-soft-morning.jpg",
  "g43-cg-magic-light.jpg",
  "g43-story-reading.jpg"
)
foreach ($f in $files) {
  $p = Join-Path $Dir $f
  $img = [System.Drawing.Bitmap]::FromFile($p)
  $w = $img.Width
  $h = $img.Height
  $x0 = [int]($w * 0.48)
  $x1 = [int]($w * 0.78)
  $top = -1
  for ($y = 0; $y -lt [int]($h * 0.55); $y++) {
    $cnt = 0
    for ($x = $x0; $x -lt $x1; $x += 1) {
      $c = $img.GetPixel($x, $y)
      if ($c.R -gt 150 -and ($c.R - $c.B) -gt 60 -and ($c.R - $c.G) -gt 30 -and $c.G -gt 55) { $cnt++ }
    }
    if ($cnt -ge 25) { $top = $y; break }
  }
  # skin pixels for face centre
  $sx = 0; $n = 0; $sy = 0
  for ($y = [int]($h * 0.15); $y -lt [int]($h * 0.45); $y += 2) {
    for ($x = [int]($w * 0.35); $x -lt [int]($w * 0.85); $x += 2) {
      $c = $img.GetPixel($x, $y)
      if ($c.R -gt 205 -and $c.G -gt 155 -and $c.B -gt 125 -and ($c.R - $c.B) -lt 85 -and ($c.R - $c.G) -lt 55) { $sx += $x; $sy += $y; $n++ }
    }
  }
  $fx = if ($n -gt 0) { [math]::Round($sx / $n) } else { -1 }
  $fy = if ($n -gt 0) { [math]::Round($sy / $n) } else { -1 }
  $pct = if ($top -ge 0) { [math]::Round(100.0 * $top / $h, 1) } else { -1 }
  "{0,-28} {1}x{2}  headTop={3}px ({4}%)  need>={5}px  faceCentre=({6},{7}) = ({8}%,{9}%)" -f `
    $f, $w, $h, $top, $pct, [math]::Ceiling($h * 0.12), $fx, $fy, `
    [math]::Round(100.0 * $fx / $w), [math]::Round(100.0 * $fy / $h)
  $img.Dispose()
}
