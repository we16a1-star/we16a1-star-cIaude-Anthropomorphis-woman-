# 逐一驗證狀態注入（1264×781），輸出 errors 與關鍵矩形。
# 用法：powershell -ExecutionPolicy Bypass -File run-states.ps1
# 以 cdp.mjs 驅動 Chrome：用真實時間等立繪 canvas／進場動畫落定。
$ErrorActionPreference = 'Stop'
$node = Join-Path $env:TEMP 'opencode\node.exe'
$cdp = Join-Path $env:TEMP 'opencode\artverify\cdp.mjs'
$dir = Join-Path $env:TEMP 'opencode\artverify'
$base = 'http://127.0.0.1:4790/__shot.html'
# custom-t = 自訂立繪（透明去背軌）；custom = 自訂立繪（矩形相片軌）
$states = @(
  @{ key = 'story'; q = 'state=story&scene=night' },
  @{ key = 'wait'; q = 'state=wait&scene=night' },
  @{ key = 'start'; q = 'state=start&scene=day' },
  @{ key = 'album'; q = 'state=album&scene=night' },
  @{ key = 'menu'; q = 'state=menu&scene=night' },
  @{ key = 'custom'; q = 'state=custom&scene=night' },
  @{ key = 'custom-t'; q = 'state=custom&custom=transparent&scene=night' }
)
$rows = New-Object System.Collections.Generic.List[object]

foreach ($st in $states) {
  $tag = "state-$($st.key)"
  $json = Join-Path $dir "$tag.json"
  $url = "${base}?$($st.q)&measure=1"
  if (Test-Path $json) { Remove-Item $json -Force }
  & $node $cdp $url --json $json --width 1264 --height 781 --timeout 25000 --settle 900 2>$null | Out-Null
  if (-not (Test-Path $json)) { $rows.Add([pscustomobject]@{ state = $st.key; note = 'NO-MEASURE' }); continue }
  $j = Get-Content -LiteralPath $json -Raw -Encoding UTF8 | ConvertFrom-Json
  $rows.Add([pscustomobject]@{
    state     = $st.key
    tone      = "$($j.artTone)/$($j.gradeTone)"
    choices   = if ($j.choices) { "$($j.choices.w)x$($j.choices.h) n=$($j.choicesCount)" } else { 'null' }
    dialogue  = if ($j.dialogue) { "$($j.dialogue.w)x$($j.dialogue.h)" } else { 'null' }
    status    = if ($j.status) { "bottom $($j.statusBottom)%" } else { 'null' }
    wait      = if ($j.wait) { "visible=$($j.wait.visible)" } else { 'null' }
    album     = if ($j.album) { "lightbox=$($j.album.lightbox) grid=$($j.album.grid.w)x$($j.album.grid.h)" } else { 'null' }
    menu      = if ($j.menu) { "open=$($j.menu.open) $($j.menu.rect.w)x$($j.menu.rect.h)" } else { 'null' }
    portrait  = if ($j.portrait) { "$($j.portrait.w)x$($j.portrait.h) right=$($j.portrait.right)" } else { 'null' }
    headTopPx = $j.head.topPx
    errors    = $j.errors.Count
  })
}
$rows | Format-Table -AutoSize | Out-String -Width 260
$rows | Export-Csv -LiteralPath (Join-Path $dir 'states.csv') -NoTypeInformation -Encoding UTF8
