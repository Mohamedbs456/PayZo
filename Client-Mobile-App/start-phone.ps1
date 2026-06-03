# PayZo demo setup: opens the USB tunnels the phone app needs and launches it.
# Run this via start-phone.bat (double-click). Backend must be up (docker compose up -d).
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$pkg = "com.payzo.client"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   PayZo - phone demo setup" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $adb)) {
  Write-Host "adb not found at $adb" -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}

Write-Host "[1/4] Phone:" -ForegroundColor White
& $adb devices
if (-not (& $adb devices | Select-String "\tdevice$")) {
  Write-Host ""
  Write-Host "  No authorized phone found. Plug in the USB cable, unlock the phone," -ForegroundColor Yellow
  Write-Host "  tap 'Allow USB debugging' if asked, then run this again." -ForegroundColor Yellow
  Read-Host "Press Enter to close"; exit 1
}

Write-Host ""
Write-Host "[2/4] Opening USB tunnels (API + Keycloak)..." -ForegroundColor White
& $adb reverse tcp:9081 tcp:8081 | Out-Null
& $adb reverse tcp:8080 tcp:8080 | Out-Null
Write-Host "  done: 9081->8081 (API), 8080->8080 (Keycloak)"

Write-Host ""
Write-Host "[3/4] Backend reachable from the phone?" -ForegroundColor White
$code = & $adb shell 'curl -s -m 6 -o /dev/null -w "%{http_code}" http://localhost:9081/actuator/health'
if ("$code" -eq "200") {
  Write-Host "  backend health: 200 OK" -ForegroundColor Green
} else {
  Write-Host "  backend health: $code" -ForegroundColor Yellow
  Write-Host "  -> Backend not reachable. In the project root run:  docker compose up -d" -ForegroundColor Yellow
  Write-Host "     wait ~30s, then run this script again." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4/4] Launching PayZo..." -ForegroundColor White
if (-not (& $adb shell pm list packages $pkg)) {
  Write-Host "  PayZo is not installed on the phone. Install the APK first (see PRESENTATION.md)." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}
& $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null

Write-Host ""
Write-Host "Ready. The app is open on your phone - log in as usual (OTP arrives by email)." -ForegroundColor Green
Write-Host "Keep the phone plugged in for the whole demo." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close"
