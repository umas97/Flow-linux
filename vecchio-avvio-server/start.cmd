@echo off
REM ============================================================
REM  Avvio con console visibile: utile per leggere i log.
REM  Per l'uso quotidiano usa "Flow.vbs" (nessuna finestra nera).
REM ============================================================
setlocal
title Flow
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js non e' stato trovato nel PATH.
  echo Installalo da https://nodejs.org, oppure apri app\index.html con doppio clic.
  pause
  exit /b 1
)

if exist "data\.port" del "data\.port" >nul 2>&1

echo Avvio del server locale...
start "Flow - server locale" cmd /k node server.js

set /a tries=0
:wait
if exist "data\.port" goto ready
set /a tries+=1
if %tries% gtr 30 (
  echo Il server non e' partito. Controlla la finestra "Flow - server locale".
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo Apertura della finestra dell'applicazione...
wscript.exe "%~dp0Flow.vbs"
endlocal
