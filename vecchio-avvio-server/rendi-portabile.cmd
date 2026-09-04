@echo off
REM ============================================================
REM  Copia node.exe dentro questa cartella.
REM  Da quel momento Flow funziona anche su un computer dove
REM  Node.js non e' installato: basta copiare la cartella.
REM  Costo: circa 90 MB in piu'.
REM ============================================================
setlocal
cd /d "%~dp0"
title Flow - rendi portabile

if exist "node.exe" (
  echo node.exe e' gia' presente in questa cartella.
  echo La cartella e' gia' portabile.
  echo.
  pause
  exit /b 0
)

set "NODEPATH="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODEPATH set "NODEPATH=%%i"

if not defined NODEPATH (
  echo Node.js non e' installato su questo computer, quindi non c'e'
  echo nulla da copiare. Esegui questo script su una macchina dove
  echo Node.js e' presente, poi porta via l'intera cartella.
  echo.
  pause
  exit /b 1
)

echo Copio:  %NODEPATH%
echo     in: %~dp0node.exe
echo.
copy /y "%NODEPATH%" "%~dp0node.exe" >nul
if errorlevel 1 (
  echo Copia non riuscita.
  pause
  exit /b 1
)

"%~dp0node.exe" -v >nul 2>&1
if errorlevel 1 (
  echo ATTENZIONE: la copia non si avvia. La rimuovo.
  del "%~dp0node.exe"
  pause
  exit /b 1
)

for %%f in ("%~dp0node.exe") do set "SZ=%%~zf"
set /a MB=%SZ%/1048576
echo Fatto: node.exe copiato (%MB% MB).
echo.
echo Ora puoi zippare l'intera cartella e usarla su qualsiasi PC Windows.
echo Al primo avvio in una nuova posizione, Flow.vbs ripara da solo Flow.lnk.
echo.
pause
