# 把 art-final（或任何一組）四張場景素材安裝進遊戲，安裝前自動備份。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File install-art.ps1 `
#     -Source "$env:TEMP\opencode\artverify\art-final"
#
#   -Www 預設指向 v2.0-modifications\app\www（可用參數覆寫，例如指到 www-preview）
#   -DryRun 只印出會做什麼，不動檔案。
#
# 注意：art-final 這組的頂部留白條仍含暖色像素，安裝後 harness 的
# headPctOfImage 會在 night / morning 低估（見 HANDOFF-ANTIGRAVITY.md 第 4 節）。
# 要安裝這組之前，先確認 H14 已修好。
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Www = 'C:\Users\shiny\OneDrive\桌面\Claude 娘1113\v2.0-modifications\app\www',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

$names = @(
  'g43-story-default.jpg',
  'g43-story-soft-morning.jpg',
  'g43-cg-magic-light.jpg',
  'g43-story-reading.jpg'
)

$assets = Join-Path $Www 'assets'
if (-not (Test-Path $assets)) { throw "找不到 assets 目錄：$assets" }

foreach ($n in $names) {
  if (-not (Test-Path (Join-Path $Source $n))) { throw "來源缺少 $n（$Source）" }
}

$backup = Join-Path $assets 'backup-old'
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $backup | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

foreach ($n in $names) {
  $src = Join-Path $Source $n
  $dst = Join-Path $assets $n
  $old = Join-Path $backup ("{0}-{1}" -f $stamp, $n)
  $hNew = (Get-FileHash $src -Algorithm SHA256).Hash.Substring(0, 16)
  $hOld = if (Test-Path $dst) { (Get-FileHash $dst -Algorithm SHA256).Hash.Substring(0, 16) } else { 'MISSING' }

  if ($DryRun) {
    "DRY  {0,-30} {1} -> {2}" -f $n, $hOld, $hNew
    continue
  }

  if (Test-Path $dst) { Copy-Item $dst $old -Force }
  Copy-Item $src $dst -Force
  $hNow = (Get-FileHash $dst -Algorithm SHA256).Hash.Substring(0, 16)
  $ok = if ($hNow -eq $hNew) { 'OK' } else { 'HASH-MISMATCH' }
  "{0,-14} {1,-30} {2} -> {3}" -f $ok, $n, $hOld, $hNow
}

if ($DryRun) { "（DryRun，未變更任何檔案）"; return }

"備份：$backup\*-$stamp"
@'

下一步（照順序）：
  1) 開伺服器（若 4790 已被佔用就先確認它服務的是哪個 www）：
     & "$env:TEMP\opencode\node.exe" "$env:TEMP\opencode\artverify\serve.mjs" "<www>" 4790
  2) 矩陣：powershell -ExecutionPolicy Bypass -File "$env:TEMP\opencode\artverify\run-matrix.ps1"
     檢查 errors 全 0、headPctOfImage 全部 >= 12。
  3) 狀態：powershell -ExecutionPolicy Bypass -File "$env:TEMP\opencode\artverify\run-states.ps1"
  4) 實機截圖四張，肉眼確認頂部沒有接縫亮帶。
'@
