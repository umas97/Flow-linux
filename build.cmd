@echo off
rem ============================================================
rem  Costruisce Flow.exe.
rem
rem  Usa il compilatore C# incluso in Windows: niente Visual
rem  Studio, niente SDK, niente da installare. Serve solo se hai
rem  modificato src\Flow.cs — per usare l'app basta Flow.exe.
rem ============================================================
setlocal
cd /d "%~dp0"

set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if not exist "%CSC%" (
  echo.
  echo   Non trovo il compilatore C# di Windows:
  echo     %CSC%
  echo.
  echo   Fa parte di .NET Framework 4.x, presente di serie su
  echo   Windows 8, 10 e 11. Su un sistema molto ridotto puo
  echo   mancare: si aggiunge da "Attiva o disattiva funzionalita
  echo   di Windows".
  echo.
  pause
  exit /b 1
)

if not exist "lib\Microsoft.Web.WebView2.Core.dll" (
  echo.
  echo   Mancano le librerie in lib\. Servono tre file:
  echo     Microsoft.Web.WebView2.Core.dll
  echo     Microsoft.Web.WebView2.WinForms.dll
  echo     WebView2Loader.dll
  echo.
  pause
  exit /b 1
)

echo Compilo Flow.exe...

"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 ^
  /out:"Flow.exe" ^
  /win32icon:"app\flow.ico" ^
  /win32manifest:"src\Flow.manifest" ^
  /reference:"System.dll" ^
  /reference:"System.Drawing.dll" ^
  /reference:"System.Windows.Forms.dll" ^
  /reference:"lib\Microsoft.Web.WebView2.Core.dll" ^
  /reference:"lib\Microsoft.Web.WebView2.WinForms.dll" ^
  "src\Flow.cs"

if errorlevel 1 (
  echo.
  echo   Compilazione fallita.
  echo.
  pause
  exit /b 1
)

if not exist "Flow.exe.config" (
  echo.
  echo   Attenzione: manca Flow.exe.config accanto a Flow.exe.
  echo   Senza quel file le librerie in lib\ non vengono trovate.
  echo.
)

echo.
echo   Fatto: Flow.exe
echo.
endlocal
