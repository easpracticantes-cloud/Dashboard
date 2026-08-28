' Arranca Sistema Contable IA como aplicacion web (servidor sin consola + navegador).
Option Explicit

Dim fso, shell, raiz, pythonw, scriptRun, tesseract, logFile, ts, logStream

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

raiz = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = raiz & "\venv\Scripts\pythonw.exe"
scriptRun = raiz & "\run_web.py"
tesseract = "C:\Program Files\Tesseract-OCR\tesseract.exe"
logFile = raiz & "\salidas\web_launch.log"

On Error Resume Next
If Not fso.FolderExists(raiz & "\salidas") Then
  fso.CreateFolder raiz & "\salidas"
End If
ts = Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & " " & _
     Right("0" & Hour(Now), 2) & ":" & Right("0" & Minute(Now), 2) & ":" & Right("0" & Second(Now), 2)
Set logStream = fso.OpenTextFile(logFile, 8, True)
logStream.WriteLine "[" & ts & "] Lanzador web ejecutado."
logStream.Close
On Error GoTo 0

If Not fso.FileExists(pythonw) Then
  MsgBox "No se encontro el entorno virtual:" & vbCrLf & pythonw & vbCrLf & vbCrLf & _
         "Ejecute en la carpeta del proyecto:" & vbCrLf & "python -m venv venv" & vbCrLf & _
         "venv\Scripts\pip install -r requirements.txt", vbCritical, "Sistema Contable IA"
  WScript.Quit 1
End If

If Not fso.FileExists(scriptRun) Then
  MsgBox "No se encontro el servidor web:" & vbCrLf & scriptRun, vbCritical, "Sistema Contable IA"
  WScript.Quit 1
End If

If Not fso.FileExists(raiz & "\frontend\dist\frontend\browser\index.html") Then
  MsgBox "Falta el build de Angular." & vbCrLf & vbCrLf & _
         "Ejecute en la carpeta del proyecto:" & vbCrLf & "cd frontend" & vbCrLf & _
         "npm install" & vbCrLf & "npm run build", vbExclamation, "Sistema Contable IA"
  WScript.Quit 1
End If

shell.CurrentDirectory = raiz

If fso.FileExists(tesseract) Then
  shell.Environment("PROCESS")("TESSERACT_CMD") = tesseract
End If

' El propio run_web.py abre el navegador cuando el servidor esta listo.
' 0 = sin consola; False = no esperar.
shell.Run """" & pythonw & """ """ & scriptRun & """", 0, False
