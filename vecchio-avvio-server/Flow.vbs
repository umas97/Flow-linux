' ===========================================================
'  Flow — avvio dell'applicazione.
'  1. ripara il collegamento se la cartella è stata spostata
'  2. accende il server locale (se non è già acceso)
'  3. apre una finestra dedicata, senza barra del browser
'  Tutti i percorsi sono relativi a questo file: la cartella
'  può essere copiata, zippata o messa su una chiavetta.
' ===========================================================
Option Explicit

Dim fso, sh, base, portFile, port, i, url, exe, args

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
portFile = fso.BuildPath(base, "data\.port")

FixShortcut

' --- il server è già in funzione? ---------------------------------
port = ""
If fso.FileExists(portFile) Then
  port = Trim(ReadAll(portFile))
  If Not IsAlive(port) Then port = ""
End If

' --- altrimenti lo avvio in background ----------------------------
If port = "" Then
  If Not HasNode() Then
    MsgBox "Node.js non è stato trovato." & vbCrLf & vbCrLf & _
           "Flow lo usa solo per salvare i dati su file, in locale." & vbCrLf & vbCrLf & _
           "Tre possibilità:" & vbCrLf & _
           "  • installa Node.js da nodejs.org;" & vbCrLf & _
           "  • copia node.exe accanto a questo file (vedi rendi-portabile.cmd);" & vbCrLf & _
           "  • apri app\index.html con doppio clic (dati nel browser, non su file).", _
           vbExclamation, "Flow"
    WScript.Quit 1
  End If

  On Error Resume Next
  If fso.FileExists(portFile) Then fso.DeleteFile portFile, True
  On Error GoTo 0

  ' finestra nascosta (0), non attendere la fine (False).
  ' Il server scrive da sé data\server.log: niente redirezioni da gestire.
  sh.Run """" & NodeExe() & """ """ & fso.BuildPath(base, "server.js") & """", 0, False

  For i = 1 To 60          ' fino a 15 secondi
    WScript.Sleep 250
    If fso.FileExists(portFile) Then
      port = Trim(ReadAll(portFile))
      If IsAlive(port) Then Exit For
      port = ""
    End If
  Next

  If port = "" Then
    MsgBox "Il server locale non è partito." & vbCrLf & vbCrLf & _
           "Dettagli in: data\server.log", vbCritical, "Flow"
    WScript.Quit 1
  End If
End If

' --- apro la finestra dell'applicazione ---------------------------
url = "http://127.0.0.1:" & port & "/"
exe = FindBrowser()

If exe = "" Then
  ' nessun browser Chromium: ripiego sul browser predefinito
  sh.Run url, 1, False
Else
  args = "--app=" & url & _
         " --window-size=1440,900" & _
         " --no-first-run --no-default-browser-check --disable-features=Translate"
  sh.Run """" & exe & """ " & args, 1, False
End If

' ===================== funzioni di supporto ======================

Function ReadAll(p)
  Dim f
  ReadAll = ""
  On Error Resume Next
  Set f = fso.OpenTextFile(p, 1)
  If Err.Number = 0 Then
    If Not f.AtEndOfStream Then ReadAll = f.ReadAll
    f.Close
  End If
  On Error GoTo 0
End Function

' node.exe accanto all'applicazione ha la precedenza: così la cartella
' funziona anche su un computer dove Node non è installato.
Function NodeExe()
  Dim local
  local = fso.BuildPath(base, "node.exe")
  If fso.FileExists(local) Then
    NodeExe = local
  Else
    NodeExe = "node.exe"
  End If
End Function

Function IsAlive(p)
  Dim x
  IsAlive = False
  If p = "" Then Exit Function
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts 700, 700, 700, 1500
  x.open "GET", "http://127.0.0.1:" & p & "/api/health", False
  x.send
  If Err.Number = 0 Then
    If x.Status = 200 Then IsAlive = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

Function HasNode()
  Dim ex
  HasNode = False
  If fso.FileExists(fso.BuildPath(base, "node.exe")) Then
    HasNode = True
    Exit Function
  End If
  On Error Resume Next
  ex = sh.Run("cmd /c node -v > nul 2>&1", 0, True)
  If Err.Number = 0 And ex = 0 Then HasNode = True
  On Error GoTo 0
End Function

Function FindBrowser()
  Dim c, p
  FindBrowser = ""
  c = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"), _
    sh.ExpandEnvironmentStrings("%LocalAppData%\Microsoft\Edge\Application\msedge.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
    sh.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe") )
  For Each p In c
    If fso.FileExists(p) Then
      FindBrowser = p
      Exit Function
    End If
  Next
End Function

' Un .lnk contiene percorsi assoluti: dopo uno spostamento punterebbe
' alla vecchia posizione. Lo riscrivo quando non corrisponde più.
Sub FixShortcut()
  Dim lnk, want
  want = fso.BuildPath(base, "Flow.vbs")
  On Error Resume Next
  Set lnk = sh.CreateShortcut(fso.BuildPath(base, "Flow.lnk"))
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Sub
  End If
  If InStr(1, lnk.Arguments, want, vbTextCompare) = 0 Then
    lnk.TargetPath       = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
    lnk.Arguments        = """" & want & """"
    lnk.WorkingDirectory = base
    lnk.IconLocation     = fso.BuildPath(base, "app\flow.ico") & ",0"
    lnk.Description      = "Flow - gestione attivita locale"
    lnk.WindowStyle      = 1
    lnk.Save
  End If
  Err.Clear
  On Error GoTo 0
End Sub
