param([string]$Shots = "normal:front:idle:normal:", [int]$Wait = 30)
$chrome = "C:\Users\2023047\AppData\Local\Google\Chrome\Application\chrome.exe"
$out = "d:\福福学堂\artifacts\shots"
$port = 9300
foreach ($s in $Shots -split '\|') {
  $p = $s.Split(':')
  $name, $view, $action, $expr, $acc = $p
  $file = Join-Path $out "tt_$name.png"
  Remove-Item $file -ErrorAction SilentlyContinue
  $url = "http://localhost:8000/character-preview.html?model=rigged&view=$view&action=$action&expr=$expr&autoshot=tt_$name&r=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  if ($acc) { $url += "&acc=$acc" }
  $a = @('--headless=new','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding',
         "--remote-debugging-port=$port","--user-data-dir=C:\Users\2023047\AppData\Local\Temp\hlshot-$port",
         '--window-size=1312,876',$url)
  $proc = Start-Process -FilePath $chrome -ArgumentList $a -PassThru
  $ok = $false
  for ($i=0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 500
    if ((Test-Path $file) -and (Get-Item $file).Length -gt 30000) { $ok = $true; break }
  }
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 800
  "$name => $ok $(if(Test-Path $file){(Get-Item $file).Length})"
  $port++
}
