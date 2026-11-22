# 執行 4 場景 × 4 尺寸的量測，輸出 CSV 與逐筆 JSON。
# 用法：powershell -ExecutionPolicy Bypass -File run-matrix.ps1
# 以 cdp.mjs 驅動 Chrome：用真實時間等立繪 canvas／進場動畫落定，量到玩家看到的畫面。
$ErrorActionPreference = 'Stop'
$node = Join-Path $env:TEMP 'opencode\node.exe'
$cdp = Join-Path $env:TEMP 'opencode\artverify\cdp.mjs'
$dir = Join-Path $env:TEMP 'opencode\artverify'
$base = 'http://127.0.0.1:4790/__shot.html'
$sizes = @('1264,781', '1024,768', '1920,1080', '800,600')
$scenes = @('day', 'night', 'morning', 'evening')
$rows = New-Object System.Collections.Generic.List[object]

foreach ($size in $sizes) {
  $wh = $size -split ','
  foreach ($scene in $scenes) {
    $tag = "$scene-$($size -replace ',', 'x')"
    $json = Join-Path $dir "mx-$tag.json"
    $url = "${base}?state=story&scene=$scene&measure=1"
    if (Test-Path $json) { Remove-Item $json -Force }
    & $node $cdp $url --json $json --width $wh[0] --height $wh[1] --timeout 25000 --settle 900 2>$null | Out-Null
    if (-not (Test-Path $json)) {
      $rows.Add([pscustomobject]@{ scene = $scene; size = $size; view = ''; artKey = 'NO-MEASURE' })
      continue
    }
    $j = Get-Content -LiteralPath $json -Raw -Encoding UTF8 | ConvertFrom-Json
    $rows.Add([pscustomobject]@{
      scene          = $scene
      size           = $size
      view           = ($j.view -join 'x')
      artKey         = $j.artKey
      tone           = "$($j.artTone)/$($j.gradeTone)"
      painted        = if ($j.painted) { "$($j.painted.w)x$($j.painted.h)" } else { 'null' }
      padTop         = if ($j.painted) { $j.painted.padTop } else { $null }
      headTopPx      = $j.head.topPx
      headPctOfImage = $j.head.clearancePctOfImage
      headPctOfView  = $j.head.topPctOfView
      headSource     = $j.head.source
      headConf       = $j.head.confidence
      dialogueRight  = $j.dialogueRight
      dialogueH      = if ($j.dialogue) { $j.dialogue.h } else { $null }
      choicesRight   = $j.choicesRight
      choicesH       = if ($j.choices) { $j.choices.h } else { $null }
      freeVisible    = if ($j.choicesSticky) { $j.choicesSticky.visible } else { $null }
      choicesCovered = $j.choicesCovered
      choicesMaxOverlap = $j.choicesMaxOverlap
      choicesScroll  = if ($j.choicesScroll) { "$($j.choicesScroll.clientHeight)/$($j.choicesScroll.scrollHeight)" } else { $null }
      statusBottom   = $j.statusBottom
      hudBandPct     = $j.hudBandPct
      accountLeft    = $j.accountLeft
      errors         = $j.errors.Count
    })
  }
}

$csv = Join-Path $dir 'matrix.csv'
$rows | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
$rows | Format-Table -AutoSize | Out-String -Width 260
"CSV: $csv"
