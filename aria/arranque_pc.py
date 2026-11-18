# -*- coding: utf-8 -*-
"""ARIA - Que al prender la PC (y al buscar «ARIA» en Inicio) se abra la ARIA de verdad.

Problema que se vio como usuario (17-nov-2026): el arranque de Windows («ARIA OS» en Run) apuntaba a
dist\\ARIA OS.exe, una copia congelada de septiembre (la azul, v4.0). Así, al prender la PC salía la ARIA vieja.
Esto lo corrige solo, cada vez que ARIA abre:
  - el valor «ARIA OS» de HKCU\\...\\Run pasa a abrir ARIA_APP\\aria_main.py con el Python del proyecto (sin consola);
  - crea en el menú Inicio un acceso «ARIA» que abre lo mismo.
Y (Daniel lo pidió el 17-nov-2026: «si .exe viejo bórralo no más») manda a la Papelera dist\\ARIA OS.exe y los accesos
que apuntan a él. A la Papelera, no borrado definitivo: se puede recuperar. Si está abierto, lo intenta en el próximo arranque.
Solo toca lo de ARIA. Sin dependencias.
"""
import os
import subprocess
import sys

_DIR = os.path.dirname(os.path.abspath(__file__))           # ...\AURA\ARIA_APP
NOMBRE_RUN = "ARIA OS"


def pythonw(aura):
    """El pythonw del proyecto (.venv) o el de este proceso. PURO salvo os.path."""
    for c in (os.path.join(aura, ".venv", "Scripts", "pythonw.exe"),
              os.path.join(os.path.dirname(sys.executable), "pythonw.exe")):
        if os.path.isfile(c):
            return c
    return sys.executable


def argumentos(aura):
    """Lo que se le pasa a pythonw para abrir ARIA como ARIA_ABRIR.bat (carpeta AURA, log de arranque). PURO."""
    codigo = ("import os,sys,runpy;os.chdir(r'%s');os.makedirs(os.path.join('ARIA_APP','logs'),exist_ok=True);"
              "f=open(os.path.join('ARIA_APP','logs','arranque.log'),'w',encoding='utf-8',buffering=1);sys.stdout=sys.stderr=f;"
              "sys.argv=['aria_main.py'];runpy.run_path(os.path.join('ARIA_APP','aria_main.py'),run_name='__main__')") % aura
    return '-X utf8 -c "%s"' % codigo


def comando(aura, py):
    """Línea completa para el arranque de Windows. PURO."""
    return '"%s" %s' % (py, argumentos(aura))


def apunta_a_lo_viejo(valor):
    """¿El arranque abre el .exe congelado (o algo que no es aria_main)? PURO."""
    v = (valor or "").lower()
    return (not v) or v.endswith(".exe\"") or v.endswith(".exe") or "aria_main.py" not in v


def arreglar():
    """Idempotente. -> lista de lo que cambió (vacía si ya estaba bien o no es Windows)."""
    if not sys.platform.startswith("win"):
        return []
    hecho = []
    aura = os.path.dirname(_DIR)
    py = pythonw(aura)
    cmd = comando(aura, py)
    try:
        import winreg
        clave = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, clave, 0, winreg.KEY_READ | winreg.KEY_SET_VALUE) as k:
            try:
                actual = winreg.QueryValueEx(k, NOMBRE_RUN)[0]
            except OSError:
                actual = ""
            if apunta_a_lo_viejo(actual) and actual != cmd:
                winreg.SetValueEx(k, NOMBRE_RUN, 0, winreg.REG_SZ, cmd)
                hecho.append("arranque de Windows -> ARIA nueva")
    except Exception:
        pass
    try:
        menu = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs")
        lnk = os.path.join(menu, "ARIA.lnk")
        if os.environ.get("APPDATA") and os.path.isdir(menu) and not os.path.exists(lnk):
            icono = os.path.join(_DIR, "assets", "aria.ico")
            ps = ("$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);$s.TargetPath=$env:PY;$s.Arguments=$env:ARGS;"
                  "$s.WorkingDirectory=$env:AURA;$s.Description='ARIA';if(Test-Path $env:ICO){$s.IconLocation=$env:ICO};$s.Save()")
            env = dict(os.environ, LNK=lnk, PY=py, ARGS=argumentos(aura), AURA=aura, ICO=icono)
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], env=env, timeout=30,
                           capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if os.path.exists(lnk):
                hecho.append("acceso «ARIA» en el menú Inicio")
    except Exception:
        pass
    try:
        hecho += _papelera_exe_viejo(aura)
    except Exception:
        pass
    return hecho


def _papelera_exe_viejo(aura):
    exe = os.path.join(aura, "dist", "ARIA OS.exe")
    if not os.path.isfile(exe):
        return []
    ps = ("Add-Type -AssemblyName Microsoft.VisualBasic;$exe=$env:EXE;$n=0;"
          "$w=New-Object -ComObject WScript.Shell;"
          "foreach($d in @([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'),[Environment]::GetFolderPath('Desktop'))){"
          " if(Test-Path $d){Get-ChildItem -Path $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {"
          "  try{ if($w.CreateShortcut($_.FullName).TargetPath -eq $exe){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($_.FullName,'OnlyErrorDialogs','SendToRecycleBin');$n++} }catch{} } } };"
          "try{[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($exe,'OnlyErrorDialogs','SendToRecycleBin');Write-Output \"EXE $n\"}catch{Write-Output \"OCUPADO $n\"}")
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], env=dict(os.environ, EXE=exe), timeout=60,
                       capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    out = (r.stdout or b"").decode("utf-8", "ignore")
    hecho = []
    if "EXE" in out and not os.path.isfile(exe):
        hecho.append("ARIA OS.exe viejo a la Papelera")
    n = (out.split() or ["", "0"])[-1]
    if n.isdigit() and int(n):
        hecho.append("%s acceso(s) al .exe viejo a la Papelera" % n)
    return hecho
