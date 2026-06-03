@echo off
REM Double-click this to set up the phone for a PayZo demo.
REM It just runs start-phone.ps1 (PowerShell), bypassing the execution-policy prompt.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start-phone.ps1"
